/**
 * Quầy báo · 8:30 sáng mỗi ngày: gom tin từ RSS các báo uy tín → Gemini chọn & tóm tắt 10–15 tin tiếng Việt
 * → ghi vào acad.news trong Firestore (cùng tài liệu với app Học viện).
 * Gemini chỉ tóm tắt những bài báo có thật lấy từ RSS (không tự bịa tin). Không có key Gemini thì vẫn chọn tin theo luật đơn giản.
 */
const FEEDS = [
  ['mkt', 'https://news.google.com/rss/search?q=marketing+OR+%22qu%E1%BA%A3ng+c%C3%A1o%22+OR+TikTok+Shop+OR+Meta+Ads+when:1d&hl=vi&gl=VN&ceid=VN:vi'],
  ['mkt', 'https://news.google.com/rss/search?q=%22digital+marketing%22+OR+%22Meta+ads%22+OR+%22Google+Ads%22+OR+%22marketing+AI%22+when:1d&hl=en-US&gl=US&ceid=US:en'],
  ['ai', 'https://news.google.com/rss/search?q=OpenAI+OR+Anthropic+OR+%22Google+Gemini%22+OR+%22AI+agent%22+when:1d&hl=en-US&gl=US&ceid=US:en'],
  ['ai', 'https://news.google.com/rss/search?q=%22tr%C3%AD+tu%E1%BB%87+nh%C3%A2n+t%E1%BA%A1o%22+OR+AI+when:1d&hl=vi&gl=VN&ceid=VN:vi'],
  ['world', 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en'],
  ['world', 'https://vnexpress.net/rss/the-gioi.rss'],
  ['macro', 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en'],
  ['macro', 'https://vnexpress.net/rss/kinh-doanh.rss'],
  ['stock', 'https://news.google.com/rss/search?q=VN-Index+OR+%22ch%E1%BB%A9ng+kho%C3%A1n%22+when:1d&hl=vi&gl=VN&ceid=VN:vi'],
  ['stock', 'https://news.google.com/rss/search?q=%22stock+market%22+OR+Nasdaq+OR+%22S%26P+500%22+OR+Fed+when:1d&hl=en-US&gl=US&ceid=US:en'],
  ['crypto', 'https://news.google.com/rss/search?q=bitcoin+OR+ethereum+OR+crypto+when:1d&hl=en-US&gl=US&ceid=US:en'],
  ['invest', 'https://news.google.com/rss/search?q=%22gi%C3%A1+v%C3%A0ng%22+OR+%22l%C3%A3i+su%E1%BA%A5t%22+OR+%22t%E1%BB%B7+gi%C3%A1%22+OR+%22%C4%91%E1%BA%A7u+t%C6%B0%22+when:1d&hl=vi&gl=VN&ceid=VN:vi'],
  ['bds', 'https://vnexpress.net/rss/bat-dong-san.rss'],
  ['bds', 'https://news.google.com/rss/search?q=%22b%E1%BA%A5t+%C4%91%E1%BB%99ng+s%E1%BA%A3n%22+OR+%22c%C4%83n+h%E1%BB%99%22+OR+%22d%E1%BB%B1+%C3%A1n%22+TP.HCM+when:1d&hl=vi&gl=VN&ceid=VN:vi'],
  ['law', 'https://news.google.com/rss/search?q=%22c%C3%B3+hi%E1%BB%87u+l%E1%BB%B1c%22+OR+%22ngh%E1%BB%8B+%C4%91%E1%BB%8Bnh+m%E1%BB%9Bi%22+OR+%22lu%E1%BA%ADt+m%E1%BB%9Bi%22+when:2d&hl=vi&gl=VN&ceid=VN:vi'],
  ['law', 'https://vnexpress.net/rss/phap-luat.rss'],
  ['hot', 'https://vnexpress.net/rss/tin-noi-bat.rss'],
  ['hot', 'https://news.google.com/rss?hl=vi&gl=VN&ceid=VN:vi']
];
const CAT_VI = { mkt: 'Marketing', ai: 'AI & công nghệ', world: 'Thế giới · chính trị', macro: 'Kinh tế', stock: 'Chứng khoán', crypto: 'Tiền số', invest: 'Đầu tư · vàng · lãi suất', bds: 'BĐS Việt Nam', law: 'Luật & chính sách mới', hot: 'Nóng trong ngày' };

function setupNews() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'news').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('news').timeBased().atHour(8).nearMinute(30).everyDays(1).inTimezone(TZ).create();
  news();
}

