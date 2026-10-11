// assets/app.js

// ============================================
// CONFIG
// ============================================
const API = '/api'; // otomatis jadi full URL di Vercel

// ============================================
// STATE
// ============================================
const state = {
  currentPage: 'home',
  searchQuery: '',
  animeList: [],
  ongoingList: [],
  finishedList: [],
  currentAnime: null,      // detail object
  currentEpisode: 1,
  hlsInstance: null
};

// ============================================
// FETCH HELPERS
// ============================================
async function apiGet(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API}${path}${qs ? '?' + qs : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// Normalisasi response Jikan → format internal
function normalizeAnime(a) {
  return {
    malId: a.mal_id,
    title: a.title || a.title_english || a.title_japanese,
    titleEnglish: a.title_english,
    image: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url,
    imageSmall: a.images?.jpg?.image_url,
    score: a.score ? a.score.toFixed(1) : 'N/A',
    episodes: a.episodes,
    status: a.airing ? 'ongoing' : (a.status === 'Finished Airing' ? 'finished' : 'upcoming'),
    statusText: a.status,
    type: a.type || 'TV',
    genres: (a.genres || []).map(g => g.name),
    year: a.year || (a.aired?.from ? new Date(a.aired.from).getFullYear() : null),
    synopsis: a.synopsis,
    duration: a.duration,
    rank: a.rank,
    members: a.members,
    trailer: a.trailer?.url
  };
}

// ============================================
// RENDER: HOME (Top + Seasonal + Finished)
// ============================================
async function renderHome() {
  const ongoingGrid  = document.getElementById('ongoingGrid');
  const finishedGrid = document.getElementById('finishedGrid');

  ongoingGrid.innerHTML  = skeletonGrid(10);
  finishedGrid.innerHTML = skeletonGrid(10);

  try {
    // Paralel: seasonal (ongoing) + top (finished)
    const [seasonal, top] = await Promise.all([
      apiGet('/anime', { mode: 'seasonal', limit: '10' }),
      apiGet('/anime', { mode: 'top', limit: '10' })
    ]);

    state.ongoingList  = (seasonal.data || []).map(normalizeAnime);
    state.finishedList = (top.data || []).map(normalizeAnime);

    ongoingGrid.innerHTML  = state.ongoingList.map(cardHTML).join('');
    finishedGrid.innerHTML = state.finishedList.map(cardHTML).join('');

    // Update hero dengan anime top #1
    if (state.finishedList[0]) updateHero(state.finishedList[0]);

    lucide.createIcons();
  } catch (err) {
    console.error('renderHome failed:', err);
    ongoingGrid.innerHTML  = errorGrid('Gagal memuat data anime');
    finishedGrid.innerHTML = '';
    lucide.createIcons();
  }
}

function skeletonGrid(n) {
  return Array.from({ length: n }, () =>
    `<div class="anime-card"><div class="skeleton"></div></div>`
  ).join('');
}

function errorGrid(msg) {
  return `<div class="empty-state" style="display:block; grid-column: 1/-1;">
    <i data-lucide="alert-circle" size="28"></i>${msg}
  </div>`;
}

function cardHTML(a) {
  const statusLabel = a.status === 'ongoing' ? 'ONGOING' : 'FINISHED';
  return `
    <article class="anime-card" data-title="${escapeHtml(a.title)}" onclick="openInfo(${a.malId})">
      <div class="poster">
        <img loading="lazy" src="${a.image}" alt="${escapeHtml(a.title)}" onerror="this.style.display='none'"/>
        <span class="status ${a.status}">${statusLabel}</span>
        <span class="poster-rating"><i data-lucide="star"></i> ${a.score}</span>
      </div>
      <h3 class="anime-title">${escapeHtml(a.title)}</h3>
      <p class="anime-subtitle">${a.genres.slice(0, 2).join(' · ') || a.type}</p>
    </article>`;
}

function updateHero(a) {
  document.getElementById('heroTitle').textContent = a.title;
  document.getElementById('heroRating').textContent = a.score;
  document.getElementById('heroYear').textContent = a.year || '—';
  document.getElementById('heroGenre').textContent = a.genres.slice(0, 2).join(' · ') || a.type;
  document.getElementById('heroDesc').textContent = (a.synopsis || '').slice(0, 180) + '...';
  const featured = document.getElementById('featured');
  featured.style.backgroundImage = `
    linear-gradient(90deg, #101019 0%, rgba(16,16,25,.94) 34%, rgba(16,16,25,.45) 68%, rgba(16,16,25,.12) 100%),
    linear-gradient(0deg, rgba(11,11,16,.8), transparent 60%),
    url('${a.image}')`;
  featured.style.backgroundSize = 'cover';
  featured.style.backgroundPosition = 'center 30%';
  featured.dataset.malId = a.malId;
}

// ============================================
// SEARCH
// ============================================
let searchTimer;
document.getElementById('searchInput').addEventListener('input', e => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (!q) { renderHome(); return; }
  searchTimer = setTimeout(() => doSearch(q), 400);
});

