/**
 * Ngân hàng Mintun · cầu nối giữa Google Sheet thu chi và app tài chính trong Học viện.
 *
 * Gắn script này vào chính file Sheet "Income & expenditure of mintun"
 * (Tiện ích mở rộng → Apps Script). Xem HUONG-DAN.md.
 *
 * Script Properties:
 *   APP_KEY   – mã bí mật app dùng để đọc/ghi (chạy hàm caiDat() một lần để tạo)
 *   SHEET_TAB – (tuỳ chọn) tên tab thu chi, mặc định tab đầu tiên có dòng "Tháng"
 *
 * API (POST, body JSON dạng text/plain): { key, action, ... }
 *   doc       → toàn bộ bảng thu chi + ghi chú ô + comment + nhật ký giao dịch app
 *   them      → { gd:{ ts, loai:'thu'|'chi', hang_muc, so_tien, ghi_chu } } cộng vào ô tháng + ghi chú ô + ghi nhật ký
 *   xoa       → { id } trừ lại khoản đã ghi từ app
 *   gia       → { ma:[{ma:'FPT',loai:'cp'|'quy'}] } giá đóng cửa theo ngày (cổ phiếu/ETF VN, NAV quỹ mở)
 *   ai        → { tom:'tóm tắt số liệu', hoi?:'câu hỏi' } Gemini phân tích (cần Script Property GEMINI_KEY)
 *
 * Ô A1 của tab thu chi: ghi mốc cập nhật (vd "Update gần nhất: 11h15 AM 27/11/2026"), app hiện ở đầu dashboard.
 */

const LOG_TAB = 'App · Giao dịch';
const LOG_HEAD = ['id', 'thời gian', 'loại', 'hạng mục', 'số tiền', 'ghi chú', 'tháng', 'ô', 'trạng thái', 'ghi lúc'];
const TZ = 'Asia/Ho_Chi_Minh';

/* ============================ CÀI ĐẶT ============================ */

/** Chạy 1 lần: tạo mã APP_KEY + tab nhật ký. Mã hiện trong Nhật ký thực thi. */
function caiDat() {
  const pr = PropertiesService.getScriptProperties();
  let k = pr.getProperty('APP_KEY');
  if (!k) {
    k = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    pr.setProperty('APP_KEY', k);
  }
  logSheet_();
  const t = tabThuChi_();
  Logger.log('Tab thu chi: ' + t.getName());
  Logger.log('APP_KEY (dán vào app Ngân hàng Mintun): ' + k);
  return k;
}

/** Đổi mã mới (khi lỡ lộ mã). Máy nào đang dùng mã cũ sẽ phải dán lại. */
function doiMa() {
  PropertiesService.getScriptProperties().deleteProperty('APP_KEY');
  return caiDat();
}

/** Thử đọc dữ liệu ngay trong trình soạn thảo. */
function thuDoc() {
  const r = docTatCa_();
  Logger.log('Tab: %s · %s dòng × %s cột · %s ghi chú ô · %s comment · %s giao dịch app',
    r.tab, r.values.length, (r.values[0] || []).length, r.notes.flat().filter(String).length, r.comments.length, r.gd.length);
}

/* ============================ WEB APP ============================ */

function doGet() { return json_({ ok: true, app: 'ngan-hang-mintun' }); }

function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (_) { }
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('fails') || 0);
  if (fails >= 20) return json_({ ok: false, loi: 'Tạm khoá 15 phút do nhập sai mã quá nhiều lần' });
  if (!khopKey_(p.key)) {
    cache.put('fails', String(fails + 1), 900);
    Utilities.sleep(1200);
    return json_({ ok: false, loi: 'Sai mã kết nối' });
  }
  try {
    switch (p.action) {
      case 'doc': return json_(Object.assign({ ok: true }, docTatCa_(!!p.moi)));
      case 'them': return json_(Object.assign({ ok: true }, them_(p.gd || {})));
      case 'xoa': return json_(Object.assign({ ok: true }, xoa_(String(p.id || ''))));
      case 'gia': return json_({ ok: true, gia: layGia_(p.ma || []), at: new Date().toISOString() });
      case 'ai': return json_(Object.assign({ ok: true }, hoiAI_(String(p.tom || ''), String(p.hoi || ''))));
      default: return json_({ ok: false, loi: 'Không rõ thao tác' });
    }
  } catch (err) {
    return json_({ ok: false, loi: String(err && err.message || err) });
  }
}

