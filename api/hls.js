// api/hls.js
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get('url');
  const referer = searchParams.get('ref') || '';

  if (!target) return new Response('missing url', { status: 400 });

  // Validasi: hanya izinkan http(s)
  if (!/^https?:\/\//.test(target)) {
    return new Response('invalid url', { status: 400 });
  }

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
    };
    if (referer) headers['Referer'] = referer;

    const upstream = await fetch(target, { headers });

    if (!upstream.ok) {
      return new Response(`upstream ${upstream.status}`, { status: upstream.status });
    }

    const contentType = upstream.headers.get('content-type') || '';
    const isPlaylist = contentType.includes('mpegurl')
      || contentType.includes('application/vnd.apple.mpegurl')
      || target.endsWith('.m3u8');

    // === Playlist m3u8: rewrite relative URLs jadi absolute + route via proxy ===
    if (isPlaylist) {
      const text = await upstream.text();
      const baseUrl = new URL(target);
      const proxied = text
        .split('\n')
        .map(line => {
          const trimmed = line.trim();

          // Komentar / directive
          if (trimmed.startsWith('#')) {
            // Rewrite URI="..." di dalam tag (key, audio, subtitle)
            return trimmed.replace(/URI="([^"]+)"/g, (_, uri) => {
              const abs = new URL(uri, baseUrl).toString();
              return `URI="/api/hls?url=${encodeURIComponent(abs)}${referer ? `&ref=${encodeURIComponent(referer)}` : ''}"`;
            });
          }

          // Baris kosong
          if (!trimmed) return line;

          // URL segmen / sub-playlist → absolute + proxy
          const abs = new URL(trimmed, baseUrl).toString();
          return `/api/hls?url=${encodeURIComponent(abs)}${referer ? `&ref=${encodeURIComponent(referer)}` : ''}`;
        })
        .join('\n');

      return new Response(proxied, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, s-maxage=60'
        }
      });
    }

    // === Segmen .ts / .m4s / key → stream langsung ===
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType || 'video/mp2t',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=3600, immutable'
      }
    });
  } catch (err) {
    return new Response(`proxy error: ${err.message}`, { status: 502 });
  }
}
