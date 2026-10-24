// ============================================================
// KONFIGURASI
// ============================================================
const SPREADSHEET_NAME = "Database GAS Mutabaah Yaumiyah";
const SPREADSHEET_ID = "1RBf5v_iP7kMTOinPCcc5x2_XxIlYiRTb7NwE5-89-iI";
const TZ = "Asia/Jakarta";

// ============================================================
// SKEMA SHEET
// ============================================================
const SHEET_SCHEMAS = {
  Mutabaah_Siswa: {
    canonical: ["Timestamp","Tanggal","Nama","Kelas","TotalPoin","Haid","Shubuh","Dzuhur","Ashar","Maghrib","Isya","BantuOrtu","BijakHP","Belajar","Tidur","Tilawah","Catatan"],
    aliases: {
      Timestamp: ["timestamp","waktu"], Tanggal: ["tanggal","tgl","date"],
      Nama: ["nama","namasiswa","nama_siswa","namalengkap","nama_lengkap"],
      Kelas: ["kelas","class","rombel"], TotalPoin: ["totalpoin","total_poin","poin","skor","total"],
      Haid: ["haid","statushaid","status_haid"], Shubuh: ["shubuh","subuh","fajr"],
      Dzuhur: ["dzuhur","zuhur","dhuhur"], Ashar: ["ashar","asar"], Maghrib: ["maghrib","magrib"],
      Isya: ["isya","isha"], BantuOrtu: ["bantuortu","bantu_ortu"], BijakHP: ["bijakhp","bijak_hp"],
      Belajar: ["belajar","murajaah"], Tidur: ["tidur"], Tilawah: ["tilawah","tilawahquran"], Catatan: ["catatan","notes","keterangan"]
    },
    textFields: ["Nama","Kelas"]
  },
    Mutabaah_Guru: {
    canonical: ["Timestamp","Tanggal","Nama","Haid","Shubuh","Dzuhur","Ashar","Maghrib","Isya","Dzikir","Tilawah2Lbr","MujahadahMandiri","Catatan"],
    aliases: {
      Timestamp: ["timestamp","waktu"], Tanggal: ["tanggal","tgl","date"],
      Nama: ["nama","namaguru","nama_guru","namalengkap","nama_lengkap"], Haid: ["haid","statushaid","status_haid"],
      Shubuh: ["shubuh","subuh"], Dzuhur: ["dzuhur","zuhur","dhuhur"], Ashar: ["ashar","asar"],
      Maghrib: ["maghrib","magrib"], Isya: ["isya","isha"], Dzikir: ["dzikir","zikir"],
      Tilawah2Lbr: ["tilawah2lbr","tilawah_2lbr","tilawah2lembar"], 
      // Tambahkan alias mujahadah, tetap pertahankan alias bahanajar agar data lama tidak rusak
      MujahadahMandiri: ["mujahadahmandiri", "mujahadah_mandiri", "mujahadah", "bahanajar", "bahan_ajar"], 
      Catatan: ["catatan","notes","keterangan"]
    },
    textFields: ["Nama"]
  },
  Master_Kelas: {
    canonical: ["ID","NamaKelas"],
    aliases: { ID: ["id","uuid","kode"], NamaKelas: ["namakelas","nama_kelas","nama","kelas"] },
    textFields: ["ID","NamaKelas"]
  },
  Master_Akun: {
    canonical: ["Username","PIN","Role","NamaLengkap","Gender","KelasBinaan"],
    aliases: {
      Username: ["username","user","nis","nisn","id"], PIN: ["pin","password","sandi","pass"],
      Role: ["role","peran","jabatan","tipe"], NamaLengkap: ["namalengkap","nama_lengkap","fullname","nama"],
      Gender: ["gender","jk","jeniskelamin"], KelasBinaan: ["kelasbinaan","kelas_binaan","kelas","class","rombel","binaan"]
    },
    textFields: ["Username","PIN","Role","KelasBinaan"]
  },
  Master_Siswa: {
    canonical: ["ID","NIS","Nama","Kelas","Gender","PIN"],
    aliases: {
      ID: ["id","uuid"], NIS: ["nis","nisn","username","user","nomorinduk"],
      Nama: ["nama","namasiswa","nama_siswa","namalengkap","nama_lengkap"],
      Kelas: ["kelas","class","rombel"], Gender: ["gender","jk","jeniskelamin"], PIN: ["pin","password","sandi"]
    },
    textFields: ["ID","NIS","Kelas","PIN"]
  }
};

// ============================================================
// HELPER
// ============================================================
function toLocalDateStr(d) {
  if (!d) return '';
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  try { return Utilities.formatDate(new Date(d), TZ, "yyyy-MM-dd"); } catch (e) { return ''; }
}
function normHeader(s) { return String(s || '').toLowerCase().replace(/[\s_\-]+/g, ''); }
function normName(s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
function sameName(a, b) { return normName(a) === normName(b); }
function dateToClassString(d) {
  if (!(d instanceof Date)) return String(d || '');
  return `${d.getDate()}.${d.getMonth() + 1}`;
}
function getRoleForSheet(sheetName) {
  return sheetName === 'Mutabaah_Siswa' ? 'siswa' : 'guru';
}

// ============================================================
// SPREADSHEET
// ============================================================
function getActiveSpreadsheet() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== '') {
    try { return SpreadsheetApp.openById(SPREADSHEET_ID); } catch (e) {}
  }
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('ACTIVE_SS_ID');
  if (savedId) { try { return SpreadsheetApp.openById(savedId); } catch (e) {} }
  const files = DriveApp.getFilesByName(SPREADSHEET_NAME);
  if (files.hasNext()) {
    const ss = SpreadsheetApp.open(files.next());
    props.setProperty('ACTIVE_SS_ID', ss.getId());
    return ss;
  }
  throw new Error('Database tidak ditemukan. Isi SPREADSHEET_ID di code.gs.');
}

