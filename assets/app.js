function normalizeAnime(a) {
  if (!a) return {};
  return {
    malId: a.id,  // sekarang pakai AniList ID
    title: a.title?.romaji || a.title?.english || a.title?.native || 'Untitled',
    titleEnglish: a.title?.english,
    titleJapanese: a.title?.native,
    image: a.coverImage?.extraLarge || a.coverImage?.large || a.coverImage?.medium,
    imageSmall: a.coverImage?.medium,
    banner: a.bannerImage,
    score: a.averageScore ? (a.averageScore / 10).toFixed(1) : 'N/A',
    episodes: a.episodes,
    status: a.status === 'RELEASING' ? 'ongoing'
           : a.status === 'FINISHED' ? 'finished'
           : 'upcoming',
    statusText: a.status === 'RELEASING' ? 'Currently Airing'
              : a.status === 'FINISHED' ? 'Finished Airing'
              : 'Not yet aired',
    type: a.format || 'TV',
    genres: a.genres || [],
    year: a.seasonYear || '—',
    synopsis: (a.description || '').replace(/<[^>]*>/g, ''),
    duration: a.duration ? `${a.duration} min` : '—',
    studios: a.studios?.nodes?.map(s => s.name) || []
  };
}
