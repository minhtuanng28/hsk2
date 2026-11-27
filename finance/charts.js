/* Ngân hàng Mintun · biểu đồ SVG tự vẽ (donut, vùng, vòng điểm, cột lệch, sparkline) + hiệu ứng.
   Không dùng thư viện ngoài để app chạy mãi trên GitHub Pages. */
(function (root) {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SLOTS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)'];
  /** màu theo thứ tự cố định; sau 7 màu thì pha nhạt về nền thẻ (như Wealthfolio) */
  const slot = i => i < SLOTS.length ? SLOTS[i] : `color-mix(in oklab, ${SLOTS[i % SLOTS.length]} 50%, var(--card))`;

  /* ---------- donut ----------
     items: [{name, value, color, sub?}], opts: {id, total?, center:{label, value}, fmt, hide} */
  function donut(items, opts) {
    const R = 74, SW = 20, C = 2 * Math.PI * R, GAP = items.filter(x => x.value > 0).length > 1 ? 3.2 : 0;
    const tot = opts.total || items.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
    let acc = 0, segs = '';
    items.forEach((x, i) => {
      if (x.value <= 0) return;
      const len = Math.max(0.6, x.value / tot * C - GAP), off = -(acc + GAP / 2);
      acc += x.value / tot * C;
      const col = x.color || slot(i);
      segs += `<circle class="dseg" data-di="${i}" r="${R}" cx="100" cy="100" fill="none" stroke="${col}" stroke-width="${SW}" stroke-dasharray="0 ${C}" data-len="${len.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" ${x.hatch ? `style="stroke:url(#hatch-${opts.id})"` : ''} transform="rotate(-90 100 100)"></circle>`;
    });
    return `<div class="donut" data-donut="${opts.id}">
      <svg viewBox="0 0 200 200" role="img" aria-label="${esc(opts.aria || 'Biểu đồ tròn')}">
        <defs><pattern id="hatch-${opts.id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--ui)"/><rect width="2.2" height="6" fill="var(--mute)" opacity=".55"/></pattern></defs>
        <circle r="${R}" cx="100" cy="100" fill="none" stroke="var(--ui)" stroke-width="${SW}" opacity=".55"></circle>
        ${segs}
        <circle class="dring" r="${R + SW / 2 + 5}" cx="100" cy="100" fill="none" stroke-width="3" stroke-dasharray="0 999" transform="rotate(-90 100 100)"></circle>
      </svg>
      <div class="dcen"><small>${esc(opts.center.label)}</small><b class="num">${opts.center.value}</b><i>${esc(opts.center.sub || '')}</i></div>
    </div>`;
  }
  /** gắn hiệu ứng + tương tác cho donut sau khi chèn vào DOM */
  function wireDonut(el, items, opts) {
    if (!el) return;
    const R = 74, SW = 20, C = 2 * Math.PI * R, segs = [...el.querySelectorAll('.dseg')], ring = el.querySelector('.dring'), cen = el.querySelector('.dcen');
    const tot = opts.total || items.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
    const grow = () => segs.forEach(s => s.setAttribute('stroke-dasharray', s.dataset.len + ' ' + C));
    if (reduce()) grow(); else requestAnimationFrame(() => requestAnimationFrame(grow));
    const set = i => {
      segs.forEach(s => s.classList.toggle('on', +s.dataset.di === i));
      if (i == null || !items[i]) { ring.setAttribute('stroke-dasharray', '0 999'); cen.innerHTML = `<small>${esc(opts.center.label)}</small><b class="num">${opts.center.value}</b><i>${esc(opts.center.sub || '')}</i>`; return; }
      const x = items[i], seg = segs.find(s => +s.dataset.di === i), RR = R + SW / 2 + 5, CC = 2 * Math.PI * RR;
      const start = -parseFloat(seg.getAttribute('stroke-dashoffset')) / C, len = parseFloat(seg.dataset.len) / C;
      ring.setAttribute('stroke', x.color || slot(i)); ring.setAttribute('stroke-dasharray', (len * CC).toFixed(1) + ' ' + CC); ring.setAttribute('stroke-dashoffset', (-start * CC).toFixed(1));
      cen.innerHTML = `<small>${esc(x.name)}</small><b class="num">${opts.fmt(x.value)}</b><i>${Math.round(x.value / tot * 1000) / 10}%</i>`;
    };
    el.addEventListener('pointerover', e => { const s = e.target.closest('.dseg'); if (s) set(+s.dataset.di); });
    el.addEventListener('pointerleave', () => set(opts.active ?? null));
    el._set = set;
    if (opts.active != null) set(opts.active);
  }

  /* ---------- biểu đồ vùng / đường theo thời gian ----------
     series: [{name, values, color, area?}], labels: [], opts:{h, fmt} */
  function scale(series, opts) {
    const vals = series.flatMap(s => s.values).filter(v => v != null && (opts.zero === false || v > 0)).sort((a, b) => a - b);
    if (opts.zero === false && vals.length) {   // trục không bắt đầu từ 0 (giá trị danh mục)
      let lo = vals[0], hi = vals[vals.length - 1]; const pad = (hi - lo) * .15 || hi * .02 || 1; lo -= pad; hi += pad;
      const st = nice((hi - lo) / 4); lo = Math.floor(lo / st) * st; hi = lo + st * 4; if (hi < vals[vals.length - 1]) hi += st;
      return { lo, hi };
    }
    let mx = vals[vals.length - 1] || 1; const p85 = vals[Math.floor((vals.length - 1) * .85)] || mx;
    if (vals.length >= 6 && mx > p85 * 1.9) mx = p85 * 1.35;
    return { lo: 0, hi: nice(mx) };
  }
  /* biểu đồ vùng / đường: vẽ theo đúng bề rộng thật của khung để chữ không méo */
  function area(series, labels, opts) { return `<div class="area" data-area="${opts.id}" style="height:${opts.h || 220}px" role="img" aria-label="${esc(opts.aria || '')}"></div>`; }
  function wireArea(el, series, labels, opts, showTip, hideTip) {
    if (!el) return;
    const W = Math.max(260, Math.round(el.clientWidth || 600)), H = opts.h || 220, pl = 44, pr = 8, pt = 12, pb = 24, n = labels.length;
    const { lo, hi } = scale(series, opts);
    const x = i => pl + (n < 2 ? (W - pl - pr) / 2 : i * (W - pl - pr) / (n - 1)), y = v => pt + (H - pt - pb) * (1 - (Math.min(Math.max(v, lo), hi) - lo) / (hi - lo));
    let s = '';
    for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4, yy = y(v); s += `<line x1="${pl}" x2="${W - pr}" y1="${yy}" y2="${yy}" stroke="var(--grid)"/><text x="${pl - 8}" y="${yy + 3.5}" text-anchor="end">${v ? opts.fmtAxis(v) : '0'}</text>`; }
    const step = Math.ceil(n / Math.max(2, Math.floor(W / 58)));
    labels.forEach((l, i) => { if (i % step === 0 || (i === n - 1 && (n - 1) % step > step / 2)) s += `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === n - 1 && n > 1 ? 'end' : i === 0 && n > 1 ? 'start' : 'middle'}">${esc(l)}</text>`; });
    series.forEach((se, si) => {
      const d = se.values.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join('');
      if (se.area) s += `<defs><linearGradient id="g-${opts.id}-${si}" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stop-color="${se.color}" stop-opacity=".28"/><stop offset="70%" stop-color="${se.color}" stop-opacity=".1"/><stop offset="100%" stop-color="${se.color}" stop-opacity="0"/></linearGradient></defs>
        <path class="afill" d="${d}L${x(n - 1)} ${H - pb}L${x(0)} ${H - pb}Z" fill="url(#g-${opts.id}-${si})"/>`;
      s += `<path class="aline" d="${d}" fill="none" stroke="${se.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${se.dash ? 'stroke-dasharray="5 4"' : ''}/>`;
    });
    s += `<line class="xh" x1="0" x2="0" y1="${pt}" y2="${H - pb}" stroke="var(--mute)" stroke-dasharray="3 3" opacity="0"/>`;
    series.forEach((se, si) => s += `<circle class="xd" data-s="${si}" r="4.5" fill="${se.color}" stroke="var(--card)" stroke-width="2" opacity="0"/>`);
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${s}</svg>`;
    const svg = el.querySelector('svg'), lines = [...el.querySelectorAll('.aline')];
    if (!reduce()) lines.forEach(p => { if (p.getAttribute('stroke-dasharray')) return; const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; p.getBoundingClientRect(); p.style.transition = 'stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)'; p.style.strokeDashoffset = 0; setTimeout(() => { p.style.strokeDasharray = ''; }, 950); });
    const xh = el.querySelector('.xh'), dots = [...el.querySelectorAll('.xd')];
    const move = e => {
      const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * W;
      const i = Math.max(0, Math.min(n - 1, Math.round((px - pl) / ((W - pl - pr) / Math.max(1, n - 1)))));
      xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.setAttribute('opacity', 1);
      dots.forEach(d => { const se = series[+d.dataset.s]; d.setAttribute('cx', x(i)); d.setAttribute('cy', y(se.values[i])); d.setAttribute('opacity', 1); });
      showTip(e, `<b>${esc(labels[i])}</b>` + series.map(se => `<div class="r"><span><i style="--c:${se.color}"></i>${esc(se.name)}</span><b class="num">${opts.fmt(se.values[i])}</b></div>`).join('') + (opts.extra ? opts.extra(i) : ''));
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerdown', move);
    el.addEventListener('pointerleave', () => { xh.setAttribute('opacity', 0); dots.forEach(d => d.setAttribute('opacity', 0)); hideTip(); });
  }
  function nice(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }

  /* ---------- vòng điểm ---------- */
  function ring(score, opts) {
    const size = opts.size || 160, sw = opts.sw || 12, r = (size - sw) / 2 - 2, C = 2 * Math.PI * r, col = scoreColor(score);
    return `<div class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}"><circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--ui)" stroke-width="${sw}"/>
      <circle class="rgo" r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="0 ${C}" data-len="${(score / 100 * C).toFixed(1)}" data-c="${C.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>
      <div class="rc"><b class="num" data-count="${score}" data-fmt="int">${score}</b>${opts.label ? `<small>${esc(opts.label)}</small>` : ''}</div></div>`;
  }
  function scoreColor(s) { return s >= 65 ? 'var(--gain)' : s >= 45 ? 'var(--warn)' : 'var(--loss)'; }
  function growRings(root) {
    root.querySelectorAll('.rgo').forEach(c => { const go = () => c.setAttribute('stroke-dasharray', c.dataset.len + ' ' + c.dataset.c); if (reduce()) go(); else requestAnimationFrame(() => requestAnimationFrame(go)); });
    root.querySelectorAll('[data-grow]').forEach(b => { const go = () => b.style.setProperty('--w', b.dataset.grow); if (reduce()) go(); else requestAnimationFrame(() => requestAnimationFrame(go)); });
  }

  /* ---------- sparkline ---------- */
  function spark(vals, color, w = 90, h = 30) {
    vals = vals.filter(v => v != null); if (vals.length < 2) return `<svg class="sp" viewBox="0 0 ${w} ${h}"></svg>`;
    const mn = Math.min(...vals), mx = Math.max(...vals), rg = mx - mn || 1;
    const d = vals.map((v, i) => (i ? 'L' : 'M') + (i * (w - 4) / (vals.length - 1) + 2).toFixed(1) + ' ' + (h - 3 - (v - mn) / rg * (h - 6)).toFixed(1)).join('');
    return `<svg class="sp" viewBox="0 0 ${w} ${h}"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }

  /* ---------- đếm số ---------- */
  const last = {};
  function countUp(root, fmt) {
    root.querySelectorAll('[data-count]').forEach(el => {
      const to = parseFloat(el.dataset.count), key = el.dataset.key || '', f = fmt[el.dataset.fmt] || fmt.short;
      if (!isFinite(to)) return;
      const from = key && last[key] != null ? last[key] : (el.dataset.fmt === 'int' ? 0 : to * .6);
      if (key) last[key] = to;
      if (reduce() || from === to) { el.textContent = f(to); return; }
      const t0 = performance.now(), dur = 700;
      const step = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = f(from + (to - from) * e); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }

  root.MC = { donut, wireDonut, area, wireArea, ring, growRings, spark, countUp, slot, scoreColor, nice };
})(window);
