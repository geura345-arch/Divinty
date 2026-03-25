/* ═══════════════════════════════════════════════════
   DIVINTYCLASS — app.js
   PENTING: File ini BUKAN type="module"
   Semua fungsi harus global supaya onclick HTML bisa akses
   ═══════════════════════════════════════════════════ */

// ─── CONSTANTS ───
var ADMIN_PASS   = 'Divinty2025';
var STUDENT_PASS = 'Divintystudent';
var ADMIN_KEY    = '__admin__';

var DEFAULT_SUBJECTS = [
  'Matematika','Bahasa Indonesia','Bahasa Inggris','Fisika','Kimia',
  'Biologi','Sejarah','Geografi','Ekonomi','Sosiologi'
];

var MOODS = [
  {emoji:'😀',label:'Senang'},  {emoji:'😊',label:'Bahagia'},
  {emoji:'😐',label:'Biasa'},   {emoji:'😔',label:'Sedih'},
  {emoji:'😤',label:'Kesal'},   {emoji:'😴',label:'Ngantuk'},
  {emoji:'🤩',label:'Excited'}, {emoji:'😰',label:'Cemas'},
  {emoji:'🤒',label:'Sakit'},   {emoji:'🥳',label:'Pesta'},
  {emoji:'🧐',label:'Fokus'},   {emoji:'😅',label:'Capek'}
];

// ─── STATE ───
var currentUser  = null;
var currentSem   = 1;
var gradeChart   = null;
var avgChart     = null;
var announcementFilter = 'all';
var currentRankCat = 'overall';
var isSaving = false;
var isInitialLoad = true;

// ─── DB STRUCTURE ───
var DB = {
  users: {}, grades: {}, notifications: {},
  avatars: {}, moods: {}, online: {},
  announcements: {}, absensi: {}
};

// ─── FIREBASE INIT ───
// Tunggu Firebase module selesai load dulu baru jalankan loadDB
function waitForFirebase(cb) {
  if (window.db && window.dbRef) {
    cb();
  } else {
    window.addEventListener('firebase-ready', cb, { once: true });
  }
}

// ─── LOAD DB ───
function loadDB() {
  waitForFirebase(function() {
    var dbRef = window.dbRef(window.db, 'divinty_v3');
    window.dbOnValue(dbRef, function(snapshot) {
      var data = snapshot.val();
      if (data) {
        DB = {
          users: data.users || {},
          grades: data.grades || {},
          notifications: data.notifications || {},
          avatars: data.avatars || {},
          moods: data.moods || {},
          online: data.online || {},
          // announcements bisa object atau array dari Firebase → normalkan ke object
          announcements: data.announcements || {},
          absensi: data.absensi || {}
        };
      }
      if (!isInitialLoad) {
        // Realtime update saat app sudah jalan
        if (document.getElementById('page-app').classList.contains('active')) {
          renderDashboard();
          updateBadge();
          var activeSection = document.querySelector('.section.active');
          if (activeSection) {
            var sid = activeSection.id.replace('section-', '');
            if (sid === 'tugas') renderTasks(announcementFilter);
          }
        }
      }
      isInitialLoad = false;
    });
  });
}

// ─── SAVE DB ───
// Simpan hanya node yang berubah supaya lebih efisien
function saveDB() {
  if (isSaving) return;
  isSaving = true;
  waitForFirebase(function() {
    var key = currentUser ? (currentUser.username || ADMIN_KEY) : ADMIN_KEY;
    if (!DB.online) DB.online = {};
    DB.online[key] = Date.now();

    var updates = {};
    updates['divinty_v3/users']         = DB.users;
    updates['divinty_v3/grades']        = DB.grades;
    updates['divinty_v3/notifications'] = DB.notifications;
    updates['divinty_v3/avatars']       = DB.avatars;
    updates['divinty_v3/moods']         = DB.moods;
    updates['divinty_v3/online']        = DB.online;
    updates['divinty_v3/announcements'] = DB.announcements;
    updates['divinty_v3/absensi']       = DB.absensi;

    window.dbUpdate(window.dbRef(window.db), updates)
      .catch(function(e) { console.error('Firebase Save Error:', e); })
      .finally(function() { setTimeout(function() { isSaving = false; }, 400); });
  });
}

// Helper: announcements bisa object atau array, normalkan ke array
function getAnnouncements() {
  var ann = DB.announcements;
  if (!ann) return [];
  if (Array.isArray(ann)) return ann;
  // Firebase object → array
  return Object.values(ann).filter(Boolean);
}

// Helper: simpan announcement baru ke DB
function pushAnnouncement(ann) {
  if (!DB.announcements || Array.isArray(DB.announcements)) {
    DB.announcements = {};
  }
  DB.announcements[ann.id] = ann;
}

// Helper: hapus announcement
function removeAnnouncement(id) {
  if (Array.isArray(DB.announcements)) {
    DB.announcements = DB.announcements.filter(function(a) { return a.id != id; });
  } else {
    delete DB.announcements[id];
  }
}

// ─── TOAST ───
var toastTimer;
function showToast(msg, type, icon) {
  type = type || 'info';
  icon = icon || 'ℹ️';
  var el = document.getElementById('toast');
  el.className = 'toast ' + type;
  document.getElementById('toast-msg').textContent = msg;
  document.getElementById('toast-icon').textContent = icon;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { el.classList.remove('show'); }, 3200);
}

// ─── NOTIFICATIONS ───
function addNotif(userKey, title, body, type) {
  type = type || 'info';
  if (!DB.notifications[userKey]) DB.notifications[userKey] = {};
  var id = Date.now() + '_' + Math.random().toString(36).substr(2,5);
  DB.notifications[userKey][id] = { id: id, title: title, body: body, type: type, time: new Date().toISOString(), read: false };
}

function getNotifications(userKey) {
  var notifs = DB.notifications[userKey];
  if (!notifs) return [];
  if (Array.isArray(notifs)) return notifs;
  return Object.values(notifs).filter(Boolean).sort(function(a,b) { return new Date(b.time) - new Date(a.time); });
}

function updateBadge() {
  var key = currentUser ? (currentUser.username || ADMIN_KEY) : ADMIN_KEY;
  var unread = getNotifications(key).filter(function(n) { return !n.read; }).length;
  ['topbar-badge','box-badge'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) { el.textContent = unread; el.style.display = unread ? 'flex' : 'none'; }
  });
}

