// ============================================================
// MUTABAAH YAUMIYAH — Google Apps Script Backend
// Spreadsheet: https://docs.google.com/spreadsheets/d/1RBf5v_iP7kMTOinPCcc5x2_XxIlYiRTb7NwE5-89-iI
// ============================================================

const SS_ID = '1RBf5v_iP7kMTOinPCcc5x2_XxIlYiRTb7NwE5-89-iI';

const SH = {
  KELAS:     'Master_Kelas',
  SISWA:     'Master_Siswa',
  AKUN:      'Master_Akun',
  MUT_SISWA: 'Mutabaah_Siswa',
  MUT_GURU:  'Mutabaah_Guru',
};

const STAFF_ROLES = ['guru','wali','musyrif','admin'];

const HEADERS = {
  Master_Kelas:   ['ID','NamaKelas'],
  Master_Siswa:   ['ID','NIS','PIN','Role','NamaLengkap','Gender','KelasBinaan'],
  Master_Akun:    ['ID','Username','PIN','Role','NamaLengkap','Gender','KelasBinaan'],
  Mutabaah_Siswa: ['Timestamp','Nama','Kelas','Role','Tanggal','Haid',
                   'Shubuh','Dzuhur','Ashar','Maghrib','Isya',
                   'RawatibShubuhQab','RawatibDzuhurQab','RawatibDzuhurBad','RawatibMaghribBad','RawatibIsyaBad',
                   'BantuOrtu','BijakHP','Belajar','Tidur','Tilawah',
                   'TotalPoin','Catatan'],
  Mutabaah_Guru:  ['Timestamp','Nama','Role','Tanggal','Haid',
                   'Shubuh','Dzuhur','Ashar','Maghrib','Isya',
                   'RawatibShubuhQab','RawatibDzuhurQab','RawatibDzuhurBad','RawatibMaghribBad','RawatibIsyaBad',
                   'Dzikir','Tilawah5Lbr','Qiyamullail','IbadahSunnah',
                   'Catatan'],
};

// ============================================================
// ENTRY POINTS
// ============================================================

function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents);
    const action = body.action;
    const p      = body.params || {};
    let result;
    switch (action) {
      case 'verifyLogin':          result = verifyLogin(p);          break;
      case 'submitMutabaah':       result = submitMutabaah(p);       break;
      case 'bulkSubmitMutabaah':   result = bulkSubmitMutabaah(p);   break;
      case 'getMutabaahEntry':     result = getMutabaahEntry(p);     break;
      case 'getReportData':        result = getReportData(p);        break;
      case 'getDailyFillStatus':   result = getDailyFillStatus(p);   break;
      case 'getPersonalHistory':   result = getPersonalHistory(p);   break;
      case 'getClassComparison':   result = getClassComparison(p);   break;
      case 'getMyNotif':           result = getMyNotif(p);           break;
      case 'getDashboardStats':    result = getDashboardStats(p);    break;
      case 'getStudentTimeline':   result = getStudentTimeline(p);   break;
      case 'saveClass':            result = saveClass(p);            break;
      case 'deleteClass':          result = deleteClass(p);          break;
      case 'saveStudent':          result = saveStudent(p);          break;
      case 'deleteStudent':        result = deleteStudent(p);        break;
      case 'saveTeacher':          result = saveTeacher(p);          break;
      case 'deleteTeacher':        result = deleteTeacher(p);        break;
      case 'changeOwnPin':         result = changeOwnPin(p);         break;
      case 'exportReportCSV':      result = exportReportCSV(p);      break;
      case 'getPrayerTimes':       result = getPrayerTimes(p);       break;
      case 'getStreakLeaderboard': result = getStreakLeaderboard();   break;
      case 'getStudentsForBulk':   result = getStudentsForBulk();    break;
      case 'getClasses':           result = getClasses();            break;
      case 'getTeachers':          result = getTeachers();           break;
      default: result = { success: false, message: 'Unknown action: ' + action };
    }
    return jsonOut(result);
  } catch (err) {
    return jsonOut({ success: false, message: err.toString() });
  }
}

