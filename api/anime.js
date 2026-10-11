const ANILIST = 'https://graphql.anilist.co';

// Helper GraphQL request
async function anilistQuery(query, variables = {}) {
  const res = await fetch(ANILIST, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });
  if (!res.ok) throw new Error(`AniList ${res.status}: ${res.statusText}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message || 'AniList error');
  return json.data;
}

// Fragment umum untuk media anime
const MEDIA_FIELDS = `
  id
  title { romaji english native }
  coverImage { large medium extraLarge }
  bannerImage
  averageScore
  episodes
  status
  seasonYear
  type
  genres
  description(asHtml: false)
  duration
  studios(isMain: true) { nodes { name } }
  format
  isAdult
`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, `https://${req.headers.host}`);
  const mode = url.searchParams.get('mode') || 'search';
  const q = url.searchParams.get('q');
  const id = url.searchParams.get('id');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');

  try {
    // ========== SEARCH ==========
    if (mode === 'search') {
      if (!q) return res.status(400).json({ error: 'missing q' });
      const data = await anilistQuery(`
        query ($search: String, $page: Int, $perPage: Int) {
          Page(page: $page, perPage: $perPage) {
            media(search: $search, type: ANIME, isAdult: false, sort: POPULARITY_DESC) {
              ${MEDIA_FIELDS}
            }
          }
        }`, { search: q, page, perPage: limit });
      return res.status(200).json({ data: data.Page.media });
    }

    // ========== TOP / POPULAR ==========
    if (mode === 'top') {
      const data = await anilistQuery(`
        query ($page: Int, $perPage: Int) {
          Page(page: $page, perPage: $perPage) {
            media(type: ANIME, sort: SCORE_DESC, isAdult: false) {
              ${MEDIA_FIELDS}
            }
          }
        }`, { page, perPage: limit });
      return res.status(200).json({ data: data.Page.media });
    }

    // ========== SEASONAL (Currently Airing) ==========
    if (mode === 'seasonal') {
      const data = await anilistQuery(`
        query ($page: Int, $perPage: Int) {
          Page(page: $page, perPage: $perPage) {
            media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC, isAdult: false) {
              ${MEDIA_FIELDS}
            }
          }
        }`, { page, perPage: limit });
      return res.status(200).json({ data: data.Page.media });
    }

    // ========== DETAIL ==========
    if (mode === 'detail') {
      if (!id) return res.status(400).json({ error: 'missing id' });
      const data = await anilistQuery(`
        query ($id: Int) {
          Media(id: $id, type: ANIME) {
            ${MEDIA_FIELDS}
            relations { edges { relationType node { id title { romaji } } } }
          }
        }`, { id: parseInt(id) });
      return res.status(200).json({ data: data.Media });
    }

    // ========== EPISODES ==========
    if (mode === 'episodes') {
      if (!id) return res.status(400).json({ error: 'missing id' });
      const data = await anilistQuery(`
        query ($id: Int) {
          Media(id: $id, type: ANIME) {
            id
            episodes
            title { romaji }
            streamingEpisodes { title thumbnail url site }
          }
        }`, { id: parseInt(id) });
      const media = data.Media;
      const eps = media.streamingEpisodes?.length
        ? media.streamingEpisodes.map((e, i) => ({
            mal_id: i + 1,
            title: e.title || `Episode ${i + 1}`,
            duration: (media.duration || 24) * 60
          }))
        : Array.from({ length: media.episodes || 12 }, (_, i) => ({
            mal_id: i + 1,
            title: `Episode ${i + 1}`,
            duration: (media.duration || 24) * 60
          }));
      return res.status(200).json({ data: eps });
    }

    // ========== CHARACTERS ==========
    if (mode === 'characters') {
      if (!id) return res.status(400).json({ error: 'missing id' });
      const data = await anilistQuery(`
        query ($id: Int) {
          Media(id: $id, type: ANIME) {
            characters(sort: [ROLE, RELEVANCE], perPage: 12) {
              edges {
                role
                node {
                  id
                  name { full native }
                  image { large medium }
                }
              }
            }
          }
        }`, { id: parseInt(id) });
      const chars = (data.Media.characters?.edges || []).map(e => ({
        character: {
          mal_id: e.node.id,
          name: e.node.name.full,
          images: { jpg: { image_url: e.node.image.large } }
        },
        role: e.role
      }));
      return res.status(200).json({ data: chars });
    }

    // ========== RECOMMENDATIONS ==========
    if (mode === 'recommendations') {
      if (!id) return res.status(400).json({ error: 'missing id' });
      const data = await anilistQuery(`
        query ($id: Int) {
          Media(id: $id, type: ANIME) {
            recommendations(sort: RATING_DESC, perPage: 8) {
              nodes {
                mediaRecommendation {
                  id
                  title { romaji }
                  coverImage { large medium }
                  averageScore
                  format
                }
              }
            }
          }
        }`, { id: parseInt(id) });
      const recos = (data.Media.recommendations?.nodes || []).map(n => ({
        entry: {
          mal_id: n.mediaRecommendation.id,
          title: n.mediaRecommendation.title.romaji,
          images: { jpg: { image_url: n.mediaRecommendation.coverImage.large } },
          score: (n.mediaRecommendation.averageScore || 0) / 10,
          type: n.mediaRecommendation.format
        }
      }));
      return res.status(200).json({ data: recos });
    }

    return res.status(400).json({ error: 'invalid mode' });
  } catch (err) {
    return res.status(500).json({ error: 'anilist_failed', detail: err.message });
  }
}
