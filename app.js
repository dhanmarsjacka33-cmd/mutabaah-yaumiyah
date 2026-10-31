// PASTIKAN URL INI ADALAH URL /exec MILIK ANDA
const GAS_URL = 'https://script.google.com/macros/s/AKfycbw-SQoNpwzi4olglFMIc_Bs5zAyCvhIurbfaXJZhehGdeaH4mP5_H5AlFYCzyisDSgR/exec';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtLocal = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().split('T')[0]; };
const SHALAT_IDS = ['f_shubuh','f_dzuhur','f_ashar','f_maghrib','f_isya'];
const STAFF_ROLES = ['guru','wali','musyrif','admin'];

function buildParams(fn, args) {
  switch (fn) {
    case 'verifyLogin': return { user: args[0], pin: args[1] };
    case 'submitMutabaah': return { payload: args[0] };
    case 'bulkSubmitMutabaah': return { payloads: args[0] };
    case 'getMutabaahEntry': return { nama: args[0], tanggal: args[1], role: args[2] };
    case 'getReportData': return { kelasFilter: args[0], startDate: args[1], endDate: args[2], roleTarget: args[3], searchQuery: args[4], genderFilter: args[5], page: args[6], limit: args[7] };
    case 'getDailyFillStatus': return { tanggal: args[0], kelasFilter: args[1], userRole: args[2], userKelasBinaan: args[3], statusFilter: args[4], searchQuery: args[5] };
    case 'getTeacherFillStatus': return { tanggal: args[0], searchQuery: args[1] };
    case 'getPersonalHistory': return { nama: args[0], role: args[1] };
    case 'getClassComparison': return { startDate: args[0], endDate: args[1] };
    case 'getMyNotif': return { username: args[0], nama: args[1], role: args[2] };
    case 'getDashboardStats': return { tanggal: args[0] };
    case 'getStudentTimeline': return { nama: args[0], role: args[1], days: args[2] };
    case 'saveClass': return { id: args[0], nama: args[1] };
    case 'deleteClass': return { id: args[0] };
    case 'saveStudent': return { id: args[0], nis: args[1], pin: args[2], role: args[3], namaLengkap: args[4], gender: args[5], kelasBinaan: args[6] };
    case 'deleteStudent': return { nis: args[0] };
    case 'saveTeacher': return { id: args[0], username: args[1], pin: args[2], role: args[3], namaLengkap: args[4], gender: args[5], kelasBinaan: args[6] };
    case 'deleteTeacher': return { username: args[0] };
    case 'changeOwnPin': return { username: args[0], oldPin: args[1], newPin: args[2] };
    case 'exportReportCSV': return { kelasFilter: args[0], genderFilter: args[1], startDate: args[2], endDate: args[3], roleTarget: args[4], searchQuery: args[5] };
    case 'getPrayerTimes': return { city: args[0], country: args[1] };
    default: return {};
  }
}

async function gsRun(fn, ...args) {
  const params = buildParams(fn, args);
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify({ action: fn, params })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    try { return JSON.parse(text); } 
    catch (e) { throw new Error('Gagal parse JSON. Pastikan URL /exec benar dan akses Anyone.'); }
  } catch (error) {
    console.error(`[Fetch Error: ${fn}]`, error);
    throw error;
  }
}

let appState = {
  userRole: null, userName: null, username: null,
  kelasBinaan: [], gender: 'L', isHaid: false, source: null,
  fillFor: null, fillForList: [], currentTab: 'tabLeaderboard',
  lastStatusData: null, lastReportData: null,
  allStudentsCache: [], allTeachersCache: [], notifData: null,
  offlineQueue: JSON.parse(localStorage.getItem('myq_queue') || '[]'),
  reportPage: 1
};
let myChart = null, personalChartInstance = null, compareChartInstance = null;
let isSyncing = false, _searchTimer = null, _statusTimer = null;

function getEffectiveRole() { return appState.fillFor ? 'siswa' : appState.userRole; }
function getEffectiveGender() { return appState.fillFor ? appState.fillFor.gender : appState.gender; }
function getEffectiveName() { return appState.fillFor ? appState.fillFor.nama : appState.userName; }
function getEffectiveKelas() { return appState.fillFor ? (appState.fillFor.kelas || 'Siswa') : ((appState.kelasBinaan && appState.kelasBinaan[0]) || 'Siswa'); }
function debouncedLoadReport() { clearTimeout(_searchTimer); _searchTimer = setTimeout(() => { appState.reportPage = 1; loadReportData(); }, 300); }
function debouncedLoadStatus() { clearTimeout(_statusTimer); _statusTimer = setTimeout(loadStatusData, 300); }

window.onload = function () {
  try {
    if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
      $('themeIcon').className = 'fa-solid fa-sun';
    }
    const savedSession = localStorage.getItem('myq_session');
    if (savedSession) {
      try {
        const s = JSON.parse(savedSession);
        appState.userRole = s.role; appState.userName = s.nama;
        appState.username = s.username || s.nama;
        appState.kelasBinaan = s.kelasBinaan || [];
        appState.gender = s.gender || 'L'; appState.source = s.source || null;
        loginSuccessSetup();
      } catch (e) { localStorage.removeItem('myq_session'); }
    }
    window.addEventListener('offline', () => $('offlineBanner').classList.remove('hidden'));
    window.addEventListener('online', syncOfflineData);
    if (!navigator.onLine) $('offlineBanner').classList.remove('hidden');
    fetchPrayerTimes();
  } catch (err) { console.error('[onload]', err); }
};

async function fetchPrayerTimes() {
  const CACHE_KEY = 'myq_prayer_cache_v2';
  const CACHE_TTL = 12 * 60 * 60 * 1000;
  const widget = $('prayerScheduleWidget');
  if (!widget) return;
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.ts < CACHE_TTL && cached.timings) { renderPrayerWidget(cached.timings); return; }
  } catch (e) {}
  try {
    const res = await gsRun('getPrayerTimes', 'Bogor', 'ID');
    if (res && res.success && res.timings) {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), timings: res.timings }));
      renderPrayerWidget(res.timings);
    } else widget.innerHTML = '<div class="col-span-5 text-[10px] text-slate-500 py-1">Jadwal shalat tidak tersedia</div>';
  } catch (e) { widget.innerHTML = '<div class="col-span-5 text-[10px] text-slate-500 py-1">Jadwal shalat offline</div>'; }
}
function renderPrayerWidget(t) {
  const widget = $('prayerScheduleWidget');
  if (!widget) return;
  const items = [['Subuh',t.Fajr],['Dzuhur',t.Dhuhr],['Ashar',t.Asr],['Maghrib',t.Maghrib],['Isya',t.Isha]];
  widget.innerHTML = items.map(([label,time]) => `<div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800"><span class="block text-[10px] text-slate-500 dark:text-slate-400 font-medium">${esc(label)}</span><span class="text-xs font-bold text-slate-700 dark:text-slate-200">${esc(time)}</span></div>`).join('');
}

function toggleDarkMode() {
  const html = document.documentElement;
  if (html.classList.contains('dark')) {
    html.classList.remove('dark'); localStorage.setItem('theme', 'light');
    $('themeIcon').className = 'fa-solid fa-moon';
  } else {
    html.classList.add('dark'); localStorage.setItem('theme', 'dark');
    $('themeIcon').className = 'fa-solid fa-sun';
  }
  const gridColor = html.classList.contains('dark') ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  if (myChart) { myChart.options.scales.y.grid.color = gridColor; myChart.update(); }
  if (personalChartInstance) { personalChartInstance.options.scales.y.grid.color = gridColor; personalChartInstance.update(); }
  if (compareChartInstance) { compareChartInstance.options.scales.y.grid.color = gridColor; compareChartInstance.update(); }
}

function showToast(msg, type = 'success') {
  const toast = $('toast');
  if (!toast) return;
  const icon = type === 'success' ? '<i class="fa-solid fa-circle-check" aria-hidden="true"></i>' : '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>';
  toast.innerHTML = `${icon} <span>${esc(msg)}</span>`;
  toast.className = `fixed top-16 right-4 p-3.5 rounded-xl shadow-xl text-white font-semibold text-xs transition-all duration-300 transform z-[100] flex items-center gap-2.5 ${type === 'success' ? 'bg-emerald-700' : 'bg-rose-700'}`;
  toast.classList.remove('translate-x-10', 'opacity-0');
  setTimeout(() => toast.classList.add('translate-x-10', 'opacity-0'), 3500);
}

async function handleLogin() {
  const user = $('loginUser').value.trim();
  const pin = $('loginPin').value.trim();
  if (!user || !pin) return showToast('Username dan PIN wajib diisi!', 'error');
  const btn = $('btnMasuk');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Memverifikasi...';
  btn.disabled = true;
  try {
    const res = await gsRun('verifyLogin', user, pin);
    if (res && res.success) {
      appState.userRole = res.role; appState.userName = res.nama;
      appState.username = res.username || res.nama;
      appState.kelasBinaan = res.kelasBinaan || [];
      appState.gender = res.gender || 'L'; appState.source = res.source || null;
      localStorage.setItem('myq_session', JSON.stringify({
        role: res.role, nama: res.nama, username: res.username || res.nama,
        kelasBinaan: res.kelasBinaan, gender: res.gender, source: res.source
      }));
      showToast(`Selamat datang, ${res.nama}`);
      loginSuccessSetup();
    } else showToast((res && res.message) || 'Login gagal', 'error');
  } catch (e) { showToast('Gagal terhubung ke server.', 'error'); }
  finally { btn.innerHTML = originalHtml; btn.disabled = false; }
}

