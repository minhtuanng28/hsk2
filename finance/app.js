/* Ngân hàng Mintun · ứng dụng chính.
   Dữ liệu: Google Sheet qua Apps Script (tools/finance-sync). Lưu máy + Firebase dạng mã hoá bằng mật khẩu 6 số. */
const F = window.MintunFin, VA = window.MintunVault, MC = window.MC;
const FBCFG = { apiKey: "AIzaSyCzG2TNB2fwUSUDycsxQ8a2D1GaWzVHl28", authDomain: "hsk-app-f5201.firebaseapp.com", projectId: "hsk-app-f5201", storageBucket: "hsk-app-f5201.firebasestorage.app", messagingSenderId: "278418991443", appId: "1:278418991443:web:9cb95ad3a99e01b7ae59a6" };
const ACAD = '/hsk2/academy/', GUIDE = 'https://github.com/minhtuanng28/hsk2/blob/main/tools/finance-sync/HUONG-DAN.md';
const Q = new URLSearchParams(location.search), DEMO = Q.get('demo');
const LS = DEMO ? 'mintun-bank-demo' : 'mintun-bank-v1', LSV = DEMO ? 'mintun-bank-demo-v2' : 'mintun-bank-v2';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const { GROUPS } = F;
const GC = { thu: 'var(--g-thu)', codinh: 'var(--g-codinh)', linhhoat: 'var(--g-linhhoat)', tichluy: 'var(--g-tichluy)' };
function toast(t) { const e = document.createElement('div'); e.className = 'toast'; e.textContent = t; document.body.appendChild(e); setTimeout(() => e.remove(), 3200); }

/* ===== trạng thái ===== */
const blank = () => ({ cfg: { url: '', key: '' }, goals: [], map: {}, doc: null, sync: 0, pending: [], upd: 0, recent: {}, inv: { holdings: [], deposits: [] }, px: {}, pxAt: 0, ai: null, hide: false, ai_on: true });
let ST = blank(), K = null;
let legacy = null; try { legacy = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { }
let localBox = null; try { localBox = JSON.parse(localStorage.getItem(LSV) || 'null'); } catch (e) { }
let cloudBox = null, cloudLegacy = null, cloudChecked = !!DEMO;
let M = null, tab = Q.get('tab') || 'dash', busy = false, aiBusy = false, tipShift = 0;
let P = null;                // kỳ xem đang chọn {t:'thang'|'quy'|'nam'|'tuy', i|q|y|from|to}
let drill = null, trendR = '12', logYM = null;
function build() { M = null; if (!ST.doc) return; try { M = F.parse(ST.doc, ST.map); if (!P) P = defaultP(); } catch (e) { M = null; toast('Không đọc được sheet: ' + e.message); } }
function defaultP() { const L = F.lastIdx(M), mo = M.months[L], now = new Date(); const cur = M.months.findIndex(m => m.y === now.getFullYear() && m.m === now.getMonth() + 1); return { t: 'thang', i: cur >= 0 ? cur : L, y: mo.y, q: Math.ceil(mo.m / 3) }; }

let saveQ = Promise.resolve();
function saveLocal() { if (!K) return; const k = K, snap = JSON.parse(JSON.stringify(ST)); saveQ = saveQ.then(async () => { try { const box = await VA.seal(k, snap, { upd: snap.upd }); localStorage.setItem(LSV, JSON.stringify(box)); localBox = box; localStorage.removeItem(LS); } catch (e) { console.warn('vault', e); } }); }
let cloudT = null;
const SECT = ['cfg', 'goals', 'map', 'inv', 'ai', 'ai_on'];
function save(cloud = true, ...secs) { if (!K) return; ST.upd = Date.now(); ST.ts = ST.ts || {}; secs.forEach(x => ST.ts[x] = ST.upd); saveLocal(); if (cloud && !DEMO) { clearTimeout(cloudT); cloudT = setTimeout(pushCloud, 1200); } }

/* ===== định dạng + chế độ ẩn số ===== */
const pct1 = r => Math.abs(r) < .1 ? (Math.round(r * 1000) / 10).toFixed(1).replace('.', ',') + '%' : F.pct(r);
const short = n => ST.hide ? '•••' : F.short(n), vnd = n => ST.hide ? '•••••• đ' : F.vnd(n), pct = F.pct;
const sgn = (n, f = short) => (n > 0 ? '+' : n < 0 ? '−' : '') + f(Math.abs(n));
const FMT = { short: n => ST.hide ? '•••' : F.short(n), int: n => String(Math.round(n)), vnd: n => ST.hide ? '•••' : F.vnd(n) };
const cnt = (v, key, fmt = 'short') => ST.hide ? `<span>•••</span>` : `<span data-count="${v}" data-key="${key}" data-fmt="${fmt}">${FMT[fmt](v)}</span>`;
function delta(now, before, invert) {
  if (!before) return '<span class="chip">chưa có kỳ trước</span>';
  const r = now / before - 1, good = invert ? r <= 0 : r >= 0;
  if (Math.abs(r) < .005) return '<span class="chip">ngang kỳ trước</span>';
  return `<span class="chip ${good ? 'up' : 'down'}">${r > 0 ? '▲' : '▼'} ${pct(Math.abs(r))}</span>`;
}

/* ===== mốc cập nhật ngày 1 và 16 ===== */
function lastMilestone() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate() >= 16 ? 16 : 1).getTime(); }
const isDue = () => !ST.sync || ST.sync < lastMilestone();
function syncLabel() {
  if (M && M.stamp) return M.stamp;
  if (!ST.sync) return 'Chưa cập nhật lần nào';
  const d = new Date(ST.sync); return 'Đồng bộ ' + d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/* ===== Apps Script ===== */
const okUrl = u => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u || '');
async function api(action, extra) {
  if (DEMO) return demoApi(action, extra);
  if (!okUrl(ST.cfg.url) || !ST.cfg.key) throw new Error('Chưa kết nối Google Sheet (mở Cài đặt)');
  const r = await fetch(ST.cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ key: ST.cfg.key, action }, extra || {})), redirect: 'follow' });
  const j = await r.json(); if (!j.ok) throw new Error(j.loi || 'Lỗi không rõ'); return j;
}
async function flushPending() { for (const p of ST.pending.slice()) { if (p.err) continue; try { await api('them', { gd: p }); ST.pending = ST.pending.filter(x => x.id !== p.id); } catch (e) { if (/Không thấy dòng|không hợp lệ|chứa chữ|không có cột/.test(e.message)) p.err = e.message; else throw e; } } save(false); }
const invList = () => (ST.inv.holdings || []).map(h => ({ ma: h.code, loai: h.type === 'quy' ? 'quy' : 'cp' }));
async function refreshPrices(silent) {
  if (!invList().length) return;
  try { const j = await api('gia', { ma: invList() }); ST.px = Object.assign({}, ST.px, j.gia || {}); ST.pxAt = Date.now(); save(); if (!silent) toast('Đã cập nhật giá'); }
  catch (e) { if (!silent) toast('Giá: ' + e.message); }
}
async function runAI() {
  if (!M || aiBusy || !ST.ai_on) return; aiBusy = true; render();
  try { const j = await api('ai', { tom: F.aiBrief(M, ST.goals, ST.inv, ST.px, M.stamp) }); ST.ai = { res: j.ai, at: Date.now(), model: j.model }; }
  catch (e) { ST.ai = Object.assign({}, ST.ai || {}, { err: e.message, errAt: Date.now() }); }
  aiBusy = false; save(true, 'ai'); render();
}
async function refresh(silent) {
  if (busy || !K) return; busy = true; $('#bUpd').classList.add('spin');
  try {
    if (ST.pending.length) await flushPending();
    const j = await api('doc', { moi: !silent }); delete j.ok; ST.doc = j; ST.sync = Date.now();
    const keepP = P && P.t !== 'thang' ? P : null; P = keepP; build(); save();
    if (!silent) toast('Đã đọc sheet "' + (j.tab || '') + '"');
    render();
    await refreshPrices(true); render();
    if (!silent) runAI();
  } catch (e) { if (!silent) toast(e.message); render(); }
  finally { busy = false; $('#bUpd').classList.remove('spin'); }
}

/* ===== tooltip ===== */
const tipEl = $('#tip');
function showTip(e, html) { tipEl.innerHTML = html; tipEl.classList.add('on'); const w = tipEl.offsetWidth, h = tipEl.offsetHeight; tipEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, e.clientX - w / 2)) + 'px'; tipEl.style.top = Math.max(8, e.clientY - h - 16) + 'px'; }
function hideTip() { tipEl.classList.remove('on'); }
document.addEventListener('pointermove', e => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) showTip(e, t.dataset.tip); else if (!e.target.closest('.area')) hideTip(); });
document.addEventListener('scroll', hideTip, true);

/* ===== mèo Bắp ===== */
const MEO = `<svg class="meo" viewBox="0 0 100 100" aria-hidden="true"><path class="tail" d="M70 82c14 2 22-6 20-17-1-6-6-8-9-5 4 2 4 8 0 11-3 3-8 4-12 3z" fill="#e9b04f"/><ellipse cx="50" cy="76" rx="24" ry="18" fill="#e9b04f"/><ellipse cx="50" cy="80" rx="13" ry="12" fill="#fbe8c4"/><path d="M24 30 28 10 42 24zM76 30 72 10 58 24z" fill="#e9b04f"/><path d="M28 26 30 15 38 23zM72 26 70 15 62 23z" fill="#e86a8a" opacity=".55"/><ellipse cx="50" cy="44" rx="29" ry="25" fill="#e9b04f"/><path d="M42 22c2 5 1 8-1 10M50 20v11M58 22c-2 5-1 8 1 10" stroke="#c98a2e" stroke-width="3" stroke-linecap="round" fill="none"/><ellipse cx="50" cy="53" rx="15" ry="11" fill="#fbe8c4"/><ellipse class="eye" cx="39" cy="43" rx="4" ry="5" fill="#2a1a10"/><ellipse class="eye" cx="61" cy="43" rx="4" ry="5" fill="#2a1a10"/><circle cx="40.5" cy="41" r="1.4" fill="#fff"/><circle cx="62.5" cy="41" r="1.4" fill="#fff"/><path d="M47 50h6l-3 3z" fill="#e86a8a"/><path d="M50 53c-1 3-5 3-6 1M50 53c1 3 5 3 6 1" stroke="#2a1a10" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M30 52h-10M30 55l-9 3M70 52h10M70 55l9 3" stroke="#c98a2e" stroke-width="1.2" stroke-linecap="round"/><ellipse cx="38" cy="90" rx="7" ry="4" fill="#fbe8c4"/><ellipse cx="62" cy="90" rx="7" ry="4" fill="#fbe8c4"/><rect x="56" y="70" width="17" height="12" rx="3" fill="#f2c14e" stroke="#b8860b" stroke-width="1.2"/></svg>`;
function bapCard(extra) {
  const list = F.tips(M, ST.goals, { lastSync: ST.sync }), t = F.tipOfDay(list, tipShift);
  const d = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric' });
  return `<div class="card"><div class="bap">${MEO}<div class="bub"><div class="who"><span>Bắp · ${esc(d)}</span><button data-act="nexttip">Câu khác ›</button></div><p>${esc(ST.hide ? 'Đang ẩn số tiền. Bấm con mắt để xem lời khuyên.' : t ? t.t : 'Meo~')}</p></div></div>${extra || ''}</div>`;
}