function khopKey_(k) {
  const that = PropertiesService.getScriptProperties().getProperty('APP_KEY');
  if (!that || typeof k !== 'string' || k.length !== that.length) return false;
  let d = 0;
  for (let i = 0; i < k.length; i++) d |= k.charCodeAt(i) ^ that.charCodeAt(i);
  return d === 0;
}

/* ============================ ĐỌC ============================ */

function docTatCa_(moi) {
  const sh = tabThuChi_();
  const rg = sh.getDataRange();
  const raw = rg.getValues().map(r => r.map(v => v instanceof Date ? { d: Utilities.formatDate(v, TZ, 'yyyy-MM-dd') } : v));
  return {
    tab: sh.getName(),
    values: raw,
    display: rg.getDisplayValues(),
    notes: rg.getNotes(),
    comments: docCommentCache_(moi),
    gd: docLog_(),
    at: new Date().toISOString(),
    file: SpreadsheetApp.getActiveSpreadsheet().getName()
  };
}

/** Comment đọc qua Drive API khá chậm: giữ 6 giờ, bấm "Cập nhật" (moi=true) thì đọc lại. */
function docCommentCache_(moi) {
  const c = CacheService.getScriptCache();
  if (!moi) { const s = c.get('cmt'); if (s) try { return JSON.parse(s); } catch (_) { } }
  const out = docComment_();
  try { const s = JSON.stringify(out); if (s.length < 95000) c.put('cmt', s, 21600); } catch (_) { }
  return out;
}

/** Comment trên Sheet (không bắt buộc). App tự dò comment thuộc ô nào qua giá trị ô + ngày tạo. */
function docComment_() {
  try {
    const id = SpreadsheetApp.getActiveSpreadsheet().getId();
    const out = [];
    let page = '';
    for (let i = 0; i < 10; i++) {
      const url = 'https://www.googleapis.com/drive/v3/files/' + id + '/comments?pageSize=100&includeDeleted=false' +
        '&fields=nextPageToken,comments(content,createdTime,resolved,anchor,quotedFileContent/value,replies(content))' +
        (page ? '&pageToken=' + encodeURIComponent(page) : '');
      const r = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
      if (r.getResponseCode() !== 200) break;
      const j = JSON.parse(r.getContentText());
      (j.comments || []).forEach(c => out.push({
        t: [c.content].concat((c.replies || []).map(x => x.content)).filter(Boolean).join(' · '),
        at: c.createdTime, q: c.quotedFileContent && c.quotedFileContent.value || '', a: c.anchor || ''
      }));
      if (!j.nextPageToken) break;
      page = j.nextPageToken;
    }
    return out;
  } catch (e) { return []; }
}

function docLog_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOG_TAB);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, LOG_HEAD.length).getValues()
    .filter(r => r[0])
    .map(r => ({
      id: String(r[0]), ts: r[1] instanceof Date ? r[1].toISOString() : String(r[1]), loai: r[2], hang_muc: r[3],
      so_tien: Number(r[4]) || 0, ghi_chu: r[5], thang: r[6], o: r[7], trang_thai: r[8]
    }));
}

/* ============================ GHI ============================ */