function handleLogout() {
  try { localStorage.removeItem('myq_session'); } catch (e) {}
  Object.assign(appState, {
    userRole: null, userName: null, username: null,
    kelasBinaan: [], isHaid: false, source: null,
    fillFor: null, fillForList: [], currentTab: 'tabLeaderboard',
    lastStatusData: null, lastReportData: null, reportPage: 1
  });
  try { if (myChart) { myChart.destroy(); myChart = null; } } catch (e) {}
  try { if (personalChartInstance) { personalChartInstance.destroy(); personalChartInstance = null; } } catch (e) {}
  try { if (compareChartInstance) { compareChartInstance.destroy(); compareChartInstance = null; } } catch (e) {}
  ['view-main','view-dashboard'].forEach(id => $(id).classList.add('hidden'));
  $('view-login').classList.remove('hidden');
  ['logoutBtn','bottomNav','adminControls','btnTabGuru','btnTabSiswa','btnTabStatus','btnTabStatusGuru','btnTabCompare','streakBanner','poinContainer','fillForCard','notifBtn','profileBtn','statsCard'].forEach(id => $(id).classList.add('hidden'));
  $('loginUser').value = ''; $('loginPin').value = '';
  $('catatanForm').value = ''; $('formChecklist').innerHTML = '';
  $('headerInfo').innerText = 'Sistem Monitoring Ibadah';
  ['contentSiswa','contentGuru','contentStatus','contentStreak','contentCompare'].forEach(id => $(id).classList.add('hidden'));
  $('contentLeaderboard').classList.remove('hidden');
  ['btnTabLB','btnTabSiswa','btnTabGuru','btnTabStatus','btnTabStreak','btnTabCompare'].forEach(id => {
    const el = $(id); if (el) el.className = "px-4 py-2.5 font-bold text-xs text-slate-500 whitespace-nowrap transition";
  });
  $('btnTabLB').className = "px-4 py-2.5 font-bold text-xs text-emerald-700 border-b-2 border-emerald-700 whitespace-nowrap transition";
  const fBtn = $('navFormBtn'); const dBtn = $('navDashBtn');
  if (fBtn) fBtn.className = "flex flex-col items-center justify-center w-full h-full text-emerald-600 dark:text-emerald-400 border-t-2 border-emerald-600 dark:border-emerald-400 transition";
  if (dBtn) dBtn.className = "flex flex-col items-center justify-center w-full h-full text-slate-500 hover:text-slate-700 transition";
  ['classModal','studentModal','teacherModal','alertModal','pinModal','historyModal','bulkModal','profileModal','notifModal'].forEach(id => { const el = $(id); if (el) el.classList.add('hidden'); });
  showToast('Anda telah keluar dari portal.');
}

function loginSuccessSetup() {
  $('headerInfo').innerText = `${appState.userName} (${appState.userRole.toUpperCase()})`;
  $('view-login').classList.add('hidden');
  $('logoutBtn').classList.remove('hidden');
  $('bottomNav').classList.remove('hidden');
  $('notifBtn').classList.remove('hidden');
  $('profileBtn').classList.remove('hidden');
  setupDateRestrictions();
  const today = new Date(); const lastWeek = new Date(); lastWeek.setDate(today.getDate() - 7);
  $('filterEnd').valueAsDate = today;
  $('filterStart').valueAsDate = lastWeek;
  const sd = $('statusDate'); if (sd) sd.value = fmtLocal(today);
  const sgd = $('statusGuruDate'); if (sgd) sgd.value = fmtLocal(today);
  setupRoleBasedUI();
  loadPersonalHistoryChart();
  loadFilterClasses();
  loadStatusKelasOptions();
  switchView('Form');
  loadNotifBadge();
  loadDashboardStats();
  if (navigator.onLine && appState.offlineQueue.length) syncOfflineData();
}

async function loadFillForOptions() {
  const r = appState.userRole;
  const canFillOthers = (r === 'admin' || r === 'wali' || r === 'musyrif');
  if (!canFillOthers) { $('fillForCard').classList.add('hidden'); appState.fillForList = []; return; }
  $('fillForCard').classList.remove('hidden');
  try {
    const res = await gsRun('getStudentsForBulk');
    let list = res || [];
    
    if (r === 'wali' || r === 'musyrif') {
      const binaan = (appState.kelasBinaan || []).map(k => k.toLowerCase().trim());
      list = list.filter(s => { 
        const kls = (s.kelas || '').toLowerCase().split(/[,;]+/).map(x => x.trim()); 
        return kls.some(k => binaan.includes(k)); 
      });
    }
    
    appState.fillForList = list;
    const jenjangSet = new Set();
    
    list.forEach(s => {
      (s.kelas || '').split(/[,;]+/).forEach(k => {
        const kk = k.trim();
        if (!kk) return;
        if (/^(7|8|9)/.test(kk)) jenjangSet.add('smp');
        if (/^(10|11|12)/.test(kk)) jenjangSet.add('sma');
      });
    });
    
    const jenjangArr = ['smp','sma'].filter(j => jenjangSet.has(j));
    
    let html = '<option value="">— Pilih Jenjang —</option>';
    if (jenjangArr.length === 0) {
      html = '<option value="all">Semua Jenjang</option>';
    } else {
      jenjangArr.forEach(j => { html += `<option value="${j}">${j === 'smp' ? 'SMP (7-9)' : 'SMA (10-12)'}</option>`; });
    }
    
    $('fillForJenjang').innerHTML = html;
    $('fillForKelas').innerHTML = '<option value="">— Pilih Kelas —</option>';
    $('fillForNama').innerHTML = '<option value="">— Pilih Nama —</option>';
    $('fillForBadge').classList.add('hidden'); $('fillForNav').classList.add('hidden');
    appState.fillFor = null;
    
    if (jenjangArr.length === 1) { 
      $('fillForJenjang').value = jenjangArr[0]; 
      onFillForJenjangChange(); 
    }
  } catch (e) { console.error(e); }
}

function onFillForJenjangChange() {
  const j = $('fillForJenjang').value;
  appState.fillFor = null;
  $('fillForBadge').classList.add('hidden'); $('fillForNav').classList.add('hidden');
  if (!j) { $('fillForKelas').innerHTML = '<option value="">— Pilih Kelas —</option>'; $('fillForNama').innerHTML = '<option value="">— Pilih Nama —</option>'; return; }
  
  const kelasSet = new Set();
  appState.fillForList.forEach(s => {
    (s.kelas || '').split(/[,;]+/).forEach(k => {
      const kk = k.trim();
      if (!kk) return;
      if (j === 'all') { kelasSet.add(kk); return; }
      if (j === 'smp' && /^(7|8|9)/.test(kk)) kelasSet.add(kk);
      if (j === 'sma' && /^(10|11|12)/.test(kk)) kelasSet.add(kk);
    });
  });
  
  const kelasArr = Array.from(kelasSet).sort((a,b) => a.localeCompare(b, undefined, { numeric: true }));
  let html = '<option value="">— Pilih Kelas —</option>';
  kelasArr.forEach(k => { html += `<option value="${esc(k)}">${esc(k)}</option>`; });
  $('fillForKelas').innerHTML = html;
  $('fillForNama').innerHTML = '<option value="">— Pilih Nama —</option>';
  
  if (kelasArr.length === 1) { $('fillForKelas').value = kelasArr[0]; onFillForKelasChange(); }
}

function onFillForKelasChange() {
  const k = $('fillForKelas').value;
  appState.fillFor = null;
  $('fillForBadge').classList.add('hidden'); $('fillForNav').classList.add('hidden');
  let html = '<option value="">— Pilih Nama —</option>';
  if (k) {
    const filtered = appState.fillForList.filter(s => (s.kelas || '').split(/[,;]+/).map(x => x.trim()).includes(k));
    filtered.sort((a,b) => a.nama.localeCompare(b.nama, undefined, { sensitivity: 'base' }));
    html += `<option value="__self__">— Diri Sendiri (${esc(appState.userName)}) —</option>`;
    filtered.forEach(s => { html += `<option value="${esc(s.username)}">${esc(s.nama)}</option>`; });
  }
  $('fillForNama').innerHTML = html;
}

async function onFillForNamaChange() {
  const val = $('fillForNama').value;
  if (!val || val === '__self__') {
    appState.fillFor = null;
    $('fillForBadge').classList.add('hidden'); $('fillForNav').classList.add('hidden');
  } else {
    const student = appState.fillForList.find(s => s.username === val);
    if (!student) return;
    appState.fillFor = student;
    $('fillForBadge').classList.remove('hidden');
    $('fillForBadge').innerHTML = `<i class="fa-solid fa-user-pen" aria-hidden="true"></i> Mengisi untuk: <b>${esc(student.nama)}</b> (${esc(student.kelas || '-')})`;
    $('fillForNav').classList.remove('hidden');
  }
  renderFormInputs();
  await loadExistingEntry();
  await loadPersonalHistoryChart();
}

