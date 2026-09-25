import React, { useState } from 'react';
import {
  Film,
  Link as LinkIcon,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  ExternalLink,
  Database
} from 'lucide-react';
import { APP_CONFIG } from './config';

interface ToastState {
  show: boolean;
  type: 'loading' | 'success' | 'error';
  title: string;
  message: string;
  actionUrl?: string;
}

export default function App() {
  // Primary inputs
  const [sourceUrl, setSourceUrl] = useState('');
  const [tmdbId, setTmdbId] = useState('');

  // Loading states
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [isSubmittingTmdb, setIsSubmittingTmdb] = useState(false);

  // Toast notification
  const [toast, setToast] = useState<ToastState>({
    show: false,
    type: 'success',
    title: '',
    message: ''
  });

  const showToast = (type: 'loading' | 'success' | 'error', title: string, message: string, actionUrl?: string) => {
    setToast({ show: true, type, title, message, actionUrl });
    if (type !== 'loading') {
      setTimeout(() => {
        setToast((prev) => (prev.title === title ? { ...prev, show: false } : prev));
      }, 6000);
    }
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
      showToast('error', 'URL Required', 'Please provide a direct video or stream URL to process.');
      return;
    }

    setIsProcessingVideo(true);
    showToast('loading', 'Triggering Engine...', 'Dispatching video transcode pipeline to GitHub Actions...');

    try {
      const result = await dispatchWorkflow('process_video', {
        source_url: sourceUrl.trim(),
        tmdb_id: tmdbId.trim() || '0'
      });

      showToast(
        'success',
        'Successfully Queued!',
        `Video processing job dispatched to ${result.owner}/${result.repo}. Background transcode will execute shortly.`,
        `https://github.com/${result.owner}/${result.repo}/actions`
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

    setIsSubmittingTmdb(true);
    showToast('loading', 'Submitting TMDb Metadata...', `Linking TMDb #${tmdbId.trim()} to Supabase database...`);

    try {
      const result = await dispatchWorkflow('process_video', {
        tmdb_id: tmdbId.trim(),
        source_url: sourceUrl.trim() || ''
      });

      showToast(
        'success',
        'Submitted to Database!',
        `TMDb ID #${tmdbId.trim()} queued for metadata extraction and Supabase database linking.`,
        `https://github.com/${result.owner}/${result.repo}/actions`
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
                  View in GitHub Actions <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Minimal Top Header */}
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
            <span>Connected</span>
          </div>
        </div>
      </header>

      {/* Main Workspace - Only the 2 requested inputs */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 sm:py-16 flex flex-col justify-center gap-6">
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
                placeholder="https://example.com/video_source.mp4"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors font-mono"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-400">
                Transcodes to H.265 and uploads to Telegram
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
                Fetches metadata and links to Supabase
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
