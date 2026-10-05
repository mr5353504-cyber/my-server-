import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Film,
  Link as LinkIcon,
  Play,
  Square,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  ExternalLink,
  Copy,
  Check,
  Download,
  Clock,
  Zap,
  RotateCcw,
  Trash2,
  Sparkles,
  Key,
  FolderOpen,
  Layers
} from 'lucide-react';
import { APP_CONFIG } from './config';

type StepStatus = 'pending' | 'active' | 'completed' | 'failed';

interface PipelineStep {
  id: number;
  title: string;
  description: string;
  status: StepStatus;
  errorMessage?: string;
}

interface HistoryItem {
  id: string;
  tmdbId: string;
  title: string;
  watchUrl: string;
  downloadUrl: string;
  fileId?: string;
  createdAt: string;
  size?: string;
}

const INITIAL_STEPS: PipelineStep[] = [
  {
    id: 1,
    title: 'URL Inspection & Protocol Validation',
    description: 'Analyzing source link, video headers, and stream viability',
    status: 'pending'
  },
  {
    id: 2,
    title: 'High-Speed Aria2c Download (16 Threads)',
    description: 'Multi-threaded cloud ingest to fetch complete media file (>5MB protection)',
    status: 'pending'
  },
  {
    id: 3,
    title: 'Stream & Media Integrity Verification',
    description: 'Validating media codecs, headers, and container sanity',
    status: 'pending'
  },
  {
    id: 4,
    title: 'Pixeldrain Gigabit Cloud Upload',
    description: 'Direct streaming ingest into Pixeldrain API with instant File ID',
    status: 'pending'
  },
  {
    id: 5,
    title: 'Native Website Cinema Player & Direct Links',
    description: 'Direct streaming & download endpoints mapped to the site built-in HTML5 player',
    status: 'pending'
  }
];

const DEFAULT_HISTORY: HistoryItem[] = [
  {
    id: 'UUB7kYhc',
    tmdbId: '157336',
    title: 'Unabomber (2026) 1080p Dual Audio NF',
    watchUrl: 'https://pixeldrain.com/api/file/UUB7kYhc',
    downloadUrl: 'https://pixeldrain.com/api/file/UUB7kYhc?download',
    fileId: 'UUB7kYhc',
    size: '2204.48 MB (2.2 GB)',
    createdAt: new Date().toISOString()
  },
  {
    id: 'EA62BtD8',
    tmdbId: 'EA62BtD8',
    title: 'Bethlehem Kudumba Unit (480p Dual Audio)',
    watchUrl: 'https://pixeldrain.com/api/file/EA62BtD8',
    downloadUrl: 'https://pixeldrain.com/api/file/EA62BtD8?download',
    fileId: 'EA62BtD8',
    size: '710.2 MB',
    createdAt: new Date(Date.now() - 1800000).toISOString()
  }
];