function fetchFeeds_() {
  const reqs = FEEDS.map(f => ({ url: f[1], muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0 HocVienNewsBot' } }));
  const res = UrlFetchApp.fetchAll(reqs), out = [], seen = {}, cutoff = Date.now() - 36 * 3600e3;
  res.forEach((r, i) => {
    if (r.getResponseCode() !== 200) return;
    let doc; try { doc = XmlService.parse(r.getContentText()); } catch (e) { return; }
    const ch = doc.getRootElement().getChild('channel'); if (!ch) return;
    ch.getChildren('item').slice(0, 10).forEach(it => {
      const g = n => (it.getChildText(n) || '').trim();
      let title = g('title'), link = g('link'), src = '';
      const s = it.getChild('source'); if (s) src = s.getText();
      if (!src) src = FEEDS[i][1].includes('vnexpress') ? 'VnExpress' : '';
      if (src && title.endsWith(' - ' + src)) title = title.slice(0, -(src.length + 3));
      const t = Date.parse(g('pubDate')) || Date.now();
      if (t < cutoff) return;
      const key = title.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').slice(0, 70);
      if (!title || seen[key]) return; seen[key] = 1;
      const desc = g('description').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&amp;|&quot;|&#39;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
      out.push({ id: out.length, cat: FEEDS[i][0], t: title.slice(0, 200), d: desc, src: src || 'Google News', url: link, time: t });
    });
  });
  return out;
}

function pickModel_(key) {
  const cached = PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL');
  if (cached && PropertiesService.getScriptProperties().getProperty('GEMINI_ALT')) return cached;
  const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Gemini models ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 150));
  const ms = (JSON.parse(r.getContentText()).models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace('models/', '')).filter(n => /flash/.test(n) && !/image|tts|audio|live|embed|thinking-exp|robotics/.test(n));
  const ver = n => { const m = n.match(/gemini-(\d+(?:\.\d+)?)/); return m ? +m[1] : 0; };
  ms.sort((a, b) => (ver(b) - ver(a)) || ((/lite/.test(a) ? 1 : 0) - (/lite/.test(b) ? 1 : 0)) || ((/preview|exp/.test(a) ? 1 : 0) - (/preview|exp/.test(b) ? 1 : 0)) || (a.length - b.length));
  if (!ms.length) throw new Error('Không tìm thấy model Gemini Flash');
  PropertiesService.getScriptProperties().setProperty('GEMINI_ALT', JSON.stringify(ms.slice(0, 5)));
  return ms[0];
}
function altModel_(cur) {
  let a = []; try { a = JSON.parse(PropertiesService.getScriptProperties().getProperty('GEMINI_ALT') || '[]'); } catch (e) {}
  return a.find(m => m !== cur) || cur;
}

function gemini_(items) {
  const key = (PropertiesService.getScriptProperties().getProperty('GEMINI_KEY') || '').trim();
  if (!key) return null;
  const list = items.map(x => `[${x.id}] (${x.cat}) ${x.t} — ${x.src}${x.d ? ' :: ' + x.d : ''}`).join('\n').slice(0, 36000);
  const prompt = `Bạn là biên tập viên bản tin buổi sáng cho Tuấn: Head of Marketing ở một công ty môi giới bất động sản tại TP.HCM, đang tự học Marketing Engineering (AI agent, dữ liệu) và có quan tâm đầu tư.
Dưới đây là danh sách tiêu đề báo trong 24–36 giờ qua (mã [id], (nhóm), tiêu đề — nguồn :: mô tả).
Hãy chọn 12–15 tin quan trọng và hữu ích nhất, phủ đủ các nhóm nếu có tin: mkt, ai, world, macro, stock, crypto, invest, bds, law, hot. Ưu tiên tin có tác động tới thị trường BĐS Việt Nam, marketing/quảng cáo, AI ứng dụng, chính sách và luật mới có hiệu lực. Bỏ tin giải trí, tin trùng lặp, tin quá vụn.
Chỉ dùng thông tin có trong danh sách; KHÔNG bịa số liệu hay chi tiết không có trong tiêu đề/mô tả. Viết tiếng Việt tự nhiên, ngắn gọn.
Trả về JSON đúng schema: head = 1 câu tóm tắt điều đáng chú ý nhất hôm nay; takes = 3 gạch đầu dòng "cần nhớ" (mỗi dòng ≤ 18 từ); items = danh sách tin đã chọn theo thứ tự quan trọng, mỗi tin: id (số trong ngoặc vuông), cat (một trong các nhóm trên), title (tiêu đề tiếng Việt ≤ 14 từ), sum (2 câu tóm tắt), why (1 câu: vì sao Tuấn nên quan tâm/ảnh hưởng tới công việc hoặc đầu tư), hot (true nếu là tin nóng nhất ngày).

DANH SÁCH:
${list}`;
  const schema = { type: 'OBJECT', properties: { head: { type: 'STRING' }, takes: { type: 'ARRAY', items: { type: 'STRING' } },
    items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'INTEGER' }, cat: { type: 'STRING' }, title: { type: 'STRING' }, sum: { type: 'STRING' }, why: { type: 'STRING' }, hot: { type: 'BOOLEAN' } }, required: ['id', 'cat', 'title', 'sum', 'why'] } } },
    required: ['head', 'takes', 'items'] };
  let model = pickModel_(key), lastErr = '';
  const t0 = Date.now();
  let think = m => /gemini-2\./.test(m) ? { thinkingBudget: 0 } : { thinkingLevel: 'low' };
  for (let attempt = 0; attempt < 3 && Date.now() - t0 < 150e3; attempt++) {
    const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'post', headers: { 'x-goog-api-key': key }, contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 8192, responseMimeType: 'application/json', responseSchema: schema, thinkingConfig: think(model) } })
    });
    const code = r.getResponseCode();
    if (code === 200) {
      PropertiesService.getScriptProperties().setProperty('GEMINI_MODEL', model);
      const j = JSON.parse(r.getContentText()), txt = (((j.candidates || [])[0] || {}).content || {}).parts;
      const out = JSON.parse((txt || []).map(p => p.text || '').join(''));
      out.model = model; return out;
    }
    lastErr = code + ' ' + r.getContentText().slice(0, 160);
    if (code === 400 && /thinking/i.test(r.getContentText())) { think = () => undefined; continue; }
    if (code === 404 || code === 400) { PropertiesService.getScriptProperties().deleteProperty('GEMINI_MODEL'); model = pickModel_(key); }
    if (code === 429 || code >= 500) { if (attempt >= 0) model = altModel_(model); Utilities.sleep(3000 * (attempt + 1)); }
  }
  throw new Error('Gemini ' + lastErr);
}

