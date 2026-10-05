import React, { useState, useEffect, useRef } from 'react';
import {
  Film,
  Download,
  Copy,
  Check,
  Play,
  Zap,
  Radio,
  ExternalLink,
  Code2,
  Sparkles,
  X,
  AlertCircle,
  FileVideo,
  Layers,
  HardDrive
} from 'lucide-react';

interface LinkProcessorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCinemaPlayer: (url: string, title?: string, isP2P?: boolean) => void;
}

export const LinkProcessorModal: React.FC<LinkProcessorModalProps> = ({
  isOpen,
  onClose,
  onOpenCinemaPlayer
}) => {
  const [inputUrl, setInputUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{
    type: string;
    engine: string;
    title: string;
    size?: string;
    watchUrl: string;
    downloadUrl: string;
    shareableUrl: string;
    isP2P?: boolean;
    features?: string[];
  } | null>(null);

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'processor' | 'webtorrent' | 'code'>('processor');

  // WebTorrent in-browser state
  const [torrentStatus, setTorrentStatus] = useState<string>('idle');
  const [torrentProgress, setTorrentProgress] = useState<number>(0);
  const [torrentSpeed, setTorrentSpeed] = useState<string>('0 KB/s');
  const [torrentPeers, setTorrentPeers] = useState<number>(0);
  const [torrentError, setTorrentError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const clientRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (clientRef.current) {
        try {
          clientRef.current.destroy();
        } catch (_) {}
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const processLink = async (urlToProcess?: string) => {
    const rawUrl = (urlToProcess || inputUrl).trim();
    if (!rawUrl) return;

    setIsProcessing(true);
    setTorrentError(null);

    try {
      // Call our Vercel Serverless processor endpoint
      let processedData: any = null;
      try {
        const resp = await fetch('/api/process-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: rawUrl })
        });
        if (resp.ok) {
          processedData = await resp.json();
        }
      } catch (_) {}

      // Fallback client-side processor if API isn't reached
      if (!processedData) {
        if (rawUrl.startsWith('magnet:?')) {
          const dnMatch = rawUrl.match(/dn=([^&]+)/);
          processedData = {
            type: 'webtorrent',
            engine: 'WebTorrent (P2P In-Browser)',
            title: dnMatch ? decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')) : 'P2P Movie Stream',
            watchUrl: rawUrl,
            downloadUrl: rawUrl,
            isP2P: true,
            features: ['P2P WebRTC Streaming', 'No Server Bandwidth Used', 'Direct Browser Render']
          };
        } else if (rawUrl.includes('pixeldrain.com')) {
          const match = rawUrl.match(/pixeldrain\.com\/(?:u|api\/file)\/([a-zA-Z0-9_-]+)/);
          const id = match ? match[1] : '';
          processedData = {
            type: 'pixeldrain',
            engine: 'Pixeldrain Ultra-Speed CDN',
            title: `Pixeldrain Movie (${id})`,
            watchUrl: `https://pixeldrain.com/api/file/${id}`,
            downloadUrl: `https://pixeldrain.com/api/file/${id}?download`,
            supportsRange: true,
            features: ['Instant Seek (206 Range Stream)', 'Gigabit Download Speed', 'CORS Enabled']
          };
        } else {
          processedData = {
            type: 'direct',
            engine: 'HTML5 Cinema Player Gateway',
            title: 'Direct Video Stream',
            watchUrl: rawUrl,
            downloadUrl: rawUrl,
            features: ['HTML5 Video Player', 'Direct Download Trigger']
          };
        }
      }

      // Generate shareable watch URL
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://myserver-sage.vercel.app';
      const shareUrl = `${origin}/?stream=${encodeURIComponent(processedData.watchUrl)}&title=${encodeURIComponent(processedData.title)}&type=${processedData.type}`;

      setResult({
        ...processedData,
        shareableUrl: shareUrl
      });

      // If it's a torrent/magnet, offer WebTorrent player
      if (processedData.isP2P || rawUrl.startsWith('magnet:?')) {
        setActiveTab('processor');
      }
    } catch (e: any) {
      alert('Failed to process link: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const startWebTorrentPlayback = (magnetUri: string) => {
    setActiveTab('webtorrent');
    setTorrentStatus('initializing');
    setTorrentError(null);

    // Dynamically load WebTorrent from CDN if not already loaded
    const loadScript = () => {
      return new Promise<void>((resolve, reject) => {
        if ((window as any).WebTorrent) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load WebTorrent browser library'));
        document.head.appendChild(script);
      });
    };

    loadScript().then(() => {
      try {
        if (clientRef.current) {
          clientRef.current.destroy();
        }

        const WebTorrent = (window as any).WebTorrent;
        const client = new WebTorrent();
        clientRef.current = client;

        setTorrentStatus('connecting');

        client.add(magnetUri, (torrent: any) => {
          setTorrentStatus('streaming');

          // Find playable video file
          const file = torrent.files.find((f: any) => {
            return f.name.endsWith('.mp4') || f.name.endsWith('.mkv') || f.name.endsWith('.webm') || f.name.endsWith('.avi');
          }) || torrent.files[0];

          if (file && videoRef.current) {
            file.renderTo(videoRef.current, { autoplay: true });
          }

          torrent.on('download', () => {
            setTorrentProgress(Math.round(torrent.progress * 100));
            setTorrentSpeed((torrent.downloadSpeed / 1024 / 1024).toFixed(2) + ' MB/s');
            setTorrentPeers(torrent.numPeers);
          });
        });

        client.on('error', (err: any) => {
          setTorrentError(err.message || 'WebTorrent client error');
          setTorrentStatus('error');
        });
      } catch (err: any) {
        setTorrentError(err.message);
        setTorrentStatus('error');
      }
    }).catch(err => {
      setTorrentError(err.message);
      setTorrentStatus('error');
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-base text-white flex items-center gap-2">
                Cloud Link Processor & Streamer
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded-full border border-emerald-500/30">
                  Vercel Ready
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                ইনপুট লিংক দিলে স্বয়ংক্রিয়ভাবে Watch Link ও Download Link তৈরি করে
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-slate-800 bg-slate-950/40">
          <button
            onClick={() => setActiveTab('processor')}
            className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'processor'
                ? 'bg-slate-900 text-emerald-400 border-t-2 border-emerald-500'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Link Converter
          </button>
          <button
            onClick={() => setActiveTab('webtorrent')}
            className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'webtorrent'
                ? 'bg-slate-900 text-cyan-400 border-t-2 border-cyan-500'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            WebTorrent P2P Player
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'code'
                ? 'bg-slate-900 text-indigo-400 border-t-2 border-indigo-500'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            Code & Setup Guide
          </button>
        </div>

        {/* Tab 1: Link Processor */}
        {activeTab === 'processor' && (
          <div className="p-6 space-y-5 overflow-y-auto">
            {/* Input Box */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                <span>Enter 3rd-Party Download Link বা Magnet Link:</span>
                <span className="text-[10px] text-slate-500 font-mono">Supports: Pixeldrain, Magnet, Torrent, MP4, Gofile</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="e.g. https://pixeldrain.com/u/EA62BtD8 অথবা magnet:?xt=urn:btih:..."
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => processLink()}
                  disabled={isProcessing || !inputUrl.trim()}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-emerald-950/40 flex-shrink-0"
                >
                  {isProcessing ? (
                    <span className="animate-spin text-base">⟳</span>
                  ) : (
                    <Zap className="w-3.5 h-3.5" />
                  )}
                  <span>{isProcessing ? 'Processing...' : 'Process Link'}</span>
                </button>
              </div>

              {/* Quick sample pills */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] text-slate-500">Quick Test:</span>
                <button
                  onClick={() => {
                    const test = 'https://pixeldrain.com/u/EA62BtD8';
                    setInputUrl(test);
                    processLink(test);
                  }}
                  className="text-[11px] px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors"
                >
                  ⚡ Pixeldrain 480p Sample
                </button>
                <button
                  onClick={() => {
                    const test = 'magnet:?xt=urn:btih:08ada5a7a6183aae1e09be831df674f7e60f1352&dn=Sintel&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com';
                    setInputUrl(test);
                    processLink(test);
                  }}
                  className="text-[11px] px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors"
                >
                  🧲 Sintel Magnet (P2P)
                </button>
                <button
                  onClick={() => {
                    const test = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
                    setInputUrl(test);
                    processLink(test);
                  }}
                  className="text-[11px] px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors"
                >
                  🎬 Big Buck Bunny (Direct MP4)
                </button>
              </div>
            </div>

            {/* Result Cards */}
            {result && (
              <div className="space-y-4 pt-2 border-t border-slate-800/80 animate-in fade-in duration-200">
                {/* File / Engine Info Banner */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
                      <FileVideo className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-sm text-white truncate">{result.title}</h4>
                      <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        <span className="text-emerald-400 font-mono text-[11px]">{result.engine}</span>
                        {result.size && <span>• Size: {result.size}</span>}
                      </p>
                    </div>
                  </div>
                  {result.isP2P && (
                    <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2 py-1 rounded-md font-mono flex items-center gap-1">
                      <Radio className="w-3 h-3 animate-pulse" /> P2P WebTorrent
                    </span>
                  )}
                </div>

                {/* Output 1: WATCH LINK */}
                <div className="bg-slate-950/70 border border-emerald-500/30 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                      <Film className="w-3.5 h-3.5" />
                      ১. ভিডিও দেখার লিংক (Watch Link)
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">HTML5 / P2P Streaming</span>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
                    <input
                      type="text"
                      readOnly
                      value={result.watchUrl}
                      className="flex-1 bg-transparent text-xs text-slate-300 font-mono focus:outline-none truncate"
                    />
                    <button
                      onClick={() => handleCopy(result.watchUrl, 'watch')}
                      className="text-slate-400 hover:text-white p-1"
                      title="Copy Watch Link"
                    >
                      {copiedField === 'watch' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    {result.isP2P ? (
                      <button
                        onClick={() => startWebTorrentPlayback(result.watchUrl)}
                        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Play in WebTorrent (P2P Player)
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          onOpenCinemaPlayer(result.watchUrl, result.title, false);
                          onClose();
                        }}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Play in Cinema Player
                      </button>
                    )}
                    <a
                      href={result.watchUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors flex items-center gap-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open Direct Stream
                    </a>
                  </div>
                </div>

                {/* Output 2: DOWNLOAD LINK */}
                <div className="bg-slate-950/70 border border-indigo-500/30 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-indigo-400 flex items-center gap-1.5">
                      <Download className="w-3.5 h-3.5" />
                      ২. ডাউনলোড লিংক (Download Link)
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">One-Click Direct Download</span>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
                    <input
                      type="text"
                      readOnly
                      value={result.downloadUrl}
                      className="flex-1 bg-transparent text-xs text-slate-300 font-mono focus:outline-none truncate"
                    />
                    <button
                      onClick={() => handleCopy(result.downloadUrl, 'download')}
                      className="text-slate-400 hover:text-white p-1"
                      title="Copy Download Link"
                    >
                      {copiedField === 'download' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <a
                      href={result.downloadUrl}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download File Now
                    </a>
                  </div>
                </div>

                {/* Output 3: SHAREABLE URL */}
                <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                  <div className="min-w-0 pr-3">
                    <span className="text-[11px] font-medium text-slate-400">Shareable Player Link for Visitors:</span>
                    <p className="text-xs text-slate-500 font-mono truncate">{result.shareableUrl}</p>
                  </div>
                  <button
                    onClick={() => handleCopy(result.shareableUrl, 'share')}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg flex items-center gap-1 transition-colors flex-shrink-0"
                  >
                    {copiedField === 'share' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    Copy Share Link
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: WebTorrent P2P Player */}
        {activeTab === 'webtorrent' && (
          <div className="p-6 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Radio className="w-4 h-4 text-cyan-400" />
                  WebTorrent Client-Side P2P Engine
                </h3>
                <p className="text-xs text-slate-400">
                  ব্রাউজারে সরাসরি WebRTC দিয়ে ডাউনলোড ও প্লে হয় (Vercel সার্ভারের কোনো ব্যান্ডউইথ খরচ হয় না)
                </p>
              </div>
            </div>

            {/* Video Container */}
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
              <video
                ref={videoRef}
                controls
                playsInline
                className="w-full h-full object-contain"
              />
              {torrentStatus === 'idle' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 text-center p-4">
                  <Radio className="w-12 h-12 text-slate-600 mb-2" />
                  <p className="text-sm text-slate-300 font-medium">No Torrent Streaming Currently</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    একটি Magnet লিংক দিয়ে "Play in WebTorrent" চাপলে এখানে ব্রাউজারেই সরাসরি লাইভ প্লে হবে।
                  </p>
                  <button
                    onClick={() => {
                      const sintel = 'magnet:?xt=urn:btih:08ada5a7a6183aae1e09be831df674f7e60f1352&dn=Sintel&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com';
                      setInputUrl(sintel);
                      startWebTorrentPlayback(sintel);
                    }}
                    className="mt-3 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Test Sintel Open Movie (P2P)
                  </button>
                </div>
              )}
              {torrentStatus === 'connecting' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 text-center p-4">
                  <div className="animate-spin text-cyan-400 text-2xl mb-2">⟳</div>
                  <p className="text-sm text-white font-medium">Connecting to WebRTC Trackers & Peers...</p>
                  <p className="text-xs text-cyan-300 font-mono mt-1">Connecting to WebTorrent Swarm</p>
                </div>
              )}
            </div>

            {/* P2P Live Stats */}
            {torrentStatus === 'streaming' && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                  <span className="text-[10px] text-slate-400">Download Speed</span>
                  <p className="text-base font-bold text-emerald-400 font-mono">{torrentSpeed}</p>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                  <span className="text-[10px] text-slate-400">Connected Peers</span>
                  <p className="text-base font-bold text-cyan-400 font-mono">{torrentPeers} peers</p>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                  <span className="text-[10px] text-slate-400">Buffer Progress</span>
                  <p className="text-base font-bold text-indigo-400 font-mono">{torrentProgress}%</p>
                </div>
              </div>
            )}

            {torrentError && (
              <div className="bg-rose-950/50 border border-rose-800/60 rounded-xl p-3 flex items-center gap-2 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{torrentError}</span>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Complete Standalone Code & Guide */}
        {activeTab === 'code' && (
          <div className="p-6 space-y-4 overflow-y-auto text-xs">
            <div>
              <h3 className="text-sm font-semibold text-white">Vercel Deployment & Code Guide</h3>
              <p className="text-xs text-slate-400">
                এই কোডটি আপনি যেকোনো সাধারণ HTML ফাইলে বা Vercel প্রজেক্টে হুবহু কপি করে ব্যবহার করতে পারবেন।
              </p>
            </div>

            {/* Architecture Explanation */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
              <h4 className="font-semibold text-emerald-400 flex items-center gap-1.5">
                <Layers className="w-4 h-4" />
                Vercel-এ ফ্রিতে কেন কোনো সমস্যা হবে না?
              </h4>
              <p className="text-slate-300 leading-relaxed">
                ১. <strong>Vercel লিমিটেশন এড়িয়ে চলা:</strong> Vercel-এর সার্ভারলেস ফাংশনে ৫ মেগাবাইটের বেশি ফাইল স্ট্রিম করলে টাইমআউট হয়। তাই আমরা ভিডিও ফাইল Vercel দিয়ে পাস করাই না।
                <br />
                ২. <strong>WebTorrent P2P:</strong> টরেন্ট/ম্যাগনেট লিংক সরাসরি ইউজারের ব্রাউজারে WebRTC এর মাধ্যমে অন্য পিয়ারদের থেকে ভিডিও স্ট্রিম করে।
                <br />
                ৩. <strong>Cloud CDN (Pixeldrain/Gofile):</strong> ক্লাউড হোস্টিংয়ের ডিরেক্ট API ব্যবহার করে সরাসরি ব্রাউজারে Range Request দিয়ে ভিডিও চলে।
              </p>
            </div>

            {/* Code Box */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                <span className="font-mono text-[11px] text-slate-400">index.html (Complete Standalone Code)</span>
                <button
                  onClick={() => {
                    const code = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Vercel Free Movie Link Processor & P2P Streamer</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- WebTorrent Browser Library -->
  <script src="https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js"></script>
</head>
<body class="bg-slate-950 text-white p-6 font-sans">
  <div class="max-w-2xl mx-auto space-y-6">
    <h1 class="text-2xl font-bold text-emerald-400">Movie Link Processor</h1>
    
    <!-- Input Field -->
    <div class="flex gap-2">
      <input id="linkInput" type="text" placeholder="Paste Pixeldrain, Magnet or Direct link" class="flex-1 bg-slate-900 border border-slate-700 p-3 rounded-lg text-sm" />
      <button onclick="processLink()" class="bg-emerald-600 px-5 py-3 rounded-lg font-bold">Process</button>
    </div>

    <!-- Output Box -->
    <div id="outputBox" class="hidden space-y-4 bg-slate-900 p-5 rounded-xl border border-slate-800">
      <div>
        <label class="text-xs text-emerald-400 font-semibold">1. Watch Link (ভিডিও দেখার লিংক):</label>
        <div class="flex gap-2 mt-1">
          <input id="watchUrl" readonly class="flex-1 bg-slate-950 p-2 rounded text-xs font-mono" />
          <button onclick="playVideo()" class="bg-cyan-600 px-3 py-1 rounded text-xs font-bold">Play Now</button>
        </div>
      </div>
      <div>
        <label class="text-xs text-indigo-400 font-semibold">2. Download Link (ডাউনলোড লিংক):</label>
        <div class="flex gap-2 mt-1">
          <input id="downloadUrl" readonly class="flex-1 bg-slate-950 p-2 rounded text-xs font-mono" />
          <a id="downloadBtn" download class="bg-indigo-600 px-3 py-1 rounded text-xs font-bold flex items-center">Download</a>
        </div>
      </div>
    </div>

    <!-- Video Player -->
    <video id="player" controls class="w-full aspect-video bg-black rounded-xl hidden"></video>
  </div>

  <script>
    let currentLink = '';
    let isMagnet = false;

    function processLink() {
      const url = document.getElementById('linkInput').value.trim();
      if (!url) return;
      currentLink = url;

      let watch = url;
      let download = url;

      if (url.startsWith('magnet:?')) {
        isMagnet = true;
      } else if (url.includes('pixeldrain.com')) {
        isMagnet = false;
        const id = url.split('/u/')[1] || url.split('/file/')[1];
        watch = 'https://pixeldrain.com/api/file/' + id;
        download = 'https://pixeldrain.com/api/file/' + id + '?download';
      }

      document.getElementById('watchUrl').value = watch;
      document.getElementById('downloadUrl').value = download;
      document.getElementById('downloadBtn').href = download;
      document.getElementById('outputBox').classList.remove('hidden');
    }

    function playVideo() {
      const player = document.getElementById('player');
      player.classList.remove('hidden');

      if (isMagnet) {
        const client = new WebTorrent();
        client.add(currentLink, torrent => {
          const file = torrent.files.find(f => f.name.endsWith('.mp4') || f.name.endsWith('.mkv')) || torrent.files[0];
          file.renderTo(player, { autoplay: true });
        });
      } else {
        player.src = document.getElementById('watchUrl').value;
        player.play();
      }
    }
  </script>
</body>
</html>`;
                    navigator.clipboard.writeText(code);
                    handleCopy(code, 'standalone');
                  }}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] flex items-center gap-1"
                >
                  {copiedField === 'standalone' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy Full Code
                </button>
              </div>
              <pre className="p-4 text-[11px] text-slate-300 font-mono overflow-x-auto max-h-56">
{`<!-- WebTorrent Library CDN -->
<script src="https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js"></script>

// 1. Pixeldrain Link Conversion
const fileId = url.split('/u/')[1];
const watchUrl = 'https://pixeldrain.com/api/file/' + fileId;
const downloadUrl = 'https://pixeldrain.com/api/file/' + fileId + '?download';

// 2. WebTorrent In-Browser P2P Player (Zero Vercel Server Cost)
const client = new WebTorrent();
client.add(magnetUri, torrent => {
  const file = torrent.files.find(f => f.name.endsWith('.mp4'));
  file.renderTo(videoElement, { autoplay: true });
});`}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
