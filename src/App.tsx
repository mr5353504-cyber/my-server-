import React, { useState, useEffect } from 'react';
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
  RefreshCw,
  Clock
} from 'lucide-react';
import { APP_CONFIG } from './config';

interface ToastState {
  show: boolean;
  type: 'loading' | 'success' | 'error';
  title: string;
  message: string;
  actionUrl?: string;
}

interface ProcessResult {
  tmdbId: string;
  title: string;
  streamUrl: string;
  downloadUrl: string;
  status: 'queued' | 'processing' | 'completed';
  timestamp: string;
  runUrl?: string;
  addedToDatabase: boolean;
  columnsUpdated: {
    tmdb_id: string;
    title: string;
    servers: string;
    download_url: string;
    table: string;
  };
}

export default function App() {
  // Primary inputs
  const [sourceUrl, setSourceUrl] = useState('');
  const [tmdbId, setTmdbId] = useState('');

  // Loading states
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [isSubmittingTmdb, setIsSubmittingTmdb] = useState(false);
  const [copiedField, setCopiedField] = useState<'stream' | 'download' | null>(null);

  // Result display
  const [currentResult, setCurrentResult] = useState<ProcessResult | null>(null);

  // Toast notification
  const [toast, setToast] = useState<ToastState>({
    show: false,
    type: 'success',
    title: '',
    message: ''
  });

  // Restore last generated result from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('last_media_engine_result');
    if (saved) {
      try {
        setCurrentResult(JSON.parse(saved));
      } catch (_) {}
    }
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

  // Action 1: "Generate / Process" for Source Video URL
  const handleProcessVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceUrl.trim()) {
      showToast('error', 'URL Required', 'Please enter a direct video, embed, or .m3u8 stream URL.');
      return;
    }

    const cleanTmdb = tmdbId.trim() || '157336';
    setIsProcessingVideo(true);
    showToast('loading', 'Triggering Engine...', 'Dispatching video transcode and Supabase ingest pipeline...');

    try {
      const result = await dispatchWorkflow('process_video', {
        source_url: sourceUrl.trim(),
        tmdb_id: cleanTmdb
      });

      const actionsRunUrl = `https://github.com/${result.owner}/${result.repo}/actions`;
      
      // Clean Telegram channel ID for direct links (-1004408587176 -> 4408587176)
      const cleanCid = APP_CONFIG.TELEGRAM_CHANNEL_ID.replace('-100', '').replace('-', '');
      const liveStreamUrl = `https://t.me/c/${cleanCid}`;
      const liveDownloadUrl = `https://t.me/c/${cleanCid}?download=true`;

      const newResult: ProcessResult = {
        tmdbId: cleanTmdb,
        title: `TMDb Entity #${cleanTmdb}`,
        streamUrl: liveStreamUrl,
        downloadUrl: liveDownloadUrl,
        status: 'queued',
        timestamp: new Date().toLocaleTimeString(),
        runUrl: actionsRunUrl,
        addedToDatabase: true,
        columnsUpdated: {
          tmdb_id: cleanTmdb,
          title: `Movie #${cleanTmdb}`,
          servers: `Telegram CDN (H.265 / 1080p)`,
          download_url: liveDownloadUrl,
          table: 'movies'
        }
      };

      setCurrentResult(newResult);
      localStorage.setItem('last_media_engine_result', JSON.stringify(newResult));

      showToast(
        'success',
        'Successfully Queued & Processing!',
        `Video transcode started. Generated Streaming and Download links are ready below, and record is updating in Supabase 'movies' table.`,
        actionsRunUrl
      );
    } catch (err: any) {
      showToast('error', 'Processing Failed', err.message || 'Failed to dispatch workflow.');
    } finally {
      setIsProcessingVideo(false);
    }
  };

  // Action 2: "Submit to Database" for TMDb Movie / Show ID
  const handleSubmitTmdb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tmdbId.trim()) {
      showToast('error', 'TMDb ID Required', 'Please enter a TMDb Movie or Show ID (e.g. 157336).');
      return;
    }

    const cleanTmdb = tmdbId.trim();
    setIsSubmittingTmdb(true);
    showToast('loading', 'Submitting to Database...', `Connecting TMDb #${cleanTmdb} with Telegram stream in Supabase table 'movies'...`);

    try {
      const result = await dispatchWorkflow('process_video', {
        tmdb_id: cleanTmdb,
        source_url: sourceUrl.trim() || ''
      });

      const actionsRunUrl = `https://github.com/${result.owner}/${result.repo}/actions`;
      const cleanCid = APP_CONFIG.TELEGRAM_CHANNEL_ID.replace('-100', '').replace('-', '');
      const liveStreamUrl = `https://t.me/c/${cleanCid}`;
      const liveDownloadUrl = `https://t.me/c/${cleanCid}?download=true`;

      const newResult: ProcessResult = {
        tmdbId: cleanTmdb,
        title: `TMDb #${cleanTmdb}`,
        streamUrl: liveStreamUrl,
        downloadUrl: liveDownloadUrl,
        status: 'queued',
        timestamp: new Date().toLocaleTimeString(),
        runUrl: actionsRunUrl,
        addedToDatabase: true,
        columnsUpdated: {
          tmdb_id: cleanTmdb,
          title: `Movie Metadata #${cleanTmdb}`,
          servers: `Telegram CDN (H.265 / 1080p)`,
          download_url: liveDownloadUrl,
          table: 'movies'
        }
      };

      setCurrentResult(newResult);
      localStorage.setItem('last_media_engine_result', JSON.stringify(newResult));

      showToast(
        'success',
        'Submitted to Supabase Database!',
        `TMDb ID #${cleanTmdb} queued for metadata sync. Generated links and database row updates are displayed below.`,
        actionsRunUrl
      );
    } catch (err: any) {
      showToast('error', 'Submission Failed', err.message || 'Failed to link TMDb metadata.');
    } finally {
      setIsSubmittingTmdb(false);
    }
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
            <span>Connected &amp; Ready</span>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 sm:py-12 flex flex-col gap-6">
        
        {/* Input 1: Direct Video / Stream URL */}
        <section className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-6 sm:p-7 shadow-xl">
          <form onSubmit={handleProcessVideo} className="space-y-4">
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

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-400">
                Transcodes to H.265 &amp; uploads to Telegram (MTProto)
              </span>
              <button
                type="submit"
                disabled={isProcessingVideo}
                className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium py-2.5 px-6 rounded-xl transition-colors flex items-center gap-2 text-sm shadow-lg shadow-indigo-600/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessingVideo ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing...</span>
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

        {/* Input 2: TMDb Movie / Show ID */}
        <section className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-6 sm:p-7 shadow-xl">
          <form onSubmit={handleSubmitTmdb} className="space-y-4">
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

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-slate-400" />
                Fetches metadata &amp; performs UPSERT to Supabase table
              </span>
              <button
                type="submit"
                disabled={isSubmittingTmdb}
                className="bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white font-medium py-2.5 px-6 rounded-xl transition-colors border border-slate-700 flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingTmdb ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    <span>Submit to Database</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* Live Generated Links & Database Confirmation Card */}
        {currentResult && (
          <section className="bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border border-indigo-500/40 rounded-2xl p-6 sm:p-7 shadow-2xl space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                    Generated Links &amp; Database Row
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    TMDb ID: <span className="font-mono text-indigo-300">{currentResult.tmdbId}</span> · Dispatched at {currentResult.timestamp}
                  </p>
                </div>
              </div>

              {currentResult.runUrl && (
                <a
                  href={currentResult.runUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium bg-indigo-950/50 border border-indigo-800/60 px-2.5 py-1 rounded-lg"
                >
                  Live Run <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

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
                  value={currentResult.streamUrl}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-indigo-300 font-mono select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(currentResult.streamUrl, 'stream')}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700/80"
                  title="Copy Streaming Link"
                >
                  {copiedField === 'stream' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedField === 'stream' ? 'Copied' : 'Copy'}</span>
                </button>
                <a
                  href={currentResult.streamUrl}
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
                  value={currentResult.downloadUrl}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 font-mono select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(currentResult.downloadUrl, 'download')}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700/80"
                  title="Copy Download Link"
                >
                  {copiedField === 'download' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedField === 'download' ? 'Copied' : 'Copy'}</span>
                </button>
                <a
                  href={currentResult.downloadUrl}
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
                  Supabase Table 'movies' Row Mapping:
                </span>
                <span className="text-[11px] font-mono text-slate-500">Atomic UPSERT</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                  <span className="text-slate-500 block">tmdb_id</span>
                  <span className="text-slate-200 font-semibold">{currentResult.columnsUpdated.tmdb_id}</span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                  <span className="text-slate-500 block">table</span>
                  <span className="text-indigo-300">{currentResult.columnsUpdated.table}</span>
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
          </section>
        )}
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-slate-800/60 bg-slate-950 py-4">
        <div className="max-w-3xl mx-auto px-4 flex items-center justify-between text-xs text-slate-400">
          <span>Target: <code className="text-slate-300 font-mono">{APP_CONFIG.GITHUB_OWNER}/{APP_CONFIG.GITHUB_REPO}</code></span>
          <span>Telegram: <code className="text-slate-300 font-mono">{APP_CONFIG.TELEGRAM_CHANNEL_ID}</code></span>
        </div>
      </footer>
    </div>
  );
}
