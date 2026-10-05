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

  // 3rd-Party Link Processor & WebTorrent metadata resolver
  app.all('/api/process-link', async (req, res) => {
    return processLinkHandler(req, res);
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
