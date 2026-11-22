/**
 * Học viện · tự kéo số sức khoẻ từ Google Health lúc 9h và 21h mỗi ngày.
 * Ghi vào đúng tài liệu Firestore mà app Học viện / HSK đang dùng (users/{UID}, trường s → acad.health).
 * Chạy 1 lần hàm setup() để tạo lịch; chạy pull() để thử ngay.
 */
const PROJECT = 'hsk-app-f5201';
const API = 'https://health.googleapis.com/v4/users/me/dataTypes/';
const TZ = 'Asia/Ho_Chi_Minh';

function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  [9, 21].forEach(h => ScriptApp.newTrigger('pull').timeBased().atHour(h).nearMinute(0).everyDays(1).inTimezone(TZ).create());
  pull();
}

function uid_() {
  const u = PropertiesService.getScriptProperties().getProperty('UID');
  if (!u) throw new Error('Thiếu UID trong Script Properties');
  return u;
}
function call_(path, body) {
  const r = UrlFetchApp.fetch(API + path, {
    method: body ? 'post' : 'get', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: body ? JSON.stringify(body) : undefined
  });
  const code = r.getResponseCode(), txt = r.getContentText();
  if (code >= 300) throw new Error(path.split('/')[0] + ' ' + code + ' ' + txt.slice(0, 180));
  return JSON.parse(txt || '{}');
}
const pad_ = n => String(n).padStart(2, '0');
const key_ = d => Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
const civ_ = d => { const [y, m, dd] = key_(d).split('-').map(Number); return { date: { year: y, month: m, day: dd }, time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 } }; };
const civKey_ = c => { const d = c && (c.date || c); if (!d) return null; if (typeof d === 'string') return d.slice(0, 10); return d.year + '-' + pad_(d.month) + '-' + pad_(d.day); };
const hm_ = iso => Utilities.formatDate(new Date(iso), TZ, 'HH:mm');
function deepNum_(o, re) {
  const skip = /date|time|offset|year|month|day|hour|minute|second|nano/i; let f = null;
  (function w(x, k) { if (f != null || x == null) return; if (typeof x === 'number' || (typeof x === 'string' && /^-?\d+(\.\d+)?$/.test(x))) { if (k && re.test(k) && !skip.test(k)) f = +x; return; } if (typeof x === 'object') for (const kk in x) w(x[kk], kk); })(o, '');
  return f;
}

function pull() {
  const now = new Date(), start = new Date(now.getTime() - 6 * 864e5), end = new Date(now.getTime() + 864e5);
  const days = {}, errs = [], day = k => days[k] || (days[k] = {});
  const range = { start: civ_(start), end: civ_(end) };
  const tryIt = (name, fn) => { try { fn(); } catch (e) { errs.push(name + ': ' + e.message); } };
  tryIt('steps', () => { (call_('steps/dataPoints:dailyRollUp', { range, windowSizeDays: 1 }).rollupDataPoints || []).forEach(p => { const k = civKey_(p.civilStartTime); if (k) day(k).steps = Math.round(deepNum_(p.steps || p, /countSum|count|sum|value/i) || 0); }); });
  tryIt('azm', () => { (call_('active-zone-minutes/dataPoints:dailyRollUp', { range, windowSizeDays: 1 }).rollupDataPoints || []).forEach(p => { const k = civKey_(p.civilStartTime), v = deepNum_(p.activeZoneMinutes || p, /sum|minutes|value|total/i); if (k && v != null) day(k).azm = Math.round(v); }); });
  tryIt('sleep', () => {
    const f = encodeURIComponent('sleep.interval.civil_end_time >= "' + key_(start) + '" AND sleep.interval.civil_end_time < "' + key_(end) + '"');
    (call_('sleep/dataPoints:reconcile?pageSize=25&filter=' + f).dataPoints || []).forEach(dp => {
      const s = dp.sleep; if (!s || !s.interval || (s.metadata && s.metadata.mainSleep === false)) return;
      const d = day(key_(new Date(s.interval.endTime))), sm = s.summary || {};
      d.sleepMin = +sm.minutesAsleep || 0; d.inBed = +sm.minutesInSleepPeriod || 0; d.bed = hm_(s.interval.startTime); d.wake = hm_(s.interval.endTime);
      (sm.stagesSummary || []).forEach(st => { const t = String(st.type || '').toLowerCase(); if (['deep', 'rem', 'light', 'awake'].includes(t)) d[t] = +st.minutes || 0; });
    });
  });
  const daily = (type, field, re, out) => tryIt(out, () => {
    let j = null, last = null;
    for (const f of [field + '.date >= "' + key_(start) + '"', field.replace(/[A-Z]/g, m => '_' + m.toLowerCase()) + '.date >= "' + key_(start) + '"']) {
      try { j = call_(type + '/dataPoints?pageSize=10&filter=' + encodeURIComponent(f)); break; } catch (e) { last = e; }
    }
    if (!j) throw last;
    (j.dataPoints || []).forEach(dp => { const o = dp[field] || dp, k = civKey_(o.date), v = deepNum_(o, re); if (k && v) day(k)[out] = Math.round(v); });
  });
  daily('daily-resting-heart-rate', 'dailyRestingHeartRate', /beats|bpm|rate|value/i, 'rhr');
  daily('daily-heart-rate-variability', 'dailyHeartRateVariability', /rmssd|millis|average|value/i, 'hrv');
  const stamp = Date.now();
  Object.keys(days).forEach(k => { days[k].src = 'auto'; days[k].at = stamp; });
  save_(days, errs);
  console.log(JSON.stringify({ days, errs }));
}

function save_(days, errs) {
  const url = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/users/' + uid_();
  const head = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  for (let attempt = 0; attempt < 4; attempt++) {
    const g = UrlFetchApp.fetch(url, { headers: head, muteHttpExceptions: true });
    if (g.getResponseCode() !== 200) throw new Error('Firestore get ' + g.getResponseCode() + ' ' + g.getContentText().slice(0, 200));
    const doc = JSON.parse(g.getContentText());
    const st = doc.fields && doc.fields.s ? JSON.parse(doc.fields.s.stringValue) : { v: 1, cards: {}, days: {}, newLog: {}, updated: 0 };
    const acad = st.acad && st.acad.v === 1 ? st.acad : { v: 1 };
    const H = acad.health = acad.health || {};
    H.days = H.days || {};
    Object.keys(days).forEach(k => { H.days[k] = Object.assign({}, H.days[k] || {}, days[k]); });
    H.auto = { last: Date.now(), err: errs.length === 5 ? errs[0].slice(0, 120) : '' };
    acad.updatedAt = Math.max(Date.now(), (acad.updatedAt || 0) + 1);
    st.acad = acad; st.updated = Math.max(Date.now(), (st.updated || 0) + 1);
    const body = { fields: { s: { stringValue: JSON.stringify(st) }, updated: { timestampValue: new Date().toISOString() } } };
    const p = UrlFetchApp.fetch(url + '?updateMask.fieldPaths=s&updateMask.fieldPaths=updated&currentDocument.updateTime=' + encodeURIComponent(doc.updateTime), {
      method: 'patch', contentType: 'application/json', headers: head, payload: JSON.stringify(body), muteHttpExceptions: true
    });
    if (p.getResponseCode() === 200) return;
    if (p.getResponseCode() !== 400 && p.getResponseCode() !== 409 && p.getResponseCode() !== 412) throw new Error('Firestore write ' + p.getResponseCode() + ' ' + p.getContentText().slice(0, 200));
    Utilities.sleep(1500);
  }
  throw new Error('Firestore busy, thử lại sau');
}