// ─── LOGIN ───
function switchLoginTab(tab, btn) {
  document.querySelectorAll('.login-tab').forEach(function(t) { t.classList.remove('active'); });
  btn.classList.add('active');
  document.getElementById('form-siswa').style.display   = tab === 'siswa' ? 'block' : 'none';
  document.getElementById('form-admin').style.display   = tab === 'admin' ? 'block' : 'none';
  document.getElementById('form-register').style.display = 'none';
}

function showRegister() {
  document.getElementById('form-siswa').style.display    = 'none';
  document.getElementById('form-admin').style.display    = 'none';
  document.getElementById('form-register').style.display = 'block';
}

function showLogin() {
  document.getElementById('form-siswa').style.display    = 'block';
  document.getElementById('form-admin').style.display    = 'none';
  document.getElementById('form-register').style.display = 'none';
}

function doLogin() {
  var username = document.getElementById('login-username').value.trim().toLowerCase().replace(/\s/g,'_');
  var password = document.getElementById('login-password').value;
  if (!username || !password) { showToast('Isi username dan password!','error','⚠️'); return; }
  var user = DB.users[username];
  if (!user || user.password !== password) { showToast('Username atau password salah!','error','❌'); return; }
  loginAs(user);
}

function doAdminLogin() {
  var pass = document.getElementById('admin-password').value;
  if (pass !== ADMIN_PASS) { showToast('Password admin salah!','error','❌'); return; }
  loginAs({ username: ADMIN_KEY, name: 'Admin', isAdmin: true });
}

function doRegister() {
  var name     = document.getElementById('reg-name').value.trim();
  var dob      = document.getElementById('reg-dob').value;
  var password = document.getElementById('reg-password').value;
  if (!name || !dob || !password) { showToast('Lengkapi semua field!','error','⚠️'); return; }
  if (password !== STUDENT_PASS)  { showToast('Password salah! Gunakan: ' + STUDENT_PASS,'error','❌'); return; }
  var username = name.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
  if (DB.users[username]) { showToast('Username sudah dipakai! Coba nama lain','error','⚠️'); return; }
  DB.users[username] = { username: username, name: name, dob: dob, password: password, joinDate: new Date().toISOString(), isSubAdmin: false };
  DB.absensi[username] = true;
  addNotif(username, '🎉 Selamat Datang!', 'Halo ' + name + '! Akun kamu berhasil dibuat.', 'system');
  saveDB();
  showToast('Akun ' + name + ' berhasil dibuat!','success','🎉');
  showLogin();
  document.getElementById('login-username').value = username;
}

function loginAs(user) {
  currentUser = user;
  if (!DB.online) DB.online = {};
  DB.online[user.username || ADMIN_KEY] = Date.now();
  saveDB();
  switchPage('app');
  initApp();
  showToast('Selamat datang, ' + user.name + '! 👋','success','✅');
}

// ─── PAGES & SECTIONS ───
function switchPage(page) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.getElementById('page-' + page).classList.add('active');
}

function showSection(id, navEl, mode) {
  document.querySelectorAll('.section').forEach(function(s) { s.classList.remove('active'); });
  var target = document.getElementById('section-' + id);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
  if (navEl) navEl.classList.add('active');

  if (mode === 'mobile') {
    document.querySelectorAll('.mobile-nav-item').forEach(function(n) { n.classList.remove('active'); });
    event && event.currentTarget && event.currentTarget.classList.add('active');
  }

  var renders = {
    dashboard:  function() { renderDashboard(); },
    tugas:      function() { renderTasks(announcementFilter); },
    kelompok:   function() { renderKelompokPage(); },
    nilai:      function() { renderGrades(); },
    rank:       function() { renderRank(); },
    profile:    function() { renderProfile(); },
    divintybox: function() { renderNotifications(); updateBadge(); },
    admin:      function() { renderAdmin(); }
  };
  if (renders[id]) renders[id]();
}

// ─── SIDEBAR ───
var sidebarExpanded = false;
function toggleSidebar() {
  sidebarExpanded = !sidebarExpanded;
  document.getElementById('sidebar').classList.toggle('expanded', sidebarExpanded);
  document.getElementById('main-content').classList.toggle('shifted', sidebarExpanded);
  document.getElementById('sidebar-toggle-btn').textContent = sidebarExpanded ? '⟨' : '⟩';
}

// ─── INIT APP ───
function initApp() {
  var isAdmin = currentUser && (currentUser.isAdmin || currentUser.isSubAdmin);
  var name    = currentUser ? currentUser.name : 'Admin';

  var hour  = new Date().getHours();
  var greet = hour < 12 ? 'Selamat Pagi ☀️' : hour < 17 ? 'Selamat Siang 🌤️' : 'Selamat Malam 🌙';
  document.getElementById('topbar-greeting').textContent = greet;
  document.getElementById('topbar-name').textContent = name;

  var av = document.getElementById('topbar-avatar');
  av.textContent = name.charAt(0).toUpperCase();
  var key = currentUser ? (currentUser.username || ADMIN_KEY) : ADMIN_KEY;
  if (DB.avatars && DB.avatars[key]) {
    av.style.backgroundImage = 'url(' + DB.avatars[key] + ')';
    av.style.backgroundSize = 'cover';
    av.textContent = '';
  }

  document.getElementById('admin-nav').style.display = isAdmin ? 'flex' : 'none';

  initMoodGrid();
  updateBadge();
  initCountdown();
  renderDashboard();

  setInterval(function() {
    if (currentUser) {
      DB.online[currentUser.username || ADMIN_KEY] = Date.now();
      saveDB();
    }
  }, 30000);
  setInterval(function() { tickCountdown(); updateBadge(); }, 1000);
  setInterval(function() {
    if (document.getElementById('section-dashboard').classList.contains('active')) updateStatCards();
  }, 15000);
}

// ─── DASHBOARD ───
function renderDashboard() {
  updateStatCards();
  renderDashAnnouncements();
  renderDashTop3();
  if (currentUser) {
    var key = currentUser.username || ADMIN_KEY;
    var mood = DB.moods && DB.moods[key];
    if (mood) {
      document.getElementById('current-mood-display').textContent = mood.emoji;
      document.getElementById('current-mood-label').textContent   = mood.label;
      document.getElementById('profile-mood-stat').textContent    = mood.emoji;
      var msg = document.getElementById('mood-selected-msg');
      if (msg) { msg.style.display = 'block'; msg.textContent = 'Mood hari ini: ' + mood.emoji + ' ' + mood.label; }
    }
  }
}

