/* Ngân hàng Mintun · bộ phân tích dùng chung cho app tài chính và Học viện.
   Không chứa số liệu: dữ liệu đọc live từ Google Sheet qua Apps Script (tools/finance-sync). */
(function (root) {
  'use strict';
  const GROUPS = {
    thu: { name: 'Thu nhập', short: 'Thu', color: 'var(--g-thu)' },
    codinh: { name: 'Chi cố định', short: 'Cố định', color: 'var(--g-codinh)' },
    linhhoat: { name: 'Chi linh hoạt', short: 'Linh hoạt', color: 'var(--g-linhhoat)' },
    tichluy: { name: 'Tích lũy & đầu tư', short: 'Tích lũy', color: 'var(--g-tichluy)' }
  };
  const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
  const thang = s => { const m = String(s && s.d ? s.d : s).match(/(\d{4})-(\d{2})-\d{2}|(\d{1,2})\s*[\/\-.]\s*(\d{4})/); if (!m) return null; return m[1] ? { y: +m[1], m: +m[2] } : { y: +m[4], m: +m[3] }; };

  /** Số trong ô: số thật, hoặc chuỗi kiểu "12.000.000 đ". Chữ (vd "1 chỉ vàng") → null + giữ chữ. */
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v == null) return 0;
    const s = String(v).trim();
    if (!s) return 0;
    const c = s.replace(/\s|vn[dđ]|đ|₫/gi, '');
    if (/^-?[\d.,]+$/.test(c)) { const n = Number(c.replace(/[.,]/g, '')); return isFinite(n) ? n : 0; }
    return null;
  }

  function defaultGroup(name, sec) {
    const n = norm(name);
    if (sec === 'thu') return 'thu';
    if (/tiet kiem|chung khoan|vang|dau tu|gui cho gd|gia dinh|gui gd|bo me|quy (huu|du phong|khan cap)|bao hiem nhan tho|crypto|co phieu/.test(n)) return 'tichluy';
    if (sec === 'codinh') return 'codinh';
    if (/thue nha|dien nuoc|internet|mang|tra gop|hoc phi/.test(n) && sec !== 'linhhoat') return 'codinh';
    return 'linhhoat';
  }

  /** doc (từ Apps Script) → model */
  function parse(doc, map) {
    map = map || {};
    const V = doc.values || [], D = doc.display || V, N = doc.notes || [];
    let hr = -1;
    for (let i = 0; i < Math.min(V.length, 15); i++) if (norm(D[i] && D[i][0]) === 'thang') { hr = i; break; }
    if (hr < 0) throw new Error('Sheet không có dòng "Tháng"');
    const months = [];
    (D[hr] || []).forEach((h, c) => { if (c === 0) return; const t = thang(V[hr][c] && V[hr][c].d ? V[hr][c] : h); if (t) months.push({ y: t.y, m: t.m, col: c, k: t.y + '-' + String(t.m).padStart(2, '0'), label: t.m + '/' + t.y }); });
    months.sort((a, b) => a.k < b.k ? -1 : 1);
    const cats = [];
    let sec = 'thu';
    for (let r = hr + 1; r < V.length; r++) {
      const raw = String((D[r] || [])[0] || '').trim(), n = norm(raw);
      if (!n) continue;
      if (n === 'nam') break;
      if (n === 'tong' || n === 'total') { if (sec === 'thu') sec = 'none'; continue; }
      if (/^chi tieu co dinh|^chi co dinh/.test(n)) { sec = 'codinh'; continue; }
      if (/^chi thuong xuyen|^chi linh hoat|^chi tieu thuong xuyen/.test(n)) { sec = 'linhhoat'; continue; }
      if (sec === 'none') continue;
      const vals = [], txt = [], note = [];
      months.forEach(mo => {
        const v = num((V[r] || [])[mo.col]);
        const d = String((D[r] || [])[mo.col] || '').trim();
        vals.push(v == null ? 0 : v); txt.push(v == null ? d : '');
        note.push(String((N[r] || [])[mo.col] || '').trim());
      });
      const name = raw.replace(/\s+/g, ' ');
      cats.push({ id: 'c' + r, name, sec, row: r, group: map[name] || defaultGroup(name, sec), vals, txt, note, cm: months.map(() => []) });
    }
    // comment trong sheet: dò ô qua anchor (nếu có dạng A1) hoặc giá trị ô lúc comment + ngày tạo
    const loose = [];
    (doc.comments || []).forEach(c => {
      let hit = null;
      const a1 = String(c.cell || c.a || '').match(/!?\$?([A-Z]{1,3})\$?(\d{1,4})\b/);
      if (a1 && c.cell) { const col = a1[1].split('').reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0) - 1, row = +a1[2] - 1; const cat = cats.find(x => x.row === row), mi = months.findIndex(m => m.col === col); if (cat && mi >= 0) hit = [cat, mi]; }
      if (!hit && c.q) {
        const q = String(c.q).replace(/\D/g, '');
        const at = c.at ? new Date(c.at) : null, ak = at ? at.getFullYear() * 12 + at.getMonth() + 1 : 0;
        let best = null, bd = 1e9;
        if (q) cats.forEach(cat => months.forEach((mo, mi) => {
          if (String((D[cat.row] || [])[mo.col] || '').replace(/\D/g, '') !== q) return;
          const d = ak ? Math.abs(ak - (mo.y * 12 + mo.m) - .4) : 0;
          if (d < bd) { bd = d; best = [cat, mi]; }
        }));
        if (best && bd < 4) hit = best;
      }
      if (hit) hit[0].cm[hit[1]].push(c.t); else if (c.t) loose.push(c);
    });
    const tx = (doc.gd || []).filter(g => g.trang_thai !== 'xoá').map(g => Object.assign({}, g, { d: new Date(g.ts) })).sort((a, b) => b.d - a.d);
    const stamp = String((D[0] || [])[0] || '').trim();
    const M = { months, cats, loose, tx, at: doc.at, file: doc.file, stamp: norm(stamp) === 'thang' ? '' : stamp };
    M.mon = months.map((mo, i) => monthStats(M, i));
    // tháng đang điền dở: tháng hiện tại, hoặc 1–3 tháng cuối có thu < 50% TB và dòng lương còn trống
    const L = M.mon.length - 1, now = new Date(), nowK = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    const main = cats.find(c => c.group === 'thu');
    for (let i = Math.max(0, L - 2); i <= L; i++) {
      const prev = []; for (let j = i - 1; j >= 0 && prev.length < 6; j--) if (M.mon[j].inc > 0) prev.push(M.mon[j].inc);
      const avg = prev.reduce((s, x) => s + x, 0) / (prev.length || 1);
      if (M.months[i].k >= nowK || (prev.length >= 3 && M.mon[i].inc < avg * .5 && main && !main.vals[i])) M.mon[i].partial = true;
    }
    return M;
  }

  function monthStats(M, i) {
    const o = { i, k: M.months[i].k, label: M.months[i].label, inc: 0, codinh: 0, linhhoat: 0, tichluy: 0, src: {} };
    M.cats.forEach(c => { const v = c.vals[i] || 0; if (c.group === 'thu') { o.inc += v; o.src[c.name] = v; } else o[c.group] += v; });
    o.spend = o.codinh + o.linhhoat; o.out = o.spend + o.tichluy; o.free = o.inc - o.out;
    o.rate = o.inc > 0 ? o.tichluy / o.inc : 0; o.has = o.inc || o.out;
    return o;
  }

  /** Tổng hợp một khoảng tháng [a,b] */
  function range(M, a, b) {
    a = Math.max(0, a); b = Math.min(M.mon.length - 1, b);
    const o = { a, b, n: b - a + 1, inc: 0, codinh: 0, linhhoat: 0, tichluy: 0, cat: {} };
    for (let i = a; i <= b; i++) { const m = M.mon[i]; o.inc += m.inc; o.codinh += m.codinh; o.linhhoat += m.linhhoat; o.tichluy += m.tichluy; }
    M.cats.forEach(c => { let s = 0; for (let i = a; i <= b; i++) s += c.vals[i] || 0; o.cat[c.id] = s; });
    o.spend = o.codinh + o.linhhoat; o.out = o.spend + o.tichluy; o.free = o.inc - o.out; o.rate = o.inc > 0 ? o.tichluy / o.inc : 0;
    return o;
  }
  /** Trung bình n tháng đủ dữ liệu ngay trước tháng i (không tính tháng i) */
  function avgBefore(M, i, n, key) {
    const xs = [];
    for (let j = i - 1; j >= 0 && xs.length < n; j--) if (M.mon[j].has && !M.mon[j].partial) xs.push(typeof key === 'function' ? key(j) : M.mon[j][key]);
    return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
  }
  const catAvg = (M, c, i, n) => avgBefore(M, i, n, j => c.vals[j] || 0);
  function lastIdx(M) { for (let i = M.mon.length - 1; i >= 0; i--) if (M.mon[i].has) return i; return M.mon.length - 1; }
  function lastFull(M) { for (let i = M.mon.length - 1; i >= 0; i--) if (M.mon[i].has && !M.mon[i].partial) return i; return lastIdx(M); }

  /* ---------- định dạng ---------- */
  function vnd(n) { n = Math.round(n || 0); return (n < 0 ? '-' : '') + Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' đ'; }
  function short(n) {
    n = n || 0; const a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e9) return s + (a / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace('.', ',').replace(',0', '') + ' tỷ';
    if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e8 ? 0 : 1).replace('.', ',').replace(/,0$/, '') + 'tr';
    if (a >= 1e3) return s + Math.round(a / 1e3) + 'k';
    return s + Math.round(a);
  }
  const pct = x => Math.round((x || 0) * 100) + '%';

  /* ---------- mục tiêu ---------- */
  function goalProgress(M, g) {
    let cur = Number(g.start) || 0;
    if (g.link && g.link.length && M) {
      const from = g.from || '0000-00';
      M.cats.forEach(c => { if (!g.link.includes(c.name)) return; M.months.forEach((mo, i) => { if (mo.k >= from) cur += c.vals[i] || 0; }); });
    } else if (g.cur != null && g.cur !== '') cur = Number(g.cur) || 0;
    const target = Number(g.target) || 0;
    const now = new Date(), dl = g.deadline ? new Date(g.deadline + '-28') : null;
    const left = dl ? Math.max(0, (dl.getFullYear() - now.getFullYear()) * 12 + dl.getMonth() - now.getMonth()) : null;
    const remain = Math.max(0, target - cur);
    const need = left == null ? null : remain / Math.max(1, left);
    return { cur, target, p: target ? Math.min(1, Math.max(0, cur / target)) : 0, remain, left, need, done: target > 0 && cur >= target };
  }

  /* ---------- Bắp phân tích: danh sách lời khuyên từ số liệu ---------- */
  function tips(M, goals, opt) {
    opt = opt || {};
    const out = [], add = (pri, tag, t) => out.push({ pri, tag, t });
    if (!M || !M.mon.length) return [{ pri: 1, tag: 'setup', t: 'Meo! Kết nối Google Sheet trong phần Cài đặt để Bắp đọc sổ thu chi của Tuấn nha.' }];
    const i = opt.i != null ? opt.i : lastFull(M), m = M.mon[i];
    const L = lastIdx(M);
    const a6 = k => avgBefore(M, i + 1, 6, k), a12 = k => avgBefore(M, i + 1, 12, k);
    const inc12 = a12('inc'), spend12 = a12('spend'), save12 = a12('tichluy');
    // độ mới dữ liệu
    if (opt.lastSync && Date.now() - opt.lastSync > 15 * 864e5) add(95, 'sync', `Đã ${Math.floor((Date.now() - opt.lastSync) / 864e5)} ngày chưa cập nhật sổ. Điền sheet xong bấm "Cập nhật" để Bắp tính lại biểu đồ nha.`);
    if (M.mon[L].partial) add(40, 'sync', `Tháng ${M.mon[L].label} mới điền được một phần (thu ${short(M.mon[L].inc)}). Bắp đang lấy tháng ${m.label} làm tháng phân tích chính.`);
    // tỉ lệ tích lũy
    if (m.inc > 0) {
      if (m.rate >= .3) add(60, 'save', `Tháng ${m.label} Tuấn để dành được ${pct(m.rate)} thu nhập (${short(m.tichluy)}). Vượt mốc 20% rồi, giữ nhịp này nha!`);
      else if (m.rate < .1) add(80, 'save', `Tháng ${m.label} mới tích lũy ${pct(m.rate)} thu nhập. Thử "trả cho mình trước": vừa nhận lương là chuyển ngay ${short(m.inc * .2)} (20%) vào tiết kiệm.`);
      else add(45, 'save', `Tỉ lệ tích lũy tháng ${m.label}: ${pct(m.rate)}. Chỉ cần thêm ${short(Math.max(0, m.inc * .2 - m.tichluy))} nữa là chạm mốc 20%.`);
    }
    // thâm hụt
    if (m.free < 0) add(90, 'free', `Tháng ${m.label} chi + tích lũy vượt thu ${short(-m.free)}. Tuấn đang lấy tiền cũ bù vào, nhớ xem lại khoản lớn nhất tháng này.`);
    else if (m.inc > 0 && m.free > m.inc * .25) add(55, 'free', `Tháng ${m.label} còn dư ${short(m.free)} chưa phân bổ. Đưa một phần vào tiết kiệm hoặc quỹ dự phòng trước khi nó "bay" mất nha.`);
    // hạng mục tăng vọt / giảm
    const spikes = [];
    M.cats.forEach(c => {
      if (c.group === 'thu' || c.group === 'tichluy') return;
      const v = c.vals[i] || 0, av = catAvg(M, c, i, 12);
      if (v > 1e6 && av > 0 && v > av * 1.6) spikes.push({ c, v, av, r: v / av });
      let nz = 0, tot = 0; for (let j = Math.max(0, i - 11); j <= i; j++) { tot++; if (c.vals[j] > 0) nz++; }
      if (av > 1e6 && v > 0 && v < av * .55 && nz >= tot * .75) add(35, 'cat', `${c.name} tháng ${m.label} chỉ ${short(v)}, thấp hơn trung bình 12 tháng (${short(av)}). Giỏi lắm!`);
    });
    spikes.sort((a, b) => (b.v - b.av) - (a.v - a.av)).slice(0, 2).forEach((s, k) => add(85 - k * 5, 'cat', `${s.c.name} tháng ${m.label} là ${short(s.v)}, gấp ${s.r.toFixed(1).replace('.', ',')} lần trung bình (${short(s.av)}). Có khoản nào lặp lại tháng sau không?`));
    // cơ cấu thu nhập
    const r12 = range(M, i - 11, i);
    const srcs = M.cats.filter(c => c.group === 'thu').map(c => ({ c, v: r12.cat[c.id] })).sort((a, b) => b.v - a.v);
    if (r12.inc > 0 && srcs.length > 1) {
      const top = srcs[0], share = top.v / r12.inc;
      const side = srcs.filter(s => !/luong/.test(norm(s.c.name))).reduce((s, x) => s + x.v, 0) / r12.inc;
      if (side > .4) add(70, 'inc', `12 tháng qua ${pct(side)} thu nhập đến từ nguồn ngoài lương. Tiền về không đều nên quỹ dự phòng càng quan trọng.`);
      if (share > .7) add(50, 'inc', `${top.c.name} chiếm ${pct(share)} thu nhập 12 tháng. Phụ thuộc 1 nguồn khá nhiều, có thêm nguồn phụ ổn định sẽ an toàn hơn.`);
    }
    // biến động thu nhập
    const incs = []; for (let j = Math.max(0, i - 11); j <= i; j++) if (!M.mon[j].partial && M.mon[j].inc > 0) incs.push(M.mon[j].inc);
    if (incs.length >= 6) {
      const mu = incs.reduce((s, x) => s + x, 0) / incs.length, sd = Math.sqrt(incs.reduce((s, x) => s + (x - mu) ** 2, 0) / incs.length);
      if (sd / mu > .4) add(58, 'inc', `Thu nhập mỗi tháng dao động mạnh (từ ${short(Math.min(...incs))} tới ${short(Math.max(...incs))}). Lấy tháng thấp nhất làm mức chi tiêu chuẩn sẽ không bị hụt.`);
    }
    // quỹ dự phòng
    const efTarget = spend12 * 6;
    const ef = (goals || []).find(g => /du phong|khan cap/.test(norm(g.name)));
    if (!ef && spend12 > 0) add(65, 'goal', `Tuấn chưa có mục tiêu quỹ dự phòng. Chi tiêu TB ${short(spend12)}/tháng → quỹ 6 tháng nên khoảng ${short(efTarget)}. Vào tab Mục tiêu tạo nhanh nha.`);
    // mục tiêu
    (goals || []).forEach(g => {
      const p = goalProgress(M, g);
      if (!p.target) return;
      if (p.done) add(62, 'goal', `Mục tiêu "${g.name}" đã đạt ${short(p.cur)}/${short(p.target)}. Đặt mục tiêu tiếp theo thôi!`);
      else if (p.need != null && save12 > 0 && p.need > save12 * 1.1) add(78, 'goal', `"${g.name}" còn thiếu ${short(p.remain)} trong ${p.left} tháng, cần để dành ${short(p.need)}/tháng, trong khi TB đang tích lũy ${short(save12)}/tháng. Lùi hạn hoặc tăng phần để dành nhé.`);
      else if (p.p >= .75) add(57, 'goal', `"${g.name}" đã đi được ${pct(p.p)}, còn ${short(p.remain)} nữa thôi!`);
      else if (p.need != null) add(42, 'goal', `"${g.name}": mỗi tháng để dành ${short(p.need)} là kịp hạn ${g.deadline.split('-').reverse().join('/')}.`);
    });
    // chi cố định
    if (inc12 > 0) {
      const fr = a12('codinh') / inc12;
      if (fr > .35) add(52, 'fix', `Chi cố định chiếm ${pct(fr)} thu nhập trung bình. Mức an toàn là dưới 35%, có khoản nào cắt hoặc thương lượng lại được không?`);
      const flex = a12('linhhoat') / inc12;
      add(30, 'rule', `Quy tắc 50/30/20 của Tuấn (TB 12 tháng): cố định ${pct(fr)} · linh hoạt ${pct(flex)} · tích lũy ${pct(save12 / inc12)}.`);
    }
    // xu hướng chi linh hoạt 3 tháng
    if (i >= 6) {
      const n3 = range(M, i - 2, i).linhhoat / 3, p3 = range(M, i - 5, i - 3).linhhoat / 3;
      if (p3 > 0 && n3 > p3 * 1.25) add(68, 'trend', `Chi linh hoạt 3 tháng gần đây TB ${short(n3)}/tháng, tăng ${pct(n3 / p3 - 1)} so với 3 tháng trước. Lạm phát lối sống đang tới đó nha.`);
      else if (p3 > 0 && n3 < p3 * .85) add(48, 'trend', `Chi linh hoạt 3 tháng gần đây giảm ${pct(1 - n3 / p3)} so với 3 tháng trước. Bắp thưởng 1 con cá!`);
    }
    // so với cùng kỳ năm trước
    const y = M.months[i].y, cut = M.months[i].m;
    const ytd = yy => { let s = 0; M.months.forEach((mo, j) => { if (mo.y === yy && mo.m <= cut && !M.mon[j].partial) s += M.mon[j].inc; }); return s; };
    const t1 = ytd(y), t0 = ytd(y - 1);
    if (t0 > 0 && t1 > 0) add(t1 >= t0 ? 44 : 60, 'year', `Từ đầu năm ${y} tới tháng ${cut}, Tuấn kiếm được ${short(t1)}, ${t1 >= t0 ? 'tăng' : 'giảm'} ${pct(Math.abs(t1 / t0 - 1))} so với cùng kỳ ${y - 1}.`);
    // khoản lớn bất thường
    M.cats.forEach(c => {
      if (c.group === 'thu' || c.group === 'tichluy') return;
      const v = c.vals[i] || 0;
      if (v >= 1e7) add(64, 'big', `Tháng ${m.label} có khoản ${c.name} ${short(v)}. Món lớn kiểu này lần sau nên tạo mục tiêu để dành trước vài tháng, đỡ hụt dòng tiền.`);
    });
    // "linh tinh" nhiều
    const lt = M.cats.find(c => /linh tinh|khac/.test(norm(c.name)));
    if (lt && r12.spend > 0 && r12.cat[lt.id] / r12.spend > .1) add(38, 'cat', `"${lt.name}" chiếm ${pct(r12.cat[lt.id] / r12.spend)} chi tiêu 12 tháng. Tách thêm hạng mục để biết tiền đi đâu rõ hơn nha.`);
    // đầu tư đều đặn
    const ck = M.cats.find(c => /chung khoan|co phieu/.test(norm(c.name)));
    if (ck) { let n = 0; for (let j = i; j >= 0 && (ck.vals[j] || 0) > 0; j--) n++; if (n >= 3) add(46, 'inv', `${n} tháng liên tiếp Tuấn đều đặn bỏ tiền vào ${ck.name}. Đầu tư định kỳ (DCA) là thói quen rất đáng giữ!`); }
    const gd = M.cats.find(c => /gui cho gd|gia dinh|bo me/.test(norm(c.name)));
    if (gd) { const s = range(M, i - 11, i).cat[gd.id]; if (s > 0) add(33, 'fam', `12 tháng qua Tuấn đã gửi gia đình ${short(s)}. Bắp tự hào về Tuấn lắm!`); }
    // câu nền (luôn có)
    [
      'Món nào trên 2 triệu, đợi 24 giờ rồi mới mua. Hôm sau vẫn muốn thì mua.',
      'Ghi chi tiêu ngay lúc trả tiền, bấm dấu + là xong. Để tối mới ghi là dễ quên lắm.',
      'Tiền dư cuối tháng chuyển hết vào tiết kiệm. Tài khoản chi tiêu chỉ nên giữ đủ dùng.',
      'Quỹ dự phòng để chỗ rút được ngay. Tiền đầu tư dài hạn thì để riêng.',
      'Đầu tháng xem lại các gói đăng ký phần mềm. Gói nào tháng rồi không mở thì huỷ.',
      'Đi cafe date thì đặt sẵn một ngân sách vui vẻ cho cả tháng, tiêu thoải mái trong mức đó.',
      'Mỗi lần tăng thu nhập, giữ chi tiêu như cũ và đẩy phần tăng thêm vào tích lũy.'
    ].forEach(t => add(10, 'base', t));
    return out.sort((a, b) => b.pri - a.pri);
  }

  /** Lời khuyên hôm nay: cố định trong ngày, đổi mỗi ngày, ưu tiên cảnh báo quan trọng. */
  function dayNo(d) { d = d || new Date(); return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5); }
  function tipOfDay(list, shift) {
    if (!list.length) return null;
    const hot = list.filter(x => x.pri >= 75), pool = list.filter(x => x.pri >= 30).slice(0, 8);
    const day = dayNo() + (shift || 0);
    if (!shift && hot.length) return hot[day % hot.length];
    const all = pool.length ? pool.concat(list.filter(x => x.pri < 30)) : list;
    return all[((day % all.length) + all.length) % all.length];
  }

  /** Bản tóm tắt gọn để Học viện hiển thị (lưu vào Firestore) */
  function summary(M, goals, lastSync) {
    const i = lastFull(M), m = M.mon[i], L = lastIdx(M);
    const tl = tips(M, goals, { lastSync });
    const top = M.cats.filter(c => c.group === 'codinh' || c.group === 'linhhoat').map(c => ({ n: c.name, v: c.vals[i] || 0 })).sort((a, b) => b.v - a.v).slice(0, 4);
    const hist = M.mon.slice(Math.max(0, i - 11), i + 1).map(x => ({ l: x.label, inc: x.inc, spend: x.spend, save: x.tichluy }));
    return {
      v: 1, at: Date.now(), sync: lastSync || 0, month: m.label, i,
      inc: m.inc, spend: m.spend, save: m.tichluy, free: m.free, rate: m.rate,
      avgSpend: avgBefore(M, i + 1, 6, 'spend'), avgInc: avgBefore(M, i + 1, 6, 'inc'),
      partial: M.mon[L].partial ? M.mon[L].label : '', top, hist,
      goals: (goals || []).slice(0, 4).map(g => { const p = goalProgress(M, g); return { n: g.name, p: p.p, cur: p.cur, target: p.target, kind: g.kind }; }),
      tips: tl.filter(t => t.pri >= 30).slice(0, 10).map(t => t.t)
    };
  }



  /* ---------- kỳ xem: tháng / quý / năm / tuỳ chọn ---------- */
  function periodRange(M, P) {
    const ms = M.months, n = ms.length; if (!n) return null;
    const idx = k => ms.findIndex(m => m.k === k);
    let a, b, label, prev = null;
    if (P.t === 'thang') { a = b = Math.max(0, Math.min(n - 1, P.i)); label = 'Tháng ' + ms[a].label; prev = a > 0 ? [a - 1, a - 1] : null; }
    else if (P.t === 'quy') {
      const q = P.q, y = P.y, inQ = m => m.y === y && Math.ceil(m.m / 3) === q;
      const ids = ms.map((m, i) => inQ(m) ? i : -1).filter(i => i >= 0); if (!ids.length) return null;
      a = ids[0]; b = ids[ids.length - 1]; label = 'Quý ' + q + '/' + y;
      const pq = q === 1 ? 4 : q - 1, py = q === 1 ? y - 1 : y, pids = ms.map((m, i) => m.y === py && Math.ceil(m.m / 3) === pq ? i : -1).filter(i => i >= 0);
      prev = pids.length ? [pids[0], pids[pids.length - 1]] : null;
    } else if (P.t === 'nam') {
      const ids = ms.map((m, i) => m.y === P.y ? i : -1).filter(i => i >= 0); if (!ids.length) return null;
      a = ids[0]; b = ids[ids.length - 1]; label = 'Năm ' + P.y;
      const pids = ms.map((m, i) => m.y === P.y - 1 ? i : -1).filter(i => i >= 0); prev = pids.length ? [pids[0], pids[pids.length - 1]] : null;
    } else {
      a = Math.max(0, idx(P.from)); b = idx(P.to); if (b < 0) b = n - 1; if (a > b) { const t = a; a = b; b = t; }
      label = ms[a].label + ' → ' + ms[b].label; const len = b - a + 1; prev = a - len >= 0 ? [a - len, a - 1] : null;
    }
    const R = range(M, a, b); R.label = label; R.partial = M.mon.slice(a, b + 1).some(x => x.partial);
    R.prev = prev ? range(M, prev[0], prev[1]) : null;
    return R;
  }

  /* ---------- đầu tư ---------- */
  function depositValue(d, at) {
    const P = Number(d.amt) || 0, r = (Number(d.rate) || 0) / 100, st = d.start ? new Date(d.start + 'T00:00:00') : null;
    if (!st || !P) return { now: P, interest: 0, maturity: null, atMat: P, daysLeft: null };
    at = at || new Date();
    const mat = new Date(st); mat.setMonth(mat.getMonth() + (Number(d.term) || 0));
    const end = d.term ? Math.min(at, mat) : at, days = Math.max(0, (end - st) / 864e5);
    const interest = P * r * days / 365, totalDays = d.term ? (mat - st) / 864e5 : null;
    return { now: P + interest, interest, maturity: d.term ? mat : null, atMat: totalDays ? P + P * r * totalDays / 365 : null, daysLeft: d.term ? Math.max(0, Math.ceil((mat - at) / 864e5)) : null };
  }
  function portfolio(inv, px) {
    inv = inv || {}; px = px || {};
    const H = (inv.holdings || []).map(h => {
      const p = px[String(h.code || '').toUpperCase()] || {}, qty = Number(h.qty) || 0, cost = (Number(h.cost) || 0) * qty;
      const price = p.gia || Number(h.manual) || Number(h.cost) || 0, value = price * qty, prevV = (p.truoc || price) * qty;
      return Object.assign({}, h, { price, value, cost, pl: value - cost, plPct: cost ? (value - cost) / cost : 0, day: value - prevV, dayPct: prevV ? (value - prevV) / prevV : 0, series: p.chuoi || [], date: p.ngay || '', src: p.nguon || (h.manual ? 'tự nhập' : ''), name: p.ten || h.name || '', err: p.loi || '' });
    });
    const D = (inv.deposits || []).map(d => Object.assign({}, d, depositValue(d)));
    const stockV = H.reduce((s, h) => s + h.value, 0), stockC = H.reduce((s, h) => s + h.cost, 0), depV = D.reduce((s, d) => s + d.now, 0), depC = D.reduce((s, d) => s + (Number(d.amt) || 0), 0);
    const day = H.reduce((s, h) => s + h.day, 0);
    // giá trị danh mục theo ngày (giả định nắm giữ số lượng hiện tại)
    const dates = {}; H.forEach(h => h.series.forEach(([d]) => dates[d] = 1));
    const hist = Object.keys(dates).sort().slice(-120).map(d => {
      let v = 0; H.forEach(h => { const ser = h.series; let last = null; for (const x of ser) { if (x[0] <= d) last = x[1]; else break; } v += (last || h.price) * (Number(h.qty) || 0); });
      return [d, v + depV];
    });
    return { H, D, stockV, stockC, depV, depC, total: stockV + depV, cost: stockC + depC, pl: stockV - stockC + (depV - depC), day, hist };
  }

  /* ---------- sức khoẻ tài chính ---------- */
  const sc = (v, lo, hi) => Math.round(Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * 100);
  function health(M, goals, inv, px) {
    const i = lastFull(M), a12 = k => avgBefore(M, i + 1, 12, k), a6 = k => avgBefore(M, i + 1, 6, k);
    const inc12 = a12('inc'), sp12 = a12('spend'), inc6 = a6('inc');
    const pf = portfolio(inv, px);
    const sav = M.cats.filter(c => c.group === 'tichluy' && /tiet kiem|vang/.test(norm(c.name)));
    let liquid = pf.depV; if (!liquid) { const all = range(M, 0, M.mon.length - 1); liquid = sav.reduce((s, c) => s + Math.max(0, all.cat[c.id]), 0); }
    const efMonths = sp12 > 0 ? liquid / sp12 : 0, rate6 = inc6 > 0 ? a6('tichluy') / inc6 : 0;
    const fixR = inc12 > 0 ? a12('codinh') / inc12 : 0, spR = inc6 > 0 ? a6('spend') / inc6 : 0;
    let n3 = 0, p3 = 0; if (i >= 5) { n3 = range(M, i - 2, i).linhhoat / 3; p3 = range(M, i - 5, i - 3).linhhoat / 3; }
    const flexTrend = p3 > 0 ? n3 / p3 - 1 : 0;
    let deficit = 0; for (let j = Math.max(0, i - 11); j <= i; j++) if (M.mon[j].free < 0) deficit++;
    const incs = []; for (let j = Math.max(0, i - 11); j <= i; j++) if (M.mon[j].inc > 0) incs.push(M.mon[j].inc);
    const mu = incs.reduce((s, x) => s + x, 0) / (incs.length || 1), cv = incs.length > 2 ? Math.sqrt(incs.reduce((s, x) => s + (x - mu) ** 2, 0) / incs.length) / mu : 0;
    const R12 = range(M, i - 11, i), srcN = M.cats.filter(c => c.group === 'thu' && R12.inc > 0 && R12.cat[c.id] / R12.inc >= .1).length;
    const y = M.months[i].y, cut = M.months[i].m, ytd = yy => { let s = 0; M.months.forEach((mo, j) => { if (mo.y === yy && mo.m <= cut && !M.mon[j].partial) s += M.mon[j].inc; }); return s; };
    const g1 = ytd(y), g0 = ytd(y - 1), growth = g0 > 0 ? g1 / g0 - 1 : 0;
    const invCats = M.cats.filter(c => c.group === 'tichluy' && /chung khoan|dau tu|co phieu|quy/.test(norm(c.name)));
    let invM = 0; for (let j = Math.max(0, i - 11); j <= i; j++) if (invCats.some(c => (c.vals[j] || 0) > 0)) invM++;
    const nAssets = pf.H.length + pf.D.length, plPct = pf.stockC > 0 ? (pf.stockV - pf.stockC) / pf.stockC : null;
    const gp = (goals || []).map(g => goalProgress(M, g)).filter(p => p.target > 0), save12 = a12('tichluy');
    const onTrack = gp.length ? gp.filter(p => p.done || p.need == null || save12 >= p.need).length / gp.length : null;
    const pill = (key, name, items) => { const s = Math.round(items.reduce((t, x) => t + x.s * x.w, 0) / items.reduce((t, x) => t + x.w, 0)); return { key, name, score: s, items }; };
    const P = [
      pill('save', 'Tích lũy & dự phòng', [
        { n: 'Tỉ lệ tích lũy 6 tháng', v: pct(rate6), goal: '≥ 20–30%', s: sc(rate6, 0, .3), w: 1 },
        { n: 'Quỹ dự phòng', v: efMonths.toFixed(1).replace('.', ',') + ' tháng chi tiêu', goal: '≥ 6 tháng', s: sc(efMonths, 0, 6), w: 1 }]),
      pill('spend', 'Chi tiêu', [
        { n: 'Chi cố định / thu nhập', v: pct(fixR), goal: '≤ 35%', s: sc(-fixR, -.6, -.2), w: 1 },
        { n: 'Chi tiêu / thu nhập 6 tháng', v: pct(spR), goal: '≤ 70%', s: sc(-spR, -1, -.6), w: 1 },
        { n: 'Chi linh hoạt 3 tháng gần đây', v: (flexTrend >= 0 ? '+' : '') + pct(flexTrend), goal: 'không tăng', s: sc(-flexTrend, -.5, 0), w: 1 },
        { n: 'Tháng thâm hụt (12 tháng)', v: deficit + ' tháng', goal: '0 tháng', s: Math.max(0, 100 - deficit * 15), w: 1 }]),
      pill('income', 'Thu nhập', [
        { n: 'Độ ổn định', v: 'dao động ' + pct(cv), goal: '≤ 20%', s: sc(-cv, -.8, -.2), w: 1 },
        { n: 'Nguồn thu đáng kể (≥10%)', v: srcN + ' nguồn', goal: '≥ 3 nguồn', s: srcN >= 3 ? 100 : srcN === 2 ? 70 : srcN === 1 ? 40 : 0, w: 1 },
        { n: 'Tăng trưởng cùng kỳ', v: g0 > 0 ? (growth >= 0 ? '+' : '') + pct(growth) : 'chưa đủ dữ liệu', goal: '≥ +10%', s: g0 > 0 ? sc(growth, -.2, .1) : 50, w: 1 }]),
      pill('invest', 'Đầu tư & mục tiêu', [
        { n: 'Đều đặn đầu tư (12 tháng)', v: invM + '/12 tháng', goal: '≥ 10 tháng', s: sc(invM, 0, 10), w: 1 },
        { n: 'Lãi/lỗ danh mục', v: plPct == null ? 'chưa nhập danh mục' : (plPct >= 0 ? '+' : '') + pct(plPct), goal: '≥ 0%', s: plPct == null ? 50 : sc(plPct, -.2, .2), w: 1 },
        { n: 'Đa dạng hoá', v: nAssets + ' tài sản', goal: '≥ 4 tài sản', s: nAssets ? Math.min(100, 20 + nAssets * 20) : 30, w: 1 },
        { n: 'Mục tiêu đúng tiến độ', v: onTrack == null ? 'chưa có mục tiêu' : pct(onTrack), goal: '100%', s: onTrack == null ? 50 : Math.round(onTrack * 100), w: 1 }])
    ];
    const score = Math.round(P.reduce((s, p) => s + p.score, 0) / P.length);
    return { score, grade: grade(score), pillars: P, i, efMonths, liquid, rate6, pf };
  }
  function grade(s) { return s >= 80 ? 'Rất khoẻ' : s >= 65 ? 'Khoẻ' : s >= 50 ? 'Ổn' : s >= 35 ? 'Cần cải thiện' : 'Báo động'; }

  /** thay đổi theo hạng mục: kỳ hiện tại so với kỳ trước (cùng độ dài) */
  function catChanges(M, R) {
    if (!R || !R.prev) return [];
    return M.cats.filter(c => c.group === 'codinh' || c.group === 'linhhoat').map(c => ({ c, now: R.cat[c.id] || 0, before: R.prev.cat[c.id] || 0 })).map(x => Object.assign(x, { d: x.now - x.before }))
      .filter(x => x.now || x.before).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  }

  /** bản tóm tắt gửi Gemini (không gửi tên người khác, chỉ số tổng hợp) */
  function aiBrief(M, goals, inv, px, stamp) {
    const H = health(M, goals, inv, px), i = H.i, f = n => short(n);
    const L = [];
    L.push('Số liệu đến: ' + (stamp || M.months[M.mon.length - 1].label) + '. Tháng phân tích chính: ' + M.months[i].label + '.');
    L.push('12 tháng gần nhất (tháng: thu / chi cố định / chi linh hoạt / tích lũy / còn dư):');
    M.mon.slice(Math.max(0, i - 11), i + 1).forEach(m => L.push(`${m.label}: ${f(m.inc)} / ${f(m.codinh)} / ${f(m.linhhoat)} / ${f(m.tichluy)} / ${f(m.free)}`));
    const R12 = range(M, i - 11, i);
    L.push('Nguồn thu 12 tháng: ' + M.cats.filter(c => c.group === 'thu').map(c => `${c.name} ${f(R12.cat[c.id])} (${pct(R12.inc ? R12.cat[c.id] / R12.inc : 0)})`).join(', '));
    L.push('Chi theo hạng mục 12 tháng: ' + M.cats.filter(c => c.group === 'codinh' || c.group === 'linhhoat').map(c => ({ n: c.name, v: R12.cat[c.id] })).sort((a, b) => b.v - a.v).map(x => x.n + ' ' + f(x.v)).join(', '));
    L.push('Tích lũy 12 tháng: ' + M.cats.filter(c => c.group === 'tichluy').map(c => c.name + ' ' + f(R12.cat[c.id])).join(', '));
    L.push(`Điểm sức khoẻ tài chính: ${H.score}/100 (${H.grade}). ` + H.pillars.map(p => `${p.name} ${p.score}: ` + p.items.map(x => `${x.n} ${x.v}`).join('; ')).join(' | '));
    const pf = H.pf;
    if (pf.H.length || pf.D.length) {
      L.push(`Danh mục đầu tư: tổng ${f(pf.total)}, vốn ${f(pf.cost)}, lãi/lỗ ${f(pf.pl)}.`);
      pf.H.forEach(h => L.push(`- ${h.code} (${h.type === 'quy' ? 'quỹ mở' : 'cổ phiếu/ETF'}): ${h.qty} đv, giá vốn ${f(h.cost / (h.qty || 1))}, giá ${f(h.price)}, lãi/lỗ ${pct(h.plPct)}`));
      pf.D.forEach(d => L.push(`- Tiền gửi ${d.bank || ''}: ${f(d.amt)} lãi ${d.rate}%/năm kỳ hạn ${d.term || 0} tháng, lãi tạm tính ${f(d.interest)}`));
    } else L.push('Chưa nhập danh mục đầu tư chi tiết.');
    (goals || []).forEach(g => { const p = goalProgress(M, g); L.push(`Mục tiêu ${g.name}: ${f(p.cur)}/${f(p.target)}${g.deadline ? ' hạn ' + g.deadline : ''}${p.need != null ? ', cần ' + f(p.need) + '/tháng' : ''}`); });
    return L.join('\n');
  }


  /** tóm tắt đầy đủ cho Học viện (điểm sức khoẻ, danh mục, lời khuyên) */
  function fullSummary(M, goals, inv, px, sync, aiText) {
    const sum = summary(M, goals, sync), H = health(M, goals, inv, px);
    sum.health = { score: H.score, grade: H.grade, pillars: H.pillars.map(p => ({ n: p.name, s: p.score })) };
    sum.pf = { total: H.pf.total, pl: H.pf.pl, cost: H.pf.cost, day: H.pf.day, n: H.pf.H.length + H.pf.D.length };
    sum.stamp = M.stamp || ''; sum.ai = aiText || '';
    return sum;
  }

  /* ---------- Két sắt: mã hoá dữ liệu bằng mật khẩu 6 số (PBKDF2-SHA256 → AES-GCM 256) ---------- */
  const b64 = u => btoa(String.fromCharCode(...new Uint8Array(u)));
  const ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const Vault = {
    ITER: 310000,
    okPin: p => /^\d{6}$/.test(String(p || '')),
    newSalt: () => b64(crypto.getRandomValues(new Uint8Array(16))),
    async key(pin, salt, iter) {
      const base = await crypto.subtle.importKey('raw', new TextEncoder().encode('mintun:' + pin), 'PBKDF2', false, ['deriveKey']);
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: ub64(salt), iterations: iter || Vault.ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    },
    async seal(k, obj, meta) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k.key, new TextEncoder().encode(JSON.stringify(obj)));
      return Object.assign({ v: 2, salt: k.salt, iter: k.iter, iv: b64(iv), ct: b64(ct) }, meta || {});
    },
    async open(k, box) {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64(box.iv) }, k.key, ub64(box.ct));
      return JSON.parse(new TextDecoder().decode(pt));
    },
    /** mở bằng PIN: trả về {k, data} hoặc ném lỗi nếu sai */
    async unlock(pin, box) {
      const key = await Vault.key(pin, box.salt, box.iter);
      const k = { key, salt: box.salt, iter: box.iter || Vault.ITER };
      return { k, data: await Vault.open(k, box) };
    },
    async make(pin) { const salt = Vault.newSalt(); return { key: await Vault.key(pin, salt, Vault.ITER), salt, iter: Vault.ITER }; },
    /** chống đoán: sai 5 lần khoá 30 giây, mỗi lần sai thêm gấp đôi (tối đa 15 phút) */
    tries() { try { return JSON.parse(localStorage.getItem('mintun-pin-tries') || '{"n":0,"until":0}'); } catch (e) { return { n: 0, until: 0 }; } },
    wait() { const t = Vault.tries(); return Math.max(0, t.until - Date.now()); },
    fail() { const t = Vault.tries(); t.n++; if (t.n >= 5) t.until = Date.now() + Math.min(900e3, 30e3 * Math.pow(2, t.n - 5)); localStorage.setItem('mintun-pin-tries', JSON.stringify(t)); return t; },
    ok() { localStorage.removeItem('mintun-pin-tries'); }
  };

  root.MintunVault = Vault;
  root.MintunFin = { GROUPS, fullSummary, parse, periodRange, portfolio, depositValue, health, grade, catChanges, aiBrief, range, avgBefore, catAvg, lastIdx, lastFull, vnd, short, pct, num, norm, goalProgress, tips, tipOfDay, summary, defaultGroup, dayNo };
})(typeof window !== 'undefined' ? window : globalThis);