// ============================================================
// SCHEMA UTILS
// ============================================================
function getColumnMap(sheet, schemaKey) {
  const schema = SHEET_SCHEMAS[schemaKey];
  if (!schema) return {};
  const lastCol = Math.max(1, sheet.getLastColumn());
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const normalized = headers.map(normHeader);
  const map = {};
  for (const field of schema.canonical) {
    const aliases = (schema.aliases[field] || [field]).map(normHeader);
    let idx = -1;
    for (const a of aliases) {
      const found = normalized.indexOf(a);
      if (found !== -1) { idx = found; break; }
    }
    map[field] = idx;
  }
  return map;
}
function applyTextFormat(sheet, schemaKey) {
  const schema = SHEET_SCHEMAS[schemaKey];
  if (!schema || !schema.textFields) return;
  const map = getColumnMap(sheet, schemaKey);
  const totalRows = Math.max(1, sheet.getMaxRows() - 1);
  schema.textFields.forEach(field => {
    const idx = map[field];
    if (idx >= 0) sheet.getRange(2, idx + 1, totalRows, 1).setNumberFormat('@');
  });
}
function ensureSchema(sheet, schemaKey) {
  const schema = SHEET_SCHEMAS[schemaKey];
  if (!schema) return {};
  let map = getColumnMap(sheet, schemaKey);
  const missing = schema.canonical.filter(f => map[f] === -1);
  if (missing.length) {
    const lastCol = Math.max(1, sheet.getLastColumn());
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
    map = getColumnMap(sheet, schemaKey);
  }
  applyTextFormat(sheet, schemaKey);
  return map;
}
function readField(row, map, field) {
  const idx = map[field];
  return (idx >= 0 && idx < row.length) ? row[idx] : '';
}
function buildRow(sheet, map, values) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const row = new Array(lastCol).fill('');
  for (const field in values) {
    const idx = map[field];
    if (idx >= 0 && idx < lastCol) row[idx] = values[field];
  }
  return row;
}

// ============================================================
// SETUP / MIGRATE / CLEANUP
// ============================================================
function setupInitialSheets(ss) {
  if (!ss) return;
  for (const sheetName in SHEET_SCHEMAS) {
    let sh = ss.getSheetByName(sheetName);
    if (!sh) {
      sh = ss.insertSheet(sheetName);
      sh.appendRow(SHEET_SCHEMAS[sheetName].canonical);
      applyTextFormat(sh, sheetName);
      if (sheetName === "Master_Kelas") {
        ["7.1","7.2","8.1","8.2","8.3","9.1","9.2","9.3","10.1","10.2","11.1","11.2","12.1","12.2"]
          .forEach(k => {
            const map = getColumnMap(sh, "Master_Kelas");
            sh.appendRow(buildRow(sh, map, { ID: Utilities.getUuid(), NamaKelas: k }));
          });
      }
      if (sheetName === "Master_Akun") {
        [["admin","1234","admin","Admin Utama","L",""],
         ["ustadz.ahmad","1234","guru","Ustadz Ahmad","L",""],
         ["ustadzah.fat","1234","musyrif","Ustadzah Fatimah","P",""],
         ["wali.7a","1234","wali","Pak Wali Kelas 7A","L","7.1, 7.2"]]
          .forEach(r => {
            const map = getColumnMap(sh, "Master_Akun");
            sh.appendRow(buildRow(sh, map, {
              Username: r[0], PIN: r[1], Role: r[2], NamaLengkap: r[3], Gender: r[4], KelasBinaan: r[5]
            }));
          });
      }
    }
  }
  const sh1 = ss.getSheetByName("Sheet1");
  if (sh1 && ss.getSheets().length > 1) ss.deleteSheet(sh1);
}
function INSTALL_DATABASE() {
  let ss = null;
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== '') {
    try { ss = SpreadsheetApp.openById(SPREADSHEET_ID); } catch (e) {}
  }
  if (!ss) {
    const files = DriveApp.getFilesByName(SPREADSHEET_NAME);
    if (files.hasNext()) ss = SpreadsheetApp.open(files.next());
  }
  if (!ss) ss = SpreadsheetApp.create(SPREADSHEET_NAME);
  setupInitialSheets(ss);
  PropertiesService.getScriptProperties().setProperty('ACTIVE_SS_ID', ss.getId());
  Logger.log("✅ " + ss.getUrl());
  return "Setup Berhasil! URL: " + ss.getUrl();
}
function MIGRATE_SCHEMAS() {
  const ss = getActiveSpreadsheet();
  const report = [];
  for (const sheetName in SHEET_SCHEMAS) {
    let sh = ss.getSheetByName(sheetName);
    if (!sh) {
      sh = ss.insertSheet(sheetName);
      sh.appendRow(SHEET_SCHEMAS[sheetName].canonical);
      applyTextFormat(sh, sheetName);
      report.push(`➕ ${sheetName}: dibuat baru`);
      continue;
    }
    const before = getColumnMap(sh, sheetName);
    const after = ensureSchema(sh, sheetName);
    const added = Object.keys(after).filter(f => before[f] === -1 && after[f] !== -1);
    const schema = SHEET_SCHEMAS[sheetName];
    const converted = [];
    (schema.textFields || []).forEach(field => {
      const idx = after[field];
      if (idx === -1) return;
      const lastRow = sh.getLastRow();
      if (lastRow < 2) return;
      const range = sh.getRange(2, idx + 1, lastRow - 1, 1);
      const vals = range.getValues();
      let changed = 0;
      const fixed = vals.map(([v]) => {
        if (v === '' || v === null || v === undefined) return [''];
        if (v instanceof Date) { changed++; return [dateToClassString(v)]; }
        return [String(v)];
      });
      if (changed > 0) {
        range.setNumberFormat('@');
        range.setValues(fixed);
        converted.push(`${field}:${changed}`);
      }
    });
    const parts = [];
    if (added.length) parts.push(`+ ${added.join(', ')}`);
    if (converted.length) parts.push(`fix-teks ${converted.join(', ')}`);
    report.push(parts.length ? `🔧 ${sheetName}: ${parts.join(' | ')}` : `✅ ${sheetName}: sesuai`);
  }
  const msg = report.join('\n');
  Logger.log(msg);
  return { success: true, message: msg };
}
function FIX_TEXT_COLUMNS() {
  const ss = getActiveSpreadsheet();
  const report = [];
  for (const sheetName in SHEET_SCHEMAS) {
    const sh = ss.getSheetByName(sheetName);
    if (!sh) continue;
    const schema = SHEET_SCHEMAS[sheetName];
    const map = getColumnMap(sh, sheetName);
    (schema.textFields || []).forEach(field => {
      const idx = map[field];
      if (idx === -1) return;
      const maxRows = Math.max(1, sh.getMaxRows() - 1);
      sh.getRange(2, idx + 1, maxRows, 1).setNumberFormat('@');
      const lastRow = sh.getLastRow();
      if (lastRow < 2) { report.push(`✅ ${sheetName}.${field}`); return; }
      const range = sh.getRange(2, idx + 1, lastRow - 1, 1);
      const vals = range.getValues();
      let changed = 0;
      const fixed = vals.map(([v]) => {
        if (v === '' || v === null || v === undefined) return [''];
        if (v instanceof Date) { changed++; return [dateToClassString(v)]; }
        return [String(v)];
      });
      if (changed > 0) {
        range.setNumberFormat('@');
        range.setValues(fixed);
        report.push(`🔧 ${sheetName}.${field}: ${changed} sel`);
      } else report.push(`✅ ${sheetName}.${field}`);
    });
  }
  const msg = report.join('\n');
  Logger.log(msg);
  return { success: true, message: msg };
}
function CLEANUP_DUPLICATE_FILES() {
  const props = PropertiesService.getScriptProperties();
  const KEEP_ID = SPREADSHEET_ID || props.getProperty('ACTIVE_SS_ID');
  if (!KEEP_ID) { Logger.log('❌ Tidak ada ID patokan.'); return; }
  const files = DriveApp.getFilesByName(SPREADSHEET_NAME);
  let del = 0, keep = 0;
  while (files.hasNext()) {
    const f = files.next();
    if (f.getId() === KEEP_ID) { keep++; Logger.log('✅ ' + f.getName()); }
    else { f.setTrashed(true); del++; Logger.log('🗑️ ' + f.getName()); }
  }
  Logger.log(`Selesai. Disimpan: ${keep}, Di-trash: ${del}`);
}
function DEBUG_HISTORY(nama) {
  if (!nama) { Logger.log('⚠️ Isi nama: DEBUG_HISTORY("...")'); return; }
  const ss = getActiveSpreadsheet();
  ['Mutabaah_Siswa', 'Mutabaah_Guru'].forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    const map = getColumnMap(sheet, sheetName);
    const data = sheet.getDataRange().getValues();
    const matches = [];
    const allNames = new Set();
    for (let i = 1; i < data.length; i++) {
      const n = String(readField(data[i], map, 'Nama') || '').trim();
      if (n) allNames.add(n);
      if (sameName(readField(data[i], map, 'Nama'), nama)) {
        matches.push({ row: i + 1, tanggal: toLocalDateStr(readField(data[i], map, 'Tanggal')) });
      }
    }
    Logger.log(`${sheetName}: ${matches.length} match. Total nama unik: ${allNames.size}`);
    matches.slice(0, 10).forEach(m => Logger.log(`  Baris ${m.row}: ${m.tanggal}`));
  });
}