function updateStatCards() {
  document.getElementById('stat-members').textContent = Object.keys(DB.users || {}).length;
  document.getElementById('stat-online').textContent  = countOnline();

  if (currentUser && !currentUser.isAdmin) {
    var avg  = calcUserAvg(currentUser.username);
    var rank = getUserRank(currentUser.username);
    document.getElementById('stat-avg').textContent  = avg  ? avg.toFixed(1) : '—';
    document.getElementById('stat-rank').textContent = rank ? '#' + rank : '#—';
  } else {
    document.getElementById('stat-avg').textContent  = '—';
    document.getElementById('stat-rank').textContent = '#—';
  }
}

function renderDashAnnouncements() {
  var el   = document.getElementById('dash-announcements');
  var list = getAnnouncements().sort(function(a,b){ return new Date(b.date)-new Date(a.date); });
  if (!list.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>Belum ada pengumuman</p></div>';
    return;
  }
  el.innerHTML = list.slice(0,3).map(function(a) {
    return '<div class="ann-card ' + a.type + '">' +
      '<div class="ann-card-top"><span class="ann-badge ' + a.type + '">' + (a.type==='tugas'?'✏️ Tugas':a.type==='kelompok'?'👥 Kelompok':'ℹ️ Info') + '</span>' +
      (a.subject ? '<span style="font-size:0.74rem;color:var(--text-muted)">' + a.subject + '</span>' : '') + '</div>' +
      '<div class="ann-title">' + a.title + '</div>' +
      '<div class="ann-body">' + a.body + '</div>' +
      '<div class="ann-meta"><span>👤 ' + a.author + '</span><span>🕐 ' + formatDate(a.date) + '</span>' +
      (a.deadline ? '<span class="text-red">⏰ ' + formatDate(a.deadline) + '</span>' : '') + '</div></div>';
  }).join('');
}

function renderDashTop3() {
  var el     = document.getElementById('dash-top3');
  var ranked = getRankedUsers();
  if (!ranked.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🏆</div><p>Belum ada data nilai</p></div>';
    return;
  }
  var medals = ['🥇','🥈','🥉'];
  el.innerHTML = ranked.slice(0,3).map(function(u,i) {
    return '<div class="rank-item">' +
      '<div class="rank-num">' + medals[i] + '</div>' +
      '<div class="member-avatar">' + u.name.charAt(0) + '</div>' +
      '<div class="rank-info"><div class="rank-name">' + u.name + '</div><div class="rank-score">' + u.avg.toFixed(1) + ' rata-rata</div></div>' +
      '</div>';
  }).join('');
}

// ─── MOOD ───
function initMoodGrid() {
  var grid = document.getElementById('mood-grid');
  if (!grid) return;
  grid.innerHTML = MOODS.map(function(m,i) {
    return '<div class="mood-item" id="mood-item-' + i + '" onclick="selectMood(' + i + ')">' +
      '<span class="mood-emoji">' + m.emoji + '</span><span>' + m.label + '</span></div>';
  }).join('');

  var key  = currentUser ? (currentUser.username || ADMIN_KEY) : ADMIN_KEY;
  var saved = DB.moods && DB.moods[key];
  if (saved) {
    var idx = MOODS.findIndex(function(m) { return m.emoji === saved.emoji; });
    if (idx >= 0) { var el = document.getElementById('mood-item-' + idx); if (el) el.classList.add('selected'); }
  }
}

function selectMood(i) {
  document.querySelectorAll('.mood-item').forEach(function(m) { m.classList.remove('selected'); });
  var item = document.getElementById('mood-item-' + i);
  if (item) item.classList.add('selected');
  var mood = MOODS[i];
  var key  = currentUser ? (currentUser.username || ADMIN_KEY) : ADMIN_KEY;
  if (!DB.moods) DB.moods = {};
  DB.moods[key] = { emoji: mood.emoji, label: mood.label, time: Date.now() };
  saveDB();
  var msg = document.getElementById('mood-selected-msg');
  if (msg) { msg.style.display = 'block'; msg.textContent = 'Mood hari ini: ' + mood.emoji + ' ' + mood.label; }
  document.getElementById('current-mood-display').textContent = mood.emoji;
  document.getElementById('current-mood-label').textContent   = mood.label;
  document.getElementById('profile-mood-stat').textContent    = mood.emoji;
}

// ─── COUNTDOWN ───
function initCountdown() {
  var users = Object.values(DB.users || {}).filter(function(u) { return u.dob; });
  if (!users.length) {
    document.getElementById('birthday-name').textContent = 'Belum ada data ulang tahun';
    return;
  }
  var now = new Date(), minDiff = Infinity, nextUser = null, nextBday = null;
  users.forEach(function(u) {
    var dob  = new Date(u.dob);
    var bday = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
    if (bday <= now) bday.setFullYear(now.getFullYear() + 1);
    var diff = bday - now;
    if (diff < minDiff) { minDiff = diff; nextBday = bday; nextUser = u; }
  });
  if (nextUser) {
    document.getElementById('birthday-name').textContent = '🎂 ' + nextUser.name;
    window._nextBirthday = nextBday;
  }
}

function tickCountdown() {
  if (!window._nextBirthday) return;
  var diff = window._nextBirthday - new Date();
  if (diff < 0) { initCountdown(); return; }
  var d = Math.floor(diff / 86400000); diff %= 86400000;
  var h = Math.floor(diff / 3600000);  diff %= 3600000;
  var m = Math.floor(diff / 60000);    diff %= 60000;
  var s = Math.floor(diff / 1000);
  var f = function(n) { return String(n).padStart(2,'0'); };
  var ids = ['cd-days','cd-hours','cd-mins','cd-secs'];
  [d,h,m,s].forEach(function(v,i) { var el = document.getElementById(ids[i]); if (el) el.textContent = f(v); });
}

// ─── TASKS ───
function filterTasks(type, btn) {
  announcementFilter = type;
  document.querySelectorAll('.filter-tab').forEach(function(t) { t.classList.remove('active'); });
  btn.classList.add('active');
  renderTasks(type);
}

