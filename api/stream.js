export const config = { runtime: 'edge' };

// Mirror Consumet yang mungkin masih jalan (dicoba berurutan)
const CONSUMET_MIRRORS = [
  'https://api-consumet-org-six.vercel.app',
  'https://api-consumet-org.vercel.app',
  'https://consumet-api.vercel.app',
  'https://api.consumet.org'
];

// Anify sebagai provider alternatif
const ANIFY_API = 'https://api.anify.tv';

const DEMO_STREAMS = [
  'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  'https://test-streams.mux.dev/pts_shift/master.m3u8'
];

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const anime  = searchParams.get('anime');
  const ep     = parseInt(searchParams.get('ep') || '1');
  const action = searchParams.get('action') || 'watch';

  if (!anime) return json({ error: 'missing anime' }, 400);

  // ============ ACTION: WATCH ============
  if (action === 'watch') {
    // STRATEGI 1: Coba Anify (paling stabil)
    try {
      const result = await tryAnify(anime, ep);
      if (result) return json(result);
    } catch (e) { console.error('Anify failed:', e.message); }

    // STRATEGI 2: Coba semua mirror Consumet (gogoanime)
    for (const mirror of CONSUMET_MIRRORS) {
      try {
        const result = await tryConsumet(mirror, anime, ep);
        if (result) return json(result);
      } catch (e) { console.error(`${mirror} failed:`, e.message); }
    }

    // STRATEGI 3: Fallback demo
    return json({
      success: false,
      error: 'all_providers_failed',
      message: 'Provider streaming sedang tidak tersedia. Menampilkan demo stream.',
      demo: true,
      defaultSource: DEMO_STREAMS[0],
      sources: [{ quality: 'demo', url: DEMO_STREAMS[0], isM3U8: true }]
    });
  }

  // ============ ACTION: SEARCH ============
  if (action === 'search') {
    for (const mirror of CONSUMET_MIRRORS) {
      try {
        const r = await fetchTimeout(
          `${mirror}/anime/gogoanime/${encodeURIComponent(anime)}`,
          5000
        );
        if (!r.ok) continue;
        const data = await r.json();
        if (data?.results?.length) {
          return json({ success: true, provider: mirror, results: data.results });
        }
      } catch {}
    }
    return json({ success: false, error: 'no_provider' });
  }

  return json({ error: 'invalid action' }, 400);
}

// ==================================================
// Anify Provider
// ==================================================
async function tryAnify(anime, ep) {
  // 1. Search
  const searchRes = await fetchTimeout(
    `${ANIFY_API}/search?query=${encodeURIComponent(anime)}&type=anime`,
    6000
  );
  if (!searchRes.ok) return null;

  const searchData = await searchRes.json();
  if (!searchData?.results?.length) return null;

  const firstResult = searchData.results[0];
  const anifyId = firstResult.id;

  // 2. Ambil episode list
  const infoRes = await fetchTimeout(
    `${ANIFY_API}/info/${anifyId}?type=anime`,
    6000
  );
  if (!infoRes.ok) return null;

  const infoData = await infoRes.json();
  const episodes = infoData?.episodes?.data || [];
  if (!episodes.length) return null;

  const targetEp = episodes.find(e => e.number === ep)
                || episodes.find(e => e.number === ep + 1)
                || episodes[ep - 1]
                || episodes[0];
  if (!targetEp) return null;

  // 3. Ambil link stream
  const watchRes = await fetchTimeout(
    `${ANIFY_API}/sources?providerId=gogoanime&id=${anifyId}&episode=${targetEp.number}&type=anime`,
    8000
  );
  if (!watchRes.ok) return null;

  const watchData = await watchRes.json();
  const sources = watchData?.sources || [];
  if (!sources.length) return null;

  const validSources = sources.filter(s =>
    s.url && (s.url.includes('.m3u8') || s.isM3U8 === true)
  );
  if (!validSources.length) return null;

  const best = validSources[0];

  return {
    success: true,
    provider: 'anify-gogoanime',
    episode: targetEp.number,
    episodeTitle: targetEp.title || `Episode ${targetEp.number}`,
    sources: validSources.map(s => ({
      quality: s.quality || 'auto',
      url: s.url,
      isM3U8: s.isM3U8 ?? s.url.includes('.m3u8')
    })),
    defaultSource: best.url,
    referer: 'https://gogoanime3.co/'
  };
}

// ==================================================
// Consumet Provider
// ==================================================
async function tryConsumet(baseUrl, anime, ep) {
  // 1. Search
  const sRes = await fetchTimeout(
    `${baseUrl}/anime/gogoanime/${encodeURIComponent(anime)}`,
    5000
  );
  if (!sRes.ok) return null;

  const sData = await sRes.json();
  const first = sData?.results?.[0];
  if (!first) return null;

  // 2. Info
  const iRes = await fetchTimeout(
    `${baseUrl}/anime/gogoanime/info/${first.id}`,
    5000
  );
  if (!iRes.ok) return null;

  const iData = await iRes.json();
  const episodes = iData?.episodes || [];
  if (!episodes.length) return null;

  const targetEp = episodes.find(e => e.number === ep)
                || episodes[ep - 1]
                || episodes[0];
  if (!targetEp) return null;

  // 3. Watch
  const wRes = await fetchTimeout(
    `${baseUrl}/anime/gogoanime/watch/${targetEp.id}`,
    8000
  );
  if (!wRes.ok) return null;

  const wData = await wRes.json();
  const sources = (wData?.sources || []).filter(s =>
    s.isM3U8 || s.url?.includes('.m3u8')
  );
  if (!sources.length) return null;

  const best = sources[0];

  return {
    success: true,
    provider: `consumet-${baseUrl.split('//')[1].split('.')[0]}`,
    episode: targetEp.number,
    episodeTitle: targetEp.title || `Episode ${targetEp.number}`,
    sources: sources.map(s => ({
      quality: s.quality || 'auto',
      url: s.url,
      isM3U8: s.isM3U8 ?? s.url.includes('.m3u8')
    })),
    defaultSource: best.url,
    referer: 'https://gogoanime3.co/'
  };
}

// ==================================================
// Helpers
// ==================================================
async function fetchTimeout(url, ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
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