// ============================================================
// PRAYER
// ============================================================
function getPrayerTimes(city, country) {
  city = city || 'Jakarta'; country = country || 'Indonesia';
  const url = 'https://api.aladhan.com/v1/timingsByCity?city=' + encodeURIComponent(city) +
              '&country=' + encodeURIComponent(country) + '&method=20';
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return { success: false, message: 'HTTP ' + res.getResponseCode() };
    const data = JSON.parse(res.getContentText());
    if (data && data.data && data.data.timings) return { success: true, timings: data.data.timings };
    return { success: false, message: 'Respons tidak valid' };
  } catch (e) { return { success: false, message: 'Gagal: ' + e }; }
}

// ============================================================
// AUTH
// ============================================================
function _readAuthSource(ss, sheetName, opts) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return [];
  const map = ensureSchema(sh, sheetName);
  const data = sh.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    let username = '';
    for (const f of opts.usernameFields) {
      const v = readField(r, map, f);
      if (v && String(v).trim()) { username = String(v).trim(); break; }
    }
    if (!username) continue;
    let namaLengkap = '';
    for (const f of opts.nameFields) {
      const v = readField(r, map, f);
      if (v && String(v).trim()) { namaLengkap = String(v).trim(); break; }
    }
    if (!namaLengkap) namaLengkap = username;
    const role = opts.roleDefault || String(readField(r, map, 'Role') || '').toLowerCase().trim();
    const gender = String(readField(r, map, 'Gender') || 'L').trim();
    const kelasRaw = readField(r, map, 'KelasBinaan') || readField(r, map, 'Kelas') || '';
    rows.push({
      source: sheetName, username, namaLengkap,
      pin: String(readField(r, map, 'PIN') || '').trim(),
      role, gender,
      kelasBinaan: String(kelasRaw).split(/[,;]+/).map(s => s.trim()).filter(Boolean)
    });
  }
  return rows;
}
function getAllAuthRows() {
  const ss = getActiveSpreadsheet();
  const akunRows = _readAuthSource(ss, 'Master_Akun', {
    roleDefault: '', usernameFields: ['Username'], nameFields: ['NamaLengkap']
  });
  const siswaRows = _readAuthSource(ss, 'Master_Siswa', {
    roleDefault: 'siswa', usernameFields: ['NIS', 'Nama'], nameFields: ['Nama']
  });
  return { akunRows, siswaRows, all: akunRows.concat(siswaRows) };
}
function verifyLogin(user, pin) {
  if (!user || pin === undefined || pin === null || pin === '') {
    return { success: false, message: 'Username dan PIN wajib diisi!' };
  }
  const { all } = getAllAuthRows();
  if (!all.length) return { success: false, message: 'Master akun belum tersedia / kosong.' };
  const query = user.toString().toLowerCase().trim();
  const pinStr = pin.toString().trim();
  const VALID_ROLES = ['siswa', 'guru', 'wali', 'musyrif', 'admin'];
  const candidates = [];
  all.forEach(r => {
    const u = r.username.toLowerCase();
    const n = (r.namaLengkap || '').toLowerCase();
    const isExact = u === query || n === query;
    const isFirstWord = u.split(/[\s._-]+/)[0] === query || n.split(/\s+/)[0] === query;
    const isSubstring = u.includes(query) || n.includes(query);
    if (isExact || isFirstWord || isSubstring) {
      candidates.push({ row: r, priority: isExact ? 0 : (isFirstWord ? 1 : 2) });
    }
  });
  if (!candidates.length) return { success: false, message: 'Akun / Username tidak ditemukan!' };
  const valid = candidates.filter(c => c.row.pin === pinStr).sort((a, b) => a.priority - b.priority)[0];
  if (!valid) return { success: false, message: 'PIN Akses salah!' };
  const r = valid.row;
  let role = '';
  if (VALID_ROLES.includes(r.role)) role = r.role;
  else {
    const u = r.username.toLowerCase();
    if (u.includes('admin')) role = 'admin';
    else if (u.includes('musyrif')) role = 'musyrif';
    else if (u.includes('wali')) role = 'wali';
    else if (u.includes('guru') || u.includes('ustadz') || u.includes('staff')) role = 'guru';
    else role = 'siswa';
  }
  return {
    success: true, role, nama: r.namaLengkap || r.username,
    username: r.username, kelasBinaan: r.kelasBinaan,
    gender: r.gender, source: r.source
  };
}