async function loadExistingEntry() {
  const tanggal = $('tglInput').value;
  if (!tanggal) return;
  const nama = getEffectiveName(); const role = getEffectiveRole();
  resetForm(false);
  try {
    const res = await gsRun('getMutabaahEntry', nama, tanggal, role);
    if (res && res.found) {
      const e = res.entry;
      const setCb = (id, v) => { const el = $(id); if (el) el.checked = (v === 'Ya'); };
      setCb('f_shubuh', e.Shubuh); setCb('f_dzuhur', e.Dzuhur); setCb('f_ashar', e.Ashar); setCb('f_maghrib', e.Maghrib); setCb('f_isya', e.Isya);
      
      setCb('f_rawatib_shubuh_qab', e.RawatibShubuhQab);
      setCb('f_rawatib_dzuhur_qab', e.RawatibDzuhurQab);
      setCb('f_rawatib_dzuhur_bad', e.RawatibDzuhurBad);
      setCb('f_rawatib_maghrib_bad', e.RawatibMaghribBad);
      setCb('f_rawatib_isya_bad', e.RawatibIsyaBad);

      setCb('f_dzikir', e.Dzikir); 
      setCb('f_tilawah_5lbr', e.Tilawah5Lbr); 
      setCb('f_qiyamullail', e.Qiyamullail); 
      setCb('f_ibadah_sunnah', e.IbadahSunnah);
      
      setCb('f_bantuOrtu', e.BantuOrtu); setCb('f_bijakHP', e.BijakHP); setCb('f_belajar', e.Belajar); setCb('f_tidur', e.Tidur); setCb('f_tilawah', e.Tilawah);
      
      const hd = $('toggleHaid');
      if (hd && e.Haid === 'Ya') { hd.checked = true; handleHaidToggle(); }
      $('catatanForm').value = e.Catatan || '';
      calculatePoints();
    }
  } catch (e) {}
}

function goNextStudent() {
  const sel = $('fillForNama');
  const opts = Array.from(sel.options).filter(o => o.value && o.value !== '__self__');
  if (!opts.length) return;
  const idx = opts.findIndex(o => o.value === sel.value);
  if (idx < 0 || idx >= opts.length - 1) return showToast('Ini siswa terakhir.', 'warning');
  sel.value = opts[idx + 1].value; onFillForNamaChange();
}
function goPrevStudent() {
  const sel = $('fillForNama');
  const opts = Array.from(sel.options).filter(o => o.value && o.value !== '__self__');
  if (!opts.length) return;
  const idx = opts.findIndex(o => o.value === sel.value);
  if (idx <= 0) return showToast('Ini siswa pertama.', 'warning');
  sel.value = opts[idx - 1].value; onFillForNamaChange();
}

function openBulkModal() {
  openModal('bulkModal');
  $('bulkPreview').classList.add('hidden'); $('bulkForm').classList.add('hidden');
  ['bulk_shubuh','bulk_dzuhur','bulk_ashar','bulk_maghrib','bulk_isya','bulk_bantuOrtu','bulk_bijakHP','bulk_belajar','bulk_tidur','bulk_tilawah'].forEach(id => { const el = $(id); if (el) el.checked = false; });
  $('bulkCatatan').value = '';
  calculateBulkPoints(); // Reset preview
  const jenjangSet = new Set();
  appState.fillForList.forEach(s => { (s.kelas || '').split(/[,;]+/).forEach(k => { const jj = k.trim(); if (!jj) return; if (/^(7|8|9)/.test(jj)) jenjangSet.add('smp'); if (/^(10|11|12)/.test(jj)) jenjangSet.add('sma'); }); });
  const jenjangArr = ['smp','sma'].filter(j => jenjangSet.has(j));
  let html = '<option value="">— Pilih Jenjang —</option>';
  jenjangArr.forEach(j => { html += `<option value="${j}">${j === 'smp' ? 'SMP (7-9)' : 'SMA (10-12)'}</option>`; });
  $('bulkJenjang').innerHTML = html;
  $('bulkKelas').innerHTML = '<option value="">— Pilih Kelas —</option>';
}

function calculateBulkPoints() {
  let total = 0;
  document.querySelectorAll('.bulk-cb').forEach(cb => {
    if (cb.checked) total += parseInt(cb.dataset.point || 0, 10);
  });
  const preview = $('bulkPointPreview');
  if (preview) preview.innerText = total;
}

function onBulkJenjangChange() {
  const j = $('bulkJenjang').value;
  $('bulkPreview').classList.add('hidden'); $('bulkForm').classList.add('hidden');
  if (!j) { $('bulkKelas').innerHTML = '<option value="">— Pilih Kelas —</option>'; return; }
  const kelasSet = new Set();
  appState.fillForList.forEach(s => { (s.kelas || '').split(/[,;]+/).forEach(k => { const kk = k.trim(); if (!kk) return; if (j === 'smp' && /^(7|8|9)/.test(kk)) kelasSet.add(kk); if (j === 'sma' && /^(10|11|12)/.test(kk)) kelasSet.add(kk); }); });
  const kelasArr = Array.from(kelasSet).sort((a,b) => a.localeCompare(b, undefined, { numeric: true }));
  let html = '<option value="">— Pilih Kelas —</option>';
  kelasArr.forEach(k => { html += `<option value="${esc(k)}">${esc(k)}</option>`; });
  $('bulkKelas').innerHTML = html;
  if (kelasArr.length === 1) { $('bulkKelas').value = kelasArr[0]; onBulkKelasChange(); }
}

function onBulkKelasChange() {
  const k = $('bulkKelas').value;
  if (!k) { $('bulkPreview').classList.add('hidden'); $('bulkForm').classList.add('hidden'); return; }
  const list = appState.fillForList.filter(s => (s.kelas || '').split(/[,;]+/).map(x => x.trim()).includes(k));
  if (!list.length) { $('bulkPreview').classList.add('hidden'); $('bulkForm').classList.add('hidden'); return; }
  $('bulkCount').innerText = list.length;
  $('bulkKelasLabel').innerText = k;
  $('bulkStudentList').innerHTML = list.map(s => `<div>• ${esc(s.nama)}</div>`).join('');
  $('bulkPreview').classList.remove('hidden'); $('bulkForm').classList.remove('hidden');
}

async function submitBulk() {
  const k = $('bulkKelas').value;
  if (!k) return showToast('Pilih kelas dulu.', 'warning');
  const list = appState.fillForList.filter(s => (s.kelas || '').split(/[,;]+/).map(x => x.trim()).includes(k));
  if (!list.length) return showToast('Tidak ada siswa di kelas ini.', 'warning');
  
  const btn = $('btnSubmitBulk');
  const origHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Menyimpan...'; 
  btn.disabled = true;

  const tanggal = $('tglInput').value || fmtLocal(new Date());
  const catatan = $('bulkCatatan').value || '';
  const get = id => $(id) && $(id).checked ? 'Ya' : 'Tidak';
  const payloads = list.map(s => {
    return {
      role: 'siswa', nama: s.nama, tanggal, kelas: s.kelas || 'Siswa',
      isHaid: 'Tidak', shubuh: get('bulk_shubuh'), dzuhur: get('bulk_dzuhur'),
      ashar: get('bulk_ashar'), maghrib: get('bulk_maghrib'), isya: get('bulk_isya'),
      bantuOrtu: get('bulk_bantuOrtu'), bijakHP: get('bulk_bijakHP'),
      belajar: get('bulk_belajar'), tidur: get('bulk_tidur'), tilawah: get('bulk_tilawah'), catatan
    };
  });
  
  try {
    const res = await gsRun('bulkSubmitMutabaah', payloads);
    showToast((res && res.message) || 'Selesai', 'success');
    closeModal('bulkModal');
    loadStatusData();
  } catch (e) { showToast('Gagal menyimpan massal.', 'error'); }
  finally {
    btn.innerHTML = origHtml;
    btn.disabled = false;
  }
}

async function loadFilterClasses() {
  const select = $('filterKelas'); if (!select) return;
  try {
    const res = await gsRun('getClasses');
    let html = '<option value="all">Semua Kategori</option>';
    (res || []).forEach(c => { html += `<option value="${esc(c.nama)}">Kelas ${esc(c.nama)}</option>`; });
    select.innerHTML = html;
  } catch (e) {}
}

async function loadStatusKelasOptions() {
  const sel = $('statusKelas'); if (!sel) return;
  try {
    const res = await gsRun('getClasses');
    let list = res || [];
    if (appState.userRole === 'wali' || appState.userRole === 'musyrif') {
      const binaan = (appState.kelasBinaan || []).map(k => k.toLowerCase().trim());
      list = list.filter(c => binaan.includes(c.nama.toLowerCase().trim()));
    }
    let html = '<option value="all">Semua Kelas</option>';
    list.forEach(c => { html += `<option value="${esc(c.nama)}">${esc(c.nama)}</option>`; });
    sel.innerHTML = html;
  } catch (e) {}
}

async function loadPersonalHistoryChart() {
  const canvas = $('personalChart'); const empty = $('personalChartEmpty');
  if (!canvas || !empty) return;
  try {
    const nama = getEffectiveName(); const role = getEffectiveRole();
    const res = await gsRun('getPersonalHistory', nama, role);
    if (!res || !res.length) {
      if (personalChartInstance) { personalChartInstance.destroy(); personalChartInstance = null; }
      canvas.classList.add('hidden'); empty.classList.remove('hidden');
      empty.innerHTML = `<i class="fa-solid fa-chart-line text-xl mb-1 opacity-50" aria-hidden="true"></i><span>Belum ada data 7 hari terakhir</span><span class="text-[10px] mt-1 opacity-60 text-center px-4">untuk: <b>${esc(nama || '-')}</b> (${esc(role || '-')})</span>`;
      return;
    }
    canvas.classList.remove('hidden'); empty.classList.add('hidden');
    if (personalChartInstance) personalChartInstance.destroy();
    const isDark = document.documentElement.classList.contains('dark');
    const isTeacher = STAFF_ROLES.includes(role);
    personalChartInstance = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: res.map(r => new Date(r.tgl).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' })),
        datasets: [{ label: isTeacher ? 'Amalan Terisi' : 'Poin', data: res.map(r => r.val), borderColor: '#059669', backgroundColor: 'rgba(5, 150, 105, 0.1)', borderWidth: 2, fill: true, tension: 0.3, pointRadius: 3 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 9 } } }, y: { beginAtZero: true, suggestedMax: isTeacher ? 12 : 110, grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 9 } } } } }
    });
  } catch (e) {}
}

