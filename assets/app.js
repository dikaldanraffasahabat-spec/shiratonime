// ==================================================
// Shiratonime — App Logic
// ==================================================

const API = '/api';

const state = {
  currentPage: 'home',
  searchQuery: '',
  ongoingList: [],
  finishedList: [],
  allList: [],
  currentAnime: null,
  currentEpisode: 1,
  hlsInstance: null,
  history: []
};

let commentsData = [
  { name: 'Aiko_Chan',  initial: 'A', color: '#ff4d6d', time: '2 jam lalu',  badge: 'VIP',     text: 'Animasi fight scene-nya gila sih! 🔥' },
  { name: 'KenjiRyuu',  initial: 'K', color: '#7b61ff', time: '5 jam lalu',  badge: '',        text: 'Ending episode ini bener-bener bikin merinding.' },
  { name: 'SakuraHime', initial: 'S', color: '#52d6a0', time: '1 hari lalu', badge: 'Top Fan', text: 'Moment terbaik sepanjang sejarah anime!' }
];

// ==================================================
// FETCH HELPERS
// ==================================================
async function apiGet(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API}${path}${qs ? '?' + qs : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

function normalizeAnime(a) {
  if (!a) return {};
  return {
    malId: a.mal_id,
    title: a.title || a.title_english || a.title_japanese || 'Untitled',
    titleEnglish: a.title_english,
    titleJapanese: a.title_japanese,
    image: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url,
    imageSmall: a.images?.jpg?.image_url,
    score: a.score ? a.score.toFixed(1) : 'N/A',
    episodes: a.episodes,
    status: a.airing ? 'ongoing'
           : a.status === 'Finished Airing' ? 'finished'
           : 'upcoming',
    statusText: a.status,
    type: a.type || 'TV',
    genres: (a.genres || []).map(g => g.name),
    year: a.year || (a.aired?.from ? new Date(a.aired.from).getFullYear() : null),
    synopsis: a.synopsis,
    duration: a.duration,
    studios: (a.studios || []).map(s => s.name),
    rank: a.rank,
    members: a.members
  };
}

// ==================================================
// UTILS
// ==================================================
function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

// ==================================================
// PAGE SWITCHER
// ==================================================
function switchPage(pageId) {
  state.currentPage = pageId;

  document.querySelectorAll('.nav-item').forEach(n =>
    n.classList.toggle('active', n.dataset.page === pageId)
  );

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + pageId);
  if (target) target.classList.add('active');

  const homeFooter = document.getElementById('homeFooter');
  if (homeFooter) homeFooter.style.display = pageId === 'home' ? '' : 'none';

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (pageId === 'az')      renderAZ();
  if (pageId === 'history') renderHistory();

  lucide.createIcons();
}