function renderTasks(filter) {
  filter = filter || 'all';
  var list = getAnnouncements().sort(function(a,b){ return new Date(b.date)-new Date(a.date); });
  if (filter !== 'all') list = list.filter(function(a) { return a.type === filter; });
  var el = document.getElementById('task-list');
  if (!list.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📚</div><p>Tidak ada item</p></div>';
    return;
  }
  el.innerHTML = list.map(function(a) {
    var urgent = '';
    if (a.deadline) { var dl = new Date(a.deadline); if (dl - new Date() < 86400000 && dl > new Date()) urgent = ' urgent'; }
    return '<div class="task-card' + urgent + '">' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="ann-badge ' + a.type + '">' +
      (a.type==='tugas'?'✏️ Tugas':a.type==='kelompok'?'👥 Kelompok':'ℹ️ Info') + '</span>' +
      (a.subject ? '<span class="task-subject">' + a.subject + '</span>' : '') + '</div>' +
      '<div class="task-title">' + a.title + '</div>' +
      '<div class="task-desc">' + a.body + '</div>' +
      '<div class="task-footer"><span class="text-muted" style="font-size:0.75rem">👤 ' + a.author + '</span>' +
      (a.deadline ? '<span class="task-deadline">⏰ ' + formatDate(a.deadline) + '</span>' : '') +
      '<span class="text-muted" style="font-size:0.75rem">' + formatDate(a.date) + '</span></div></div>';
  }).join('');

  var cnt   = getAnnouncements().filter(function(a) { return a.type === 'tugas'; }).length;
  var badge = document.getElementById('tugas-badge');
  if (badge) { badge.textContent = cnt; badge.style.display = cnt ? 'flex' : 'none'; }
}

// ─── KELOMPOK ───
function renderKelompokPage() {
  var isAdmin = currentUser && (currentUser.isAdmin || currentUser.isSubAdmin);
  document.getElementById('kelompok-admin-controls').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('kelompok-student-view').style.display   = isAdmin ? 'none' : 'block';
  if (isAdmin) renderAbsensiTable();
  updateGroupCalcInfo();
}

function renderAbsensiTable() {
  var users = Object.values(DB.users || {});
  var rows  = users.map(function(u) {
    var hadir = DB.absensi[u.username] !== false;
    return '<tr><td>' + u.name + '</td><td>' +
      '<div class="absen-toggle ' + (hadir?'hadir':'') + '" id="absen-' + u.username + '" onclick="toggleAbsen(\'' + u.username + '\')"></div>' +
      '<span style="margin-left:8px;font-size:0.78rem;color:' + (hadir?'var(--teal)':'var(--text-muted)') + '" id="absen-label-' + u.username + '">' +
      (hadir?'✅ Hadir':'❌ Tidak Hadir') + '</span></td></tr>';
  }).join('');

  var emptyRow = '<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--text-muted)">Belum ada siswa</td></tr>';
  var tbody  = document.getElementById('absen-tbody');
  var atbody = document.getElementById('admin-absen-tbody');
  if (tbody)  tbody.innerHTML  = users.length ? rows : emptyRow;
  if (atbody) atbody.innerHTML = users.length ? rows : emptyRow;
  updateAbsenCount();
}

function toggleAbsen(username) {
  var current = DB.absensi[username] !== false;
  DB.absensi[username] = !current;
  saveDB();
  var hadir  = DB.absensi[username];
  var toggle = document.getElementById('absen-' + username);
  var label  = document.getElementById('absen-label-' + username);
  if (toggle) toggle.className = 'absen-toggle' + (hadir ? ' hadir' : '');
  if (label)  { label.textContent = hadir ? '✅ Hadir' : '❌ Tidak Hadir'; label.style.color = hadir ? 'var(--teal)' : 'var(--text-muted)'; }
  updateAbsenCount();
  updateGroupCalcInfo();
}

function setAllAbsen(val) {
  Object.keys(DB.users || {}).forEach(function(u) { DB.absensi[u] = val; });
  saveDB();
  renderAbsensiTable();
  updateGroupCalcInfo();
}

function updateAbsenCount() {
  var users      = Object.values(DB.users || {});
  var hadirCount = users.filter(function(u) { return DB.absensi[u.username] !== false; }).length;
  var el1 = document.getElementById('absen-hadir-num');
  var el2 = document.getElementById('absen-total-num');
  var el3 = document.getElementById('total-members-count');
  if (el1) el1.textContent = hadirCount;
  if (el2) el2.textContent = users.length;
  if (el3) el3.textContent = hadirCount;
}

function updateGroupCalcInfo() {
  var users      = Object.values(DB.users || {});
  var hadir      = users.filter(function(u) { return DB.absensi[u.username] !== false; });
  var groupCount = parseInt(document.getElementById('group-count') && document.getElementById('group-count').value) || 4;
  var el = document.getElementById('group-calc-info');
  if (!el) return;
  if (hadir.length < 2) { el.textContent = '⚠️ Perlu minimal 2 siswa hadir'; return; }
  var perGroup = Math.floor(hadir.length / groupCount);
  var leftover = hadir.length % groupCount;
  var info = hadir.length + ' siswa → ' + groupCount + ' kelompok = ~' + perGroup + ' anggota/kelompok';
  if (leftover > 0) info += ' (' + leftover + ' kelompok dapat 1 ekstra)';
  el.textContent = info;
}

function startGroupAnimation() {
  var hadir = Object.values(DB.users || {})
    .filter(function(u) { return DB.absensi[u.username] !== false; })
    .map(function(u) { return u.name; });

  if (hadir.length < 2) { showToast('Perlu minimal 2 siswa hadir!','error','⚠️'); return; }

  var groupCountInput = parseInt(document.getElementById('group-count').value) || 4;
  var groupCount      = Math.min(groupCountInput, hadir.length);
  if (groupCount !== groupCountInput) showToast('Kelompok disesuaikan jadi ' + groupCount,'info','ℹ️');

  var wheel     = document.getElementById('spinning-wheel');
  var display   = document.getElementById('groups-display');
  var resHead   = document.getElementById('groups-result-head');
  display.innerHTML = '';
  wheel.classList.add('spinning');
  wheel.innerHTML = '🎰 Mengacak...';

  setTimeout(function() {
    wheel.classList.remove('spinning');

    // Fisher-Yates shuffle
    var shuffled = hadir.slice();
    for (var i = shuffled.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
    }

    var groups = [];
    for (var g = 0; g < groupCount; g++) groups.push([]);
    shuffled.forEach(function(m,i) { groups[i % groupCount].push(m); });

    wheel.innerHTML = '✅ Selesai!<br><strong>' + hadir.length + '</strong> anggota';

    var colors = [
      ['var(--red)','var(--purple)'],
      ['var(--purple)','var(--teal)'],
      ['var(--teal)','var(--gold)'],
      ['var(--gold)','var(--red)'],
      ['var(--pink)','var(--purple)'],
      ['var(--red-light)','var(--teal)']
    ];

    resHead.style.display = 'flex';
    display.innerHTML = groups.map(function(grp, gi) {
      var c1 = colors[gi % colors.length][0];
      var c2 = colors[gi % colors.length][1];
      return '<div class="group-card">' +
        '<div class="group-num" style="color:' + c1 + '">KELOMPOK ' + (gi+1) + ' · ' + grp.length + ' anggota</div>' +
        grp.map(function(m,mi) {
          return '<div class="group-member reveal" style="animation-delay:' + (mi*0.08) + 's">' +
            '<div class="member-avatar" style="background:linear-gradient(135deg,' + c1 + ',' + c2 + ')">' + m.charAt(0) + '</div>' + m + '</div>';
        }).join('') + '</div>';
    }).join('');

    showToast(groupCount + ' kelompok berhasil dibagi! 🎉','success','✅');
  }, 2200);
}