// ============================================================
// FITUR 1: GANTI PIN MANDIRI
// ============================================================
function changeOwnPin(username, oldPin, newPin) {
  if (!username || !oldPin || !newPin) return { success: false, message: 'Semua field wajib diisi' };
  const np = String(newPin).trim();
  if (np.length < 4) return { success: false, message: 'PIN minimal 4 karakter' };
  if (!/^\d+$/.test(np)) return { success: false, message: 'PIN hanya angka' };
  const ss = getActiveSpreadsheet();
  for (const sheetName of ['Master_Akun', 'Master_Siswa']) {
    const sh = ss.getSheetByName(sheetName);
    if (!sh) continue;
    const map = ensureSchema(sh, sheetName);
    const data = sh.getDataRange().getValues();
    const keyField = sheetName === 'Master_Siswa' ? 'NIS' : 'Username';
    for (let i = 1; i < data.length; i++) {
      const u = String(readField(data[i], map, keyField) || '').trim();
      if (u.toLowerCase() === username.toLowerCase().trim()) {
        const curPin = String(readField(data[i], map, 'PIN') || '').trim();
        if (curPin !== String(oldPin).trim()) return { success: false, message: 'PIN lama salah' };
        const pinCol = map['PIN'] + 1;
        sh.getRange(i + 1, pinCol).setValue(np);
        return { success: true, message: 'PIN berhasil diubah' };
      }
    }
  }
  return { success: false, message: 'Akun tidak ditemukan' };
}

// ============================================================
// FITUR 3: DETAIL HISTORY PER SISWA
// ============================================================
function getStudentTimeline(nama, role, days) {
  days = days || 30;
  const ss = getActiveSpreadsheet();
  const isTeacher = ['guru','wali','musyrif','admin'].includes((role||'').toString().toLowerCase());
  const sheetName = isTeacher ? 'Mutabaah_Guru' : 'Mutabaah_Siswa';
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: false, message: 'Sheet tidak ditemukan' };
  const map = getColumnMap(sheet, sheetName);
  const data = sheet.getDataRange().getValues();
  const items = isTeacher
    ? ['Shubuh','Dzuhur','Ashar','Maghrib','Isya','Dzikir','Tilawah2Lbr','BahanAjar']
    : ['Shubuh','Dzuhur','Ashar','Maghrib','Isya','BantuOrtu','BijakHP','Belajar','Tidur','Tilawah'];

  const result = [];
  for (let i = 1; i < data.length; i++) {
    if (!sameName(readField(data[i], map, 'Nama'), nama)) continue;
    const tgl = toLocalDateStr(readField(data[i], map, 'Tanggal'));
    if (!tgl) continue;
    const vals = {};
    items.forEach(f => { vals[f] = readField(data[i], map, f) === 'Ya'; });
    result.push({
      tgl,
      poin: parseInt(readField(data[i], map, 'TotalPoin')) || 0,
      haid: readField(data[i], map, 'Haid') === 'Ya',
      catatan: readField(data[i], map, 'Catatan') || '',
      items: vals,
      itemKeys: items,
      isTeacher
    });
  }
  result.sort((a, b) => String(b.tgl).localeCompare(String(a.tgl)));
  return { success: true, nama, data: result.slice(0, days) };
}

// ============================================================
// FITUR 4: ISI MASSAL
// ============================================================
function bulkSubmitMutabaah(payloads) {
  if (!Array.isArray(payloads) || !payloads.length) {
    return { success: false, message: 'Tidak ada data untuk disimpan' };
  }
  let ok = 0, fail = 0;
  payloads.forEach(p => {
    try {
      const r = submitMutabaah(p);
      if (r && r.success) ok++; else fail++;
    } catch (e) { fail++; }
  });
  return {
    success: true,
    message: `${ok} tersimpan${fail ? ', ' + fail + ' gagal' : ''}`,
    okCount: ok, failCount: fail
  };
}

// ============================================================
// FITUR 5: CHART PERBANDINGAN KELAS
// ============================================================
function getClassComparison(startDate, endDate) {
  const ss = getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Mutabaah_Siswa');
  if (!sheet) return { success: false, message: 'Mutabaah_Siswa tidak ditemukan' };
  const map = getColumnMap(sheet, 'Mutabaah_Siswa');
  const data = sheet.getDataRange().getValues();

  const byKelas = {};
  for (let i = 1; i < data.length; i++) {
    const tgl = toLocalDateStr(readField(data[i], map, 'Tanggal'));
    if (!tgl) continue;
    if (startDate && tgl < startDate) continue;
    if (endDate && tgl > endDate) continue;
    const kelasRaw = String(readField(data[i], map, 'Kelas') || '').trim();
    const kelas = kelasRaw.split(/[,;]+/)[0].trim();
    if (!kelas) continue;
    const poin = parseInt(readField(data[i], map, 'TotalPoin')) || 0;
    if (!byKelas[kelas]) byKelas[kelas] = { kelas, sum: 0, count: 0 };
    byKelas[kelas].sum += poin;
    byKelas[kelas].count += 1;
  }

  const rows = Object.values(byKelas).map(k => ({
    kelas: k.kelas,
    avg: k.count ? Math.round(k.sum / k.count) : 0,
    total: k.count
  }));
  rows.sort((a, b) => {
    const pa = a.kelas.split('.').map(Number), pb = b.kelas.split('.').map(Number);
    if (pa[0] !== pb[0]) return pa[0] - pb[0];
    return (pa[1] || 0) - (pb[1] || 0);
  });
  return { success: true, rows };
}

