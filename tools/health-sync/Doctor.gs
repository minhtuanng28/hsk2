/**
 * Bác sĩ AI: web app nhận câu hỏi từ Học viện / app Sức khoẻ, xác thực đúng tài khoản Firebase của Tuấn,
 * ghép số liệu sức khoẻ làm ngữ cảnh rồi hỏi Gemini. Khoá Gemini chỉ nằm ở Script Properties.
 */
const FB_WEB_KEY = 'AIzaSyCzG2TNB2fwUSUDycsxQ8a2D1GaWzVHl28'; // khoá web công khai của Firebase (không phải bí mật)
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { return json_({ ok: true, service: 'hoc-vien-doctor' }); }
function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const r = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FB_WEB_KEY, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: String(req.idToken || '') }), muteHttpExceptions: true });
    const u = r.getResponseCode() === 200 ? (JSON.parse(r.getContentText()).users || [])[0] : null;
    if (!u || u.localId !== uid_()) return json_({ error: 'auth', msg: 'Phiên đăng nhập không hợp lệ hoặc không phải chủ tài khoản.' });
    const c = CacheService.getScriptCache(), hk = 'doc' + Utilities.formatDate(new Date(), TZ, 'yyyyMMddHH'), n = +(c.get(hk) || 0);
    if (n >= 60) return json_({ error: 'rate', msg: 'Đã hỏi nhiều trong giờ này, thử lại sau ít phút nhé.' });
    c.put(hk, String(n + 1), 3700);
    if (req.action === 'chat') return json_(doctorChat_(req.messages || []));
    return json_({ error: 'action' });
  } catch (err) { return json_({ error: 'server', msg: String(err.message || err).slice(0, 200) }); }
}
const DOCTOR_SYS = [
  'Bạn là "Bác sĩ AI" trong app sức khoẻ cá nhân của Tuấn (nam, sống ở TP.HCM, làm marketing, hay bơi và chạy bộ sau giờ làm).',
  'Vai trò: trợ lý sức khoẻ & huấn luyện dựa trên số liệu đồng hồ Fitbit (Google Health) được cung cấp bên dưới. Trả lời bằng tiếng Việt, ngắn gọn, thân thiện, đi thẳng vào ý, dùng số liệu cụ thể của Tuấn khi liên quan.',
  'Quy tắc an toàn: bạn không phải bác sĩ thật, không chẩn đoán bệnh, không kê thuốc kê đơn hay liều thuốc. Có thể giải thích ý nghĩa chỉ số, xu hướng, nguyên nhân thường gặp và việc nên làm (ngủ, tập, ăn uống, nước, nghỉ ngơi). Khi chỉ số/triệu chứng đáng lo hoặc kéo dài, khuyên đi khám và nói nên khám chuyên khoa nào.',
  'Nếu có dấu hiệu khẩn cấp (đau/tức ngực, khó thở, ngất, yếu/liệt nửa người, nói khó, nôn ra máu, sốt cao co giật, SpO2 < 92% kèm khó thở, ý nghĩ làm hại bản thân): bảo gọi 115 hoặc đến cấp cứu ngay, trước mọi lời khuyên khác.',
  'Số liệu đồng hồ là ước tính, có thể sai; nói rõ khi dữ liệu thiếu. Không bịa số. Định dạng: đoạn ngắn, gạch đầu dòng khi liệt kê, tối đa ~200 chữ trừ khi được hỏi chi tiết.'
].join('\n');
function doctorCtx_() {
  const a = readAcad_(), H = a.health || { days: {} }, s = state_(H), t = s.today;
  const prof = Object.assign({ by: 2001, h: 171, w: 68 }, (H.cfg || {}).prof || {}), m = (H.meas || []).slice(-1)[0];
  const L = [];
  L.push('Hôm nay ' + dk_(new Date()) + ' lúc ' + Utilities.formatDate(new Date(), TZ, 'HH:mm') + '.');
  L.push('Hồ sơ: ' + (new Date().getFullYear() - prof.by) + ' tuổi, cao ' + prof.h + ' cm, nặng ' + (m ? m.w : prof.w) + ' kg' + (m ? ', vòng eo ' + m.waist + ' cm (đo ' + m.d + ')' : '') + '.');
  if (s.hb || s.rb) L.push('Mức nền 30 ngày: ' + (s.hb ? 'HRV ' + Math.round(s.hb.m) + '±' + Math.round(s.hb.sd) + ' ms' : '') + (s.rb ? ', nhịp nghỉ ' + Math.round(s.rb.m) + '±' + s.rb.sd.toFixed(1) + ' bpm' : '') + '.');
  if (s.R != null) L.push('Điểm sẵn sàng hôm nay (ước tính): ' + s.R + '/100. Tải tập 7 ngày/28 ngày: ' + (s.ratio != null ? s.ratio.toFixed(2) : 'chưa đủ dữ liệu') + '.');
  const fmt = d => { const p = []; if (d.sleepMin) p.push('ngủ ' + Math.floor(d.sleepMin / 60) + 'h' + ('0' + d.sleepMin % 60).slice(-2) + (d.bed ? ' (' + d.bed + '→' + d.wake + ')' : '') + (d.deep != null ? ' sâu ' + d.deep + '′ REM ' + d.rem + '′ thức ' + (d.awake || 0) + '′' : ''));
    ['hrv:HRV', 'rhr:nhịp nghỉ', 'spo2:SpO2', 'br:nhịp thở', 'tempD:nhiệt da lệch', 'steps:bước', 'azm:AZM', 'cal:kcal'].forEach(x => { const [k, n] = x.split(':'); if (d[k] != null) p.push(n + ' ' + d[k]); });
    if (d.ex && d.ex.length) p.push('tập: ' + d.ex.map(e => e.t + ' ' + e.min + '′' + (e.km ? ' ' + e.km + 'km' : '') + (e.hr ? ' HR' + e.hr : '')).join(', '));
    return p.join(', '); };
  L.push('14 ngày gần nhất (mới nhất trước):');
  for (let i = 0; i < 14; i++) { const k = dk_(new Date(Date.now() - i * 864e5)), d = H.days[k]; if (d) L.push('- ' + k + ': ' + fmt(d)); }
  if (t.hrH) L.push('Nhịp tim trung bình theo giờ hôm nay: ' + t.hrH.map((v, h) => v ? h + 'h:' + v : '').filter(Boolean).join(' '));
  if (t.hourly) L.push('Bước theo giờ hôm nay: ' + t.hourly.map((v, h) => v ? h + 'h:' + v : '').filter(Boolean).join(' '));
  const ps = planSession(H, new Date(), dk_, 3, { z1: s.z(.4) + '–' + s.z(.59), z2: s.z(.6) + '–' + s.z(.7) });
  if (ps) L.push('Giáo án bơi+chạy 8 tuần: ' + ps.title + ' — ' + ps.body);
  if (H.coach && H.coach.date === dk_(new Date())) L.push('Gợi ý tập 17h hôm nay: ' + H.coach.title + ' — ' + H.coach.body);
  if (H.weekly) L.push('Báo cáo tuần gần nhất (' + H.weekly.end + '): ' + H.weekly.score + '/100. ' + H.weekly.lines.join('; ') + '. Mục tiêu: ' + H.weekly.goal);
  L.push('Vùng nhịp tim (Karvonen): đốt mỡ ' + s.z(.4) + '–' + s.z(.59) + ', tim mạch ' + s.z(.6) + '–' + s.z(.84) + ', đỉnh ≥' + s.z(.85) + ' bpm.');
  return L.join('\n');
}
function doctorChat_(msgs) {
  const key = (PropertiesService.getScriptProperties().getProperty('GEMINI_KEY') || '').trim();
  if (!key) return { error: 'nokey', msg: 'Chưa cấu hình khoá Gemini.' };
  const hist = msgs.slice(-12).map(m => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: String(m.text || '').slice(0, 2000) }] })).filter(m => m.parts[0].text);
  if (!hist.length || hist[hist.length - 1].role !== 'user') return { error: 'empty' };
  const sys = DOCTOR_SYS + '\n\n=== SỐ LIỆU CỦA TUẤN ===\n' + doctorCtx_();
  let model = pickModel_(key), last = '';
  const t0 = Date.now();
  for (let a = 0; a < 3 && Date.now() - t0 < 75e3; a++) {
    const body = { systemInstruction: { parts: [{ text: sys }] }, contents: hist,
      generationConfig: { temperature: 0.5, maxOutputTokens: 1500, thinkingConfig: /gemini-2\./.test(model) ? { thinkingBudget: 512 } : { thinkingLevel: 'low' } },
      safetySettings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }] };
    const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', { method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key }, payload: JSON.stringify(body), muteHttpExceptions: true });
    const code = r.getResponseCode();
    if (code === 200) {
      const j = JSON.parse(r.getContentText()), cand = (j.candidates || [])[0] || {};
      const text = ((cand.content || {}).parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim();
      if (text) return { reply: text, model };
      last = 'empty ' + (cand.finishReason || '');
    } else { last = model + ' ' + code; if (code === 429 || code >= 500 || code === 404) { model = altModel_(model); Utilities.sleep(1200); } else if (code === 400 && /thinking/i.test(r.getContentText())) { model = altModel_(model); } else break; }
  }
  return { error: 'gemini', msg: 'Gemini đang bận (' + last + '). Thử lại sau ít phút.' };
}
function testDoctor() { console.log(JSON.stringify(doctorChat_([{ role: 'user', text: 'Tóm tắt nhanh sức khoẻ của mình hôm nay và hôm nay nên tập gì?' }])).slice(0, 1500)); }
