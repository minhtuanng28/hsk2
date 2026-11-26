/*
 * BÀN DUYỆT BÀI – module gắn vào phòng làm việc MKT của Học viện
 *
 * Cách dùng:
 *   <div id="ban-duyet-bai"></div>
 *   <script src="ban-duyet-bai.js"></script>
 *   <script>
 *     BanDuyetBai.init({
 *       container: '#ban-duyet-bai',
 *       onBadge: n => { ... hiện số n trên toà nhà phòng MKT ... },
 *       onMo: () => { ... chuyển nhân vật / màn hình sang phòng MKT ... },
 *     });
 *     BanDuyetBai.kiemTraKhiMo();   // gọi 1 lần khi mở app
 *   </script>
 *
 * URL Web App và mã bàn duyệt KHÔNG nằm trong code: bấm "Cài đặt" trên bàn duyệt
 * để nhập, chúng được lưu trong trình duyệt của từng máy.
 * Muốn xem thử không cần backend: BanDuyetBai.init({ container, demo: true }).
 */
(function () {
  'use strict';

  const LS = { url: 'bdb_api_url', key: 'bdb_key' };
  const TT = { CHO: 'Chờ duyệt', DUYET: 'Đã duyệt', DANG_DANG: 'Đang đăng', DANG: 'Đã đăng', BO: 'Bỏ', HET: 'Hết hạn', LOI: 'Lỗi' };
  const NHOM = [
    { id: 'can', ten: 'Cần duyệt', tt: [TT.CHO, TT.LOI] },
    { id: 'cho_dang', ten: 'Chờ đăng', tt: [TT.DUYET, TT.DANG_DANG] },
    { id: 'da_dang', ten: 'Đã đăng', tt: [TT.DANG] },
    { id: 'khac', ten: 'Bỏ / hết hạn', tt: [TT.BO, TT.HET] },
  ];

  const st = { root: null, bai: [], tuyen: [], nhom: 'can', locPage: '', demo: false, onBadge: null, onMo: null, panel: '' };

  /* ---------------- lưu cấu hình trên máy ---------------- */
  const store = {
    get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } },
  };

  /* ---------------- gọi API ---------------- */
  async function api(action, data) {
    if (st.demo) return Demo.api(action, data || {});
    const url = store.get(LS.url), key = store.get(LS.key);
    if (!url || !key) throw new Error('Chưa cài URL Web App hoặc mã bàn duyệt (bấm Cài đặt).');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action, key }, data || {})),
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.loi || 'Có lỗi');
    return j;
  }

  /* ---------------- tiện ích ---------------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tenMien = u => { const m = String(u || '').match(/^https?:\/\/(?:www\.)?([^/]+)/i); return m ? m[1] : ''; };
  /** Chỉ cho phép link http(s) – chặn javascript:, data: từ nguồn RSS độc hại. */
  const safeUrl = u => /^https?:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : '';
  const MAU = ['', 'm1', 'm2', 'm3', 'm4', 'm5'];
  const mauTuyen = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return MAU[h % MAU.length]; };
  const nhieuPage = () => new Set(st.tuyen.map(t => t.page_key)).size > 1;
  const tag = b => `<span class="bdb-tag ${mauTuyen(b.tuyen_id)}">${esc(b.ten_tuyen || b.tuyen_id)}</span>` +
    (nhieuPage() ? `<span class="bdb-page">${esc(b.ten_page || b.page_key)}</span>` : '');

  function toast(html, opts) {
    opts = opts || {};
    injectCss();
    let wrap = document.querySelector('.bdb-toasts');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'bdb-toasts'; document.body.appendChild(wrap); }
    const t = document.createElement('div');
    t.className = 'bdb-toast' + (opts.loai ? ' bdb-toast-' + opts.loai : '');
    t.innerHTML = html;
    wrap.appendChild(t);
    const dong = () => { t.classList.add('bdb-out'); setTimeout(() => t.remove(), 250); };
    t.querySelectorAll('[data-dong]').forEach(b => b.addEventListener('click', dong));
    if (opts.tuDong !== false) setTimeout(dong, opts.ms || 4000);
    return t;
  }

  /* ---------------- CSS ---------------- */
  function injectCss() {
    if (document.getElementById('bdb-css')) return;
    const s = document.createElement('style');
    s.id = 'bdb-css';
    s.textContent = `
.bdb{--bdb-bg:#fff;--bdb-soft:#f5f5f2;--bdb-line:#e3e1da;--bdb-text:#1f1f1d;--bdb-mute:#6b6a64;--bdb-acc:#1d6fd6;--bdb-ok:#1d8a5a;--bdb-bad:#c0392b;--bdb-warn:#b7791f;
 font:14px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--bdb-text);max-width:760px;margin:0 auto}
@media (prefers-color-scheme:dark){.bdb{--bdb-bg:#22221f;--bdb-soft:#2b2b28;--bdb-line:#3a3a36;--bdb-text:#ecebe6;--bdb-mute:#a3a29b}}
.bdb *{box-sizing:border-box}
.bdb-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.bdb-head h2{font-size:18px;font-weight:600;margin:0;flex:1}
.bdb-head small{color:var(--bdb-mute);font-weight:400;margin-left:6px}
.bdb button{font:inherit;border:1px solid var(--bdb-line);background:var(--bdb-bg);color:var(--bdb-text);border-radius:8px;padding:6px 12px;cursor:pointer}
.bdb button:hover{border-color:var(--bdb-mute)}
.bdb button:disabled{opacity:.5;cursor:default}
.bdb .bdb-pri{background:var(--bdb-acc);border-color:var(--bdb-acc);color:#fff}
.bdb .bdb-danger{color:var(--bdb-bad)}
.bdb-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.bdb-chip{border-radius:999px!important;padding:4px 12px!important;font-size:13px}
.bdb-chip.on{background:var(--bdb-text)!important;color:var(--bdb-bg)!important;border-color:var(--bdb-text)!important}
.bdb-panel{background:var(--bdb-soft);border:1px solid var(--bdb-line);border-radius:12px;padding:12px;margin-bottom:12px;display:grid;gap:8px}
.bdb input,.bdb select,.bdb textarea{font:inherit;color:var(--bdb-text);background:var(--bdb-bg);border:1px solid var(--bdb-line);border-radius:8px;padding:6px 10px;width:100%}
.bdb textarea{resize:vertical}
.bdb-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.bdb-row>label{display:flex;gap:6px;align-items:center;color:var(--bdb-mute);font-size:13px}
.bdb-row>label input,.bdb-row>label select{width:auto}
.bdb-card{background:var(--bdb-bg);border:1px solid var(--bdb-line);border-radius:12px;padding:14px;margin-bottom:12px;display:grid;gap:10px}
.bdb-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px;color:var(--bdb-mute)}
.bdb-meta a{color:inherit}
.bdb-tag{font-size:12px;font-weight:600;padding:2px 8px;border-radius:6px;background:#e8f0fd;color:#174a8c}
.bdb-tag.m1{background:#fdf0e3;color:#8a4a12}.bdb-tag.m2{background:#e6f4ec;color:#1d6b45}.bdb-tag.m3{background:#f3e8fb;color:#6a2d8f}.bdb-tag.m4{background:#fbe8ee;color:#8f2d4f}.bdb-tag.m5{background:#e6f3f5;color:#1d5f6b}
.bdb-page{font-size:12px;padding:2px 8px;border-radius:6px;border:1px solid var(--bdb-line)}
.bdb-warn{color:var(--bdb-warn);font-size:13px}
.bdb-st{font-size:12px;padding:2px 8px;border-radius:6px;background:var(--bdb-soft)}
.bdb-st.loi{background:#fbe9e7;color:var(--bdb-bad)}
.bdb-st.duyet{background:#e6f4ec;color:var(--bdb-ok)}
.bdb-fb{border:1px solid var(--bdb-line);border-radius:10px;overflow:hidden}
.bdb-fb-head{display:flex;gap:10px;align-items:center;padding:10px 12px 4px}
.bdb-av{width:34px;height:34px;border-radius:50%;background:var(--bdb-acc);color:#fff;display:grid;place-items:center;font-weight:600;font-size:13px}
.bdb-fb-head small{display:block;color:var(--bdb-mute);font-size:12px}
.bdb-fb textarea{border:0;border-radius:0;padding:8px 12px;min-height:240px;background:transparent}
.bdb-fb-text{padding:8px 12px;white-space:pre-wrap}
.bdb-media img{display:block;width:100%;max-height:360px;object-fit:cover}
.bdb-noimg{padding:28px;text-align:center;color:var(--bdb-mute);background:var(--bdb-soft);font-size:13px}
.bdb-link{background:var(--bdb-soft);padding:10px 12px;border-top:1px solid var(--bdb-line)}
.bdb-link small{color:var(--bdb-mute);text-transform:uppercase;font-size:11px;letter-spacing:.03em}
.bdb-link div{font-weight:600}
.bdb-err{color:var(--bdb-bad);font-size:13px}
.bdb-empty{text-align:center;color:var(--bdb-mute);padding:32px 12px;border:1px dashed var(--bdb-line);border-radius:12px}
.bdb-busy{opacity:.6;pointer-events:none}
.bdb-toasts{position:fixed;bottom:16px;right:16px;left:auto;z-index:99999;display:grid;gap:8px;max-width:340px}
.bdb-toast{font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#1f1f1d;color:#fff;border-radius:12px;padding:12px 14px;box-shadow:0 6px 24px rgba(0,0,0,.18);transition:opacity .25s,transform .25s}
.bdb-toast b{display:block;margin-bottom:2px}
.bdb-toast-can{background:#1d6fd6}
.bdb-toast-loi{background:#c0392b}
.bdb-toast .bdb-tbtn{margin-top:8px;display:flex;gap:6px}
.bdb-toast button{font:inherit;font-size:13px;border:0;border-radius:8px;padding:5px 10px;cursor:pointer;background:rgba(255,255,255,.18);color:#fff}
.bdb-toast button.bdb-pri{background:#fff;color:#1d6fd6}
.bdb-out{opacity:0;transform:translateY(6px)}
@media (max-width:480px){.bdb-toasts{left:12px;right:12px;bottom:12px;max-width:none}}
`;
    document.head.appendChild(s);
  }

  /* ---------------- render ---------------- */
  function demNhom(id) {
    const n = NHOM.find(x => x.id === id);
    return baiDangLoc().filter(b => n.tt.includes(b.trang_thai)).length;
  }

  function baiDangLoc() { return st.bai.filter(b => !st.locPage || b.page_key === st.locPage); }

  function render() {
    if (!st.root) return;
    const nhom = NHOM.find(x => x.id === st.nhom);
    const ds = baiDangLoc().filter(b => nhom.tt.includes(b.trang_thai));
    const pages = [...new Map(st.tuyen.map(t => [t.page_key, t.ten_page])).entries()];
    const homNay = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' });

    st.root.innerHTML = `
<div class="bdb">
  <div class="bdb-head">
    <h2>Bàn duyệt bài<small>${esc(homNay)}${st.demo ? ' · chế độ demo' : ''}</small></h2>
    <button data-bdb="lam_moi">Làm mới</button>
    <button data-bdb="mo_panel" data-panel="nguon">+ Thêm nguồn</button>
    <button data-bdb="mo_panel" data-panel="cai_dat">Cài đặt</button>
  </div>
  ${st.panel === 'nguon' ? panelNguon() : ''}
  ${st.panel === 'cai_dat' ? panelCaiDat() : ''}
  <div class="bdb-chips">
    ${pages.length > 1 ? `<select class="bdb-locpage" style="width:auto"><option value="">Tất cả page</option>${pages.map(([k, t]) => `<option value="${esc(k)}" ${k === st.locPage ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>` : ''}
    ${NHOM.map(n => `<button class="bdb-chip ${n.id === st.nhom ? 'on' : ''}" data-bdb="nhom" data-nhom="${n.id}">${n.ten} (${demNhom(n.id)})</button>`).join('')}
  </div>
  ${ds.length ? ds.map(the).join('') : rong()}
</div>`;
  }

  function rong() {
    if (st.nhom !== 'can') return `<div class="bdb-empty">Không có bài nào ở mục này.</div>`;
    const ts = st.tuyen.filter(t => !st.locPage || t.page_key === st.locPage);
    return `<div class="bdb-empty">Không có bài nào cần duyệt.<br><br>
      <div class="bdb-row" style="justify-content:center">
        ${ts.map(t => `<button data-bdb="tao_lai" data-tuyen="${esc(t.tuyen_id)}">Tạo bài ${esc(t.ten_tuyen)}${nhieuPage() ? ' · ' + esc(t.ten_page) : ''}</button>`).join('')}
      </div></div>`;
  }

  function panelNguon() {
    return `<div class="bdb-panel" data-form="nguon">
  <b>Thêm nguồn cho agent</b>
  <div class="bdb-row">
    <label>Tuyến bài <select name="tuyen_id">${st.tuyen.map(t => `<option value="${esc(t.tuyen_id)}">${esc(t.ten_tuyen)}${nhieuPage() ? ' · ' + esc(t.ten_page) : ''}</option>`).join('')}</select></label>
  </div>
  <input name="link" placeholder="Link bài báo hoặc bài cộng đồng (có thể bỏ trống)">
  <textarea name="ghi_chu" rows="3" placeholder="Bài cộng đồng Facebook: dán nội dung bài vào đây (Facebook chặn đọc tự động). Link báo: có thể ghi chú góc viết mong muốn."></textarea>
  <div class="bdb-row"><button class="bdb-pri" data-bdb="them_nguon">Lưu nguồn</button><button data-bdb="dong_panel">Đóng</button></div>
</div>`;
  }

  function panelCaiDat() {
    return `<div class="bdb-panel" data-form="cai_dat">
  <b>Kết nối với Apps Script</b>
  <input name="url" placeholder="URL Web App (https://script.google.com/macros/s/.../exec)" value="${esc(store.get(LS.url))}">
  <input name="key" type="password" placeholder="Mã bàn duyệt (DESK_KEY)" value="${esc(store.get(LS.key))}">
  <small style="color:var(--bdb-mute)">Chỉ lưu trên trình duyệt của máy này, không đưa lên GitHub. URL phải là script.google.com.</small>
  <div class="bdb-row"><button class="bdb-pri" data-bdb="luu_cai_dat">Lưu và tải bài</button><button data-bdb="dong_panel">Đóng</button></div>
</div>`;
  }

  function the(b) {
    const sua = b.trang_thai === TT.CHO || b.trang_thai === TT.DUYET || b.trang_thai === TT.LOI;
    const stCls = b.trang_thai === TT.LOI ? 'loi' : b.trang_thai === TT.DUYET ? 'duyet' : '';
    const link = safeUrl(b.link_nguon);
    const nguon = link
      ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(b.tieu_de_nguon || b.ten_nguon)}</a>`
      : esc(b.tieu_de_nguon || b.ten_nguon || '');
    const media = b.kieu_dang === 'link' && link
      ? `<div class="bdb-link"><small>${esc(tenMien(link))}</small><div>${esc(b.tieu_de_nguon)}</div></div>`
      : (b.anh ? `<div class="bdb-media"><img alt="Ảnh bài đăng" src="${esc(/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(b.anh) ? b.anh : '')}"></div>`
        : `<div class="bdb-noimg">${b.co_anh ? 'Ảnh có trong Drive (không tải được bản xem trước)' : 'Chưa có ảnh: bài sẽ đăng dạng chữ. Bấm "Đổi ảnh" để lấy ảnh từ thư mục Drive.'}</div>`);

    if (b.trang_thai === TT.LOI && !b.noi_dung) {
      return `<div class="bdb-card" data-id="${esc(b.id)}">
  <div class="bdb-meta">${tag(b)}<span class="bdb-st loi">Lỗi</span><span>${esc(b.ngay)}</span></div>
  <div class="bdb-err">${esc(b.loi)}</div>
  <div class="bdb-row"><button class="bdb-pri" data-bdb="tao_lai" data-tuyen="${esc(b.tuyen_id)}">Tạo lại bài ${esc(b.ten_tuyen || b.tuyen_id)}</button><button class="bdb-danger" data-bdb="bo">Bỏ</button></div>
</div>`;
    }

    return `<div class="bdb-card" data-id="${esc(b.id)}">
  <div class="bdb-meta">
    ${tag(b)}
    <span class="bdb-st ${stCls}">${esc(b.trang_thai)}</span>
    <span>${esc(b.ngay)} · ${nguon}</span>
  </div>
  ${b.loi ? `<div class="bdb-err">${esc(b.loi)}</div>` : ''}
  ${b.trang_thai === TT.DANG_DANG ? `<div class="bdb-warn">Đang gửi lên Facebook. Nếu trạng thái này kéo dài quá 15 phút, hãy kiểm tra trên page xem bài đã lên chưa rồi xử lý trong sheet Bai_dang. Hệ thống không tự đăng lại để tránh đăng trùng.</div>` : ''}
  <div class="bdb-fb">
    <div class="bdb-fb-head"><div class="bdb-av">${esc(String(b.ten_page || 'P').trim().charAt(0).toUpperCase())}</div><div><b>${esc(b.ten_page || 'Fanpage')}</b><small>${b.trang_thai === TT.DANG ? 'Đã đăng' : 'Đăng lúc ' + esc(b.gio_dang) + ' · ' + esc(b.ngay)}</small></div></div>
    ${sua ? `<textarea name="noi_dung">${esc(b.noi_dung)}</textarea>` : `<div class="bdb-fb-text">${esc(b.noi_dung)}</div>`}
    ${media}
  </div>
  ${sua ? `
  <div class="bdb-row">
    <label>Giờ đăng <input type="time" name="gio_dang" value="${esc(b.gio_dang)}"></label>
    <label>Kiểu <select name="kieu_dang">
      <option value="anh" ${b.kieu_dang !== 'link' ? 'selected' : ''}>Chỉ ảnh</option>
      ${link && !/facebook\.com|fb\.com/i.test(link) ? `<option value="link" ${b.kieu_dang === 'link' ? 'selected' : ''}>Kèm link báo</option>` : ''}
    </select></label>
    <button data-bdb="doi_anh">Đổi ảnh</button>
  </div>
  <div class="bdb-row">
    <input name="ghi_chu" style="flex:1;min-width:200px" placeholder="Muốn AI sửa gì? VD: ngắn hơn, mở bài mạnh hơn, nhấn vào lãi suất">
    <button data-bdb="sua_ai">AI viết lại${b.so_lan_sua ? ' (' + esc(b.so_lan_sua) + ')' : ''}</button>
  </div>
  <div class="bdb-row">
    ${b.trang_thai === TT.DUYET
        ? `<button data-bdb="luu">Lưu thay đổi</button><button data-bdb="huy_duyet">Huỷ duyệt</button>`
        : `<button class="bdb-pri" data-bdb="duyet">Duyệt</button><button data-bdb="luu">Lưu nháp</button>`}
    <button class="bdb-danger" data-bdb="bo">Bỏ bài</button>
  </div>` : (safeUrl(b.fb_link) ? `<div class="bdb-row"><a href="${esc(safeUrl(b.fb_link))}" target="_blank" rel="noopener noreferrer">Xem bài trên Facebook</a></div>` : '')}
</div>`;
  }

  /* ---------------- hành động ---------------- */
  async function taiBai() {
    try {
      const j = await api('danh_sach');
      st.bai = j.bai || [];
      st.tuyen = j.tuyen || [];
      if (st.onBadge) st.onBadge(st.bai.filter(b => b.trang_thai === TT.CHO).length);
    } catch (e) {
      st.bai = [];
      toast(`<b>Không tải được bài</b>${esc(e.message)}`, { loai: 'loi', ms: 6000 });
      if (!st.demo && (!store.get(LS.url) || !store.get(LS.key))) st.panel = 'cai_dat';
    }
    render();
  }

  function giaTri(card, name) {
    const el = card && card.querySelector(`[name="${name}"]`);
    return el ? el.value : undefined;
  }

  async function onClick(ev) {
    const btn = ev.target.closest('[data-bdb]');
    if (!btn || !st.root.contains(btn)) return;
    const act = btn.dataset.bdb;
    const card = btn.closest('.bdb-card');
    const id = card && card.dataset.id;

    if (act === 'nhom') { st.nhom = btn.dataset.nhom; render(); return; }
    if (act === 'mo_panel') { st.panel = st.panel === btn.dataset.panel ? '' : btn.dataset.panel; render(); return; }
    if (act === 'dong_panel') { st.panel = ''; render(); return; }
    if (act === 'lam_moi') { await taiBai(); return; }
    if (act === 'luu_cai_dat') {
      const f = st.root.querySelector('[data-form="cai_dat"]');
      const url = giaTri(f, 'url').trim();
      if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) {
        toast('URL phải có dạng https://script.google.com/macros/s/.../exec', { loai: 'loi', ms: 6000 });
        return;
      }
      store.set(LS.url, url);
      store.set(LS.key, giaTri(f, 'key').trim());
      st.panel = '';
      await taiBai();
      return;
    }

    let data = {};
    if (act === 'them_nguon') {
      const f = st.root.querySelector('[data-form="nguon"]');
      data = { tuyen_id: giaTri(f, 'tuyen_id'), link: giaTri(f, 'link').trim(), ghi_chu: giaTri(f, 'ghi_chu').trim() };
      if (!data.link && !data.ghi_chu) { toast('Nhập link hoặc nội dung trước đã', { loai: 'loi' }); return; }
      if (data.link && !safeUrl(data.link)) { toast('Link phải bắt đầu bằng http:// hoặc https://', { loai: 'loi' }); return; }
    } else if (act === 'tao_lai') {
      data = { tuyen_id: btn.dataset.tuyen };
    } else if (id) {
      data = { id };
      if (['duyet', 'luu', 'sua_ai'].includes(act)) {
        data.noi_dung = giaTri(card, 'noi_dung');
        data.gio_dang = giaTri(card, 'gio_dang');
        data.kieu_dang = giaTri(card, 'kieu_dang');
      }
      if (act === 'sua_ai') {
        data.ghi_chu = (giaTri(card, 'ghi_chu') || '').trim();
        if (!data.ghi_chu) { toast('Gõ yêu cầu sửa vào ô bên cạnh trước đã', { loai: 'loi' }); return; }
      }
      if (act === 'duyet' && !(data.noi_dung || '').trim()) { toast('Nội dung đang trống', { loai: 'loi' }); return; }
    }

    const vung = card || st.root.querySelector('.bdb');
    vung.classList.add('bdb-busy');
    const nhan = btn.textContent;
    btn.textContent = act === 'sua_ai' || act === 'tao_lai' ? 'AI đang viết…' : 'Đang xử lý…';
    try {
      const j = await api(act, data);
      if (j.thong_bao) toast(esc(j.thong_bao));
      if (act === 'them_nguon') st.panel = '';
      await taiBai();
    } catch (e) {
      toast(`<b>Chưa làm được</b>${esc(e.message)}`, { loai: 'loi', ms: 6000 });
      vung.classList.remove('bdb-busy');
      btn.textContent = nhan;
    }
  }

  /* ---------------- public ---------------- */
  const BanDuyetBai = {
    init(opts) {
      opts = opts || {};
      injectCss();
      st.demo = !!opts.demo;
      st.onBadge = opts.onBadge || null;
      st.onMo = opts.onMo || null;
      if (opts.apiUrl && !store.get(LS.url)) store.set(LS.url, opts.apiUrl);
      st.root = typeof opts.container === 'string' ? document.querySelector(opts.container) : opts.container;
      if (st.root) {
        st.root.addEventListener('click', onClick);
        st.root.addEventListener('change', ev => {
          if (ev.target.classList.contains('bdb-locpage')) { st.locPage = ev.target.value; render(); }
        });
        render();
        taiBai();
      }
      return BanDuyetBai;
    },

    /** Gọi khi mở app: báo có bài cần duyệt hay không. */
    async kiemTraKhiMo(opts) {
      opts = opts || {};
      if (opts.onMo) st.onMo = opts.onMo;
      if (opts.onBadge) st.onBadge = opts.onBadge;
      try {
        const t = await api('tom_tat');
        if (st.onBadge) st.onBadge(t.cho_duyet);
        if (t.loi) {
          toast(`<b>Agent gặp lỗi hôm nay</b>${t.loi} bài tạo không thành công.
            <div class="bdb-tbtn"><button class="bdb-pri" data-mo>Xem</button><button data-dong>Để sau</button></div>`,
            { loai: 'loi', tuDong: false });
        } else if (t.kiem_tra) {
          toast(`<b>Có ${t.kiem_tra} bài cần kiểm tra</b>Bài kẹt ở trạng thái Đang đăng, hãy xem trên page.
            <div class="bdb-tbtn"><button class="bdb-pri" data-mo>Xem</button><button data-dong>Để sau</button></div>`,
            { loai: 'loi', tuDong: false });
        } else if (t.cho_duyet) {
          toast(`<b>Có ${t.cho_duyet} bài cần bạn duyệt</b>Chưa duyệt trước 23h thì bài sẽ không được đăng.
            <div class="bdb-tbtn"><button class="bdb-pri" data-mo>Mở bàn duyệt</button><button data-dong>Để sau</button></div>`,
            { loai: 'can', tuDong: false });
        } else {
          toast(`<b>Không có bài cần duyệt</b>${t.cho_dang ? t.cho_dang + ' bài đã duyệt đang chờ tới giờ đăng.' : 'Agent sẽ tạo bài mới lúc 7h sáng.'}`);
        }
        document.querySelectorAll('.bdb-toast [data-mo]').forEach(b => b.addEventListener('click', () => {
          b.closest('.bdb-toast').remove();
          st.nhom = 'can';
          if (st.onMo) st.onMo();
          BanDuyetBai.mo();
        }));
        return t;
      } catch (e) {
        return null;
      }
    },

    mo() {
      if (st.root) {
        taiBai();
        st.root.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },

    lamMoi: () => taiBai(),

    /** Cập nhật số bài chờ duyệt (không hiện thông báo). */
    async capNhatSo() {
      try { const t = await api('tom_tat'); if (st.onBadge) st.onBadge(t.cho_duyet); return t; } catch (e) { return null; }
    },
  };

  /* ---------------- dữ liệu demo ---------------- */
  const anhDemo = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="420"><rect width="800" height="420" fill="#1e3a5f"/>' +
    '<rect x="40" y="40" width="720" height="340" rx="16" fill="none" stroke="#c9a961" stroke-width="2"/>' +
    '<text x="400" y="200" font-family="sans-serif" font-size="34" fill="#fff" text-anchor="middle">Ảnh từ thư mục Drive</text>' +
    '<text x="400" y="245" font-family="sans-serif" font-size="18" fill="#c9a961" text-anchor="middle">khung mẫu Canva của bạn</text></svg>');

  const Demo = {
    bai: null,
    seed() {
      const d = new Date(), ngay = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      this.bai = [
        {
          id: 'd1', ngay, page_key: 'IDC', ten_page: 'Fanpage chính', tuyen_id: 'MKT', ten_tuyen: 'Marketing', trang_thai: TT.CHO, ten_nguon: 'Nguồn demo', tieu_de_nguon: 'Bài demo: thay đổi mới của quảng cáo Reels',
          link_nguon: 'https://example.com/bai-demo-mkt', kieu_dang: 'anh', co_anh: true, anh: anhDemo, gio_dang: '11:30', so_lan_sua: 0,
          noi_dung: 'Đây là bài demo để bạn xem giao diện.\n\nKhi chạy thật, Gemini sẽ chọn 1 tin marketing nổi bật trong 48h qua và viết lại ở đây.\n\nBạn sửa trực tiếp trong ô này, hoặc gõ yêu cầu bên dưới để AI viết lại.\n\nNguồn: Nguồn demo\n#marketing #bdsmarketing',
        },
        {
          id: 'd2', ngay, page_key: 'IDC', ten_page: 'Fanpage chính', tuyen_id: 'BDS', ten_tuyen: 'Bất động sản', trang_thai: TT.CHO, ten_nguon: 'Nguồn demo', tieu_de_nguon: 'Bài demo: tin bất động sản kèm link báo',
          link_nguon: 'https://example.com/bai-demo-bds', kieu_dang: 'link', co_anh: false, gio_dang: '19:30', so_lan_sua: 0,
          noi_dung: 'Bài demo dạng kèm link báo.\n\nKhi chạy thật, đây là tin BĐS TP.HCM được viết lại theo góc nhìn người làm thị trường, cuối bài có CTA nhẹ.\n\nĐổi "Kiểu" sang "Chỉ ảnh" nếu bạn không muốn gắn link.\n\nNguồn: Nguồn demo',
        },
        {
          id: 'd3', ngay, page_key: 'IDC', ten_page: 'Fanpage chính', tuyen_id: 'MKT', ten_tuyen: 'Marketing', trang_thai: TT.DANG, ten_nguon: 'Nguồn demo', tieu_de_nguon: 'Bài demo đã đăng hôm qua',
          link_nguon: '', kieu_dang: 'anh', gio_dang: '11:30', fb_link: 'https://www.facebook.com/',
          noi_dung: 'Bài demo đã đăng. Bài đã đăng chỉ xem, không sửa.',
        },
      ];
    },
    async api(action, p) {
      if (!this.bai) this.seed();
      await new Promise(r => setTimeout(r, action === 'sua_ai' || action === 'tao_lai' ? 900 : 250));
      const b = this.bai.find(x => x.id === p.id);
      const ap = () => { if (p.noi_dung) b.noi_dung = p.noi_dung; if (p.gio_dang) b.gio_dang = p.gio_dang; if (p.kieu_dang) b.kieu_dang = p.kieu_dang; if (b.kieu_dang === 'anh') { b.co_anh = true; b.anh = anhDemo; } };
      switch (action) {
        case 'tom_tat': return { ok: true, cho_duyet: this.bai.filter(x => x.trang_thai === TT.CHO).length, loi: 0, kiem_tra: 0, cho_dang: this.bai.filter(x => x.trang_thai === TT.DUYET).length };
        case 'danh_sach': return {
          ok: true, bai: this.bai.map(x => Object.assign({}, x)),
          tuyen: [{ tuyen_id: 'MKT', ten_tuyen: 'Marketing', page_key: 'IDC', ten_page: 'Fanpage chính' },
            { tuyen_id: 'BDS', ten_tuyen: 'Bất động sản', page_key: 'IDC', ten_page: 'Fanpage chính' }],
        };
        case 'duyet': ap(); b.trang_thai = TT.DUYET; return { ok: true, thong_bao: `Đã duyệt, đăng lúc ${b.gio_dang}` };
        case 'luu': ap(); return { ok: true, thong_bao: 'Đã lưu' };
        case 'huy_duyet': b.trang_thai = TT.CHO; return { ok: true, thong_bao: 'Đã chuyển về Chờ duyệt' };
        case 'bo': b.trang_thai = TT.BO; return { ok: true, thong_bao: 'Đã bỏ bài' };
        case 'sua_ai': ap(); b.noi_dung = '[Demo – AI đã sửa theo yêu cầu: ' + p.ghi_chu + ']\n\n' + b.noi_dung; b.so_lan_sua = (b.so_lan_sua || 0) + 1; return { ok: true, thong_bao: 'AI đã viết lại' };
        case 'doi_anh': b.kieu_dang = 'anh'; b.co_anh = true; b.anh = anhDemo; return { ok: true };
        case 'them_nguon': return { ok: true, thong_bao: 'Demo: đã thêm nguồn' };
        case 'tao_lai': return { ok: true, thong_bao: 'Demo: khi chạy thật, agent sẽ tạo bài mới ở đây' };
        default: throw new Error('Lệnh không hợp lệ');
      }
    },
  };

  window.BanDuyetBai = BanDuyetBai;
})();