function resetGroups() {
  document.getElementById('groups-display').innerHTML = '';
  document.getElementById('groups-result-head').style.display = 'none';
  var wheel = document.getElementById('spinning-wheel');
  wheel.className = 'spinning-wheel';
  var hadir = Object.values(DB.users || {}).filter(function(u) { return DB.absensi[u.username] !== false; }).length;
  wheel.innerHTML = 'Siap membagi<br><strong>' + hadir + '</strong> anggota hadir';
}

// ─── GRADES ───
function renderGrades() {
  var key = currentUser ? (currentUser.username || ADMIN_KEY) : ADMIN_KEY;
  if (currentUser && currentUser.isAdmin) {
    document.getElementById('grade-inputs').innerHTML = '<div class="empty-state"><div class="empty-icon">👑</div><p>Admin tidak memiliki nilai</p></div>';
    return;
  }
  if (currentSem === 'all') {
    document.getElementById('grade-inputs').innerHTML = '<div class="text-muted" style="font-size:0.85rem;padding:16px">Pilih semester untuk input nilai</div>';
    renderAllSemChart();
    return;
  }
  var userGrades = DB.grades ? (DB.grades[key] || {}) : {};
  var semGrades  = userGrades[currentSem] || {};
  var customs    = userGrades.customSubjects || [];
  var subjects   = DEFAULT_SUBJECTS.concat(customs);

  document.getElementById('grade-inputs').innerHTML = subjects.map(function(s) {
    var v  = semGrades[s] || '';
    var g  = parseFloat(v);
    var bc = '', bl = '—';
    if (g) { bc = g>=90 ? 'background:rgba(0,201,167,0.15);color:var(--teal)' : g>=75 ? 'background:rgba(0,201,167,0.08);color:var(--teal)' : g>=60 ? 'background:rgba(240,165,0,0.15);color:var(--gold-light)' : 'background:rgba(192,57,43,0.15);color:var(--red-light)'; bl = g>=90?'A':g>=75?'B':g>=60?'C':'D'; }
    return '<div class="grade-row"><span class="grade-subject">' + s + '</span>' +
      '<input type="number" class="grade-val" id="gv-' + s.replace(/\s/g,'_') + '" value="' + v + '" min="0" max="100" placeholder="0">' +
      '<span class="grade-badge" style="' + bc + '">' + bl + '</span></div>';
  }).join('');

  renderSemChart(currentSem);
  renderAvgChart();
}

function switchSem(sem, btn) {
  currentSem = sem;
  document.querySelectorAll('.sem-tab').forEach(function(t) { t.classList.remove('active'); });
  btn.classList.add('active');
  renderGrades();
}

function saveGrades() {
  if (!currentUser || currentUser.isAdmin || currentSem === 'all') return;
  var key = currentUser.username;
  if (!DB.grades) DB.grades = {};
  if (!DB.grades[key]) DB.grades[key] = {};
  if (!DB.grades[key][currentSem]) DB.grades[key][currentSem] = {};
  var customs  = DB.grades[key].customSubjects || [];
  var subjects = DEFAULT_SUBJECTS.concat(customs);
  subjects.forEach(function(s) {
    var el = document.getElementById('gv-' + s.replace(/\s/g,'_'));
    if (el) DB.grades[key][currentSem][s] = parseFloat(el.value) || 0;
  });
  saveDB();
  showToast('Nilai semester ' + currentSem + ' tersimpan!','success','💾');
  renderGrades();
}

function addCustomSubject() {
  var name = prompt('Nama mata pelajaran:');
  if (!name) return;
  var key = currentUser ? currentUser.username : null;
  if (!key) return;
  if (!DB.grades) DB.grades = {};
  if (!DB.grades[key]) DB.grades[key] = {};
  if (!DB.grades[key].customSubjects) DB.grades[key].customSubjects = [];
  if (DB.grades[key].customSubjects.indexOf(name) >= 0 || DEFAULT_SUBJECTS.indexOf(name) >= 0) { showToast('Mata pelajaran sudah ada!','error','⚠️'); return; }
  DB.grades[key].customSubjects.push(name);
  saveDB(); renderGrades();
  showToast(name + ' ditambahkan!','success','✓');
}

function renderSemChart(sem) {
  var key = currentUser ? currentUser.username : null;
  if (!key) return;
  var customs  = (DB.grades && DB.grades[key] && DB.grades[key].customSubjects) || [];
  var subjects = DEFAULT_SUBJECTS.concat(customs);
  var vals     = subjects.map(function(s) { return (DB.grades && DB.grades[key] && DB.grades[key][sem] && DB.grades[key][sem][s]) || 0; });
  if (gradeChart) gradeChart.destroy();
  var ctx = document.getElementById('grade-chart').getContext('2d');
  gradeChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: subjects, datasets: [{ label: 'Nilai Sem ' + sem, data: vals, backgroundColor: 'rgba(192,57,43,0.5)', borderColor: 'rgba(192,57,43,0.8)', borderWidth: 1, borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#f0e6f6', font: { size: 10 } } } }, scales: { x: { ticks: { color: '#9e9e9e', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { min: 0, max: 100, ticks: { color: '#9e9e9e', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } } } }
  });
}

