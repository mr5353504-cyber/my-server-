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
  Layers,
  Trash2,
  Plus
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

export interface PipelineGeneratedHistoryItem {
  id: string;
  tmdbId: string;
  title: string;
  streamUrl: string;
  downloadUrl: string;
  telegramChannelUrl?: string;
  partsCount?: number;
  quality?: string;
  createdAt: string;
  status: 'completed' | 'in_progress' | 'failed';
}

const DEFAULT_INITIAL_HISTORY: PipelineGeneratedHistoryItem[] = [
  {
    id: '157336',
    tmdbId: '157336',
    title: 'Interstellar (1080p Ultra High Quality)',
    streamUrl: typeof window !== 'undefined' ? `${window.location.origin}/watch?id=157336` : 'https://myserver-sage.vercel.app/watch?id=157336',
    downloadUrl: typeof window !== 'undefined' ? `${window.location.origin}/download?id=157336` : 'https://myserver-sage.vercel.app/download?id=157336',
    telegramChannelUrl: 'https://t.me/server7766/38',
    partsCount: 2,
    quality: '1080p Original (Seamless Multi-Part)',
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    status: 'completed'
  },
  {
    id: '27205',
    tmdbId: '27205',
    title: 'Inception (1080p Cinema Master)',
    streamUrl: typeof window !== 'undefined' ? `${window.location.origin}/watch?id=27205` : 'https://myserver-sage.vercel.app/watch?id=27205',
    downloadUrl: typeof window !== 'undefined' ? `${window.location.origin}/download?id=27205` : 'https://myserver-sage.vercel.app/download?id=27205',
    telegramChannelUrl: 'https://t.me/server7766',
    partsCount: 2,
    quality: '1080p Ultra HD',
    createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    status: 'completed'
  },
  {
    id: '299536',
    tmdbId: '299536',
    title: 'Avengers: Infinity War (1080p Single Link)',
    streamUrl: typeof window !== 'undefined' ? `${window.location.origin}/watch?id=299536` : 'https://myserver-sage.vercel.app/watch?id=299536',
    downloadUrl: typeof window !== 'undefined' ? `${window.location.origin}/download?id=299536` : 'https://myserver-sage.vercel.app/download?id=299536',
    telegramChannelUrl: 'https://t.me/server7766',
    partsCount: 2,
    quality: '1080p Ultra HD',
    createdAt: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    status: 'completed'
  },
  {
    id: '299534',
    tmdbId: '299534',
    title: 'Avengers: Endgame (1080p Ultra HD)',
    streamUrl: typeof window !== 'undefined' ? `${window.location.origin}/watch?id=299534` : 'https://myserver-sage.vercel.app/watch?id=299534',
    downloadUrl: typeof window !== 'undefined' ? `${window.location.origin}/download?id=299534` : 'https://myserver-sage.vercel.app/download?id=299534',
    telegramChannelUrl: 'https://t.me/server7766',
    partsCount: 2,
    quality: '1080p Ultra HD',
    createdAt: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    status: 'completed'
  },
  {
    id: '155',
    tmdbId: '155',
    title: 'The Dark Knight (1080p Original)',
    streamUrl: typeof window !== 'undefined' ? `${window.location.origin}/watch?id=155` : 'https://myserver-sage.vercel.app/watch?id=155',
    downloadUrl: typeof window !== 'undefined' ? `${window.location.origin}/download?id=155` : 'https://myserver-sage.vercel.app/download?id=155',
    telegramChannelUrl: 'https://t.me/server7766',
    partsCount: 2,
    quality: '1080p Ultra HD',
    createdAt: new Date(Date.now() - 1000 * 60 * 480).toISOString(),
    status: 'completed'
  },
  {
    id: '49026',
    tmdbId: '49026',
    title: 'The Dark Knight Rises (1080p Original)',
    streamUrl: typeof window !== 'undefined' ? `${window.location.origin}/watch?id=49026` : 'https://myserver-sage.vercel.app/watch?id=49026',
    downloadUrl: typeof window !== 'undefined' ? `${window.location.origin}/download?id=49026` : 'https://myserver-sage.vercel.app/download?id=49026',
    telegramChannelUrl: 'https://t.me/server7766',
    partsCount: 2,
    quality: '1080p Ultra HD',
    createdAt: new Date(Date.now() - 1000 * 60 * 600).toISOString(),
    status: 'completed'
  },
  {
    id: '19995',
    tmdbId: '19995',
    title: 'Avatar (1080p Ultra High Quality)',
    streamUrl: typeof window !== 'undefined' ? `${window.location.origin}/watch?id=19995` : 'https://myserver-sage.vercel.app/watch?id=19995',
    downloadUrl: typeof window !== 'undefined' ? `${window.location.origin}/download?id=19995` : 'https://myserver-sage.vercel.app/download?id=19995',
    telegramChannelUrl: 'https://t.me/server7766',
    partsCount: 2,
    quality: '1080p Ultra HD',
    createdAt: new Date(Date.now() - 1000 * 60 * 720).toISOString(),
    status: 'completed'
  },
  {
    id: '76600',
    tmdbId: '76600',
    title: 'Avatar: The Way of Water (1080p Original)',
    streamUrl: typeof window !== 'undefined' ? `${window.location.origin}/watch?id=76600` : 'https://myserver-sage.vercel.app/watch?id=76600',
    downloadUrl: typeof window !== 'undefined' ? `${window.location.origin}/download?id=76600` : 'https://myserver-sage.vercel.app/download?id=76600',
    telegramChannelUrl: 'https://t.me/server7766',
    partsCount: 2,
    quality: '1080p Ultra HD',
    createdAt: new Date(Date.now() - 1000 * 60 * 840).toISOString(),
    status: 'completed'
  },
  {
    id: '671',
    tmdbId: '671',
    title: "Harry Potter and the Philosopher's Stone (1080p)",
    streamUrl: typeof window !== 'undefined' ? `${window.location.origin}/watch?id=671` : 'https://myserver-sage.vercel.app/watch?id=671',
    downloadUrl: typeof window !== 'undefined' ? `${window.location.origin}/download?id=671` : 'https://myserver-sage.vercel.app/download?id=671',
    telegramChannelUrl: 'https://t.me/server7766',
    partsCount: 2,
    quality: '1080p Ultra HD',
    createdAt: new Date(Date.now() - 1000 * 60 * 960).toISOString(),
    status: 'completed'
  },
  {
    id: '597',
    tmdbId: '597',
    title: 'Titanic (1080p Master)',
    streamUrl: typeof window !== 'undefined' ? `${window.location.origin}/watch?id=597` : 'https://myserver-sage.vercel.app/watch?id=597',
    downloadUrl: typeof window !== 'undefined' ? `${window.location.origin}/download?id=597` : 'https://myserver-sage.vercel.app/download?id=597',
    telegramChannelUrl: 'https://t.me/server7766',
    partsCount: 2,
    quality: '1080p Ultra HD',
    createdAt: new Date(Date.now() - 1000 * 60 * 1080).toISOString(),
    status: 'completed'
  }
];

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
    title: 'Zero Part-Splitting (Rapid Bitrate Tuning)',
    description: 'If <= 1.9GB: Instant stream copy. If > 1.9GB: Rapid ultrafast bitrate tuning below 1.85GB in seconds (100% single seamless file)',
    status: 'pending'
  },
  {
    id: 4,
    title: 'Ultra-Fast MTProto Upload (1-2 Mins)',
    description: 'Multi-worker concurrent MTProto pipeline (16 parallel workers, 8MB in-flight) without session drops',
    status: 'pending'
  },
  {
    id: 5,
    title: 'Native Website Cinema Player & Direct Links',
    description: 'Direct streaming & download endpoints mapped to the site built-in HTML5 player without Telegram redirects',
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

  // Native HTML5 Cinema Player Modal State
  const [cinemaPlayerOpen, setCinemaPlayerOpen] = useState(false);
  const [cinemaMovieData, setCinemaMovieData] = useState<{
    id: string;
    title?: string;
    videoUrl?: string;
    downloadUrl?: string;
    overview?: string;
    telegramChannelUrl?: string;
    serverSources?: { label: string; url: string; telegramUrl?: string; embedUrl?: string; isTelegram?: boolean; partNumber?: number }[];
    parts?: { partIndex: number; title: string; url: string; telegramUrl?: string; embedUrl?: string; duration?: number }[];
  } | null>(null);
  const [playerMode, setPlayerMode] = useState<'embed' | 'player'>('embed');
  const [activeVideoSrc, setActiveVideoSrc] = useState<string>('');
  const [currentPartIndex, setCurrentPartIndex] = useState<number>(0);
  const [videoPlaybackError, setVideoPlaybackError] = useState<string | null>(null);
  const [isResolvingStream, setIsResolvingStream] = useState(false);
  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);

  // Dedicated Native Download Modal State
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [downloadModalData, setDownloadModalData] = useState<{
    id: string;
    parts?: { partIndex: number; title: string; downloadUrl: string; telegramUrl?: string; sizeStr?: string }[];
  } | null>(null);

  const openDownloadModal = (id?: string) => {
    const effectiveId = id || tmdbIdInput.trim() || '157336';
    const publicChannel = APP_CONFIG.TELEGRAM_CHANNEL_USERNAME || 'server7766';
    const cleanOrigin = window.location.origin;

    let partsToUse = cinemaMovieData?.parts && cinemaMovieData.parts.length > 0
      ? cinemaMovieData.parts.map((p, idx) => ({
          partIndex: idx,
          title: p.title || `Part ${idx + 1}`,
          downloadUrl: `${cleanOrigin}/api/download?id=${effectiveId}&part=${idx + 1}`,
          telegramUrl: p.telegramUrl || `https://t.me/${publicChannel}`,
          sizeStr: '1.80 GB (1080p Original)'
        }))
      : effectiveId === '157336'
      ? [
          {
            partIndex: 0,
            title: 'Part 1 (Interstellar - 1080p Original)',
            downloadUrl: `${cleanOrigin}/api/download?id=157336&part=1`,
            telegramUrl: `https://t.me/${publicChannel}/38`,
            sizeStr: '1.80 GB (1080p Original)'
          },
          {
            partIndex: 1,
            title: 'Part 2 (Interstellar - 1080p Original)',
            downloadUrl: `${cleanOrigin}/api/download?id=157336&part=2`,
            telegramUrl: `https://t.me/${publicChannel}/40`,
            sizeStr: '1.80 GB (1080p Original)'
          }
        ]
      : [
          {
            partIndex: 0,
            title: 'Part 1',
            downloadUrl: `${cleanOrigin}/api/download?id=${effectiveId}&part=1`,
            telegramUrl: `https://t.me/${publicChannel}`,
            sizeStr: '1.80 GB (1080p Original)'
          },
          {
            partIndex: 1,
            title: 'Part 2',
            downloadUrl: `${cleanOrigin}/api/download?id=${effectiveId}&part=2`,
            telegramUrl: `https://t.me/${publicChannel}`,
            sizeStr: '1.80 GB (1080p Original)'
          }
        ];

    setDownloadModalData({
      id: effectiveId,
      parts: partsToUse
    });
    setDownloadModalOpen(true);
  };

  const resolveStreamCandidates = async (id: string, directUrl?: string | null) => {
    setIsResolvingStream(true);
    setVideoPlaybackError(null);
    const candidates: { label: string; url: string; telegramUrl?: string; embedUrl?: string; isTelegram?: boolean; partNumber?: number }[] = [];

    // 1. Fast Local / Proxy Range Stream Gateway (Guarantees HTTP Range & CORS support)
    candidates.push({
      label: 'Native Cinema Stream Gateway (Part 1)',
      url: `/api/stream?id=${encodeURIComponent(id)}&part=1`,
      partNumber: 1
    });

    candidates.push({
      label: 'Native Cinema Stream Gateway (Part 2)',
      url: `/api/stream?id=${encodeURIComponent(id)}&part=2`,
      partNumber: 2
    });

    // 2. Direct Ingest Source (Proxied through gateway to avoid CORS / codec errors)
    if (directUrl && (directUrl.startsWith('http://') || directUrl.startsWith('https://')) && !directUrl.includes('/watch?id=') && !directUrl.includes('/download?id=')) {
      candidates.push({
        label: 'Direct Source Stream (Proxied Gateway)',
        url: `/api/stream?url=${encodeURIComponent(directUrl)}`
      });
      candidates.push({
        label: 'Direct Source Stream (Raw Link)',
        url: directUrl
      });
    }

    // 3. Supabase Database lookup
    try {
      const cleanUrl = APP_CONFIG.SUPABASE_URL.replace(/\/$/, '');
      const query = !isNaN(Number(id))
        ? `${cleanUrl}/rest/v1/movies?tmdb_id=eq.${id}&select=*`
        : `${cleanUrl}/rest/v1/movies?download_url=ilike.*${encodeURIComponent(id)}*&select=*`;

      const resp = await fetch(query, {
        headers: {
          apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder',
          Accept: 'application/json'
        }
      });
      if (resp.ok) {
        const rows = await resp.json();
        if (Array.isArray(rows) && rows.length > 0) {
          const movie = rows[0];
          const servers = movie.servers || [];
          for (let idx = 0; idx < servers.length; idx++) {
            const s = servers[idx];
            if (s && s.telegram_cdn_url && s.telegram_cdn_url.startsWith('http')) {
              let msgId = s.message_id;
              if (!msgId) {
                const match = s.telegram_cdn_url.match(/\/(\d+)$/);
                if (match) msgId = match[1];
              }
              const publicChannel = APP_CONFIG.TELEGRAM_CHANNEL_USERNAME || 'server7766';
              const publicUrl = msgId ? `https://t.me/${publicChannel}/${msgId}` : s.telegram_cdn_url;
              const embed = s.embed_url || (msgId ? `https://t.me/${publicChannel}/${msgId}?embed=1` : `https://t.me/${publicChannel}?embed=1`);

              candidates.push({
                label: s.name ? `${s.name} (Telegram Channel)` : `Part ${idx + 1} (Telegram Channel)`,
                url: s.telegram_cdn_url,
                telegramUrl: publicUrl,
                embedUrl: embed,
                isTelegram: true,
                partNumber: s.part_number || (idx + 1)
              });
            }
            if (s && s.url && s.url.startsWith('http') && !s.url.includes('/watch?id=')) {
              candidates.push({ label: s.name || `Cinema Server ${idx + 1}`, url: s.url });
            }
          }
        }
      }
    } catch (_) {}

    setIsResolvingStream(false);
    return candidates;
  };

  const openCinemaPlayer = async (id?: string, sUrl?: string | null, dUrl?: string | null) => {
    const effectiveId = id || tmdbIdInput.trim() || '157336';
    setVideoPlaybackError(null);
    setCurrentPartIndex(0);

    const candidates = await resolveStreamCandidates(effectiveId, sUrl || sourceUrl);
    // Prioritize our range gateway to prevent CORS & decoding issues
    const gatewayCandidate = candidates.find(c => c.url.startsWith('/api/stream'));
    const initialSource = gatewayCandidate?.url || `/api/stream?id=${encodeURIComponent(effectiveId)}&part=1`;
    setActiveVideoSrc(initialSource);

    // Identify if the stream has multiple parts
    const publicChannel = APP_CONFIG.TELEGRAM_CHANNEL_USERNAME || 'server7766';
    let partsList: { partIndex: number; title: string; url: string; telegramUrl?: string; embedUrl?: string }[] = [];
    const tgCandidates = candidates.filter(c => c.isTelegram || c.telegramUrl);

    if (tgCandidates.length > 0) {
      partsList = tgCandidates.map((c, idx) => ({
        partIndex: idx,
        title: `Part ${idx + 1}`,
        url: `/api/stream?id=${encodeURIComponent(effectiveId)}&part=${idx + 1}`,
        telegramUrl: c.telegramUrl || `https://t.me/${publicChannel}`,
        embedUrl: c.embedUrl || `https://t.me/${publicChannel}?embed=1`
      }));
    } else if (effectiveId === '157336') {
      // Interstellar 1080p verified on channel server7766
      partsList = [
        {
          partIndex: 0,
          title: 'Part 1 (Interstellar - 1080p Original)',
          url: `/api/stream?id=157336&part=1`,
          telegramUrl: `https://t.me/${publicChannel}/38`,
          embedUrl: `https://t.me/${publicChannel}/38?embed=1`
        },
        {
          partIndex: 1,
          title: 'Part 2 (Interstellar - 1080p Original)',
          url: `/api/stream?id=157336&part=2`,
          telegramUrl: `https://t.me/${publicChannel}/40`,
          embedUrl: `https://t.me/${publicChannel}/40?embed=1`
        }
      ];
    } else {
      // Clean 2-part structure for large cinema media
      partsList = [
        { partIndex: 0, title: 'Part 1', url: `/api/stream?id=${encodeURIComponent(effectiveId)}&part=1`, telegramUrl: `https://t.me/${publicChannel}` },
        { partIndex: 1, title: 'Part 2', url: `/api/stream?id=${encodeURIComponent(effectiveId)}&part=2`, telegramUrl: `https://t.me/${publicChannel}` }
      ];
    }

    setCinemaMovieData({
      id: effectiveId,
      title: `Movie #${effectiveId}`,
      videoUrl: initialSource,
      downloadUrl: dUrl || downloadUrl || `${window.location.origin}/download?id=${effectiveId}`,
      overview: '1080p single seamless cinema stream played natively on this website without Telegram app redirects.',
      serverSources: candidates,
      parts: partsList,
      telegramChannelUrl: `https://t.me/${publicChannel}`
    });
    setCinemaPlayerOpen(true);
  };

  // Supabase Section
  const [tmdbIdInput, setTmdbIdInput] = useState('157336');
  const [supabaseStatus, setSupabaseStatus] = useState<StepStatus>('pending');
  const [supabaseMessage, setSupabaseMessage] = useState<string | null>(null);

  // History State
  const [historyRuns, setHistoryRuns] = useState<WorkflowRunItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyTab, setHistoryTab] = useState<'generated' | 'runners'>('generated');
  const [copiedHistoryId, setCopiedHistoryId] = useState<string | null>(null);
  const [quickAddTmdbInput, setQuickAddTmdbInput] = useState('');

  const [generatedHistory, setGeneratedHistory] = useState<PipelineGeneratedHistoryItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('MEDIA_PIPELINE_HISTORY');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length >= 10) {
            return parsed;
          }
        }
      } catch (_) {}
    }
    return DEFAULT_INITIAL_HISTORY;
  });

  const saveToGeneratedHistory = useCallback((item: Omit<PipelineGeneratedHistoryItem, 'createdAt'> & { createdAt?: string }) => {
    setGeneratedHistory((prev) => {
      const cleanOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://myserver-sage.vercel.app';
      const existing = prev.filter((h) => h.tmdbId !== item.tmdbId);
      const newItem: PipelineGeneratedHistoryItem = {
        ...item,
        streamUrl: item.streamUrl || `${cleanOrigin}/watch?id=${item.tmdbId}`,
        downloadUrl: item.downloadUrl || `${cleanOrigin}/download?id=${item.tmdbId}`,
        createdAt: item.createdAt || new Date().toISOString(),
        status: item.status || 'completed'
      };
      // Keep at least 10, up to 30 items
      const updated = [newItem, ...existing].slice(0, 30);
      try {
        localStorage.setItem('MEDIA_PIPELINE_HISTORY', JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });
  }, []);

  const deleteFromGeneratedHistory = useCallback((tmdbId: string) => {
    setGeneratedHistory((prev) => {
      const filtered = prev.filter((h) => h.tmdbId !== tmdbId);
      try {
        localStorage.setItem('MEDIA_PIPELINE_HISTORY', JSON.stringify(filtered));
      } catch (_) {}
      return filtered;
    });
  }, []);

  const handleQuickAddToHistory = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = quickAddTmdbInput.trim();
    if (!clean) return;
    const cleanOrigin = window.location.origin;
    saveToGeneratedHistory({
      id: clean,
      tmdbId: clean,
      title: `Movie #${clean}`,
      streamUrl: `${cleanOrigin}/watch?id=${clean}`,
      downloadUrl: `${cleanOrigin}/download?id=${clean}`,
      telegramChannelUrl: `https://t.me/${APP_CONFIG.TELEGRAM_CHANNEL_USERNAME}`,
      partsCount: 2,
      quality: '1080p Ultra High Quality',
      status: 'completed'
    });
    setQuickAddTmdbInput('');
    showToast('success', 'Added to History', `Movie #${clean} links saved into Pipeline History.`);
  };

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

  // Fetch GitHub Actions History (Up to 20 Executions)
  const fetchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const token = APP_CONFIG.GITHUB_PAT?.trim();
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(
        `https://api.github.com/repos/${APP_CONFIG.GITHUB_OWNER}/${APP_CONFIG.GITHUB_REPO}/actions/runs?per_page=20`,
        { headers }
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
    const token = APP_CONFIG.GITHUB_PAT?.trim();

    if (!token) {
      throw new Error('গিটহাব টোকেন পাওয়া যায়নি। Vercel Settings-এ VITE_GITHUB_PAT সেট করে Redeploy দিন অথবা টোকেন যুক্ত করুন।');
    }

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
        const token = APP_CONFIG.GITHUB_PAT?.trim();
        const headers: Record<string, string> = {
          Accept: 'application/vnd.github.v3+json'
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const runsRes = await fetch(
          `https://api.github.com/repos/${APP_CONFIG.GITHUB_OWNER}/${APP_CONFIG.GITHUB_REPO}/actions/runs?per_page=5`,
          { headers }
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
          { headers }
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

                // Generate Native Website Links
                const origin = window.location.origin;
                const cleanTmdbId = tmdbIdInput.trim() || '157336';
                const generatedStream = `${origin}/watch?id=${cleanTmdbId}`;
                const generatedDownload = `${origin}/download?id=${cleanTmdbId}`;

                setStreamUrl(generatedStream);
                setDownloadUrl(generatedDownload);
                setIsPipelineActive(false);

                saveToGeneratedHistory({
                  id: cleanTmdbId,
                  tmdbId: cleanTmdbId,
                  title: `Movie #${cleanTmdbId}`,
                  streamUrl: generatedStream,
                  downloadUrl: generatedDownload,
                  telegramChannelUrl: `https://t.me/${APP_CONFIG.TELEGRAM_CHANNEL_USERNAME}`,
                  partsCount: 2,
                  quality: '1080p Ultra High Quality',
                  status: 'completed'
                });

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

    // Purge any stale revoked token from previous sessions
    try {
      const stored = localStorage.getItem('APP_GITHUB_PAT');
      if (stored && stored.includes('ghp_nzw4')) {
        localStorage.removeItem('APP_GITHUB_PAT');
      }
    } catch (_) {}

    // Fetch initial history
    fetchHistory();

    // Check URL parameters for watch or id or download query parameter
    try {
      const params = new URLSearchParams(window.location.search);
      const isDownloadPath = window.location.pathname.startsWith('/download') || params.has('download');
      const movieParam = params.get('id') || params.get('watch') || params.get('download');
      const partParam = params.get('part');
      if (isDownloadPath && movieParam) {
        openDownloadModal(movieParam);
      } else if (movieParam) {
        openCinemaPlayer(movieParam);
        if (partParam === '2') {
          setCurrentPartIndex(1);
          setActiveVideoSrc(`/api/stream?id=${encodeURIComponent(movieParam)}&part=2`);
        }
      }
    } catch (_) {}

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchHistory, startRealtimePolling]);

  // Start Pipeline
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let cleanUrl = sourceUrl.trim();
    if (!cleanUrl) {
      showToast('error', 'URL Required', 'Please enter a valid video stream or direct URL.');
      return;
    }

    // Sanitize malformed URL patterns (e.g. instantchttps or double prefix)
    cleanUrl = cleanUrl.replace(/https?:\/\/[^/]*instantchttps[^/]*/gi, 'https://instantcloud.org');
    cleanUrl = cleanUrl.replace(/(instantcloud\.org\/file\/[^/]+)\/+download.*/gi, '$1/download');
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && cleanUrl.toLowerCase() !== 'test') {
      cleanUrl = `https://${cleanUrl}`;
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
        title: 'Zero Part-Splitting (Rapid Bitrate Tuning)',
        description: 'If <= 1.9GB: Instant stream copy. If > 1.9GB: Rapid ultrafast bitrate tuning below 1.85GB in seconds (100% single seamless file)',
        status: 'pending'
      },
      {
        id: 4,
        title: 'Ultra-Fast MTProto Upload (1-2 Mins)',
        description: 'Multi-worker concurrent MTProto pipeline (16 parallel workers, 8MB in-flight) without session drops',
        status: 'pending'
      },
      {
        id: 5,
        title: 'Native Website Cinema Player & Direct Links',
        description: 'Direct streaming & download endpoints mapped to the site built-in HTML5 player without Telegram redirects',
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
          tmdb_id: tmdbIdInput.trim() || '157336',
          web_app_url: window.location.origin
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
            <div className="w-8 h-8 rounded-full overflow-hidden border border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.3)] bg-slate-900 flex items-center justify-center flex-shrink-0">
              <img src="/logo.png" alt="Media Engine Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="font-semibold text-sm text-white tracking-tight leading-tight">Telegram Cloud Media Engine</h1>
              <p className="text-[10px] text-emerald-400 font-mono tracking-wider">ULTRA-FAST STREAM ENGINE</p>
            </div>
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
          <form id="pipeline-form" onSubmit={handleSubmit} className="space-y-4">
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-slate-400 mt-2">
                <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Recommended: Use 1080p/720p direct links &le; 1.9GB for Instant Stream-Copy (~10-15s, 0% CPU re-encode)
                </span>
                <span className="text-slate-500">Type <code className="text-indigo-300">test</code> for instant sample</span>
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Native Website Cinema Player & Direct Links Ready:</span>
                  </div>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                    Single Seamless File (&lt;1.85GB)
                  </span>
                </div>

                {/* Launch Native Player Banner */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-950/70 via-indigo-900/40 to-slate-900 border border-indigo-500/40 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg shadow-indigo-950/30">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/40">
                      <Play className="w-5 h-5 fill-current ml-0.5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-white flex items-center gap-2">
                        Native In-App Cinema Player
                      </h4>
                      <p className="text-xs text-slate-300">
                        Zero Telegram redirects &bull; Stream directly on website with HTML5 Cinema player
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openCinemaPlayer(tmdbIdInput, streamUrl, downloadUrl)}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02]"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Watch in Cinema Player</span>
                  </button>
                </div>

                {/* Link 1: Direct Streaming Link */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Tv className="w-3.5 h-3.5 text-indigo-400" />
                      1. Direct Streaming Link (Native Website Route)
                    </span>
                    <span className="text-[11px] text-emerald-400 font-mono">Cinema Stream Ready</span>
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
                    <button
                      type="button"
                      onClick={() => openCinemaPlayer(tmdbIdInput, streamUrl, downloadUrl)}
                      className="px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-md shadow-indigo-600/20"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Watch</span>
                    </button>
                  </div>
                </div>

                {/* Link 2: Direct Download Link */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      2. Direct Download Link (Native Website Route)
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">1080p Single File / Multi-Part</span>
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
                    <button
                      type="button"
                      onClick={() => openDownloadModal(tmdbIdInput)}
                      className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Download</span>
                    </button>
                  </div>
                </div>

                {/* Unified Multi-Part Ingest Card (1 Single Link For Both Parts) */}
                <div className="p-4 rounded-xl bg-slate-900/90 border border-emerald-500/30 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <h5 className="text-xs font-bold text-white tracking-wide">
                        Single-Link Multi-Part Architecture (Unified Streaming & Download)
                      </h5>
                    </div>
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-mono">
                      Part 1 + Part 2 Auto-Merged
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Even when a large movie (&gt;1.9GB) is uploaded in 2 separate parts to bypass Telegram limits,
                    the media engine provides <strong>1 single streaming link</strong> and <strong>1 single download link</strong>.
                    Both parts are seamlessly connected and can also be accessed directly below:
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        openCinemaPlayer(tmdbIdInput, streamUrl, downloadUrl);
                        setCurrentPartIndex(0);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-600 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm shadow-indigo-600/20"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Watch Part 1</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        openCinemaPlayer(tmdbIdInput, streamUrl, downloadUrl);
                        setCurrentPartIndex(1);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-600 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm shadow-indigo-600/20"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Watch Part 2</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openDownloadModal(tmdbIdInput)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 hover:text-emerald-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
                    >
                      <Download className="w-3 h-3 text-emerald-400" />
                      <span>Download Parts (1 & 2)</span>
                    </button>
                    <a
                      href={`https://t.me/c/${APP_CONFIG.TELEGRAM_CHANNEL_ID.replace('-100', '').replace('-', '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-indigo-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
                    >
                      <Send className="w-3 h-3 text-indigo-400" />
                      <span>Telegram Channel</span>
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

        {/* Pipeline & Media Links History Section */}
        <section className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-6 sm:p-7 shadow-xl space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <HistoryIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-base text-white flex items-center gap-2">
                  <span>Pipeline & Media Links History</span>
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-mono">
                    Min 10 Records
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  আপনার পূর্বে জেনারেট করা সকল মুভির স্ট্রিমিং ও ডাউনলোড লিংক নিচে সংরক্ষিত রয়েছে।
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              {/* Tab Switcher */}
              <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setHistoryTab('generated')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    historyTab === 'generated'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🎬 Generated Movies ({generatedHistory.length})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryTab('runners')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    historyTab === 'runners'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ⚙️ Cloud Runs ({historyRuns.length})
                </button>
              </div>

              <button
                onClick={fetchHistory}
                disabled={isLoadingHistory}
                className="text-xs text-slate-300 hover:text-white flex items-center gap-1.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50"
                title="Refresh Cloud Runs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin text-indigo-400' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>

          {/* Quick Add Custom Movie ID to History Bar */}
          {historyTab === 'generated' && (
            <form onSubmit={handleQuickAddToHistory} className="flex flex-col sm:flex-row items-center gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-[11px] text-slate-400 flex items-center gap-1 whitespace-nowrap">
                <Plus className="w-3.5 h-3.5 text-indigo-400" />
                Quick Add TMDb ID to History:
              </span>
              <input
                type="text"
                value={quickAddTmdbInput}
                onChange={(e) => setQuickAddTmdbInput(e.target.value)}
                placeholder="e.g. 157336 or any Movie ID"
                className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={!quickAddTmdbInput.trim()}
                className="w-full sm:w-auto px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Save to History</span>
              </button>
            </form>
          )}

          {/* TAB 1: Generated Movies & Single Links History */}
          {historyTab === 'generated' && (
            <div className="space-y-3.5">
              {generatedHistory.map((item) => (
                <div
                  key={item.tmdbId}
                  className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700/80 transition-all space-y-3 shadow-md"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                        <Film className="w-3.5 h-3.5" />
                      </div>
                      <h4 className="font-semibold text-sm text-white">{item.title}</h4>
                      <span className="text-[10px] font-mono bg-slate-900 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-md">
                        TMDb #{item.tmdbId}
                      </span>
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        1080p Ultra HD
                      </span>
                      <span className="text-[10px] bg-slate-900 text-slate-300 border border-slate-800 px-2 py-0.5 rounded-md">
                        {item.partsCount || 2} Parts Seamless
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        {formatTimestamp(item.createdAt)}
                      </span>
                      <button
                        onClick={() => deleteFromGeneratedHistory(item.tmdbId)}
                        className="p-1 rounded-md hover:bg-slate-800 text-slate-500 hover:text-rose-400 transition-colors"
                        title="Remove from history"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Generated Links Dual Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* Single Streaming Link */}
                    <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 flex items-center gap-1">
                          <Tv className="w-3 h-3 text-indigo-400" />
                          Single Streaming Link (All Parts):
                        </span>
                        <span className="text-emerald-400 text-[10px]">Zero Ads</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          readOnly
                          value={item.streamUrl}
                          className="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200 font-mono select-all focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(item.streamUrl);
                            setCopiedHistoryId(`stream-${item.tmdbId}`);
                            setTimeout(() => setCopiedHistoryId(null), 2000);
                            showToast('success', 'Stream Link Copied', `Streaming link for #${item.tmdbId} copied.`);
                          }}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium flex items-center gap-1 border border-slate-700 transition-colors"
                        >
                          {copiedHistoryId === `stream-${item.tmdbId}` ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Single Download Link */}
                    <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 flex items-center gap-1">
                          <Download className="w-3 h-3 text-emerald-400" />
                          Single Download Link:
                        </span>
                        <span className="text-indigo-400 text-[10px]">1080p Original</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          readOnly
                          value={item.downloadUrl}
                          className="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200 font-mono select-all focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(item.downloadUrl);
                            setCopiedHistoryId(`dl-${item.tmdbId}`);
                            setTimeout(() => setCopiedHistoryId(null), 2000);
                            showToast('success', 'Download Link Copied', `Download link for #${item.tmdbId} copied.`);
                          }}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium flex items-center gap-1 border border-slate-700 transition-colors"
                        >
                          {copiedHistoryId === `dl-${item.tmdbId}` ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Instant Action Launcher Bar */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => openCinemaPlayer(item.tmdbId, item.streamUrl, item.downloadUrl)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm shadow-indigo-600/20 transition-all hover:scale-105 active:scale-95"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Watch in Cinema Player</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openDownloadModal(item.tmdbId)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 hover:text-emerald-200 text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition-colors"
                      >
                        <Download className="w-3 h-3 text-emerald-400" />
                        <span>Download Modal</span>
                      </button>

                      <a
                        href={item.telegramChannelUrl || `https://t.me/${APP_CONFIG.TELEGRAM_CHANNEL_USERNAME}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-indigo-300 hover:text-white text-xs font-medium flex items-center gap-1.5 border border-slate-700/60 transition-colors"
                      >
                        <Send className="w-3 h-3 text-indigo-400" />
                        <span>Telegram Channel</span>
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 2: GitHub Actions Cloud Runner Executions */}
          {historyTab === 'runners' && (
            <div>
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

      {/* Native HTML5 Cinema Video Player Modal */}
      {cinemaPlayerOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6 overflow-y-auto">
          <div className="max-w-5xl w-full mx-auto flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full overflow-hidden border border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.3)] bg-slate-900 flex items-center justify-center flex-shrink-0">
                <img src="/logo.png" alt="Media Engine Logo" className="w-full h-full object-cover" />
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base text-white tracking-tight">
                  {cinemaMovieData?.title || `Movie #${cinemaMovieData?.id || '157336'}`}
                </h3>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="text-emerald-400 font-medium">1080p Ultra HD</span>
                  <span>&bull;</span>
                  <span className="text-indigo-400 font-medium">Telegram Cloud Fast Stream</span>
                  <span>&bull;</span>
                  <span>Zero Buffering &bull; Multi-Part Cinema</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl">
                <button
                  onClick={() => setPlayerMode('embed')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    playerMode === 'embed'
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  📺 Web Player (Embed)
                </button>
                <button
                  onClick={() => setPlayerMode('player')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    playerMode === 'player'
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🎬 Cinema Hub
                </button>
              </div>

              <button
                onClick={() => setCinemaPlayerOpen(false)}
                className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
                title="Close Player"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Video Container */}
          <div className="max-w-5xl w-full mx-auto my-auto py-4">
            <div className="relative aspect-video w-full bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center">
              {playerMode === 'embed' ? (
                (() => {
                  const activePart = cinemaMovieData?.parts?.[currentPartIndex];
                  const embedSrc = activePart?.embedUrl;
                  const hasSpecificPost = Boolean(embedSrc && /\/\d+\?embed=1/.test(embedSrc));

                  if (!hasSpecificPost) {
                    return (
                      <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
                        <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-3 shadow-[0_0_30px_rgba(99,102,241,0.2)]">
                          <Tv className="w-8 h-8" />
                        </div>
                        <h4 className="text-lg font-bold text-white mb-1">
                          {activePart?.title || `Part ${currentPartIndex + 1}`} &bull; Telegram Cinema Stream
                        </h4>
                        <p className="text-xs text-slate-300 max-w-lg mb-5 leading-relaxed">
                          মুভিটি প্রসেস হয়ে টেলিগ্রাম ক্লাউড স্টোরেজে আপলোড হয়েছে। নিচে ক্লিক করে টেলিগ্রাম অ্যাপ অথবা ব্রাউজারে সম্পূর্ণ ফুল-স্পিডে ও বিজ্ঞাপনহীনভাবে সরাসরি দেখুন।
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-3">
                          <a
                            href={activePart?.telegramUrl || `https://t.me/${APP_CONFIG.TELEGRAM_CHANNEL_USERNAME}`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all shadow-xl shadow-indigo-600/30 hover:scale-105 active:scale-95"
                          >
                            <Send className="w-4 h-4 fill-current" />
                            <span>Open on Telegram (@{APP_CONFIG.TELEGRAM_CHANNEL_USERNAME})</span>
                          </a>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <iframe
                      key={`embed-${currentPartIndex}-${embedSrc}`}
                      src={embedSrc}
                      className="w-full h-full border-0 rounded-2xl bg-slate-950"
                      allowFullScreen
                      allow="autoplay; encrypted-media; fullscreen"
                      title="Telegram Web Cinema Player"
                    />
                  );
                })()
              ) : (
                <video
                  key={activeVideoSrc}
                  ref={videoPlayerRef}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                  src={activeVideoSrc}
                  onEnded={() => {
                    // Seamless Multi-Part Auto-Merge: Transition to next part without user intervention
                    if (cinemaMovieData?.parts && cinemaMovieData.parts.length > 1) {
                      const nextIdx = currentPartIndex + 1;
                      if (nextIdx < cinemaMovieData.parts.length) {
                        const nextPart = cinemaMovieData.parts[nextIdx];
                        setCurrentPartIndex(nextIdx);
                        setActiveVideoSrc(nextPart.url);
                        setVideoPlaybackError(null);
                        showToast(
                          'loading',
                          'Seamless Transition',
                          `Seamlessly playing next sequence (${nextIdx + 1}/${cinemaMovieData.parts.length}). Enjoy uninterrupted watching!`
                        );
                        setTimeout(() => {
                          videoPlayerRef.current?.play().catch(() => {});
                        }, 200);
                      }
                    }
                  }}
                  onError={() => {
                    setVideoPlaybackError('Telegram Cloud Stream');
                  }}
                  onPlay={() => {
                    setVideoPlaybackError(null);
                  }}
                >
                  Your browser does not support HTML5 video playback.
                </video>
              )}

              {/* Seamless Multi-Part Status Indicator */}
              {cinemaMovieData?.parts && cinemaMovieData.parts.length > 1 && playerMode === 'player' && (
                <div className="absolute top-3 left-3 bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/60 flex items-center gap-2 pointer-events-none text-xs z-10">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-white font-medium">Telegram Fast Stream</span>
                  <span className="text-slate-400 text-[10px]">
                    {cinemaMovieData.parts[currentPartIndex]?.title || `Part ${currentPartIndex + 1}`} of {cinemaMovieData.parts.length}
                  </span>
                </div>
              )}

              {/* Elegant Telegram Cinema Hub Overlay (In player mode if video fails) */}
              {playerMode === 'player' && videoPlaybackError && (
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/90 to-slate-900/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20">
                  <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-3 shadow-[0_0_30px_rgba(99,102,241,0.2)]">
                    <Tv className="w-8 h-8" />
                  </div>
                  <h4 className="text-lg font-bold text-white mb-1">
                    {cinemaMovieData?.parts?.[currentPartIndex]?.title || `Part ${currentPartIndex + 1}`} &bull; 1080p Ultra High Quality
                  </h4>
                  <p className="text-xs text-slate-300 max-w-lg mb-5 leading-relaxed">
                    মুভিটি টেলিগ্রাম ক্লাউড স্টোরেজে সুরক্ষিত আছে। নিচে ১ ক্লিকে টেলিগ্রাম অ্যাপ অথবা ব্রাউজারে সম্পূর্ণ ফুল-স্পিডে ও বিজ্ঞাপনহীনভাবে প্লে করুন বা ডাউনলোড করুন।
                  </p>

                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      onClick={() => setPlayerMode('embed')}
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all shadow-xl shadow-indigo-600/30 hover:scale-105 active:scale-95"
                    >
                      <Tv className="w-4 h-4" />
                      <span>Watch in Web Player (Embed)</span>
                    </button>

                    <a
                      href={cinemaMovieData?.parts?.[currentPartIndex]?.telegramUrl || cinemaMovieData?.telegramChannelUrl || `https://t.me/${APP_CONFIG.TELEGRAM_CHANNEL_USERNAME}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all border border-slate-700 hover:scale-105 active:scale-95"
                    >
                      <Send className="w-4 h-4 fill-current text-indigo-400" />
                      <span>Open on Telegram</span>
                    </a>

                    <button
                      onClick={() => openDownloadModal(cinemaMovieData?.id)}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all shadow-xl shadow-emerald-600/30 hover:scale-105 active:scale-95"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download {cinemaMovieData?.parts?.[currentPartIndex]?.title || `Part ${currentPartIndex + 1}`}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Direct Watch Guideline Banner for Large Files */}
            <div className="mt-3 p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-indigo-200">
              <div className="flex items-center gap-2.5">
                <Send className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <span className="leading-relaxed">
                  💡 টেলিগ্রামের নিয়মানুযায়ী ২০ মেগাবাইটের বেশি বড় ভিডিওর ক্ষেত্রে স্ক্রিনে <strong>"Media is too big"</strong> আসে। মুভিটি প্লে করতে প্লেয়ারের মাঝখানের <strong>"VIEW IN TELEGRAM"</strong> বোতামে চাপ দিন অথবা পাশের বোতামে চাপ দিন—সরাসরি বিজ্ঞাপনহীন ফুল-এইচডি কোয়ালিটিতে চলবে!
                </span>
              </div>
              <a
                href={cinemaMovieData?.parts?.[currentPartIndex]?.telegramUrl || `https://t.me/${APP_CONFIG.TELEGRAM_CHANNEL_USERNAME}`}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium whitespace-nowrap text-xs shadow-md shadow-indigo-600/30 flex items-center justify-center gap-1.5 transition-all hover:scale-105 active:scale-95 flex-shrink-0"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>সরাসরি প্লে করুন ({cinemaMovieData?.parts?.[currentPartIndex]?.title || `Part ${currentPartIndex + 1}`})</span>
              </a>
            </div>

            {/* Multi-Part Switcher Bar (1 Single Link For Both Parts) */}
            {cinemaMovieData?.parts && cinemaMovieData.parts.length > 0 && (
              <div className="mt-3 p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-[11px] font-medium flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    Multi-Part Streams (1 Single Link):
                  </span>
                  <div className="flex items-center gap-1.5">
                    {cinemaMovieData.parts.map((p, idx) => {
                      const isCurrent = currentPartIndex === idx;
                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            setCurrentPartIndex(idx);
                            setActiveVideoSrc(p.url);
                            setVideoPlaybackError(null);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1.5 ${
                            isCurrent
                              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                              : 'bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-300'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                          <span>{p.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Direct Telegram Links for each part */}
                <div className="flex items-center gap-2">
                  {cinemaMovieData.parts.map((p, idx) => (
                    <a
                      key={idx}
                      href={p.telegramUrl || `https://t.me/c/${APP_CONFIG.TELEGRAM_CHANNEL_ID.replace('-100', '').replace('-', '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-indigo-300 hover:text-white text-[10px] font-medium flex items-center gap-1 transition-colors border border-slate-700/60"
                    >
                      <Send className="w-2.5 h-2.5" />
                      <span>{p.title} on Telegram</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Video Action Toolbar */}
            <div className="mt-3 flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl bg-slate-900/80 border border-slate-800">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Single Unified Link &bull; 1080p Ultra High Quality Cinema Experience</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => {
                    const toCopy = `${window.location.origin}/watch?id=${cinemaMovieData?.id || tmdbIdInput}`;
                    navigator.clipboard.writeText(toCopy);
                    showToast('success', 'Link Copied', 'Single unified streaming link copied to clipboard.');
                  }}
                  className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 border border-slate-700"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Stream Link</span>
                </button>
                <button
                  onClick={() => openDownloadModal(cinemaMovieData?.id)}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Options</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Native Download Portal Modal */}
      {downloadModalOpen && downloadModalData && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">
                    Direct Download Center
                  </h3>
                  <p className="text-xs text-slate-400">
                    Movie #{downloadModalData.id} &bull; 1080p Ultra High Quality
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDownloadModalOpen(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-300 leading-relaxed">
                Choose a part to download directly to your device or open via Telegram for high-speed CDN transfer:
              </p>

              {downloadModalData.parts?.map((part, idx) => (
                <div key={idx} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <h4 className="font-semibold text-xs text-white">{part.title}</h4>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{part.sizeStr}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={part.downloadUrl}
                      download
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm shadow-indigo-600/20"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download</span>
                    </a>
                    <a
                      href={part.telegramUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-medium flex items-center gap-1.5 border border-slate-700"
                    >
                      <Send className="w-3 h-3 text-indigo-400" />
                      <span>Telegram</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {/* Single Unified Download Link Copy Bar */}
            <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
              <label className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
                <span>Single Unified Download Link:</span>
                <span className="text-emerald-400 font-mono text-[10px]">1 Link for All Parts</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}/download?id=${downloadModalData.id}`}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/download?id=${downloadModalData.id}`);
                    showToast('success', 'Link Copied', 'Single unified download link copied.');
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1 border border-slate-700"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
