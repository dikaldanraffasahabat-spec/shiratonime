const JIKAN = 'https://api.jikan.moe/v4';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = new URL(req.url, `https://${req.headers.host}`);
  const mode = url.searchParams.get('mode') || 'search';
  const q = url.searchParams.get('q');
  const id = url.searchParams.get('id');
  const page = url.searchParams.get('page') || '1';
  const limit = url.searchParams.get('limit') || '20';

  let jikanUrl = '';
  if (mode === 'search') {
    if (!q) return res.status(400).json({ error: 'missing q' });
    jikanUrl = `${JIKAN}/anime?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}&sfw=true`;
  } else if (mode === 'top') {
    jikanUrl = `${JIKAN}/top/anime?page=${page}&limit=${limit}`;
  } else if (mode === 'seasonal') {
    jikanUrl = `${JIKAN}/seasons/now?page=${page}&limit=${limit}`;
  } else if (mode === 'detail') {
    if (!id) return res.status(400).json({ error: 'missing id' });
    jikanUrl = `${JIKAN}/anime/${id}/full`;
  } else if (mode === 'episodes') {
    if (!id) return res.status(400).json({ error: 'missing id' });
    jikanUrl = `${JIKAN}/anime/${id}/episodes?page=${page}`;
  } else if (mode === 'characters') {
    if (!id) return res.status(400).json({ error: 'missing id' });
    jikanUrl = `${JIKAN}/anime/${id}/characters`;
  } else if (mode === 'recommendations') {
    if (!id) return res.status(400).json({ error: 'missing id' });
    jikanUrl = `${JIKAN}/anime/${id}/recommendations`;
  } else {
    return res.status(400).json({ error: 'invalid mode' });
  }

  try {
    const response = await fetch(jikanUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Shiratonime/1.0'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'jikan_error',
        status: response.status,
        statusText: response.statusText
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({
      error: 'fetch_failed',
      detail: err.message
    });
  }
}
