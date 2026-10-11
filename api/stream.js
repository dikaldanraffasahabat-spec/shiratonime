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

    const detailRes = await fetchTimeout(
      `${WAJIK_API_URL}/${PROVIDER}/anime/${slug}`,
      6000
    );
    if (!detailRes.ok) throw new Error(`detail ${detailRes.status}`);
    const detailData = await detailRes.json();
    const episodeList = detailData?.data?.episodeList || [];
    if (!episodeList.length) throw new Error(`no episodes for slug: ${slug}`);

    const targetEp = findEpisode(episodeList, ep);
    if (!targetEp?.href) throw new Error('episode not found');

    const epSlug = targetEp.href.replace(/\/$/, '').split('/').pop();

    const epRes = await fetchTimeout(
      `${WAJIK_API_URL}/${PROVIDER}/episode/${epSlug}`,
      8000
    );
    if (!epRes.ok) throw new Error(`episode ${epRes.status}`);
    const epData = await epRes.json();

    const streamingUrl = epData?.data?.details?.streamingUrl;
    if (!streamingUrl) throw new Error('streamingUrl missing');

    return json({
      success: true,
      type: 'embed',
      provider: `wajik-${PROVIDER}`,
      episode: targetEp.episode,
      episodeTitle: targetEp.title || `Episode ${targetEp.episode}`,
      embedUrl: streamingUrl,
      download: epData?.data?.details?.download || []
    });

  } catch (err) {
    console.error('Stream error:', err.message);
    return json({
      success: false,
      error: 'all_providers_failed',
      message: err.message,
      demo: true,
      defaultSource: DEMO_STREAM
    });
  }
}

// ==================================================
// Pilih hasil search terbaik — versi FIX
// ==================================================
function pickBestMatch(list, query) {
  const q = query.toLowerCase().trim();

  // 1. EXACT match judul
  const exact = list.find(a => a.title.toLowerCase().trim() === q);
  if (exact) return exact;

  // 2. Buang hasil yang jelas bukan serial utama
  //    Pattern: Heroines, Live Action, Movie, OVA, Special, Recap, Smartphone, Edited, Season X
  const excluded = /(heroines|live\s*action|movie|ova|special|recap|smartphone|edited|season\s*\d+)/i;
  const candidates = list.filter(a => !excluded.test(a.title));
  if (!candidates.length) return list[0];

  // 3. Cari yang slug-nya PERSIS sama dengan query (paling reliable)
  //    contoh: query "one piece" → slug "one-piece"
  const slugTarget = q.replace(/\s+/g, '-');
  const slugExact = candidates.find(a => a.slug === slugTarget);
  if (slugExact) return slugExact;

  // 4. Cari yang judulnya mulai dengan query DAN tanpa tambahan apapun
  const startsExact = candidates.find(a =>
    a.title.toLowerCase().trim() === q ||
    a.title.toLowerCase().trim().replace(/\s+/g, ' ') === q
  );
  if (startsExact) return startsExact;

  // 5. Terakhir: yang judulnya startsWith query (dari candidates)
  const startsWith = candidates.find(a =>
    a.title.toLowerCase().startsWith(q)
  );
  if (startsWith) return startsWith;

  return candidates[0];
}

// ==================================================
// Cari episode yang cocok
// ==================================================
function findEpisode(episodeList, ep) {
  const epStr = String(ep);
  const epPadded = String(ep).padStart(2, '0');

  // Coba match exact dulu
  let found = episodeList.find(e => {
    const num = String(e.episode).trim();
    return num === epStr || num === epPadded;
  });
  if (found) return found;

  // Coba match numeric
  found = episodeList.find(e => parseInt(e.episode) === ep);
  if (found) return found;

  // Fallback: index-based (asumsi descending = terbaru dulu)
  const firstNum = parseInt(episodeList[0]?.episode);
  const lastNum = parseInt(episodeList[episodeList.length - 1]?.episode);
  if (!isNaN(firstNum) && !isNaN(lastNum) && firstNum > lastNum) {
    return episodeList[episodeList.length - ep];
  }
  return episodeList[ep - 1];
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
