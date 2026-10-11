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
    // 1. SEARCH — cari anime, pilih hasil terbaik
    // ==========================================
    const searchRes = await fetchTimeout(
      `${WAJIK_API_URL}/${PROVIDER}/search?q=${encodeURIComponent(anime)}`,
      6000
    );
    if (!searchRes.ok) throw new Error(`search ${searchRes.status}`);
    const searchData = await searchRes.json();
    const animeList = searchData?.data?.animeList || [];
    if (!animeList.length) throw new Error('anime not found');

    const best = pickBestMatch(animeList, anime);
    if (!best?.slug) throw new Error('slug missing');

    const slug = best.slug;

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

    // ==========================================
    // 3. CARI EPISODE
    // ==========================================
    // Format episode di Oploverz: "1180", "01", "1", "[END]", dll
    // Kita cari berdasarkan number match
    const epStr = String(ep);
    const epPadded = String(ep).padStart(2, '0');

    let targetEp = episodeList.find(e =>
      String(e.episode).trim() === epStr ||
      String(e.episode).trim() === epPadded
    );

    // Fallback: ambil berdasarkan index (kalau list urut dari terbaru)
    if (!targetEp) {
      // Cek kalau episodeList urut descending (terbaru dulu)
      const firstEpNum = parseInt(episodeList[0]?.episode);
      const lastEpNum = parseInt(episodeList[episodeList.length - 1]?.episode);

      if (!isNaN(firstEpNum) && !isNaN(lastEpNum) && firstEpNum > lastEpNum) {
        // Descending — episode 1 ada di akhir
        targetEp = episodeList[episodeList.length - ep];
      } else {
        // Ascending — episode 1 ada di awal
        targetEp = episodeList[ep - 1];
      }
    }

    if (!targetEp?.href) throw new Error('episode not found');

    const epSlug = targetEp.href.replace(/\/$/, '').split('/').pop();

    // ==========================================
    // 4. EPISODE DETAIL → ambil streamingUrl
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
    // 5. EXTRACT .m3u8 dari halaman embed
    // ==========================================
    const m3u8Url = await extractM3U8(streamingUrl);

    if (!m3u8Url) {
      return json({
        success: false,
        error: 'm3u8_not_found',
        message: 'Embed player tidak kasih link langsung. Butuh decrypter.',
        debug: { streamingUrl, epSlug },
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
// Pilih hasil search terbaik
// Prioritas:
//   1. Judul exact match (case-insensitive)
//   2. Judul tanpa suffix (movie/OVA/special)
//   3. Hasil pertama
// ==================================================
function pickBestMatch(list, query) {
  const q = query.toLowerCase().trim();

  // 1. Exact match
  const exact = list.find(a =>
    a.title.toLowerCase().trim() === q
  );
  if (exact) return exact;

  // 2. Match tanpa suffix "TV", "Season X", dll — dan BUKAN movie/OVA/special/live action
  const excluded = /(movie|ova|special|live\s*action|recap|heroines|smartphone|edited)/i;
  const cleanMatches = list.filter(a => !excluded.test(a.title));
  if (cleanMatches.length) {
    // Cari yang judulnya dimulai dengan query
    const startsWith = cleanMatches.find(a =>
      a.title.toLowerCase().startsWith(q)
    );
    if (startsWith) return startsWith;
    return cleanMatches[0];
  }

  // 3. Fallback
  return list[0];
}

// ==================================================
// Extract .m3u8 dari halaman embed
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
        if (url.includes('.m3u8')) return url;
      }
    }

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
