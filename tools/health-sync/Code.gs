/**
 * Học viện · tự kéo số sức khoẻ từ Google Health lúc 9h và 21h mỗi ngày.
 * Ghi vào đúng tài liệu Firestore mà app Học viện / HSK đang dùng (users/{UID}, trường s → acad.health).
 * Chạy 1 lần hàm setup() để tạo lịch; chạy pull() để thử ngay.
 */
const PROJECT = 'hsk-app-f5201';
const API = 'https://health.googleapis.com/v4/users/me/dataTypes/';
const TZ = 'Asia/Ho_Chi_Minh';

function setup() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  [['am', 9, 0], ['coach', 17, 0], ['pm', 21, 0], ['newsPush', 8, 30]].forEach(([f, h, m]) => ScriptApp.newTrigger(f).timeBased().atHour(h).nearMinute(m).everyDays(1).inTimezone(TZ).create());
  ScriptApp.newTrigger('weekly').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(20).nearMinute(0).inTimezone(TZ).create();
  try { pull(); } catch (e) { console.log('pull: ' + e.message); }
  try { news(); } catch (e) { console.log('news: ' + e.message); }
}

function uid_() {
  const u = PropertiesService.getScriptProperties().getProperty('UID');
  if (!u) throw new Error('Thiếu UID trong Script Properties');
  return u;
}
/* Google Health API từ chối token có kèm scope khác (Firestore, script…), nên dùng token riêng chỉ có scope Health. */
const HSCOPES = ['activity_and_fitness', 'sleep', 'health_metrics_and_measurements'].map(s => 'https://www.googleapis.com/auth/googlehealth.' + s + '.readonly');
const redirect_ = () => 'https://script.google.com/macros/d/' + ScriptApp.getScriptId() + '/usercallback';
function healthLink() {
  const id = PropertiesService.getScriptProperties().getProperty('HEALTH_CLIENT_ID');
  if (!id) throw new Error('Thiếu HEALTH_CLIENT_ID trong Script Properties');
  const state = ScriptApp.newStateToken().withMethod('healthCallback').withTimeout(3600).createToken();
  const q = { client_id: id, redirect_uri: redirect_(), response_type: 'code', scope: HSCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', state };
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + Object.keys(q).map(k => k + '=' + encodeURIComponent(q[k])).join('&');
  console.log('MO_LINK_NAY: ' + url);
  return url;
}
function healthCallback(e) {
  const p = PropertiesService.getScriptProperties();
  if (!e.parameter.code) return HtmlService.createHtmlOutput('<h3>Chưa cấp quyền: ' + (e.parameter.error || '') + '</h3>');
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', { method: 'post', muteHttpExceptions: true, payload: {
    code: e.parameter.code, client_id: p.getProperty('HEALTH_CLIENT_ID'), client_secret: p.getProperty('HEALTH_CLIENT_SECRET'), redirect_uri: redirect_(), grant_type: 'authorization_code' } });
  const j = JSON.parse(r.getContentText() || '{}');
  if (!j.refresh_token) return HtmlService.createHtmlOutput('<h3>Lỗi đổi mã: ' + r.getContentText().slice(0, 300) + '</h3>');
  p.setProperty('HEALTH_REFRESH', j.refresh_token);
  CacheService.getScriptCache().put('htok', j.access_token, 3000);
  let msg = '';
  try { pull(); msg = 'Đã kéo dữ liệu vào Học viện.'; } catch (err) { msg = 'Kéo thử lỗi: ' + err.message; }
  return HtmlService.createHtmlOutput('<div style="font:16px system-ui;padding:24px"><h2>✅ Đã nối Google Health với Học viện</h2><p>' + msg + '</p><p>Từ giờ script tự kéo số lúc 9h và 21h. Có thể đóng tab này.</p></div>');
}
function hTok_() {
  const c = CacheService.getScriptCache(), t = c.get('htok'); if (t) return t;
  const p = PropertiesService.getScriptProperties(), rt = p.getProperty('HEALTH_REFRESH');
  if (!rt) throw new Error('Chưa nối Google Health: chạy healthLink() rồi mở link trong nhật ký');
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', { method: 'post', muteHttpExceptions: true, payload: {
    client_id: p.getProperty('HEALTH_CLIENT_ID'), client_secret: p.getProperty('HEALTH_CLIENT_SECRET'), refresh_token: rt, grant_type: 'refresh_token' } });
  const j = JSON.parse(r.getContentText() || '{}');
  if (!j.access_token) throw new Error('Làm mới token Health lỗi: ' + r.getContentText().slice(0, 160));
  c.put('htok', j.access_token, Math.max(60, (j.expires_in || 3600) - 300));
  return j.access_token;
}
function call_(path, body) {
  const r = UrlFetchApp.fetch(API + path, {
    method: body ? 'post' : 'get', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + hTok_() },
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
  const DAYS = 30, now = new Date(), start = new Date(now.getTime() - (DAYS - 1) * 864e5), end = new Date(now.getTime() + 864e5);
  const days = {}, errs = [], peek = {}, day = k => days[k] || (days[k] = {});
  const range = { start: civ_(start), end: civ_(end) };
  const tryIt = (name, fn) => { try { fn(); } catch (e) { errs.push(name + ': ' + e.message); } };
  try { hTok_(); } catch (e) { save_({}, [e.message]); console.log(e.message); return; }
  const num = (o, keys, re) => { for (const k of keys) if (o && o[k] != null && !isNaN(+o[k])) return +o[k]; return re ? deepNum_(o, re) : null; };
  const roll = (type, out, keys, re, f) => tryIt(out, () => {
    const j = call_(type + '/dataPoints:dailyRollUp', { range, windowSizeDays: 1 }), a = j.rollupDataPoints || [];
    if (a[0]) peek[out] = JSON.stringify(a[0]).slice(0, 260);
    a.forEach(p => { const k = civKey_(p.civilStartTime); if (!k) return; const inner = Object.keys(p).filter(x => !/civil|time|interval/i.test(x)).map(x => p[x])[0] || p; const v = num(inner, keys, re); if (v != null) day(k)[out] = f ? f(v) : Math.round(v); });
  });
  roll('steps', 'steps', ['countSum', 'count'], /count|sum|value/i);
  tryIt('azm', () => {
    const j = call_('active-zone-minutes/dataPoints:dailyRollUp', { range, windowSizeDays: 1 }), a = j.rollupDataPoints || [];
    a.forEach(p => { const k = civKey_(p.civilStartTime), o = p.activeZoneMinutes || {}; if (!k) return;
      const fb = +o.sumInFatBurnHeartZone || 0, ca = +o.sumInCardioHeartZone || 0, pk = +o.sumInPeakHeartZone || 0;
      day(k).azm = Math.round(fb + 2 * (ca + pk)); day(k).hz = { l: Math.round(fb), m: Math.round(ca), p: Math.round(pk) }; });
  });
  roll('total-calories', 'cal', ['kcalSum', 'caloriesKcalSum'], /kcal|calor|sum|value/i);
  roll('weight', 'wt', ['weightGramsAvg', 'weightGramsLast', 'weightGrams'], /weight|grams|avg|mean/i, v => Math.round(v / 100) / 10);
  tryIt('hourly', () => {
    const st = new Date(key_(now) + 'T00:00:00+07:00'), arr = new Array(24).fill(0);
    const j = call_('steps/dataPoints:rollUp', { range: { startTime: st.toISOString(), endTime: now.toISOString() }, windowSize: '3600s' });
    (j.rollupDataPoints || []).forEach(p => { const h = +Utilities.formatDate(new Date(p.startTime), TZ, 'H'); arr[h] = Math.round(+((p.steps || {}).countSum) || 0); });
    day(key_(now)).hourly = arr;
  });
  tryIt('hrH', () => {
    const st = new Date(key_(now) + 'T00:00:00+07:00'), arr = new Array(24).fill(null);
    const j = call_('heart-rate/dataPoints:rollUp', { range: { startTime: st.toISOString(), endTime: now.toISOString() }, windowSize: '3600s' });
    (j.rollupDataPoints || []).forEach(p => { const h = +Utilities.formatDate(new Date(p.startTime), TZ, 'H');
      const k = Object.keys(p).find(x => !/time|interval|civil/i.test(x)), o = (k && p[k]) || {};
      const v = +(o.beatsPerMinuteAvg || o.avgBeatsPerMinute || o.beatsPerMinuteMean || deepNum_(o, /avg|mean|average/i) || 0);
      if (v > 30 && v < 220) arr[h] = Math.round(v); });
    if (arr.some(x => x)) day(key_(now)).hrH = arr;
  });
  tryIt('sleep', () => {
    const f = encodeURIComponent('sleep.interval.civil_end_time >= "' + key_(start) + '" AND sleep.interval.civil_end_time < "' + key_(end) + '"');
    let pageToken = '', n = 0;
    do {
      const j = call_('sleep/dataPoints:reconcile?pageSize=25&filter=' + f + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''));
      (j.dataPoints || []).forEach(dp => {
        const s = dp.sleep; if (!s || !s.interval || (s.metadata && s.metadata.mainSleep === false)) return;
        const d = day(key_(new Date(s.interval.endTime))), sm = s.summary || {};
        d.sleepMin = +sm.minutesAsleep || 0; d.inBed = +sm.minutesInSleepPeriod || 0; d.toSleep = +sm.minutesToFallAsleep || 0;
        d.bed = hm_(s.interval.startTime); d.wake = hm_(s.interval.endTime);
        (sm.stagesSummary || []).forEach(st => { const t = String(st.type || '').toLowerCase(); if (['deep', 'rem', 'light', 'awake'].includes(t)) d[t] = +st.minutes || 0; });
      });
      pageToken = j.nextPageToken || ''; n++;
    } while (pageToken && n < 4);
  });
  const daily = (type, field, out, keys, re, f) => tryIt(out, () => {
    let j = null, last = null;
    const snake = field.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
    for (const flt of [snake + '.date >= "' + key_(start) + '"', field + '.date >= "' + key_(start) + '"']) {
      try { j = call_(type + '/dataPoints?pageSize=40&filter=' + encodeURIComponent(flt)); break; } catch (e) { last = e; }
    }
    if (!j) throw last;
    const a = j.dataPoints || []; if (a[0]) peek[out] = JSON.stringify(a[0]).slice(0, 260);
    a.forEach(dp => { const o = dp[field] || dp, k = civKey_(o.date); if (!k) return; const v = f ? f(o) : num(o, keys, re); if (v != null && v !== false) day(k)[out] = v; });
  });
  daily('daily-resting-heart-rate', 'dailyRestingHeartRate', 'rhr', ['beatsPerMinute'], /beats|bpm/i, o => { const v = num(o, ['beatsPerMinute'], /beats|bpm/i); return v ? Math.round(v) : null; });
  daily('daily-heart-rate-variability', 'dailyHeartRateVariability', 'hrv', null, null, o => { const v = num(o, ['averageHeartRateVariabilityMilliseconds', 'deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds'], /average|rmssd|millis/i); return v ? Math.round(v) : null; });
  daily('daily-oxygen-saturation', 'dailyOxygenSaturation', 'spo2', null, null, o => { const v = num(o, ['averagePercentage'], /average|percent/i); return v ? Math.round(v * 10) / 10 : null; });
  daily('daily-respiratory-rate', 'dailyRespiratoryRate', 'br', null, null, o => { const v = num(o, ['breathsPerMinute'], /breaths/i); return v ? Math.round(v * 10) / 10 : null; });
  daily('daily-sleep-temperature-derivations', 'dailySleepTemperatureDerivations', 'tempD', null, null, o => { const n = num(o, ['nightlyTemperatureCelsius']), b = num(o, ['baselineTemperatureCelsius']); return n != null && b != null ? Math.round((n - b) * 100) / 100 : null; });
  daily('daily-vo2-max', 'dailyVo2Max', 'vo2', null, null, o => { const v = num(o, ['vo2Max'], /vo2/i); return v ? Math.round(v * 10) / 10 : null; });
  daily('daily-vo2-max', 'dailyVo2Max', 'vo2lvl', null, null, o => o.cardioFitnessLevel ? String(o.cardioFitnessLevel).replace('CARDIO_FITNESS_LEVEL_', '') : null);
  tryIt('ex', () => {
    const s14 = new Date(now.getTime() - 13 * 864e5); let j = null, last = null;
    for (const flt of ['exercise.interval.civil_start_time >= "' + key_(s14) + '"', 'exercise.interval.start_time >= "' + s14.toISOString() + '"', '']) {
      try { j = call_('exercise/dataPoints' + (flt ? ':reconcile?pageSize=30&filter=' + encodeURIComponent(flt) : '?pageSize=30')); break; } catch (e) { last = e; }
    }
    if (!j) throw last;
    const a = j.dataPoints || [];
    if (a[0]) peek.ex = JSON.stringify(a[0]).slice(0, 300);
    a.forEach(dp => { const e = dp.exercise; if (!e || !e.interval) return; const k = key_(new Date(e.interval.endTime)), m = e.metricsSummary || {};
      const d = day(k); d.ex = d.ex || [];
      d.ex.push({ t: e.displayName || e.exerciseType || '', s: hm_(e.interval.startTime), min: Math.round((parseFloat(e.activeDuration) || ((new Date(e.interval.endTime) - new Date(e.interval.startTime)) / 1000)) / 60), kcal: Math.round(+m.caloriesKcal || 0), hr: Math.round(+m.averageHeartRateBeatsPerMinute || 0), km: Math.round((+m.distanceMillimeters || 0) / 1e4) / 100, azm: +m.activeZoneMinutes || 0 }); });
  });
  Object.keys(days).forEach(k => { if (days[k].ex) days[k].ex.sort((a, b) => a.s < b.s ? -1 : 1); });
  const stamp = Date.now();
  Object.keys(days).forEach(k => { days[k].src = 'auto'; days[k].at = stamp; });
  save_(days, errs);
  console.log(JSON.stringify({ n: Object.keys(days).length, errs }));
  // không ghi số liệu sức khoẻ vào log (riêng tư)
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
    H.auto = { last: Date.now(), err: (!Object.keys(days).length && errs.length) ? errs[0].slice(0, 120) : '', errs: errs.map(e => e.slice(0, 90)).slice(0, 12) };
    Object.keys(H.days).sort().slice(0, -45).forEach(k => delete H.days[k]);
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