function them_(g) {
  const amt = Math.round(Number(g.so_tien));
  if (!amt || !isFinite(amt) || Math.abs(amt) > 5e10) throw new Error('Số tiền không hợp lệ');
  const loai = g.loai === 'thu' ? 'thu' : 'chi';
  const hm = String(g.hang_muc || '').trim();
  if (!hm) throw new Error('Thiếu hạng mục');
  const ts = g.ts ? new Date(g.ts) : new Date();
  if (isNaN(ts) || Math.abs(ts - Date.now()) > 3 * 365 * 864e5) throw new Error('Ngày giờ không hợp lệ');
  const note = String(g.ghi_chu || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 200);
  const an = s => /^[=+\-@]/.test(s) ? "'" + s : s;   // chặn chữ bị Sheet hiểu thành công thức

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = tabThuChi_();
    const id = g.id && /^[\w-]{6,40}$/.test(g.id) ? g.id : Utilities.getUuid().slice(0, 13);
    const log = logSheet_();
    if (log.getLastRow() > 1 && log.getRange(2, 1, log.getLastRow() - 1, 1).getValues().some(r => String(r[0]) === id))
      return { id, trung: true };                       // gửi lại do mất mạng: không cộng 2 lần

    const col = cotThang_(sh, ts.getMonth() + 1, ts.getFullYear(), true);
    const row = dongHangMuc_(sh, hm, loai);
    if (!row) throw new Error('Không thấy dòng "' + hm + '" trong sheet');
    const cell = sh.getRange(row, col);
    congVao_(cell, amt);
    const line = Utilities.formatDate(ts, TZ, 'dd/MM HH:mm') + ' · ' + (amt > 0 ? '+' : '') + fmt_(amt) + (note ? ' · ' + note : '') + ' (app)';
    const old = cell.getNote();
    cell.setNote(old ? old + '\n' + line : line);

    log.appendRow([id, ts, loai, an(hm), amt, an(note), (ts.getMonth() + 1) + '/' + ts.getFullYear(), cell.getA1Notation(), 'ok', new Date()]);
    return { id, o: cell.getA1Notation(), thang: (ts.getMonth() + 1) + '/' + ts.getFullYear() };
  } finally { lock.releaseLock(); }
}

function xoa_(id) {
  if (!id) throw new Error('Thiếu id');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const log = logSheet_();
    const n = log.getLastRow() - 1;
    if (n < 1) throw new Error('Không thấy giao dịch');
    const rows = log.getRange(2, 1, n, LOG_HEAD.length).getValues();
    const i = rows.findIndex(r => String(r[0]) === id);
    if (i < 0) throw new Error('Không thấy giao dịch');
    const r = rows[i];
    if (r[8] === 'xoá') return { id, da_xoa: true };
    const cell = tabThuChi_().getRange(String(r[7]));
    congVao_(cell, -Number(r[4]));
    const old = cell.getNote();
    cell.setNote((old ? old + '\n' : '') + Utilities.formatDate(new Date(), TZ, 'dd/MM HH:mm') + ' · xoá ' + fmt_(r[4]) + (r[5] ? ' (' + r[5] + ')' : '') + ' (app)');
    log.getRange(i + 2, 9).setValue('xoá');
    return { id, o: String(r[7]) };
  } finally { lock.releaseLock(); }
}

/** Cộng thêm vào ô mà vẫn giữ lịch sử: ô trống → số; ô số → =cũ+mới; ô công thức → nối thêm. */
function congVao_(cell, amt) {
  const f = cell.getFormula();
  const s = (amt < 0 ? '-' : '+') + Math.abs(amt);
  if (f) { cell.setFormula(f + s); return; }
  const v = cell.getValue();
  if (v === '' || v === null) { cell.setValue(amt); return; }
  if (typeof v === 'number') { cell.setFormula('=' + v + s); return; }
  const n = Number(String(v).replace(/[^\d-]/g, ''));
  if (String(v).match(/\d/) && isFinite(n)) { cell.setFormula('=' + n + s); return; }
  throw new Error('Ô ' + cell.getA1Notation() + ' đang chứa chữ ("' + v + '"), app không cộng vào được');
}

/* ============================ DÒ CẤU TRÚC SHEET ============================ */