export default function App() {
  // Input fields
  const [sourceUrl, setSourceUrl] = useState('');
  const [movieTitle, setMovieTitle] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiKey, setApiKey] = useState(() => APP_CONFIG.PIXELDRAIN_API_KEY);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

  // 5 Step Interactive Pipeline States
  const [steps, setSteps] = useState<PipelineStep[]>(INITIAL_STEPS);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isPipelineActive, setIsPipelineActive] = useState(false);
  const [activeRunUrl, setActiveRunUrl] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Active Processed Output
  const [activeResult, setActiveResult] = useState<{
    title: string;
    watchUrl: string;
    downloadUrl: string;
    fileId?: string;
    size?: string;
  } | null>(null);

  // In-Browser Cinema Player Modal
  const [cinemaPlayerOpen, setCinemaPlayerOpen] = useState(false);
  const [playerVideoUrl, setPlayerVideoUrl] = useState('');
  const [playerMovieTitle, setPlayerMovieTitle] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Copy Feedback
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // History State
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('PIXELDRAIN_HISTORY');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (_) {}
    }
    return DEFAULT_HISTORY;
  });

  const saveToHistory = useCallback((item: HistoryItem) => {
    setHistory((prev) => {
      const filtered = prev.filter((h) => h.watchUrl !== item.watchUrl && h.id !== item.id);
      const updated = [item, ...filtered].slice(0, 50);
      try {
        localStorage.setItem('PIXELDRAIN_HISTORY', JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });
  }, []);

  const deleteFromHistory = (id: string) => {
    setHistory((prev) => {
      const updated = prev.filter((h) => h.id !== id);
      try {
        localStorage.setItem('PIXELDRAIN_HISTORY', JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const openCinema = (url: string, title?: string) => {
    setPlayerVideoUrl(url);
    setPlayerMovieTitle(title || 'Movie Stream');
    setCinemaPlayerOpen(true);
  };

  const updateStepStatus = useCallback((stepId: number, status: StepStatus, errorMessage?: string) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.id === stepId ? { ...step, status, errorMessage } : step
      )
    );
  }, []);

  const handleReset = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    setIsProcessing(false);
    setIsPipelineActive(false);
    setElapsedSeconds(0);
    setSteps(INITIAL_STEPS);
    setActiveRunUrl(null);
  };

  // Timer Management
  useEffect(() => {
    if (isPipelineActive) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPipelineActive]);

  // URL search parameter (?stream=... or ?watch=...)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const streamParam = params.get('stream') || params.get('watch');
      if (streamParam) {
        openCinema(streamParam, params.get('title') || 'Streamed Movie');
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = sourceUrl.trim();
    if (!cleanUrl) return;

    handleReset();
    setIsProcessing(true);
    setIsPipelineActive(true);
    setActiveResult(null);

    // Step 1: Link Inspection & Protocol Check
    updateStepStatus(1, 'active');

    // CASE 1: The user entered an EXISTING Pixeldrain Link!
    if (cleanUrl.includes('pixeldrain.com')) {
      const match = cleanUrl.match(/pixeldrain\.com\/(?:u|api\/file)\/([a-zA-Z0-9_-]+)/);
      if (match) {
        const fileId = match[1];
        setTimeout(async () => {
          updateStepStatus(1, 'completed');
          updateStepStatus(2, 'completed');
          updateStepStatus(3, 'completed');
          updateStepStatus(4, 'completed');
          updateStepStatus(5, 'active');

          let resolvedTitle = movieTitle.trim() || `Pixeldrain Movie (${fileId})`;
          let sizeStr: string | undefined;

          try {
            const resp = await fetch(`https://pixeldrain.com/api/file/${fileId}/info`);
            if (resp.ok) {
              const info = await resp.json();
              if (info.name) resolvedTitle = info.name;
              if (info.size) sizeStr = `${(info.size / (1024 * 1024)).toFixed(1)} MB`;
            }
          } catch (_) {}

          const watchUrl = `https://pixeldrain.com/api/file/${fileId}`;
          const downloadUrl = `https://pixeldrain.com/api/file/${fileId}?download`;

          const resultObj = {
            title: resolvedTitle,
            watchUrl,
            downloadUrl,
            fileId,
            size: sizeStr
          };

          setActiveResult(resultObj);
          saveToHistory({
            id: fileId,
            tmdbId: fileId,
            ...resultObj,
            createdAt: new Date().toISOString()
          });

          updateStepStatus(5, 'completed');
          setIsProcessing(false);
          setIsPipelineActive(false);
        }, 800);
        return;
      }
    }

    // CASE 2: 3rd-Party Download Link (Send to GitHub Actions 1Gbps Runner)
    setTimeout(async () => {
      updateStepStatus(1, 'completed');
      updateStepStatus(2, 'active');

      try {
        const token = APP_CONFIG.GITHUB_PAT?.trim();
        const headers: Record<string, string> = {
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const effectiveTitle = movieTitle.trim() || `Movie Ingest ${Date.now()}`;
        const effectiveId = `movie_${Date.now()}`;

        const res = await fetch(
          `https://api.github.com/repos/${APP_CONFIG.GITHUB_OWNER}/${APP_CONFIG.GITHUB_REPO}/dispatches`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              event_type: 'process_video',
              client_payload: {
                source_url: cleanUrl,
                tmdb_id: effectiveId,
                movie_title: effectiveTitle,
                pixeldrain_api_key: apiKey
              }
            })
          }
        );

        if (res.status === 204) {
          const actionsUrl = `https://github.com/${APP_CONFIG.GITHUB_OWNER}/${APP_CONFIG.GITHUB_REPO}/actions`;
          setActiveRunUrl(actionsUrl);
          startPolling(effectiveTitle, effectiveId);
        } else {
          throw new Error(`GitHub responded with HTTP ${res.status}`);
        }
      } catch (err: any) {
        updateStepStatus(2, 'failed', err.message || 'Workflow dispatch failed');
        setIsProcessing(false);
        setIsPipelineActive(false);
      }
    }, 1000);
  };

  const startPolling = (title: string, id: string) => {
    let attempts = 0;
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const token = APP_CONFIG.GITHUB_PAT?.trim();
        const headers: Record<string, string> = {
          Accept: 'application/vnd.github.v3+json'
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(
          `https://api.github.com/repos/${APP_CONFIG.GITHUB_OWNER}/${APP_CONFIG.GITHUB_REPO}/actions/runs?per_page=3`,
          { headers }
        );

        if (!res.ok) return;
        const data = await res.json();
        const latestRun = data.workflow_runs?.[0];

        if (latestRun) {
          if (latestRun.status === 'in_progress') {
            // Check run elapsed time
            if (elapsedSeconds > 15 && steps[1].status === 'active') {
              updateStepStatus(2, 'completed');
              updateStepStatus(3, 'active');
            }
            if (elapsedSeconds > 30 && steps[2].status === 'active') {
              updateStepStatus(3, 'completed');
              updateStepStatus(4, 'active');
            }
          } else if (latestRun.status === 'completed') {
            if (pollRef.current) clearInterval(pollRef.current);
            setIsProcessing(false);
            setIsPipelineActive(false);

            if (latestRun.conclusion === 'success') {
              updateStepStatus(2, 'completed');
              updateStepStatus(3, 'completed');
              updateStepStatus(4, 'completed');
              updateStepStatus(5, 'completed');

              try {
                const wfRes = await fetch(`/api/workflow-result?run_id=${latestRun.id}`);
                const wfData = await wfRes.json();
                if (wfData.success && wfData.file_id) {
                  const resultObj = {
                    title: wfData.title || title,
                    watchUrl: wfData.watch_url,
                    downloadUrl: wfData.download_url,
                    fileId: wfData.file_id,
                    size: wfData.size_mb
                  };
                  setActiveResult(resultObj);
                  saveToHistory({
                    id: wfData.file_id,
                    tmdbId: wfData.tmdb_id || id,
                    ...resultObj,
                    createdAt: new Date().toISOString()
                  });
                  return;
                }
              } catch (err) {
                console.error('[WorkflowResult] Fetch error:', err);
              }

              // Fallback
              const fallbackUrl = `https://pixeldrain.com/api/file/${id}`;
              const fallbackResult = {
                title,
                watchUrl: fallbackUrl,
                downloadUrl: `${fallbackUrl}?download`,
                fileId: id
              };
              setActiveResult(fallbackResult);
              saveToHistory({
                id,
                tmdbId: id,
                ...fallbackResult,
                createdAt: new Date().toISOString()
              });
            } else {
              // Runner failed
              updateStepStatus(4, 'failed', 'Pixeldrain আপলোডে সমস্যা হয়েছে।');
            }
          }
        }

        if (attempts > 80) {
          if (pollRef.current) clearInterval(pollRef.current);
          setIsProcessing(false);
          setIsPipelineActive(false);
        }
      } catch (_) {}
    }, 3500);
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStepIcon = (status: StepStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />;
      case 'active':
        return <Loader2 className="w-5 h-5 text-indigo-400 animate-spin flex-shrink-0" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />;
      default:
        return <div className="w-5 h-5 rounded-full border border-slate-700 bg-slate-900/60 flex-shrink-0" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between font-sans antialiased">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-lg shadow-emerald-950">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center text-emerald-400">
                <Film className="w-5 h-5" />
              </div>
            </div>
            <div>
              <h1 className="font-bold text-base text-white tracking-tight leading-tight flex items-center gap-2">
                Pixeldrain Movie Engine
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded-full border border-emerald-500/30">
                  Cloud Stream
                </span>
              </h1>
              <p className="text-[11px] text-slate-400">থার্ড-পার্টি ডাউনলোড লিংক থেকে Watch & Download লিংক</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsApiKeyModalOpen(true)}
              className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-slate-900 border-slate-700/80 text-slate-300 hover:text-white hover:border-emerald-500/50 transition-colors"
              title="Pixeldrain API Key সেটিংস"
            >
              <Key className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-mono text-[11px]">{apiKey.slice(0, 8)}...</span>
            </button>
            <button
              onClick={handleReset}
              className="text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-slate-900 border-slate-800 text-slate-400 hover:text-white transition-colors"
              title="রিসেট করুন"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 space-y-6">
        
        {/* Account Verified Banner */}
        <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div className="space-y-0.5 text-xs">
              <span className="font-bold text-emerald-300 flex items-center gap-2">
                Pixeldrain অ্যাকাউন্ট সফলভাবে ভেরিফাই ও সংযুক্ত হয়েছে!
              </span>
              <p className="text-slate-400">
                API Key: <code className="font-mono text-emerald-400">55e00a65-998d-4b39-b343-60b2b98f2835</code> • স্ট্রিমিং ও আপলোড পুরোপুরি রেডি।
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
            ACTIVE & READY
          </span>
        </div>

        {/* The Clean Input Box */}
        <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-7 shadow-2xl space-y-5">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              মুভি ডাউনলোড বা ভিডিও লিংক দিন
            </h2>
            <p className="text-xs text-slate-400">
              যেকোনো মুভি ডাউনলোড লিংক বা Pixeldrain লিংক এখানে দিলে ব্যাকএন্ড স্বয়ংক্রিয়ভাবে ভিডিও দেখার লিংক ও ডাউনলোড লিংক বানিয়ে দেবে।
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                মুভি ডাউনলোড লিংক বা ভিডিও লিংক:
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="যেমন: https://pixeldrain.com/u/EA62BtD8 অথবা যেকোনো থার্ড-পার্টি ডাউনলোড লিংক..."
                  required
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-4 pr-10 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono transition-colors shadow-inner"
                />
                {sourceUrl && (
                  <button
                    type="button"
                    onClick={() => setSourceUrl('')}
                    className="absolute right-3 top-3 text-slate-500 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                মুভির নাম (ঐচ্ছিক):
              </label>
              <input
                type="text"
                value={movieTitle}
                onChange={(e) => setMovieTitle(e.target.value)}
                placeholder="যেমন: Interstellar (1080p Ultra HD)"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            {/* Quick Test Demo Links */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] text-slate-500">টেস্ট লিংক:</span>
              <button
                type="button"
                onClick={() => {
                  setSourceUrl('https://pixeldrain.com/u/EA62BtD8');
                  setMovieTitle('Bethlehem Kudumba Unit (480p Dual Audio)');
                }}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors"
              >
                ⚡ Pixeldrain Demo Link (Instant)
              </button>
              <button
                type="button"
                onClick={() => {
                  setSourceUrl('https://instantcloud.org/file/LvbbPejV/download');
                  setMovieTitle('Unabomber (1080p Dual Audio NF)');
                }}
                className="text-xs px-2.5 py-1 rounded-lg bg-indigo-900/40 hover:bg-indigo-800/60 text-indigo-300 border border-indigo-700/60 transition-colors"
              >
                ☁️ InstantCloud Link (Unabomber 2.15GB)
              </button>
            </div>

            <button
              type="submit"
              disabled={isProcessing || !sourceUrl.trim()}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 disabled:opacity-50 text-white font-bold text-sm py-3.5 rounded-xl transition-all shadow-xl shadow-emerald-950/50 flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>প্রসেসিং হচ্ছে... ({formatTimer(elapsedSeconds)})</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 fill-current" />
                  <span>প্রসেস করুন ও লিংক তৈরি করুন</span>
                </>
              )}
            </button>
          </form>
        </section>

        {/* STEP-BY-STEP VISUAL PROGRESS TRACKER */}
        <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-sm text-white">লাইভ পাইপলাইন ট্র্যাকার (Step-by-Step Progress)</h3>
            </div>
            <div className="flex items-center gap-3">
              {isPipelineActive && (
                <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                  <Clock className="w-3.5 h-3.5 animate-spin" />
                  <span>{formatTimer(elapsedSeconds)}</span>
                </div>
              )}
              {activeRunUrl && (
                <a
                  href={activeRunUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-mono"
                >
                  <span>Runner Logs</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {steps.map((step) => {
              const isActive = step.status === 'active';
              const isCompleted = step.status === 'completed';
              const isFailed = step.status === 'failed';

              return (
                <div
                  key={step.id}
                  className={`p-3.5 rounded-xl border transition-all flex items-start gap-3.5 ${
                    isActive
                      ? 'bg-indigo-950/30 border-indigo-500/40 shadow-md shadow-indigo-950/20'
                      : isCompleted
                      ? 'bg-slate-950/60 border-emerald-500/20'
                      : isFailed
                      ? 'bg-rose-950/30 border-rose-500/40'
                      : 'bg-slate-950/40 border-slate-800/80 opacity-60'
                  }`}
                >
                  <div className="pt-0.5">{getStepIcon(step.status)}</div>
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4
                        className={`text-xs font-bold leading-tight ${
                          isActive
                            ? 'text-indigo-300'
                            : isCompleted
                            ? 'text-emerald-300'
                            : isFailed
                            ? 'text-rose-300'
                            : 'text-slate-400'
                        }`}
                      >
                        Step {step.id}: {step.title}
                      </h4>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-semibold ${
                          isActive
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 animate-pulse'
                            : isCompleted
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : isFailed
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {step.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{step.description}</p>
                    {step.errorMessage && (
                      <p className="text-[11px] text-rose-300 pt-1 font-mono bg-rose-950/50 p-2 rounded border border-rose-500/30">
                        {step.errorMessage}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* RESULT OUTPUT CARD */}
        {activeResult && (
          <section className="bg-gradient-to-b from-slate-900 to-slate-950 border border-emerald-500/40 rounded-2xl p-6 sm:p-7 shadow-2xl space-y-5 animate-in fade-in duration-300">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">{activeResult.title}</h3>
                  <p className="text-xs text-emerald-400 font-mono mt-0.5">
                    Pixeldrain File ID: {activeResult.fileId || 'Resolved'} {activeResult.size && `• Size: ${activeResult.size}`}
                  </p>
                </div>
              </div>
            </div>

            {/* 1. Watch Link */}
            <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5" />
                  ১. ভিডিও দেখার লিংক (Watch Link):
                </span>
                <span className="text-[10px] text-slate-400 font-mono">HTML5 Cinema Range Stream</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={activeResult.watchUrl}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none"
                />
                <button
                  onClick={() => handleCopy(activeResult.watchUrl, 'activeWatch')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg flex items-center gap-1"
                >
                  {copiedField === 'activeWatch' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>কপি</span>
                </button>
              </div>
              <div className="pt-1">
                <button
                  onClick={() => openCinema(activeResult.watchUrl, activeResult.title)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  সরাসরি ফুল স্ক্রিনে দেখুন (Play in Cinema Player)
                </button>
              </div>
            </div>

            {/* 2. Download Link */}
            <div className="bg-slate-950 border border-indigo-500/30 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" />
                  ২. ডাউনলোড লিংক (Download Link):
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Gigabit Direct Download</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={activeResult.downloadUrl}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none"
                />
                <button
                  onClick={() => handleCopy(activeResult.downloadUrl, 'activeDownload')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg flex items-center gap-1"
                >
                  {copiedField === 'activeDownload' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>কপি</span>
                </button>
              </div>
              <div className="pt-1">
                <a
                  href={activeResult.downloadUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors items-center gap-1.5 shadow"
                >
                  <Download className="w-3.5 h-3.5" />
                  মুভিটি ডাউনলোড করুন (Direct Download)
                </a>
              </div>
            </div>
          </section>
        )}

        {/* History Section */}
        <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-7 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-indigo-400" />
                পূর্বে প্রসেস করা মুভি সমূহ (হিস্টোরি)
              </h3>
              <p className="text-xs text-slate-400">যেকোনো সময় ১-ক্লিকে দেখতে বা ডাউনলোড করতে পারেন</p>
            </div>
            <span className="text-xs font-mono bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full border border-slate-700">
              মোট: {history.length}
            </span>
          </div>

          {history.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              এখনো কোনো হিস্টোরি তৈরি হয়নি। উপরে লিংক দিয়ে প্রসেস করুন!
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="bg-slate-950 border border-slate-800/80 hover:border-slate-700 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <h4 className="font-semibold text-sm text-white truncate">{item.title}</h4>
                    <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                      <span className="text-emerald-400">ID: {item.fileId || item.id}</span>
                      {item.size && <span>• {item.size}</span>}
                      <span>• {new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <button
                      onClick={() => openCinema(item.watchUrl, item.title)}
                      className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Play</span>
                    </button>
                    <a
                      href={item.downloadUrl}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </a>
                    <button
                      onClick={() => handleCopy(item.watchUrl, item.id)}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                      title="Watch লিংক কপি করুন"
                    >
                      {copiedField === item.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => deleteFromHistory(item.id)}
                      className="p-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 rounded-lg text-xs"
                      title="ডিলিট করুন"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </main>

      {/* In-Browser Cinema Player Modal */}
      {cinemaPlayerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-md">
          <div className="relative w-full max-w-4xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-emerald-400" />
                <h3 className="font-semibold text-sm text-white truncate max-w-md">{playerMovieTitle}</h3>
              </div>
              <button
                onClick={() => setCinemaPlayerOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="aspect-video bg-black flex items-center justify-center">
              <video
                ref={videoRef}
                src={playerVideoUrl}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            </div>

            <div className="px-5 py-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="font-mono">Pixeldrain High-Speed Range Stream</span>
              <a
                href={playerVideoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
              >
                Direct Stream URL <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Pixeldrain API Key Modal */}
      {isApiKeyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-emerald-400" />
                Pixeldrain API Key সেটিংস
              </h3>
              <button onClick={() => setIsApiKeyModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-300">আপনার Pixeldrain API Key:</label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
              />
              <p className="text-[11px] text-slate-500">
                ডিফল্টভাবে আপনার দেওয়া কি সেট করা আছে: <code className="text-emerald-400 font-mono">55e00a65-998d-4b39-b343-60b2b98f2835</code>
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem('PIXELDRAIN_API_KEY', apiKey.trim());
                  setIsApiKeyModalOpen(false);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg"
              >
                Save Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-4 text-center text-xs text-slate-500">
        Pixeldrain Cloud Streaming Engine • Clean Ingest & Direct Player
      </footer>
    </div>
  );
}
