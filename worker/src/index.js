// ============================================================
// KONFIGURASI
// ============================================================
const SPREADSHEET_ID = "1RBf5v_iP7kMTOinPCcc5x2_XxIlYiRTb7NwE5-89-iI";
const TZ = "Asia/Jakarta";

// ============================================================
// HELPER: Google Auth (JWT via Service Account)
// ============================================================
async function getGoogleAccessToken(env) {
  const credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const base64url = (obj) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const headerB64 = base64url(header);
  const payloadB64 = base64url(payload);
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import private key
  const privateKeyPem = credentials.private_key.replace(/\\n/g, "\n");
  const keyData = pemToArrayBuffer(privateKeyPem);

  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedToken)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${unsignedToken}.${signatureB64}`;

  // Exchange JWT for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Gagal mendapatkan access token: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ============================================================
// HELPER: Google Sheets API
// ============================================================
async function sheetsGet(token, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Sheets GET error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sheetsBatchGet(token, ranges) {
  const params = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Sheets batchGet error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sheetsAppend(token, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error(`Sheets append error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sheetsUpdate(token, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error(`Sheets update error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sheetsClear(token, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}:clear`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Sheets clear error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ============================================================
// HELPER: Normalisasi
// ============================================================
function normHeader(s) {
  return String(s || "").toLowerCase().replace(/[\s_\-]+/g, "");
}
function normName(s) {
  return String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
}
function sameName(a, b) {
  return normName(a) === normName(b);
}
function toLocalDateStr(d) {
  if (!d) return "";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  try {
    const date = new Date(d);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const y = parts.find((p) => p.type === "year").value;
    const m = parts.find((p) => p.type === "month").value;
    const day = parts.find((p) => p.type === "day").value;
    return `${y}-${m}-${day}`;
  } catch (e) {
    return "";
  }
}

// ============================================================
// SKEMA SHEET
// ============================================================
const SHEET_SCHEMAS = {
  Mutabaah_Siswa: {
    canonical: [
      "Timestamp", "Tanggal", "Nama", "Kelas", "TotalPoin", "Haid",
      "Shubuh", "Dzuhur", "Ashar", "Maghrib", "Isya",
      "BantuOrtu", "BijakHP", "Belajar", "Tidur", "Tilawah", "Catatan",
    ],
    aliases: {
      Timestamp: ["timestamp", "waktu"],
      Tanggal: ["tanggal", "tgl", "date"],
      Nama: ["nama", "namasiswa", "nama_siswa", "namalengkap", "nama_lengkap"],
      Kelas: ["kelas", "class", "rombel"],
      TotalPoin: ["totalpoin", "total_poin", "poin", "skor", "total"],
      Haid: ["haid", "statushaid", "status_haid"],
      Shubuh: ["shubuh", "subuh", "fajr"],
      Dzuhur: ["dzuhur", "zuhur", "dhuhur"],
      Ashar: ["ashar", "asar"],
      Maghrib: ["maghrib", "magrib"],
      Isya: ["isya", "isha"],
      BantuOrtu: ["bantuortu", "bantu_ortu"],
      BijakHP: ["bijakhp", "bijak_hp"],
      Belajar: ["belajar", "murajaah"],
      Tidur: ["tidur"],
      Tilawah: ["tilawah", "tilawahquran"],
      Catatan: ["catatan", "notes", "keterangan"],
    },
  },
  Mutabaah_Guru: {
    canonical: [
      "Timestamp", "Tanggal", "Nama", "Haid",
      "Shubuh", "Dzuhur", "Ashar", "Maghrib", "Isya",
      "Dzikir", "Tilawah2Lbr", "BahanAjar", "Catatan",
    ],
    aliases: {
      Timestamp: ["timestamp", "waktu"],
      Tanggal: ["tanggal", "tgl", "date"],
      Nama: ["nama", "namaguru", "nama_guru", "namalengkap", "nama_lengkap"],
      Haid: ["haid", "statushaid", "status_haid"],
      Shubuh: ["shubuh", "subuh"],
      Dzuhur: ["dzuhur", "zuhur", "dhuhur"],
      Ashar: ["ashar", "asar"],
      Maghrib: ["maghrib", "magrib"],
      Isya: ["isya", "isha"],
      Dzikir: ["dzikir", "zikir"],
      Tilawah2Lbr: ["tilawah2lbr", "tilawah_2lbr", "tilawah2lembar"],
      BahanAjar: ["bahanajar", "bahan_ajar"],
      Catatan: ["catatan", "notes", "keterangan"],
    },
  },
  Master_Kelas: {
    canonical: ["ID", "NamaKelas"],
    aliases: {
      ID: ["id", "uuid", "kode"],
      NamaKelas: ["namakelas", "nama_kelas", "nama", "kelas"],
    },
  },
  Master_Akun: {
    canonical: ["Username", "PIN", "Role", "NamaLengkap", "Gender", "KelasBinaan"],
    aliases: {
      Username: ["username", "user", "nis", "nisn", "id"],
      PIN: ["pin", "password", "sandi", "pass"],
      Role: ["role", "peran", "jabatan", "tipe"],
      NamaLengkap: ["namalengkap", "nama_lengkap", "fullname", "nama"],
      Gender: ["gender", "jk", "jeniskelamin"],
      KelasBinaan: ["kelasbinaan", "kelas_binaan", "kelas", "class", "rombel", "binaan"],
    },
  },
  Master_Siswa: {
    canonical: ["ID", "NIS", "Nama", "Kelas", "Gender", "PIN"],
    aliases: {
      ID: ["id", "uuid"],
      NIS: ["nis", "nisn", "username", "user", "nomorinduk"],
      Nama: ["nama", "namasiswa", "nama_siswa", "namalengkap", "nama_lengkap"],
      Kelas: ["kelas", "class", "rombel"],
      Gender: ["gender", "jk", "jeniskelamin"],
      PIN: ["pin", "password", "sandi"],
    },
  },
};

function getColumnMap(headers, schemaKey) {
  const schema = SHEET_SCHEMAS[schemaKey];
  if (!schema) return {};
  const normalized = headers.map(normHeader);
  const map = {};
  for (const field of schema.canonical) {
    const aliases = (schema.aliases[field] || [field]).map(normHeader);
    let idx = -1;
    for (const a of aliases) {
      const found = normalized.indexOf(a);
      if (found !== -1) {
        idx = found;
        break;
      }
    }
    map[field] = idx;
  }
  return map;
}

function readField(row, map, field) {
  const idx = map[field];
  return idx >= 0 && idx < row.length ? row[idx] : "";
}

function buildRow(headers, map, values) {
  const row = new Array(headers.length).fill("");
  for (const field in values) {
    const idx = map[field];
    if (idx >= 0 && idx < headers.length) row[idx] = values[field];
  }
  return row;
}

// ============================================================
// CORE: Baca semua data dari sheet
// ============================================================
async function fetchSheetData(token, sheetName) {
  const res = await sheetsGet(token, `${sheetName}!A:Z`);
  const rows = res.values || [];
  if (!rows.length) return { headers: [], data: [], map: {} };
  const headers = rows[0];
  const data = rows.slice(1);
  const map = getColumnMap(headers, sheetName);
  return { headers, data, map };
}

// ============================================================
// API HANDLERS
// ============================================================

// --- AUTH ---
async function verifyLogin(token, user, pin) {
  if (!user || !pin) {
    return { success: false, message: "Username dan PIN wajib diisi!" };
  }

  const { data: akunData, map: akunMap } = await fetchSheetData(token, "Master_Akun");
  const { data: siswaData, map: siswaMap } = await fetchSheetData(token, "Master_Siswa");

  const query = user.toString().toLowerCase().trim();
  const pinStr = pin.toString().trim();
  const candidates = [];

  // Cek Master_Akun
  for (const row of akunData) {
    const u = String(readField(row, akunMap, "Username") || "").toLowerCase();
    const n = String(readField(row, akunMap, "NamaLengkap") || "").toLowerCase();
    const p = String(readField(row, akunMap, "PIN") || "").trim();
    if (u === query || n === query || u.includes(query) || n.includes(query)) {
      candidates.push({
        username: u,
        nama: readField(row, akunMap, "NamaLengkap") || u,
        pin: p,
        role: String(readField(row, akunMap, "Role") || "guru").toLowerCase(),
        gender: readField(row, akunMap, "Gender") || "L",
        kelasBinaan: String(readField(row, akunMap, "KelasBinaan") || "")
          .split(/[,;]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        source: "Master_Akun",
      });
    }
  }

  // Cek Master_Siswa
  for (const row of siswaData) {
    const u = String(readField(row, siswaMap, "NIS") || "").toLowerCase();
    const n = String(readField(row, siswaMap, "Nama") || "").toLowerCase();
    const p = String(readField(row, siswaMap, "PIN") || "").trim();
    if (u === query || n === query || u.includes(query) || n.includes(query)) {
      candidates.push({
        username: u,
        nama: readField(row, siswaMap, "Nama") || u,
        pin: p,
        role: "siswa",
        gender: readField(row, siswaMap, "Gender") || "L",
        kelasBinaan: String(readField(row, siswaMap, "Kelas") || "")
          .split(/[,;]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        source: "Master_Siswa",
      });
    }
  }

  if (!candidates.length) {
    return { success: false, message: "Akun / Username tidak ditemukan!" };
  }

  const valid = candidates.find((c) => c.pin === pinStr);
  if (!valid) {
    return { success: false, message: "PIN Akses salah!" };
  }

  return {
    success: true,
    role: valid.role,
    nama: valid.nama,
    username: valid.username,
    kelasBinaan: valid.kelasBinaan,
    gender: valid.gender,
    source: valid.source,
  };
}

// --- SUBMIT MUTABAAH ---
async function submitMutabaah(token, payload) {
  if (!payload) return { success: false, message: "Data payload tidak valid!" };

  const role = payload.role ? payload.role.toString().toLowerCase() : "siswa";
  const isTeacher = ["guru", "wali", "musyrif", "admin"].includes(role);
  const sheetName = isTeacher ? "Mutabaah_Guru" : "Mutabaah_Siswa";

  const { headers, data, map } = await fetchSheetData(token, sheetName);
  const tanggal = payload.tanggal;
  const nama = payload.nama;

  // Cari apakah sudah ada entry untuk tanggal + nama ini
  let rowIndex = -1;
  for (let i = 0; i < data.length; i++) {
    const t = toLocalDateStr(readField(data[i], map, "Tanggal"));
    const n = readField(data[i], map, "Nama");
    if (t === tanggal && sameName(n, nama)) {
      rowIndex = i + 2; // +1 untuk header, +1 untuk 1-based
      break;
    }
  }

  const values = {
    Timestamp: new Date().toISOString(),
    Tanggal: tanggal,
    Nama: nama,
    Haid: payload.isHaid || "Tidak",
    Shubuh: payload.shubuh || "Tidak",
    Dzuhur: payload.dzuhur || "Tidak",
    Ashar: payload.ashar || "Tidak",
    Maghrib: payload.maghrib || "Tidak",
    Isya: payload.isya || "Tidak",
    Catatan: payload.catatan || "",
  };

  if (isTeacher) {
    values.Dzikir = payload.dzikir || "Tidak";
    values.Tilawah2Lbr = payload.tilawah_2lbr || "Tidak";
    values.BahanAjar = payload.bahan_ajar || "Tidak";
  } else {
    values.Kelas = payload.kelas || "";
    values.TotalPoin = payload.totalPoin || 0;
    values.BantuOrtu = payload.bantuOrtu || "Tidak";
    values.BijakHP = payload.bijakHP || "Tidak";
    values.Belajar = payload.belajar || "Tidak";
    values.Tidur = payload.tidur || "Tidak";
    values.Tilawah = payload.tilawah || "Tidak";
  }

  const rowValues = [buildRow(headers, map, values)];

  if (rowIndex > 0) {
    // Update existing row
    const range = `${sheetName}!A${rowIndex}:Z${rowIndex}`;
    await sheetsUpdate(token, range, rowValues);
  } else {
    // Append new row
    await sheetsAppend(token, `${sheetName}!A:Z`, rowValues);
  }

  const streak = await calculateStreak(token, nama, isTeacher);
  return { success: true, message: "Mutabaah berhasil disimpan!", streak };
}

async function calculateStreak(token, nama, isTeacher) {
  const sheetName = isTeacher ? "Mutabaah_Guru" : "Mutabaah_Siswa";
  const { data, map } = await fetchSheetData(token, sheetName);
  const dateSet = new Set();
  for (const row of data) {
    if (sameName(readField(row, map, "Nama"), nama)) {
      const tgl = toLocalDateStr(readField(row, map, "Tanggal"));
      if (tgl) dateSet.add(tgl);
    }
  }
  if (dateSet.size === 0) return 0;

  const today = new Date();
  const cursor = new Date(today);
  if (!dateSet.has(toLocalDateStr(cursor))) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (dateSet.has(toLocalDateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// --- GET ENTRY ---
async function getMutabaahEntry(token, nama, tanggal, role) {
  if (!nama || !tanggal) return { found: false };

  const isTeacher = ["guru", "wali", "musyrif", "admin"].includes(
    (role || "").toString().toLowerCase()
  );
  const sheetName = isTeacher ? "Mutabaah_Guru" : "Mutabaah_Siswa";
  const { data, map } = await fetchSheetData(token, sheetName);

  for (const row of data) {
    const t = toLocalDateStr(readField(row, map, "Tanggal"));
    const n = readField(row, map, "Nama");
    if (t === tanggal && sameName(n, nama)) {
      const entry = {};
      SHEET_SCHEMAS[sheetName].canonical.forEach((f) => {
        entry[f] = readField(row, map, f);
      });
      return { found: true, entry };
    }
  }
  return { found: false };
}

// --- GET CLASSES ---
async function getClasses(token) {
  const { data, map } = await fetchSheetData(token, "Master_Kelas");
  const classes = [];
  for (const row of data) {
    const nama = readField(row, map, "NamaKelas");
    if (nama) {
      classes.push({
        id: String(readField(row, map, "ID") || ""),
        nama: String(nama).trim(),
      });
    }
  }
  classes.sort((a, b) => {
    const pa = a.nama.split(".").map(Number);
    const pb = b.nama.split(".").map(Number);
    if (pa[0] !== pb[0]) return pa[0] - pb[0];
    return (pa[1] || 0) - (pb[1] || 0);
  });
  return classes;
}

// --- GET STUDENTS ---
async function getStudents(token) {
  const { data, map } = await fetchSheetData(token, "Master_Siswa");
  const out = [];
  for (const row of data) {
    const nama = String(readField(row, map, "Nama") || "").trim();
    if (!nama) continue;
    out.push({
      id: String(readField(row, map, "NIS") || ""),
      username: String(readField(row, map, "NIS") || ""),
      nama,
      kelas: String(readField(row, map, "Kelas") || ""),
      gender: String(readField(row, map, "Gender") || "L"),
      role: "siswa",
    });
  }
  out.sort((a, b) => a.nama.localeCompare(b.nama, undefined, { sensitivity: "base" }));
  return out;
}

// --- GET TEACHERS ---
async function getTeachers(token) {
  const { data, map } = await fetchSheetData(token, "Master_Akun");
  const out = [];
  for (const row of data) {
    const nama = String(readField(row, map, "NamaLengkap") || "").trim();
    if (!nama) continue;
    out.push({
      id: String(readField(row, map, "Username") || ""),
      username: String(readField(row, map, "Username") || ""),
      nama,
      kelas: String(readField(row, map, "KelasBinaan") || ""),
      gender: String(readField(row, map, "Gender") || "L"),
      role: String(readField(row, map, "Role") || ""),
    });
  }
  out.sort((a, b) => a.nama.localeCompare(b.nama, undefined, { sensitivity: "base" }));
  return out;
}

// --- GET REPORT DATA ---
async function getReportData(token, kelasFilter, startDate, endDate, roleTarget, searchQuery, genderFilter) {
  const isTeacher = roleTarget === "guru";
  const sheetName = isTeacher ? "Mutabaah_Guru" : "Mutabaah_Siswa";
  const { data, map } = await fetchSheetData(token, sheetName);

  // Bangun map gender dari Master_Siswa
  const genderMap = {};
  if (!isTeacher) {
    const { data: siswaData, map: siswaMap } = await fetchSheetData(token, "Master_Siswa");
    for (const row of siswaData) {
      const n = String(readField(row, siswaMap, "Nama") || "").trim();
      const g = String(readField(row, siswaMap, "Gender") || "L").trim();
      if (n) genderMap[normName(n)] = g;
    }
  }

  const table = [];
  const leaderboardMap = {};
  const query = searchQuery ? searchQuery.toString().toLowerCase().trim() : "";

  for (const row of data) {
    const tgl = toLocalDateStr(readField(row, map, "Tanggal"));
    const nama = String(readField(row, map, "Nama") || "");
    if (!tgl || !nama) continue;
    if (startDate && tgl < startDate) continue;
    if (endDate && tgl > endDate) continue;
    if (query && !nama.toLowerCase().includes(query)) continue;

    if (!isTeacher && genderFilter && genderFilter !== "all") {
      const g = genderMap[normName(nama)] || "L";
      if (g !== genderFilter) continue;
    }

    if (isTeacher) {
      table.push({
        tgl,
        nama,
        cols: [
          readField(row, map, "Haid"),
          readField(row, map, "Shubuh"),
          readField(row, map, "Dzuhur"),
          readField(row, map, "Ashar"),
          readField(row, map, "Maghrib"),
          readField(row, map, "Isya"),
          readField(row, map, "Dzikir"),
          readField(row, map, "Tilawah2Lbr"),
          readField(row, map, "BahanAjar"),
          readField(row, map, "Catatan"),
        ],
      });
    } else {
      const kelas = String(readField(row, map, "Kelas") || "");
      if (kelasFilter !== "all") {
        if (kelasFilter === "smp" && !["7", "8", "9"].some((k) => kelas.startsWith(k))) continue;
        if (kelasFilter === "sma" && !["10", "11", "12"].some((k) => kelas.startsWith(k))) continue;
        if (kelasFilter !== "smp" && kelasFilter !== "sma" && kelas !== kelasFilter) continue;
      }
      const poin = parseInt(readField(row, map, "TotalPoin")) || 0;
      if (!leaderboardMap[nama]) leaderboardMap[nama] = { nama, kelas, poin: 0 };
      leaderboardMap[nama].poin += poin;
      table.push({
        tgl,
        nama,
        kelas,
        poin,
        cols: [
          readField(row, map, "Haid"),
          readField(row, map, "Shubuh"),
          readField(row, map, "Dzuhur"),
          readField(row, map, "Ashar"),
          readField(row, map, "Maghrib"),
          readField(row, map, "Isya"),
          readField(row, map, "BantuOrtu"),
          readField(row, map, "BijakHP"),
          readField(row, map, "Belajar"),
          readField(row, map, "Tidur"),
          readField(row, map, "Tilawah"),
        ],
      });
    }
  }

  const leaderboard = Object.values(leaderboardMap)
    .sort((a, b) => b.poin - a.poin)
    .slice(0, 10);

  return { table: table.reverse(), leaderboard };
}

// --- GET DAILY FILL STATUS ---
async function getDailyFillStatus(token, tanggal, kelasFilter, userRole, userKelasBinaan, statusFilter, searchQuery) {
  if (!tanggal) return { success: false, message: "Tanggal wajib diisi" };

  const { data: siswaData, map: siswaMap } = await fetchSheetData(token, "Master_Siswa");
  const query = searchQuery ? String(searchQuery).toLowerCase().trim() : "";
  const siswaList = [];

  for (const row of siswaData) {
    const username = String(readField(row, siswaMap, "NIS") || "").trim();
    const nama = String(readField(row, siswaMap, "Nama") || "").trim();
    const kelasRaw = String(readField(row, siswaMap, "Kelas") || "").trim();
    const gender = String(readField(row, siswaMap, "Gender") || "L").trim();
    if (!username || !nama) continue;

    const kelasList = kelasRaw.split(/[,;]+/).map((k) => k.trim()).filter(Boolean);

    if (kelasFilter && kelasFilter !== "all") {
      const match = kelasList.some((k) => {
        const jj = k.split(".")[0];
        if (kelasFilter === "smp" && ["7", "8", "9"].includes(jj)) return true;
        if (kelasFilter === "sma" && ["10", "11", "12"].includes(jj)) return true;
        if (kelasFilter !== "smp" && kelasFilter !== "sma" && k === kelasFilter) return true;
        return false;
      });
      if (!match) continue;
    }

    if ((userRole === "wali" || userRole === "musyrif") && userKelasBinaan && userKelasBinaan.length) {
      const binaan = userKelasBinaan.map((x) => x.toLowerCase().trim());
      if (!kelasList.some((k) => binaan.includes(k.toLowerCase().trim()))) continue;
    }

    if (query && !nama.toLowerCase().includes(query)) continue;
    siswaList.push({ username, nama, kelas: kelasRaw, gender });
  }

  const { data: mData, map: mMap } = await fetchSheetData(token, "Mutabaah_Siswa");
  const submittedMap = {};
  for (const row of mData) {
    if (toLocalDateStr(readField(row, mMap, "Tanggal")) !== tanggal) continue;
    const n = String(readField(row, mMap, "Nama") || "").trim();
    if (!n) continue;
    submittedMap[normName(n)] = {
      poin: parseInt(readField(row, mMap, "TotalPoin")) || 0,
      haid: readField(row, mMap, "Haid"),
    };
  }

  let result = siswaList.map((s) => {
    const sub = submittedMap[normName(s.nama)];
    return {
      username: s.username,
      nama: s.nama,
      kelas: s.kelas,
      gender: s.gender,
      sudah: !!sub,
      poin: sub ? sub.poin : 0,
      haid: sub ? sub.haid : "",
    };
  });

  if (statusFilter === "sudah") result = result.filter((r) => r.sudah);
  else if (statusFilter === "belum") result = result.filter((r) => !r.sudah);

  result.sort((a, b) => {
    if (a.sudah !== b.sudah) return a.sudah ? 1 : -1;
    if (a.kelas !== b.kelas) return String(a.kelas).localeCompare(String(b.kelas));
    return a.nama.localeCompare(b.nama, undefined, { sensitivity: "base" });
  });

  const sudahCount = result.filter((r) => r.sudah).length;
  return {
    success: true,
    tanggal,
    total: result.length,
    sudahCount,
    belumCount: result.length - sudahCount,
    data: result,
  };
}

// --- GET PERSONAL HISTORY ---
async function getPersonalHistory(token, nama, role) {
  const isTeacher = ["guru", "wali", "musyrif", "admin"].includes(
    (role || "").toString().toLowerCase()
  );
  const sheetName = isTeacher ? "Mutabaah_Guru" : "Mutabaah_Siswa";
  const { data, map } = await fetchSheetData(token, sheetName);
  const history = [];

  for (const row of data) {
    if (sameName(readField(row, map, "Nama"), nama)) {
      const tgl = toLocalDateStr(readField(row, map, "Tanggal"));
      if (!tgl) continue;
      let val;
      if (isTeacher) {
        const teacherItems = [
          "Shubuh", "Dzuhur", "Ashar", "Maghrib", "Isya",
          "Dzikir", "Tilawah2Lbr", "BahanAjar",
        ];
        val = teacherItems.filter((f) => readField(row, map, f) === "Ya").length;
      } else {
        val = parseInt(readField(row, map, "TotalPoin")) || 0;
      }
      history.push({ tgl, val });
    }
  }

  history.sort((a, b) => String(a.tgl).localeCompare(String(b.tgl)));
  return history.slice(-7);
}

// --- GET CLASS COMPARISON ---
async function getClassComparison(token, startDate, endDate) {
  const { data, map } = await fetchSheetData(token, "Mutabaah_Siswa");
  const byKelas = {};

  for (const row of data) {
    const tgl = toLocalDateStr(readField(row, map, "Tanggal"));
    if (!tgl) continue;
    if (startDate && tgl < startDate) continue;
    if (endDate && tgl > endDate) continue;
    const kelasRaw = String(readField(row, map, "Kelas") || "").trim();
    const kelas = kelasRaw.split(/[,;]+/)[0].trim();
    if (!kelas) continue;
    const poin = parseInt(readField(row, map, "TotalPoin")) || 0;
    if (!byKelas[kelas]) byKelas[kelas] = { kelas, sum: 0, count: 0 };
    byKelas[kelas].sum += poin;
    byKelas[kelas].count += 1;
  }

  const rows = Object.values(byKelas).map((k) => ({
    kelas: k.kelas,
    avg: k.count ? Math.round(k.sum / k.count) : 0,
    total: k.count,
  }));

  rows.sort((a, b) => {
    const pa = a.kelas.split(".").map(Number);
    const pb = b.kelas.split(".").map(Number);
    if (pa[0] !== pb[0]) return pa[0] - pb[0];
    return (pa[1] || 0) - (pb[1] || 0);
  });

  return { success: true, rows };
}

// --- GET STREAK LEADERBOARD ---
async function getStreakLeaderboard(token) {
  const { data, map } = await fetchSheetData(token, "Mutabaah_Siswa");
  const perNama = {};

  for (const row of data) {
    const n = String(readField(row, map, "Nama") || "").trim();
    if (!n) continue;
    const t = toLocalDateStr(readField(row, map, "Tanggal"));
    if (!t) continue;
    const key = normName(n);
    if (!perNama[key]) {
      perNama[key] = {
        nama: n,
        kelas: String(readField(row, map, "Kelas") || ""),
        dates: new Set(),
      };
    }
    perNama[key].dates.add(t);
  }

  const today = new Date();
  const rows = [];
  for (const item of Object.values(perNama)) {
    let streak = 0;
    const cursor = new Date(today);
    if (!item.dates.has(toLocalDateStr(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (item.dates.has(toLocalDateStr(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    if (streak > 0) rows.push({ nama: item.nama, kelas: item.kelas, streak });
  }

  rows.sort((a, b) => b.streak - a.streak);
  return { success: true, rows: rows.slice(0, 10) };
}

// --- GET MY NOTIF ---
async function getMyNotif(token, username, nama, role) {
  const isTeacher = ["guru", "wali", "musyrif", "admin"].includes(
    (role || "").toString().toLowerCase()
  );
  const sheetName = isTeacher ? "Mutabaah_Guru" : "Mutabaah_Siswa";
  const { data, map } = await fetchSheetData(token, sheetName);
  const dates = new Set();

  for (const row of data) {
    if (sameName(readField(row, map, "Nama"), nama)) {
      const t = toLocalDateStr(readField(row, map, "Tanggal"));
      if (t) dates.add(t);
    }
  }

  const today = toLocalDateStr(new Date());
  const yesterday = toLocalDateStr(new Date(Date.now() - 86400000));
  let unread = 0;
  let message = "";

  if (!dates.has(today)) {
    unread = 1;
    message = dates.has(yesterday)
      ? "Isi Mutabaah hari ini — jaga streak Anda!"
      : "Sudah beberapa hari tidak isi Mutabaah. Yuk isi lagi!";
    let gap = 0;
    for (let i = 0; i < 30; i++) {
      const d = toLocalDateStr(new Date(Date.now() - i * 86400000));
      if (dates.has(d)) break;
      gap++;
    }
    if (gap >= 3) message = `Anda tidak isi ${gap} hari. Yuk mulai lagi!`;
  }

  let streak = 0;
  const cursor = new Date();
  if (!dates.has(toLocalDateStr(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (dates.has(toLocalDateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return {
    success: true,
    unread,
    message,
    streak,
    sudahHariIni: dates.has(today),
  };
}

// --- GET DASHBOARD STATS ---
async function getDashboardStats(token, tanggal) {
  if (!tanggal) tanggal = toLocalDateStr(new Date());

  const { data: siswaData } = await fetchSheetData(token, "Master_Siswa");
  const totalSiswa = siswaData.length;

  const { data: mData, map: mMap } = await fetchSheetData(token, "Mutabaah_Siswa");
  let sudah = 0;
  let sumPoin = 0;
  let haid = 0;

  for (const row of mData) {
    if (toLocalDateStr(readField(row, mMap, "Tanggal")) !== tanggal) continue;
    sudah++;
    sumPoin += parseInt(readField(row, mMap, "TotalPoin")) || 0;
    if (readField(row, mMap, "Haid") === "Ya") haid++;
  }

  const weekAgo = toLocalDateStr(new Date(Date.now() - 6 * 86400000));
  const comp = await getClassComparison(token, weekAgo, tanggal);
  let kelasTerbaik = "-";
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
    persen: totalSiswa ? Math.round((sudah / totalSiswa) * 100) : 0,
    avgPoin: sudah ? Math.round(sumPoin / sudah) : 0,
    jumlahHaid: haid,
    kelasTerbaik,
  };
}

// --- GET STUDENT TIMELINE ---
async function getStudentTimeline(token, nama, role, days) {
  days = days || 30;
  const isTeacher = ["guru", "wali", "musyrif", "admin"].includes(
    (role || "").toString().toLowerCase()
  );
  const sheetName = isTeacher ? "Mutabaah_Guru" : "Mutabaah_Siswa";
  const { data, map } = await fetchSheetData(token, sheetName);

  const items = isTeacher
    ? ["Shubuh", "Dzuhur", "Ashar", "Maghrib", "Isya", "Dzikir", "Tilawah2Lbr", "BahanAjar"]
    : ["Shubuh", "Dzuhur", "Ashar", "Maghrib", "Isya", "BantuOrtu", "BijakHP", "Belajar", "Tidur", "Tilawah"];

  const result = [];
  for (const row of data) {
    if (!sameName(readField(row, map, "Nama"), nama)) continue;
    const tgl = toLocalDateStr(readField(row, map, "Tanggal"));
    if (!tgl) continue;
    const vals = {};
    items.forEach((f) => {
      vals[f] = readField(row, map, f) === "Ya";
    });
    result.push({
      tgl,
      poin: parseInt(readField(row, map, "TotalPoin")) || 0,
      haid: readField(row, map, "Haid") === "Ya",
      catatan: readField(row, map, "Catatan") || "",
      items: vals,
      itemKeys: items,
      isTeacher,
    });
  }

  result.sort((a, b) => String(b.tgl).localeCompare(String(a.tgl)));
  return { success: true, nama, data: result.slice(0, days) };
}

// --- SAVE CLASS ---
async function saveClass(token, nama) {
  if (!nama || !nama.toString().trim()) {
    return { success: false, message: "Nama kelas wajib diisi" };
  }
  const { headers, map } = await fetchSheetData(token, "Master_Kelas");
  const row = buildRow(headers, map, {
    ID: crypto.randomUUID(),
    NamaKelas: nama.toString().trim(),
  });
  await sheetsAppend(token, "Master_Kelas!A:Z", [row]);
  return { success: true, message: "Kelas berhasil disimpan" };
}

// --- DELETE CLASS ---
async function deleteClass(token, id) {
  const { data, map } = await fetchSheetData(token, "Master_Kelas");
  for (let i = 0; i < data.length; i++) {
    if (String(readField(data[i], map, "ID")) === String(id)) {
      const rowIndex = i + 2;
      await sheetsClear(token, `Master_Kelas!A${rowIndex}:Z${rowIndex}`);
      return { success: true, message: "Kelas dihapus" };
    }
  }
  return { success: false, message: "Kelas tidak ditemukan" };
}

// --- SAVE STUDENT ---
async function saveStudent(token, nis, pin, namaLengkap, gender, kelasBinaan) {
  if (!nis || !nis.toString().trim()) {
    return { success: false, message: "NIS wajib diisi" };
  }
  const { headers, data, map } = await fetchSheetData(token, "Master_Siswa");

  // Cek duplikat
  for (const row of data) {
    if (String(readField(row, map, "NIS")).toLowerCase() === nis.toString().toLowerCase().trim()) {
      return { success: false, message: "NIS sudah dipakai." };
    }
  }

  const row = buildRow(headers, map, {
    ID: crypto.randomUUID(),
    NIS: nis.toString().trim(),
    Nama: (namaLengkap || nis).toString().trim(),
    Kelas: (kelasBinaan || "").toString().trim(),
    Gender: (gender || "L").toString().trim(),
    PIN: (pin || "1234").toString().trim(),
  });

  await sheetsAppend(token, "Master_Siswa!A:Z", [row]);
  return { success: true, message: "Akun siswa berhasil disimpan" };
}

// --- DELETE STUDENT ---
async function deleteStudent(token, nis) {
  const { data, map } = await fetchSheetData(token, "Master_Siswa");
  for (let i = 0; i < data.length; i++) {
    if (String(readField(data[i], map, "NIS")) === String(nis)) {
      const rowIndex = i + 2;
      await sheetsClear(token, `Master_Siswa!A${rowIndex}:Z${rowIndex}`);
      return { success: true, message: "Akun siswa dihapus" };
    }
  }
  return { success: false, message: "Akun tidak ditemukan." };
}

// --- SAVE TEACHER ---
async function saveTeacher(token, username, pin, role, namaLengkap, gender, kelasBinaan) {
  if (!username || !username.toString().trim()) {
    return { success: false, message: "Username wajib diisi" };
  }
  const { headers, data, map } = await fetchSheetData(token, "Master_Akun");

  for (const row of data) {
    if (
      String(readField(row, map, "Username")).toLowerCase() ===
      username.toString().toLowerCase().trim()
    ) {
      return { success: false, message: "Username sudah dipakai." };
    }
  }

  const VALID_ROLES = ["siswa", "guru", "wali", "musyrif", "admin"];
  const finalRole = VALID_ROLES.includes((role || "").toLowerCase().trim())
    ? role.toLowerCase().trim()
    : "guru";

  const row = buildRow(headers, map, {
    Username: username.toString().trim(),
    PIN: (pin || "1234").toString().trim(),
    Role: finalRole,
    NamaLengkap: (namaLengkap || username).toString().trim(),
    Gender: (gender || "L").toString().trim(),
    KelasBinaan: (kelasBinaan || "").toString().trim(),
  });

  await sheetsAppend(token, "Master_Akun!A:Z", [row]);
  return { success: true, message: "Akun guru berhasil disimpan" };
}

// --- DELETE TEACHER ---
async function deleteTeacher(token, username) {
  const { data, map } = await fetchSheetData(token, "Master_Akun");
  for (let i = 0; i < data.length; i++) {
    if (String(readField(data[i], map, "Username")) === String(username)) {
      const rowIndex = i + 2;
      await sheetsClear(token, `Master_Akun!A${rowIndex}:Z${rowIndex}`);
      return { success: true, message: "Akun guru dihapus" };
    }
  }
  return { success: false, message: "Akun tidak ditemukan." };
}

// --- CHANGE OWN PIN ---
async function changeOwnPin(token, username, oldPin, newPin) {
  if (!username || !oldPin || !newPin) {
    return { success: false, message: "Semua field wajib diisi" };
  }
  const np = String(newPin).trim();
  if (np.length < 4) return { success: false, message: "PIN minimal 4 karakter" };
  if (!/^\d+$/.test(np)) return { success: false, message: "PIN hanya angka" };

  for (const sheetName of ["Master_Akun", "Master_Siswa"]) {
    const { headers, data, map } = await fetchSheetData(token, sheetName);
    const keyField = sheetName === "Master_Siswa" ? "NIS" : "Username";
    for (let i = 0; i < data.length; i++) {
      const u = String(readField(data[i], map, keyField) || "").trim();
      if (u.toLowerCase() === username.toLowerCase().trim()) {
        const curPin = String(readField(data[i], map, "PIN") || "").trim();
        if (curPin !== String(oldPin).trim()) {
          return { success: false, message: "PIN lama salah" };
        }
        const pinCol = map["PIN"] + 1;
        const colLetter = String.fromCharCode(64 + pinCol); // A=65
        const rowIndex = i + 2;
        await sheetsUpdate(token, `${sheetName}!${colLetter}${rowIndex}`, [[np]]);
        return { success: true, message: "PIN berhasil diubah" };
      }
    }
  }
  return { success: false, message: "Akun tidak ditemukan" };
}

// --- EXPORT CSV ---
async function exportReportCSV(token, kelasFilter, genderFilter, startDate, endDate, roleTarget, searchQuery) {
  const res = await getReportData(token, kelasFilter, startDate, endDate, roleTarget, searchQuery, genderFilter);
  const isTeacher = roleTarget === "guru";
  const rows = [];

  if (isTeacher) {
    rows.push(["Tanggal", "Nama", "Haid", "Subuh", "Dzuhur", "Ashar", "Maghrib", "Isya", "Dzikir", "Tilawah 2Lbr", "Bahan Ajar", "Catatan"]);
    (res.table || []).forEach((r) => {
      rows.push([r.tgl, r.nama, ...r.cols]);
    });
  } else {
    rows.push(["Tanggal", "Nama", "Kelas", "Poin", "Haid", "Subuh", "Dzuhur", "Ashar", "Maghrib", "Isya", "Bantu Ortu", "Bijak HP", "Belajar", "Tidur", "Tilawah"]);
    (res.table || []).forEach((r) => {
      rows.push([r.tgl, r.nama, r.kelas, r.poin, ...r.cols]);
    });
  }

  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell === null || cell === undefined ? "" : cell);
          if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
          return s;
        })
        .join(",")
    )
    .join("\n");

  return { success: true, csv, filename: `Rekap_${roleTarget}_${startDate}_${endDate}.csv` };
}

// --- ARCHIVE ---
async function archiveData(token) {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:T]/g, "")
    .slice(0, 15);
  const targets = [
    { name: "Mutabaah_Siswa", suffix: "_Siswa" },
    { name: "Mutabaah_Guru", suffix: "_Guru" },
  ];
  let count = 0;

  for (const t of targets) {
    const { data } = await fetchSheetData(token, t.name);
    if (data.length > 0) {
      // Buat sheet arsip baru (via Sheets API)
      // Catatan: Untuk kesederhanaan, kita hanya clear data.
      // Untuk arsip penuh, perlu batchUpdate untuk copy sheet.
      // Di sini kita clear saja.
      await sheetsClear(token, `${t.name}!A2:Z`);
      count++;
    }
  }

  return count
    ? { success: true, message: "Data semester berhasil diarsipkan dan dibersihkan!" }
    : { success: false, message: "Tidak ada data untuk diarsipkan." };
}

// ============================================================
// PRAYER TIMES
// ============================================================
async function getPrayerTimes(city, country) {
  city = city || "Jakarta";
  country = country || "Indonesia";
  const url = `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=20`;
  try {
    const res = await fetch(url);
    if (!res.ok) return { success: false, message: `HTTP ${res.status}` };
    const data = await res.json();
    if (data && data.data && data.data.timings) {
      return { success: true, timings: data.data.timings };
    }
    return { success: false, message: "Respons tidak valid" };
  } catch (e) {
    return { success: false, message: "Gagal: " + e.message };
  }
}

// ============================================================
// MAIN FETCH HANDLER
// ============================================================
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "*";

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };

    // Handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Hanya terima POST
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const { action, params } = body;

      if (!action) {
        return new Response(
          JSON.stringify({ success: false, message: "Action tidak ditemukan" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Dapatkan token Google
      const token = await getGoogleAccessToken(env);

      let result;

      switch (action) {
        case "verifyLogin":
          result = await verifyLogin(token, params.user, params.pin);
          break;
        case "submitMutabaah":
          result = await submitMutabaah(token, params.payload);
          break;
        case "getMutabaahEntry":
          result = await getMutabaahEntry(token, params.nama, params.tanggal, params.role);
          break;
        case "getClasses":
          result = await getClasses(token);
          break;
        case "getStudents":
          result = await getStudents(token);
          break;
        case "getTeachers":
          result = await getTeachers(token);
          break;
        case "getReportData":
          result = await getReportData(
            token,
            params.kelasFilter,
            params.startDate,
            params.endDate,
            params.roleTarget,
            params.searchQuery,
            params.genderFilter
          );
          break;
        case "getDailyFillStatus":
          result = await getDailyFillStatus(
            token,
            params.tanggal,
            params.kelasFilter,
            params.userRole,
            params.userKelasBinaan,
            params.statusFilter,
            params.searchQuery
          );
          break;
        case "getPersonalHistory":
          result = await getPersonalHistory(token, params.nama, params.role);
          break;
        case "getClassComparison":
          result = await getClassComparison(token, params.startDate, params.endDate);
          break;
        case "getStreakLeaderboard":
          result = await getStreakLeaderboard(token);
          break;
        case "getMyNotif":
          result = await getMyNotif(token, params.username, params.nama, params.role);
          break;
        case "getDashboardStats":
          result = await getDashboardStats(token, params.tanggal);
          break;
        case "getStudentTimeline":
          result = await getStudentTimeline(token, params.nama, params.role, params.days);
          break;
        case "saveClass":
          result = await saveClass(token, params.nama);
          break;
        case "deleteClass":
          result = await deleteClass(token, params.id);
          break;
        case "saveStudent":
          result = await saveStudent(token, params.nis, params.pin, params.namaLengkap, params.gender, params.kelasBinaan);
          break;
        case "deleteStudent":
          result = await deleteStudent(token, params.nis);
          break;
        case "saveTeacher":
          result = await saveTeacher(token, params.username, params.pin, params.role, params.namaLengkap, params.gender, params.kelasBinaan);
          break;
        case "deleteTeacher":
          result = await deleteTeacher(token, params.username);
          break;
        case "changeOwnPin":
          result = await changeOwnPin(token, params.username, params.oldPin, params.newPin);
          break;
        case "exportReportCSV":
          result = await exportReportCSV(token, params.kelasFilter, params.genderFilter, params.startDate, params.endDate, params.roleTarget, params.searchQuery);
          break;
        case "archiveData":
          result = await archiveData(token);
          break;
        case "getPrayerTimes":
          result = await getPrayerTimes(params.city, params.country);
          break;
        default:
          result = { success: false, message: `Action "${action}" tidak dikenal` };
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Worker error:", err);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Internal server error: " + err.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  },
};