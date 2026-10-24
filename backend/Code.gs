/**
 * 家庭防災庫 — Google Apps Script 後台
 *
 * 第一次使用：
 *   1. 改下面三個設定（EDITORS、CLIENT_ID）
 *   2. 執行 setup()               → 建立分頁、照片資料夾
 *   3. 執行 setFamilyPassword()   → 先把 NEW_FAMILY_PASSWORD 改成你們的家庭密碼，執行後再改回空字串
 *   4. 部署 → 新增部署作業 → 網頁應用程式（執行身分：我；存取權：所有人）
 */

// ===== 設定 =====
const EDITORS = ['你的Gmail@gmail.com', '太太的Gmail@gmail.com'];   // 可以編輯的 Google 帳號：把第二個改成太太的 Gmail
const CLIENT_ID = 'xxxxxxxx.apps.googleusercontent.com';            // Google Cloud 的 OAuth 用戶端 ID
const NEW_FAMILY_PASSWORD = '';                                      // 只在執行 setFamilyPassword() 時暫填
const SESSION_DAYS = 60;                                             // 登入後幾天內不用重新登入

// ===== 分頁結構（欄位順序就是試算表的欄位順序）=====
const TABLES = {
  Members:   ['id', 'name', 'birth', 'water', 'meals', 'kcal', 'fullName', 'blood', 'idno', 'phone', 'allergy', 'photo'],
  Items:     ['id', 'cat', 'sub', 'name', 'qty', 'unit', 'unitL', 'kcal', 'prep', 'method', 'suits', 'owner', 'loc',
              'exp', 'checked', 'size', 'needType', 'need', 'mah', 'battery', 'photos', 'updatedAt', 'updatedBy'],
  Usage:     ['id', 'time', 'itemId', 'name', 'qty', 'unit', 'by'],
  Wishlist:  ['id', 'cat', 'name', 'qty', 'unit', 'note', 'budget'],
  Needs:     ['id', 'mode', 'current', 'target', 'unit', 'note', 'links', 'checked'],
  Scenarios: ['id', 'steps', 'group', 'title', 'sum', 'needs'],
  Contacts:  ['id', 'name', 'relation', 'phone', 'note', 'onCard'],
  Plan:      ['id', 'value'],
  Settings:  ['id', 'value'],
  Photos:    ['id', 'thumb']
};
const FOLDER_NAME = '家庭防災庫照片';
const PHOTO_FOLDER_ID = '';   // 已建立在「家庭防災庫」資料夾裡

// ===== 初始化 =====
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABLES).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const cols = TABLES[name];
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
    // 全部存成純文字，避免日期、電話被自動轉格式
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
  });
  const def = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);

  const members = ss.getSheetByName('Members');
  if (members.getLastRow() < 2) {
    members.getRange(2, 1, 5, 6).setValues([
      ['dad', '爸爸', '', '3', '3', '2000'],
      ['mom', '媽媽', '', '3', '3', '1600'],
      ['son1', '哥哥', '', '3', '3', '1550'],
      ['son2', '弟弟', '', '3', '3', '1400'],
      ['girl', '妹妹', '', '3', '3', '1150']
    ]);
  }
  const settings = ss.getSheetByName('Settings');
  if (settings.getLastRow() < 2) {
    settings.getRange(2, 1, 2, 2).setValues([['hyg', '2'], ['goBag', '3']]);
  }
  getFolder_();
  Logger.log('完成。請到 Members 分頁填每個人的生日（格式 2018-03-01），之後執行 setFamilyPassword()。');
}

function setFamilyPassword() {
  if (!NEW_FAMILY_PASSWORD || NEW_FAMILY_PASSWORD.length < 6) throw new Error('請先把 NEW_FAMILY_PASSWORD 改成至少 6 個字的密碼');
  PropertiesService.getScriptProperties().setProperty('FAMILY_HASH', sha256_(NEW_FAMILY_PASSWORD));
  Logger.log('家庭密碼已設定。請把 NEW_FAMILY_PASSWORD 改回空字串並儲存。');
}

