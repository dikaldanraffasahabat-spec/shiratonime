export const config = { runtime: 'edge' };

const WAJIK_API_URL = 'https://wajik-anime-api-production-8d07.up.railway.app';
const PROVIDER = 'oploverz';
const REFERER = 'https://oploverz.am/';

const DEMO_STREAM = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const anime  = searchParams.get('anime');
  const ep     = parseInt(searchParams.get('ep') || '1');
  const action = searchParams.get('action') || 'watch';

  if (!anime) return json({ error: 'missing anime' }, 400);
  if (action !== 'watch') return json({ error: 'invalid action' }, 400);

  try {
    // ==========================================
    // 1. SEARCH
    // ==========================================
    const searchRes = await fetchTimeout(
      `${WAJIK_API_URL}/${PROVIDER}/search?q=${encodeURIComponent(anime)}`,
      6000
    );
    if (!searchRes.ok) throw new Error(`search ${searchRes.status}`);
    const searchData = await searchRes.json();
    const animeList = searchData?.data?.animeList || [];
    if (!animeList.length) throw new Error('anime not found');

    const best = animeList.find(a =>
      a.title.toLowerCase().includes(anime.toLowerCase())
    ) || animeList[0];
    const slug = best.slug;
    if (!slug) throw new Error('slug missing');

    // ==========================================
    // 2. DETAIL ANIME → episode list
    // ==========================================
    const detailRes = await fetchTimeout(
      `${WAJIK_API_URL}/${PROVIDER}/anime/${slug}`,
      6000
    );
    if (!detailRes.ok) throw new Error(`detail ${detailRes.status}`);
    const detailData = await detailRes.json();
    const episodeList = detailData?.data?.episodeList || [];
    if (!episodeList.length) throw new Error('no episodes');

    // Cari episode yang cocok
    const targetEp = episodeList.find(e =>
      String(e.episode) === String(ep)
    ) || episodeList[episodeList.length - ep] || episodeList[0];
    if (!targetEp?.href) throw new Error('episode not found');

    const epSlug = targetEp.href.replace(/\/$/, '').split('/').pop();

    // ==========================================
    // 3. EPISODE DETAIL → ambil streamingUrl
    // ==========================================
    const epRes = await fetchTimeout(
      `${WAJIK_API_URL}/${PROVIDER}/episode/${epSlug}`,
      8000
    );
    if (!epRes.ok) throw new Error(`episode ${epRes.status}`);
    const epData = await epRes.json();

    const streamingUrl = epData?.data?.details?.streamingUrl;
    if (!streamingUrl) throw new Error('streamingUrl missing');

    // ==========================================
    // 4. EXTRACT .m3u8 dari halaman embed
    // ==========================================
    const m3u8Url = await extractM3U8(streamingUrl);

    if (!m3u8Url) {
      return json({
        success: false,
        error: 'm3u8_not_found',
        message: 'Tidak bisa extract link video dari embed player.',
        debug: { streamingUrl },
        demo: true,
        defaultSource: DEMO_STREAM,
        sources: [{ quality: 'demo', url: DEMO_STREAM, isM3U8: true }]
      });
    }

    return json({
      success: true,
      provider: `wajik-${PROVIDER}`,
      episode: targetEp.episode,
      episodeTitle: targetEp.title || `Episode ${targetEp.episode}`,
      sources: [{ quality: 'auto', url: m3u8Url, isM3U8: true }],
      defaultSource: m3u8Url,
      referer: 'https://upbolt.to/'
    });

  } catch (err) {
    console.error('Stream error:', err.message);
    return json({
      success: false,
      error: 'all_providers_failed',
      message: err.message,
      demo: true,
      defaultSource: DEMO_STREAM,
      sources: [{ quality: 'demo', url: DEMO_STREAM, isM3U8: true }]
    });
  }
}

// ==================================================
// Extract .m3u8 dari halaman embed (upbolt, dll)
// ==================================================
async function extractM3U8(embedUrl) {
  try {
    const res = await fetchTimeout(embedUrl, 8000, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': REFERER,
      'Accept': 'text/html,application/xhtml+xml,*/*'
    });
    if (!res.ok) return null;

    const html = await res.text();

    // Cari pola umum .m3u8 di HTML/script
    const patterns = [
      /https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/g,
      /["'](\/\/[^\s"']+\.m3u8[^\s"']*)["']/g,
      /["']([^\s"']+\.m3u8[^\s"']*)["']/g,
      /sources?\s*:\s*\[\s*\{[^}]*file\s*:\s*["']([^"']+)["']/g,
      /source\s*:\s*["']([^"']+\.m3u8[^"']*)["']/g
    ];

    for (const pattern of patterns) {
      const matches = [...html.matchAll(pattern)];
      for (const match of matches) {
        let url = match[1] || match[0];
        url = url.replace(/\\\//g, '/').replace(/^\/\//, 'https://');
        if (url.includes('.m3u8')) {
          return url;
        }
      }
    }

    // Cari di JSON-LD / meta og:video
    const ogVideo = html.match(/property=["']og:video["']\s+content=["']([^"']+)["']/);
    if (ogVideo?.[1]?.includes('.m3u8')) return ogVideo[1];

    return null;
  } catch (err) {
    console.error('extractM3U8 error:', err.message);
    return null;
  }
}

async function fetchTimeout(url, ms, extraHeaders = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        ...extraHeaders
      }
    });
  } finally {
    clearTimeout(id);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, s-maxage=300'
    }
  });
}