function setupDateRestrictions() {
  const tglInput = $('tglInput'); if (!tglInput) return;
  const today = new Date(), yesterday = new Date(Date.now() - 86400000);
  tglInput.max = fmtLocal(today); tglInput.min = fmtLocal(yesterday);
  tglInput.value = fmtLocal(today);
}
function validateDateLock() {
  const tglInput = $('tglInput'); const val = tglInput.value;
  const today = fmtLocal(new Date()); const yesterday = fmtLocal(new Date(Date.now() - 86400000));
  if (val > today) { showToast('Tidak dapat mengisi tanggal di masa depan!', 'error'); tglInput.value = today; }
  else if (val < yesterday) { showToast('Maksimal pengisian hanya H-1.', 'error'); tglInput.value = yesterday; }
  loadExistingEntry(); loadPersonalHistoryChart();
}

function switchView(target) {
  $('view-main').classList.add('hidden'); $('view-dashboard').classList.add('hidden');
  const fBtn = $('navFormBtn'), dBtn = $('navDashBtn');
  const inactive = "flex flex-col items-center justify-center w-full h-full text-slate-500 hover:text-slate-700 transition";
  const active = "flex flex-col items-center justify-center w-full h-full text-emerald-600 dark:text-emerald-400 border-t-2 border-emerald-600 dark:border-emerald-400 transition";
  if (fBtn) fBtn.className = inactive;
  if (dBtn) dBtn.className = inactive;
  if (target === 'Form') {
    $('view-main').classList.remove('hidden');
    if (fBtn) fBtn.className = active;
    loadExistingEntry();
  } else {
    $('view-dashboard').classList.remove('hidden');
    if (dBtn) dBtn.className = active;
    loadReportData(); loadDashboardStats();
  }
}

function setupRoleBasedUI() {
  ['adminControls','poinContainer','btnTabGuru','btnTabSiswa','btnTabStatus','btnTabCompare','streakBanner','statsCard'].forEach(id => { const el = $(id); if (el) el.classList.add('hidden'); });
  if (appState.userRole === 'admin') {
    $('adminControls').classList.remove('hidden');
    $('btnTabGuru').classList.remove('hidden');
    $('btnTabSiswa').classList.remove('hidden');
    $('btnTabStatus').classList.remove('hidden');
    $('btnTabStatusGuru').classList.remove('hidden');
    $('btnTabCompare').classList.remove('hidden');
    $('statsCard').classList.remove('hidden');
  } else if (appState.userRole === 'wali' || appState.userRole === 'musyrif') {
    $('btnTabStatus').classList.remove('hidden');
  } else if (appState.userRole === 'siswa' || appState.userRole === 'murid') {
    $('poinContainer').classList.remove('hidden');
    $('streakBanner').classList.remove('hidden');
  }
  loadFillForOptions(); renderFormInputs(); updatePoinVisibility(); loadExistingEntry();
}

function updatePoinVisibility() {
  const role = getEffectiveRole();
  if (role === 'siswa') $('poinContainer').classList.remove('hidden');
  else $('poinContainer').classList.add('hidden');
}

function renderFormInputs() {
  const container = $('formChecklist'); if (!container) return;
  const gender = getEffectiveGender(); const role = getEffectiveRole();
  const isStaff = STAFF_ROLES.includes(role);
  const haidHtml = gender === 'P' ? `<div class="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 p-3.5 rounded-2xl flex justify-between items-center mb-3"><span class="text-xs font-bold text-rose-800 dark:text-rose-400 flex items-center gap-2"><i class="fa-solid fa-droplet" aria-hidden="true"></i> Sedang Haid (Udzur Syar'i)</span><label class="relative inline-flex items-center cursor-pointer"><input type="checkbox" id="toggleHaid" aria-label="Sedang Haid" class="sr-only peer" onchange="handleHaidToggle()"><div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div></label></div>` : '';
  
  const shalatList = [
    { id: 'f_shubuh', label: 'Subuh', point: 10 },
    { id: 'f_dzuhur', label: 'Dzuhur', point: 10 },
    { id: 'f_ashar', label: 'Ashar', point: 10 },
    { id: 'f_maghrib', label: 'Maghrib', point: 10 },
    { id: 'f_isya', label: 'Isya', point: 10 }
  ];
  const shalatBox = `
    <div class="bg-white dark:bg-[#111827] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm mb-3">
      <div class="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-500 mb-3 flex items-center gap-1.5"><i class="fa-solid fa-mosque" aria-hidden="true"></i> Shalat Fardhu 5 Waktu</div>
      <div class="grid grid-cols-1 sm:grid-cols-5 gap-2">
        ${shalatList.map(s => `<label for="${s.id}" class="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 cursor-pointer"><span class="text-xs font-semibold text-slate-700 dark:text-slate-200">${esc(s.label)}</span><input type="checkbox" id="${s.id}" data-point="${s.point}" class="cb-hitung w-4 h-4 text-emerald-700 rounded focus:ring-emerald-500"></label>`).join('')}
      </div>
    </div>`;

  const rawatibList = [
    { id: 'f_rawatib_shubuh_qab', label: 'Qabliyah Subuh' },
    { id: 'f_rawatib_dzuhur_qab', label: 'Qabliyah Dzuhur' },
    { id: 'f_rawatib_dzuhur_bad', label: "Ba'diyah Dzuhur" },
    { id: 'f_rawatib_maghrib_bad', label: "Ba'diyah Maghrib" },
    { id: 'f_rawatib_isya_bad', label: "Ba'diyah Isya" }
  ];
  const rawatibBox = `
    <div class="bg-white dark:bg-[#111827] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm mb-3">
      <div class="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-500 mb-3 flex items-center gap-1.5"><i class="fa-solid fa-star" aria-hidden="true"></i> Shalat Rawatib</div>
      <div class="grid grid-cols-1 sm:grid-cols-5 gap-2">
        ${rawatibList.map(s => `<label for="${s.id}" class="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 cursor-pointer"><span class="text-[10px] font-semibold text-slate-700 dark:text-slate-200">${esc(s.label)}</span><input type="checkbox" id="${s.id}" class="w-4 h-4 text-emerald-700 rounded focus:ring-emerald-500"></label>`).join('')}
      </div>
    </div>`;

  const otherList = isStaff ? [
    { id: 'f_dzikir', label: 'Dzikir Pagi & Petang', desc: '' },
    { id: 'f_tilawah_5lbr', label: 'Tilawah 5 Lembar', desc: '' },
    { id: 'f_qiyamullail', label: 'Qiyamullail', desc: '(Mendoakan Kebaikan Yayasan)' },
    { id: 'f_ibadah_sunnah', label: 'Ibadah Sunnah', desc: '(Dhuha/Puasa/Infaq)' }
  ] : [
    { id: 'f_bantuOrtu', label: 'Membantu Orang Tua', desc: '', point: 10 },
    { id: 'f_bijakHP', label: 'Bijak Gadget (< 2 Jam)', desc: '', point: 10 },
    { id: 'f_belajar', label: 'Murajaah / Belajar Mandiri', desc: '', point: 10 },
    { id: 'f_tidur', label: 'Tidur Awal (< Jam 22.00)', desc: '', point: 10 },
    { id: 'f_tilawah', label: 'Tilawah Al-Quran', desc: '(minimal 1 lembar)', point: 20 }
  ];
  
  let html = haidHtml + shalatBox + rawatibBox + `<div class="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1 mb-1.5">Amalan Harian Lainnya</div>`;
  html += otherList.map(i => cardCb(i.id, i.label, i.desc, i.point)).join('');
  container.innerHTML = html;
  calculatePoints();
}

function cardCb(id, label, desc, point) {
  const attr = point ? `data-point="${point}" class="cb-hitung sr-only peer"` : `class="sr-only peer"`;
  return `<label for="${id}" class="flex items-center justify-between p-3.5 bg-white dark:bg-[#111827] rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm cursor-pointer">
    <div class="flex flex-col">
      <span class="text-xs font-semibold text-slate-700 dark:text-slate-200">${esc(label)}</span>
      ${desc ? `<span class="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5">${esc(desc)}</span>` : ''}
    </div>
    <div class="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" id="${id}" ${attr} onchange="calculatePoints()">
      <div class="w-10 h-6 bg-slate-200 dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-700"></div>
    </div>
  </label>`;
}

function handleHaidToggle() {
  const toggle = $('toggleHaid'); if (!toggle) return;
  appState.isHaid = toggle.checked;
  SHALAT_IDS.forEach(id => { const el = $(id); if (el) { el.checked = appState.isHaid; el.disabled = appState.isHaid; } });
  calculatePoints();
}
function calculatePoints() {
  if (STAFF_ROLES.includes(getEffectiveRole())) return;
  let total = 0;
  document.querySelectorAll('.cb-hitung').forEach(cb => {
    const skip = appState.isHaid && SHALAT_IDS.includes(cb.id);
    if (cb.checked && !skip) total += parseInt(cb.dataset.point || 0, 10);
  });
  const scoreEl = $('liveScore'); if (scoreEl) scoreEl.innerText = total;
}

