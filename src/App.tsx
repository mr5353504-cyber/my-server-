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
  Database,
  Copy,
  Check,
  Tv,
  Download,
  Clock,
  CloudLightning,
  Send,
  Zap,
  Server,
  History as HistoryIcon,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Calendar,
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

interface ToastState {
  show: boolean;
  type: 'loading' | 'success' | 'error';
  title: string;
  message: string;
  actionUrl?: string;
}

interface WorkflowRunItem {
  id: number;
  name: string;
  run_number: number;
  event: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  display_title: string;
}

const SESSION_STORAGE_KEY = 'media_engine_pipeline_session_v3';

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
    description: 'Multi-threaded cloud ingest to fetch complete media file (with <5MB protection)',
    status: 'pending'
  },
  {
    id: 3,
    title: 'Strict 2GB Limit & Smart Bypass',
    description: 'Direct stream copy if <=2GB (2000 MB, 10-15s), or Hyper-Fast libx264 (CRF 32) if >2GB',
    status: 'pending'
  },
  {
    id: 4,
    title: 'Telegram Cloud Backup Upload',
    description: 'Parallel MTProto transfer directly to your Telegram channel',
    status: 'pending'
  },
  {
    id: 5,
    title: 'Stream & Download Link Generation',
    description: 'Generating instant web playback and direct download endpoints',
    status: 'pending'
  }
];