function doGet() {
  return jsonOut({ status: 'Mutabaah Yaumiyah API aktif' });
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Run once from Apps Script editor to fix all sheet headers.
 * Creates missing sheets, overwrites row 1 with correct headers,
 * applies bold navy styling.
 */
function fixAllHeaders() {
  const ss = SpreadsheetApp.openById(SS_ID);
  Object.entries(HEADERS).forEach(([name, headers]) => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    // Write headers to row 1
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    // Style: bold, navy background, white text
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1e3a5f')
      .setFontColor('#ffffff');
    // Clear stray columns beyond defined headers
    const lastCol = sh.getLastColumn();
    if (lastCol > headers.length) {
      sh.deleteColumns(headers.length + 1, lastCol - headers.length);
    }
    // Freeze header row
    sh.setFrozenRows(1);
    // Auto-resize columns
    sh.autoResizeColumns(1, headers.length);
  });
  SpreadsheetApp.getUi().alert('fixAllHeaders selesai — semua sheet header sudah rapi.');
}

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SS_ID);
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  if (sh.getLastRow() === 0 && HEADERS[name]) {
    sh.appendRow(HEADERS[name]);
    sh.getRange(1, 1, 1, HEADERS[name].length)
      .setFontWeight('bold')
      .setBackground('#1e3a5f')
      .setFontColor('#ffffff');
  }
  return sh;
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map((row, i) => {
    const obj = { _row: i + 2 };
    headers.forEach((h, j) => { obj[String(h)] = row[j]; });
    return obj;
  });
}

function updateRow(sheet, rowNum, headers, obj) {
  const vals = headers.map(h => obj[h] !== undefined ? obj[h] : '');
  sheet.getRange(rowNum, 1, 1, vals.length).setValues([vals]);
}

