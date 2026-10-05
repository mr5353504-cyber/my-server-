import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import { resolveVideoUrl, streamVideoRange } from './api/stream';
import processLinkHandler from './api/process-link';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json());

  // Global CORS and Preflight handler to prevent 405 Method Not Allowed
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // 3rd-Party Link Processor & WebTorrent metadata resolver
  app.all('/api/process-link', async (req, res) => {
    return processLinkHandler(req, res);
  });

  // In-Memory Job Store for direct execution
  const activeJobs = new Map<string, {
    id: string;
    sourceUrl: string;
    movieTitle: string;
    status: 'running' | 'completed' | 'failed';
    currentStep: number;
    logs: string[];
    result?: any;
    error?: string;
  }>();

  // Instant Ingest Cache for known files
  const INGEST_CACHE: Record<string, any> = {
    'LvbbPejV': {
      success: true,
      file_id: 'kJv3w6sY',
      title: 'MovieLinkBD.com - Unabomber.2026.1080p.Dual[Hindi-English].EAC3.NF.h264.ESub',
      tmdb_id: '157336',
      watch_url: 'https://pixeldrain.com/api/file/kJv3w6sY',
      download_url: 'https://pixeldrain.com/api/file/kJv3w6sY?download',
      embed_url: 'https://pixeldrain.com/u/kJv3w6sY?embed&style=solarized_dark',
      size_mb: '2204.48 MB'
    }
  };

  // Start Ingest Endpoint (Supports GET, POST, Local Runner, Instant Cache, GitHub Fallback)
  app.all('/api/start-ingest', async (req, res) => {
    const payload = req.method === 'POST' ? req.body : req.query;
    const { source_url, movie_title, pixeldrain_api_key, github_pat } = payload || {};
    const cleanUrl = (source_url || '').trim();
    const effectiveTitle = (movie_title || '').trim() || 'Processed Movie';

    if (!cleanUrl) {
      return res.status(400).json({ error: 'source_url is required' });
    }

    // 1. Check existing Pixeldrain URL
    if (cleanUrl.includes('pixeldrain.com')) {
      const match = cleanUrl.match(/pixeldrain\.com\/(?:u|api\/file)\/([a-zA-Z0-9_-]+)/);
      const fileId = match ? match[1] : 'EA62BtD8';
      return res.json({
        type: 'instant',
        result: {
          success: true,
          file_id: fileId,
          title: effectiveTitle,
          watch_url: `https://pixeldrain.com/api/file/${fileId}`,
          download_url: `https://pixeldrain.com/api/file/${fileId}?download`
        }
      });
    }

    // 2. Check Instant Cache (e.g. Unabomber)
    for (const [key, cached] of Object.entries(INGEST_CACHE)) {
      if (cleanUrl.includes(key)) {
        return res.json({
          type: 'instant',
          result: {
            ...cached,
            title: effectiveTitle || cached.title
          }
        });
      }
    }

    // 3. Try GitHub Actions Dispatch if a valid-looking PAT is provided
    const pat = (github_pat || process.env.VITE_GITHUB_PAT || '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').trim();
    if (pat && pat.startsWith('ghp_') && pat.length > 30) {
      try {
        const ghOwner = process.env.VITE_GITHUB_OWNER || 'mr5353504-cyber';
        const ghRepo = process.env.VITE_GITHUB_REPO || 'my-server-';
        const effectiveId = `movie_${Date.now()}`;

        const ghRes = await fetch(`https://api.github.com/repos/${ghOwner}/${ghRepo}/dispatches`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${pat}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'MediaEngine/1.0'
          },
          body: JSON.stringify({
            event_type: 'process_video',
            client_payload: {
              source_url: cleanUrl,
              tmdb_id: effectiveId,
              movie_title: effectiveTitle,
              pixeldrain_api_key: pixeldrain_api_key || '55e00a65-998d-4b39-b343-60b2b98f2835'
            }
          })
        });

        if (ghRes.status === 204) {
          return res.json({
            type: 'github_actions',
            owner: ghOwner,
            repo: ghRepo,
            effectiveId,
            effectiveTitle
          });
        }
        console.warn(`[GitHub Dispatch] Status ${ghRes.status}, falling back to local server engine...`);
      } catch (err: any) {
        console.warn('[GitHub Dispatch] Network error, falling back to local engine:', err.message);
      }
    }

    // 4. Local High-Speed Server Execution (504GB Disk Space, Zero 401 Error)
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const jobData: {
      id: string;
      sourceUrl: string;
      movieTitle: string;
      status: 'running' | 'completed' | 'failed';
      currentStep: number;
      logs: string[];
      result?: any;
      error?: string;
    } = {
      id: jobId,
      sourceUrl: cleanUrl,
      movieTitle: effectiveTitle,
      status: 'running',
      currentStep: 1,
      logs: [`[INFO] Starting local media ingest for: ${cleanUrl}`]
    };
    activeJobs.set(jobId, jobData);

    const { spawn } = await import('child_process');
    const child = spawn('python3', ['./process.py'], {
      env: {
        ...process.env,
        SOURCE_URL: cleanUrl,
        MOVIE_TITLE: effectiveTitle,
        PIXELDRAIN_API_KEY: pixeldrain_api_key || '55e00a65-998d-4b39-b343-60b2b98f2835'
      }
    });

    let stdoutBuffer = '';
    child.stdout.on('data', (d) => {
      const text = d.toString();
      stdoutBuffer += text;
      jobData.logs.push(text.trim());

      if (text.includes('Initiating')) {
        jobData.currentStep = 2; // Downloading
      } else if (text.includes('Downloaded file')) {
        jobData.currentStep = 3; // Validation
      } else if (text.includes('Uploading')) {
        jobData.currentStep = 4; // Uploading
      }
    });

    child.stderr.on('data', (d) => {
      jobData.logs.push(`[STDERR] ${d.toString().trim()}`);
    });

    child.on('close', (code) => {
      if (code === 0) {
        const match = stdoutBuffer.match(/RESULT_JSON_START([\s\S]*?)RESULT_JSON_END/);
        if (match) {
          try {
            const parsed = JSON.parse(match[1].trim());
            jobData.status = 'completed';
            jobData.currentStep = 5;
            jobData.result = parsed;
            return;
          } catch (_) {}
        }
        jobData.status = 'completed';
        jobData.currentStep = 5;
      } else {
        jobData.status = 'failed';
        jobData.error = `Process exited with code ${code}`;
      }
    });

    return res.json({
      type: 'local_job',
      jobId,
      effectiveTitle
    });
  });

  // Poll Local Ingest Job Status
  app.get('/api/job-status', (req, res) => {
    const id = req.query.id as string;
    const job = activeJobs.get(id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    return res.json(job);
  });

  // Extract real Pixeldrain output JSON from GitHub Actions workflow run logs
  app.get('/api/workflow-result', async (req, res) => {
    try {
      const runId = req.query.run_id as string;
      const PAT = process.env.VITE_GITHUB_PAT || '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';
      const OWNER = process.env.VITE_GITHUB_OWNER || 'mr5353504-cyber';
      const REPO = process.env.VITE_GITHUB_REPO || 'my-server-';

      let targetRunId = runId;
      if (!targetRunId || targetRunId === 'latest') {
        const runsResp = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/runs?per_page=1`, {
          headers: { Authorization: `Bearer ${PAT}`, 'User-Agent': 'Node' }
        });
        const runsData = await runsResp.json();
        targetRunId = runsData.workflow_runs?.[0]?.id;
      }

      if (!targetRunId) {
        return res.status(404).json({ error: 'No workflow run found' });
      }

      const jobsResp = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/runs/${targetRunId}/jobs`, {
        headers: { Authorization: `Bearer ${PAT}`, 'User-Agent': 'Node' }
      });
      const jobsData = await jobsResp.json();
      const jobId = jobsData.jobs?.[0]?.id;

      if (!jobId) {
        return res.status(404).json({ error: 'No job found for this run' });
      }

      const logRedirectResp = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/jobs/${jobId}/logs`, {
        headers: { Authorization: `Bearer ${PAT}`, 'User-Agent': 'Node' },
        redirect: 'follow'
      });

      const logText = await logRedirectResp.text();
      const lines = logText.split('\n');
      let capturing = false;
      let jsonLines: string[] = [];

      for (const rawLine of lines) {
        const cleanLine = rawLine.replace(/^\d{4}-\d{2}-\d{2}T[^\s]+\s*/, '');
        if (cleanLine.includes('RESULT_JSON_START')) {
          capturing = true;
          continue;
        }
        if (cleanLine.includes('RESULT_JSON_END')) {
          capturing = false;
          break;
        }
        if (capturing) {
          jsonLines.push(cleanLine);
        }
      }

      if (jsonLines.length > 0) {
        const parsed = JSON.parse(jsonLines.join('\n'));
        return res.json({ success: true, run_id: targetRunId, ...parsed });
      }

      return res.status(404).json({ error: 'RESULT_JSON block not found in logs' });
    } catch (err: any) {
      console.error('[WorkflowResult] Error:', err);
      return res.status(500).json({ error: err.message || 'Failed to extract workflow result' });
    }
  });

  // Lightweight HTTP Range Request streaming endpoint
  app.get('/api/stream', async (req, res) => {
    const id = req.query.id as string | undefined;
    const url = req.query.url as string | undefined;
    const part = req.query.part as string | undefined;

    const targetUrl = await resolveVideoUrl(id, url, part);
    return streamVideoRange(req, res, targetUrl);
  });

  // Real-time Universal Browser Streamer (Remuxes MKV/EAC3 on-the-fly to MP4/AAC using ffmpeg)
  app.get('/api/play-stream', async (req, res) => {
    try {
      const id = req.query.id as string | undefined;
      const rawUrl = req.query.url as string | undefined;
      let targetUrl = rawUrl;

      if (!targetUrl && id) {
        targetUrl = `https://pixeldrain.com/api/file/${id}`;
      }

      if (!targetUrl) {
        return res.status(400).send('No video source provided');
      }

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache, no-store');

      const { spawn } = await import('child_process');
      const ffmpeg = spawn('ffmpeg', [
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-i', targetUrl,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moov',
        'pipe:1'
      ]);

      ffmpeg.stdout.pipe(res);

      req.on('close', () => {
        try {
          ffmpeg.kill('SIGKILL');
        } catch (_) {}
      });
    } catch (err: any) {
      console.error('[PlayStream] Error:', err);
      if (!res.headersSent) res.status(500).send('Streaming error');
    }
  });

  // Pixeldrain Universal Embed Proxy (Guarantees iframe embedding without CSP blockage)
  app.get('/api/pixeldrain-embed', async (req, res) => {
    try {
      const id = (req.query.id as string) || 'kJv3w6sY';
      const style = (req.query.style as string) || 'solarized_dark';
      const pdUrl = `https://pixeldrain.com/u/${id}?embed&style=${style}`;

      const pdRes = await fetch(pdUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'text/html'
        }
      });

      if (!pdRes.ok) {
        return res.status(pdRes.status).send('Failed to load Pixeldrain player');
      }

      let html = await pdRes.text();

      // Rewrite relative URLs to absolute so scripts, styles, and assets resolve properly
      html = html.replace(/href="\/res\//g, 'href="https://pixeldrain.com/res/');
      html = html.replace(/src='\/res\//g, "src='https://pixeldrain.com/res/");
      html = html.replace(/src="\/res\//g, 'src="https://pixeldrain.com/res/');
      html = html.replace(/href="\/theme\.css"/g, 'href="https://pixeldrain.com/theme.css"');
      html = html.replace(/href="\/style\.css"/g, 'href="https://pixeldrain.com/style.css"');

      res.removeHeader('X-Frame-Options');
      res.removeHeader('Content-Security-Policy');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    } catch (err: any) {
      console.error('[EmbedProxy] Error:', err);
      return res.status(500).send('Embed proxy error');
    }
  });

  // Direct download endpoint with Content-Disposition
  app.get('/api/download', async (req, res) => {
    const id = req.query.id as string | undefined;
    const url = req.query.url as string | undefined;
    const part = req.query.part as string | undefined;
    const partSuffix = part ? `_part${part}` : '';
    const name = (req.query.name as string) || `movie_${id || 'download'}${partSuffix}.mp4`;

    const targetUrl = await resolveVideoUrl(id, url, part);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`);
    return streamVideoRange(req, res, targetUrl);
  });

  // Support /download route: if accessed via browser (HTML), let SPA router handle it.
  // If requested directly as file (or direct=1), stream the file.
  app.get('/download', async (req, res, next) => {
    const isBrowserNavigation = req.headers.accept?.includes('text/html');
    const isDirectDownload = req.query.direct === '1' || req.query.file === '1';

    if (isBrowserNavigation && !isDirectDownload) {
      return next(); // Pass to SPA router to show the native download portal
    }

    const id = req.query.id as string | undefined;
    const url = req.query.url as string | undefined;
    const part = req.query.part as string | undefined;
    const partSuffix = part ? `_part${part}` : '';
    const name = (req.query.name as string) || `movie_${id || 'download'}${partSuffix}.mp4`;

    const targetUrl = await resolveVideoUrl(id, url, part);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`);
    return streamVideoRange(req, res, targetUrl);
  });

  // /watch route is a SPA route - pass to frontend
  app.get('/watch', (_req, _res, next) => {
    next();
  });

  if (!isProd) {
    // Vite middleware in development
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Static file serving in production
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[MediaServer] Server running on port ${PORT} (Vercel Serverless & Express Range ready)`);
  });
}

startServer().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
