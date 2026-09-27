import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import { resolveVideoUrl, streamVideoRange } from './api/stream';

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

    const targetUrl = await resolveVideoUrl(id, url);
    const streamTarget = targetUrl || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
    return streamVideoRange(req, res, streamTarget);
  });

  // Direct download endpoint with Content-Disposition
  app.get('/api/download', async (req, res) => {
    const id = req.query.id as string | undefined;
    const url = req.query.url as string | undefined;
    const name = (req.query.name as string) || `movie_${id || 'download'}.mp4`;

    const targetUrl = await resolveVideoUrl(id, url);
    if (!targetUrl) {
      return res.status(404).json({ error: 'Movie file not found' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`);
    return streamVideoRange(req, res, targetUrl);
  });

  // Support /download route direct forward
  app.get('/download', async (req, res) => {
    const id = req.query.id as string | undefined;
    const url = req.query.url as string | undefined;
    const name = (req.query.name as string) || `movie_${id || 'download'}.mp4`;

    const targetUrl = await resolveVideoUrl(id, url);
    if (!targetUrl) {
      return res.status(404).json({ error: 'Movie file not found' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`);
    return streamVideoRange(req, res, targetUrl);
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