async function submitForm() {
  const btn = $('btnSubmitForm'); const originalHtml = btn.innerHTML;
  const tanggal = $('tglInput').value;
  if (!tanggal) return showToast('Tanggal tidak valid.', 'error');
  const role = getEffectiveRole(); const nama = getEffectiveName();
  const isStaff = STAFF_ROLES.includes(role);
  const payload = { role, nama, tanggal, catatan: $('catatanForm').value, isHaid: appState.isHaid ? 'Ya' : 'Tidak' };
  
  ['shubuh','dzuhur','ashar','maghrib','isya'].forEach(k => { const el = $(`f_${k}`); payload[k] = el && el.checked ? 'Ya' : 'Tidak'; });
  
  payload.rawatib_shubuh_qab = $('f_rawatib_shubuh_qab') && $('f_rawatib_shubuh_qab').checked ? 'Ya' : 'Tidak';
  payload.rawatib_dzuhur_qab = $('f_rawatib_dzuhur_qab') && $('f_rawatib_dzuhur_qab').checked ? 'Ya' : 'Tidak';
  payload.rawatib_dzuhur_bad = $('f_rawatib_dzuhur_bad') && $('f_rawatib_dzuhur_bad').checked ? 'Ya' : 'Tidak';
  payload.rawatib_maghrib_bad = $('f_rawatib_maghrib_bad') && $('f_rawatib_maghrib_bad').checked ? 'Ya' : 'Tidak';
  payload.rawatib_isya_bad = $('f_rawatib_isya_bad') && $('f_rawatib_isya_bad').checked ? 'Ya' : 'Tidak';

  if (isStaff) {
    payload.dzikir = $('f_dzikir') && $('f_dzikir').checked ? 'Ya' : 'Tidak';
    payload.tilawah_5lbr = $('f_tilawah_5lbr') && $('f_tilawah_5lbr').checked ? 'Ya' : 'Tidak';
    payload.qiyamullail = $('f_qiyamullail') && $('f_qiyamullail').checked ? 'Ya' : 'Tidak';
    payload.ibadah_sunnah = $('f_ibadah_sunnah') && $('f_ibadah_sunnah').checked ? 'Ya' : 'Tidak';
  } else {
    payload.kelas = getEffectiveKelas();
    payload.totalPoin = $('liveScore').innerText;
    payload.bantuOrtu = $('f_bantuOrtu') && $('f_bantuOrtu').checked ? 'Ya' : 'Tidak';
    payload.bijakHP = $('f_bijakHP') && $('f_bijakHP').checked ? 'Ya' : 'Tidak';
    payload.belajar = $('f_belajar') && $('f_belajar').checked ? 'Ya' : 'Tidak';
    payload.tidur = $('f_tidur') && $('f_tidur').checked ? 'Ya' : 'Tidak';
    payload.tilawah = $('f_tilawah') && $('f_tilawah').checked ? 'Ya' : 'Tidak';
  }
  
  if (!navigator.onLine) {
    appState.offlineQueue.push(payload);
    localStorage.setItem('myq_queue', JSON.stringify(appState.offlineQueue));
    showToast('Tersimpan offline di HP.', 'warning'); resetForm(); return;
  }
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Mengirim...'; btn.disabled = true;
  try {
    const res = await gsRun('submitMutabaah', payload);
    if (res && res.success) {
      showToast(res.message);
      if (res.streak !== undefined) { $('streakBanner').classList.remove('hidden'); $('streakCount').innerText = res.streak; }
      resetForm(); loadPersonalHistoryChart(); loadNotifBadge(); loadDashboardStats();
    } else showToast((res && res.message) || 'Gagal menyimpan.', 'error');
  } catch (e) {
    appState.offlineQueue.push(payload);
    localStorage.setItem('myq_queue', JSON.stringify(appState.offlineQueue));
    showToast('Server tidak merespon. Data disimpan offline.', 'warning'); resetForm();
  } finally { btn.innerHTML = originalHtml; btn.disabled = false; }
}

function resetForm(resetHaid = true) {
  document.querySelectorAll('#formChecklist input[type="checkbox"]').forEach(c => { c.checked = false; c.disabled = false; });
  $('catatanForm').value = '';
  if (resetHaid) appState.isHaid = false;
  const t = $('toggleHaid'); if (t) t.checked = false;
  calculatePoints();
}

async function syncOfflineData() {
  const ob = $('offlineBanner'); if (ob) ob.classList.add('hidden');
  if (isSyncing || !appState.offlineQueue.length) return;
  isSyncing = true;
  try {
    while (appState.offlineQueue.length) {
      const payload = appState.offlineQueue[0];
      let res;
      try { res = await gsRun('submitMutabaah', payload); }
      catch (err) { showToast('Sinkronisasi gagal, akan dicoba lagi nanti.', 'error'); break; }
      if (res && res.success) { appState.offlineQueue.shift(); localStorage.setItem('myq_queue', JSON.stringify(appState.offlineQueue)); }
      else { showToast((res && res.message) || 'Sinkronisasi ditolak.', 'error'); break; }
    }
    if (!appState.offlineQueue.length) showToast('Data offline berhasil disinkronisasi.', 'success');
  } finally { isSyncing = false; }
}

function switchTab(tabId) {
  const isAdmin = appState.userRole === 'admin';
  const isBulkUser = isAdmin || appState.userRole === 'wali' || appState.userRole === 'musyrif';
  const allowed = ['tabLeaderboard','tabStreak'];
  if (isAdmin) allowed.push('tabSiswa','tabGuru','tabCompare');
  if (isBulkUser) allowed.push('tabStatus', 'tabStatusGuru'); 
  if (!allowed.includes(tabId)) return;
  appState.currentTab = tabId;
  appState.reportPage = 1; 
  
  const contentMap = { 
    tabLeaderboard: 'contentLeaderboard', tabStreak: 'contentStreak', tabCompare: 'contentCompare', 
    tabSiswa: 'contentSiswa', tabGuru: 'contentGuru', tabStatus: 'contentStatus', tabStatusGuru: 'contentStatusGuru' 
  };
  const btnMap = { 
    tabLeaderboard: 'btnTabLB', tabStreak: 'btnTabStreak', tabCompare: 'btnTabCompare', 
    tabSiswa: 'btnTabSiswa', tabGuru: 'btnTabGuru', tabStatus: 'btnTabStatus', tabStatusGuru: 'btnTabStatusGuru' 
  };
  
  Object.values(contentMap).forEach(id => $(id).classList.add('hidden'));
  Object.values(btnMap).forEach(id => { const el = $(id); if (el) el.className = "px-4 py-2.5 font-bold text-xs text-slate-600 whitespace-nowrap transition"; });
  
  const ab = $(btnMap[tabId]); 
  if (ab) ab.className = "px-4 py-2.5 font-bold text-xs text-emerald-700 border-b-2 border-emerald-700 whitespace-nowrap transition";
  const ac = $(contentMap[tabId]); 
  if (ac) ac.classList.remove('hidden');
  
  const showFilter = ['tabSiswa','tabGuru'].includes(tabId);
  $('reportFilterBar').style.display = showFilter ? '' : 'none';
  
  if (tabId === 'tabStatus') loadStatusData();
  else if (tabId === 'tabStatusGuru') loadTeacherStatusData(); 
  else if (tabId === 'tabStreak') loadStreakLeaderboard();
  else if (tabId === 'tabCompare') loadCompareChart();
  else loadReportData();
}

