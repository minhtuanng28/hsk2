/**
 * 17h: gợi ý buổi tập (bơi / chạy) theo độ hồi phục + gửi thông báo đẩy lên điện thoại (Firebase Cloud Messaging).
 * Thông báo đẩy cũng dùng cho bản tin 8:30, sức khoẻ 9h và tổng kết 21h.
 */
const APP_URL = 'https://minhtuanng28.github.io/hsk2/academy/';
function docUrl_() { return 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/users/' + uid_(); }
function readAcad_() {
  const g = UrlFetchApp.fetch(docUrl_(), { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (g.getResponseCode() !== 200) throw new Error('Firestore get ' + g.getResponseCode());
  const doc = JSON.parse(g.getContentText()), st = doc.fields && doc.fields.s ? JSON.parse(doc.fields.s.stringValue) : {};
  return st.acad || {};
}
function mutate_(fn) {
  const url = docUrl_(), head = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  for (let a = 0; a < 4; a++) {
    const g = UrlFetchApp.fetch(url, { headers: head, muteHttpExceptions: true });
    if (g.getResponseCode() !== 200) throw new Error('Firestore get ' + g.getResponseCode());
    const doc = JSON.parse(g.getContentText());
    const st = doc.fields && doc.fields.s ? JSON.parse(doc.fields.s.stringValue) : { v: 1, cards: {}, days: {}, newLog: {}, updated: 0 };
    const acad = st.acad && st.acad.v === 1 ? st.acad : { v: 1 };
    fn(acad);
    acad.updatedAt = Math.max(Date.now(), (acad.updatedAt || 0) + 1);
    st.acad = acad; st.updated = Math.max(Date.now(), (st.updated || 0) + 1);
    const body = { fields: { s: { stringValue: JSON.stringify(st) }, updated: { timestampValue: new Date().toISOString() } } };
    const p = UrlFetchApp.fetch(url + '?updateMask.fieldPaths=s&updateMask.fieldPaths=updated&currentDocument.updateTime=' + encodeURIComponent(doc.updateTime),
      { method: 'patch', contentType: 'application/json', headers: head, payload: JSON.stringify(body), muteHttpExceptions: true });
    if (p.getResponseCode() === 200) return;
    Utilities.sleep(1500);
  }
}
/* ---- thông báo đẩy ---- */
function push_(title, body, room, acadIn) {
  const acad = acadIn || readAcad_(), toks = ((acad.push || {}).tokens || []).map(x => x.t).filter(Boolean);
  if (!toks.length) { console.log('push: chưa có thiết bị nào bật thông báo'); return 0; }
  const dead = []; let ok = 0;
  toks.forEach(t => {
    const r = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + PROJECT + '/messages:send', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      payload: JSON.stringify({ message: { token: t, data: { title, body, link: APP_URL + (room ? '?room=' + room : ''), tag: room || 'acad' },
        webpush: { headers: { Urgency: 'high', TTL: '21600' } } } })
    });
    const c = r.getResponseCode();
    if (c === 200) ok++; else { console.log('push ' + c + ' ' + r.getContentText().slice(0, 160)); if (c === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(r.getContentText())) dead.push(t); }
  });
  if (dead.length) mutate_(a => { a.push = a.push || {}; a.push.tokens = (a.push.tokens || []).filter(x => dead.indexOf(x.t) < 0); });
  return ok;
}
function testPush() { console.log('sent ' + push_('Học viện · thử thông báo', 'Bắp chào Tuấn! Thông báo đẩy đã hoạt động 🐱', 'health')); }
/* ---- số liệu ---- */
const dk_ = d => Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
function series_(H, key, n, off) { const a = []; for (let i = n - 1 + (off || 0); i >= (off || 0); i--) { const d = H.days[dk_(new Date(Date.now() - i * 864e5))] || {}; a.push(typeof d[key] === 'number' ? d[key] : null); } return a; }
function base_(H, key) { const a = series_(H, key, 30, 1).filter(v => v != null); if (a.length < 4) return null; const m = a.reduce((s, v) => s + v, 0) / a.length; const sd = Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length); return { m, sd: Math.max(sd, Math.abs(m) * .03) }; }
function state_(H) {
  const today = H.days[dk_(new Date())] || {}, yd = H.days[dk_(new Date(Date.now() - 864e5))] || {};
  const prof = Object.assign({ by: 2001, h: 171, w: 68 }, (H.cfg || {}).prof || {}), age = new Date().getFullYear() - prof.by;
  const hb = base_(H, 'hrv'), rb = base_(H, 'rhr');
  const zH = today.hrv && hb ? (today.hrv - hb.m) / hb.sd : null, zR = today.rhr && rb ? (today.rhr - rb.m) / rb.sd : null;
  const goal = (H.cfg || {}).goalSleep || 480, sl = today.sleepMin || null;
  const parts = [];
  if (sl) parts.push([Math.min(1, sl / goal) * 100, .45]);
  if (zH != null) parts.push([Math.max(0, Math.min(100, 68 + zH * 16)), .33]);
  if (zR != null) parts.push([Math.max(0, Math.min(100, 68 - zR * 16)), .22]);
  let R = parts.length ? Math.round(parts.reduce((s, p) => s + p[0] * p[1], 0) / parts.reduce((s, p) => s + p[1], 0)) : null;
  if (R != null && today.tempD != null && today.tempD >= .5) R = Math.max(1, R - 12);
  const az = series_(H, 'azm', 28).map(v => v || 0), acute = az.slice(-7).reduce((a, b) => a + b, 0) / 7, chronic = az.reduce((a, b) => a + b, 0) / 28;
  const ratio = chronic > 2 ? acute / chronic : null;
  const rest = rb ? Math.round(rb.m) : (today.rhr || 62), mx = Math.round(208 - .7 * age), z = p => Math.round(rest + (mx - rest) * p);
  let lastEx = null; for (let i = 0; i < 7 && !lastEx; i++) { const d = H.days[dk_(new Date(Date.now() - i * 864e5))]; if (d && d.ex && d.ex.length) lastEx = d.ex[d.ex.length - 1]; }
  return { today, yd, R, zH, zR, sl, ratio, z, mx, lastEx, hb, rb };
}
function plan_(H) {
  const s = state_(H), t = s.today, lastRun = s.lastEx && /run|chạy/i.test(s.lastEx.t || ''), lastSwim = s.lastEx && /swim|bơi/i.test(s.lastEx.t || '');
  const z2 = s.z(.6) + '–' + s.z(.7), z1 = s.z(.4) + '–' + s.z(.59), z4 = s.z(.8) + '–' + s.z(.9);
  const why = [];
  if (s.sl) why.push('ngủ ' + Math.floor(s.sl / 60) + 'h' + ('0' + s.sl % 60).slice(-2));
  if (s.zH != null) why.push('HRV ' + t.hrv + (s.zH < -.8 ? '↓' : s.zH > .8 ? '↑' : '≈'));
  if (s.zR != null) why.push('nhịp nghỉ ' + t.rhr + (s.zR > .8 ? '↑' : s.zR < -.8 ? '↓' : '≈'));
  if (s.ratio != null) why.push('tải ×' + s.ratio.toFixed(2));
  let level, title, body;
  const sick = (t.tempD != null && t.tempD >= .5) || (s.zR != null && s.zH != null && s.zR > 1.5 && s.zH < -1.5);
  if (sick) { level = 0; title = 'Hôm nay nên nghỉ'; body = 'Cơ thể có dấu hiệu căng (nhiệt da/nhịp nghỉ/HRV lệch). Chỉ đi bộ nhẹ 20′, giãn cơ, ngủ sớm.'; }
  else if ((s.R != null && s.R < 50) || (s.sl && s.sl < 360) || (s.ratio != null && s.ratio > 1.5)) {
    level = 1; title = 'Tập nhẹ để hồi phục';
    body = lastSwim ? 'Chạy chậm 25–30′ ở nhịp ' + z1 + ' bpm (nói chuyện được), rồi giãn cơ 10′.' : 'Bơi thả lỏng 20–30′ (ếch/sải chậm, nghỉ thoải mái), không ép nhịp.'; }
  else if ((s.R != null && s.R < 70) || (s.ratio != null && s.ratio > 1.3)) {
    level = 2; title = 'Tập vừa · nền sức bền';
    body = lastRun ? 'Bơi đều 35–40′: 4×200m vừa sức, nghỉ 30″ giữa các lượt.' : 'Chạy Z2 35–45′ ở nhịp ' + z2 + ' bpm, giữ đều, cuối buổi 4×20″ tăng tốc nhẹ.'; }
  else {
    level = 3; const heavyYd = (s.yd.azm || 0) > 45;
    if (heavyYd) { title = 'Tập vừa–nặng'; body = lastRun ? 'Bơi 40′ có 8×50m nhanh (nghỉ 30″) xen bơi chậm.' : 'Chạy tempo 20′ ở ~' + s.z(.75) + ' bpm, khởi động và thả lỏng mỗi phần 10′.'; }
    else { title = 'Sung sức · tập nặng được'; body = lastRun ? 'Bơi interval: 10×100m nhanh, nghỉ 20″ (khởi động 300m).' : 'Chạy interval 6×3′ ở ' + z4 + ' bpm, nghỉ chạy chậm 2′ giữa các hiệp.'; }
  }
  return { at: Date.now(), date: dk_(new Date()), level, title, body, why: why.join(' · '), R: s.R };
}
function briefAm_(H) {
  const s = state_(H), t = s.today, p = [];
  if (s.sl) p.push('Đêm qua ngủ ' + Math.floor(s.sl / 60) + 'h' + ('0' + s.sl % 60).slice(-2));
  if (t.hrv) p.push('HRV ' + t.hrv + (s.zH != null ? (s.zH < -.8 ? '↓' : s.zH > .8 ? '↑' : '') : ''));
  if (t.rhr) p.push('nhịp nghỉ ' + t.rhr);
  if (s.R != null) p.push('sẵn sàng ' + s.R);
  const tip = s.R == null ? 'Mở Quầy sức khoẻ để xem chi tiết.' : s.R >= 75 ? 'Ngày sung sức: dồn việc khó vào buổi sáng.' : s.R >= 55 ? 'Nhịp ổn: 2–3 Pomodoro, nghỉ đúng giờ.' : 'Cần hồi phục: việc nhẹ, uống đủ nước, ngủ sớm.';
  return (p.length ? p.join(' · ') + '. ' : '') + tip;
}
function briefPm_(H) {
  const t = H.days[dk_(new Date())] || {}, goal = (H.cfg || {}).goalSteps || 8000, p = [];
  p.push('Hôm nay ' + (t.steps || 0).toLocaleString('vi-VN') + '/' + goal.toLocaleString('vi-VN') + ' bước');
  if (t.azm) p.push(t.azm + ' phút vận động');
  const c = H.coach && H.coach.date === dk_(new Date()) ? H.coach : null;
  return p.join(' · ') + '. ' + ((t.steps || 0) < goal * .6 ? 'Đi bộ 10–15′ trước khi ngủ nhé. ' : '') + 'Tắt màn hình sớm 30′ để ngủ ngon.';
}
/* ---- các mốc tự động ---- */
function am() { try { pull(); } catch (e) { console.log(e.message); } const a = readAcad_(); push_('🌅 Sức khoẻ sáng nay', briefAm_(a.health || { days: {} }), 'health', a); }
function coach() {
  try { pull(); } catch (e) { console.log(e.message); }
  let pl = null; mutate_(a => { const H = a.health = a.health || { days: {} }; H.days = H.days || {}; pl = plan_(H); H.coach = pl; });
  push_('🏃 17h · ' + pl.title, pl.body + (pl.why ? ' (' + pl.why + ')' : ''), 'health');
  console.log('coach: level ' + pl.level);
}
function pm() { try { pull(); } catch (e) { console.log(e.message); } const a = readAcad_(); push_('🌙 Tổng kết tối nay', briefPm_(a.health || { days: {} }), 'health', a); }
function newsPush() { news(); const a = readAcad_(), n = a.news; if (n && n.items) push_('📰 Quầy báo sáng · ' + n.items.length + ' tin', n.head || n.items.slice(0, 2).map(x => x.t).join(' · '), 'news', a); }