// ==================================================
// HOME
// ==================================================
async function renderHome() {
  const ongoingGrid  = document.getElementById('ongoingGrid');
  const finishedGrid = document.getElementById('finishedGrid');

  ongoingGrid.innerHTML  = skeletonGrid(10);
  finishedGrid.innerHTML = skeletonGrid(10);

  try {
    const [seasonal, top] = await Promise.all([
      apiGet('/anime', { mode: 'seasonal', limit: '10' }).catch(() => ({ data: [] })),
      apiGet('/anime', { mode: 'top', limit: '10' }).catch(() => ({ data: [] }))
    ]);

    state.ongoingList  = (seasonal.data || []).map(normalizeAnime);
    state.finishedList = (top.data || []).map(normalizeAnime);
    state.allList      = [...state.ongoingList, ...state.finishedList];

    ongoingGrid.innerHTML  = state.ongoingList.length
      ? state.ongoingList.map(cardHTML).join('')
      : errorGrid('Tidak ada anime ongoing');

    finishedGrid.innerHTML = state.finishedList.length
      ? state.finishedList.map(cardHTML).join('')
      : errorGrid('Tidak ada anime finished');

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
    <i data-lucide="alert-circle" size="28"></i>${escapeHtml(msg)}
  </div>`;
}

function cardHTML(a) {
  const statusLabel = a.status === 'ongoing' ? 'ONGOING'
                    : a.status === 'finished' ? 'FINISHED'
                    : 'UPCOMING';
  return `
    <article class="anime-card" data-title="${escapeHtml(a.title)}" onclick="openInfo(${a.malId})">
      <div class="poster">
        <img loading="lazy" src="${a.image}" alt="${escapeHtml(a.title)}" onerror="this.style.display='none'"/>
        <span class="status ${a.status}">${statusLabel}</span>
        <span class="poster-rating">
          <i data-lucide="star"></i> ${a.score}
        </span>
      </div>
      <h3 class="anime-title">${escapeHtml(a.title)}</h3>
      <p class="anime-subtitle">${escapeHtml(a.genres.slice(0, 2).join(' · ') || a.type)}</p>
    </article>
  `;
}

function updateHero(a) {
  state.currentAnime = a;
  document.getElementById('heroTitle').textContent  = a.title;
  document.getElementById('heroRating').textContent = a.score;
  document.getElementById('heroYear').textContent   = a.year || '—';
  document.getElementById('heroGenre').textContent  = a.genres.slice(0, 2).join(' · ') || a.type;
  document.getElementById('heroDesc').textContent   = (a.synopsis || '').slice(0, 180) + (a.synopsis?.length > 180 ? '...' : '');

  const featured = document.getElementById('featured');
  featured.style.backgroundImage = `
    linear-gradient(90deg, #101019 0%, rgba(16,16,25,.94) 34%, rgba(16,16,25,.45) 68%, rgba(16,16,25,.12) 100%),
    linear-gradient(0deg, rgba(11,11,16,.8), transparent 60%),
    url('${a.image}')`;
  featured.style.backgroundSize = 'cover';
  featured.style.backgroundPosition = 'center 30%';
}

// ==================================================
// SEARCH
// ==================================================
let searchTimer;
const searchInput = document.getElementById('searchInput');
const searchBox   = document.getElementById('searchBox');

if (searchInput) {
  searchInput.addEventListener('input', e => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    state.searchQuery = q.toLowerCase();

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-home').classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n =>
      n.classList.toggle('active', n.dataset.page === 'home')
    );
    document.getElementById('homeFooter').style.display = '';

    if (!q) { renderHome(); return; }
    searchTimer = setTimeout(() => doSearch(q), 400);
  });
}

async function doSearch(q) {
  const grid = document.getElementById('ongoingGrid');
  const finishedSection = document.getElementById('finishedSection');

  grid.innerHTML = skeletonGrid(10);
  finishedSection.style.display = 'none';

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

// ==================================================
// A-Z
// ==================================================
let currentLetter = 'ALL';

async function renderAZ() {
  const letters = ['ALL', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
  const bar = document.getElementById('alphaBar');

  bar.innerHTML = letters.map(l => `
    <button class="alpha-btn ${l === currentLetter ? 'active' : ''}"
            onclick="pickLetter('${l}')">${l}</button>
  `).join('');

  const grid = document.getElementById('azGrid');
  const empty = document.getElementById('azEmpty');

  grid.innerHTML = skeletonGrid(15);
  empty.style.display = 'none';

  if (state.allList.length === 0) {
    try {
      const data = await apiGet('/anime', { mode: 'top', limit: '25' });
      state.allList = (data.data || []).map(normalizeAnime);
    } catch {}
  }

  let data = [...state.allList].sort((a, b) => a.title.localeCompare(b.title));
  if (currentLetter !== 'ALL') {
    data = data.filter(a => a.title.toUpperCase().startsWith(currentLetter));
  }

  if (data.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
  } else {
    grid.innerHTML = data.map(cardHTML).join('');
    empty.style.display = 'none';
  }

  document.getElementById('azCount').textContent = `${data.length} anime`;
  lucide.createIcons();
}

function pickLetter(l) {
  currentLetter = l;
  renderAZ();
}

// ==================================================
// RIWAYAT
// ==================================================
function loadHistory() {
  try {
    state.history = JSON.parse(localStorage.getItem('shiratonime_history') || '[]');
  } catch { state.history = []; }
}

function saveToHistory(anime) {
  const entry = {
    malId: anime.malId,
    title: anime.title,
    image: anime.image,
    ep: state.currentEpisode,
    time: new Date().toISOString()
  };
  state.history = state.history.filter(h => h.malId !== anime.malId);
  state.history.unshift(entry);
  state.history = state.history.slice(0, 20);
  localStorage.setItem('shiratonime_history', JSON.stringify(state.history));
}

function renderHistory() {
  const list = document.getElementById('historyList');
  const count = document.getElementById('historyCount');

  if (state.history.length === 0) {
    list.innerHTML = `<div class="empty-state" style="display:block">
      <i data-lucide="history" size="28"></i>
      Belum ada riwayat tontonan.
    </div>`;
    count.textContent = '';
    lucide.createIcons();
    return;
  }

  list.innerHTML = state.history.map(h => {
    const timeAgo = formatTimeAgo(new Date(h.time));
    return `
      <div class="history-item" onclick="openInfo(${h.malId})">
        <div class="history-thumb">
          <img src="${h.image || ''}" alt="${escapeHtml(h.title)}">
        </div>
        <div class="history-info">
          <h4>${escapeHtml(h.title)}</h4>
          <small>
            <i data-lucide="monitor-play"></i> Episode ${h.ep}
            <span style="opacity:0.4">·</span>
            <i data-lucide="clock"></i> ${timeAgo}
          </small>
        </div>
        <button class="history-play" onclick="event.stopPropagation(); openWatch(${h.malId}, ${h.ep})">
          <i data-lucide="play"></i>
        </button>
      </div>
    `;
  }).join('');

  count.textContent = `${state.history.length} terakhir`;
  lucide.createIcons();
}

function formatTimeAgo(date) {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60)     return 'Baru saja';
  if (diff < 3600)   return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)} jam lalu`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} hari lalu`;
  return date.toLocaleDateString('id-ID');
}

// ==================================================
// INFO PAGE
// ==================================================
async function openInfo(malId) {
  if (!malId) return;
  switchPage('info');

  document.getElementById('infoTitle').textContent = 'Memuat...';
  document.getElementById('infoSynopsis').textContent = 'Memuat sinopsis...';

  try {
    const [detail, chars, recos] = await Promise.all([
      apiGet('/anime', { mode: 'detail', id: malId }),
      apiGet('/anime', { mode: 'characters', id: malId }).catch(() => ({ data: [] })),
      apiGet('/anime', { mode: 'recommendations', id: malId }).catch(() => ({ data: [] }))
    ]);

    const a = normalizeAnime(detail.data);
    state.currentAnime = a;

    document.getElementById('infoTitle').textContent      = a.title;
    document.getElementById('infoAlt').textContent        = a.titleEnglish || a.titleJapanese || '';
    document.getElementById('infoRating').textContent     = a.score;
    document.getElementById('infoRatingTxt').textContent  = a.score;
    document.getElementById('infoEps').textContent        = a.episodes ? `${a.episodes} Episode` : '?';
    document.getElementById('infoYear').textContent       = a.year || '—';
    document.getElementById('infoDuration').textContent   = a.duration || '—';
    document.getElementById('infoSynopsis').textContent   = a.synopsis || 'Sinopsis belum tersedia.';

    document.getElementById('infoHero').style.backgroundImage = `url('${a.image}')`;
    document.getElementById('infoPoster').style.backgroundImage = `url('${a.image}')`;

    document.getElementById('infoTags').innerHTML =
      a.genres.slice(0, 5).map(g =>
        `<span class="tag-pill accent">${escapeHtml(g)}</span>`
      ).join('') + `<span class="tag-pill">${a.type}</span>`;

    document.getElementById('infoDetailJp').textContent       = a.titleJapanese || '—';
    document.getElementById('infoDetailStudio').textContent   = a.studios[0] || '—';
    document.getElementById('infoDetailType').textContent     = a.type;
    document.getElementById('infoDetailStatus').textContent   = a.statusText || '—';
    document.getElementById('infoDetailStatus').style.color   =
      a.status === 'ongoing' ? 'var(--green)'
      : a.status === 'finished' ? 'var(--primary-light)'
      : 'var(--yellow)';
    document.getElementById('infoDetailDuration').textContent = a.duration || '—';
    document.getElementById('infoDetailScore').textContent    = a.score;

    // Karakter
    const charData = (chars.data || []).slice(0, 8);
    document.getElementById('charGrid').innerHTML = charData.length ? charData.map(c => {
      const img = c.character?.images?.jpg?.image_url || '';
      const initial = (c.character?.name || '?')[0];
      return `
        <div class="char-card">
          <div class="char-avatar" style="background-image:url('${img}')">
            ${img ? '' : escapeHtml(initial)}
          </div>
          <div class="char-info">
            <h4>${escapeHtml(c.character?.name || '?')}</h4>
            <small>${escapeHtml(c.role || '')}</small>
          </div>
        </div>`;
    }).join('') : `<div class="empty-state" style="display:block; grid-column:1/-1;">
      <i data-lucide="users" size="28"></i>Data karakter belum tersedia
    </div>`;

    // Rekomendasi
    const recoData = (recos.data || []).slice(0, 6);
    document.getElementById('infoReco').innerHTML = recoData.length ? recoData.map(r => {
      const rA = normalizeAnime(r.entry);
      return `
        <div class="reco-card" onclick="openInfo(${rA.malId})">
          <div class="reco-thumb" style="background-image:url('${rA.imageSmall || rA.image}')">
            <div class="reco-badge"><i data-lucide="star"></i> ${rA.score}</div>
          </div>
          <div class="reco-info">
            <h4>${escapeHtml(rA.title)}</h4>
            <small>${escapeHtml(rA.type)}</small>
          </div>
        </div>`;
    }).join('') : `<div class="empty-state" style="display:block; grid-column:1/-1;">
      <i data-lucide="sparkles" size="28"></i>Belum ada rekomendasi
    </div>`;

    document.getElementById('btnWatch').onclick = () => openWatch(malId, 1);

    lucide.createIcons();
  } catch (err) {
    console.error('openInfo error:', err);
    document.getElementById('infoTitle').textContent = 'Gagal memuat data';
    document.getElementById('infoSynopsis').textContent = 'Terjadi kesalahan saat memuat info anime.';
  }
}

// ==================================================
// WATCH PAGE
// ==================================================
async function openWatch(malId, ep = 1) {
  if (!malId) return;
  switchPage('watch');
  state.currentEpisode = ep;

  // Pastikan currentAnime ada
  if (!state.currentAnime || state.currentAnime.malId !== malId) {
    try {
      const detail = await apiGet('/anime', { mode: 'detail', id: malId });
      state.currentAnime = normalizeAnime(detail.data);
    } catch {
      state.currentAnime = { malId, title: `Anime #${malId}`, synopsis: '' };
    }
  }

  const title = state.currentAnime.title;
  document.getElementById('watchTitle').textContent = `${title} — Episode ${ep}`;
  document.getElementById('watchSynopsis').textContent = state.currentAnime.synopsis || 'Sinopsis belum tersedia.';

  renderEpisodeList(malId, ep);
  renderComments();
  renderWatchReco();
  saveToHistory(state.currentAnime);

  const statusEl = document.getElementById('playerStatus');
  statusEl.textContent = '🔍 Mencari server streaming...';

  try {
    const streamRes = await apiGet('/stream', {
      action: 'watch',
      anime: title,
      ep: String(ep)
    });

    const src = streamRes.defaultSource || streamRes.demo;
    const isDemo = streamRes.demo || !streamRes.success;

    statusEl.textContent = isDemo
      ? '⚠️ Provider tidak tersedia — menampilkan demo stream'
      : `▶ Streaming dari ${streamRes.provider || 'auto'} — Episode ${streamRes.episode || ep}`;

    await playStream(src, streamRes.referer);

    // Update judul dengan judul episode asli jika tersedia
    if (streamRes.episodeTitle) {
      document.getElementById('watchTitle').textContent = `${title} — ${streamRes.episodeTitle}`;
    }
  } catch (err) {
    console.error('stream error:', err);
    statusEl.textContent = '❌ Gagal memuat stream, mencoba demo...';
    await playStream('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
  }
}