function news() {
  const items = fetchFeeds_(), byId = {}; items.forEach(x => byId[x.id] = x);
  let ed = null, err = '';
  try { ed = gemini_(items); } catch (e) { err = e.message.slice(0, 200); }
  let picked;
  if (ed && ed.items && ed.items.length) {
    picked = ed.items.filter(x => byId[x.id]).slice(0, 15).map(x => { const s = byId[x.id]; return { id: 'n' + x.id, cat: CAT_VI[x.cat] ? x.cat : s.cat, t: x.title || s.t, s: x.sum || s.d, w: x.why || '', hot: !!x.hot, src: s.src, url: s.url, time: s.time, ot: s.t }; });
  } else {
    const per = {}; picked = [];
    items.sort((a, b) => b.time - a.time).forEach(x => { per[x.cat] = (per[x.cat] || 0) + 1; if (per[x.cat] <= (x.cat === 'hot' ? 3 : 1) && picked.length < 12) picked.push({ id: 'n' + x.id, cat: x.cat, t: x.t, s: x.d, w: '', hot: x.cat === 'hot', src: x.src, url: x.url, time: x.time }); });
  }
  const pack = { at: Date.now(), date: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), head: ed ? ed.head : '', takes: ed ? (ed.takes || []).slice(0, 3) : [], items: picked, model: ed ? ed.model : '', err: ed ? '' : (err || 'Chưa có key Gemini: đang chọn tin tự động'), n: items.length };
  saveNews_(pack);
  console.log(JSON.stringify({ n: items.length, picked: picked.length, model: pack.model, err: pack.err }));
}

function saveNews_(pack) {
  const url = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/users/' + uid_();
  const head = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  for (let attempt = 0; attempt < 4; attempt++) {
    const g = UrlFetchApp.fetch(url, { headers: head, muteHttpExceptions: true });
    if (g.getResponseCode() !== 200) throw new Error('Firestore get ' + g.getResponseCode() + ' ' + g.getContentText().slice(0, 200));
    const doc = JSON.parse(g.getContentText());
    const st = doc.fields && doc.fields.s ? JSON.parse(doc.fields.s.stringValue) : { v: 1, cards: {}, days: {}, newLog: {}, updated: 0 };
    const acad = st.acad && st.acad.v === 1 ? st.acad : { v: 1 };
    const old = acad.news;
    if (old && old.date && old.date !== pack.date) pack.prev = { date: old.date, head: old.head, takes: old.takes, items: old.items };
    else if (old && old.prev) pack.prev = old.prev;
    acad.news = pack;
    acad.updatedAt = Math.max(Date.now(), (acad.updatedAt || 0) + 1);
    st.acad = acad; st.updated = Math.max(Date.now(), (st.updated || 0) + 1);
    const body = { fields: { s: { stringValue: JSON.stringify(st) }, updated: { timestampValue: new Date().toISOString() } } };
    const p = UrlFetchApp.fetch(url + '?updateMask.fieldPaths=s&updateMask.fieldPaths=updated&currentDocument.updateTime=' + encodeURIComponent(doc.updateTime), {
      method: 'patch', contentType: 'application/json', headers: head, payload: JSON.stringify(body), muteHttpExceptions: true
    });
    if (p.getResponseCode() === 200) return;
    if ([400, 409, 412].indexOf(p.getResponseCode()) < 0) throw new Error('Firestore write ' + p.getResponseCode() + ' ' + p.getContentText().slice(0, 200));
    Utilities.sleep(1500);
  }
  throw new Error('Firestore busy');
}