async function doSearch(q) {
  const grid = document.getElementById('ongoingGrid');
  grid.innerHTML = skeletonGrid(10);
  document.getElementById('finishedGrid').innerHTML = '';
  document.getElementById('finishedSection').style.display = 'none';

  try {
    const data = await apiGet('/anime', { mode: 'search', q, limit: '20' });
    const results = (data.data || []).map(normalizeAnime);
    grid.innerHTML = results.length
      ? results.map(cardHTML).join('')
      : errorGrid(`Tidak ada hasil untuk "${q}"`);
    document.getElementById('ongoingTitle').innerHTML =
      '<i data-lucide="search"></i> Hasil Pencarian';
    lucide.createIcons();
  } catch (err) {
    grid.innerHTML = errorGrid('Pencarian gagal, coba lagi');
    lucide.createIcons();
  }
}

// ============================================
// INFO PAGE
// ============================================
async function openInfo(malId) {
  switchPage('info');
  document.getElementById('infoTitle').textContent = 'Memuat...';

  try {
    const [detail, chars, recos] = await Promise.all([
      apiGet('/anime', { mode: 'detail', id: malId }),
      apiGet('/anime', { mode: 'characters', id: malId }),
      apiGet('/anime', { mode: 'recommendations', id: malId })
    ]);

    const a = normalizeAnime(detail.data);
    state.currentAnime = a;

    document.getElementById('infoTitle').textContent      = a.title;
    document.getElementById('infoAlt').textContent        = a.titleEnglish || '';
    document.getElementById('infoRating').textContent     = a.score;
    document.getElementById('infoRatingTxt').textContent  = a.score;
    document.getElementById('infoEps').textContent        = a.episodes ? `${a.episodes} Episode` : '?';
    document.getElementById('infoYear').textContent       = a.year || '—';
    document.getElementById('infoDuration').textContent   = a.duration || '—';
    document.getElementById('infoSynopsis').textContent   = a.synopsis || 'Sinopsis belum tersedia.';

    document.getElementById('infoHero').style.backgroundImage = `url('${a.image}')`;
    document.getElementById('infoPoster').style.backgroundImage = `url('${a.image}')`;

    document.getElementById('infoTags').innerHTML =
      a.genres.map(g => `<span class="tag-pill accent">${escapeHtml(g)}</span>`).join('') +
      `<span class="tag-pill">${a.type}</span>`;

    // Karakter
    document.getElementById('charGrid').innerHTML = (chars.data || []).slice(0, 8).map(c => `
      <div class="char-card">
        <div class="char-avatar" style="background-image:url('${c.character.images?.jpg?.image_url || ''}');"></div>
        <div class="char-info">
          <h4>${escapeHtml(c.character.name)}</h4>
          <small>${c.role}</small>
        </div>
      </div>`).join('');

    // Rekomendasi
    document.getElementById('infoReco').innerHTML = (recos.data || []).slice(0, 6).map(r => {
      const rA = normalizeAnime(r.entry);
      return `
        <div class="reco-card" onclick="openInfo(${rA.malId})">
          <div class="reco-thumb" style="background-image:url('${rA.imageSmall}')">
            <div class="reco-badge"><i data-lucide="star"></i> ${rA.score}</div>
          </div>
          <div class="reco-info">
            <h4>${escapeHtml(rA.title)}</h4>
            <small>${rA.type}</small>
          </div>
        </div>`;
    }).join('');

    document.getElementById('btnWatch').onclick = () => openWatch(malId, 1);
    lucide.createIcons();
  } catch (err) {
    console.error(err);
    document.getElementById('infoTitle').textContent = 'Gagal memuat data';
  }
}