function jsonOut(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function uuid() { return Utilities.getUuid(); }

function yaTidak(v) { return v === 'Ya' ? 'Ya' : 'Tidak'; }

function todayStr() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function calcSiswaScore(row) {
  let score = 0;
  const isHaid = row['Haid'] === 'Ya';
  if (!isHaid) {
    ['Shubuh','Dzuhur','Ashar','Maghrib','Isya'].forEach(k => {
      if (row[k] === 'Ya') score += 10;
    });
  }
  if (row['BantuOrtu'] === 'Ya') score += 10;
  if (row['BijakHP']   === 'Ya') score += 10;
  if (row['Belajar']   === 'Ya') score += 10;
  if (row['Tidur']     === 'Ya') score += 10;
  if (row['Tilawah']   === 'Ya') score += 20;
  return score;
}

// ============================================================
// AUTH
// ============================================================

function verifyLogin(p) {
  const user = String(p.user || '').trim();
  const pin  = String(p.pin  || '').trim();
  if (!user || !pin) return { success: false, message: 'Username/PIN kosong.' };

  const siswaRows = sheetToObjects(getSheet(SH.SISWA));
  const siswa = siswaRows.find(r =>
    String(r.NIS).trim() === user && String(r.PIN).trim() === pin
  );
  if (siswa) {
    return {
      success: true, role: siswa.Role || 'siswa',
      nama: siswa.NamaLengkap, username: siswa.NIS,
      gender: siswa.Gender || 'L', kelasBinaan: siswa.KelasBinaan || '',
    };
  }

  const akunRows = sheetToObjects(getSheet(SH.AKUN));
  const akun = akunRows.find(r =>
    String(r.Username).trim().toLowerCase() === user.toLowerCase() &&
    String(r.PIN).trim() === pin
  );
  if (akun) {
    const kelasBinaan = akun.KelasBinaan
      ? String(akun.KelasBinaan).split(/[,;]+/).map(k => k.trim()).filter(Boolean)
      : [];
    return {
      success: true, role: akun.Role || 'guru',
      nama: akun.NamaLengkap, username: akun.Username,
      gender: akun.Gender || 'L', kelasBinaan,
    };
  }

  return { success: false, message: 'Username atau PIN salah.' };
}

function changeOwnPin(p) {
  const username = String(p.username || '').trim();
  const oldPin   = String(p.oldPin   || '').trim();
  const newPin   = String(p.newPin   || '').trim();
  if (!newPin || newPin.length < 4) return { success: false, message: 'PIN baru minimal 4 karakter.' };

  const shSiswa = getSheet(SH.SISWA);
  const siswaRows = sheetToObjects(shSiswa);
  const siswa = siswaRows.find(r =>
    String(r.NIS).trim() === username && String(r.PIN).trim() === oldPin
  );
  if (siswa) {
    shSiswa.getRange(siswa._row, HEADERS.Master_Siswa.indexOf('PIN') + 1).setValue(newPin);
    return { success: true, message: 'PIN berhasil diubah.' };
  }

  const shAkun = getSheet(SH.AKUN);
  const akunRows = sheetToObjects(shAkun);
  const akun = akunRows.find(r =>
    String(r.Username).trim().toLowerCase() === username.toLowerCase() &&
    String(r.PIN).trim() === oldPin
  );
  if (akun) {
    shAkun.getRange(akun._row, HEADERS.Master_Akun.indexOf('PIN') + 1).setValue(newPin);
    return { success: true, message: 'PIN berhasil diubah.' };
  }

  return { success: false, message: 'PIN lama salah.' };
}

// ============================================================
// MASTER DATA — KELAS
// ============================================================

function getClasses() {
  const rows = sheetToObjects(getSheet(SH.KELAS));
  return rows.filter(r => r.NamaKelas).map(r => ({ id: r.ID, nama: r.NamaKelas }));
}

function saveClass(p) {
  const sh = getSheet(SH.KELAS);
  const rows = sheetToObjects(sh);
  if (p.id) {
    const existing = rows.find(r => r.ID === p.id);
    if (existing) {
      sh.getRange(existing._row, HEADERS.Master_Kelas.indexOf('NamaKelas') + 1).setValue(p.nama);
      return { success: true, message: 'Kelas diperbarui.' };
    }
  }
  sh.appendRow([uuid(), p.nama]);
  return { success: true, message: 'Kelas disimpan.' };
}

function deleteClass(p) {
  const sh = getSheet(SH.KELAS);
  const rows = sheetToObjects(sh);
  const row = rows.find(r => r.ID === p.id);
  if (!row) return { success: false, message: 'Kelas tidak ditemukan.' };
  sh.deleteRow(row._row);
  return { success: true, message: 'Kelas dihapus.' };
}

// ============================================================
// MASTER DATA — SISWA
// ============================================================

function saveStudent(p) {
  const sh = getSheet(SH.SISWA);
  const rows = sheetToObjects(sh);
  const newRow = [
    p.id || uuid(), p.nis, p.pin || '1234', p.role || 'siswa',
    p.namaLengkap, p.gender || 'L', p.kelasBinaan || '',
  ];
  if (p.id) {
    const existing = rows.find(r => r.ID === p.id);
    if (existing) {
      sh.getRange(existing._row, 1, 1, newRow.length).setValues([newRow]);
      return { success: true, message: 'Data siswa diperbarui.' };
    }
  }
  sh.appendRow(newRow);
  return { success: true, message: 'Siswa disimpan.' };
}

function deleteStudent(p) {
  const sh = getSheet(SH.SISWA);
  const rows = sheetToObjects(sh);
  const row = rows.find(r => String(r.NIS) === String(p.nis));
  if (!row) return { success: false, message: 'Siswa tidak ditemukan.' };
  sh.deleteRow(row._row);
  return { success: true, message: 'Siswa dihapus.' };
}

function getStudentsForBulk() {
  const rows = sheetToObjects(getSheet(SH.SISWA));
  return rows
    .filter(r => r.NamaLengkap && (!r.Role || r.Role === 'siswa'))
    .map(r => ({
      username: String(r.NIS), nama: r.NamaLengkap,
      kelas: r.KelasBinaan || '', gender: r.Gender || 'L',
    }));
}

// ============================================================
// MASTER DATA — GURU / STAFF
// ============================================================

function saveTeacher(p) {
  const sh = getSheet(SH.AKUN);
  const rows = sheetToObjects(sh);
  const newRow = [
    p.id || uuid(), p.username, p.pin || '1234', p.role || 'guru',
    p.namaLengkap, p.gender || 'L', p.kelasBinaan || '',
  ];
  if (p.id) {
    const existing = rows.find(r => r.ID === p.id);
    if (existing) {
      sh.getRange(existing._row, 1, 1, newRow.length).setValues([newRow]);
      return { success: true, message: 'Data guru diperbarui.' };
    }
  }
  sh.appendRow(newRow);
  return { success: true, message: 'Guru disimpan.' };
}

function deleteTeacher(p) {
  const sh = getSheet(SH.AKUN);
  const rows = sheetToObjects(sh);
  const row = rows.find(r =>
    String(r.Username).toLowerCase() === String(p.username).toLowerCase()
  );
  if (!row) return { success: false, message: 'Guru tidak ditemukan.' };
  sh.deleteRow(row._row);
  return { success: true, message: 'Guru dihapus.' };
}

function getTeachers() {
  const rows = sheetToObjects(getSheet(SH.AKUN));
  return rows.filter(r => r.Username && r.NamaLengkap).map(r => ({
    id: r.ID, username: r.Username, nama: r.NamaLengkap,
    role: r.Role || 'guru', gender: r.Gender || 'L', kelas: r.KelasBinaan || '',
  }));
}

// ============================================================
// MUTABAAH — SUBMIT
// ============================================================

function submitMutabaah(p) {
  // buildParams wraps as { payload: {...} } — unwrap
  const payload = (p && p.payload) ? p.payload : p;
  if (!payload || !payload.nama || !payload.tanggal)
    return { success: false, message: 'Data tidak lengkap.' };
  return STAFF_ROLES.includes(payload.role) ? _submitGuru(payload) : _submitSiswa(payload);
}

function _submitSiswa(p) {
  const sh = getSheet(SH.MUT_SISWA);
  const rows = sheetToObjects(sh);
  const existing = rows.find(r =>
    String(r.Nama).trim() === String(p.nama).trim() &&
    String(r.Tanggal).trim() === String(p.tanggal).trim()
  );
  const score = p.totalPoin !== undefined ? Number(p.totalPoin) : 0;
  const newData = {
    Timestamp: new Date().toISOString(),
    Nama: p.nama, Kelas: p.kelas || '', Role: p.role || 'siswa',
    Tanggal: p.tanggal, Haid: yaTidak(p.isHaid === 'Ya' ? 'Ya' : 'Tidak'),
    Shubuh: yaTidak(p.shubuh), Dzuhur: yaTidak(p.dzuhur),
    Ashar: yaTidak(p.ashar), Maghrib: yaTidak(p.maghrib), Isya: yaTidak(p.isya),
    RawatibShubuhQab:  yaTidak(p.rawatib_shubuh_qab),
    RawatibDzuhurQab:  yaTidak(p.rawatib_dzuhur_qab),
    RawatibDzuhurBad:  yaTidak(p.rawatib_dzuhur_bad),
    RawatibMaghribBad: yaTidak(p.rawatib_maghrib_bad),
    RawatibIsyaBad:    yaTidak(p.rawatib_isya_bad),
    BantuOrtu: yaTidak(p.bantuOrtu), BijakHP: yaTidak(p.bijakHP),
    Belajar: yaTidak(p.belajar), Tidur: yaTidak(p.tidur), Tilawah: yaTidak(p.tilawah),
    TotalPoin: score, Catatan: p.catatan || '',
  };
  if (existing) {
    updateRow(sh, existing._row, HEADERS.Mutabaah_Siswa, newData);
  } else {
    sh.appendRow(HEADERS.Mutabaah_Siswa.map(h => newData[h] !== undefined ? newData[h] : ''));
  }
  return { success: true, message: 'Mutabaah tersimpan. Poin: ' + score, streak: calcStreak(p.nama, p.role) };
}

function _submitGuru(p) {
  const sh = getSheet(SH.MUT_GURU);
  const rows = sheetToObjects(sh);
  const existing = rows.find(r =>
    String(r.Nama).trim() === String(p.nama).trim() &&
    String(r.Tanggal).trim() === String(p.tanggal).trim()
  );
  const newData = {
    Timestamp: new Date().toISOString(),
    Nama: p.nama, Role: p.role || 'guru',
    Tanggal: p.tanggal, Haid: yaTidak(p.isHaid === 'Ya' ? 'Ya' : 'Tidak'),
    Shubuh: yaTidak(p.shubuh), Dzuhur: yaTidak(p.dzuhur),
    Ashar: yaTidak(p.ashar), Maghrib: yaTidak(p.maghrib), Isya: yaTidak(p.isya),
    RawatibShubuhQab:  yaTidak(p.rawatib_shubuh_qab),
    RawatibDzuhurQab:  yaTidak(p.rawatib_dzuhur_qab),
    RawatibDzuhurBad:  yaTidak(p.rawatib_dzuhur_bad),
    RawatibMaghribBad: yaTidak(p.rawatib_maghrib_bad),
    RawatibIsyaBad:    yaTidak(p.rawatib_isya_bad),
    Dzikir:       yaTidak(p.dzikir),
    Tilawah5Lbr:  yaTidak(p.tilawah_5lbr),
    Qiyamullail:  yaTidak(p.qiyamullail),
    IbadahSunnah: yaTidak(p.ibadah_sunnah),
    Catatan: p.catatan || '',
  };
  if (existing) {
    updateRow(sh, existing._row, HEADERS.Mutabaah_Guru, newData);
  } else {
    sh.appendRow(HEADERS.Mutabaah_Guru.map(h => newData[h] !== undefined ? newData[h] : ''));
  }
  return { success: true, message: 'Mutabaah guru tersimpan.' };
}

function bulkSubmitMutabaah(p) {
  const payloads = p.payloads || [];
  let count = 0;
  payloads.forEach(payload => { try { submitMutabaah(payload); count++; } catch(e) {} });
  return { success: true, message: count + ' data berhasil disimpan.' };
}

// ============================================================
// MUTABAAH — GET ENTRY
// ============================================================

function getMutabaahEntry(p) {
  const nama    = String(p.nama    || '').trim();
  const tanggal = String(p.tanggal || '').trim();
  const role    = String(p.role    || '').trim();
  if (!nama || !tanggal) return { found: false };
  const sh = getSheet(STAFF_ROLES.includes(role) ? SH.MUT_GURU : SH.MUT_SISWA);
  const row = sheetToObjects(sh).find(r =>
    String(r.Nama).trim() === nama && String(r.Tanggal).trim() === tanggal
  );
  return row ? { found: true, entry: row } : { found: false };
}

// ============================================================
// REPORTS
// ============================================================

function getReportData(p) {
  const kelasFilter  = p.kelasFilter  || 'all';
  const startDate    = p.startDate    || '';
  const endDate      = p.endDate      || '';
  const roleTarget   = p.roleTarget   || 'siswa';
  const searchQuery  = String(p.searchQuery  || '').toLowerCase().trim();
  const genderFilter = p.genderFilter || 'all';
  if (roleTarget === 'guru') return _reportGuru(startDate, endDate, searchQuery, genderFilter);
  const rows = sheetToObjects(getSheet(SH.MUT_SISWA));
  let filtered = rows.filter(r => {
    if (startDate && String(r.Tanggal) < startDate) return false;
    if (endDate   && String(r.Tanggal) > endDate)   return false;
    if (kelasFilter !== 'all' && String(r.Kelas).trim() !== kelasFilter) return false;
    if (searchQuery && !String(r.Nama).toLowerCase().includes(searchQuery)) return false;
    if (genderFilter !== 'all') {
      const s = sheetToObjects(getSheet(SH.SISWA)).find(x => String(x.NamaLengkap).trim() === String(r.Nama).trim());
      if (!s || (s.Gender || 'L') !== genderFilter) return false;
    }
    return true;
  });
  filtered.sort((a, b) => String(b.Tanggal).localeCompare(String(a.Tanggal)));
  const table = filtered.map(r => ({
    tgl: r.Tanggal, nama: r.Nama, kelas: r.Kelas,
    poin: r.TotalPoin || calcSiswaScore(r),
    cols: [r.Shubuh,r.Dzuhur,r.Ashar,r.Maghrib,r.Isya,r.BantuOrtu,r.BijakHP,r.Belajar,r.Tidur,r.Tilawah],
  }));
  const poinMap = {}, kelasMap = {};
  filtered.forEach(r => {
    poinMap[r.Nama]  = (poinMap[r.Nama] || 0) + Number(r.TotalPoin || calcSiswaScore(r));
    kelasMap[r.Nama] = r.Kelas;
  });
  const leaderboard = Object.entries(poinMap)
    .map(([nama, poin]) => ({ nama, poin, kelas: kelasMap[nama] || '' }))
    .sort((a, b) => b.poin - a.poin).slice(0, 20);
  return { table, leaderboard };
}

function _reportGuru(startDate, endDate, searchQuery, genderFilter) {
  const rows = sheetToObjects(getSheet(SH.MUT_GURU));
  let filtered = rows.filter(r => {
    if (startDate && String(r.Tanggal) < startDate) return false;
    if (endDate   && String(r.Tanggal) > endDate)   return false;
    if (searchQuery && !String(r.Nama).toLowerCase().includes(searchQuery)) return false;
    if (genderFilter !== 'all') {
      const a = sheetToObjects(getSheet(SH.AKUN)).find(x => String(x.NamaLengkap).trim() === String(r.Nama).trim());
      if (!a || (a.Gender || 'L') !== genderFilter) return false;
    }
    return true;
  });
  filtered.sort((a, b) => String(b.Tanggal).localeCompare(String(a.Tanggal)));
  return {
    table: filtered.map(r => ({
      tgl: r.Tanggal, nama: r.Nama,
      cols: [r.Haid,r.Shubuh,r.Dzuhur,r.Ashar,r.Maghrib,r.Isya,r.Dzikir,r.Tilawah5Lbr,r.Qiyamullail,r.Catatan],
    })),
    leaderboard: [],
  };
}

function getDailyFillStatus(p) {
  const tanggal         = String(p.tanggal      || todayStr());
  const kelasFilter     = String(p.kelasFilter  || 'all');
  const userRole        = String(p.userRole     || '');
  const userKelasBinaan = p.userKelasBinaan     || [];
  const statusFilter    = String(p.statusFilter || 'all');
  const searchQuery     = String(p.searchQuery  || '').toLowerCase().trim();
  const siswaRows = sheetToObjects(getSheet(SH.SISWA));
  const mutRows   = sheetToObjects(getSheet(SH.MUT_SISWA));
  const sudahSet  = new Set(mutRows.filter(r => String(r.Tanggal) === tanggal).map(r => String(r.Nama).trim()));
  let list = siswaRows.filter(r => r.NamaLengkap && (!r.Role || r.Role === 'siswa'));
  if ((userRole === 'wali' || userRole === 'musyrif') && userKelasBinaan.length) {
    const binaan = userKelasBinaan.map(k => k.toLowerCase().trim());
    list = list.filter(s => String(s.KelasBinaan||'').split(/[,;]+/).map(k=>k.trim().toLowerCase()).some(k=>binaan.includes(k)));
  }
  if (kelasFilter !== 'all')
    list = list.filter(s => String(s.KelasBinaan||'').split(/[,;]+/).map(k=>k.trim()).includes(kelasFilter));
  if (searchQuery)
    list = list.filter(s => String(s.NamaLengkap).toLowerCase().includes(searchQuery));
  let result = list.map(s => ({ nama: s.NamaLengkap, kelas: s.KelasBinaan||'', sudah: sudahSet.has(s.NamaLengkap.trim()) }));
  if (statusFilter === 'sudah') result = result.filter(r => r.sudah);
  if (statusFilter === 'belum') result = result.filter(r => !r.sudah);
  result.sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  return { list: result, summary: { total: result.length, sudah: result.filter(r=>r.sudah).length, belum: result.filter(r=>!r.sudah).length } };
}

function exportReportCSV(p) { return { success: true, data: (getReportData(p).table || []) }; }

function getPersonalHistory(p) {
  const nama = String(p.nama||'').trim(), role = String(p.role||'').trim();
  if (!nama) return [];
  const isStaff = STAFF_ROLES.includes(role);
  const rows = sheetToObjects(getSheet(isStaff ? SH.MUT_GURU : SH.MUT_SISWA));
  const dateMap = {};
  rows.filter(r => String(r.Nama).trim() === nama).forEach(r => { dateMap[String(r.Tanggal)] = r; });
  return Object.keys(dateMap).sort().slice(-7).map(tgl => ({
    tgl,
    val: isStaff
      ? ['Shubuh','Dzuhur','Ashar','Maghrib','Isya','Dzikir','Tilawah5Lbr','Qiyamullail','IbadahSunnah']
          .filter(k => dateMap[tgl][k] === 'Ya').length
      : calcSiswaScore(dateMap[tgl]),
  }));
}

function getStudentTimeline(p) {
  const nama = String(p.nama||'').trim(), role = String(p.role||'').trim(), days = Number(p.days||30);
  if (!nama) return [];
  const isStaff = STAFF_ROLES.includes(role);
  const rows = sheetToObjects(getSheet(isStaff ? SH.MUT_GURU : SH.MUT_SISWA));
  const dateMap = {};
  rows.filter(r => String(r.Nama).trim() === nama).forEach(r => { dateMap[String(r.Tanggal)] = r; });
  return Object.keys(dateMap).sort().slice(-days)
    .map(tgl => ({ tgl, poin: isStaff ? 0 : calcSiswaScore(dateMap[tgl]), entry: dateMap[tgl] }));
}

function getClassComparison(p) {
  const startDate = p.startDate||'', endDate = p.endDate||'';
  const rows = sheetToObjects(getSheet(SH.MUT_SISWA)).filter(r => {
    if (startDate && String(r.Tanggal) < startDate) return false;
    if (endDate   && String(r.Tanggal) > endDate)   return false;
    return true;
  });
  const kelasMap = {};
  rows.forEach(r => {
    const k = r.Kelas || 'Tidak Diketahui';
    if (!kelasMap[k]) kelasMap[k] = { total: 0, count: 0 };
    kelasMap[k].total += Number(r.TotalPoin || calcSiswaScore(r));
    kelasMap[k].count++;
  });
  return Object.entries(kelasMap)
    .map(([kelas, v]) => ({ kelas, avg: v.count ? Math.round(v.total/v.count) : 0, count: v.count }))
    .sort((a, b) => b.avg - a.avg);
}

function getDashboardStats(p) {
  const tanggal    = String(p.tanggal || todayStr());
  const todaySiswa = sheetToObjects(getSheet(SH.MUT_SISWA)).filter(r => String(r.Tanggal) === tanggal);
  const todayGuru  = sheetToObjects(getSheet(SH.MUT_GURU)).filter(r  => String(r.Tanggal) === tanggal);
  const siswaAll   = sheetToObjects(getSheet(SH.SISWA));
  const akunAll    = sheetToObjects(getSheet(SH.AKUN));
  const totalSiswa = siswaAll.filter(r => !r.Role || r.Role === 'siswa').length;
  const avgPoin    = todaySiswa.length
    ? Math.round(todaySiswa.reduce((s,r) => s + Number(r.TotalPoin || calcSiswaScore(r)), 0) / todaySiswa.length)
    : 0;
  return { sudahIsiSiswa: todaySiswa.length, sudahIsiGuru: todayGuru.length,
           totalSiswa, totalGuru: akunAll.length, avgPoin,
           belumIsi: Math.max(0, totalSiswa - todaySiswa.length) };
}

// ============================================================
// GAMIFICATION — STREAK
// ============================================================

function calcStreak(nama, role) {
  const isStaff = STAFF_ROLES.includes(role);
  const rows = sheetToObjects(getSheet(isStaff ? SH.MUT_GURU : SH.MUT_SISWA));
  const myDates = new Set(
    rows.filter(r => String(r.Nama).trim() === String(nama).trim()).map(r => String(r.Tanggal).trim())
  );
  const tz = Session.getScriptTimeZone();
  let streak = 0, d = new Date();
  while (true) {
    const ds = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    if (!myDates.has(ds)) break;
    streak++; d.setDate(d.getDate() - 1);
  }
  return streak;
}

function getStreakLeaderboard() {
  const siswaRows = sheetToObjects(getSheet(SH.SISWA));
  const mutRows   = sheetToObjects(getSheet(SH.MUT_SISWA));
  const datesByNama = {};
  mutRows.forEach(r => {
    const n = String(r.Nama).trim();
    if (!datesByNama[n]) datesByNama[n] = new Set();
    datesByNama[n].add(String(r.Tanggal).trim());
  });
  const tz = Session.getScriptTimeZone();
  return siswaRows
    .filter(r => r.NamaLengkap && (!r.Role || r.Role === 'siswa'))
    .map(s => {
      const dates = datesByNama[String(s.NamaLengkap).trim()] || new Set();
      let streak = 0, d = new Date();
      while (true) {
        const ds = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
        if (!dates.has(ds)) break;
        streak++; d.setDate(d.getDate() - 1);
      }
      return { nama: s.NamaLengkap, kelas: s.KelasBinaan||'', streak };
    })
    .filter(r => r.streak > 0)
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 20);
}

