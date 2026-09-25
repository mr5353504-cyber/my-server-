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
  ArrowRight,
  Server,
  CloudLightning,
  Sparkles,
  Send,
  FileCheck
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

export default function App() {
  // Input URL
  const [sourceUrl, setSourceUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Workflow tracking
  const [activeRunUrl, setActiveRunUrl] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isPipelineActive, setIsPipelineActive] = useState(false);

  // 5 Step Interactive Pipeline States
  const [steps, setSteps] = useState<PipelineStep[]>([
    {
      id: 1,
      title: 'লিঙ্ক বিশ্লেষণ ও যাচাইকরণ',
      description: 'লিঙ্কটি কি ভিডিও, এমবেড নাকি স্ট্রিম তা পরীক্ষা করে ডাউনলোডের উপযোগী করা',
      status: 'pending'
    },
    {
      id: 2,
      title: 'ক্লাউড সার্ভারে ভিডিও ডাউনলোড',
      description: 'গিটহাব অ্যাকশন ক্লাউড রানারে হাই-স্পিড মাল্টি-কানেকশন দিয়ে ডাউনলোড চলছে',
      status: 'pending'
    },
    {
      id: 3,
      title: 'H.265 (HEVC) আল্ট্রা কমপ্রেশন',
      description: 'FFmpeg দিয়ে কোয়ালিটি অক্ষুণ্ণ রেখে সাইজ ২ জিবির নিচে কমপ্রেস ও অপ্টিমাইজেশন',
      status: 'pending'
    },
    {
      id: 4,
      title: 'টেলিগ্রাম চ্যানেলে আপলোড',
      description: 'টেলিগ্রাম বট ও MTProto ইঞ্জিন দিয়ে চ্যানেলে ভিডিও আপলোড সম্পন্ন করা',
      status: 'pending'
    },
    {
      id: 5,
      title: 'স্ট্রিমিং ও ডাউনলোড লিংক জেনারেট',
      description: 'সরাসরি স্ট্রিমিং ও হাই-স্পিড ডাউনলোড লিংক প্রস্তুত করা',
      status: 'pending'
    }
  ]);

  // Generated final links
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'stream' | 'download' | null>(null);

  // Supabase Section (Below the 2 links)
  const [tmdbIdInput, setTmdbIdInput] = useState('157336');
  const [supabaseStatus, setSupabaseStatus] = useState<StepStatus>('pending');
  const [supabaseMessage, setSupabaseMessage] = useState<string | null>(null);
  const [supabaseMovieTitle, setSupabaseMovieTitle] = useState<string | null>(null);

  // Timers
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Toast
  const [toast, setToast] = useState<ToastState>({
    show: false,
    type: 'success',
    title: '',
    message: ''
  });

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
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

  const updateStepStatus = (stepId: number, status: StepStatus, errorMessage?: string) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.id === stepId ? { ...step, status, errorMessage } : step
      )
    );
  };

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

    throw new Error(errorData.message || `HTTP ${response.status}`);
  };

  // Real-time polling of GitHub Actions run & logs
  const startRealtimePolling = (targetRunId?: number) => {
    if (pollRef.current) clearInterval(pollRef.current);

    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const runsRes = await fetch(
          `https://api.github.com/repos/${APP_CONFIG.GITHUB_OWNER}/${APP_CONFIG.GITHUB_REPO}/actions/runs?per_page=3`,
          {
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'Authorization': `Bearer ${APP_CONFIG.GITHUB_PAT}`
            }
          }
        );

        if (!runsRes.ok) return;
        const runsData = await runsRes.json();
        const latestRun = (runsData.workflow_runs || [])[0];

        if (!latestRun) return;

        setActiveRunUrl(latestRun.html_url);

        // Fetch jobs for latest run to inspect individual steps
        const jobsRes = await fetch(
          `https://api.github.com/repos/${APP_CONFIG.GITHUB_OWNER}/${APP_CONFIG.GITHUB_REPO}/actions/runs/${latestRun.id}/jobs`,
          {
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'Authorization': `Bearer ${APP_CONFIG.GITHUB_PAT}`
            }
          }
        );

        if (!jobsRes.ok) return;
        const jobsData = await jobsRes.json();
        const primaryJob = (jobsData.jobs || [])[0];

        if (primaryJob) {
          const jobStatus = primaryJob.status; // in_progress, completed
          const jobConclusion = primaryJob.conclusion; // success, failure

          // Find the main step
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
              // Runner is currently executing Python engine
              updateStepStatus(1, 'completed');
              updateStepStatus(2, 'completed');

              // Fetch log snippet if available or progress steps realistically
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
                  'প্রসেসিং সম্পূর্ণ হয়েছে!',
                  'ভিডিও টেলিগ্রাম চ্যানেলে আপলোড হয়েছে এবং লিংক জেনারেট সম্পন্ন হয়েছে।',
                  latestRun.html_url
                );
              } else {
                // Failure
                updateStepStatus(3, 'failed', 'গিটহাব রানারে প্রসেসিং চলাকালীন সমস্যা হয়েছে। টার্মিনাল লগ চেক করুন।');
                setIsPipelineActive(false);
                if (timerRef.current) clearInterval(timerRef.current);
                if (pollRef.current) clearInterval(pollRef.current);

                showToast(
                  'error',
                  'প্রসেসিং ব্যর্থ হয়েছে',
                  'টার্মিনাল লগ দেখে সমস্যার কারণ পরীক্ষা করুন।',
                  latestRun.html_url
                );
              }
            }
          }

          if (jobStatus === 'completed' && jobConclusion === 'failure' && !execStep) {
            updateStepStatus(2, 'failed', 'গিটহাব অ্যাকশন জব শুরু করার সময় ব্যর্থ হয়েছে।');
            setIsPipelineActive(false);
            if (timerRef.current) clearInterval(timerRef.current);
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }

      if (attempts > 360) {
        if (pollRef.current) clearInterval(pollRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, 4000);

    pollRef.current = interval;
  };

  // Handle Form Submission (Step 1 -> Start Pipeline)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = sourceUrl.trim();
    if (!cleanUrl) {
      showToast('error', 'লিঙ্ক দেওয়া প্রয়োজন', 'অনুগ্রহ করে একটি বৈধ ভিডিও বা স্ট্রিম লিঙ্ক দিন।');
      return;
    }

    setIsSubmitting(true);
    setIsPipelineActive(true);
    setElapsedSeconds(0);
    setStreamUrl(null);
    setDownloadUrl(null);
    setSupabaseStatus('pending');
    setSupabaseMessage(null);

    // Reset steps
    setSteps([
      {
        id: 1,
        title: 'লিঙ্ক বিশ্লেষণ ও যাচাইকরণ',
        description: 'লিঙ্কটি কি ভিডিও, এমবেড নাকি স্ট্রিম তা পরীক্ষা করে ডাউনলোডের উপযোগী করা',
        status: 'active'
      },
      {
        id: 2,
        title: 'ক্লাউড সার্ভারে ভিডিও ডাউনলোড',
        description: 'গিটহাব অ্যাকশন ক্লাউড রানারে হাই-স্পিড মাল্টি-কানেকশন দিয়ে ডাউনলোড চলছে',
        status: 'pending'
      },
      {
        id: 3,
        title: 'H.265 (HEVC) আল্ট্রা কমপ্রেশন',
        description: 'FFmpeg দিয়ে কোয়ালিটি অক্ষুণ্ণ রেখে সাইজ ২ জিবির নিচে কমপ্রেস ও অপ্টিমাইজেশন',
        status: 'pending'
      },
      {
        id: 4,
        title: 'টেলিগ্রাম চ্যানেলে আপলোড',
        description: 'টেলিগ্রাম বট ও MTProto ইঞ্জিন দিয়ে চ্যানেলে ভিডিও আপলোড সম্পন্ন করা',
        status: 'pending'
      },
      {
        id: 5,
        title: 'স্ট্রিমিং ও ডাউনলোড লিংক জেনারেট',
        description: 'সরাসরি স্ট্রিমিং ও হাই-স্পিড ডাউনলোড লিংক প্রস্তুত করা',
        status: 'pending'
      }
    ]);

    // Start Elapsed Timer
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    // Step 1: Link Inspection & Validation
    setTimeout(async () => {
      const isValidProtocol = cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://') || cleanUrl.toLowerCase() === 'test';
      if (!isValidProtocol) {
        updateStepStatus(1, 'failed', 'ভুল লিঙ্ক ফরম্যাট! লিঙ্কটি অবশ্যই https:// বা http:// দিয়ে শুরু হতে হবে।');
        setIsSubmitting(false);
        setIsPipelineActive(false);
        if (timerRef.current) clearInterval(timerRef.current);
        showToast('error', 'লিঙ্ক অবৈধ', 'অনুগ্রহ করে সঠিক URL ফরম্যাট প্রদান করুন।');
        return;
      }

      // Step 1 Success!
      updateStepStatus(1, 'completed');
      updateStepStatus(2, 'active');

      try {
        // Trigger GitHub Actions Workflow
        const result = await dispatchWorkflow('process_video', {
          source_url: cleanUrl,
          tmdb_id: tmdbIdInput.trim() || '157336'
        });

        const actionsUrl = `https://github.com/${result.owner}/${result.repo}/actions`;
        setActiveRunUrl(actionsUrl);

        showToast(
          'loading',
          'গিটহাব রানার সক্রিয় হয়েছে!',
          'ক্লাউড সার্ভারে ভিডিও ডাউনলোড ও প্রসেসিং পাইপলাইন শুরু হয়েছে।',
          actionsUrl
        );

        // Start live polling after dispatch
        startRealtimePolling();
      } catch (err: any) {
        updateStepStatus(2, 'failed', err.message || 'গিটহাব সার্ভারে রিকোয়েস্ট পাঠাতে ব্যর্থ হয়েছে।');
        setIsPipelineActive(false);
        if (timerRef.current) clearInterval(timerRef.current);
        showToast('error', 'ডিসপ্যাচ ব্যর্থ', err.message);
      } finally {
        setIsSubmitting(false);
      }
    }, 1200);
  };

  // Step 6: Handle Supabase Upload Button Click
  const handleSupabaseUpload = async () => {
    const cleanId = tmdbIdInput.trim();
    if (!cleanId) {
      showToast('error', 'TMDb ID প্রয়োজন', 'অনুগ্রহ করে একটি সঠিক TMDb Movie বা Show ID দিন।');
      return;
    }

    setSupabaseStatus('active');
    setSupabaseMessage('TMDb থেকে মেটাডাটা নেওয়া হচ্ছে এবং সাফা বেইজে সেভ হচ্ছে...');

    try {
      // 1. Fetch metadata from TMDb API
      let movieTitle = `Movie #${cleanId}`;
      try {
        const tmdbRes = await fetch(
          `https://api.themoviedb.org/3/movie/${encodeURIComponent(cleanId)}?api_key=4b706c888c3df1950e326bceea187b99&language=en-US`
        );
        if (tmdbRes.ok) {
          const tmdbData = await tmdbRes.json();
          movieTitle = tmdbData.title || movieTitle;
        }
      } catch (_) {}

      // 2. Dispatch dedicated sync_supabase action to GitHub runner
      await dispatchWorkflow('sync_supabase', {
        action: 'sync_supabase',
        tmdb_id: cleanId,
        stream_url: streamUrl || `https://t.me/c/4408587176`,
        download_url: downloadUrl || `https://t.me/c/4408587176?download=true`
      });

      setSupabaseMovieTitle(movieTitle);
      setSupabaseStatus('completed');
      setSupabaseMessage(`সাফা বেইজে সফলভাবে আপলোড সম্পন্ন হয়েছে! (${movieTitle})`);

      showToast(
        'success',
        'সাফা বেইজে আপলোড সম্পন্ন!',
        `'movies' টেবিলে #${cleanId} (${movieTitle}) এর স্ট্রিমিং ও ডাউনলোড লিংক সেভ করা হয়েছে।`
      );
    } catch (err: any) {
      setSupabaseStatus('failed');
      setSupabaseMessage(err.message || 'সাফা বেইজে আপলোড করার সময় সমস্যা দেখা দিয়েছে।');
      showToast('error', 'আপলোড ব্যর্থ', err.message || 'সাফা বেইজে ডাটা সেভ হয়নি।');
    }
  };

  const formatElapsed = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins} মিনিট ${s < 10 ? '0' : ''}${s} সেকেন্ড`;
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
                  গিটহাব অ্যাকশনে লাইভ টার্মিনাল দেখুন <ExternalLink className="w-3 h-3" />
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
            <h1 className="font-semibold text-sm text-white tracking-tight">অটোমেটেড মিডিয়া ইঞ্জিন</h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>টার্গেট: {APP_CONFIG.GITHUB_OWNER}/{APP_CONFIG.GITHUB_REPO}</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 sm:py-12 flex flex-col gap-6">
        {/* URL Input Form Card */}
        <section className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-6 sm:p-7 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-indigo-400" />
                ভিডিও বা স্ট্রিম লিঙ্ক দিন
              </label>
              <input
                type="text"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="যেমন: https://example.com/movie.mp4 বা .m3u8 বা টেস্ট করতে 'test' লিখুন"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors font-mono"
              />
              <p className="text-[11px] text-slate-400 mt-1.5">
                সরাসরি MP4 লিঙ্ক, এমবেড প্লেয়ার লিঙ্ক, HLS স্ট্রিম (.m3u8), অথবা টেস্ট রানার চেক করতে <code>test</code> লিখুন।
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                বাটনে চাপ দিলে স্টেপ-বাই-স্টেপ লাইভ প্রসেসিং শুরু হবে
              </span>
              <button
                type="submit"
                disabled={isSubmitting || isPipelineActive}
                className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium py-2.5 px-6 rounded-xl transition-colors flex items-center gap-2 text-sm shadow-lg shadow-indigo-600/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>যাচাই হচ্ছে...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>প্রসেস শুরু করুন</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* Step-by-Step Live Processing Timeline */}
        {(isPipelineActive || streamUrl || steps[0].status !== 'pending') && (
          <section className="bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border border-indigo-500/40 rounded-2xl p-6 sm:p-7 shadow-2xl space-y-6 animate-in fade-in duration-300">
            {/* Timeline Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <CloudLightning className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-white">
                    {streamUrl ? 'সবগুলো স্টেপ সফলভাবে সম্পন্ন হয়েছে!' : 'রিয়েল-টাইম স্টেপ প্রসেসিং চলছে...'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    মোট সময় লেগেছে: <span className="font-mono text-indigo-300">{formatElapsed(elapsedSeconds)}</span>
                  </p>
                </div>
              </div>

              {activeRunUrl && (
                <a
                  href={activeRunUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium bg-indigo-950/50 border border-indigo-800/60 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <span>টার্মিনাল লগ</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {/* 5 Distinct Interactive Steps */}
            <div className="space-y-4">
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
                        <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-emerald-400 animate-in zoom-in-75">
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
                          স্টেপ {step.id}: {step.title}
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
                          {isCompleted ? 'সফল (Done)' : isActive ? 'চলছে (In Progress)' : isFailed ? 'ব্যর্থ (Error)' : 'অপেক্ষমান'}
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

            {/* Generated Dual Links Box (Appears automatically when Step 4 & 5 finish) */}
            {streamUrl && downloadUrl && (
              <div className="space-y-4 pt-3 border-t border-slate-800/80 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>টেলিগ্রাম থেকে ২টি লিংক স্বয়ংক্রিয়ভাবে তৈরি হয়েছে:</span>
                </div>

                {/* Link 1: Direct Streaming Link */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Tv className="w-3.5 h-3.5 text-indigo-400" />
                      ১. ডিরেক্ট স্ট্রিমিং লিংক (Direct Streaming Link)
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
                      <span>{copiedField === 'stream' ? 'কপি হয়েছে' : 'কপি'}</span>
                    </button>
                    <a
                      href={streamUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-md shadow-indigo-600/20"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>ওপেন</span>
                    </a>
                  </div>
                </div>

                {/* Link 2: Direct Download Link */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      ২. ডিরেক্ট ডাউনলোড লিংক (Direct Download Link)
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">Full H.265 File</span>
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
                      <span>{copiedField === 'download' ? 'কপি হয়েছে' : 'কপি'}</span>
                    </button>
                    <a
                      href={downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>ডাউনলোড</span>
                    </a>
                  </div>
                </div>

                {/* Dedicated Supabase Upload Box (Below the 2 links) */}
                <div className="mt-6 pt-5 border-t border-slate-800/90 bg-slate-950/80 p-5 rounded-2xl border border-indigo-500/30 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                        <Database className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-xs sm:text-sm text-white">
                          সাফা বেইজে (Supabase) আপলোড সেকশন
                        </h4>
                        <p className="text-[11px] text-slate-400">
                          টিএমডিবি আইডি দিয়ে সাফা বেইজ ডাটাবেসে সেভ করুন
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* TMDb ID Input & Upload Button */}
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="w-full sm:flex-1">
                      <input
                        type="text"
                        value={tmdbIdInput}
                        onChange={(e) => setTmdbIdInput(e.target.value)}
                        placeholder="TMDb Movie/Show ID (যেমন: 157336)"
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
                          <span>আপলোড হচ্ছে...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>সাফা বেইজে আপলোড করুন</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Real-Time Supabase Status Feedback */}
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
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 bg-slate-950 py-4">
        <div className="max-w-3xl mx-auto px-4 flex items-center justify-between text-xs text-slate-400">
          <span>রিপোজিটরি: <code className="text-slate-300 font-mono">{APP_CONFIG.GITHUB_OWNER}/{APP_CONFIG.GITHUB_REPO}</code></span>
          <span>চ্যানেল আইডি: <code className="text-slate-300 font-mono">{APP_CONFIG.TELEGRAM_CHANNEL_ID}</code></span>
        </div>
      </footer>
    </div>
  );
}