async function playStream(m3u8Url, referer = '') {
  const video = document.getElementById('videoPlayer');
  const statusEl = document.getElementById('playerStatus');

  const proxied = `/api/hls?url=${encodeURIComponent(m3u8Url)}${referer ? `&ref=${encodeURIComponent(referer)}` : ''}`;

  if (state.hlsInstance) {
    state.hlsInstance.destroy();
    state.hlsInstance = null;
  }

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
      if (statusEl && !statusEl.textContent.includes('demo')) {
        statusEl.textContent = '✅ Stream siap diputar';
      }
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
    video.src = proxied;
    video.play().catch(() => {});
  } else {
    if (statusEl) statusEl.textContent = '❌ Browser tidak mendukung HLS';
  }
}

async function renderEpisodeList(malId, activeEp) {
  const panel = document.getElementById('episodeList');
  panel.innerHTML = '<div style="padding:20px;color:var(--muted);">Memuat episode...</div>';

  try {
    const data = await apiGet('/anime', { mode: 'episodes', id: malId });
    const eps = (data.data || []).slice(0, 200);

    if (!eps.length) {
      panel.innerHTML = '<div style="padding:20px;color:var(--muted);">Daftar episode belum tersedia.</div>';
      document.getElementById('epTotal').textContent = '—';
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
            <small><i data-lucide="clock"></i> ${e.duration ? Math.round(e.duration / 60) + ' menit' : '—'}</small>
          </div>
          <div class="ep-play-icon"><i data-lucide="play-circle"></i></div>
        </div>`;
    }).join('');

    const searchEl = document.getElementById('epSearch');
    searchEl.value = '';
    searchEl.oninput = (e) => {
      const q = e.target.value.toLowerCase().trim();
      document.querySelectorAll('.ep-row').forEach(row => {
        const txt = row.querySelector('h4').textContent.toLowerCase();
        row.style.display = txt.includes(q) ? '' : 'none';
      });
    };

    lucide.createIcons();
  } catch {
    panel.innerHTML = '<div style="padding:20px;color:var(--muted);">Gagal memuat episode.</div>';
  }
}

function renderComments() {
  const list = document.getElementById('commentList');
  if (!list) return;

  list.innerHTML = commentsData.map(c => `
    <div class="comment-item">
      <div class="avatar" style="background: linear-gradient(135deg, ${c.color}, ${c.color}aa);">${c.initial}</div>
      <div class="comment-body">
        <div class="comment-head">
          <strong>${escapeHtml(c.name)}</strong>
          ${c.badge ? `<span class="cmt-badge">${escapeHtml(c.badge)}</span>` : ''}
          <small><i data-lucide="clock"></i> ${escapeHtml(c.time)}</small>
        </div>
        <p>${escapeHtml(c.text)}</p>
        <div class="comment-acts">
          <button onclick="alert('Like (Demo)')"><i data-lucide="thumbs-up"></i> Suka</button>
          <button onclick="alert('Balas (Demo)')"><i data-lucide="reply"></i> Balas</button>
        </div>
      </div>
    </div>
  `).join('');
  lucide.createIcons();
}

function addComment() {
  const input = document.getElementById('commentInput');
  const text = input.value.trim();
  if (!text) return;

  commentsData.unshift({
    name: 'Shiro', initial: 'S', color: '#9b72ff',
    time: 'Baru saja', badge: 'Kamu', text
  });
  input.value = '';
  renderComments();
}

function renderWatchReco() {
  const others = state.allList.filter(a => a.malId !== state.currentAnime?.malId).slice(0, 6);
  const grid = document.getElementById('watchReco');
  if (!grid) return;

  if (others.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="display:block">
      <i data-lucide="sparkles" size="28"></i>Belum ada rekomendasi
    </div>`;
  } else {
    grid.innerHTML = others.map(a => `
      <div class="reco-card" onclick="openInfo(${a.malId})">
        <div class="reco-thumb" style="background-image: url('${a.imageSmall || a.image}')">
          <div class="reco-badge"><i data-lucide="star"></i> ${a.score}</div>
        </div>
        <div class="reco-info">
          <h4>${escapeHtml(a.title)}</h4>
          <small>${escapeHtml(a.type)}</small>
        </div>
      </div>
    `).join('');
  }
  lucide.createIcons();
}

function switchWT(btn, panelId) {
  document.querySelectorAll('.wt-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.wt-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(panelId).classList.add('active');
}

function toggleAct(el) {
  el.classList.toggle('on');
  lucide.createIcons();
}

function prevEpisode() {
  if (state.currentEpisode > 1 && state.currentAnime?.malId) {
    openWatch(state.currentAnime.malId, state.currentEpisode - 1);
  }
}

function nextEpisode() {
  if (state.currentAnime?.malId) {
    openWatch(state.currentAnime.malId, state.currentEpisode + 1);
  }
}

// ==================================================
// MODAL
// ==================================================
function openModal(title, desc) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalDescription').textContent = desc;
  document.getElementById('detailModal').classList.add('show');
  lucide.createIcons();
}

function closeModal() {
  document.getElementById('detailModal').classList.remove('show');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

// ==================================================
// INIT
// ==================================================
document.addEventListener('DOMContentLoaded', () => {
  loadHistory();
  renderHome();
  renderComments();
  lucide.createIcons();

  // Hero buttons
  document.getElementById('heroWatchBtn')?.addEventListener('click', () => {
    if (state.currentAnime?.malId) openWatch(state.currentAnime.malId, 1);
  });
  document.getElementById('heroInfoBtn')?.addEventListener('click', () => {
    if (state.currentAnime?.malId) openInfo(state.currentAnime.malId);
  });

  // Watch page info button
  document.getElementById('watchInfoBtn')?.addEventListener('click', () => {
    if (state.currentAnime?.malId) openInfo(state.currentAnime.malId);
  });

  // Mobile search expand
  if (window.innerWidth <= 390 && searchBox) {
    searchBox.addEventListener('click', () => searchBox.classList.add('expanded'));
    document.addEventListener('click', e => {
      if (!searchBox.contains(e.target)) searchBox.classList.remove('expanded');
    });
  }
});

// Expose ke global (dipakai onclick di HTML)
window.switchPage = switchPage;
window.openInfo = openInfo;
window.openWatch = openWatch;
window.openModal = openModal;
window.closeModal = closeModal;
window.pickLetter = pickLetter;
window.switchWT = switchWT;
window.toggleAct = toggleAct;
window.addComment = addComment;
window.prevEpisode = prevEpisode;
window.nextEpisode = nextEpisode;