function getMyNotif(p) {
  const nama = String(p.nama||'').trim(), role = String(p.role||'').trim();
  const today = todayStr(), isStaff = STAFF_ROLES.includes(role);
  const notifs = [];
  const found = sheetToObjects(getSheet(isStaff ? SH.MUT_GURU : SH.MUT_SISWA))
    .find(r => String(r.Nama).trim() === nama && String(r.Tanggal).trim() === today);
  if (!found) notifs.push({ type: 'warning', msg: 'Belum isi mutabaah hari ini!' });
  if (!isStaff) {
    const streak = calcStreak(nama, role);
    if (streak >= 7) notifs.push({ type: 'success', msg: streak + ' hari streak! Pertahankan!' });
  }
  return { notifs, count: notifs.length };
}

// ============================================================
// PRAYER TIMES
// ============================================================

function getPrayerTimes(p) {
  try {
    const city = p.city || 'Surabaya', country = p.country || 'ID';
    const url = 'https://api.aladhan.com/v1/timingsByCity/' + todayStr()
      + '?city=' + encodeURIComponent(city)
      + '&country=' + encodeURIComponent(country)
      + '&method=11';
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const json = JSON.parse(resp.getContentText());
    if (json.code === 200) {
      const t = json.data.timings;
      // Return Aladhan keys — frontend renderPrayerWidget reads t.Fajr, t.Dhuhr, t.Asr, t.Maghrib, t.Isha
      return { success: true, timings: { Fajr: t.Fajr, Dhuhr: t.Dhuhr, Asr: t.Asr, Maghrib: t.Maghrib, Isha: t.Isha } };
    }
    return { success: false };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}


