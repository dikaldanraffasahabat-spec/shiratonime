// api/stream.js
export const config = { runtime: 'edge' };

// Provider Consumet — dicoba berurutan
const PROVIDERS = [
  {
    name: 'gogoanime',
    search: (q) => `https://api.consumet.org/anime/gogoanime/${encodeURIComponent(q)}`,
    info:   (id) => `https://api.consumet.org/anime/gogoanime/info/${id}`,
    watch:  (epId) => `https://api.consumet.org/anime/gogoanime/watch/${epId}`
  },
  {
    name: 'zoro',
    search: (q) => `https://api.consumet.org/anime/zoro/${encodeURIComponent(q)}`,
    info:   (id) => `https://api.consumet.org/anime/zoro/info?id=${id}`,
    watch:  (epId) => `https://api.consumet.org/anime/zoro/watch?episodeId=${epId}`
  },
  {
    name: 'animepahe',
    search: (q) => `https://api.consumet.org/anime/animepahe/${encodeURIComponent(q)}`,
    info:   (id) => `https://api.consumet.org/anime/animepahe/info/${id}`,
    watch:  (epId) => `https://api.consumet.org/anime/animepahe/watch?episodeId=${epId}`
  }
];

// Fallback demo — stream HLS publik (Big Buck Bunny) biar player tetap bisa dites
const DEMO_STREAMS = [
  'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  'https://test-streams.mux.dev/pts_shift/master.m3u8'
];

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const anime = searchParams.get('anime');
  const ep    = parseInt(searchParams.get('ep') || '1');
  const action= searchParams.get('action') || 'watch'; // search | info | watch

  if (!anime) return json({ error: 'missing anime' }, 400);

  // === ACTION: SEARCH — cari anime di semua provider ===
  if (action === 'search') {
    for (const p of PROVIDERS) {
      try {
        const r = await fetchTimeout(p.search(anime), 5000);
        if (!r.ok) continue;
        const data = await r.json();
        if (data?.results?.length) {
          return json({ success: true, provider: p.name, results: data.results });
        }
      } catch { /* lanjut provider berikutnya */ }
    }
    return json({ success: false, error: 'no_provider_available', demo: DEMO_STREAMS[0] });
  }

  // === ACTION: INFO — daftar episode ===
  if (action === 'info') {
    const providerName = searchParams.get('provider') || 'gogoanime';
    const provider = PROVIDERS.find(p => p.name === providerName) || PROVIDERS[0];
    const id = searchParams.get('id');
    if (!id) return json({ error: 'missing id' }, 400);
    try {
      const r = await fetchTimeout(provider.info(id), 5000);
      const data = await r.json();
      return json({ success: true, provider: provider.name, ...data });
    } catch (err) {
      return json({ success: false, error: err.message }, 502);
    }
  }

  // === ACTION: WATCH — ambil link stream episode ===
  if (action === 'watch') {
    // Coba setiap provider secara berurutan
    for (const p of PROVIDERS) {
      try {
        // 1. Search anime
        const sRes = await fetchTimeout(p.search(anime), 5000);
        if (!sRes.ok) continue;
        const sData = await sRes.json();
        const first = sData?.results?.[0];
        if (!first) continue;

        // 2. Get info (episode list)
        const iRes = await fetchTimeout(p.info(first.id), 5000);
        if (!iRes.ok) continue;
        const iData = await iRes.json();
        const episodes = iData?.episodes || [];
        const targetEp = episodes.find(e => e.number === ep) || episodes[ep - 1] || episodes[0];
        if (!targetEp) continue;

        // 3. Get watch links
        const wRes = await fetchTimeout(p.watch(targetEp.id), 8000);
        if (!wRes.ok) continue;
        const wData = await wRes.json();

        const sources = (wData?.sources || []).filter(s => s.isM3U8 || s.url?.includes('.m3u8'));
        if (!sources.length) continue;

        // Pilih kualitas tertinggi (biasanya index 0 = auto/default)
        const best = sources[0];

        return json({
          success: true,
          provider: p.name,
          episode: targetEp.number,
          episodeTitle: targetEp.title || `Episode ${targetEp.number}`,
          sources: sources.map(s => ({
            quality: s.quality || 'auto',
            url: s.url,
            isM3U8: s.isM3U8 ?? s.url.includes('.m3u8')
          })),
          defaultSource: best.url,
          // Referer yang perlu di-inject oleh proxy
          referer: p.name === 'gogoanime' ? 'https://gogoanime3.co/' : undefined
        });
      } catch { /* lanjut provider berikutnya */ }
    }

    // === SEMUA PROVIDER GAGAL → fallback demo ===
    return json({
      success: false,
      error: 'all_providers_failed',
      message: 'Provider streaming tidak tersedia. Menampilkan demo stream.',
      demo: true,
      defaultSource: DEMO_STREAMS[0],
      sources: [{ quality: 'demo', url: DEMO_STREAMS[0], isM3U8: true }]
    });
  }

  return json({ error: 'invalid action' }, 400);
}

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
