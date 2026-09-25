import React, { useState, useEffect } from 'react';
import {
  Settings,
  Film,
  Link as LinkIcon,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Eye,
  EyeOff,
  ExternalLink,
  Database
} from 'lucide-react';

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

  // Settings (collapsible)
  const [showSettings, setShowSettings] = useState(false);
  const [githubPat, setGithubPat] = useState('');
  const [repoOwner, setRepoOwner] = useState('mr5353504-cyber');
  const [repoName, setRepoName] = useState('my-server-');
  const [showPatText, setShowPatText] = useState(false);

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

  // Load stored credentials from LocalStorage
  useEffect(() => {
    const savedOwner = localStorage.getItem('media_repo_owner');
    const savedRepo = localStorage.getItem('media_repo_name');
    const savedPat = localStorage.getItem('media_repo_pat');

    if (savedOwner) setRepoOwner(savedOwner);
    if (savedRepo) setRepoName(savedRepo);
    if (savedPat) setGithubPat(savedPat);
  }, []);

  // Save settings whenever changed
  const saveSettings = (owner: string, repo: string, pat: string) => {
    setRepoOwner(owner);
    setRepoName(repo);
    setGithubPat(pat);
    localStorage.setItem('media_repo_owner', owner);
    localStorage.setItem('media_repo_name', repo);
    localStorage.setItem('media_repo_pat', pat);
  };

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
    const activeOwner = repoOwner.trim() || 'mr5353504-cyber';
    const activeRepo = repoName.trim() || 'my-server-';
    const activePat = githubPat.trim();

    if (!activePat) {
      setShowSettings(true);
      throw new Error('Please configure your GitHub Personal Access Token (PAT) in Settings.');
    }

    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(activeOwner)}/${encodeURIComponent(activeRepo)}/dispatches`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${activePat}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        event_type: eventType,
        client_payload: payload
      })
    });

    if (response.status === 204) {
      return { success: true, owner: activeOwner, repo: activeRepo };
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
        `Video processing job dispatched to ${result.owner}/${result.repo}. Transcode & upload will run in background.`,
        `https://github.com/${result.owner}/${result.repo}/actions`
      );
    } catch (err: any) {
      showToast('error', 'Processing Failed', err.message || 'Failed to dispatch workflow.');
    } finally {
      setIsProcessingVideo(false);
    }
  };

  // Action 2: "Submit" for TMDb Movie / Show ID
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
        'Metadata Submitted!',
        `TMDb ID #${tmdbId.trim()} queued for metadata retrieval and Supabase database linking.`,
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

          {/* Settings Toggle Button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              showSettings
                ? 'bg-slate-800 text-white border-slate-700'
                : 'text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700 bg-slate-900/60'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 sm:py-12 flex flex-col gap-6">
        {/* Collapsible Settings Panel */}
        {showSettings && (
          <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4 transition-all">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Settings className="w-4 h-4 text-indigo-400" />
                  GitHub Repository Settings
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Saved automatically in your browser's local storage.
                </p>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Repository Owner
                </label>
                <input
                  type="text"
                  value={repoOwner}
                  onChange={(e) => saveSettings(e.target.value, repoName, githubPat)}
                  placeholder="mr5353504-cyber"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Repository Name
                </label>
                <input
                  type="text"
                  value={repoName}
                  onChange={(e) => saveSettings(repoOwner, e.target.value, githubPat)}
                  placeholder="my-server-"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-300">
                  GitHub Personal Access Token (PAT)
                </label>
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-indigo-400 hover:text-indigo-300"
                >
                  Generate Token
                </a>
              </div>
              <div className="relative">
                <input
                  type={showPatText ? 'text' : 'password'}
                  value={githubPat}
                  onChange={(e) => saveSettings(repoOwner, repoName, e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-3 pr-16 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPatText(!showPatText)}
                  className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
                >
                  {showPatText ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showPatText ? 'Hide' : 'Show'}</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Requires <code className="text-slate-300 font-mono">repo</code> scope to trigger repository_dispatch.</p>
            </div>
          </section>
        )}

        {/* Clean, Minimal Primary Inputs */}
        <div className="space-y-6">
          {/* Primary Input 1: Direct Video / Stream URL */}
          <section className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-6 shadow-xl">
            <form onSubmit={handleProcessVideo} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-200 mb-1.5 flex items-center gap-2">
                  <LinkIcon className="w-4 h-4 text-indigo-400" />
                  Direct Video / Stream URL
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="https://example.com/video_source.mp4"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-400">
                  Transcodes with FFmpeg H.265 &amp; uploads to Telegram
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

          {/* Primary Input 2: TMDb Movie / Show ID */}
          <section className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-6 shadow-xl">
            <form onSubmit={handleSubmitTmdb} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-200 mb-1.5 flex items-center gap-2">
                  <Film className="w-4 h-4 text-indigo-400" />
                  TMDb Movie / Show ID
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={tmdbId}
                    onChange={(e) => setTmdbId(e.target.value)}
                    placeholder="e.g. 157336 (Interstellar)"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-slate-400" />
                  Links metadata to Supabase table
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
                      <span>Submit</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-slate-800/60 bg-slate-950 py-4">
        <div className="max-w-3xl mx-auto px-4 flex items-center justify-between text-xs text-slate-400">
          <span>Target Repo: <code className="text-slate-300 font-mono">{repoOwner}/{repoName}</code></span>
          <span>Telegram: <code className="text-slate-300 font-mono">-1004408587176</code></span>
        </div>
      </footer>
    </div>
  );
}