/* ===== khung ===== */
const SEG = (name, opts, cur, cls = '') => { const i = Math.max(0, opts.findIndex(o => o[0] === cur)); return `<div class="seg ${cls}" style="--n:${opts.length};--i:${i}"><i class="th"></i>${opts.map(([k, l]) => `<button data-${name}="${k}" class="${k === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`; };
function periodBar() {
  const ms = M.months, years = [...new Set(ms.map(m => m.y))];
  let step = '';
  if (P.t === 'thang') step = `<button data-act="pprev" aria-label="Kỳ trước">‹</button><b>Tháng ${ms[P.i].label}</b><button data-act="pnext" aria-label="Kỳ sau">›</button>`;
  else if (P.t === 'quy') step = `<button data-act="pprev" aria-label="Kỳ trước">‹</button><b>Quý ${P.q}/${P.y}</b><button data-act="pnext" aria-label="Kỳ sau">›</button>`;
  else if (P.t === 'nam') step = `<button data-act="pprev" aria-label="Năm trước">‹</button><b>Năm ${P.y}</b><button data-act="pnext" aria-label="Năm sau">›</button>`;
  else { const o = sel => ms.map(m => `<option value="${m.k}" ${m.k === sel ? 'selected' : ''}>${m.label}</option>`).join(''); step = `<select data-pf="from">${o(P.from)}</select><span class="sub">→</span><select data-pf="to">${o(P.to)}</select>`; }
  return `<div class="pbar">${SEG('pt', [['thang', 'Tháng'], ['quy', 'Quý'], ['nam', 'Năm'], ['tuy', 'Tuỳ chọn']], P.t)}<div class="step">${step}</div></div>`;
}
function stampLine() { const partial = R0 && R0.partial; return `<span class="stamp"><i></i>${esc(M.stamp || syncLabel())}${partial ? ' · kỳ này đang điền dở' : ''}</span>`; }
let R0 = null;
function empty() {
  const has = okUrl(ST.cfg.url) && ST.cfg.key;
  return `<div class="grid fade">${!has ? `<div class="card"><div class="bap">${MEO}<div class="bub"><div class="who"><span>Bắp</span></div><p>Meo! Bắp chưa đọc được sổ thu chi. Mở Cài đặt, dán link web app và mã APP_KEY là xong.</p></div></div></div>` : ''}
  <div class="card empty"><b>${has ? 'Đã có kết nối' : 'Kết nối Google Sheet'}</b><p>${has ? 'Bấm Cập nhật để Bắp đọc sổ thu chi.' : 'App đọc trực tiếp sheet thu chi. Số tiền không nằm trên GitHub.'}</p>
  <button class="btn pri" data-act="${has ? 'refresh' : 'settings'}">${has ? 'Cập nhật ngay' : 'Mở Cài đặt'}</button> <a class="btn" style="text-decoration:none;display:inline-block" href="${GUIDE}" target="_blank" rel="noopener">Hướng dẫn</a></div></div>`;
}
function render() {
  $('#syncTxt').textContent = M ? syncLabel() : 'Chưa cập nhật';
  $('#dueDot').hidden = !isDue();
  $('#bHide').innerHTML = ST.hide ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18M10.6 6.1A9.7 9.7 0 0 1 12 6c5 0 9 6 9 6a15.6 15.6 0 0 1-3 3.5M6.6 6.6C4.4 8 3 12 3 12s4 6 9 6a8.9 8.9 0 0 0 4-1"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.8"/></svg>';
  $$('#tabs button[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const v = $('#view');
  if (!K) { v.innerHTML = ''; return; }
  if (!M) { v.innerHTML = empty(); return; }
  R0 = F.periodRange(M, P) || F.range(M, F.lastIdx(M), F.lastIdx(M));
  const after = [];
  v.innerHTML = tab === 'health' ? vHealth(after) : tab === 'inv' ? vInv(after) : tab === 'goals' ? vGoals() : tab === 'log' ? vLog() : vDash(after);
  after.forEach(f => f());
  MC.growRings(v); MC.countUp(v, FMT);
}

/* ----- Tổng quan ----- */
function outflowItems(R) {
  const it = [['codinh', R.codinh], ['linhhoat', R.linhhoat], ['tichluy', Math.max(0, R.tichluy)]].map(([g, v]) => ({ key: g, name: GROUPS[g].name, value: v, color: GC[g] }));
  if (R.free > 0) it.push({ key: 'du', name: 'Còn dư', value: R.free, color: 'var(--mute)', hatch: true });
  return it.filter(x => x.value > 0);
}
function catItems(R, g) {
  const cs = M.cats.filter(c => c.group === g).map(c => ({ key: c.id, name: c.name, value: Math.max(0, R.cat[c.id] || 0) })).filter(x => x.value > 0).sort((a, b) => b.value - a.value);
  const top = cs.slice(0, 7), rest = cs.slice(7).reduce((s, x) => s + x.value, 0);
  if (rest > 0) top.push({ key: 'khac', name: 'Khác (' + (cs.length - 7) + ')', value: rest });
  return top.map((x, i) => Object.assign(x, { color: MC.slot(i) }));
}
function legendRows(items, tot, did) { return items.map((x, i) => `<button class="lrow" data-li="${did}:${i}" ${x.key && GROUPS[x.key] ? `data-drill="${x.key}"` : ''}><i class="${x.hatch ? 'h' : ''}" style="--c:${x.color}"></i><span>${esc(x.name)}</span><b class="num">${short(x.value)}</b><em class="num">${tot ? (Math.round(x.value / tot * 1000) / 10).toFixed(1).replace('.', ',') : 0}%</em></button>`).join(''); }
function donutCard(id, title, items, tot, centerLabel, after, extraHead) {
  const opts = { id, total: tot, center: { label: centerLabel, value: short(tot), sub: items.length + ' phần' }, fmt: short, aria: title };
  after.push(() => { const el = document.querySelector(`[data-donut="${id}"]`); MC.wireDonut(el, items, opts); });
  return `<div class="card"><h3><b>${title}</b>${extraHead || ''}</h3><div class="dwrap">${MC.donut(items, opts)}<div class="leg">${legendRows(items, tot, id)}</div></div></div>`;
}
function vDash(after) {
  const R = R0, prev = R.prev, n = R.n;
  const outItems = drill ? catItems(R, drill) : outflowItems(R);
  const outTot = outItems.reduce((s, x) => s + x.value, 0);
  const inItems = M.cats.filter(c => c.group === 'thu').map(c => ({ key: c.id, name: c.name, value: Math.max(0, R.cat[c.id] || 0) })).filter(x => x.value > 0).sort((a, b) => b.value - a.value).map((x, i) => Object.assign(x, { color: ['var(--c1)', 'color-mix(in oklab,var(--c1) 70%,var(--card))', 'color-mix(in oklab,var(--c1) 45%,var(--card))', 'color-mix(in oklab,var(--c1) 25%,var(--card))'][i] || MC.slot(i) }));
  // xu hướng
  const end = R.b, len = trendR === 'all' ? M.mon.length : +trendR, a = Math.max(0, end - len + 1), ms = M.mon.slice(a, end + 1);
  const labels = ms.map(m => m.label.replace(/\/20(\d\d)/, '/$1'));
  const series = [{ name: 'Thu nhập', values: ms.map(m => m.inc), color: 'var(--c1)', area: true }, { name: 'Chi tiêu', values: ms.map(m => m.spend), color: 'var(--c2)' }, { name: 'Tích lũy', values: ms.map(m => Math.max(0, m.tichluy)), color: 'var(--c3)', dash: true }];
  const aopts = { id: 'trend', h: 230, w: 700, fmt: short, fmtAxis: F.short, aria: 'Thu, chi, tích lũy theo tháng', extra: i => `<div class="r"><span>${ms[i].free >= 0 ? 'Còn dư' : 'Thâm hụt'}</span><b class="num">${short(ms[i].free)}</b></div>` };
  after.push(() => MC.wireArea(document.querySelector('[data-area="trend"]'), series, labels, aopts, showTip, hideTip));
  // top hạng mục
  const spendCats = M.cats.filter(c => c.group === 'codinh' || c.group === 'linhhoat').map(c => ({ c, v: R.cat[c.id] || 0, b: prev ? prev.cat[c.id] || 0 : null })).filter(x => x.v > 0).sort((x, y) => y.v - x.v).slice(0, 6);
  const mx = Math.max(1, ...spendCats.map(x => x.v));
  const ai = ST.ai && ST.ai.res;
  return `<div class="grid fade">
   <div class="card">${periodBar()}<div style="margin-top:10px">${stampLine()}</div></div>
   <div class="grid g3">
    <div class="card"><h3>Tiền vào · ${esc(R.label)} ${delta(R.inc, prev && prev.inc)}</h3>
     <div class="big num">${cnt(R.inc, 'inc')}</div>
     <div class="sub">${n > 1 ? 'TB ' + short(R.inc / n) + '/tháng · ' : ''}${prev ? 'kỳ trước ' + short(prev.inc) : ''}</div>
     <div class="stats">
      <div class="stat" style="--c:var(--g-linhhoat)"><small><i></i>Chi tiêu</small><b class="num">${cnt(R.spend, 'spend')}</b><span>${pct(R.inc ? R.spend / R.inc : 0)} thu · ${delta(R.spend, prev && prev.spend, true)}</span></div>
      <div class="stat" style="--c:var(--g-tichluy)"><small><i></i>Tích lũy</small><b class="num">${cnt(R.tichluy, 'save')}</b><span>${pct(R.rate)} thu nhập</span></div>
      <div class="stat" style="--c:var(--mute)"><small><i></i>${R.free >= 0 ? 'Còn dư' : 'Thâm hụt'}</small><b class="num ${R.free < 0 ? 'down' : ''}">${cnt(R.free, 'free')}</b><span>${R.free >= 0 ? 'chưa phân bổ' : 'lấy tiền cũ bù'}</span></div>
     </div></div>
    ${bapCard(ai && !ST.hide ? `<p class="note" style="margin:12px 0 0"><b style="color:var(--ink)">Bắp AI:</b> ${esc(ai.tong)} <button class="btn sm" data-goto="health" style="margin-left:4px">Xem phân tích</button></p>` : '')}
   </div>
   <div class="grid g2">
    ${donutCard('out', drill ? GROUPS[drill].name : 'Tiền vào đi đâu', outItems, outTot, drill ? 'Tổng nhóm' : 'Tiền ra + còn dư', after, drill ? `<span class="crumb"><button data-drill="">‹ Tất cả</button></span>` : '<span class="sub">bấm nhóm để xem chi tiết</span>')}
    ${donutCard('in', 'Tiền vào từ đâu', inItems, R.inc, 'Tổng thu', after)}
   </div>
   <div class="card"><h3><b>Thu, chi, tích lũy theo tháng</b>${SEG('tr', [['6', '6T'], ['12', '12T'], ['24', '24T'], ['all', 'Tất cả']], trendR, 'sm')}</h3>
    ${MC.area(series, labels, aopts)}
    <div class="legend">${series.map(s => `<span><i style="--c:${s.color}"></i>${s.name}</span>`).join('')}</div></div>
   <div class="card"><h3><b>Chi nhiều nhất · ${esc(R.label)}</b><span class="sub">${prev ? 'so với kỳ trước' : ''}</span></h3>
    ${spendCats.map(x => `<div class="hb" data-cat="${x.c.id}" style="cursor:pointer"><span class="n">${esc(x.c.name)}</span><span class="tr"><u style="--c:${GC[x.c.group]}" data-grow="${(x.v / mx * 100).toFixed(1)}%"></u></span><b class="num">${short(x.v)}<small>${x.b != null ? (x.v >= x.b ? '▲ ' : '▼ ') + short(Math.abs(x.v - x.b)) : ''}</small></b></div>`).join('') || '<p class="note">Kỳ này chưa có khoản chi.</p>'}</div>
  </div>`;
}

/* ----- Sức khoẻ ----- */
function vHealth(after) {
  const H = F.health(M, ST.goals, ST.inv, ST.px), R = R0, ch = F.catChanges(M, R).slice(0, 12);
  const mx = Math.max(1, ...ch.map(x => Math.abs(x.d)));
  const ai = ST.ai && ST.ai.res;
  const aiBox = !ST.ai_on ? '<p class="note">Bắp AI đang tắt (Cài đặt).</p>'
    : aiBusy ? `<p class="note">Bắp đang đọc số liệu và suy nghĩ…</p><div class="shimmer" style="width:90%"></div><div class="shimmer" style="width:70%"></div><div class="shimmer" style="width:80%"></div>`
      : ai ? `<div class="ai"><p>${esc(ai.tong)}</p>
        ${ai.diem_manh && ai.diem_manh.length ? `<h5>Điểm mạnh</h5><ul>${ai.diem_manh.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${ai.can_cai_thien && ai.can_cai_thien.length ? `<h5>Cần cải thiện</h5><ul>${ai.can_cai_thien.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${ai.hanh_dong && ai.hanh_dong.length ? `<h5>Việc nên làm 30 ngày tới</h5>${ai.hanh_dong.map((x, i) => `<div class="todo"><b>${i + 1}</b><div>${esc(x.viec)}${x.vi_sao ? `<small>${esc(x.vi_sao)}</small>` : ''}</div></div>`).join('')}` : ''}
        ${ai.dau_tu ? `<h5>Đầu tư</h5><p>${esc(ai.dau_tu)}</p>` : ''}
        <p class="note" style="margin-top:12px">Gemini ${esc(ST.ai.model || '')} · ${new Date(ST.ai.at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}${ST.ai.err ? ' · lần gần nhất lỗi: ' + esc(ST.ai.err) : ''}</p></div>`
        : `<p class="note">${ST.ai && ST.ai.err ? 'Lỗi: ' + esc(ST.ai.err) + '. ' : ''}Bấm <b>Cập nhật</b> để Bắp (Gemini) phân tích. Cần thêm <code>GEMINI_KEY</code> vào Script Properties của Apps Script (xem hướng dẫn).</p>`;
  return `<div class="grid fade">
   <div class="card"><div class="hhero">${MC.ring(H.score, { size: 168, sw: 14, label: '/ 100' })}
    <div style="flex:1;min-width:220px"><span class="sub">Sức khoẻ tài chính</span><h2>${esc(H.grade)}</h2>
     <p class="note" style="margin:0 0 10px">Tính trên 12 tháng đủ số liệu đến tháng ${esc(M.months[H.i].label)}, cộng danh mục đầu tư và mục tiêu.</p>
     ${H.pillars.map(p => `<div class="hb"><span class="n">${esc(p.name)}</span><span class="tr"><u style="--c:${MC.scoreColor(p.score)}" data-grow="${p.score}%"></u></span><b class="num">${p.score}</b></div>`).join('')}
    </div></div></div>
   <div class="pill4">${H.pillars.map(p => `<div class="card"><div class="ptop">${MC.ring(p.score, { size: 64, sw: 7 })}<div><h4>${esc(p.name)}</h4><small>${esc(F.grade(p.score))}</small></div></div>
     ${p.items.map(x => `<div class="met"><span>${esc(x.n)}</span><b class="num">${ST.hide && /tr|k|đ/.test(x.v) ? '•••' : esc(x.v)}</b><small><span class="mbar"><u style="--c:${MC.scoreColor(x.s)}" data-grow="${x.s}%"></u></span>mục tiêu ${esc(x.goal)}</small></div>`).join('')}</div>`).join('')}</div>
   <div class="card"><h3><b>Hạng mục tăng / giảm</b>${periodBar()}</h3>
    <p class="note" style="margin:-4px 0 10px">${R.prev ? esc(R.label) + ' so với kỳ trước cùng độ dài. Xanh = giảm chi, đỏ = tăng chi.' : 'Kỳ này chưa có kỳ trước để so.'}</p>
    <div class="cbar">${ch.map(x => { const w = (Math.abs(x.d) / mx * 100).toFixed(1) + '%', up = x.d > 0; return `<div class="crow" data-cat="${x.c.id}" style="cursor:pointer" data-tip="${esc(`<b>${esc(x.c.name)}</b><div class="r"><span>Kỳ này</span><b>${short(x.now)}</b></div><div class="r"><span>Kỳ trước</span><b>${short(x.before)}</b></div>`)}"><span class="n">${esc(x.c.name)}</span><span class="l">${up ? '' : `<u data-grow="${w}"></u>`}</span><span class="r">${up ? `<u data-grow="${w}"></u>` : ''}</span><b class="num ${up ? 'up' : 'down'}">${sgn(x.d)}</b></div>`; }).join('') || '<p class="note">Không có thay đổi.</p>'}</div></div>
   <div class="card"><h3><b>Bắp AI phân tích</b>${ST.ai_on ? `<button class="btn sm" data-act="ai" ${aiBusy ? 'disabled' : ''}>Phân tích lại</button>` : ''}</h3>${ST.hide ? '<p class="note">Đang ẩn số tiền.</p>' : aiBox}</div>
  </div>`;
}

/* ----- Đầu tư ----- */
function vInv(after) {
  const pf = F.portfolio(ST.inv, ST.px), n = pf.H.length + pf.D.length;
  if (ST.pxAt && Date.now() - ST.pxAt > 30 * 60e3 && invList().length && !busy) setTimeout(() => refreshPrices(true).then(render), 50);
  const items = pf.H.map(h => ({ key: h.id, name: h.code, value: Math.max(0, h.value) })).concat(pf.D.map(d => ({ key: d.id, name: 'Gửi ' + (d.bank || 'ngân hàng'), value: d.now }))).sort((a, b) => b.value - a.value).map((x, i) => Object.assign(x, { color: MC.slot(i) }));
  const col = {}; items.forEach(x => col[x.key] = x.color);
  const hist = pf.hist.slice(-90), labels = hist.map(h => h[0].slice(8, 10) + '/' + h[0].slice(5, 7));
  const series = [{ name: 'Giá trị danh mục', values: hist.map(h => h[1]), color: pf.pl >= 0 ? 'var(--gain)' : 'var(--loss)', area: true }];
  const aopts = { id: 'pf', h: 200, zero: false, fmt: short, fmtAxis: F.short, aria: 'Giá trị danh mục theo ngày' };
  if (hist.length > 1) after.push(() => MC.wireArea(document.querySelector('[data-area="pf"]'), series, labels, aopts, showTip, hideTip));
  const dopts = { id: 'alloc', total: pf.total, center: { label: 'Tổng tài sản', value: short(pf.total), sub: n + ' khoản' }, fmt: short, aria: 'Phân bổ danh mục' };
  if (items.length) after.push(() => MC.wireDonut(document.querySelector('[data-donut="alloc"]'), items, dopts));
  const pxDate = Object.values(ST.px).map(p => p.ngay).filter(Boolean).sort().pop();
  return `<div class="grid fade">
   <div class="grid g3">
    <div class="card"><h3>Tổng tài sản đầu tư ${pf.cost ? `<span class="chip ${pf.pl >= 0 ? 'up' : 'down'}">${pf.pl >= 0 ? '▲' : '▼'} ${pct1(Math.abs(pf.pl / pf.cost))} · ${sgn(pf.pl)}</span>` : ''}</h3>
     <div class="big num">${cnt(pf.total, 'pf')}</div>
     <div class="sub">Hôm nay ${pf.day ? `<b class="${pf.day >= 0 ? 'up' : 'down'}">${sgn(pf.day)}</b>` : '0'} · vốn ${short(pf.cost)}${pxDate ? ' · giá ngày ' + pxDate.split('-').reverse().join('/') : ''}</div>
     ${hist.length > 1 ? `<div style="margin-top:12px">${MC.area(series, labels, aopts)}</div><p class="note" style="margin:6px 0 0">Tính theo số lượng đang nắm giữ, giá đóng cửa từng ngày, cộng tiền gửi.</p>` : ''}
     <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn pri sm" data-act="hnew">+ Cổ phiếu / quỹ</button><button class="btn sm" data-act="dnew">+ Tiền gửi</button><button class="btn sm" data-act="himp">Nhập nhanh nhiều mã</button><button class="btn sm" data-act="px" ${busy ? 'disabled' : ''}>Cập nhật giá</button></div></div>
    <div class="card"><h3><b>Phân bổ</b></h3>${items.length ? `<div class="dwrap">${MC.donut(items, dopts)}<div class="leg">${legendRows(items, pf.total, 'alloc')}</div></div>` : '<p class="note">Thêm cổ phiếu, chứng chỉ quỹ hoặc tiền gửi để xem phân bổ và lãi/lỗ theo ngày.</p>'}</div>
   </div>
   <div class="card"><h3><b>Cổ phiếu · ETF · quỹ mở</b><span class="sub">${pf.H.length} mã</span></h3>
    ${pf.H.map(h => { const s = h.series.slice(-60).map(x => x[1]); return `<button class="hold" data-hold="${h.id}"><span class="tk" style="--c:${col[h.id]}">${esc(h.code.slice(0, 5))}</span><span class="nm"><b>${esc(h.code)} <small class="sub">${h.type === 'quy' ? 'quỹ mở' : 'CP/ETF'}</small></b><small>${h.qty} × ${short(h.price)} · vốn ${short(h.cost / (h.qty || 1))}${h.err ? ' · ' + esc(h.err) : ''}</small></span>${MC.spark(s, h.pl >= 0 ? 'var(--gain)' : 'var(--loss)')}<span class="v"><b class="num">${short(h.value)}</b><small class="num ${h.pl >= 0 ? 'up' : 'down'}">${sgn(h.pl)} · ${h.plPct >= 0 ? '+' : ''}${pct1(h.plPct)}</small></span></button>`; }).join('') || '<p class="note">Chưa có mã nào. Giá lấy tự động theo ngày (VNDirect cho cổ phiếu/ETF, Fmarket cho quỹ mở).</p>'}</div>
   <div class="card"><h3><b>Tiền gửi ngân hàng</b><span class="sub">${pf.D.length} sổ</span></h3>
    ${pf.D.map(d => `<button class="hold" data-dep="${d.id}"><span class="tk" style="--c:${col[d.id]}">${esc((d.bank || 'NH').slice(0, 4).toUpperCase())}</span><span class="nm"><b>${esc(d.bank || 'Tiền gửi')} <small class="sub">${String(d.rate).replace('.', ',')}%/năm</small></b><small>${d.start ? d.start.split('-').reverse().join('/') : ''}${d.term ? ' · ' + d.term + 'th · còn ' + d.daysLeft + ' ngày' : ' · không kỳ hạn'}</small></span><svg class="sp"></svg><span class="v"><b class="num">${short(d.now)}</b><small class="num up">+${short(d.interest)} lãi</small>${d.atMat ? `<small class="sub">đáo hạn ${short(d.atMat)}</small>` : ''}</span></button>`).join('') || '<p class="note">Chưa có sổ tiết kiệm. Nhập số tiền, lãi suất, ngày gửi và kỳ hạn để app tự tính lãi tới hôm nay.</p>'}</div>
  </div>`;
}
function holdForm(h) {
  h = h || {};
  sheet(`<h2>${h.id ? 'Sửa mã' : 'Thêm cổ phiếu / quỹ'}</h2><div class="sub">Giá đóng cửa cập nhật mỗi ngày khi bấm Cập nhật.</div>
  <div class="f"><label>Loại</label><div class="chips" id="hT"><button data-t="cp" class="${h.type !== 'quy' ? 'on' : ''}">Cổ phiếu / ETF (HOSE, HNX)</button><button data-t="quy" class="${h.type === 'quy' ? 'on' : ''}">Chứng chỉ quỹ mở</button></div></div>
  <div class="f2"><div class="f"><label>Mã</label><input id="hC" value="${esc(h.code || '')}" placeholder="VD: FPT, E1VFVN30, DCDS" autocapitalize="characters"></div><div class="f"><label>Số lượng (cổ / ccq)</label><input id="hQ" inputmode="decimal" value="${h.qty || ''}"></div></div>
  <div class="f2"><div class="f"><label>Giá vốn trung bình (đ)</label><input id="hP" inputmode="decimal" value="${h.cost || ''}" placeholder="VD: 40000 hoặc 40k"></div><div class="f"><label>Ngày mua (không bắt buộc)</label><input id="hD" type="date" value="${h.date || ''}"></div></div>
  <div class="f"><label>Giá tự nhập khi không lấy được giá (không bắt buộc)</label><input id="hM" inputmode="decimal" value="${h.manual || ''}"></div>
  <button class="btn pri full" id="hS">Lưu</button>${h.id ? '<button class="btn del full" id="hX" style="margin-top:8px">Xoá mã này</button>' : ''}`);
  let type = h.type || 'cp';
  $('#hT').onclick = e => { const b = e.target.closest('button'); if (!b) return; type = b.dataset.t; $$('#hT button').forEach(x => x.classList.toggle('on', x === b)); };
  $('#hS').onclick = () => { const code = $('#hC').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''), qty = Number(String($('#hQ').value).replace(/[^\d.]/g, '')), cost = parseAmt($('#hP').value, true);
    if (!code || !qty) return toast('Cần mã và số lượng');
    const o = { id: h.id || 'h' + Date.now().toString(36), type, code, qty, cost, date: $('#hD').value || '', manual: parseAmt($('#hM').value, true) || '' };
    const L = ST.inv.holdings, i = L.findIndex(x => x.id === o.id); if (i >= 0) L[i] = o; else L.push(o);
    save(true, 'inv'); closeSheet(); render(); refreshPrices(true).then(render); };
  if (h.id) $('#hX').onclick = e => { if (!e.target.dataset.sure) { e.target.dataset.sure = 1; e.target.textContent = 'Bấm lần nữa để xoá'; return; } ST.inv.holdings = ST.inv.holdings.filter(x => x.id !== h.id); save(true, 'inv'); closeSheet(); render(); };
}
function importForm() {
  sheet(`<h2>Nhập nhanh danh mục</h2><div class="sub">Mỗi dòng một mã: <b>MÃ  SỐ LƯỢNG  GIÁ VỐN</b>. Giá vốn gõ như app chứng khoán (65.5 = 65.500 đ). Thêm chữ <b>quy</b> cuối dòng nếu là quỹ mở. Mã đã có sẽ được thay.</div>
  <div class="f"><textarea id="iT" rows="8" placeholder="VNM 100 65.5&#10;HPG 200 27.3&#10;VESAF 50 29000 quy"></textarea></div>
  <div class="note" id="iP"></div><button class="btn pri full" id="iS">Lưu danh mục</button>`);
  const parse = () => $('#iT').value.split(/\n+/).map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.toUpperCase().replace(/,/g, '').match(/^([A-Z0-9]{2,12})\s+([\d.]+)\s+([\d.]+)(?:\s+(QUY|QUỸ))?/);
    if (!m) return { bad: l };
    let qty = Number(m[2].replace(/\.(?=\d{3}\b)/g, '')), cost = Number(m[3]); if (cost < 1000) cost = Math.round(cost * 1000);
    return { code: m[1], qty, cost, type: m[4] ? 'quy' : 'cp' };
  });
  $('#iT').oninput = () => { const r = parse(); $('#iP').innerHTML = r.map(x => x.bad ? `<span class="down">Không hiểu: ${esc(x.bad)}</span>` : `${esc(x.code)}: ${x.qty} × ${F.vnd(x.cost)} = ${F.short(x.qty * x.cost)}`).join('<br>'); };
  $('#iS').onclick = () => { const r = parse().filter(x => !x.bad && x.qty > 0); if (!r.length) return toast('Chưa có dòng hợp lệ');
    r.forEach(x => { const L = ST.inv.holdings, i = L.findIndex(h => h.code === x.code), o = Object.assign({ id: i >= 0 ? L[i].id : 'h' + Date.now().toString(36) + x.code, date: '', manual: '' }, x); if (i >= 0) L[i] = Object.assign(L[i], o); else L.push(o); });
    save(true, 'inv'); closeSheet(); render(); toast('Đã lưu ' + r.length + ' mã, đang lấy giá…'); refreshPrices(true).then(render); };
}
function depForm(d) {
  d = d || {};
  sheet(`<h2>${d.id ? 'Sửa tiền gửi' : 'Thêm tiền gửi'}</h2><div class="sub">App tính lãi đơn theo ngày tới hôm nay và giá trị lúc đáo hạn.</div>
  <div class="f2"><div class="f"><label>Ngân hàng</label><input id="dB" value="${esc(d.bank || '')}" placeholder="VD: VIB"></div><div class="f"><label>Số tiền gửi</label><input id="dA" inputmode="decimal" value="${d.amt ? F.short(d.amt).replace(/\s/g, '') : ''}" placeholder="VD: 30tr"></div></div>
  <div class="f2"><div class="f"><label>Lãi suất (%/năm)</label><input id="dR" inputmode="decimal" value="${d.rate || ''}" placeholder="VD: 5,2"></div><div class="f"><label>Kỳ hạn (tháng, 0 = không kỳ hạn)</label><input id="dT" inputmode="numeric" value="${d.term ?? ''}"></div></div>
  <div class="f"><label>Ngày gửi</label><input id="dS" type="date" value="${d.start || ''}"></div>
  <button class="btn pri full" id="dSv">Lưu</button>${d.id ? '<button class="btn del full" id="dX" style="margin-top:8px">Xoá sổ này</button>' : ''}`);
  $('#dSv').onclick = () => { const amt = parseAmt($('#dA').value), rate = Number(String($('#dR').value).replace(',', '.')) || 0;
    if (!amt || !$('#dS').value) return toast('Cần số tiền và ngày gửi');
    const o = { id: d.id || 'd' + Date.now().toString(36), bank: $('#dB').value.trim(), amt, rate, term: Number($('#dT').value) || 0, start: $('#dS').value };
    const L = ST.inv.deposits, i = L.findIndex(x => x.id === o.id); if (i >= 0) L[i] = o; else L.push(o); save(true, 'inv'); closeSheet(); render(); };
  if (d.id) $('#dX').onclick = e => { if (!e.target.dataset.sure) { e.target.dataset.sure = 1; e.target.textContent = 'Bấm lần nữa để xoá'; return; } ST.inv.deposits = ST.inv.deposits.filter(x => x.id !== d.id); save(true, 'inv'); closeSheet(); render(); };
}

/* ----- hạng mục chi tiết ----- */
function openCat(id) {
  const c = M.cats.find(x => x.id === id); if (!c) return; const end = R0.b, a = Math.max(0, end - 23);
  const vals = c.vals.slice(a, end + 1), labels = M.months.slice(a, end + 1).map(m => m.label.replace(/\/20(\d\d)/, '/$1'));
  const notes = []; for (let i = M.months.length - 1; i >= 0; i--) { const t = [c.note[i], ...c.cm[i], c.txt[i]].filter(Boolean); if (t.length) notes.push(`<div><b>${M.months[i].label}</b> <span>${short(c.vals[i])}</span><br>${esc(t.join(' · ')).replace(/\n/g, '<br>')}</div>`); }
  const series = [{ name: c.name, values: vals, color: GC[c.group], area: true }], aopts = { id: 'cat', h: 190, w: 600, fmt: short, fmtAxis: F.short };
  const R12 = F.range(M, end - 11, end);
  sheet(`<h2>${esc(c.name)}</h2><div class="sub">${GROUPS[c.group].name} · dòng ${c.row + 1} trong sheet</div>
   <div class="stats" style="grid-template-columns:1fr 1fr"><div class="stat"><small>12 tháng</small><b class="num">${short(R12.cat[c.id])}</b><span>TB ${short(R12.cat[c.id] / 12)}/tháng</span></div><div class="stat"><small>${esc(R0.label)}</small><b class="num">${short(R0.cat[c.id] || 0)}</b><span>${R0.prev ? 'kỳ trước ' + short(R0.prev.cat[c.id] || 0) : ''}</span></div></div>
   <div style="margin:14px 0">${MC.area(series, labels, aopts)}</div>
   <div class="f"><label>Nhóm của hạng mục này</label><select data-map="${esc(c.name)}">${(c.sec === 'thu' ? ['thu'] : ['codinh', 'linhhoat', 'tichluy']).map(g => `<option value="${g}" ${c.group === g ? 'selected' : ''}>${GROUPS[g].name}</option>`).join('')}</select></div>
   <h3 class="sub" style="margin:16px 0 4px">GHI CHÚ TRONG SHEET</h3><div class="nlist">${notes.join('') || '<p class="note">Chưa có ghi chú.</p>'}</div>`);
  MC.wireArea(document.querySelector('[data-area="cat"]'), series, labels, aopts, showTip, hideTip);
}

/* ----- Mục tiêu ----- */
function goalCard(g) {
  const p = F.goalProgress(M, g), sv = F.avgBefore(M, F.lastFull(M) + 1, 12, 'tichluy');
  const st = p.done ? ['up', 'Đã đạt'] : p.need == null ? null : sv >= p.need ? ['up', 'Đúng tiến độ'] : ['warn', 'Cần tăng tốc'];
  return `<div class="goal"><div class="top"><div><b>${esc(g.name)}</b><small>${g.kind === 'dai' ? 'Dài hạn' : 'Ngắn hạn'}${g.deadline ? ' · hạn ' + g.deadline.split('-').reverse().join('/') : ''}${g.link && g.link.length ? ' · tự cộng: ' + esc(g.link.join(', ')) : ''}</small></div>${st ? `<span class="chip ${st[0]}">${st[1]}</span>` : ''}</div>
   <div class="prog"><u data-grow="${(p.p * 100).toFixed(1)}%"></u></div>
   <div class="meta num"><span><b>${short(p.cur)}</b> / ${short(p.target)} · ${pct(p.p)}</span>${p.done ? '' : `<span>còn ${short(p.remain)}${p.left != null ? ' · ' + p.left + ' tháng · cần <b>' + short(p.need) + '</b>/tháng' : ''}</span>`}</div>
   ${g.note ? `<p class="note" style="margin:8px 0 0">${esc(g.note)}</p>` : ''}<div style="margin-top:10px;display:flex;gap:8px"><button class="btn sm" data-gedit="${g.id}">Sửa</button>${!(g.link && g.link.length) ? `<button class="btn sm" data-gadd="${g.id}">+ Cộng thêm tiền</button>` : ''}</div></div>`;
}
function vGoals() {
  const sv = M.cats.filter(c => c.group === 'tichluy'), all = F.range(M, 0, M.mon.length - 1), tot = sv.reduce((s, c) => s + all.cat[c.id], 0), i = F.lastFull(M);
  const sp12 = F.avgBefore(M, i + 1, 12, 'spend'), sv12 = F.avgBefore(M, i + 1, 12, 'tichluy'), mx = Math.max(1, ...sv.map(c => all.cat[c.id]));
  return `<div class="grid fade"><div class="grid g2">
   <div class="card"><h3>Đã tích lũy từ ${M.months[0].label}</h3><div class="big num">${cnt(tot, 'tot')}</div><div class="sub">TB 12 tháng: để dành ${short(sv12)}/tháng · chi ${short(sp12)}/tháng</div>
    ${sv.map(c => `<div class="hb"><span class="n">${esc(c.name)}</span><span class="tr"><u style="--c:var(--g-tichluy)" data-grow="${(Math.max(0, all.cat[c.id]) / mx * 100).toFixed(1)}%"></u></span><b class="num">${short(all.cat[c.id])}</b></div>`).join('')}</div>
   <div class="card"><h3><b>Bắp gợi ý</b></h3><div class="chips"><button data-gsug="ef">Quỹ dự phòng 6 tháng · ${short(sp12 * 6)}</button><button data-gsug="ef3">Quỹ dự phòng 3 tháng · ${short(sp12 * 3)}</button><button data-gsug="big">Món lớn sắp mua</button><button data-gsug="trip">Chuyến du lịch</button><button data-gsug="inv">Danh mục đầu tư</button></div></div></div>
   <div class="grid g2"><div class="card"><h3><b>Ngắn hạn</b><span class="sub">dưới 1 năm</span></h3>${ST.goals.filter(g => g.kind !== 'dai').map(goalCard).join('') || '<p class="note">Chưa có mục tiêu ngắn hạn.</p>'}<button class="btn sm" data-act="gnew" data-kind="ngan">+ Thêm mục tiêu ngắn hạn</button></div>
   <div class="card"><h3><b>Dài hạn</b></h3>${ST.goals.filter(g => g.kind === 'dai').map(goalCard).join('') || '<p class="note">Chưa có mục tiêu dài hạn.</p>'}<button class="btn sm" data-act="gnew" data-kind="dai">+ Thêm mục tiêu dài hạn</button></div></div></div>`;
}
function goalForm(g) {
  const sv = M.cats.filter(c => c.group === 'tichluy').map(c => c.name), linked = g.link && g.link.length, now = new Date(), ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  sheet(`<h2>${g.id ? 'Sửa mục tiêu' : 'Mục tiêu mới'}</h2>
  <div class="f"><label>Tên mục tiêu</label><input id="gN" value="${esc(g.name || '')}" placeholder="VD: Quỹ dự phòng, Mua xe"></div>
  <div class="f"><label>Loại</label><div class="chips" id="gK"><button data-k="ngan" class="${g.kind !== 'dai' ? 'on' : ''}">Ngắn hạn</button><button data-k="dai" class="${g.kind === 'dai' ? 'on' : ''}">Dài hạn</button></div></div>
  <div class="f2"><div class="f"><label>Số tiền mục tiêu</label><input id="gT" inputmode="decimal" value="${g.target ? F.short(g.target).replace(/\s/g, '') : ''}" placeholder="VD: 150tr"></div><div class="f"><label>Hạn hoàn thành</label><input id="gD" type="month" value="${g.deadline || ''}"></div></div>
  <div class="f"><label>Tính tiến độ</label><div class="chips" id="gL"><button data-l="1" class="${linked ? 'on' : ''}">Tự cộng từ sheet</button><button data-l="0" class="${linked ? '' : 'on'}">Tự nhập số đã có</button></div></div>
  <div id="gLink" ${linked ? '' : 'hidden'}><div class="f"><label>Cộng các hạng mục</label><div class="ck">${sv.map(n => `<label><input type="checkbox" value="${esc(n)}" ${linked && g.link.includes(n) ? 'checked' : ''}>${esc(n)}</label>`).join('')}</div></div><div class="f"><label>Tính từ tháng</label><input id="gF" type="month" value="${g.from || ym}"></div></div>
  <div class="f"><label id="gSL">${linked ? 'Số đã có trước tháng bắt đầu' : 'Số tiền đã có'}</label><input id="gS" inputmode="decimal" value="${linked ? (g.start ? F.short(g.start).replace(/\s/g, '') : '') : (g.cur != null ? F.short(g.cur).replace(/\s/g, '') : '')}" placeholder="0"></div>
  <div class="f"><label>Ghi chú</label><input id="gO" value="${esc(g.note || '')}"></div>
  <button class="btn pri full" id="gSave">Lưu mục tiêu</button>${g.id ? '<button class="btn del full" id="gDel" style="margin-top:8px">Xoá mục tiêu</button>' : ''}`);
  let kind = g.kind || 'ngan', lk = !!linked;
  $('#gK').onclick = e => { const b = e.target.closest('button'); if (!b) return; kind = b.dataset.k; $$('#gK button').forEach(x => x.classList.toggle('on', x === b)); };
  $('#gL').onclick = e => { const b = e.target.closest('button'); if (!b) return; lk = b.dataset.l === '1'; $$('#gL button').forEach(x => x.classList.toggle('on', x === b)); $('#gLink').hidden = !lk; $('#gSL').textContent = lk ? 'Số đã có trước tháng bắt đầu' : 'Số tiền đã có'; };
  $('#gSave').onclick = () => { const name = $('#gN').value.trim(), target = parseAmt($('#gT').value); if (!name || !target) return toast('Cần tên và số tiền mục tiêu');
    const o = { id: g.id || 'g' + Date.now().toString(36), name, kind, target, deadline: $('#gD').value || '', note: $('#gO').value.trim() }, s = parseAmt($('#gS').value) || 0;
    if (lk) { o.link = $$('#gLink input:checked').map(x => x.value); if (!o.link.length) return toast('Chọn ít nhất 1 hạng mục'); o.from = $('#gF').value || '0000-00'; o.start = s; } else { o.link = []; o.cur = s; o.start = 0; }
    const i = ST.goals.findIndex(x => x.id === o.id); if (i >= 0) ST.goals[i] = o; else ST.goals.push(o); save(true, 'goals'); closeSheet(); render(); toast('Đã lưu mục tiêu'); };
  if (g.id) $('#gDel').onclick = e => { const b = e.target; if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Bấm lần nữa để xoá'; return; } ST.goals = ST.goals.filter(x => x.id !== g.id); save(true, 'goals'); closeSheet(); render(); };
}

/* ----- Sổ ghi ----- */
function txRow(t) { const d = t.d || new Date(t.ts), inn = t.loai === 'thu'; return `<div class="tx"><span class="tm num">${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span><div class="nm"><b>${esc(t.hang_muc)}</b><small>${esc(t.ghi_chu || '')}${t.pend ? ' · đang gửi lên sheet' : ''}${t.err ? ' · lỗi: ' + esc(t.err) : ''}</small></div><span class="v num ${inn ? 'in' : ''}">${inn ? '+' : '−'}${short(t.so_tien)}</span>${t.pend ? (t.err ? `<button data-pdel="${t.id}">Bỏ</button>` : '') : `<button data-tdel="${t.id}" aria-label="Xoá">✕</button>`}</div>`; }
function vLog() {
  if (!logYM) { const n = new Date(); logYM = { y: n.getFullYear(), m: n.getMonth() + 1 }; }
  const mo = logYM, si = M.months.findIndex(x => x.y === mo.y && x.m === mo.m), inM = t => { const d = t.d || new Date(t.ts); return d.getFullYear() === mo.y && d.getMonth() + 1 === mo.m; };
  const list = ST.pending.map(p => Object.assign({}, p, { pend: 1, d: new Date(p.ts) })).concat(M.tx).filter(inM).sort((a, b) => b.d - a.d);
  const days = {}; list.forEach(t => { const k = t.d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' }); (days[k] = days[k] || []).push(t); });
  const thu = list.filter(t => t.loai === 'thu').reduce((s, t) => s + t.so_tien, 0), chi = list.filter(t => t.loai !== 'thu').reduce((s, t) => s + t.so_tien, 0);
  const notes = []; if (si >= 0) M.cats.forEach(c => { const t = [c.note[si], ...c.cm[si], c.txt[si]].filter(Boolean); if (t.length) notes.push(`<div><b>${esc(c.name)}</b> <span>${short(c.vals[si])}</span><br>${esc(t.join(' · ')).replace(/\n/g, '<br>')}</div>`); });
  return `<div class="grid fade g2"><div class="card"><h3><div class="step"><button data-act="lprev" aria-label="Tháng trước">‹</button><b>Tháng ${mo.m}/${mo.y}</b><button data-act="lnext" aria-label="Tháng sau">›</button></div><span class="sub">ghi từ app: +${short(thu)} / −${short(chi)}</span></h3>
   ${list.length ? Object.entries(days).map(([k, ts]) => `<div class="day"><span>${esc(k)}</span><span class="num">${sgn(ts.reduce((s, t) => s + (t.loai === 'thu' ? t.so_tien : -t.so_tien), 0))}</span></div>` + ts.map(txRow).join('')).join('') : `<div class="empty"><p>Tháng này chưa ghi khoản nào từ app.</p><button class="btn pri" data-act="add">Ghi khoản đầu tiên</button></div>`}</div>
   <div class="card"><h3><b>Ghi chú trong sheet · ${mo.m}/${mo.y}</b></h3><div class="nlist">${si < 0 ? '<p class="note">Sheet chưa có cột tháng này. Ghi khoản đầu tiên từ app là sheet tự tạo cột.</p>' : notes.join('') || '<p class="note">Không có ghi chú.</p>'}</div></div></div>`;
}

/* ===== ghi thu chi ===== */
function parseAmt(s, exact) {
  s = String(s || '').toLowerCase().replace(/\s/g, '').replace(/đ|vnd|₫/g, ''); if (!s) return 0;
  let m = s.match(/^(\d+)(?:tr|m)(\d+)$/); if (m) return (+m[1]) * 1e6 + (+m[2]) * Math.pow(10, 6 - m[2].length);
  m = s.match(/^(\d+(?:[.,]\d+)?)(k|n|tr|m|t|ty|tỷ)$/); if (m) { const v = +m[1].replace(',', '.'), u = m[2]; return Math.round(v * (u === 'k' || u === 'n' ? 1e3 : u === 'ty' || u === 'tỷ' ? 1e9 : 1e6)); }
  const n = +s.replace(/[.,]/g, ''); if (!isFinite(n)) return 0; return !exact && n < 1000 ? n * 1000 : n;
}
function openAdd() {
  if (!M) return toast('Kết nối sheet trước đã');
  let loai = 'chi'; const now = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16), GO = { thu: 0, linhhoat: 1, codinh: 2, tichluy: 3 };
  const cats = () => M.cats.filter(c => loai === 'thu' ? c.sec === 'thu' : c.sec !== 'thu').sort((a, b) => ((ST.recent[b.name] || 0) - (ST.recent[a.name] || 0)) || (GO[a.group] - GO[b.group])).map(c => c.name);
  let hm = (() => { const cs = cats(); return Object.keys(ST.recent).length ? cs[0] : (cs.find(n => /an uong/.test(F.norm(n))) || cs[0]); })();
  sheet(`<h2>Ghi thu chi</h2><div class="sub">Cộng thẳng vào ô tháng trên sheet, kèm ghi chú ngày giờ.</div>
  <div class="f"><div class="chips" id="aT"><button data-t="chi" class="on">Tiền ra</button><button data-t="thu">Tiền vào</button></div></div>
  <div class="f"><input id="aA" class="amt num" inputmode="decimal" placeholder="0" autocomplete="off"><div class="amtp num" id="aP">Gõ 120k, 1,5tr, 2tr5 hoặc 50 (= 50.000)</div>
   <div class="chips" style="margin-top:8px">${['20k', '50k', '100k', '200k', '500k', '1tr'].map(x => `<button data-q="${x}">${x}</button>`).join('')}</div></div>
  <div class="f"><label>Hạng mục</label><div class="chips" id="aC"></div></div>
  <div class="f"><label>Ghi chú</label><input id="aN" placeholder="VD: cafe với Đạt" maxlength="120"></div>
  <div class="f"><label>Ngày giờ</label><input id="aD" type="datetime-local" value="${now}"></div>
  <button class="btn pri full" id="aS">Lưu vào sheet</button>`);
  const drawC = () => { const cs = cats(); if (!cs.includes(hm)) hm = cs[0]; $('#aC').innerHTML = cs.map(n => `<button data-c="${esc(n)}" class="${n === hm ? 'on' : ''}">${esc(n)}</button>`).join(''); }; drawC();
  const prev = () => { const v = parseAmt($('#aA').value); $('#aP').textContent = v ? '= ' + F.vnd(v) : 'Gõ 120k, 1,5tr, 2tr5 hoặc 50 (= 50.000)'; };
  $('#aA').oninput = prev; setTimeout(() => $('#aA').focus(), 250);
  $('#aT').onclick = e => { const b = e.target.closest('button'); if (!b) return; loai = b.dataset.t; $$('#aT button').forEach(x => x.classList.toggle('on', x === b)); drawC(); };
  $('#aC').onclick = e => { const b = e.target.closest('button'); if (!b) return; hm = b.dataset.c; drawC(); };
  $$('[data-q]').forEach(b => b.onclick = () => { $('#aA').value = b.dataset.q; prev(); });
  $('#aS').onclick = async () => { const amt = parseAmt($('#aA').value); if (!amt) return toast('Nhập số tiền'); const d = new Date($('#aD').value || Date.now());
    const p = { id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: d.toISOString(), loai, hang_muc: hm, so_tien: amt, ghi_chu: $('#aN').value.trim() };
    ST.pending.push(p); ST.recent[hm] = Date.now(); save(false); closeSheet(); logYM = { y: d.getFullYear(), m: d.getMonth() + 1 }; tab = 'log'; render();
    try { await api('them', { gd: p }); ST.pending = ST.pending.filter(x => x.id !== p.id); save(false); toast('Đã ghi ' + F.short(amt) + ' · ' + hm); await refresh(true); }
    catch (e) { if (/Không thấy dòng|không hợp lệ|chứa chữ|không có cột/.test(e.message)) p.err = e.message; save(false); toast(p.err ? 'Sheet từ chối: ' + e.message : 'Chưa gửi được, app sẽ tự gửi lại khi có mạng'); render(); } };
}

/* ===== cài đặt ===== */
function openSettings() {
  sheet(`<h2>Cài đặt</h2>
  <h3 class="sub" style="margin:16px 0 0">KẾT NỐI GOOGLE SHEET</h3>
  <div class="f"><label>Link web app Apps Script</label><input id="sU" value="${esc(ST.cfg.url)}" placeholder="https://script.google.com/macros/s/…/exec"></div>
  <div class="f"><label>Mã kết nối (APP_KEY)</label><input id="sK" type="password" value="${esc(ST.cfg.key)}" placeholder="Chạy hàm caiDat() để lấy mã"></div>
  <button class="btn pri full" id="sSave">Lưu và cập nhật</button>
  <p class="note">Link, mã, danh mục đầu tư và mục tiêu được mã hoá bằng mật khẩu 6 số trước khi lưu. <a href="${GUIDE}" target="_blank" rel="noopener">Hướng dẫn</a></p>
  <h3 class="sub" style="margin:18px 0 4px">BẮP AI (GEMINI)</h3><p class="note" style="margin:0 0 8px">Chạy khi bấm Cập nhật. Cần <code>GEMINI_KEY</code> trong Script Properties. App chỉ gửi số liệu tổng hợp theo tháng, không gửi ghi chú.</p>
  <div class="chips" id="sAI"><button data-v="1" class="${ST.ai_on ? 'on' : ''}">Bật</button><button data-v="0" class="${ST.ai_on ? '' : 'on'}">Tắt</button></div>
  <h3 class="sub" style="margin:18px 0 4px">NHÓM HẠNG MỤC</h3><p class="note" style="margin:0 0 6px">Tích lũy không tính là tiêu xài.</p>
  ${M ? M.cats.filter(c => c.sec !== 'thu').map(c => `<div class="mapr"><i class="gdot" style="--c:${GC[c.group]}"></i><span>${esc(c.name)}</span><select data-map="${esc(c.name)}">${['codinh', 'linhhoat', 'tichluy'].map(g => `<option value="${g}" ${c.group === g ? 'selected' : ''}>${GROUPS[g].short}</option>`).join('')}</select></div>`).join('') : '<p class="note">Cập nhật dữ liệu trước.</p>'}
  <h3 class="sub" style="margin:18px 0 4px">MẬT KHẨU 6 SỐ</h3><p class="note" style="margin:0 0 8px">Tự khoá khi rời app quá 3 phút hoặc 10 phút không thao tác.</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" id="sSync">Đồng bộ ngay</button><button class="btn sm" id="sPin">Đổi mật khẩu</button><button class="btn sm" id="sLock">Khoá ngay</button></div>
  <h3 class="sub" style="margin:18px 0 4px">TÀI KHOẢN</h3><p class="note" style="margin:0 0 8px">${user ? esc(user.email || user.displayName || '') : 'Chưa đăng nhập'}</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn sm" href="${ACAD}" style="text-decoration:none">Về Học viện</a>${user ? '<button class="btn sm" id="sOut">Đăng xuất</button>' : ''}</div>`);
  $('#sSave').onclick = () => { const u = $('#sU').value.trim(), k = $('#sK').value.trim(); if (!okUrl(u)) return toast('Link phải có dạng https://script.google.com/macros/s/…/exec'); if (k.length < 16) return toast('Mã kết nối chưa đúng'); ST.cfg = { url: u, key: k }; save(true, 'cfg'); closeSheet(); refresh(); };
  $('#sAI').onclick = e => { const b = e.target.closest('button'); if (!b) return; ST.ai_on = b.dataset.v === '1'; $$('#sAI button').forEach(x => x.classList.toggle('on', x === b)); save(true, 'ai_on'); };
  $('#sSync').onclick = async () => { if (!fb || !ref) return toast('Chưa đăng nhập Google'); toast('Đang đồng bộ…'); await pushCloud(); toast('Đã đồng bộ với các máy khác'); };
  $('#sPin').onclick = () => { closeSheet(); showLock('change1'); }; $('#sLock').onclick = () => { closeSheet(); lockNow(); };
  if ($('#sOut')) $('#sOut').onclick = () => fb && fb.auth.signOut(fb.A).then(() => location.reload());
}

/* ===== sheet & sự kiện ===== */
function sheet(h) { $('#sheetIn').innerHTML = '<div class="grab"></div>' + h; $('#sheet').classList.add('on'); }
function closeSheet() { $('#sheet').classList.remove('on'); hideTip(); }
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
document.addEventListener('change', e => {
  const s = e.target.closest('select[data-map]'); if (s) { ST.map[s.dataset.map] = s.value; save(true, 'map'); build(); render(); return; }
  const pf = e.target.closest('select[data-pf]'); if (pf) { P[pf.dataset.pf] = pf.value; render(); }
});
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (!b) return; if (b.dataset.tab === 'add') return openAdd(); go(b.dataset.tab); });
function go(t) { tab = t; history.replaceState(null, '', '?tab=' + tab + (DEMO ? '&demo=1' : '')); render(); scrollTo({ top: 0, behavior: 'smooth' }); }
$('#bUpd').onclick = () => { if (K) refresh(); }; $('#bSet').onclick = () => { if (K) openSettings(); }; $('#bLock').onclick = lockNow;
$('#bHide').onclick = () => { if (!K) return; ST.hide = !ST.hide; save(false); render(); };
function shiftP(dir) {
  const ms = M.months;
  if (P.t === 'thang') P.i = Math.max(0, Math.min(ms.length - 1, P.i + dir));
  else if (P.t === 'quy') { let q = P.q + dir, y = P.y; if (q < 1) { q = 4; y--; } if (q > 4) { q = 1; y++; } if (ms.some(m => m.y === y && Math.ceil(m.m / 3) === q)) { P.q = q; P.y = y; } }
  else if (P.t === 'nam') { const y = P.y + dir; if (ms.some(m => m.y === y)) P.y = y; }
  drill = null; render();
}
function setPT(t) {
  const ms = M.months, cur = P.t === 'thang' ? ms[P.i] : ms[F.lastIdx(M)];
  P = { t, i: P.t === 'thang' ? P.i : F.lastIdx(M), y: cur.y, q: Math.ceil(cur.m / 3), from: ms[Math.max(0, ms.indexOf(cur) - 5)].k, to: cur.k };
  drill = null; render();
}
document.addEventListener('click', e => {
  const sg = e.target.closest && e.target.closest('[data-donut="out"] .dseg'); if (!sg || drill || !M || !K) return;
  const it = outflowItems(R0)[+sg.dataset.di]; if (it && GROUPS[it.key]) { drill = it.key; render(); }
});
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-act],[data-pt],[data-tr],[data-drill],[data-cat],[data-gedit],[data-gadd],[data-gsug],[data-tdel],[data-pdel],[data-goto],[data-hold],[data-dep],[data-li]'); if (!t || !K) return; const d = t.dataset;
  if (d.pt) return setPT(d.pt);
  if (d.tr) { trendR = d.tr; return render(); }
  if (d.drill != null && t.closest('#view')) { drill = d.drill || null; return render(); }
  if (d.li) { const [id, i] = d.li.split(':'); const el = document.querySelector(`[data-donut="${id}"]`); if (el && el._set) el._set(+i); if (!d.drill) return; }
  if (d.goto) return go(d.goto);
  if (d.act === 'pprev') return shiftP(-1); if (d.act === 'pnext') return shiftP(1);
  if (d.act === 'lprev' || d.act === 'lnext') { let k = logYM.y * 12 + logYM.m - 1 + (d.act === 'lnext' ? 1 : -1); logYM = { y: Math.floor(k / 12), m: k % 12 + 1 }; return render(); }
  if (d.act === 'nexttip') { tipShift++; return render(); }
  if (d.act === 'settings') return openSettings(); if (d.act === 'refresh') return refresh(); if (d.act === 'add') return openAdd();
  if (d.act === 'ai') return runAI(); if (d.act === 'px') { await refreshPrices(); return render(); }
  if (d.act === 'hnew') return holdForm(); if (d.act === 'himp') return importForm(); if (d.act === 'dnew') return depForm();
  if (d.hold) return holdForm(ST.inv.holdings.find(x => x.id === d.hold)); if (d.dep) return depForm(ST.inv.deposits.find(x => x.id === d.dep));
  if (d.act === 'gnew') return goalForm({ kind: d.kind });
  if (d.cat) return openCat(d.cat);
  if (d.gedit) return goalForm(ST.goals.find(g => g.id === d.gedit));
  if (d.gadd) { const g = ST.goals.find(x => x.id === d.gadd); const v = parseAmt(prompt('Cộng thêm vào "' + g.name + '" (VD 2tr):', '') || ''); if (v) { g.cur = (Number(g.cur) || 0) + v; save(true, 'goals'); render(); } return; }
  if (d.gsug) { const i = F.lastFull(M), sp = F.avgBefore(M, i + 1, 12, 'spend'), y = new Date().getFullYear(), sv = M.cats.filter(c => c.group === 'tichluy' && /tiet kiem|vang/.test(F.norm(c.name))).map(c => c.name);
    const s = { ef: { name: 'Quỹ dự phòng 6 tháng', kind: 'ngan', target: Math.round(sp * 6 / 1e6) * 1e6, deadline: y + 1 + '-06', link: sv, note: '6 tháng chi tiêu trung bình, để ở chỗ rút được ngay.' }, ef3: { name: 'Quỹ dự phòng 3 tháng', kind: 'ngan', target: Math.round(sp * 3 / 1e6) * 1e6, deadline: y + '-12', link: sv }, big: { name: 'Món lớn sắp mua', kind: 'ngan' }, trip: { name: 'Chuyến du lịch', kind: 'ngan' }, inv: { name: 'Danh mục đầu tư', kind: 'dai', deadline: (y + 5) + '-12', link: M.cats.filter(c => c.group === 'tichluy' && /chung khoan|dau tu/.test(F.norm(c.name))).map(c => c.name) } }[d.gsug];
    if (s.link && !s.link.length) delete s.link; return goalForm(s); }
  if (d.pdel) { ST.pending = ST.pending.filter(x => x.id !== d.pdel); save(false); return render(); }
  if (d.tdel) { if (!t.dataset.sure) { t.dataset.sure = 1; t.textContent = 'Xoá?'; setTimeout(() => { delete t.dataset.sure; t.textContent = '✕'; }, 3500); return; }
    t.textContent = '…'; try { await api('xoa', { id: d.tdel }); toast('Đã xoá và trừ lại trên sheet'); await refresh(true); } catch (err) { toast(err.message); render(); } }
});