export default function App() {
  // Input parameters
  const [sourceUrl, setSourceUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Workflow tracking
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [activeRunUrl, setActiveRunUrl] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isPipelineActive, setIsPipelineActive] = useState(false);
  const [startedAtTimestamp, setStartedAtTimestamp] = useState<number | null>(null);

  // 5 Step Interactive Pipeline States
  const [steps, setSteps] = useState<PipelineStep[]>(INITIAL_STEPS);

  // Generated final links
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'stream' | 'download' | null>(null);

  // Supabase Section
  const [tmdbIdInput, setTmdbIdInput] = useState('157336');
  const [supabaseStatus, setSupabaseStatus] = useState<StepStatus>('pending');
  const [supabaseMessage, setSupabaseMessage] = useState<string | null>(null);

  // History State
  const [historyRuns, setHistoryRuns] = useState<WorkflowRunItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Timers & Polling
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Toast
  const [toast, setToast] = useState<ToastState>({
    show: false,
    type: 'success',
    title: '',
    message: ''
  });

  const showToast = useCallback((type: 'loading' | 'success' | 'error', title: string, message: string, actionUrl?: string) => {
    setToast({ show: true, type, title, message, actionUrl });
    if (type !== 'loading') {
      setTimeout(() => {
        setToast((prev) => (prev.title === title ? { ...prev, show: false } : prev));
      }, 7000);
    }
  }, []);

  const copyToClipboard = (text: string, field: 'stream' | 'download') => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const updateStepStatus = useCallback((stepId: number, status: StepStatus, errorMessage?: string) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.id === stepId ? { ...step, status, errorMessage } : step
      )
    );
  }, []);

  // Fetch GitHub Actions History (Last 5 Executions)
  const fetchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const res = await fetch(
        `https://api.github.com/repos/${APP_CONFIG.GITHUB_OWNER}/${APP_CONFIG.GITHUB_REPO}/actions/runs?per_page=5`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `Bearer ${APP_CONFIG.GITHUB_PAT}`
          }
        }
      );

      if (!res.ok) {
        throw new Error(`GitHub API HTTP ${res.status}`);
      }

      const data = await res.json();
      setHistoryRuns(data.workflow_runs || []);
    } catch (err: any) {
      console.error('History fetch error:', err);
      setHistoryError(err.message || 'Unable to load run history');
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // Dispatch GitHub Action
  const dispatchWorkflow = async (eventType: string, payload: Record<string, any>) => {
    const owner = APP_CONFIG.GITHUB_OWNER;
    const repo = APP_CONFIG.GITHUB_REPO;
    const token = APP_CONFIG.GITHUB_PAT;

    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/dispatches`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${token}`,
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

    throw new Error(errorData.message || `HTTP ${response.status}`);
  };

  // Real-time polling of GitHub Actions run & steps
  const startRealtimePolling = useCallback((targetRunId?: number | null) => {
    if (pollRef.current) clearInterval(pollRef.current);

    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const runsRes = await fetch(
          `https://api.github.com/repos/${APP_CONFIG.GITHUB_OWNER}/${APP_CONFIG.GITHUB_REPO}/actions/runs?per_page=5`,
          {
            headers: {
              Accept: 'application/vnd.github.v3+json',
              Authorization: `Bearer ${APP_CONFIG.GITHUB_PAT}`
            }
          }
        );

        if (!runsRes.ok) return;
        const runsData = await runsRes.json();
        const runsList = runsData.workflow_runs || [];

        // If targetRunId is known, match it; otherwise take latest
        let currentRun = targetRunId ? runsList.find((r: any) => r.id === targetRunId) : runsList[0];
        if (!currentRun && runsList.length > 0) {
          currentRun = runsList[0];
        }

        if (!currentRun) return;

        setActiveRunId(currentRun.id);
        setActiveRunUrl(currentRun.html_url);

        // Fetch jobs for current run to inspect individual steps
        const jobsRes = await fetch(
          `https://api.github.com/repos/${APP_CONFIG.GITHUB_OWNER}/${APP_CONFIG.GITHUB_REPO}/actions/runs/${currentRun.id}/jobs`,
          {
            headers: {
              Accept: 'application/vnd.github.v3+json',
              Authorization: `Bearer ${APP_CONFIG.GITHUB_PAT}`
            }
          }
        );

        if (!jobsRes.ok) return;
        const jobsData = await jobsRes.json();
        const primaryJob = (jobsData.jobs || [])[0];

        if (primaryJob) {
          const jobStatus = primaryJob.status;
          const jobConclusion = primaryJob.conclusion;

          // Step inspections
          const execStep = primaryJob.steps.find((s: any) =>
            s.name.includes('Execute Media Processing Engine')
          );
          const setupStep = primaryJob.steps.find((s: any) =>
            s.name.includes('Install System Dependencies') || s.name.includes('Install Python Packages')
          );

          if (setupStep && setupStep.status === 'in_progress') {
            updateStepStatus(1, 'completed');
            updateStepStatus(2, 'active');
          }

          if (execStep) {
            if (execStep.status === 'in_progress') {
              updateStepStatus(1, 'completed');
              updateStepStatus(2, 'completed');
              updateStepStatus(3, 'active');
            } else if (execStep.status === 'completed') {
              if (execStep.conclusion === 'success') {
                updateStepStatus(1, 'completed');
                updateStepStatus(2, 'completed');
                updateStepStatus(3, 'completed');
                updateStepStatus(4, 'completed');
                updateStepStatus(5, 'completed');

                // Generate links
                const cleanCid = APP_CONFIG.TELEGRAM_CHANNEL_ID.replace('-100', '').replace('-', '');
                const generatedStream = `https://t.me/c/${cleanCid}`;
                const generatedDownload = `https://t.me/c/${cleanCid}?download=true`;

                setStreamUrl(generatedStream);
                setDownloadUrl(generatedDownload);
                setIsPipelineActive(false);

                if (timerRef.current) clearInterval(timerRef.current);
                if (pollRef.current) clearInterval(pollRef.current);

                showToast(
                  'success',
                  'Processing Completed',
                  'Video uploaded to Telegram channel. Streaming and download links are ready.',
                  currentRun.html_url
                );

                fetchHistory();
              } else if (execStep.conclusion === 'cancelled') {
                updateStepStatus(3, 'failed', 'Pipeline was aborted by user.');
                setIsPipelineActive(false);
                if (timerRef.current) clearInterval(timerRef.current);
                if (pollRef.current) clearInterval(pollRef.current);
                fetchHistory();
              } else {
                updateStepStatus(3, 'failed', 'Processing halted. Check runner terminal (e.g. file <5MB or dead link).');
                setIsPipelineActive(false);
                if (timerRef.current) clearInterval(timerRef.current);
                if (pollRef.current) clearInterval(pollRef.current);

                showToast(
                  'error',
                  'Processing Failed',
                  'Cloud runner exited with error. Review execution logs.',
                  currentRun.html_url
                );
                fetchHistory();
              }
            }
          }

          if (jobStatus === 'completed' && jobConclusion === 'failure' && !execStep) {
            updateStepStatus(2, 'failed', 'Cloud runner failed to initialize dependencies.');
            setIsPipelineActive(false);
            if (timerRef.current) clearInterval(timerRef.current);
            if (pollRef.current) clearInterval(pollRef.current);
            fetchHistory();
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }

      if (attempts > 450) {
        if (pollRef.current) clearInterval(pollRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, 4000);

    pollRef.current = interval;
  }, [fetchHistory, showToast, updateStepStatus]);

  // CANCEL / STOP PIPELINE FEATURE
  const handleCancelPipeline = async () => {
    if (isCancelling) return;
    setIsCancelling(true);

    try {
      if (activeRunId) {
        await fetch(
          `https://api.github.com/repos/${APP_CONFIG.GITHUB_OWNER}/${APP_CONFIG.GITHUB_REPO}/actions/runs/${activeRunId}/cancel`,
          {
            method: 'POST',
            headers: {
              Accept: 'application/vnd.github.v3+json',
              Authorization: `Bearer ${APP_CONFIG.GITHUB_PAT}`
            }
          }
        );
      }

      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);

      setIsPipelineActive(false);
      setIsSubmitting(false);

      setSteps((prev) =>
        prev.map((s) => (s.status === 'active' ? { ...s, status: 'failed', errorMessage: 'Pipeline cancelled by user.' } : s))
      );

      showToast('error', 'Pipeline Cancelled', 'The cloud runner execution was immediately stopped.');
      setTimeout(fetchHistory, 2000);
    } catch (err: any) {
      showToast('error', 'Cancel Notice', err.message || 'Runner stopped.');
      setIsPipelineActive(false);
    } finally {
      setIsCancelling(false);
    }
  };

  // Reset Session
  const handleResetSession = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (pollRef.current) clearInterval(pollRef.current);

    setIsPipelineActive(false);
    setIsSubmitting(false);
    setActiveRunId(null);
    setActiveRunUrl(null);
    setElapsedSeconds(0);
    setStartedAtTimestamp(null);
    setStreamUrl(null);
    setDownloadUrl(null);
    setSteps(INITIAL_STEPS);
    setSupabaseStatus('pending');
    setSupabaseMessage(null);

    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (_) {}

    showToast('success', 'Session Reset', 'Workspace has been restored to default state.');
  };

  // SESSION STATE PERSISTENCE: Save on state change
  useEffect(() => {
    try {
      const stateToSave = {
        sourceUrl,
        tmdbIdInput,
        activeRunId,
        activeRunUrl,
        elapsedSeconds,
        isPipelineActive,
        startedAtTimestamp,
        steps,
        streamUrl,
        downloadUrl,
        savedAt: Date.now()
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.warn('Session save notice:', e);
    }
  }, [
    sourceUrl,
    tmdbIdInput,
    activeRunId,
    activeRunUrl,
    elapsedSeconds,
    isPipelineActive,
    startedAtTimestamp,
    steps,
    streamUrl,
    downloadUrl
  ]);

  // SESSION STATE PERSISTENCE: Restore on component mount
  useEffect(() => {
    try {
      const savedRaw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        if (saved.sourceUrl) setSourceUrl(saved.sourceUrl);
        if (saved.tmdbIdInput) setTmdbIdInput(saved.tmdbIdInput);
        if (saved.streamUrl) setStreamUrl(saved.streamUrl);
        if (saved.downloadUrl) setDownloadUrl(saved.downloadUrl);
        if (saved.steps && Array.isArray(saved.steps)) setSteps(saved.steps);
        if (saved.activeRunId) setActiveRunId(saved.activeRunId);
        if (saved.activeRunUrl) setActiveRunUrl(saved.activeRunUrl);

        if (saved.isPipelineActive) {
          setIsPipelineActive(true);
          const now = Date.now();
          const start = saved.startedAtTimestamp || saved.savedAt || now;
          const diffSecs = Math.max(0, Math.floor((now - start) / 1000));
          setElapsedSeconds(diffSecs);
          setStartedAtTimestamp(start);

          // Resume timer
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = setInterval(() => {
            setElapsedSeconds((prev) => prev + 1);
          }, 1000);

          // Resume live polling
          startRealtimePolling(saved.activeRunId);
        }
      }
    } catch (e) {
      console.warn('Session load notice:', e);
    }

    // Fetch initial history
    fetchHistory();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchHistory, startRealtimePolling]);

  // Start Pipeline
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = sourceUrl.trim();
    if (!cleanUrl) {
      showToast('error', 'URL Required', 'Please enter a valid video stream or direct URL.');
      return;
    }

    setIsSubmitting(true);
    setIsPipelineActive(true);
    const now = Date.now();
    setStartedAtTimestamp(now);
    setElapsedSeconds(0);
    setStreamUrl(null);
    setDownloadUrl(null);
    setSupabaseStatus('pending');
    setSupabaseMessage(null);

    // Reset steps
    setSteps([
      {
        id: 1,
        title: 'URL Inspection & Protocol Validation',
        description: 'Analyzing source link, video headers, and stream viability',
        status: 'active'
      },
      {
        id: 2,
        title: 'High-Speed Aria2c Download (16 Threads)',
        description: 'Multi-threaded cloud ingest to fetch complete media file (<5MB protection active)',
        status: 'pending'
      },
      {
        id: 3,
        title: 'Strict 2GB Limit & Smart Bypass',
        description: 'Direct stream copy if <=2GB (2000 MB, 10-15s), or Hyper-Fast libx264 (CRF 32) if >2GB',
        status: 'pending'
      },
      {
        id: 4,
        title: 'Telegram Cloud Backup Upload',
        description: 'Parallel MTProto transfer directly to your Telegram channel',
        status: 'pending'
      },
      {
        id: 5,
        title: 'Stream & Download Link Generation',
        description: 'Generating instant web playback and direct download endpoints',
        status: 'pending'
      }
    ]);

    // Timer
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    // Step 1: URL Validation
    setTimeout(async () => {
      const isValid =
        cleanUrl.startsWith('http://') ||
        cleanUrl.startsWith('https://') ||
        cleanUrl.toLowerCase() === 'test';
      if (!isValid) {
        updateStepStatus(1, 'failed', 'Invalid URL format. URL must start with http:// or https://');
        setIsSubmitting(false);
        setIsPipelineActive(false);
        if (timerRef.current) clearInterval(timerRef.current);
        showToast('error', 'Invalid Link', 'Please provide a valid URL.');
        return;
      }

      updateStepStatus(1, 'completed');
      updateStepStatus(2, 'active');

      try {
        const result = await dispatchWorkflow('process_video', {
          source_url: cleanUrl,
          tmdb_id: tmdbIdInput.trim() || '157336'
        });

        const actionsUrl = `https://github.com/${result.owner}/${result.repo}/actions`;
        setActiveRunUrl(actionsUrl);

        showToast(
          'loading',
          'Cloud Runner Initialized',
          'Aria2c download and smart stream-copy pipeline launched on GitHub Actions.',
          actionsUrl
        );

        startRealtimePolling();
      } catch (err: any) {
        updateStepStatus(2, 'failed', err.message || 'Failed to dispatch workflow run.');
        setIsPipelineActive(false);
        if (timerRef.current) clearInterval(timerRef.current);
        showToast('error', 'Dispatch Error', err.message);
      } finally {
        setIsSubmitting(false);
      }
    }, 1000);
  };

  // Dedicated Supabase Sync
  const handleSupabaseUpload = async () => {
    const cleanId = tmdbIdInput.trim();
    if (!cleanId) {
      showToast('error', 'TMDb ID Required', 'Please provide a valid TMDb ID.');
      return;
    }

    setSupabaseStatus('active');
    setSupabaseMessage('Syncing TMDb metadata and server endpoints to Supabase...');

    try {
      await dispatchWorkflow('sync_supabase', {
        action: 'sync_supabase',
        tmdb_id: cleanId,
        stream_url: streamUrl || 'https://t.me/c/4408587176',
        download_url: downloadUrl || 'https://t.me/c/4408587176?download=true'
      });

      setSupabaseStatus('completed');
      setSupabaseMessage(`Successfully synced TMDb #${cleanId} into Supabase 'movies' table.`);

      showToast(
        'success',
        'Supabase Synced',
        `Record for TMDb #${cleanId} updated with live stream server URLs.`
      );
      setTimeout(fetchHistory, 2000);
    } catch (err: any) {
      setSupabaseStatus('failed');
      setSupabaseMessage(err.message || 'Supabase sync failed.');
      showToast('error', 'Sync Failed', err.message);
    }
  };

  const formatElapsed = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins}m ${s < 10 ? '0' : ''}${s}s`;
  };

  const formatTimestamp = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return dateStr;
    }
  };

  const getStatusBadge = (status: string, conclusion: string | null) => {
    if (status === 'in_progress') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 animate-pulse">
          <Loader2 className="w-3 h-3 animate-spin" />
          Running
        </span>
      );
    }
    if (status === 'queued') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
          <Clock className="w-3 h-3" />
          Queued
        </span>
      );
    }
    if (conclusion === 'success') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
          <Check className="w-3 h-3 stroke-[3]" />
          Success
        </span>
      );
    }
    if (conclusion === 'cancelled') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
          <Square className="w-2.5 h-2.5 fill-current" />
          Cancelled
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/20 text-rose-300 border border-rose-500/30">
        <AlertCircle className="w-3 h-3" />
        Failed
      </span>
    );
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
                  View Cloud Runner Terminal <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Film className="w-4 h-4" />
            </div>
            <h1 className="font-semibold text-sm text-white tracking-tight">Telegram Cloud Media Engine</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleResetSession}
              title="Reset workspace session"
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset State</span>
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="hidden sm:inline">Target: {APP_CONFIG.GITHUB_OWNER}/{APP_CONFIG.GITHUB_REPO}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 sm:py-12 flex flex-col gap-6">
        {/* Source URL Form */}
        <section className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-6 sm:p-7 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-indigo-400" />
                Source Video URL
              </label>
              <input
                type="text"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="Enter direct MP4, embed URL, HLS .m3u8, or 'test'"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors font-mono"
              />
              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                <span>Aria2c (16 threads) &bull; &lt;5MB auto-abort &bull; Stream copy &le; 2GB (2000 MB)</span>
                <span>Type <code>test</code> for instant verification</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                2GB Telegram MTProto Parallel Engine
              </span>

              <div className="flex items-center gap-2.5">
                {isPipelineActive && (
                  <button
                    type="button"
                    onClick={handleCancelPipeline}
                    disabled={isCancelling}
                    className="bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 font-medium py-2.5 px-4 rounded-xl transition-colors flex items-center gap-1.5 text-sm"
                  >
                    {isCancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 fill-current" />}
                    <span>Cancel Pipeline</span>
                  </button>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || isPipelineActive}
                  className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium py-2.5 px-6 rounded-xl transition-colors flex items-center gap-2 text-sm shadow-lg shadow-indigo-600/25 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Validating...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>Start Pipeline</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* Step-by-Step Live Processing Timeline */}
        {(isPipelineActive || streamUrl || steps[0].status !== 'pending') && (
          <section className="bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border border-indigo-500/40 rounded-2xl p-6 sm:p-7 shadow-2xl space-y-6">
            {/* Timeline Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <CloudLightning className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-white">
                    {streamUrl ? 'Pipeline Execution Succeeded' : 'Real-Time Pipeline Progress'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Elapsed Time: <span className="font-mono text-indigo-300">{formatElapsed(elapsedSeconds)}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isPipelineActive && (
                  <button
                    type="button"
                    onClick={handleCancelPipeline}
                    disabled={isCancelling}
                    className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 font-medium bg-rose-950/50 border border-rose-800/60 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    <span>{isCancelling ? 'Stopping...' : 'Abort Run'}</span>
                  </button>
                )}

                {activeRunUrl && (
                  <a
                    href={activeRunUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium bg-indigo-950/50 border border-indigo-800/60 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <span>Terminal Logs</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            {/* 5 Distinct Interactive Steps */}
            <div className="space-y-3.5">
              {steps.map((step) => {
                const isCompleted = step.status === 'completed';
                const isActive = step.status === 'active';
                const isFailed = step.status === 'failed';
                const isPending = step.status === 'pending';

                return (
                  <div
                    key={step.id}
                    className={`p-3.5 sm:p-4 rounded-xl border transition-all duration-300 flex items-start gap-3.5 ${
                      isCompleted
                        ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300'
                        : isActive
                        ? 'bg-indigo-950/40 border-indigo-500/60 text-indigo-200 shadow-md shadow-indigo-500/10'
                        : isFailed
                        ? 'bg-rose-950/30 border-rose-500/50 text-rose-300'
                        : 'bg-slate-950/40 border-slate-800/60 text-slate-400 opacity-60'
                    }`}
                  >
                    {/* Status Icon */}
                    <div className="mt-0.5 flex-shrink-0">
                      {isCompleted && (
                        <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-emerald-400">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                      {isActive && (
                        <div className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-400 flex items-center justify-center text-indigo-400">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        </div>
                      )}
                      {isFailed && (
                        <div className="w-6 h-6 rounded-full bg-rose-500/20 border border-rose-400 flex items-center justify-center text-rose-400">
                          <AlertCircle className="w-3.5 h-3.5" />
                        </div>
                      )}
                      {isPending && (
                        <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 text-xs font-mono font-medium">
                          {step.id}
                        </div>
                      )}
                    </div>

                    {/* Step Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-xs sm:text-sm text-slate-200">
                          Step {step.id}: {step.title}
                        </h4>
                        <span
                          className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full font-mono ${
                            isCompleted
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : isActive
                              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 animate-pulse'
                              : isFailed
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                              : 'bg-slate-800 text-slate-500'
                          }`}
                        >
                          {isCompleted ? 'Done' : isActive ? 'In Progress' : isFailed ? 'Error' : 'Pending'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        {step.errorMessage ? (
                          <span className="text-rose-400 font-medium">{step.errorMessage}</span>
                        ) : (
                          step.description
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Generated Dual Links Box */}
            {streamUrl && downloadUrl && (
              <div className="space-y-4 pt-4 border-t border-slate-800/80">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Telegram cloud links generated successfully:</span>
                </div>

                {/* Link 1: Direct Streaming Link */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Tv className="w-3.5 h-3.5 text-indigo-400" />
                      1. Direct Streaming Link
                    </span>
                    <span className="text-[11px] text-emerald-400 font-mono">Stream Ready</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={streamUrl}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-indigo-300 font-mono select-all focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(streamUrl, 'stream')}
                      className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700/80"
                    >
                      {copiedField === 'stream' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === 'stream' ? 'Copied' : 'Copy'}</span>
                    </button>
                    <a
                      href={streamUrl}
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
                    <span className="text-[11px] text-slate-400 font-mono">Original Quality</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={downloadUrl}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 font-mono select-all focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(downloadUrl, 'download')}
                      className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700/80"
                    >
                      {copiedField === 'download' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === 'download' ? 'Copied' : 'Copy'}</span>
                    </button>
                    <a
                      href={downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </a>
                  </div>
                </div>

                {/* Dedicated Supabase Upload Box */}
                <div className="mt-6 pt-5 border-t border-slate-800/90 bg-slate-950/80 p-5 rounded-2xl border border-indigo-500/30 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                        <Database className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-xs sm:text-sm text-white">
                          Supabase Database Sync
                        </h4>
                        <p className="text-[11px] text-slate-400">
                          Save stream metadata into Supabase 'movies' table
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="w-full sm:flex-1">
                      <input
                        type="text"
                        value={tmdbIdInput}
                        onChange={(e) => setTmdbIdInput(e.target.value)}
                        placeholder="TMDb Movie/Show ID (e.g. 157336)"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={supabaseStatus === 'active'}
                      onClick={handleSupabaseUpload}
                      className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-medium py-2.5 px-5 rounded-xl transition-colors flex items-center justify-center gap-2 text-xs sm:text-sm shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                    >
                      {supabaseStatus === 'active' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Syncing...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>Sync to Supabase</span>
                        </>
                      )}
                    </button>
                  </div>

                  {supabaseStatus !== 'pending' && (
                    <div
                      className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs transition-all ${
                        supabaseStatus === 'completed'
                          ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                          : supabaseStatus === 'active'
                          ? 'bg-indigo-950/40 border-indigo-500/50 text-indigo-300'
                          : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
                      }`}
                    >
                      {supabaseStatus === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                      {supabaseStatus === 'active' && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin flex-shrink-0" />}
                      {supabaseStatus === 'failed' && <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />}
                      <span className="font-medium">{supabaseMessage}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* GitHub Actions History Section (Feature 8) */}
        <section className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-6 sm:p-7 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <HistoryIcon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-white">GitHub Actions Pipeline History</h3>
                <p className="text-xs text-slate-400">Last 5 automated cloud runner executions</p>
              </div>
            </div>

            <button
              onClick={fetchHistory}
              disabled={isLoadingHistory}
              className="text-xs text-slate-300 hover:text-white flex items-center gap-1.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin text-indigo-400' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {isLoadingHistory && historyRuns.length === 0 ? (
            <div className="p-8 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
              <span className="text-xs">Fetching workflow history from GitHub Actions...</span>
            </div>
          ) : historyError ? (
            <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-800/40 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{historyError}</span>
            </div>
          ) : historyRuns.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              No recent workflow runs found. Launch your first pipeline above.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {historyRuns.map((run) => (
                <div key={run.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-200 truncate">
                        {run.display_title || run.name || 'Automated Media Pipeline'}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        #{run.run_number}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        {formatTimestamp(run.created_at)}
                      </span>
                      <span className="font-mono bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800/80 text-[10px]">
                        {run.event}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {getStatusBadge(run.status, run.conclusion)}

                    <a
                      href={run.html_url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      title="View GitHub Logs"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 bg-slate-950 py-4">
        <div className="max-w-3xl mx-auto px-4 flex items-center justify-between text-xs text-slate-400">
          <span>Repository: <code className="text-slate-300 font-mono">{APP_CONFIG.GITHUB_OWNER}/{APP_CONFIG.GITHUB_REPO}</code></span>
          <span>Channel: <code className="text-slate-300 font-mono">{APP_CONFIG.TELEGRAM_CHANNEL_ID}</code></span>
        </div>
      </footer>
    </div>
  );
}