/** 清掉所有登入（例如手機遺失時） */
function logoutEveryone() {
  const p = PropertiesService.getScriptProperties();
  Object.keys(p.getProperties()).filter(k => k.indexOf('sess_') === 0).forEach(k => p.deleteProperty(k));
  Logger.log('所有裝置都需要重新登入。');
}

// ===== 網頁入口 =====
function doGet() {
  return json_({ ok: true, app: '家庭防災庫' });
}

/** 新版程式加了欄位或分頁時，自動補上（不動既有資料） */
function ensureSchema_() {
  const cache = CacheService.getScriptCache();
  const sig = Object.keys(TABLES).map(k => k + ':' + TABLES[k].length).join('|');
  if (cache.get('schema') === sig) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABLES).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) { sh = ss.insertSheet(name); sh.setFrozenRows(1); }
    const cols = TABLES[name];
    const lastCol = Math.max(1, sh.getLastColumn());
    const head = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    cols.forEach(c => {
      if (head.indexOf(c) < 0) {
        const at = head.filter(Boolean).length + 1;
        sh.getRange(1, at).setValue(c).setFontWeight('bold');
        sh.getRange(1, at, sh.getMaxRows(), 1).setNumberFormat('@');
        head[at - 1] = c;
      }
    });
  });
  cache.put('schema', sig, 21600);
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: '格式錯誤' }); }
  try {
    ensureSchema_();
    switch (req.action) {
      case 'loginGoogle':   return json_(loginGoogle_(req.credential));
      case 'loginPassword': return json_(loginPassword_(req.password));
      case 'logout':        endSession_(req.session); return json_({ ok: true });
    }
    const sess = getSession_(req.session);
    if (!sess) return json_({ ok: false, error: 'AUTH', message: '登入已過期，請重新登入' });
    switch (req.action) {
      case 'load':   return json_(Object.assign({ ok: true, role: sess.role, who: sess.name }, loadAll_(sess.role)));
      case 'photo':  return json_({ ok: true, data: getPhoto_(req.id) });
    }
    if (sess.role !== 'editor') return json_({ ok: false, error: 'READONLY', message: '唯讀模式不能修改' });
    switch (req.action) {
      case 'sync':   return json_(sync_(req.changes, sess));
      case 'upload': return json_(upload_(req.full, req.thumb, req.name));
    }
    return json_({ ok: false, error: '未知的動作' });
  } catch (err) {
    return json_({ ok: false, error: 'SERVER', message: String(err && err.message || err) });
  }
}

// ===== 登入 =====
function loginGoogle_(credential) {
  if (!credential) return { ok: false, error: '缺少登入資訊' };
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { ok: false, error: 'Google 登入驗證失敗' };
  const t = JSON.parse(res.getContentText());
  if (t.aud !== CLIENT_ID) return { ok: false, error: '用戶端 ID 不符，請檢查 CLIENT_ID 設定' };
  if (String(t.email_verified) !== 'true') return { ok: false, error: 'Email 未驗證' };
  const email = String(t.email || '').toLowerCase();
  const allowed = EDITORS.map(x => x.toLowerCase());
  if (allowed.indexOf(email) < 0) return { ok: false, error: '這個帳號沒有編輯權限：' + email };
  return Object.assign({ ok: true }, newSession_('editor', t.name || email, email));
}

function loginPassword_(password) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('pw_fails') || 0);
  if (fails >= 10) return { ok: false, error: '嘗試太多次，請 10 分鐘後再試' };
  const hash = PropertiesService.getScriptProperties().getProperty('FAMILY_HASH');
  if (!hash) return { ok: false, error: '尚未設定家庭密碼' };
  if (!password || sha256_(password) !== hash) {
    cache.put('pw_fails', String(fails + 1), 600);
    return { ok: false, error: '密碼不正確' };
  }
  return Object.assign({ ok: true }, newSession_('viewer', '家人（唯讀）', ''));
}

