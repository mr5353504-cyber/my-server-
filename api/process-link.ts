import type { IncomingMessage, ServerResponse } from 'http';

export default async function handler(req: IncomingMessage & { body?: any; query?: any }, res: ServerResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Parse input URL
  let targetUrl = '';
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) {}
    }
    if (!body && (req as any).readable) {
      body = await new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (_) { resolve({}); }
        });
      });
    }
    targetUrl = body?.url || '';
  } else {
    const urlObj = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    targetUrl = urlObj.searchParams.get('url') || '';
  }

  targetUrl = targetUrl.trim();

  if (!targetUrl) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Please provide a valid URL or Magnet link in "url" parameter.' }));
    return;
  }

  try {
    // 1. MAGNET / TORRENT LINK
    if (targetUrl.startsWith('magnet:?') || targetUrl.endsWith('.torrent')) {
      const isMagnet = targetUrl.startsWith('magnet:?');
      let name = 'P2P Movie Stream';
      if (isMagnet) {
        const nameMatch = targetUrl.match(/dn=([^&]+)/);
        if (nameMatch) {
          name = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
        }
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        type: 'webtorrent',
        engine: 'WebTorrent (P2P In-Browser)',
        title: name,
        watchUrl: targetUrl,
        downloadUrl: targetUrl,
        isP2P: true,
        features: ['In-Browser WebTorrent Player', 'P2P Streaming (Zero Server Load)', 'No Size Limit'],
        instructions: 'This link will be streamed peer-to-peer directly inside the browser using WebTorrent without passing through Vercel servers.'
      }));
      return;
    }

    // 2. PIXELDRAIN
    if (targetUrl.includes('pixeldrain.com')) {
      const match = targetUrl.match(/pixeldrain\.com\/(?:u|api\/file)\/([a-zA-Z0-9_-]+)/);
      if (match) {
        const fileId = match[1];
        let fileInfo: any = null;
        try {
          const infoResp = await fetch(`https://pixeldrain.com/api/file/${fileId}/info`);
          if (infoResp.ok) {
            fileInfo = await infoResp.json();
          }
        } catch (_) {}

        const watchUrl = `https://pixeldrain.com/api/file/${fileId}`;
        const downloadUrl = `https://pixeldrain.com/api/file/${fileId}?download`;
        const title = fileInfo?.name || `Pixeldrain Movie (${fileId})`;
        const sizeBytes = fileInfo?.size || 0;
        const sizeMb = sizeBytes > 0 ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` : undefined;

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: true,
          type: 'pixeldrain',
          engine: 'Pixeldrain Ultra-Speed CDN',
          title,
          size: sizeMb,
          watchUrl,
          downloadUrl,
          directCdnUrl: watchUrl,
          supportsRange: true,
          features: ['Instant Seek (206 Range Stream)', 'Gigabit Download Speed', 'CORS Enabled']
        }));
        return;
      }
    }

    // 3. GOFILE
    if (targetUrl.includes('gofile.io')) {
      const match = targetUrl.match(/gofile\.io\/d\/([a-zA-Z0-9_-]+)/);
      const contentId = match ? match[1] : '';

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        type: 'gofile',
        engine: 'Gofile Cloud Storage',
        title: `Gofile Media (${contentId || 'Shared'})`,
        watchUrl: targetUrl,
        downloadUrl: targetUrl,
        features: ['Cloud Mirror', 'High-Speed Download'],
        note: 'Gofile token authentication will be negotiated client-side.'
      }));
      return;
    }

    // 4. BUZZHEAVIER / VIK1NGFILE / OTHER CLOUD MIRRORS
    if (targetUrl.includes('buzzheavier.com') || targetUrl.includes('vik1ngfile.site')) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        type: 'cloud_mirror',
        engine: 'Cloud Fast Mirror',
        title: 'Cloud Mirror Stream',
        watchUrl: targetUrl,
        downloadUrl: targetUrl,
        features: ['Direct Mirror', 'Browser Playback Supported']
      }));
      return;
    }

    // 5. DIRECT VIDEO STREAM (MP4 / MKV / WEBM)
    if (/\.(mp4|mkv|webm|m4v|mov)(\?.*)?$/i.test(targetUrl)) {
      const fileNameMatch = targetUrl.split('?')[0].match(/\/([^/?#]+\.(mp4|mkv|webm|m4v|mov))$/i);
      const title = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : 'Direct Video Stream';

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        type: 'direct_video',
        engine: 'HTML5 Native Range Stream',
        title,
        watchUrl: targetUrl,
        downloadUrl: targetUrl,
        features: ['HTML5 Cinema Player', 'HTTP Range 206', 'Direct Browser Download']
      }));
      return;
    }

    // 6. DEFAULT WEB URL
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: true,
      type: 'generic_stream',
      engine: 'Cinema Stream Player Gateway',
      title: 'Processed Media Source',
      watchUrl: targetUrl,
      downloadUrl: targetUrl,
      features: ['Cinema Player Gateway', 'Direct Download Trigger']
    }));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message || 'Internal processor error' }));
  }
}
