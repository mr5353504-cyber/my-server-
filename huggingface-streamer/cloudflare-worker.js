/**
 * Cloudflare Worker for Unlimited Free Telegram Video Edge Caching
 *
 * How this works:
 * 1. Takes the user's video chunk request
 * 2. Fetches the chunk from your Hugging Face Space
 * 3. Caches the chunk in Cloudflare's 300+ Global Data Centers for 30 days
 * 4. Subsequent requests from your 1,000 daily viewers are served directly
 *    from Cloudflare Edge CDN with ZERO bandwidth load on Hugging Face!
 */

// Replace with your Hugging Face Space URL (e.g. https://yourusername-tgstream.hf.space)
const ORIGIN_STREAMER_URL = "https://YOUR-SPACE.hf.space";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = ORIGIN_STREAMER_URL.replace(/\/$/, '') + url.pathname + url.search;

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Range, Content-Type, Accept",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // Try serving from Cloudflare Edge Cache
    const cache = caches.default;
    let cacheKey = new Request(request.url, {
      method: "GET",
      headers: request.headers,
    });

    let response = await cache.match(cacheKey);

    if (!response) {
      // Forward request to Hugging Face
      const upstreamReq = new Request(targetUrl, {
        method: request.method,
        headers: request.headers,
      });

      response = await fetch(upstreamReq);

      // Clone response and attach cache headers
      const newHeaders = new Headers(response.headers);
      newHeaders.set("Access-Control-Allow-Origin", "*");
      newHeaders.set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges, Content-Type");
      newHeaders.set("Cache-Control", "public, max-age=2592000, immutable");

      const cachedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });

      // Cache successful video streams (200 OK or 206 Partial Content)
      if (response.status === 200 || response.status === 206) {
        ctx.waitUntil(cache.put(cacheKey, cachedResponse.clone()));
      }

      return cachedResponse;
    }

    return response;
  },
};
