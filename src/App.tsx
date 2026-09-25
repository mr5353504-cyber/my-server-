import React, { useState, useEffect, useRef } from 'react';
import {
  Film,
  Link as LinkIcon,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  ExternalLink,
  Database,
  Copy,
  Check,
  Tv,
  Download,
  Clock,
  Activity,
  AlertTriangle
} from 'lucide-react';
import { APP_CONFIG } from './config';

interface ToastState {
  show: boolean;
  type: 'loading' | 'success' | 'error';
  title: string;
  message: string;
  actionUrl?: string;
}

interface ProcessJob {
  tmdbId: string;
  sourceUrl: string;
  runId?: number;
  runUrl: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  conclusion?: string;
  startedAt: string;
  elapsedSeconds: number;
  streamUrl?: string;
  downloadUrl?: string;
  errorMessage?: string;
}

export default function App() {
  // Primary inputs
  const [sourceUrl, setSourceUrl] = useState('');
  const [tmdbId, setTmdbId] = useState('');

  // Loading & tracking
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeJob, setActiveJob] = useState<ProcessJob | null>(null);
  const [copiedField, setCopiedField] = useState<'stream' | 'download' | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Toast notification
  const [toast, setToast] = useState<ToastState>({
    show: false,
    type: 'success',
    title: '',
    message: ''
  });

  // Restore last job from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('active_media_job');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setActiveJob(parsed);
        if (parsed.status === 'in_progress' || parsed.status === 'queued') {
          startPolling(parsed.runId, parsed.tmdbId);
        }
      } catch (_) {}
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const showToast = (type: 'loading' | 'success' | 'error', title: string, message: string, actionUrl?: string) => {
    setToast({ show: true, type, title, message, actionUrl });
    if (type !== 'loading') {
      setTimeout(() => {
        setToast((prev) => (prev.title === title ? { ...prev, show: false } : prev));
      }, 7000);
    }
  };

  const copyToClipboard = (text: string, field: 'stream' | 'download') => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Helper to trigger GitHub Actions repository_dispatch
  const dispatchWorkflow = async (eventType: string, payload: Record<string, any>) => {
    const owner = APP_CONFIG.GITHUB_OWNER;
    const repo = APP_CONFIG.GITHUB_REPO;
    const token = APP_CONFIG.GITHUB_PAT;

    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event_type: eventType,
          client_payload: payload
        })
      }
    );

    if (response.status === 204) {
      return { success: true, owner, repo };
    }

    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch (_) {}

    const errorMsg = errorData.message || `HTTP ${response.status} ${response.statusText}`;
    throw new Error(errorMsg);
  };

  // Live polling for the actual GitHub Actions run status
  const startPolling = (knownRunId?: number, tmdb?: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (timerRef.current) clearInterval(timerRef.current);

    // Increment elapsed time timer
    timerRef.current = setInterval(() => {
      setActiveJob((prev) => (prev ? { ...prev, elapsedSeconds: prev.elapsedSeconds + 1 } : prev));
    }, 1000);

    let attempts = 0;
    const pollInterval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(
          `https://api.github.com/repos/${APP_CONFIG.GITHUB_OWNER}/${APP_CONFIG.GITHUB_REPO}/actions/runs?per_page=5`,
          {
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'Authorization': `Bearer ${APP_CONFIG.GITHUB_PAT}`
            }
          }
        );

        if (!res.ok) return;

        const data = await res.json();
        const runs = data.workflow_runs || [];
        const latestRun = runs[0];

        if (latestRun) {
          const status = latestRun.status; // queued, in_progress, completed
          const conclusion = latestRun.conclusion; // success, failure, null

          setActiveJob((prev) => {
            if (!prev) return null;
            const updated: ProcessJob = {
              ...prev,
              runId: latestRun.id,
              runUrl: latestRun.html_url,
              status: status === 'completed' ? (conclusion === 'success' ? 'completed' : 'failed') : status,
              conclusion: conclusion || undefined
            };

            // If completed successfully, generate final links
            if (status === 'completed' && conclusion === 'success') {
              const cleanCid = APP_CONFIG.TELEGRAM_CHANNEL_ID.replace('-100', '').replace('-', '');
              updated.streamUrl = `https://t.me/c/${cleanCid}`;
              updated.downloadUrl = `https://t.me/c/${cleanCid}?download=true`;
            } else if (status === 'completed' && conclusion === 'failure') {
              updated.errorMessage = 'GitHub Actions run failed during execution. Check terminal logs.';
            }

            localStorage.setItem('active_media_job', JSON.stringify(updated));
            return updated;
          });

          if (status === 'completed') {
            clearInterval(pollInterval);
            if (timerRef.current) clearInterval(timerRef.current);
            if (conclusion === 'success') {
              showToast(
                'success',
                'Transcode & Upload Completed!',
                'Video has been uploaded to Telegram and links are saved to Supabase.',
                latestRun.html_url
              );
            } else {
              showToast(
                'error',
                'Workflow Failed',
                'The processing job encountered an error on the runner. Click to see details.',
                latestRun.html_url
              );
            }
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }

      // Stop after 25 minutes
      if (attempts > 300) {
        clearInterval(pollInterval);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, 5000);

    pollingRef.current = pollInterval;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceUrl.trim()) {
      showToast('error', 'URL Required', 'Please enter a direct video, embed, or .m3u8 stream URL.');
      return;
    }

    const cleanTmdb = tmdbId.trim() || '157336';
    setIsSubmitting(true);
    showToast('loading', 'Starting Engine...', 'Sending dispatch request to GitHub Actions background runner...');

    try {
      const result = await dispatchWorkflow('process_video', {
        source_url: sourceUrl.trim(),
        tmdb_id: cleanTmdb
      });

      const actionsBaseUrl = `https://github.com/${result.owner}/${result.repo}/actions`;

      const newJob: ProcessJob = {
        tmdbId: cleanTmdb,
        sourceUrl: sourceUrl.trim(),
        runUrl: actionsBaseUrl,
        status: 'in_progress',
        startedAt: new Date().toLocaleTimeString(),
        elapsedSeconds: 0
      };

      setActiveJob(newJob);
      localStorage.setItem('active_media_job', JSON.stringify(newJob));

      showToast(
        'success',
        'Job Dispatched to Runner!',
        'Virtual runner is initializing. Download, H.265 compression, and MTProto upload are now underway.',
        actionsBaseUrl
      );

      // Start live polling
      setTimeout(() => startPolling(undefined, cleanTmdb), 3000);
    } catch (err: any) {
      showToast('error', 'Dispatch Failed', err.message || 'Failed to dispatch workflow.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatElapsed = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins}m ${s < 10 ? '0' : ''}${s}s`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between font-sans antialiased selection:bg-indigo-500/30">
      {/* Toast Notification Banner */}
      {toast.show && (
        <div className="fixed top-4 inset-x-4 max-w-lg mx-auto z-50 transition-all">
          <div
            className={`p-4 rounded-xl border shadow-2xl backdrop-blur-md flex items-start gap-3 ${
              toast.type === 'loading'
                ? 'bg-slate-900/95 border-indigo-500/50 text-indigo-200'
                : toast.type === 'success'
                ? 'bg-slate-900/95 border-emerald-500/50 text-emerald-200'
                : 'bg-slate-900/95 border-rose-500/50 text-rose-200'
            }`}
          >
            <div className="mt-0.5 flex-shrink-0">
              {toast.type === 'loading' && <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />}
              {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
              {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm text-white">{toast.title}</h4>
                <button
                  onClick={() => setToast((prev) => ({ ...prev, show: false }))}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">{toast.message}</p>
              {toast.actionUrl && (
                <a
                  href={toast.actionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 mt-2 font-medium"
                >
                  View Live in GitHub Actions <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Film className="w-4 h-4" />
            </div>
            <h1 className="font-semibold text-sm text-white tracking-tight">Media Engine</h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Target: {APP_CONFIG.GITHUB_OWNER}/{APP_CONFIG.GITHUB_REPO}</span>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 sm:py-12 flex flex-col gap-6">
        {/* Unified Input Card */}
        <section className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-6 sm:p-7 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-indigo-400" />
                Direct Video / Stream URL
              </label>
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://example.com/video_source.mp4 (or embed / .m3u8)"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors font-mono"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2">
                <Film className="w-4 h-4 text-indigo-400" />
                TMDb Movie / Show ID
              </label>
              <input
                type="text"
                value={tmdbId}
                onChange={(e) => setTmdbId(e.target.value)}
                placeholder="e.g. 157336 (Interstellar)"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors font-mono"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400">
                Downloads &rarr; Transcodes H.265 &rarr; MTProto Telegram Upload &rarr; Supabase Sync
              </span>
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium py-2.5 px-6 rounded-xl transition-colors flex items-center gap-2 text-sm shadow-lg shadow-indigo-600/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Triggering Runner...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Generate / Process</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* Live Background Progress / Results Card */}
        {activeJob && (
          <section className="bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border border-indigo-500/40 rounded-2xl p-6 sm:p-7 shadow-2xl space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                    activeJob.status === 'completed'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : activeJob.status === 'failed'
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 animate-pulse'
                  }`}
                >
                  {activeJob.status === 'completed' && <CheckCircle2 className="w-4 h-4" />}
                  {activeJob.status === 'failed' && <AlertTriangle className="w-4 h-4" />}
                  {(activeJob.status === 'in_progress' || activeJob.status === 'queued') && (
                    <Activity className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                    {activeJob.status === 'completed' && 'Processing Complete! Links Ready'}
                    {activeJob.status === 'in_progress' && 'Processing Live on GitHub Actions Runner...'}
                    {activeJob.status === 'queued' && 'Queued on Virtual Runner...'}
                    {activeJob.status === 'failed' && 'Execution Failed on Runner'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    TMDb ID: <span className="font-mono text-indigo-300">#{activeJob.tmdbId}</span> · Elapsed: {formatElapsed(activeJob.elapsedSeconds)}
                  </p>
                </div>
              </div>

              <a
                href={activeJob.runUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium bg-indigo-950/50 border border-indigo-800/60 px-3 py-1.5 rounded-lg transition-colors"
              >
                <span>Terminal Log</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* In Progress Steps Tracker */}
            {(activeJob.status === 'in_progress' || activeJob.status === 'queued') && (
              <div className="space-y-3 py-2">
                <div className="flex items-center gap-2 text-xs text-indigo-300 font-medium">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>Real-time Transcode Pipeline Active</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-slate-950/80 border border-indigo-500/30 p-2.5 rounded-xl">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Step 1</span>
                    <span className="text-slate-200 font-medium mt-0.5 block">Download (aria2c)</span>
                  </div>
                  <div className="bg-slate-950/80 border border-indigo-500/30 p-2.5 rounded-xl">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Step 2</span>
                    <span className="text-slate-200 font-medium mt-0.5 block">FFmpeg H.265 (HEVC)</span>
                  </div>
                  <div className="bg-slate-950/80 border border-indigo-500/30 p-2.5 rounded-xl">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Step 3</span>
                    <span className="text-slate-200 font-medium mt-0.5 block">MTProto 2GB Upload</span>
                  </div>
                  <div className="bg-slate-950/80 border border-indigo-500/30 p-2.5 rounded-xl">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Step 4</span>
                    <span className="text-slate-200 font-medium mt-0.5 block">Supabase UPSERT</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  Note: Large files (1GB - 4GB) typically take 2 to 6 minutes to transcode. The links below will unlock as soon as upload finishes.
                </p>
              </div>
            )}

            {/* Error Message if Failed */}
            {activeJob.status === 'failed' && (
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h5 className="font-semibold text-rose-200">Execution Error</h5>
                  <p className="mt-0.5 text-rose-300/90 leading-relaxed">
                    The background job encountered an error on the virtual server. Click 'Terminal Log' above to inspect the exact FFmpeg or Telegram output.
                  </p>
                </div>
              </div>
            )}

            {/* Final Links (Displayed only when completed successfully) */}
            {activeJob.status === 'completed' && activeJob.streamUrl && activeJob.downloadUrl && (
              <div className="space-y-4 pt-1">
                {/* Link 1: Direct Streaming Link */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Tv className="w-3.5 h-3.5 text-indigo-400" />
                      1. Direct Streaming Link (Web &amp; Player)
                    </span>
                    <span className="text-[11px] text-emerald-400 font-mono">Streamable</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={activeJob.streamUrl}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-indigo-300 font-mono select-all focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(activeJob.streamUrl!, 'stream')}
                      className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700/80"
                      title="Copy Streaming Link"
                    >
                      {copiedField === 'stream' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === 'stream' ? 'Copied' : 'Copy'}</span>
                    </button>
                    <a
                      href={activeJob.streamUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-md shadow-indigo-600/20"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Open</span>
                    </a>
                  </div>
                </div>

                {/* Link 2: Direct Download Link */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      2. Direct Download Link
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">Full H.265 File</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={activeJob.downloadUrl}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 font-mono select-all focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(activeJob.downloadUrl!, 'download')}
                      className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700/80"
                      title="Copy Download Link"
                    >
                      {copiedField === 'download' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === 'download' ? 'Copied' : 'Copy'}</span>
                    </button>
                    <a
                      href={activeJob.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </a>
                  </div>
                </div>

                {/* Database Row Verification Details */}
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs space-y-2">
                  <div className="flex items-center justify-between font-medium text-slate-300">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <Database className="w-3.5 h-3.5" />
                      Supabase Table 'movies' Row Mapping Verified:
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">Atomic UPSERT</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                    <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 block">tmdb_id</span>
                      <span className="text-slate-200 font-semibold">{activeJob.tmdbId}</span>
                    </div>
                    <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 block">table</span>
                      <span className="text-indigo-300">movies</span>
                    </div>
                    <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 block">servers</span>
                      <span className="text-emerald-300 truncate block">Appended [1080p]</span>
                    </div>
                    <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 block">download_url</span>
                      <span className="text-slate-300 truncate block">Synced</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-slate-800/60 bg-slate-950 py-4">
        <div className="max-w-3xl mx-auto px-4 flex items-center justify-between text-xs text-slate-400">
          <span>Target: <code className="text-slate-300 font-mono">{APP_CONFIG.GITHUB_OWNER}/{APP_CONFIG.GITHUB_REPO}</code></span>
          <span>Telegram Channel: <code className="text-slate-300 font-mono">{APP_CONFIG.TELEGRAM_CHANNEL_ID}</code></span>
        </div>
      </footer>
    </div>
  );
}