// ============================================
// WATCH PAGE + HLS PLAYER
// ============================================
async function openWatch(malId, ep = 1) {
  switchPage('watch');
  state.currentEpisode = ep;

  const title = state.currentAnime?.title || `Anime #${malId}`;
  document.getElementById('watchTitle').textContent = `${title} — Episode ${ep}`;

  // Render episode list dari Jikan
  renderEpisodeList(malId, ep);

  // Ambil stream link
  const statusEl = document.getElementById('playerStatus');
  if (statusEl) statusEl.textContent = 'Mencari server...';

  try {
    const streamRes = await apiGet('/stream', {
      action: 'watch',
      anime: title,
      ep: String(ep)
    });

    const src = streamRes.defaultSource || streamRes.demo;
    const isDemo = streamRes.demo || !streamRes.success;

    if (statusEl) {
      statusEl.textContent = isDemo
        ? '⚠️ Provider tidak tersedia — menampilkan demo stream'
        : `▶ Streaming dari ${streamRes.provider || 'auto'}`;
    }

    await playStream(src, streamRes.referer);

  } catch (err) {
    console.error('stream error:', err);
    if (statusEl) statusEl.textContent = '❌ Gagal memuat stream';
    await playStream('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
  }
}

async function playStream(m3u8Url, referer = '') {
  const video = document.getElementById('videoPlayer');
  const statusEl = document.getElementById('playerStatus');

  // Bangun URL proxy
  const proxied = `/api/hls?url=${encodeURIComponent(m3u8Url)}${referer ? `&ref=${encodeURIComponent(referer)}` : ''}`;

  // Cleanup player lama
  if (state.hlsInstance) {
    state.hlsInstance.destroy();
    state.hlsInstance = null;
  }

  // HLS.js untuk Chrome/Firefox, Safari native
  if (window.Hls && Hls.isSupported()) {
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      xhrSetup: (xhr) => { xhr.withCredentials = false; }
    });

    hls.loadSource(proxied);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
      if (statusEl) statusEl.textContent = '✅ Stream siap diputar';
    });

    hls.on(Hls.Events.ERROR, (_, data) => {
      console.error('HLS error:', data);
      if (data.fatal) {
        if (statusEl) statusEl.textContent = `⚠️ Stream error: ${data.details}`;
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR: hls.startLoad(); break;
          case Hls.ErrorTypes.MEDIA_ERROR:   hls.recoverMediaError(); break;
          default: hls.destroy();
        }
      }
    });

    state.hlsInstance = hls;
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari native
    video.src = proxied;
    video.play().catch(() => {});
  } else {
    if (statusEl) statusEl.textContent = '❌ Browser tidak mendukung HLS';
  }
}

// Episode list dari Jikan
async function renderEpisodeList(malId, activeEp) {
  const panel = document.getElementById('episodeList');
  panel.innerHTML = '<div style="padding:20px;color:var(--muted);">Memuat episode...</div>';

  try {
    const data = await apiGet('/anime', { mode: 'episodes', id: malId });
    const eps = (data.data || []).slice(0, 100);

    if (!eps.length) {
      panel.innerHTML = '<div style="padding:20px;color:var(--muted);">Daftar episode belum tersedia.</div>';
      return;
    }

    document.getElementById('epTotal').textContent = `${eps.length} Episode`;
    panel.innerHTML = eps.map(e => {
      const epNum = e.mal_id;
      const isActive = epNum === activeEp;
      const isWatched = epNum < activeEp;
      return `
        <div class="ep-row ${isActive ? 'active' : ''} ${isWatched ? 'watched' : ''}"
             onclick="openWatch(${malId}, ${epNum})">
          <div class="ep-num">${isWatched ? '<i data-lucide="check"></i>' : epNum}</div>
          <div class="ep-meta">
            <h4>${escapeHtml(e.title || `Episode ${epNum}`)}</h4>
            <small><i data-lucide="clock"></i> ${e.duration ? Math.round(e.duration/60) + ' menit' : '—'}</small>
          </div>
          <div class="ep-play-icon"><i data-lucide="play-circle"></i></div>
        </div>`;
    }).join('');
    lucide.createIcons();
  } catch {
    panel.innerHTML = '<div style="padding:20px;color:var(--muted);">Gagal memuat episode.</div>';
  }
}

// ============================================
// UTILS
// ============================================
function switchPage(pageId) {
  state.currentPage = pageId;
  document.querySelectorAll('.nav-item').forEach(n =>
    n.classList.toggle('active', n.dataset.page === pageId));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + pageId);
  if (target) target.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  lucide.createIcons();
}

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  renderHome();
  lucide.createIcons();
});
