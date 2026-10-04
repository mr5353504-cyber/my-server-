import type { IncomingMessage, ServerResponse } from 'http';

// Helper to resolve stream URL from ID, direct URL, and part index
export async function resolveVideoUrl(id?: string, directUrl?: string, part?: number | string): Promise<string | null> {
  if (directUrl && directUrl.startsWith('http') && !directUrl.includes('/watch?id=') && !directUrl.includes('/download?id=')) {
    if (directUrl.includes('pixeldrain.com/u/')) {
      return directUrl.replace('pixeldrain.com/u/', 'pixeldrain.com/api/file/');
    }
    return directUrl;
  }

  const targetPartNum = part ? parseInt(String(part), 10) : 1;

  if (!id) {
    return null;
  }

  // 1. Try Supabase lookup
  const supabaseUrl = process.env.SUPABASE_URL || 'https://tmomuyxckjhlsjfbzfvz.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const cleanUrl = supabaseUrl.replace(/\/$/, '');
      const numId = parseInt(id, 10);
      const headers = {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Accept: 'application/json'
      };

      let resp = await fetch(
        !isNaN(numId) ? `${cleanUrl}/rest/v1/movies?id=eq.${numId}&select=*` : `${cleanUrl}/rest/v1/movies?download_url=ilike.*${encodeURIComponent(id)}*&select=*`,
        { headers }
      );

      if (!resp.ok && !isNaN(numId)) {
        resp = await fetch(`${cleanUrl}/rest/v1/movies?tmdb_id=eq.${numId}&select=*`, { headers });
      }

      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
          const movie = data[0];
          const servers = movie.servers || [];

          if (Array.isArray(servers) && servers.length > 0) {
            // Find server matching part_number
            const matchedServer = servers.find((s: any) => s.part_number === targetPartNum || s.part_index === (targetPartNum - 1)) || servers[0];
            if (matchedServer) {
              if (matchedServer.url && matchedServer.url.startsWith('http') && !matchedServer.url.includes('/watch') && !matchedServer.url.includes('t.me')) {
                return matchedServer.url;
              }
              if (matchedServer.direct_stream_url && matchedServer.direct_stream_url.startsWith('http')) {
                return matchedServer.direct_stream_url;
              }
              if (matchedServer.telegram_cdn_url && matchedServer.telegram_cdn_url.startsWith('http')) {
                return matchedServer.telegram_cdn_url;
              }
            }
          }

          if (movie.download_url && movie.download_url.startsWith('http') && !movie.download_url.includes('/download') && !movie.download_url.includes('t.me')) {
            return movie.download_url;
          }
        }
      }
    } catch (e) {
      console.warn('Supabase movie stream query warning:', e);
    }
  }

  // 2. Try Telegram Bot API getFile if TELEGRAM_BOT_TOKEN is available
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken && id.length > 15) {
    try {
      const getFileResp = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(id)}`);
      if (getFileResp.ok) {
        const fileData = await getFileResp.json();
        const filePath = fileData?.result?.file_path;
        if (filePath) {
          return `https://api.telegram.org/file/bot${botToken}/${filePath}`;
        }
      }
    } catch (e) {
      console.warn('Telegram Bot getFile warning:', e);
    }
  }

  return null;
}

// Lightweight Range-Request Forwarder for Vercel Serverless Functions
export async function streamVideoRange(req: IncomingMessage, res: ServerResponse, videoUrl: string | null) {
  if (!videoUrl) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Video stream is not available or processing incomplete.' }));
    return;
  }

  // If videoUrl is a Telegram link, redirect directly to Telegram
  if (videoUrl.includes('t.me')) {
    res.statusCode = 302;
    res.setHeader('Location', videoUrl);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end();
    return;
  }

  const rangeHeader = req.headers['range'] as string | undefined;

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': '*/*'
  };

  if (rangeHeader) {
    headers['Range'] = rangeHeader;
  }

  try {
    let upstream = await fetch(videoUrl, {
      method: 'GET',
      headers
    });

    let contentType = upstream.headers.get('content-type') || 'video/mp4';

    // If upstream returns an error or non-video content, return 404 with clear status
    if (!upstream.ok || contentType.includes('xml') || contentType.includes('html')) {
      res.statusCode = upstream.status >= 400 ? upstream.status : 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `Upstream media source returned ${upstream.status} ${upstream.statusText}` }));
      return;
    }

    const isPartial = upstream.status === 206 || (rangeHeader && upstream.status === 200);
    const statusCode = isPartial ? 206 : upstream.status;

    const contentRange = upstream.headers.get('content-range');
    const contentLength = upstream.headers.get('content-length');
    const acceptRanges = upstream.headers.get('accept-ranges') || 'bytes';

    const responseHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'Accept-Ranges': acceptRanges,
      'Cache-Control': 'public, max-age=7200',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Range, Origin, Accept, X-Requested-With',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
    };

    if (contentRange) responseHeaders['Content-Range'] = contentRange;
    if (contentLength) responseHeaders['Content-Length'] = contentLength;

    res.writeHead(statusCode, responseHeaders);

    if (!upstream.body) {
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err: any) {
    console.error('Stream gateway error:', err);
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Stream gateway error', details: err?.message }));
    }
  }
}

// Vercel Serverless Function Default Export
export default async function handler(req: any, res: any) {
  const { id, url, part } = req.query || {};

  const targetUrl = await resolveVideoUrl(id as string, url as string, part as string);
  if (!targetUrl) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Media stream not found',
      message: 'This video is either still processing or stored in private Telegram channel. Access directly in Telegram or provide a direct stream URL.'
    }));
    return;
  }

  return streamVideoRange(req, res, targetUrl);
}