function renderAvgChart() {
  var key = currentUser ? currentUser.username : null;
  if (!key) return;
  var sems = [1,2,3,4,5,6];
  var avgs = sems.map(function(sem) {
    var vals = Object.values((DB.grades && DB.grades[key] && DB.grades[key][sem]) || {}).filter(function(v) { return v > 0; });
    return vals.length ? vals.reduce(function(a,b){return a+b;},0)/vals.length : 0;
  });
  if (avgChart) avgChart.destroy();
  var ctx = document.getElementById('avg-chart').getContext('2d');
  avgChart = new Chart(ctx, {
    type: 'line',
    data: { labels: sems.map(function(s){return 'Sem '+s;}), datasets: [{ label: 'Rata-rata', data: avgs, borderColor: 'rgba(0,201,167,0.8)', backgroundColor: 'rgba(0,201,167,0.1)', fill: true, tension: 0.4, pointBackgroundColor: 'rgba(0,201,167,1)', pointRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#f0e6f6', font: { size: 10 } } } }, scales: { x: { ticks: { color: '#9e9e9e', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { min: 0, max: 100, ticks: { color: '#9e9e9e', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } } } }
  });
}

function renderAllSemChart() {
  var key = currentUser ? currentUser.username : null;
  if (!key) return;
  var sems = [1,2,3,4,5,6];
  var avgs = sems.map(function(sem) {
    var vals = Object.values((DB.grades && DB.grades[key] && DB.grades[key][sem]) || {}).filter(function(v) { return v > 0; });
    return vals.length ? vals.reduce(function(a,b){return a+b;},0)/vals.length : 0;
  });
  if (gradeChart) gradeChart.destroy();
  var ctx = document.getElementById('grade-chart').getContext('2d');
  gradeChart = new Chart(ctx, {
    type: 'line',
    data: { labels: sems.map(function(s){return 'Semester '+s;}), datasets: [{ label: 'Rata-rata per Semester', data: avgs, borderColor: 'rgba(192,57,43,0.8)', backgroundColor: 'rgba(192,57,43,0.1)', fill: true, tension: 0.4, pointBackgroundColor: 'var(--red)', pointRadius: 5 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#f0e6f6' } } }, scales: { x: { ticks: { color: '#9e9e9e' }, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { min: 0, max: 100, ticks: { color: '#9e9e9e' }, grid: { color: 'rgba(255,255,255,0.05)' } } } }
  });
}

// ─── RANKING ───
function switchRankCat(cat, btn) {
  currentRankCat = cat;
  document.querySelectorAll('#section-rank .admin-tab').forEach(function(t) { t.classList.remove('active'); });
  btn.classList.add('active');
  document.getElementById('rank-mapel-selector').style.display = cat === 'mapel' ? 'block' : 'none';
  if (cat === 'mapel') populateMapelSelect();
  renderRank();
}

function populateMapelSelect() {
  var sel = document.getElementById('rank-mapel-select');
  sel.innerHTML = DEFAULT_SUBJECTS.map(function(s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');
}

function getRankedUsers() {
  return Object.values(DB.users || {}).map(function(u) { return Object.assign({}, u, { avg: calcUserAvg(u.username) }); })
    .filter(function(u) { return u.avg > 0; })
    .sort(function(a,b) { return b.avg - a.avg; });
}

function calcUserAvg(username) {
  var g = DB.grades && DB.grades[username];
  if (!g) return 0;
  var allVals = [];
  [1,2,3,4,5,6].forEach(function(sem) {
    if (g[sem]) Object.values(g[sem]).forEach(function(v) { if (v > 0) allVals.push(v); });
  });
  return allVals.length ? allVals.reduce(function(a,b){return a+b;},0)/allVals.length : 0;
}

function getUserRank(username) {
  var ranked = getRankedUsers();
  var idx    = ranked.findIndex(function(u) { return u.username === username; });
  return idx >= 0 ? idx + 1 : 0;
}

function renderRank() {
  var ranked;
  if (currentRankCat === 'mapel') {
    var mapel = document.getElementById('rank-mapel-select') ? document.getElementById('rank-mapel-select').value : '';
    ranked = Object.values(DB.users || {}).map(function(u) {
      var vals = [1,2,3,4,5,6].map(function(sem) { return (DB.grades && DB.grades[u.username] && DB.grades[u.username][sem] && DB.grades[u.username][sem][mapel]) || 0; }).filter(function(v){return v>0;});
      return Object.assign({}, u, { avg: vals.length ? vals.reduce(function(a,b){return a+b;},0)/vals.length : 0 });
    }).filter(function(u){return u.avg>0;}).sort(function(a,b){return b.avg-a.avg;});
  } else if (currentRankCat === 'stable') {
    ranked = Object.values(DB.users || {}).map(function(u) {
      var avgs = [1,2,3,4,5,6].map(function(sem) {
        var vals = Object.values((DB.grades && DB.grades[u.username] && DB.grades[u.username][sem]) || {}).filter(function(v){return v>0;});
        return vals.length ? vals.reduce(function(a,b){return a+b;},0)/vals.length : null;
      }).filter(function(v){return v!==null;});
      if (avgs.length < 2) return Object.assign({}, u, { avg: 0, stability: 999 });
      var mean = avgs.reduce(function(a,b){return a+b;},0)/avgs.length;
      var variance = avgs.reduce(function(a,b){return a+Math.pow(b-mean,2);},0)/avgs.length;
      return Object.assign({}, u, { avg: mean, stability: Math.sqrt(variance) });
    }).filter(function(u){return u.avg>0;}).sort(function(a,b){return a.stability-b.stability;});
  } else {
    ranked = getRankedUsers();
  }

  // Podium
  var podium = document.getElementById('podium');
  var top3   = ranked.slice(0,3);
  if (!top3.length) { podium.innerHTML = '<div class="empty-state" style="width:100%"><div class="empty-icon">🏆</div><p>Belum ada data</p></div>'; }
  else {
    var order   = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : [top3[0]];
    var classes = top3.length >= 3 ? ['second','first','third'] : ['first'];
    podium.innerHTML = order.map(function(u,i) {
      if (!u) return '';
      return '<div class="podium-place ' + classes[i] + '">' +
        '<div class="podium-avatar">' + u.name.charAt(0) + '</div>' +
        '<div class="podium-name">' + u.name + '</div>' +
        '<div class="podium-score">' + u.avg.toFixed(1) + '</div>' +
        '<div class="podium-bar">' + ['🥇','🥈','🥉'][i] + '</div></div>';
    }).join('');
  }

  // List
  var listEl = document.getElementById('rank-list');
  if (!ranked.length) { listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>Belum ada data nilai</p></div>'; return; }
  var medals = ['🥇','🥈','🥉'];
  listEl.innerHTML = ranked.map(function(u,i) {
    var isMe = currentUser && u.username === currentUser.username;
    return '<div class="rank-item">' +
      '<div class="rank-num" style="color:' + (i<3?'var(--gold-light)':'var(--text-muted)') + '">' + (medals[i]||'#'+(i+1)) + '</div>' +
      '<div class="member-avatar">' + u.name.charAt(0) + '</div>' +
      '<div class="rank-info"><div class="rank-name">' + u.name + (isMe?' (Kamu)':'') + '</div>' +
      '<div class="rank-score">' + u.avg.toFixed(1) + ' rata-rata</div></div>' +
      '<div class="rank-reward">' + (i===0?'👑 Juara 1':i===1?'🥈 Juara 2':i===2?'🥉 Juara 3':'Peringkat '+(i+1)) + '</div></div>';
  }).join('');
}

// ─── PROFILE ───
function renderProfile() {
  if (!currentUser) return;
  var key     = currentUser.username || ADMIN_KEY;
  var name    = currentUser.name;
  var isAdmin = currentUser.isAdmin;
  document.getElementById('profile-name-display').textContent = name;
  document.getElementById('profile-role-display').textContent = isAdmin ? '👑 Admin' : currentUser.isSubAdmin ? '🛡️ Sub-Admin' : '📚 Siswa';
  document.getElementById('info-username').textContent  = key;
  document.getElementById('info-dob').textContent       = currentUser.dob ? formatDate(currentUser.dob) : '—';
  document.getElementById('info-age').textContent       = currentUser.dob ? calcAge(currentUser.dob) + ' tahun' : '—';
  document.getElementById('info-joined').textContent    = currentUser.joinDate ? formatDate(currentUser.joinDate) : '—';

  var avg  = isAdmin ? 0 : calcUserAvg(key);
  var rank = isAdmin ? 0 : getUserRank(key);
  document.getElementById('profile-avg').textContent  = avg  ? avg.toFixed(1) : '—';
  document.getElementById('profile-rank').textContent = rank ? '#' + rank : '—';

  var avatarEl = document.getElementById('profile-avatar-display');
  if (DB.avatars && DB.avatars[key]) {
    avatarEl.innerHTML = '<img src="' + DB.avatars[key] + '" style="width:100%;height:100%;object-fit:cover;border-radius:16px">';
  } else {
    avatarEl.innerHTML = name.charAt(0).toUpperCase();
  }
}

function triggerAvatarUpload() {
  document.getElementById('avatar-upload').click();
}

function handleAvatarUpload(event) {
  var file = event.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var key = currentUser ? (currentUser.username || ADMIN_KEY) : ADMIN_KEY;
    if (!DB.avatars) DB.avatars = {};
    DB.avatars[key] = e.target.result;
    saveDB();
    renderProfile();
    var tv = document.getElementById('topbar-avatar');
    tv.style.backgroundImage = 'url(' + e.target.result + ')';
    tv.style.backgroundSize = 'cover';
    tv.textContent = '';
    showToast('Foto profil diperbarui!','success','✅');
  };
  reader.readAsDataURL(file);
}

// ─── NOTIFICATIONS ───
function renderNotifications() {
  var key  = currentUser ? (currentUser.username || ADMIN_KEY) : ADMIN_KEY;
  var list = getNotifications(key);
  var el   = document.getElementById('notif-list');
  if (!list.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>Tidak ada notifikasi</p></div>'; return; }
  var icons = { birthday:'🎂', announcement:'📢', system:'⚙️', info:'ℹ️' };
  el.innerHTML = list.map(function(n) {
    return '<div class="notif-item ' + (n.read?'':'unread') + '" onclick="readNotif(\'' + key + '\',\'' + n.id + '\',this)">' +
      '<div class="notif-icon">' + (icons[n.type]||'📬') + '</div>' +
      '<div style="flex:1"><div class="notif-title">' + n.title + '</div>' +
      '<div class="notif-body">' + n.body + '</div>' +
      '<div class="notif-time">' + formatDate(n.time) + '</div></div>' +
      (!n.read ? '<div style="width:7px;height:7px;border-radius:50%;background:var(--red);flex-shrink:0;margin-top:4px"></div>' : '') +
      '</div>';
  }).join('');
}

function readNotif(userKey, id, el) {
  var notifs = DB.notifications[userKey];
  if (!notifs) return;
  // Handle both array and object
  if (Array.isArray(notifs)) {
    var n = notifs.find(function(n){return n.id == id;});
    if (n) n.read = true;
  } else {
    if (notifs[id]) notifs[id].read = true;
  }
  saveDB();
  el.classList.remove('unread');
  updateBadge();
}

function markAllRead() {
  var key    = currentUser ? (currentUser.username || ADMIN_KEY) : ADMIN_KEY;
  var notifs = DB.notifications[key];
  if (!notifs) return;
  if (Array.isArray(notifs)) { notifs.forEach(function(n){n.read=true;}); }
  else { Object.values(notifs).forEach(function(n){if(n) n.read=true;}); }
  saveDB(); renderNotifications(); updateBadge();
}

// ─── ADMIN ───
function renderAdmin() { renderAdminUsers(); }

function switchAdminTab(tab, btn) {
  ['users','absen','announce','online','promote'].forEach(function(t) {
    document.getElementById('admin-tab-' + t).style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#section-admin .admin-tab').forEach(function(t) { t.classList.remove('active'); });
  btn.classList.add('active');
  var actions = { users: renderAdminUsers, absen: renderAdminAbsensi, online: renderOnlineList, announce: renderAdminAnn, promote: renderPromoteList };
  if (actions[tab]) actions[tab]();
}

function renderAdminAbsensi() {
  var tbody = document.getElementById('admin-absen-tbody');
  if (!tbody) return;
  var users = Object.values(DB.users || {});
  if (!users.length) { tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--text-muted)">Belum ada siswa</td></tr>'; return; }
  tbody.innerHTML = users.map(function(u) {
    var hadir = DB.absensi[u.username] !== false;
    return '<tr><td>' + u.name + '</td><td>' +
      '<div class="absen-toggle ' + (hadir?'hadir':'') + '" onclick="toggleAbsen(\'' + u.username + '\')"></div>' +
      '<span style="margin-left:8px;font-size:0.78rem;color:' + (hadir?'var(--teal)':'var(--text-muted)') + '">' + (hadir?'✅ Hadir':'❌ Tidak Hadir') + '</span></td></tr>';
  }).join('');
}

function renderAdminUsers() {
  var el    = document.getElementById('admin-user-list');
  var users = Object.values(DB.users || {});
  if (!users.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><p>Belum ada siswa</p></div>'; return; }
  el.innerHTML = users.map(function(u) {
    var online = isUserOnline(u.username);
    return '<div class="user-row">' +
      '<div class="' + (online?'online-dot':'offline-dot') + '"></div>' +
      '<div class="member-avatar">' + u.name.charAt(0) + '</div>' +
      '<div class="user-info" style="flex:1"><div class="user-name">' + u.name + (u.isSubAdmin?' 🛡️':'') + '</div>' +
      '<div class="user-meta">📅 ' + (u.dob?formatDate(u.dob):'—') + ' · ' + formatDate(u.joinDate) + '</div></div>' +
      '<div class="user-actions"><button class="btn-icon danger" onclick="deleteUser(\'' + u.username + '\')" title="Hapus">🗑️</button></div></div>';
  }).join('');
}

function deleteUser(username) {
  if (!confirm('Hapus akun "' + (DB.users[username] && DB.users[username].name) + '"?')) return;
  delete DB.users[username];
  delete DB.grades[username];
  delete DB.notifications[username];
  delete DB.avatars[username];
  delete DB.moods[username];
  delete DB.online[username];
  delete DB.absensi[username];
  saveDB(); renderAdminUsers();
  showToast('Akun berhasil dihapus','success','🗑️');
}

function toggleTaskFields() {
  var type = document.getElementById('ann-type-input').value;
  document.getElementById('task-fields').style.display = type === 'tugas' ? 'block' : 'none';
}

function postAnnouncement() {
  var title   = document.getElementById('ann-title-input').value.trim();
  var body    = document.getElementById('ann-body-input').value.trim();
  var type    = document.getElementById('ann-type-input').value;
  var deadline= document.getElementById('ann-deadline-input') ? document.getElementById('ann-deadline-input').value : '';
  var subject = document.getElementById('ann-subject-input').value.trim();
  if (!title || !body) { showToast('Lengkapi judul dan isi!','error','⚠️'); return; }
  var ann = { id: Date.now(), title: title, body: body, type: type, deadline: deadline, subject: subject, author: currentUser ? currentUser.name : 'Admin', date: new Date().toISOString() };
  pushAnnouncement(ann);
  Object.keys(DB.users || {}).forEach(function(uk) { addNotif(uk, '📢 ' + title, body, 'announcement'); });
  saveDB();
  document.getElementById('ann-title-input').value  = '';
  document.getElementById('ann-body-input').value   = '';
  document.getElementById('ann-subject-input').value = '';
  showToast('Pengumuman berhasil dikirim!','success','📢');
  renderAdminAnn();
}

function renderAdminAnn() {
  var el   = document.getElementById('admin-ann-list');
  var list = getAnnouncements().sort(function(a,b){return new Date(b.date)-new Date(a.date);});
  if (!list.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>Belum ada pengumuman</p></div>'; return; }
  el.innerHTML = list.map(function(a) {
    return '<div class="ann-card ' + a.type + '">' +
      '<div class="ann-card-top"><span class="ann-badge ' + a.type + '">' + a.type + '</span>' +
      '<button class="btn-icon danger" style="margin-left:auto" onclick="deleteAnn(' + a.id + ')">🗑️</button></div>' +
      '<div class="ann-title">' + a.title + '</div>' +
      '<div class="ann-meta"><span>' + formatDate(a.date) + '</span>' + (a.deadline?'<span class="text-red">⏰ '+formatDate(a.deadline)+'</span>':'') + '</div></div>';
  }).join('');
}

function deleteAnn(id) {
  removeAnnouncement(id);
  saveDB(); renderAdminAnn();
  showToast('Pengumuman dihapus','info','🗑️');
}

function renderOnlineList() {
  var el    = document.getElementById('online-list');
  var users = Object.values(DB.users || {}).filter(function(u) { return isUserOnline(u.username); });
  if (!users.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">🌐</div><p>Tidak ada siswa online</p></div>'; return; }
  el.innerHTML = users.map(function(u) {
    return '<div class="user-row"><div class="online-dot"></div><div class="member-avatar">' + u.name.charAt(0) + '</div><div class="user-info"><div class="user-name">' + u.name + '</div><div class="user-meta" style="color:var(--teal)">🟢 Online</div></div></div>';
  }).join('');
}

function renderPromoteList() {
  var el    = document.getElementById('promote-list');
  var users = Object.values(DB.users || {});
  if (!users.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><p>Belum ada siswa</p></div>'; return; }
  el.innerHTML = users.map(function(u) {
    return '<div class="user-row"><div class="member-avatar">' + u.name.charAt(0) + '</div>' +
      '<div class="user-info" style="flex:1"><div class="user-name">' + u.name + '</div><div class="user-meta">' + (u.isSubAdmin?'🛡️ Sub-Admin':'📚 Siswa') + '</div></div>' +
      '<div class="user-actions">' + (u.isSubAdmin ?
        '<button class="btn-icon danger" onclick="demoteUser(\'' + u.username + '\')">⬇️ Cabut</button>' :
        '<button class="btn-icon success" onclick="promoteUser(\'' + u.username + '\')">⬆️ Promosi</button>') + '</div></div>';
  }).join('');
}

function promoteUser(username) {
  DB.users[username].isSubAdmin = true;
  addNotif(username,'⬆️ Promosi Sub-Admin','Kamu telah dipromosikan menjadi Sub-Admin!','system');
  saveDB(); renderPromoteList();
  showToast(DB.users[username].name + ' dipromosikan!','success','⬆️');
}

function demoteUser(username) {
  DB.users[username].isSubAdmin = false;
  addNotif(username,'⬇️ Cabut Jabatan','Jabatan sub-admin kamu telah dicabut.','system');
  saveDB(); renderPromoteList();
  showToast('Jabatan dicabut','info','⬇️');
}

// ─── ONLINE ───
function isUserOnline(username) {
  var last = DB.online && DB.online[username];
  return last && (Date.now() - last < 90000);
}
function countOnline() {
  return Object.keys(DB.online || {}).filter(function(k) { return isUserOnline(k); }).length;
}

// ─── MODAL ───
function openModal(html) {
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal(e) {
  if (!e || e.target === document.getElementById('modal-overlay') || (e.target && e.target.classList.contains('modal-close'))) {
    document.getElementById('modal-overlay').classList.remove('open');
  }
}

// ─── UTILS ───
function formatDate(d) {
  if (!d) return '—';
  var dt = new Date(d);
  if (isNaN(dt)) return String(d);
  return dt.toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
}

function calcAge(dob) {
  var today = new Date(), b = new Date(dob);
  var age = today.getFullYear() - b.getFullYear();
  if (today.getMonth() < b.getMonth() || (today.getMonth()===b.getMonth() && today.getDate()<b.getDate())) age--;
  return age;
}

// ─── DOM READY ───
document.addEventListener('DOMContentLoaded', function() {
  // Load DB setelah Firebase siap
  loadDB();

  // Enter key untuk login
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      var loginPage = document.getElementById('page-login');
      if (loginPage && loginPage.classList.contains('active')) {
        var adminTab = document.querySelector('.login-tab.active');
        if (adminTab && adminTab.textContent.includes('Admin')) doAdminLogin();
        else doLogin();
      }
    }
  });

  // Group count change
  var groupCountEl = document.getElementById('group-count');
  if (groupCountEl) groupCountEl.addEventListener('input', updateGroupCalcInfo);
});
