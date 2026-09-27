import type { IncomingMessage, ServerResponse } from 'http';

// Helper to resolve stream URL from ID or query
export async function resolveVideoUrl(id?: string, directUrl?: string): Promise<string | null> {
  if (directUrl && directUrl.startsWith('http')) {
    return directUrl;
  }

  if (!id) return null;

  // 1. Try Supabase lookup
  const supabaseUrl = process.env.SUPABASE_URL || 'https://tmomuyxckjhlsjfbzfvz.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const cleanUrl = supabaseUrl.replace(/\/$/, '');
      const numId = parseInt(id, 10);
      const query = !isNaN(numId)
        ? `${cleanUrl}/rest/v1/movies?tmdb_id=eq.${numId}&select=*`
        : `${cleanUrl}/rest/v1/movies?download_url=ilike.*${encodeURIComponent(id)}*&select=*`;

      const resp = await fetch(query, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Accept: 'application/json'
        }
      });

      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
          const movie = data[0];
          const servers = movie.servers || [];
          for (const s of servers) {
            if (s && s.telegram_cdn_url && s.telegram_cdn_url.startsWith('http')) {
              return s.telegram_cdn_url;
            }
            if (s && s.url && s.url.startsWith('http') && !s.url.includes('/watch')) {
              return s.url;
            }
          }
          if (movie.download_url && movie.download_url.startsWith('http') && !movie.download_url.includes('/download')) {
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
export async function streamVideoRange(req: IncomingMessage, res: ServerResponse, videoUrl: string) {
  const rangeHeader = req.headers['range'] as string | undefined;

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': '*/*'
  };

  if (rangeHeader) {
    headers['Range'] = rangeHeader;
  }

  try {
    const upstream = await fetch(videoUrl, {
      method: 'GET',
      headers
    });

    const isPartial = upstream.status === 206 || (rangeHeader && upstream.status === 200);
    const statusCode = isPartial ? 206 : upstream.status;

    const contentType = upstream.headers.get('content-type') || 'video/mp4';
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
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Stream gateway error', details: err?.message }));
    }
  }
}

// Vercel Serverless Function Default Export
export default async function handler(req: any, res: any) {
  const { id, url } = req.query || {};

  const targetUrl = await resolveVideoUrl(id as string, url as string);

  if (!targetUrl) {
    // If not found, stream fallback video or send 404
    const fallbackUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
    return streamVideoRange(req, res, fallbackUrl);
  }

  return streamVideoRange(req, res, targetUrl);
}
