// api/anime.js
export const config = { runtime: 'edge' };

const JIKAN = 'https://api.jikan.moe/v4';

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode') || 'search';
  const q    = searchParams.get('q');
  const id   = searchParams.get('id');
  const page = searchParams.get('page') || '1';
  const limit= searchParams.get('limit') || '20';

  let url = '';
  switch (mode) {
    case 'search':
      if (!q) return json({ error: 'missing q' }, 400);
      url = `${JIKAN}/anime?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}&sfw=true`;
      break;
    case 'top':
      url = `${JIKAN}/top/anime?page=${page}&limit=${limit}`;
      break;
    case 'seasonal':
      url = `${JIKAN}/seasons/now?page=${page}&limit=${limit}`;
      break;
    case 'detail':
      if (!id) return json({ error: 'missing id' }, 400);
      url = `${JIKAN}/anime/${id}/full`;
      break;
    case 'episodes':
      if (!id) return json({ error: 'missing id' }, 400);
      url = `${JIKAN}/anime/${id}/episodes?page=${page}`;
      break;
    case 'characters':
      if (!id) return json({ error: 'missing id' }, 400);
      url = `${JIKAN}/anime/${id}/characters`;
      break;
    case 'recommendations':
      if (!id) return json({ error: 'missing id' }, 400);
      url = `${JIKAN}/anime/${id}/recommendations`;
      break;
    default:
      return json({ error: 'invalid mode' }, 400);
  }

  try {
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const data = await r.json();
    return new Response(JSON.stringify(data), {
      status: r.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
      }
    });
  } catch (err) {
    return json({ error: 'jikan_fetch_failed', detail: err.message }, 502);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