function newSession_(role, name, email) {
  const p = PropertiesService.getScriptProperties();
  const now = Date.now();
  Object.entries(p.getProperties()).forEach(([k, v]) => {
    if (k.indexOf('sess_') === 0) { try { if (JSON.parse(v).exp < now) p.deleteProperty(k); } catch (e) { p.deleteProperty(k); } }
  });
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  p.setProperty('sess_' + sha256_(token), JSON.stringify({ role, name, email, exp: now + SESSION_DAYS * 864e5 }));
  return { session: token, role, name };
}

function getSession_(token) {
  if (!token) return null;
  const v = PropertiesService.getScriptProperties().getProperty('sess_' + sha256_(token));
  if (!v) return null;
  const s = JSON.parse(v);
  return s.exp > Date.now() ? s : null;
}

function endSession_(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty('sess_' + sha256_(token));
}

// ===== 讀寫 =====
function loadAll_(role) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const out = { tables: {} };
  Object.keys(TABLES).forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) { out.tables[name] = []; return; }
    const last = sh.getLastRow();
    if (last < 2) { out.tables[name] = []; return; }
    const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
    const rows = sh.getRange(2, 1, last - 1, head.length).getDisplayValues();
    out.tables[name] = rows.filter(r => r[0] !== '').map(r => {
      const o = {}; head.forEach((h, i) => { if (h) o[h] = r[i]; }); return o;
    });
  });
  // 唯讀身分看不到完整身分證字號
  if (role !== 'editor') (out.tables.Members || []).forEach(m => { m.idno = maskId_(m.idno); });
  out.serverTime = new Date().toISOString();
  return out;
}

function maskId_(s) {
  s = String(s || '');
  return s.length < 6 ? (s ? '******' : '') : s.slice(0, 3) + '****' + s.slice(-3);
}

function sync_(changes, sess) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    Object.keys(changes || {}).forEach(name => {
      if (!TABLES[name]) return;
      const sh = ss.getSheetByName(name);
      const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
      const last = sh.getLastRow();
      const ids = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getDisplayValues().map(r => r[0]) : [];
      const ch = changes[name];
      (ch.upsert || []).forEach(row => {
        if (name === 'Items') { row.updatedAt = new Date().toISOString(); row.updatedBy = sess.name; }
        const values = [head.map(h => row[h] == null ? '' : String(row[h]))];
        const at = ids.indexOf(String(row.id));
        if (at >= 0) sh.getRange(at + 2, 1, 1, head.length).setValues(values);
        else { sh.getRange(sh.getLastRow() + 1, 1, 1, head.length).setNumberFormat('@').setValues(values); ids.push(String(row.id)); }
      });
      // 由下往上刪，避免列號位移
      (ch.del || []).map(id => ids.indexOf(String(id))).filter(i => i >= 0).sort((a, b) => b - a)
        .forEach(i => { sh.deleteRow(i + 2); ids.splice(i, 1); });
    });
    return { ok: true, serverTime: new Date().toISOString() };
  } finally {
    lock.releaseLock();
  }
}

// ===== 照片 =====
function getFolder_() {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('FOLDER_ID') || PHOTO_FOLDER_ID;
  if (id) { try { const f0 = DriveApp.getFolderById(id); p.setProperty('FOLDER_ID', id); return f0; } catch (e) {} }
  const f = DriveApp.createFolder(FOLDER_NAME);
  p.setProperty('FOLDER_ID', f.getId());
  return f;
}

function upload_(full, thumb, name) {
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(full || '');
  if (!m) return { ok: false, error: '照片格式錯誤' };
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], (name || 'photo') + '.jpg');
  const file = getFolder_().createFile(blob);
  const id = file.getId();
  if (thumb) {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Photos');
    sh.getRange(sh.getLastRow() + 1, 1, 1, 2).setNumberFormat('@').setValues([[id, thumb]]);
  }
  return { ok: true, id };
}

function getPhoto_(id) {
  const blob = DriveApp.getFileById(id).getBlob();
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

// ===== 工具 =====
function sha256_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