function renderCell(c) {
  if (c === 'Ya') return '<i class="fa-solid fa-check text-emerald-700" aria-label="Ya"></i>';
  if (c === 'Tidak') return '<i class="fa-solid fa-xmark text-slate-400" aria-label="Tidak"></i>';
  return esc(c || '-');
}
function renderNameClickable(nama, role) {
  const safe = esc(nama);
  const safeJs = JSON.stringify(nama).replace(/"/g, '&quot;');
  return `<button onclick="showStudentHistory(${safeJs}, '${role}')" class="font-bold hover:text-emerald-700 transition">${safe} <i class="fa-solid fa-clock-rotate-left text-[9px] opacity-50" aria-hidden="true"></i></button>`;
}

function changePage(dir) {
  if (appState.currentTab === 'tabSiswa') {
    const totalPages = appState.lastReportData?.totalPages || 1;
    if (appState.reportPage + dir < 1 || appState.reportPage + dir > totalPages) return;
    appState.reportPage += dir;
    loadReportData();
  } else if (appState.currentTab === 'tabGuru') {
    const totalPages = appState.lastReportData?.totalPages || 1;
    if (appState.reportPage + dir < 1 || appState.reportPage + dir > totalPages) return;
    appState.reportPage += dir;
    loadReportData();
  }
}

async function loadReportData() {
  const fKls = ($('filterKelas') && $('filterKelas').value) || 'all';
  const fGender = ($('filterGender') && $('filterGender').value) || 'all';
  const sDate = ($('filterStart') && $('filterStart').value) || '';
  const eDate = ($('filterEnd') && $('filterEnd').value) || '';
  const searchQuery = ($('searchStudent') && $('searchStudent').value) || '';
  const tab = appState.currentTab;
  const roleTarget = tab === 'tabGuru' ? 'guru' : 'siswa';
  
  if (tab === 'tabSiswa') $('tableBodySiswa').innerHTML = '<tr><td colspan="20" class="text-center p-6 text-slate-500">Memuat rekap...</td></tr>';
  else if (tab === 'tabGuru') $('tableBodyGuru').innerHTML = '<tr><td colspan="14" class="text-center p-6 text-slate-500">Memuat rekap...</td></tr>';
  
  try {
    const res = await gsRun('getReportData', fKls, sDate, eDate, roleTarget, searchQuery, fGender, appState.reportPage, 20);
    appState.lastReportData = res;
    
    if (tab === 'tabSiswa' && roleTarget === 'siswa') {
      $('tableBodySiswa').innerHTML = ((res && res.table) || []).map(r => `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-900/50">
          <td class="p-3 text-slate-500">${esc(new Date(r.tgl).toLocaleDateString('id-ID'))}</td>
          <td class="p-3">${renderNameClickable(r.nama, 'siswa')}</td>
          <td class="p-3">${esc(r.kelas)}</td>
          <td class="p-3 font-extrabold text-emerald-700 text-center">${esc(r.poin)}</td>
          ${(r.cols || []).map(c => `<td class="p-3 text-center">${renderCell(c)}</td>`).join('')}
        </tr>`).join('') ||
        '<tr><td colspan="20" class="text-center p-6 text-slate-500">Tidak ada data ditemukan.</td></tr>';
      
      // Update Pagination UI
      $('pageInfoSiswa').innerText = `Hal ${res.currentPage} / ${res.totalPages || 1}`;
      $('btnPrevSiswa').disabled = res.currentPage <= 1;
      $('btnNextSiswa').disabled = res.currentPage >= (res.totalPages || 1);

    } else if (tab === 'tabGuru' && roleTarget === 'guru') {
      $('tableBodyGuru').innerHTML = ((res && res.table) || []).map(r => `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-900/50">
          <td class="p-3 text-slate-500">${esc(new Date(r.tgl).toLocaleDateString('id-ID'))}</td>
          <td class="p-3">${renderNameClickable(r.nama, 'guru')}</td>
          ${(r.cols || []).map((c, idx) => {
            if (idx >= 6 && idx <= 10) return '';
            if (idx === 11) {
              const rawatibCount = r.cols.slice(6, 11).filter(x => x === 'Ya').length;
              return `<td class="p-3 text-center font-bold">${rawatibCount}/5</td>`;
            }
            return `<td class="p-3 text-center">${renderCell(c)}</td>`;
          }).join('')}
        </tr>`).join('') ||
        '<tr><td colspan="14" class="text-center p-6 text-slate-500">Tidak ada data ditemukan.</td></tr>';
        
      // Update Pagination UI
      $('pageInfoGuru').innerText = `Hal ${res.currentPage} / ${res.totalPages || 1}`;
      $('btnPrevGuru').disabled = res.currentPage <= 1;
      $('btnNextGuru').disabled = res.currentPage >= (res.totalPages || 1);
    }
    
    if (tab === 'tabLeaderboard') {
      let html = ''; const labels = [], data = [];
      ((res && res.leaderboard) || []).forEach((item, index) => {
        html += `<div class="flex items-center justify-between p-3.5 bg-white dark:bg-[#111827] rounded-xl border border-slate-200 dark:border-slate-800"><div class="flex items-center gap-3"><span class="font-extrabold text-sm w-6 text-slate-500">#${index + 1}</span><div><div class="font-bold text-xs">${esc(item.nama)}</div><div class="text-[10px] text-slate-500">Kelas ${esc(item.kelas)}</div></div></div><div class="font-extrabold text-sm text-emerald-700">${esc(item.poin)} <span class="text-[10px] text-slate-500 font-normal">pts</span></div></div>`;
        labels.push(String(item.nama || '').split(' ')[0]); data.push(item.poin);
      });
      $('leaderboardList').innerHTML = html || '<div class="text-center p-6 text-slate-500">Belum ada data skor.</div>';
      $('contentLeaderboard').classList.remove('hidden');
      renderChart(labels, data);
    }
  } catch (e) { showToast('Gagal memuat data laporan.', 'error'); }
}

async function exportCSV() {
  const tab = appState.currentTab;
  if (!['tabSiswa','tabGuru'].includes(tab)) return showToast('Export hanya untuk tab rekap.', 'warning');
  const roleTarget = tab === 'tabGuru' ? 'guru' : 'siswa';
  const fKls = ($('filterKelas') && $('filterKelas').value) || 'all';
  const fGender = ($('filterGender') && $('filterGender').value) || 'all';
  const sDate = ($('filterStart') && $('filterStart').value) || '';
  const eDate = ($('filterEnd') && $('filterEnd').value) || '';
  const searchQuery = ($('searchStudent') && $('searchStudent').value) || '';
  try {
    const res = await gsRun('exportReportCSV', fKls, fGender, sDate, eDate, roleTarget, searchQuery);
    if (!res || !res.success) return showToast('Gagal export.', 'error');
    const blob = new Blob(['\ufeff' + res.csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = res.filename || 'rekap.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('File CSV berhasil diunduh.');
  } catch (e) { showToast('Gagal export.', 'error'); }
}

async function showStudentHistory(nama, role) {
  $('historyName').innerText = nama;
  $('historyContent').innerHTML = '<div class="text-center p-6 text-slate-500">Memuat...</div>';
  openModal('historyModal');
  try {
    const res = await gsRun('getStudentTimeline', nama, role, 30);
    if (!res || !res.length) { $('historyContent').innerHTML = '<div class="text-center p-6 text-slate-500">Belum ada riwayat.</div>'; return; }
    const html = res.map(d => {
      const itemChips = d.itemKeys.map(k => `<span class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${d.items[k] ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 line-through'}">${d.items[k] ? '✓' : '×'} ${esc(k)}</span>`).join('');
      const tglFmt = new Date(d.tgl).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' });
      const poinStr = d.isTeacher ? '' : `<span class="text-xs font-black text-emerald-700">${d.poin}</span>`;
      const haidStr = d.haid ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-bold">Haid</span>' : '';
      return `<div class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40"><div class="flex items-center justify-between mb-1.5"><div class="text-xs font-bold">${esc(tglFmt)}</div><div class="flex items-center gap-1.5">${haidStr} ${poinStr}</div></div><div class="flex flex-wrap gap-1">${itemChips}</div>${d.catatan ? `<div class="text-[10px] text-slate-500 mt-1.5 italic">"${esc(d.catatan)}"</div>` : ''}</div>`;
    }).join('');
    $('historyContent').innerHTML = html;
  } catch (e) { $('historyContent').innerHTML = '<div class="text-center p-6 text-rose-600">Error memuat riwayat.</div>'; }
}

async function loadCompareChart() {
  const sDate = ($('filterStart') && $('filterStart').value) || '';
  const eDate = ($('filterEnd') && $('filterEnd').value) || '';
  try {
    const res = await gsRun('getClassComparison', sDate, eDate);
    const rows = res || [];
    $('compareList').innerHTML = rows.length ? rows.map((r, i) => `<div class="flex items-center justify-between p-3 bg-white dark:bg-[#111827] rounded-xl border border-slate-200 dark:border-slate-800"><div class="flex items-center gap-3"><span class="font-extrabold text-sm w-6 text-slate-500">#${i + 1}</span><div><div class="font-bold text-xs">Kelas ${esc(r.kelas)}</div><div class="text-[10px] text-slate-500">${r.total} pengisian</div></div></div><div class="font-extrabold text-sm text-emerald-700">Avg ${esc(r.avg)}</div></div>`).join('') : '<div class="text-center p-6 text-slate-500">Belum ada data.</div>';
    if (compareChartInstance) compareChartInstance.destroy();
    const canvas = $('compareChart'); if (!canvas) return;
    const isDark = document.documentElement.classList.contains('dark');
    compareChartInstance = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: { labels: rows.map(r => r.kelas), datasets: [{ label: 'Rata-rata Poin', data: rows.map(r => r.avg), backgroundColor: '#0ea5e9', borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' } } } }
    });
  } catch (e) {}
}

async function loadStreakLeaderboard() {
  $('streakList').innerHTML = '<div class="text-center p-6 text-slate-500">Memuat...</div>';
  try {
    const res = await gsRun('getStreakLeaderboard');
    if (!res || !res.length) { $('streakList').innerHTML = '<div class="text-center p-6 text-slate-500">Belum ada streak.</div>'; return; }
    $('streakList').innerHTML = res.map((r, i) => `<div class="flex items-center justify-between p-3.5 bg-white dark:bg-[#111827] rounded-xl border border-slate-200 dark:border-slate-800"><div class="flex items-center gap-3"><span class="font-extrabold text-sm w-6 text-slate-500">#${i + 1}</span><div class="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-rose-600 flex items-center justify-center text-white"><i class="fa-solid fa-fire" aria-hidden="true"></i></div><div><div class="font-bold text-xs">${esc(r.nama)}</div><div class="text-[10px] text-slate-500">Kelas ${esc(r.kelas || '-')}</div></div></div><div class="font-extrabold text-sm text-orange-600">${r.streak} <span class="text-[10px] text-slate-500 font-normal">hari</span></div></div>`).join('');
  } catch (e) { $('streakList').innerHTML = '<div class="text-center p-6 text-rose-600">Error.</div>'; }
}

async function loadNotifBadge() {
  try {
    const res = await gsRun('getMyNotif', appState.username, appState.userName, appState.userRole);
    appState.notifData = res;
    if (res && res.unread > 0) { $('notifBadge').classList.remove('hidden'); $('notifBadge').innerText = res.unread; }
    else $('notifBadge').classList.add('hidden');
  } catch (e) {}
}
function openNotifModal() {
  const d = appState.notifData || {};
  let html = '';
  if (!d.sudahHariIni) html += `<div class="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40"><div class="text-xs font-bold text-rose-800 dark:text-rose-400"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> ${esc(d.message || 'Kamu belum isi Mutabaah hari ini.')}</div></div>`;
  else html += `<div class="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40"><div class="text-xs font-bold text-emerald-800 dark:text-emerald-400"><i class="fa-solid fa-check-circle" aria-hidden="true"></i> Alhamdulillah, kamu sudah isi hari ini.</div></div>`;
  if (d.streak !== undefined) html += `<div class="p-3 rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/40"><div class="text-xs font-bold text-orange-800 dark:text-orange-400"><i class="fa-solid fa-fire" aria-hidden="true"></i> Streak saat ini: ${d.streak} hari</div></div>`;
  $('notifBody').innerHTML = html;
  openModal('notifModal');
}

function openProfileModal() {
  const role = appState.userRole;
  const roleLabel = { admin: 'Administrator', guru: 'Guru', wali: 'Wali Kelas', musyrif: 'Musyrif', siswa: 'Siswa' }[role] || role;
  const genderLabel = appState.gender === 'P' ? 'Akhwat (P)' : 'Ikhwan (L)';
  const kelasStr = appState.kelasBinaan && appState.kelasBinaan.length ? appState.kelasBinaan.join(', ') : '-';
  const initial = (appState.userName || '?').substring(0, 1).toUpperCase();
  $('profileBody').innerHTML = `
    <div class="text-center">
      <div class="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-2xl font-black">${esc(initial)}</div>
      <div class="mt-2 font-bold text-sm">${esc(appState.userName)}</div>
      <div class="text-[11px] text-slate-500">@${esc(appState.username || appState.userName)}</div>
    </div>
    <div class="grid grid-cols-2 gap-2 text-xs">
      <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800"><div class="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Role</div><div class="font-bold">${esc(roleLabel)}</div></div>
      <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800"><div class="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Gender</div><div class="font-bold">${esc(genderLabel)}</div></div>
      <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 col-span-2"><div class="text-[10px] uppercase tracking-wider text-slate-500 font-bold">${role === 'siswa' ? 'Kelas' : 'Kelas Binaan'}</div><div class="font-bold">${esc(kelasStr)}</div></div>
    </div>
    <button onclick="closeModal('profileModal'); openModal('pinModal')" class="w-full bg-emerald-700 hover:bg-emerald-800 text-white py-2.5 rounded-xl text-xs font-bold"><i class="fa-solid fa-key" aria-hidden="true"></i> Ganti PIN</button>
  `;
  openModal('profileModal');
}

async function submitChangePin() {
  const btn = $('btnSubmitPin'); const origHtml = btn.innerHTML;
  const oldPin = $('pinOld').value.trim();
  const newPin = $('pinNew').value.trim();
  const confirmPin = $('pinConfirm').value.trim();
  if (!oldPin || !newPin || !confirmPin) return showToast('Semua field wajib diisi.', 'error');
  if (newPin !== confirmPin) return showToast('PIN baru tidak sama.', 'error');
  if (newPin.length < 4) return showToast('PIN minimal 4 karakter.', 'error');
  if (!/^\d+$/.test(newPin)) return showToast('PIN hanya angka.', 'error');
  
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...'; btn.disabled = true;
  try {
    const res = await gsRun('changeOwnPin', appState.username || appState.userName, oldPin, newPin);
    if (res && res.success) {
      showToast(res.message);
      $('pinOld').value = ''; $('pinNew').value = ''; $('pinConfirm').value = '';
      closeModal('pinModal');
    } else showToast((res && res.message) || 'Gagal mengubah PIN.', 'error');
  } catch (e) { showToast('Gagal mengubah PIN.', 'error'); }
  finally { btn.innerHTML = origHtml; btn.disabled = false; }
}

async function loadDashboardStats() {
  if (appState.userRole !== 'admin') return;
  const tanggal = fmtLocal(new Date());
  try {
    const res = await gsRun('getDashboardStats', tanggal);
    if (!res || !res.success) return;
    $('statTotal').innerText = res.totalSiswa;
    $('statSudah').innerText = res.sudahIsi;
    $('statPersen').innerText = `(${res.persen}%)`;
    $('statAvg').innerText = res.avgPoin;
    $('statKelas').innerText = res.kelasTerbaik || '-';
  } catch (e) {}
}

async function loadStatusData() {
  const tanggal = $('statusDate').value;
  const kelas = $('statusKelas').value;
  const status = $('statusFilter').value;
  const search = $('statusSearch').value;
  if (!tanggal) return;
  $('statusSummary').innerHTML = '';
  $('statusList').innerHTML = '<div class="text-center p-6 text-slate-500">Memuat...</div>';
  try {
    const res = await gsRun('getDailyFillStatus', tanggal, kelas, appState.userRole, appState.kelasBinaan, status, search);
    appState.lastStatusData = res;
    
    if (!res || !res.summary) { $('statusList').innerHTML = `<div class="text-center p-6 text-rose-600">Gagal memuat data.</div>`; return; }
    
    const pct = res.summary.total ? Math.round(res.summary.sudah / res.summary.total * 100) : 0;
    $('statusSummary').innerHTML = `<div class="flex flex-wrap items-center gap-2 text-xs"><span class="px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-400 rounded-lg font-bold">✅ Sudah: ${res.summary.sudah}</span><span class="px-3 py-1.5 bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-400 rounded-lg font-bold">❌ Belum: ${res.summary.belum}</span><span class="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-bold">📊 Total: ${res.summary.total} (${pct}% sudah isi)</span></div>`;
    
    if (!res.list.length) { $('statusList').innerHTML = '<div class="text-center p-6 text-slate-500">Tidak ada siswa di filter ini.</div>'; return; }
    
    let html = '<div class="overflow-x-auto"><table class="w-full text-xs text-left print-table"><thead class="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 uppercase tracking-wider font-bold"><tr><th class="p-3">No</th><th class="p-3">Nama</th><th class="p-3">Kelas</th><th class="p-3 text-center">Status</th><th class="p-3 text-center">Poin</th></tr></thead><tbody class="divide-y divide-slate-100 dark:divide-slate-800">';
    res.list.forEach((s, i) => {
      const badge = s.sudah ? '<span class="text-emerald-700 font-bold"><i class="fa-solid fa-check" aria-hidden="true"></i> Sudah</span>' : '<span class="text-rose-700 font-bold"><i class="fa-solid fa-xmark" aria-hidden="true"></i> Belum</span>';
      const rowBg = s.sudah ? '' : 'bg-rose-50/40 dark:bg-rose-950/10';
      const safeJs = JSON.stringify(s.nama).replace(/"/g, '&quot;');
      // Memperbaiki Bug Poin = 0
      const poinCell = s.sudah ? `<span class="text-emerald-700 font-bold">${s.poin !== null ? s.poin : '-'}</span>` : '-';
      html += `<tr class="hover:bg-slate-50 dark:hover:bg-slate-900/50 ${rowBg}"><td class="p-3 text-slate-500">${i + 1}</td><td class="p-3 font-bold"><button onclick="showStudentHistory(${safeJs}, 'siswa')" class="hover:text-emerald-700">${esc(s.nama)} <i class="fa-solid fa-clock-rotate-left text-[9px] opacity-50" aria-hidden="true"></i></button></td><td class="p-3">${esc(s.kelas || '-')}</td><td class="p-3 text-center">${badge}</td><td class="p-3 text-center">${poinCell}</td></tr>`;
    });
    html += '</tbody></table></div>';
    $('statusList').innerHTML = html;
  } catch (e) { $('statusList').innerHTML = '<div class="text-center p-6 text-rose-600">Error memuat data.</div>'; }
}

async function loadTeacherStatusData() {
  const tanggal = $('statusGuruDate').value || fmtLocal(new Date());
  const search = $('statusGuruSearch').value;
  
  $('statusGuruSummary').innerHTML = '';
  $('statusGuruList').innerHTML = '<div class="text-center p-6 text-slate-500">Memuat data guru...</div>';
  
  try {
    const res = await gsRun('getTeacherFillStatus', tanggal, search);
    
    if (!res || !res.summary) { 
      $('statusGuruList').innerHTML = `<div class="text-center p-6 text-rose-600">Gagal memuat data.</div>`; 
      return; 
    }
    
    const pct = res.summary.total ? Math.round(res.summary.sudah / res.summary.total * 100) : 0;
    $('statusGuruSummary').innerHTML = `
      <div class="flex flex-wrap items-center gap-2 text-xs">
        <span class="px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-400 rounded-lg font-bold">✅ Sudah Isi: ${res.summary.sudah}</span>
        <span class="px-3 py-1.5 bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-400 rounded-lg font-bold">❌ Belum: ${res.summary.belum}</span>
        <span class="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-bold">📊 Total Guru: ${res.summary.total} (${pct}%)</span>
      </div>`;
    
    if (!res.list.length) { 
      $('statusGuruList').innerHTML = '<div class="text-center p-6 text-slate-500">Tidak ada data guru.</div>'; 
      return; 
    }
    
    let html = '<div class="overflow-x-auto"><table class="w-full text-xs text-left print-table"><thead class="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 uppercase tracking-wider font-bold"><tr><th class="p-3">No</th><th class="p-3">Nama Guru / Staff</th><th class="p-3">Username</th><th class="p-3 text-center">Status</th></tr></thead><tbody class="divide-y divide-slate-100 dark:divide-slate-800">';
    
    res.list.forEach((s, i) => {
      const badge = s.sudah 
        ? '<span class="text-emerald-700 font-bold"><i class="fa-solid fa-check" aria-hidden="true"></i> Sudah</span>' 
        : '<span class="text-rose-700 font-bold"><i class="fa-solid fa-xmark" aria-hidden="true"></i> Belum</span>';
      const rowBg = s.sudah ? '' : 'bg-rose-50/40 dark:bg-rose-950/10';
      
      html += `<tr class="hover:bg-slate-50 dark:hover:bg-slate-900/50 ${rowBg}">
        <td class="p-3 text-slate-500">${i + 1}</td>
        <td class="p-3 font-bold">${esc(s.nama)}</td>
        <td class="p-3 text-slate-500">@${esc(s.username)}</td>
        <td class="p-3 text-center">${badge}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    $('statusGuruList').innerHTML = html;
  } catch (e) { 
    $('statusGuruList').innerHTML = '<div class="text-center p-6 text-rose-600">Error memuat data guru.</div>'; 
  }
}

function copyBelumIsi() {
  const res = appState.lastStatusData;
  if (!res || !res.list) return showToast('Muat data dulu.', 'warning');
  const belum = res.list.filter(r => !r.sudah);
  if (!belum.length) return showToast('Semua sudah isi! 🎉', 'success');
  const header = `Daftar siswa belum isi Mutabaah (${$('statusDate').value || '-'}):\n`;
  const lines = belum.map((s, i) => `${i + 1}. ${s.nama} (${s.kelas})`).join('\n');
  const text = header + lines;
  const done = () => showToast(`Disalin: ${belum.length} nama`);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => {
      const ta = document.createElement('textarea'); ta.value = text;
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta); done();
    });
  } else {
    const ta = document.createElement('textarea'); ta.value = text;
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta); done();
  }
}

function renderChart(labels, data) {
  if (myChart) myChart.destroy();
  const canvas = $('lbChart'); if (!canvas) return;
  const isDark = document.documentElement.classList.contains('dark');
  myChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Poin', data, backgroundColor: '#059669', borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' } } } }
  });
}

function openModal(id) { const el = $(id); if (el) el.classList.remove('hidden'); }
function closeModal(id) { const el = $(id); if (el) el.classList.add('hidden'); }
function showCustomConfirm(title, msg, cb) {
  $('alertTitle').innerText = title;
  $('alertMessage').innerText = msg;
  openModal('alertModal');
  $('alertActionBtn').onclick = () => { cb(); closeModal('alertModal'); };
}

function filterStudentTable() {
  const q = $('searchStudentModal').value.toLowerCase().trim();
  document.querySelectorAll('#studentTableBody tr').forEach(r => { r.style.display = !q || r.innerText.toLowerCase().includes(q) ? '' : 'none'; });
}
function filterTeacherTable() {
  const q = $('searchTeacherModal').value.toLowerCase().trim();
  document.querySelectorAll('#teacherTableBody tr').forEach(r => { r.style.display = !q || r.innerText.toLowerCase().includes(q) ? '' : 'none'; });
}

async function openClassModal() {
  openModal('classModal');
  try {
    const res = await gsRun('getClasses');
    $('classTableBody').innerHTML = (res || []).map(k => `<tr><td class="p-2 font-medium">${esc(k.nama)}</td><td class="p-2 text-right"><button onclick="confirmDelClass('${esc(k.id)}')" aria-label="Hapus Kelas" class="text-rose-600"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></td></tr>`).join('');
  } catch (e) {}
}
async function saveClassData() {
  const btn = $('btnSaveClass'); const origHtml = btn.innerHTML;
  const n = $('className').value.trim(); if (!n) return;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; btn.disabled = true;
  try {
    const res = await gsRun('saveClass', '', n);
    showToast((res && res.message) || 'Tersimpan');
    $('className').value = '';
    openClassModal(); loadFilterClasses(); loadFillForOptions();
  } catch (e) { showToast('Gagal.', 'error'); }
  finally { btn.innerHTML = origHtml; btn.disabled = false; }
}
function confirmDelClass(id) {
  showCustomConfirm('Hapus Kelas', 'Yakin menghapus kelas ini?', async () => {
    try { const res = await gsRun('deleteClass', id); showToast((res && res.message) || 'Terhapus'); openClassModal(); loadFilterClasses(); loadFillForOptions(); } catch (e) {}
  });
}

async function openStudentModal() {
  openModal('studentModal');
  $('searchStudentModal').value = '';
  try {
    const students = await gsRun('getStudentsForBulk');
    appState.allStudentsCache = students || [];
    $('studentTableBody').innerHTML = (students || []).map(s => `<tr><td class="p-2"><b>${esc(s.nama)}</b><span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 ml-1">siswa</span><br><span class="text-[10px] text-slate-500">NIS ${esc(s.username)} · ${esc(s.kelas || '-')} · ${esc(s.gender)}</span></td><td class="p-2 text-right"><button onclick="confirmDelStudent('${esc(s.username)}')" aria-label="Hapus Siswa" class="text-rose-600"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></td></tr>`).join('') || '<tr><td colspan="2" class="text-center p-3 text-slate-500 text-xs">Belum ada akun siswa.</td></tr>';
  } catch (e) {}
}
async function saveStudentData() {
  const btn = $('btnSaveStudent'); const origHtml = btn.innerHTML;
  const nis = $('studentNis').value.trim();
  const pin = $('studentPin').value.trim() || '1234';
  const nama = $('studentName').value.trim();
  const gender = $('studentGenderSelect').value;
  const kelas = $('studentKelasBinaan').value.trim();
  if (!nis) return showToast('NIS wajib diisi!', 'error');
  if (!nama) return showToast('Nama wajib diisi!', 'error');
  
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...'; btn.disabled = true;
  try {
    const res = await gsRun('saveStudent', '', nis, pin, 'siswa', nama, gender, kelas);
    if (res && res.success) {
      showToast(res.message || 'Tersimpan');
      $('studentNis').value = ''; $('studentPin').value = ''; $('studentName').value = ''; $('studentKelasBinaan').value = '';
      openStudentModal(); loadFillForOptions();
    } else showToast((res && res.message) || 'Gagal.', 'error');
  } catch (e) { showToast('Gagal.', 'error'); }
  finally { btn.innerHTML = origHtml; btn.disabled = false; }
}
function confirmDelStudent(id) {
  showCustomConfirm('Hapus Akun Siswa', 'Yakin menghapus akun siswa ini?', async () => {
    try { const res = await gsRun('deleteStudent', id); showToast((res && res.message) || 'Terhapus'); openStudentModal(); loadFillForOptions(); } catch (e) {}
  });
}

async function openTeacherModal() {
  openModal('teacherModal');
  $('searchTeacherModal').value = '';
  try {
    const teachers = await gsRun('getTeachers');
    appState.allTeachersCache = teachers || [];
    $('teacherTableBody').innerHTML = (teachers || []).map(s => `<tr><td class="p-2"><b>${esc(s.nama)}</b><span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 ml-1">${esc(s.role || 'guru')}</span><br><span class="text-[10px] text-slate-500">@${esc(s.username)} · ${esc(s.kelas || '-')} · ${esc(s.gender)}</span></td><td class="p-2 text-right"><button onclick="confirmDelTeacher('${esc(s.id)}')" aria-label="Hapus Guru" class="text-rose-600"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></td></tr>`).join('') || '<tr><td colspan="2" class="text-center p-3 text-slate-500 text-xs">Belum ada akun guru.</td></tr>';
  } catch (e) {}
}
async function saveTeacherData() {
  const btn = $('btnSaveTeacher'); const origHtml = btn.innerHTML;
  const username = $('teacherUsername').value.trim();
  const pin = $('teacherPin').value.trim() || '1234';
  const nama = $('teacherName').value.trim();
  const role = $('teacherRoleSelect').value;
  const gender = $('teacherGenderSelect').value;
  const kelasBinaan = $('teacherKelasBinaan').value.trim();
  if (!username) return showToast('Username wajib diisi!', 'error');
  if (!nama) return showToast('Nama lengkap wajib diisi!', 'error');
  
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...'; btn.disabled = true;
  try {
    const res = await gsRun('saveTeacher', '', username, pin, role, nama, gender, kelasBinaan);
    if (res && res.success) {
      showToast(res.message || 'Tersimpan');
      $('teacherUsername').value = ''; $('teacherPin').value = ''; $('teacherName').value = ''; $('teacherKelasBinaan').value = '';
      openTeacherModal();
    } else showToast((res && res.message) || 'Gagal.', 'error');
  } catch (e) { showToast('Gagal.', 'error'); }
  finally { btn.innerHTML = origHtml; btn.disabled = false; }
}
function confirmDelTeacher(id) {
  showCustomConfirm('Hapus Akun Guru', 'Yakin menghapus akun guru ini?', async () => {
    try { const res = await gsRun('deleteTeacher', id); showToast((res && res.message) || 'Terhapus'); openTeacherModal(); } catch (e) {}
  });
}

function confirmArchive() {
  showCustomConfirm('Tutup Semester', 'Data mutabaah akan di-backup & dikosongkan. Lanjutkan?', () => {
    showCustomConfirm('Konfirmasi Terakhir', 'Tidak dapat dibatalkan. Yakin?', async () => {
      showToast('Memproses arsip...', 'warning');
      try {
        const res = await gsRun('archiveData');
        showToast((res && res.message) || 'Arsip selesai', 'success');
        loadReportData();
      } catch (e) {}
    });
  });
}

// ==========================================
// FITUR PWA: REGISTRASI SERVICE WORKER
// ==========================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then((reg) => {
        console.log('Service Worker berhasil didaftarkan. Scope:', reg.scope);
      })
      .catch((err) => {
        console.error('Service Worker gagal didaftarkan:', err);
      });
  });
}