function tabThuChi_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = PropertiesService.getScriptProperties().getProperty('SHEET_TAB');
  if (name && ss.getSheetByName(name)) return ss.getSheetByName(name);
  const sh = ss.getSheets().find(s => s.getName() !== LOG_TAB && hangThang_(s) > 0);
  if (!sh) throw new Error('Không tìm thấy tab có dòng "Tháng"');
  return sh;
}

function hangThang_(sh) {
  const a = sh.getRange(1, 1, Math.min(sh.getLastRow() || 1, 15), 1).getDisplayValues();
  for (let i = 0; i < a.length; i++) if (norm_(a[i][0]) === 'thang') return i + 1;
  return 0;
}

function thangCua_(s) {
  const m = String(s).match(/(\d{1,2})\s*[\/\-.]\s*(\d{4})/);
  return m ? { m: +m[1], y: +m[2] } : null;
}

/** Tìm cột tháng m/y. Chưa có thì tạo cột mới sau tháng cuối, chép định dạng + công thức tổng. */
function cotThang_(sh, m, y, tao) {
  const hr = hangThang_(sh);
  const last = sh.getLastColumn();
  const head = sh.getRange(hr, 1, 1, last).getDisplayValues()[0];
  let lastMonthCol = 0, lastKey = 0;
  for (let c = 1; c < head.length; c++) {
    const t = thangCua_(head[c]);
    if (!t) continue;
    if (t.m === m && t.y === y) return c + 1;
    const k = t.y * 12 + t.m;
    if (k > lastKey) { lastKey = k; lastMonthCol = c + 1; }
  }
  if (!tao) return 0;
  if (!lastMonthCol) throw new Error('Không thấy cột tháng nào');
  if (y * 12 + m < lastKey) throw new Error('Tháng ' + m + '/' + y + ' không có cột trong sheet');
  let src = lastMonthCol, key = lastKey, col = lastMonthCol;
  // tạo lần lượt từng tháng còn thiếu cho tới tháng cần
  while (key < y * 12 + m) {
    key++;
    col = src + 1;
    if (col <= sh.getLastColumn() && sh.getRange(1, col, sh.getLastRow(), 1).getValues().some(r => r[0] !== '')) sh.insertColumnAfter(src);
    const n = sh.getLastRow();
    sh.getRange(1, src, n, 1).copyTo(sh.getRange(1, col, n, 1));
    const rg = sh.getRange(1, col, n, 1);
    const fs = rg.getFormulas();
    const vals = rg.getValues().map((r, i) => fs[i][0] ? null : r[0]);
    rg.clearNote();
    vals.forEach((v, i) => { if (v !== null && v !== '' && i + 1 !== hr) sh.getRange(i + 1, col).clearContent(); });
    const mm = (key - 1) % 12 + 1, yy = Math.floor((key - 1) / 12);
    const h = sh.getRange(hr, src).getValue();
    if (h instanceof Date) sh.getRange(hr, col).setValue(new Date(yy, mm - 1, 1));
    else sh.getRange(hr, col).setValue(mm + '/' + yy);
    src = col;
  }
  return col;
}

/** Dòng của hạng mục: thu tìm trong khối thu nhập (trên dòng Tổng đầu tiên), chi tìm phía dưới. */
function dongHangMuc_(sh, hm, loai) {
  const hr = hangThang_(sh);
  const a = sh.getRange(1, 1, sh.getLastRow(), 1).getDisplayValues().map(r => norm_(r[0]));
  const want = norm_(hm);
  let endThu = a.findIndex((x, i) => i >= hr && x === 'tong');
  if (endThu < 0) endThu = a.length;
  for (let i = hr; i < a.length; i++) {
    if (a[i] !== want) continue;
    const laThu = i < endThu;
    if ((loai === 'thu') === laThu) return i + 1;
  }
  return 0;
}

function logSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(LOG_TAB);
  if (!sh) {
    sh = ss.insertSheet(LOG_TAB);
    sh.getRange(1, 1, 1, LOG_HEAD.length).setValues([LOG_HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('B:B').setNumberFormat('dd/MM/yyyy HH:mm');
    sh.getRange('E:E').setNumberFormat('#,##0');
    sh.getRange('J:J').setNumberFormat('dd/MM/yyyy HH:mm');
  }
  return sh;
}

function norm_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
}
function fmt_(n) { return Math.round(Number(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ============================ GIÁ CHỨNG KHOÁN / QUỸ ============================ */

/** Thử trong trình soạn thảo: chạy rồi xem Nhật ký thực thi. */
function thuGia() {
  const g = layGia_([{ ma: 'FPT', loai: 'cp' }, { ma: 'E1VFVN30', loai: 'cp' }, { ma: 'DCDS', loai: 'quy' }, { ma: 'VESAF', loai: 'quy' }]);
  Object.keys(g).forEach(k => Logger.log(k + ': ' + (g[k].loi || (g[k].gia + ' đ · ' + g[k].ngay + ' · ' + g[k].nguon + ' · ' + (g[k].chuoi || []).length + ' ngày' + (g[k].ten ? ' · ' + g[k].ten : '')))));
}

function layGia_(list) {
  const out = {}, cache = CacheService.getScriptCache();
  (list || []).slice(0, 12).forEach(it => {
    const ma = String(it.ma || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    if (!ma) return;
    const loai = it.loai === 'quy' ? 'quy' : 'cp', ck = 'gia_' + loai + '_' + ma;
    const hit = cache.get(ck);
    if (hit) { try { out[ma] = JSON.parse(hit); return; } catch (_) { } }
    let r = null;
    try { r = loai === 'quy' ? giaQuy_(ma) : (giaVnd_(ma) || giaTcbs_(ma)); } catch (e) { r = { loi: String(e.message || e).slice(0, 120) }; }
    if (!r) r = { loi: 'Không tìm thấy mã ' + ma };
    out[ma] = r;
    if (!r.loi) cache.put(ck, JSON.stringify(r), 1800);
  });
  return out;
}

function chuoi_(rows) {   // rows: [[yyyy-MM-dd, giá VND], ...] tăng dần
  rows = rows.filter(x => x[1] > 0);
  if (!rows.length) return null;
  const last = rows[rows.length - 1], prev = rows.length > 1 ? rows[rows.length - 2] : last;
  return { gia: last[1], truoc: prev[1], ngay: last[0], chuoi: rows.slice(-130) };
}

function giaVnd_(ma) {
  const to = Math.floor(Date.now() / 1000), from = to - 200 * 86400;
  const r = UrlFetchApp.fetch('https://dchart-api.vndirect.com.vn/dchart/history?resolution=D&symbol=' + ma + '&from=' + from + '&to=' + to,
    { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (r.getResponseCode() !== 200) return null;
  const j = JSON.parse(r.getContentText());
  if (j.s !== 'ok' || !j.t || !j.t.length) return null;
  const rows = j.t.map((t, i) => [Utilities.formatDate(new Date(t * 1000), TZ, 'yyyy-MM-dd'), Math.round(j.c[i] * 1000)]);
  const o = chuoi_(rows); if (o) o.nguon = 'VNDirect'; return o;
}

function giaTcbs_(ma) {
  const to = Math.floor(Date.now() / 1000), from = to - 200 * 86400;
  const r = UrlFetchApp.fetch('https://apipubaws.tcbs.com.vn/stock-insight/v1/stock/bars-long-term?ticker=' + ma + '&type=stock&resolution=D&from=' + from + '&to=' + to,
    { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (r.getResponseCode() !== 200) return null;
  const d = (JSON.parse(r.getContentText()).data || []);
  if (!d.length) return null;
  const rows = d.map(x => [String(x.tradingDate).slice(0, 10), Math.round(x.close < 1000 ? x.close * 1000 : x.close)]);
  const o = chuoi_(rows); if (o) o.nguon = 'TCBS'; return o;
}

/** NAV chứng chỉ quỹ mở qua Fmarket */
function giaQuy_(ma) {
  const H = { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' };
  const c = CacheService.getScriptCache();
  let ds = null; const hc = c.get('fm_list');
  if (hc) try { ds = JSON.parse(hc); } catch (_) { }
  if (!ds) {
    const r = UrlFetchApp.fetch('https://api.fmarket.vn/res/products/filter', { method: 'post', headers: H, muteHttpExceptions: true,
      payload: JSON.stringify({ types: ['NEW_FUND', 'TRADING_FUND'], issuerIds: [], sortOrder: 'DESC', sortField: 'navTo6Months', page: 1, pageSize: 200, isIpo: false, fundAssetTypes: [], bondRemainPeriods: [], searchField: '', isBuyByReward: false, thirdAppIds: [] }) });
    if (r.getResponseCode() !== 200) return { loi: 'Fmarket ' + r.getResponseCode() };
    ds = ((JSON.parse(r.getContentText()).data || {}).rows || []).map(x => ({ id: x.id, ma: String(x.shortName || x.code || '').toUpperCase(), ten: x.name, nav: x.nav }));
    try { c.put('fm_list', JSON.stringify(ds), 21600); } catch (_) { }
  }
  const f = ds.find(x => x.ma.replace(/[^A-Z0-9]/g, '') === ma);
  if (!f) return null;
  const today = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd'), from = Utilities.formatDate(new Date(Date.now() - 200 * 864e5), TZ, 'yyyyMMdd');
  const r2 = UrlFetchApp.fetch('https://api.fmarket.vn/res/product/get-nav-history', { method: 'post', headers: H, muteHttpExceptions: true,
    payload: JSON.stringify({ isAllData: 0, productId: f.id, fromDate: from, toDate: today }) });
  let rows = [];
  if (r2.getResponseCode() === 200) rows = (JSON.parse(r2.getContentText()).data || []).map(x => [String(x.navDate).slice(0, 10), Math.round(x.nav)]).sort((a, b) => a[0] < b[0] ? -1 : 1);
  if (!rows.length && f.nav) rows = [[Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), Math.round(f.nav)]];
  const o = chuoi_(rows); if (o) { o.nguon = 'Fmarket'; o.ten = f.ten; } return o;
}

/* ============================ GEMINI ============================ */

function thuAI() { Logger.log(JSON.stringify(hoiAI_('Thu TB 40tr/tháng, chi 25tr, tích lũy 30%. Chưa có quỹ dự phòng.', ''), null, 1)); }

function hoiAI_(tom, hoi) {
  const key = (PropertiesService.getScriptProperties().getProperty('GEMINI_KEY') || '').trim();
  if (!key) throw new Error('Chưa có GEMINI_KEY trong Script Properties');
  if (!tom) throw new Error('Thiếu số liệu');
  const nen = `Bạn là "Bắp", chú mèo cố vấn tài chính cá nhân của Tuấn (Head of Marketing BĐS ở TP.HCM, thu nhập gồm lương + freelance + ngoài giờ + hoa hồng, đang đầu tư chứng khoán/quỹ VN).
Chỉ dựa trên số liệu được cung cấp, KHÔNG bịa số. Đơn vị tiền: đồng (tr = triệu). Viết tiếng Việt đời thường, thẳng thắn, cụ thể bằng con số, câu ngắn. Không khuyến nghị mua/bán mã cụ thể; nói về phân bổ, rủi ro, kỷ luật. Có thể xưng "Bắp", gọi "Tuấn".`;
  const prompt = hoi
    ? nen + `\n\nSỐ LIỆU:\n${tom.slice(0, 14000)}\n\nCÂU HỎI CỦA TUẤN: ${hoi.slice(0, 600)}\n\nTrả lời trong tra_loi (tối đa 140 từ).`
    : nen + `\n\nSỐ LIỆU:\n${tom.slice(0, 14000)}\n\nHãy phân tích sức khoẻ tài chính hiện tại. Trả về: tong (2–3 câu nhận định tổng quan), diem_manh (2–3 ý), can_cai_thien (2–3 ý), hanh_dong (3 việc cụ thể làm trong 30 ngày tới, mỗi việc kèm vi_sao ngắn), dau_tu (1–2 câu về danh mục đầu tư nếu có, nếu không có thì gợi ý bắt đầu).`;
  const schema = hoi ? { type: 'OBJECT', properties: { tra_loi: { type: 'STRING' } }, required: ['tra_loi'] }
    : { type: 'OBJECT', properties: { tong: { type: 'STRING' }, diem_manh: { type: 'ARRAY', items: { type: 'STRING' } }, can_cai_thien: { type: 'ARRAY', items: { type: 'STRING' } },
      hanh_dong: { type: 'ARRAY', items: { type: 'OBJECT', properties: { viec: { type: 'STRING' }, vi_sao: { type: 'STRING' } }, required: ['viec'] } }, dau_tu: { type: 'STRING' } },
      required: ['tong', 'diem_manh', 'can_cai_thien', 'hanh_dong'] };
  let model = chonModel_(key), loi = '';
  let think = m => /gemini-2\./.test(m) ? { thinkingBudget: 0 } : { thinkingLevel: 'minimal' };
  const t0 = Date.now();
  for (let i = 0; i < 4 && Date.now() - t0 < 100e3; i++) {
    const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'post', headers: { 'x-goog-api-key': key }, contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 4096, responseMimeType: 'application/json', responseSchema: schema, thinkingConfig: think(model) } })
    });
    const code = r.getResponseCode();
    if (code === 200) {
      PropertiesService.getScriptProperties().setProperty('GEMINI_MODEL', model);
      const parts = ((((JSON.parse(r.getContentText()).candidates || [])[0] || {}).content || {}).parts || []);
      return { ai: JSON.parse(parts.map(p => p.text || '').join('')), model: model, luc: new Date().toISOString() };
    }
    loi = model + ' ' + code + ' ' + r.getContentText().slice(0, 120);
    if (code === 400 && /thinking/i.test(r.getContentText())) { think = () => undefined; continue; }
    if (code === 404 || code === 400) { PropertiesService.getScriptProperties().deleteProperty('GEMINI_MODEL'); model = chonModel_(key, true); }
    if (code === 429 || code >= 500) { model = modelKhac_(model); Utilities.sleep(2500 * (i + 1)); }
  }
  throw new Error('Gemini lỗi: ' + loi);
}

function chonModel_(key, moi) {
  const P = PropertiesService.getScriptProperties();
  const cached = P.getProperty('GEMINI_MODEL');
  if (cached && !moi && P.getProperty('GEMINI_ALT')) return cached;
  const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Gemini models ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 150));
  const all = (JSON.parse(r.getContentText()).models || []);
  const ms = all.filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace('models/', ''))
    .filter(n => /flash/.test(n) && !/image|tts|audio|live|embed|thinking-exp|robotics/.test(n));
  const ver = n => { const m = n.match(/gemini-(\d+(?:\.\d+)?)/); return m ? +m[1] : 0; };
  ms.sort((a, b) => (ver(b) - ver(a)) || ((/lite/.test(a) ? 1 : 0) - (/lite/.test(b) ? 1 : 0)) || ((/preview|exp/.test(a) ? 1 : 0) - (/preview|exp/.test(b) ? 1 : 0)) || (a.length - b.length));
  if (!ms.length) throw new Error('Không tìm thấy model Gemini Flash');
  P.setProperty('GEMINI_ALT', JSON.stringify(ms.slice(0, 5)));
  return ms[0];
}
function modelKhac_(cur) {
  let a = []; try { a = JSON.parse(PropertiesService.getScriptProperties().getProperty('GEMINI_ALT') || '[]'); } catch (e) { }
  const i = a.indexOf(cur); return a[(i + 1) % a.length] || cur;
}

