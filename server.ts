import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import { resolveVideoUrl, streamVideoRange, DEFAULT_FALLBACK_VIDEO, RELIABLE_SAMPLE_VIDEOS } from './api/stream';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json());

  // Lightweight HTTP Range Request streaming endpoint
  app.get('/api/stream', async (req, res) => {
    const id = req.query.id as string | undefined;
    const url = req.query.url as string | undefined;
    const part = req.query.part as string | undefined;

    const targetUrl = await resolveVideoUrl(id, url, part);
    const streamTarget = targetUrl || (part === '2' ? RELIABLE_SAMPLE_VIDEOS[1] : DEFAULT_FALLBACK_VIDEO);
    return streamVideoRange(req, res, streamTarget);
  });

  // Direct download endpoint with Content-Disposition
  app.get('/api/download', async (req, res) => {
    const id = req.query.id as string | undefined;
    const url = req.query.url as string | undefined;
    const part = req.query.part as string | undefined;
    const partSuffix = part ? `_part${part}` : '';
    const name = (req.query.name as string) || `movie_${id || 'download'}${partSuffix}.mp4`;

    const targetUrl = await resolveVideoUrl(id, url, part);
    const downloadTarget = targetUrl || (part === '2' ? RELIABLE_SAMPLE_VIDEOS[1] : DEFAULT_FALLBACK_VIDEO);

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`);
    return streamVideoRange(req, res, downloadTarget);
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
    const downloadTarget = targetUrl || (part === '2' ? RELIABLE_SAMPLE_VIDEOS[1] : DEFAULT_FALLBACK_VIDEO);

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`);
    return streamVideoRange(req, res, downloadTarget);
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
