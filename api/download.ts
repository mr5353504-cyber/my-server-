import type { IncomingMessage, ServerResponse } from 'http';
import { resolveVideoUrl, streamVideoRange } from './stream';

export default async function handler(req: any, res: any) {
  const { id, url, name } = req.query || {};

  const targetUrl = await resolveVideoUrl(id as string, url as string);

  if (!targetUrl) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Movie file not found' }));
    return;
  }

  // Set attachment download header
  const filename = name || `movie_${id || 'download'}.mp4`;
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

  return streamVideoRange(req, res, targetUrl);
}