// ============================================================
// FITUR 6: BADGE NOTIFIKASI IN-APP
// ============================================================
function getMyNotif(username, nama, role) {
  const ss = getActiveSpreadsheet();
  const isTeacher = ['guru','wali','musyrif','admin'].includes((role||'').toString().toLowerCase());
  const sheetName = isTeacher ? 'Mutabaah_Guru' : 'Mutabaah_Siswa';
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: true, unread: 0, message: '' };
  const map = getColumnMap(sheet, sheetName);
  const data = sheet.getDataRange().getValues();

  const dates = new Set();
  for (let i = 1; i < data.length; i++) {
    if (sameName(readField(data[i], map, 'Nama'), nama)) {
      const t = toLocalDateStr(readField(data[i], map, 'Tanggal'));
      if (t) dates.add(t);
    }
  }

  const today = toLocalDateStr(new Date());
  const yesterday = toLocalDateStr(new Date(Date.now() - 86400000));
  let unread = 0, message = '';

  if (!dates.has(today)) {
    unread = 1;
    message = dates.has(yesterday)
      ? 'Isi Mutabaah hari ini — jaga streak Anda!'
      : 'Sudah beberapa hari tidak isi Mutabaah. Yuk isi lagi!';
    let gap = 0;
    for (let i = 0; i < 30; i++) {
      const d = toLocalDateStr(new Date(Date.now() - i * 86400000));
      if (dates.has(d)) break;
      gap++;
    }
    if (gap >= 3) message = `Anda tidak isi ${gap} hari. Yuk mulai lagi!`;
  } else if (!dates.has(yesterday) && dates.size > 1) {
    unread = 0;
    message = '';
  }

  let streak = 0;
  const cursor = new Date();
  if (!dates.has(toLocalDateStr(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (dates.has(toLocalDateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { success: true, unread, message, streak, sudahHariIni: dates.has(today) };
}

// ============================================================
// FITUR 7: LEADERBOARD STREAK
// ============================================================
function getStreakLeaderboard() {
  const ss = getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Mutabaah_Siswa');
  if (!sheet) return { success: false, message: 'Mutabaah_Siswa tidak ditemukan' };
  const map = getColumnMap(sheet, 'Mutabaah_Siswa');
  const data = sheet.getDataRange().getValues();

  const perNama = {};
  for (let i = 1; i < data.length; i++) {
    const n = String(readField(data[i], map, 'Nama') || '').trim();
    if (!n) continue;
    const t = toLocalDateStr(readField(data[i], map, 'Tanggal'));
    if (!t) continue;
    const key = normName(n);
    if (!perNama[key]) perNama[key] = { nama: n, kelas: String(readField(data[i], map, 'Kelas') || ''), dates: new Set() };
    perNama[key].dates.add(t);
  }

  const today = new Date();
  const rows = [];
  Object.values(perNama).forEach(item => {
    let streak = 0;
    const cursor = new Date(today);
    if (!item.dates.has(toLocalDateStr(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (item.dates.has(toLocalDateStr(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    if (streak > 0) rows.push({ nama: item.nama, kelas: item.kelas, streak });
  });

  rows.sort((a, b) => b.streak - a.streak);
  return { success: true, rows: rows.slice(0, 10) };
}

// ============================================================
// FITUR 11: STATISTIK DASHBOARD
// ============================================================
function getDashboardStats(tanggal) {
  if (!tanggal) tanggal = toLocalDateStr(new Date());
  const ss = getActiveSpreadsheet();

  const shSiswa = ss.getSheetByName('Master_Siswa');
  let totalSiswa = 0;
  if (shSiswa && shSiswa.getLastRow() > 1) totalSiswa = shSiswa.getLastRow() - 1;

  const shM = ss.getSheetByName('Mutabaah_Siswa');
  let sudah = 0, sumPoin = 0, haid = 0;
  if (shM) {
    const map = getColumnMap(shM, 'Mutabaah_Siswa');
    const data = shM.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (toLocalDateStr(readField(data[i], map, 'Tanggal')) !== tanggal) continue;
      sudah++;
      sumPoin += parseInt(readField(data[i], map, 'TotalPoin')) || 0;
      if (readField(data[i], map, 'Haid') === 'Ya') haid++;
    }
  }

  const weekAgo = toLocalDateStr(new Date(Date.now() - 6 * 86400000));
  const comp = getClassComparison(weekAgo, tanggal);
  let kelasTerbaik = '-';
  if (comp.success && comp.rows.length) {
    const top = comp.rows.slice().sort((a, b) => b.avg - a.avg)[0];
    kelasTerbaik = `${top.kelas} (avg ${top.avg})`;
  }

  return {
    success: true,
    tanggal,
    totalSiswa,
    sudahIsi: sudah,
    belumIsi: Math.max(0, totalSiswa - sudah),
    persen: totalSiswa ? Math.round(sudah / totalSiswa * 100) : 0,
    avgPoin: sudah ? Math.round(sumPoin / sudah) : 0,
    jumlahHaid: haid,
    kelasTerbaik
  };
}

// ============================================================
// SUBMIT MUTABAAH (existing)
// ============================================================
function submitMutabaah(payload) {
  if (!payload) return { success: false, message: 'Data payload tidak valid!' };
  const ss = getActiveSpreadsheet();
  const role = payload.role ? payload.role.toString().toLowerCase() : 'siswa';
  const isTeacher = ['guru','wali','musyrif','admin'].includes(role);
  const sheetName = isTeacher ? "Mutabaah_Guru" : "Mutabaah_Siswa";
  const sheet = ss.getSheetByName(sheetName);
  const map = ensureSchema(sheet, sheetName);
  const data = sheet.getDataRange().getValues();
  const tanggal = payload.tanggal;
  const nama = payload.nama;
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    const t = toLocalDateStr(readField(data[i], map, 'Tanggal'));
    const n = readField(data[i], map, 'Nama');
    if (t === tanggal && sameName(n, nama)) { rowIndex = i + 1; break; }
  }
  const values = {
    Timestamp: new Date(), Tanggal: tanggal, Nama: nama,
    Haid: payload.isHaid,
    Shubuh: payload.shubuh, Dzuhur: payload.dzuhur, Ashar: payload.ashar,
    Maghrib: payload.maghrib, Isya: payload.isya,
    Catatan: payload.catatan || ''
  };
  if (isTeacher) {
    values.Dzikir = payload.dzikir;
    values.Tilawah2Lbr = payload.tilawah_2lbr;
    values.MujahadahMandiri = payload.mujahadah_mandiri;
  } else {
    values.Kelas = payload.kelas;
    values.TotalPoin = payload.totalPoin;
    values.BantuOrtu = payload.bantuOrtu;
    values.BijakHP = payload.bijakHP;
    values.Belajar = payload.belajar;
    values.Tidur = payload.tidur;
    values.Tilawah = payload.tilawah;
  }
  const rowValues = buildRow(sheet, map, values);
  if (rowIndex > -1) sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
  else sheet.appendRow(rowValues);
  const streak = calculateStreak(nama, isTeacher);
  return { success: true, message: 'Mutabaah berhasil disimpan!', streak };
}
function getMutabaahEntry(nama, tanggal, role) {
  if (!nama || !tanggal) return { found: false };
  const ss = getActiveSpreadsheet();
  const isTeacher = ['guru','wali','musyrif','admin'].includes((role||'').toString().toLowerCase());
  const sheetName = isTeacher ? 'Mutabaah_Guru' : 'Mutabaah_Siswa';
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { found: false };
  const map = getColumnMap(sheet, sheetName);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const t = toLocalDateStr(readField(data[i], map, 'Tanggal'));
    const n = readField(data[i], map, 'Nama');
    if (t === tanggal && sameName(n, nama)) {
      const entry = {};
      SHEET_SCHEMAS[sheetName].canonical.forEach(f => { entry[f] = readField(data[i], map, f); });
      return { found: true, entry };
    }
  }
  return { found: false };
}
function getStudentsForBulk() {
  const ss = getActiveSpreadsheet();
  const rows = _readAuthSource(ss, 'Master_Siswa', {
    roleDefault: 'siswa', usernameFields: ['NIS', 'Nama'], nameFields: ['Nama']
  });
  return rows.map(r => ({
    username: r.username, nama: r.namaLengkap,
    kelas: r.kelasBinaan.join(', '), gender: r.gender
  }));
}
function getDailyFillStatus(tanggal, kelasFilter, userRole, userKelasBinaan, statusFilter, searchQuery) {
  if (!tanggal) return { success: false, message: 'Tanggal wajib diisi' };
  const ss = getActiveSpreadsheet();
  const shSiswa = ss.getSheetByName('Master_Siswa');
  if (!shSiswa) return { success: false, message: 'Master_Siswa tidak ditemukan' };
  const siswaMap = ensureSchema(shSiswa, 'Master_Siswa');
  const siswaData = shSiswa.getDataRange().getValues();
  const query = searchQuery ? String(searchQuery).toLowerCase().trim() : '';
  const siswaList = [];
  for (let i = 1; i < siswaData.length; i++) {
    const row = siswaData[i];
    const username = String(readField(row, siswaMap, 'NIS') || '').trim();
    const nama = String(readField(row, siswaMap, 'Nama') || '').trim();
    const kelasRaw = String(readField(row, siswaMap, 'Kelas') || '').trim();
    const gender = String(readField(row, siswaMap, 'Gender') || 'L').trim();
    if (!username || !nama) continue;
    const kelasList = kelasRaw.split(/[,;]+/).map(k => k.trim()).filter(Boolean);
    if (kelasFilter && kelasFilter !== 'all') {
      const match = kelasList.some(k => {
        const jj = k.split('.')[0];
        if (kelasFilter === 'smp' && ['7','8','9'].includes(jj)) return true;
        if (kelasFilter === 'sma' && ['10','11','12'].includes(jj)) return true;
        if (kelasFilter !== 'smp' && kelasFilter !== 'sma' && k === kelasFilter) return true;
        return false;
      });
      if (!match) continue;
    }
    if ((userRole === 'wali' || userRole === 'musyrif') && userKelasBinaan && userKelasBinaan.length) {
      const binaan = userKelasBinaan.map(x => x.toLowerCase().trim());
      if (!kelasList.some(k => binaan.includes(k.toLowerCase().trim()))) continue;
    }
    if (query && !nama.toLowerCase().includes(query)) continue;
    siswaList.push({ username, nama, kelas: kelasRaw, gender });
  }
  const shM = ss.getSheetByName('Mutabaah_Siswa');
  if (!shM) return { success: false, message: 'Mutabaah_Siswa tidak ditemukan' };
  const mMap = getColumnMap(shM, 'Mutabaah_Siswa');
  const mData = shM.getDataRange().getValues();
  const submittedMap = {};
  for (let i = 1; i < mData.length; i++) {
    if (toLocalDateStr(readField(mData[i], mMap, 'Tanggal')) !== tanggal) continue;
    const n = String(readField(mData[i], mMap, 'Nama') || '').trim();
    if (!n) continue;
    submittedMap[normName(n)] = {
      poin: parseInt(readField(mData[i], mMap, 'TotalPoin')) || 0,
      haid: readField(mData[i], mMap, 'Haid')
    };
  }
  let result = siswaList.map(s => {
    const sub = submittedMap[normName(s.nama)];
    return {
      username: s.username, nama: s.nama, kelas: s.kelas, gender: s.gender,
      sudah: !!sub, poin: sub ? sub.poin : 0, haid: sub ? sub.haid : ''
    };
  });
  if (statusFilter === 'sudah') result = result.filter(r => r.sudah);
  else if (statusFilter === 'belum') result = result.filter(r => !r.sudah);
  result.sort((a, b) => {
    if (a.sudah !== b.sudah) return a.sudah ? 1 : -1;
    if (a.kelas !== b.kelas) return String(a.kelas).localeCompare(String(b.kelas));
    return a.nama.localeCompare(b.nama, undefined, { sensitivity: 'base' });
  });
  const sudahCount = result.filter(r => r.sudah).length;
  return {
    success: true, tanggal,
    total: result.length, sudahCount,
    belumCount: result.length - sudahCount,
    data: result
  };
}
function calculateStreak(nama, isTeacher) {
  const ss = getActiveSpreadsheet();
  const sheetName = isTeacher ? "Mutabaah_Guru" : "Mutabaah_Siswa";
  const sheet = ss.getSheetByName(sheetName);
  const map = getColumnMap(sheet, sheetName);
  const data = sheet.getDataRange().getValues();
  const dateSet = new Set();
  for (let i = 1; i < data.length; i++) {
    if (sameName(readField(data[i], map, 'Nama'), nama)) {
      const tgl = toLocalDateStr(readField(data[i], map, 'Tanggal'));
      if (tgl) dateSet.add(tgl);
    }
  }
  if (dateSet.size === 0) return 0;
  let streak = 0;
  const cursor = new Date();
  if (!dateSet.has(toLocalDateStr(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (dateSet.has(toLocalDateStr(cursor))) {
    streak++; cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
function getPersonalHistory(nama, role) {
  const ss = getActiveSpreadsheet();
  const isTeacher = ['guru','wali','musyrif','admin'].includes((role || '').toString().toLowerCase());
  const sheetName = isTeacher ? "Mutabaah_Guru" : "Mutabaah_Siswa";
  const sheet = ss.getSheetByName(sheetName);
  const map = getColumnMap(sheet, sheetName);
  const data = sheet.getDataRange().getValues();
  const history = [];
  for (let i = 1; i < data.length; i++) {
    if (sameName(readField(data[i], map, 'Nama'), nama)) {
      const tgl = toLocalDateStr(readField(data[i], map, 'Tanggal'));
      if (!tgl) continue;
      let val;
      if (isTeacher) {
        const teacherItems = ['Shubuh','Dzuhur','Ashar','Maghrib','Isya','Dzikir','Tilawah2Lbr','BahanAjar'];
        val = teacherItems.filter(f => readField(data[i], map, f) === 'Ya').length;
      } else val = parseInt(readField(data[i], map, 'TotalPoin')) || 0;
      history.push({ tgl, val });
    }
  }
  history.sort((a, b) => String(a.tgl).localeCompare(String(b.tgl)));
  return history.slice(-7);
}

// ============================================================
// MASTER: KELAS
// ============================================================
function getClasses() {
  const ss = getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Master_Kelas");
  if (!sheet) return [];
  const map = ensureSchema(sheet, "Master_Kelas");
  const data = sheet.getDataRange().getValues();
  const classes = [];
  for (let i = 1; i < data.length; i++) {
    const nama = readField(data[i], map, 'NamaKelas');
    if (nama) classes.push({
      id: String(readField(data[i], map, 'ID') || ''),
      nama: String(nama).trim()
    });
  }
  classes.sort((a, b) => {
    const pa = a.nama.split('.').map(Number), pb = b.nama.split('.').map(Number);
    if (pa[0] !== pb[0]) return pa[0] - pb[0];
    return (pa[1] || 0) - (pb[1] || 0);
  });
  return classes;
}
function saveClass(id, nama) {
  if (!nama || !nama.toString().trim()) return { success: false, message: 'Nama kelas wajib diisi' };
  const ss = getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Master_Kelas");
  const map = ensureSchema(sheet, "Master_Kelas");
  sheet.appendRow(buildRow(sheet, map, { ID: Utilities.getUuid(), NamaKelas: nama.toString().trim() }));
  return { success: true, message: 'Kelas berhasil disimpan' };
}
function deleteClass(id) {
  const ss = getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Master_Kelas");
  const map = ensureSchema(sheet, "Master_Kelas");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(readField(data[i], map, 'ID')) === String(id)) { sheet.deleteRow(i + 1); break; }
  }
  return { success: true, message: 'Kelas dihapus' };
}

// ============================================================
// MASTER: AKUN
// ============================================================
function getTeachers() {
  const ss = getActiveSpreadsheet();
  const rows = _readAuthSource(ss, 'Master_Akun', {
    roleDefault: '', usernameFields: ['Username'], nameFields: ['NamaLengkap']
  });
  const out = rows.map(r => ({
    id: r.username, username: r.username, nama: r.namaLengkap,
    kelas: r.kelasBinaan.join(', '), gender: r.gender, role: r.role || ''
  }));
  out.sort((a, b) => a.nama.localeCompare(b.nama, undefined, { sensitivity: 'base' }));
  return out;
}
function getStudents() {
  const ss = getActiveSpreadsheet();
  const rows = _readAuthSource(ss, 'Master_Siswa', {
    roleDefault: 'siswa', usernameFields: ['NIS', 'Nama'], nameFields: ['Nama']
  });
  const out = rows.map(r => ({
    id: r.username, username: r.username, nama: r.namaLengkap,
    kelas: r.kelasBinaan.join(', '), gender: r.gender, role: 'siswa'
  }));
  out.sort((a, b) => a.nama.localeCompare(b.nama, undefined, { sensitivity: 'base' }));
  return out;
}
function saveTeacher(id, username, pin, role, namaLengkap, gender, kelasBinaan) {
  return _saveToAuth('Master_Akun', { username, pin, role, namaLengkap, gender, kelasBinaan });
}
function saveStudent(id, nis, pin, role, namaLengkap, gender, kelasBinaan) {
  return _saveToAuth('Master_Siswa', { username: nis, pin, role: 'siswa', namaLengkap, gender, kelasBinaan });
}
function _saveToAuth(sheetName, d) {
  if (!d.username || !d.username.toString().trim()) return { success: false, message: 'Username / NIS wajib diisi' };
  const ss = getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: false, message: 'Sheet tidak ditemukan.' };
  const map = ensureSchema(sheet, sheetName);
  const data = sheet.getDataRange().getValues();
  const keyField = (sheetName === 'Master_Siswa') ? 'NIS' : 'Username';
  for (let i = 1; i < data.length; i++) {
    if (String(readField(data[i], map, keyField)).toLowerCase() === d.username.toString().toLowerCase().trim()) {
      return { success: false, message: 'Username / NIS sudah dipakai.' };
    }
  }
  const VALID_ROLES = ['siswa','guru','wali','musyrif','admin'];
  const role = VALID_ROLES.includes((d.role || '').toLowerCase().trim())
    ? d.role.toLowerCase().trim() : (sheetName === 'Master_Siswa' ? 'siswa' : 'guru');
  let values;
  if (sheetName === 'Master_Siswa') {
    values = {
      ID: Utilities.getUuid(),
      NIS: d.username.toString().trim(),
      Nama: (d.namaLengkap || d.username).toString().trim(),
      Kelas: (d.kelasBinaan || '').toString().trim(),
      Gender: (d.gender || 'L').toString().trim(),
      PIN: (d.pin || '1234').toString().trim()
    };
  } else {
    values = {
      Username: d.username.toString().trim(),
      PIN: (d.pin || '1234').toString().trim(),
      Role: role,
      NamaLengkap: (d.namaLengkap || d.username).toString().trim(),
      Gender: (d.gender || 'L').toString().trim(),
      KelasBinaan: (d.kelasBinaan || '').toString().trim()
    };
  }
  sheet.appendRow(buildRow(sheet, map, values));
  return { success: true, message: 'Akun berhasil disimpan' };
}
function deleteTeacher(username) { return _deleteFromAuth('Master_Akun', username, 'Username'); }
function deleteStudent(username) { return _deleteFromAuth('Master_Siswa', username, 'NIS'); }
function _deleteFromAuth(sheetName, key, keyField) {
  const ss = getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: false, message: 'Sheet tidak ditemukan.' };
  const map = ensureSchema(sheet, sheetName);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(readField(data[i], map, keyField)) === String(key)) {
      sheet.deleteRow(i + 1);
      return { success: true, message: 'Akun dihapus' };
    }
  }
  return { success: false, message: 'Akun tidak ditemukan.' };
}

// ============================================================
// REPORT — dengan gender filter (FITUR 8)
// ============================================================
function getReportData(kelasFilter, startDate, endDate, roleTarget, searchQuery, genderFilter) {
  const ss = getActiveSpreadsheet();
  const isTeacher = roleTarget === 'guru';
  const sheetName = isTeacher ? "Mutabaah_Guru" : "Mutabaah_Siswa";
  const sheet = ss.getSheetByName(sheetName);
  const map = getColumnMap(sheet, sheetName);
  const data = sheet.getDataRange().getValues();

  const genderMap = {};
  if (!isTeacher) {
    const shSiswa = ss.getSheetByName('Master_Siswa');
    if (shSiswa) {
      const sm = ensureSchema(shSiswa, 'Master_Siswa');
      const sd = shSiswa.getDataRange().getValues();
      for (let i = 1; i < sd.length; i++) {
        const n = String(readField(sd[i], sm, 'Nama') || '').trim();
        const g = String(readField(sd[i], sm, 'Gender') || 'L').trim();
        if (n) genderMap[normName(n)] = g;
      }
    }
  }

  const table = [];
  const leaderboardMap = {};
  const query = searchQuery ? searchQuery.toString().toLowerCase().trim() : '';

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const tgl = toLocalDateStr(readField(row, map, 'Tanggal'));
    const nama = String(readField(row, map, 'Nama') || '');
    if (!tgl || !nama) continue;
    if (startDate && tgl < startDate) continue;
    if (endDate && tgl > endDate) continue;
    if (query && !nama.toLowerCase().includes(query)) continue;

    if (!isTeacher && genderFilter && genderFilter !== 'all') {
      const g = genderMap[normName(nama)] || 'L';
      if (g !== genderFilter) continue;
    }

    if (isTeacher) {
      table.push({
        tgl, nama,
        cols: [
          readField(row, map, 'Haid'),
          readField(row, map, 'Shubuh'), readField(row, map, 'Dzuhur'),
          readField(row, map, 'Ashar'), readField(row, map, 'Maghrib'),
          readField(row, map, 'Isya'),
          readField(row, map, 'Dzikir'), readField(row, map, 'Tilawah2Lbr'),
          readField(row, map, 'MujahadahMandiri'), readField(row, map, 'Catatan')
        ]
      });
    } else {
      const kelas = String(readField(row, map, 'Kelas') || '');
      if (kelasFilter !== 'all') {
        if (kelasFilter === 'smp' && !['7','8','9'].some(k => kelas.startsWith(k))) continue;
        if (kelasFilter === 'sma' && !['10','11','12'].some(k => kelas.startsWith(k))) continue;
        if (kelasFilter !== 'smp' && kelasFilter !== 'sma' && kelas !== kelasFilter) continue;
      }
      const poin = parseInt(readField(row, map, 'TotalPoin')) || 0;
      if (!leaderboardMap[nama]) leaderboardMap[nama] = { nama, kelas, poin: 0 };
      leaderboardMap[nama].poin += poin;
      table.push({
        tgl, nama, kelas, poin,
        cols: [
          readField(row, map, 'Haid'),
          readField(row, map, 'Shubuh'), readField(row, map, 'Dzuhur'),
          readField(row, map, 'Ashar'), readField(row, map, 'Maghrib'),
          readField(row, map, 'Isya'),
          readField(row, map, 'BantuOrtu'), readField(row, map, 'BijakHP'),
          readField(row, map, 'Belajar'), readField(row, map, 'Tidur'),
          readField(row, map, 'Tilawah')
        ]
      });
    }
  }

  const leaderboard = Object.values(leaderboardMap)
    .sort((a, b) => b.poin - a.poin).slice(0, 10);

  return { table: table.reverse(), leaderboard };
}

// ============================================================
// FITUR 2: EXPORT EXCEL (CSV yang bisa dibuka Excel)
// ============================================================
function exportReportCSV(kelasFilter, genderFilter, startDate, endDate, roleTarget, searchQuery) {
  const res = getReportData(kelasFilter, startDate, endDate, roleTarget, searchQuery, genderFilter);
  const isTeacher = roleTarget === 'guru';
  const rows = [];

  if (isTeacher) {
    rows.push(['Tanggal','Nama','Haid','Subuh','Dzuhur','Ashar','Maghrib','Isya','Dzikir','Tilawah 2Lbr','Mujahadah Mandiri','Catatan']);
    (res.table || []).forEach(r => {
      rows.push([r.tgl, r.nama, ...r.cols]);
    });
  } else {
    rows.push(['Tanggal','Nama','Kelas','Poin','Haid','Subuh','Dzuhur','Ashar','Maghrib','Isya','Bantu Ortu','Bijak HP','Belajar','Tidur','Tilawah']);
    (res.table || []).forEach(r => {
      rows.push([r.tgl, r.nama, r.kelas, r.poin, ...r.cols]);
    });
  }

  const csv = rows.map(row => row.map(cell => {
    const s = String(cell === null || cell === undefined ? '' : cell);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }).join(',')).join('\n');

  return { success: true, csv, filename: `Rekap_${roleTarget}_${startDate}_${endDate}.csv` };
}

// ============================================================
// ARCHIVE
// ============================================================
function archiveData() {
  const ss = getActiveSpreadsheet();
  const stamp = Utilities.formatDate(new Date(), TZ, "yyyy_MM_dd_HHmmss");
  const targets = [
    { name: "Mutabaah_Siswa", suffix: "_Siswa" },
    { name: "Mutabaah_Guru",  suffix: "_Guru" }
  ];
  let count = 0;
  targets.forEach(t => {
    const sh = ss.getSheetByName(t.name);
    if (sh && sh.getLastRow() > 1) {
      const copy = sh.copyTo(ss);
      copy.setName(`Arsip_${stamp}${t.suffix}`);
      sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
      count++;
    }
  });
  return count
    ? { success: true, message: 'Data semester berhasil diarsipkan dan dibersihkan!' }
    : { success: false, message: 'Tidak ada data untuk diarsipkan.' };
}

// ============================================================
// API HANDLER UNTUK GITHUB PAGES (doPost) - FIX CORS
// ============================================================
function doPost(e) {
  try {
    // Parse request body (dikirim sebagai text/plain dari GitHub Pages)
    const body = JSON.parse(e.postData.contents);
    const { action, params } = body;
    let result;

    switch (action) {
      case 'verifyLogin': result = verifyLogin(params.user, params.pin); break;
      case 'submitMutabaah': result = submitMutabaah(params.payload); break;
      case 'bulkSubmitMutabaah': result = bulkSubmitMutabaah(params.payloads); break;
      case 'getMutabaahEntry': result = getMutabaahEntry(params.nama, params.tanggal, params.role); break;
      case 'getClasses': result = getClasses(); break;
      case 'getStudents': result = getStudents(); break;
      case 'getStudentsForBulk': result = getStudentsForBulk(); break;
      case 'getTeachers': result = getTeachers(); break;
      case 'getReportData': result = getReportData(params.kelasFilter, params.startDate, params.endDate, params.roleTarget, params.searchQuery, params.genderFilter); break;
      case 'getDailyFillStatus': result = getDailyFillStatus(params.tanggal, params.kelasFilter, params.userRole, params.userKelasBinaan, params.statusFilter, params.searchQuery); break;
      case 'getPersonalHistory': result = getPersonalHistory(params.nama, params.role); break;
      case 'getClassComparison': result = getClassComparison(params.startDate, params.endDate); break;
      case 'getStreakLeaderboard': result = getStreakLeaderboard(); break;
      case 'getMyNotif': result = getMyNotif(params.username, params.nama, params.role); break;
      case 'getDashboardStats': result = getDashboardStats(params.tanggal); break;
      case 'getStudentTimeline': result = getStudentTimeline(params.nama, params.role, params.days); break;
      case 'saveClass': result = saveClass(params.id, params.nama); break;
      case 'deleteClass': result = deleteClass(params.id); break;
      case 'saveStudent': result = saveStudent(params.id, params.nis, params.pin, params.role, params.namaLengkap, params.gender, params.kelasBinaan); break;
      case 'deleteStudent': result = deleteStudent(params.nis); break;
      case 'saveTeacher': result = saveTeacher(params.id, params.username, params.pin, params.role, params.namaLengkap, params.gender, params.kelasBinaan); break;
      case 'deleteTeacher': result = deleteTeacher(params.username); break;
      case 'changeOwnPin': result = changeOwnPin(params.username, params.oldPin, params.newPin); break;
      case 'exportReportCSV': result = exportReportCSV(params.kelasFilter, params.genderFilter, params.startDate, params.endDate, params.roleTarget, params.searchQuery); break;
      case 'archiveData': result = archiveData(); break;
      case 'getPrayerTimes': result = getPrayerTimes(params.city, params.country); break;
      default: result = { success: false, message: `Action "${action}" tidak dikenal` };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}