/* ===== khoá 6 số ===== */
let lockMode = null, pinBuf = '', pinFirst = '', lockBusy = false, hiddenAt = 0, idleT = null;
function lockState() { if (K) return null; if (localBox || cloudBox) return 'unlock'; if (!cloudChecked) return 'wait'; return 'create'; }
function showLock(mode) { lockMode = mode || lockState(); pinBuf = ''; drawLock(); $('#lock').hidden = false; }
function drawLock(msg, bad) {
  const T = { unlock: ['Nhập mật khẩu', 'Mật khẩu 6 số của Ngân hàng Mintun'], create: ['Tạo mật khẩu 6 số', 'Dùng để mở app và toà Ngân hàng trong Học viện. Dữ liệu được mã hoá bằng mật khẩu này.'], confirm: ['Nhập lại mật khẩu', 'Nhập lại 6 số vừa tạo'], change1: ['Mật khẩu mới', 'Nhập 6 số mới'], change2: ['Nhập lại mật khẩu mới', ''], wait: ['Đang kiểm tra tài khoản…', ''] }[lockMode] || ['', ''];
  const w = VA.wait(), wm = w ? 'Sai nhiều lần, thử lại sau ' + Math.ceil(w / 1000) + ' giây' : '';
  $('#lockIn').innerHTML = `<img src="icon-192.png" alt=""><h2>${T[0]}</h2><p class="lsub">${esc(T[1])}</p>
  <div class="pdots${bad ? ' shake' : ''}">${[0, 1, 2, 3, 4, 5].map(i => `<i class="${i < pinBuf.length ? 'on' : ''}"></i>`).join('')}</div>
  <p class="lmsg">${esc(msg || wm || (lockBusy ? 'Đang mở két…' : ''))}</p>
  ${lockMode === 'wait' ? '' : `<div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-pin="${n}">${n}</button>`).join('')}<button data-pin="x" class="sm">${lockMode === 'unlock' ? 'Quên?' : lockMode === 'change1' || lockMode === 'change2' ? 'Huỷ' : ''}</button><button data-pin="0">0</button><button data-pin="b" class="sm" aria-label="Xoá">⌫</button></div>`}`;
}
async function pinDone() {
  const pin = pinBuf; pinBuf = '';
  if (lockMode === 'create' || lockMode === 'change1') { pinFirst = pin; lockMode = lockMode === 'create' ? 'confirm' : 'change2'; drawLock(); return; }
  if (lockMode === 'confirm' || lockMode === 'change2') {
    if (pin !== pinFirst) { lockMode = lockMode === 'confirm' ? 'create' : 'change1'; drawLock('Hai lần nhập không khớp, làm lại nhé', true); return; }
    lockBusy = true; drawLock(); const chg = lockMode === 'change2'; K = await VA.make(pin); lockBusy = false;
    if (!chg) { Object.assign(ST, blank(), cloudLegacy ? { cfg: cloudLegacy.cfg || ST.cfg, goals: cloudLegacy.goals || [], map: cloudLegacy.map || {} } : {}, legacy || {}); legacy = null; cloudLegacy = null; }
    save(); $('#lock').hidden = true; lockMode = null; build(); render(); toast(chg ? 'Đã đổi mật khẩu' : 'Đã tạo mật khẩu. Nhớ kỹ 6 số này nha!'); armIdle();
    if (!chg && (DEMO || ST.cfg.url && ST.cfg.key) && !ST.doc) refresh(true); return;
  }
  if (lockMode === 'unlock') {
    if (VA.wait()) { drawLock(); return; }
    lockBusy = true; drawLock();
    try {
      await unlockWith(pin); VA.ok(); lockBusy = false; $('#lock').hidden = true; lockMode = null; build(); render(); armIdle();
      if (Q.get('add') && M) setTimeout(openAdd, 300);
      if ((DEMO || ST.cfg.url && ST.cfg.key) && (!ST.sync || Date.now() - ST.sync > 6 * 36e5)) refresh(true); else if (M) pushCloud();
    } catch (e) { lockBusy = false; const t = VA.fail(); drawLock(t.until > Date.now() ? '' : 'Sai mật khẩu (' + t.n + ' lần)', true); }
  }
}
async function unlockWith(pin) {
  let base = null, data = blank(), localOk = false;
  if (localBox) { try { base = await VA.unlock(pin, localBox); Object.assign(data, base.data); localOk = true; } catch (e) { } }
  if (cloudBox) {
    let c = null;
    if (base && base.k.salt === cloudBox.salt) c = await VA.open(base.k, cloudBox).catch(() => null);
    if (!c) { const cb = await VA.unlock(pin, cloudBox); c = cb.data; if (!localOk || base.k.salt !== cloudBox.salt) { base = cb; if (localOk) { /* mật khẩu đổi ở máy khác: giữ sổ cache máy này */ } } }
    ST = data; mergeRemote(c); data = ST;
  } else if (!localOk) throw new Error('sai');
  if (!localOk && localBox) { localStorage.removeItem(LSV); localBox = null; }
  data.inv = data.inv || { holdings: [], deposits: [] }; data.inv.holdings = data.inv.holdings || []; data.inv.deposits = data.inv.deposits || [];
  K = base.k; ST = data; saveLocal();
}
function lockNow() { if (!K && !$('#lock').hidden) return; K = null; ST = blank(); M = null; P = null; closeSheet(); $('#view').innerHTML = ''; showLock('unlock'); }
function armIdle() { clearTimeout(idleT); if (K) idleT = setTimeout(lockNow, 10 * 60e3); }
['pointerdown', 'keydown', 'scroll'].forEach(ev => document.addEventListener(ev, () => { if (K) armIdle(); }, { passive: true, capture: true }));
document.addEventListener('visibilitychange', () => { if (document.hidden) hiddenAt = Date.now(); else { if (K && hiddenAt && Date.now() - hiddenAt > 3 * 60e3) lockNow(); else if (K) pullCloud(); $('#dueDot').hidden = !isDue(); } });
async function pullCloud() { if (!fb || !ref || !K) return; try { const sn = await fb.fs.getDoc(ref); await adoptCloud(sn.exists() ? sn.data().money : null); } catch (e) { } }
function pinKey(k) {
  if ($('#lock').hidden || lockBusy || lockMode === 'wait') return;
  if (k === 'b') { pinBuf = pinBuf.slice(0, -1); drawLock(); return; }
  if (k === 'x') { if (lockMode === 'change1' || lockMode === 'change2') { $('#lock').hidden = true; lockMode = null; return; } if (lockMode === 'unlock') forgot(); return; }
  if (lockMode === 'unlock' && VA.wait()) return drawLock();
  if (pinBuf.length < 6) { pinBuf += k; drawLock(); if (pinBuf.length === 6) setTimeout(pinDone, 120); }
}
$('#lock').addEventListener('click', e => { const b = e.target.closest('[data-pin]'); if (b) pinKey(b.dataset.pin); });
document.addEventListener('keydown', e => { if ($('#lock').hidden) return; if (/^\d$/.test(e.key)) pinKey(e.key); else if (e.key === 'Backspace') pinKey('b'); });
async function forgot() {
  if (!confirm('Quên mật khẩu: dữ liệu đã mã hoá (link kết nối, mục tiêu, danh mục đầu tư) sẽ bị xoá để tạo mật khẩu mới. Sổ thu chi trên Google Sheet KHÔNG bị ảnh hưởng. Tiếp tục?')) return;
  if (!DEMO && !(fb && ref)) return toast('Đăng nhập Google trước rồi mới đặt lại được');
  if (!confirm('Chắc chắn xoá và đặt mật khẩu mới?')) return;
  localStorage.removeItem(LSV); localBox = null; cloudBox = null; cloudLegacy = null; VA.ok();
  if (fb && ref) try { await fb.fs.setDoc(ref, { money: JSON.stringify({ v: 0, reset: Date.now() }) }, { merge: true }); } catch (e) { }
  showLock('create');
}

/* ===== Firebase: cùng tài khoản với Học viện, dữ liệu tài chính lưu dạng mã hoá ===== */
let fb = null, user = null, ref = null;
/** gộp dữ liệu từ máy khác theo từng phần (mục tiêu, danh mục, kết nối…): phần nào sửa sau thì thắng */
function mergeRemote(c) {
  if (!c) return false; ST.ts = ST.ts || {}; const rt = c.ts || {}; let changed = false;
  const empty = (s, v) => s === 'inv' ? !v || !((v.holdings || []).length || (v.deposits || []).length) : s === 'goals' ? !v || !v.length : s === 'cfg' ? !v || !v.url : false;
  SECT.forEach(s => {
    if (c[s] === undefined) return;
    const lt = ST.ts[s] || 0, r = rt[s] || 0;
    if (r > lt || (r === lt && empty(s, ST[s]) && !empty(s, c[s]))) { ST[s] = c[s]; ST.ts[s] = r; changed = true; }
  });
  if (c.px && Object.keys(c.px).length && !Object.keys(ST.px || {}).length) ST.px = c.px;
  ST.inv = ST.inv || { holdings: [], deposits: [] }; ST.inv.holdings = ST.inv.holdings || []; ST.inv.deposits = ST.inv.deposits || [];
  return changed;
}
let pushing = false;
async function pushCloud() {
  if (!fb || !ref || DEMO || !K || pushing) return; pushing = true;
  try {
    const sn = await fb.fs.getDoc(ref), m = sn.exists() ? JSON.parse(sn.data().money || 'null') : null;
    if (m && m.v === 2 && m.ct !== (cloudBox && cloudBox.ct)) {
      if (m.salt !== K.salt) { pushing = false; toast('Mật khẩu đã đổi trên máy khác, nhập lại nhé'); return lockNow(); }
      try { if (mergeRemote(await VA.open(K, m))) { saveLocal(); build(); render(); } } catch (e) { pushing = false; return lockNow(); }
    }
  } catch (e) { console.warn('pull', e); }
  pushing = false;
  return pushCloud2();
}
async function pushCloud2() {
  if (!fb || !ref || DEMO || !K) return;
  let sum = null;
  if (M) { try { sum = F.fullSummary(M, ST.goals, ST.inv, ST.px, ST.sync, ST.ai && ST.ai.res ? ST.ai.res.tong : ''); } catch (e) { console.warn(e); } }
  try { const box = await VA.seal(K, { cfg: ST.cfg, goals: ST.goals, map: ST.map, inv: ST.inv, px: ST.px, ai: ST.ai, ai_on: ST.ai_on, ts: ST.ts || {}, sum }, { upd: ST.upd, sync: ST.sync || 0 }); await fb.fs.setDoc(ref, { money: JSON.stringify(box) }, { merge: true }); cloudBox = box; } catch (e) { console.warn('cloud', e); }
}
async function adoptCloud(s) {
  let m = null; try { m = JSON.parse(s || 'null'); } catch (e) { }
  cloudChecked = true;
  if (m && m.v === 2) cloudBox = m; else if (m && m.v === 1) cloudLegacy = m;
  if (K) { if (m && m.v === 2) { if (m.salt !== K.salt) return lockNow(); try { if (mergeRemote(await VA.open(K, m))) { saveLocal(); build(); render(); } } catch (e) { return lockNow(); } } return; }
  if (!$('#lock').hidden || lockMode) showLock(lockState());
}
if (DEMO) { $('#gate').hidden = true; showLock(); }
else {
  if (localBox) $('#gate').hidden = true;
  showLock();
  (async () => {
    try {
      const b = 'https://www.gstatic.com/firebasejs/13.3.0/'; const [app, auth, fs] = await Promise.all([import(b + 'firebase-app.js'), import(b + 'firebase-auth.js'), import(b + 'firebase-firestore.js')]);
      const a = app.initializeApp(FBCFG); fb = { auth, fs, A: auth.getAuth(a), D: fs.getFirestore(a) };
      auth.onAuthStateChanged(fb.A, async u => {
        user = u;
        if (u) { ref = fs.doc(fb.D, 'users', u.uid); $('#gate').hidden = true; try { const sn = await fs.getDoc(ref); await adoptCloud(sn.exists() ? sn.data().money : null); } catch (e) { cloudChecked = true; if (lockMode) showLock(lockState()); }
          fs.onSnapshot(ref, d => { const mm = d.exists() ? d.data().money : null; if (K && mm && !d.metadata.hasPendingWrites) adoptCloud(mm); }, () => { }); }
        else { ref = null; if (!localBox) $('#gate').hidden = false; }
      });
      $('#signin').onclick = () => auth.signInWithPopup(fb.A, new auth.GoogleAuthProvider()).catch(e => { if (/popup/.test(e.code || '')) auth.signInWithRedirect(fb.A, new auth.GoogleAuthProvider()); else $('#gateMsg').textContent = 'Đăng nhập lỗi: ' + (e.code || e); });
    } catch (e) { $('#gateMsg').textContent = 'Không tải được Firebase, kiểm tra mạng.'; cloudChecked = true; if (lockMode) showLock(lockState()); }
  })();
}
let rzT; window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { if (M && K && !$('#sheet').classList.contains('on')) render(); }, 300); });
window.addEventListener('online', () => { if (K && ST.pending.length) refresh(true); });
if ('serviceWorker' in navigator && !DEMO) navigator.serviceWorker.register('sw.js').catch(() => { });

/* ===== chế độ xem thử (?demo=1): đọc file demo cục bộ, không có trên GitHub ===== */
async function demoApi(action, extra) {
  if (action === 'doc') { const r = await fetch('demo-data.json', { cache: 'no-store' }); if (!r.ok) throw new Error('Không có demo-data.json'); const j = await r.json(); j.gd = (j.gd || []).concat(ST._demoTx || []); return j; }
  if (action === 'them') { ST._demoTx = (ST._demoTx || []).concat([Object.assign({}, extra.gd, { trang_thai: 'ok' })]); return { ok: true }; }
  if (action === 'xoa') { ST._demoTx = (ST._demoTx || []).filter(x => x.id !== extra.id); return { ok: true }; }
  if (action === 'gia') { const r = await fetch('demo-prices.json', { cache: 'no-store' }); return { gia: r.ok ? await r.json() : {} }; }
  if (action === 'ai') { await new Promise(r => setTimeout(r, 1200)); return { model: 'demo', ai: { tong: 'Bản demo: thu nhập tăng mạnh năm nay nhưng chi linh hoạt cũng tăng; quỹ dự phòng mới đủ hơn 1 tháng chi tiêu.', diem_manh: ['Tích lũy đều đặn ~30% thu nhập', 'Có 3 nguồn thu đáng kể'], can_cai_thien: ['Quỹ dự phòng dưới 2 tháng', '5 tháng thâm hụt trong 12 tháng'], hanh_dong: [{ viec: 'Chuyển 5tr/tháng vào sổ tiết kiệm riêng làm quỹ dự phòng', vi_sao: 'đạt 3 tháng chi tiêu trong 1 năm' }, { viec: 'Đặt trần 2,5tr/tháng cho Cafe, date', vi_sao: 'mục này tăng mạnh 3 tháng gần đây' }, { viec: 'Lên kế hoạch mua đồ công nghệ trước 3 tháng', vi_sao: 'tránh tháng thâm hụt như 8/2026' }], dau_tu: 'Danh mục đang lãi nhẹ; giữ DCA hằng tháng và không dồn quá 50% vào một mã.' } }; }
}
