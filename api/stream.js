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
    if (!episodeList.length) throw new Error('no episodes');

    const epStr = String(ep);
    const epPadded = String(ep).padStart(2, '0');
    let targetEp = episodeList.find(e =>
      String(e.episode).trim() === epStr ||
      String(e.episode).trim() === epPadded
    );

    if (!targetEp) {
      const firstEpNum = parseInt(episodeList[0]?.episode);
      const lastEpNum = parseInt(episodeList[episodeList.length - 1]?.episode);
      if (!isNaN(firstEpNum) && !isNaN(lastEpNum) && firstEpNum > lastEpNum) {
        targetEp = episodeList[episodeList.length - ep];
      } else {
        targetEp = episodeList[ep - 1];
      }
    }
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

function pickBestMatch(list, query) {
  const q = query.toLowerCase().trim();
  const exact = list.find(a => a.title.toLowerCase().trim() === q);
  if (exact) return exact;

  const excluded = /(movie|ova|special|live\s*action|recap|heroines|smartphone|edited)/i;
  const cleanMatches = list.filter(a => !excluded.test(a.title));
  if (cleanMatches.length) {
    const startsWith = cleanMatches.find(a => a.title.toLowerCase().startsWith(q));
    if (startsWith) return startsWith;
    return cleanMatches[0];
  }
  return list[0];
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
