// HSK · Từ mới trên iPhone (Scriptable) — dùng cho cả màn hình khoá và màn hình chính
// Tham số widget:  <sách>,<phút>,<vị trí>
//   hsk3,30        → HSK3, đổi từ mỗi 30 phút
//   hsk2:1-8,60    → HSK2 bài 1–8, đổi mỗi 60 phút
//   all,15,2       → cả ba sách, 15 phút, widget thứ 2 (để 2 widget cạnh nhau không trùng từ)
const BASE = "https://minhtuanng28.github.io/hsk2/";
const DATA = BASE + "words.json";

const P = (args.widgetParameter || "all,30").toLowerCase().replace(/\s/g, "").split(",");
let book = "all", lo = 1, hi = 99;
const m = (P[0] || "").match(/^(hsk1|hsk2|hsk3|all)(?::(\d+)(?:-(\d+))?)?$/);
if (m) { book = m[1]; if (m[2]) { lo = +m[2]; hi = +(m[3] || m[2]); } }
const mins = Math.max(5, parseInt(P[1]) || 30);
const pos = Math.max(1, parseInt(P[2]) || 1);

const fm = FileManager.local();
const dir = fm.documentsDirectory();
const file = fm.joinPath(dir, "hsk-words.json");
async function load() {
  const age = fm.fileExists(file) ? Date.now() - fm.modificationDate(file).getTime() : Infinity;
  if (age > 12 * 3600e3) {
    try { const r = new Request(DATA); r.timeoutInterval = 8; const s = await r.loadString(); if (JSON.parse(s).w.length) fm.writeString(file, s); } catch (e) {}
  }
  try { return JSON.parse(fm.readString(file)); } catch (e) { return null; }
}
async function capy(pose) {
  const f = fm.joinPath(dir, "hsk-capy-" + pose + ".png");
  if (fm.fileExists(f)) return fm.readImage(f);
  try { const r = new Request(BASE + "capy-" + pose + ".png"); r.timeoutInterval = 8; const img = await r.loadImage(); fm.writeImage(f, img); return img; } catch (e) { return null; }
}
function rnd(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const data = await load();
const fam = config.widgetFamily || "medium";
const slot = Math.floor(Date.now() / (mins * 60e3));
let list = [], order = [], k = 0;
if (data) {
  list = data.w.filter(x => (book === "all" || x[4] === book) && x[5] >= lo && x[5] <= hi);
  const n = list.length;
  if (n) {
    const r = rnd(Math.floor(slot / n) * 31 + 7); order = list.slice();
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    k = (slot % n + (pos - 1) * Math.ceil(n / 3)) % n;
  }
}
const w = order.length ? order[k] : null;

// màu
const dyn = (a, b) => Color.dynamic(new Color(a), new Color(b));
const BG = dyn("#FFF7EA", "#2A231E"), CARD = dyn("#FFFFFF", "#3A312A"), INK = dyn("#2B2118", "#F5ECE2"), MUTED = dyn("#8C7B6B", "#B9A898");
const ACC = dyn("#E8743B", "#FFA36B"), PRI = dyn("#5B4BC4", "#A9A0FF"), LINE = dyn("#EFE3D2", "#4A4038");
const TONE = { "1": dyn("#E5533D", "#FF7A66"), "2": dyn("#E8A317", "#FFC24D"), "3": dyn("#2E9D57", "#5DD68A"), "4": dyn("#3A6FD8", "#7FA7FF"), "5": dyn("#8C8C8C", "#B0B0B0") };
const BOOKN = { hsk1: "HSK 1", hsk2: "HSK 2", hsk3: "HSK 3" };

function hanzi(stack, x, size) { // tô màu từng chữ theo thanh điệu
  const row = stack.addStack(); row.layoutHorizontally(); row.bottomAlignContent();
  const chars = [...x[0]]; let ti = 0;
  for (const c of chars) {
    const t = row.addText(c); t.font = Font.boldSystemFont(size); t.minimumScaleFactor = 0.5; t.lineLimit = 1;
    if (/[一-鿿]/.test(c)) { t.textColor = TONE[(x[7] || "")[ti] || "5"] || INK; ti++; } else t.textColor = INK;
  }
  return row;
}
function txt(stack, s, font, color, lines) { const t = stack.addText(s); t.font = font; t.textColor = color; t.lineLimit = lines || 1; t.minimumScaleFactor = 0.7; return t; }

const wg = new ListWidget();
wg.refreshAfterDate = new Date((slot + 1) * mins * 60e3);

if (!w) {
  wg.addText(data ? "Không có từ trong phạm vi này" : "Bật mạng để tải từ HSK").font = Font.systemFont(12);
} else if (fam.startsWith("accessory")) {
  // ---- màn hình khoá (đơn sắc) ----
  const [h, p, vi, en] = w;
  if (fam === "accessoryInline") wg.addText(`${h} ${p} · ${vi}`);
  else if (fam === "accessoryCircular") {
    wg.addAccessoryWidgetBackground = true;
    const t = wg.addText(h); t.font = Font.boldSystemFont(h.length > 2 ? 15 : 22); t.minimumScaleFactor = 0.5; t.centerAlignText();
    const q = wg.addText(p); q.font = Font.systemFont(9); q.minimumScaleFactor = 0.6; q.centerAlignText();
  } else {
    const row = wg.addStack(); row.bottomAlignContent();
    const a = row.addText(h); a.font = Font.boldSystemFont(16); a.lineLimit = 1;
    row.addSpacer(5);
    const b = row.addText(p); b.font = Font.systemFont(12); b.textOpacity = 0.85; b.lineLimit = 1; b.minimumScaleFactor = 0.7;
    const c = wg.addText(vi); c.font = Font.systemFont(12); c.lineLimit = 1; c.minimumScaleFactor = 0.75;
    const d = wg.addText(en); d.font = Font.italicSystemFont(11.5); d.textOpacity = 0.8; d.lineLimit = 1; d.minimumScaleFactor = 0.75;
  }
} else {
  // ---- màn hình chính ----
  const [h, p, vi, en, bk, L, id, tones, ex, exp, exv] = w;
  const hr = new Date().getHours();
  const POSES = ["happy", "orange", "book", "tea", "cheer", "love", "think", "music", "wow"];
  const pose = (hr >= 22 || hr < 6) ? "sleep" : POSES[slot % POSES.length];
  const img = await capy(pose);
  wg.backgroundColor = BG; wg.url = BASE + "#tu-" + encodeURIComponent(id);
  const small = fam === "small", large = fam === "large" || fam === "extraLarge";
  wg.setPadding(small ? 12 : 14, small ? 13 : 16, small ? 12 : 14, small ? 13 : 16);

  // hàng trên: sách · bài  …  #số thứ tự
  const top = wg.addStack(); top.centerAlignContent();
  txt(top, `${BOOKN[bk]} · ${small ? "B" : "Bài "}${L}`, Font.boldSystemFont(small ? 11 : 12), PRI);
  top.addSpacer();
  txt(top, "#" + (list.indexOf(w) + 1), Font.boldSystemFont(small ? 12 : 13), ACC);
  wg.addSpacer(small ? 4 : 6);

  // chữ + capybara
  const mid = wg.addStack(); mid.centerAlignContent();
  const col = mid.addStack(); col.layoutVertically();
  const hs = small ? (h.length > 3 ? 24 : h.length > 2 ? 28 : 34) : (h.length > 3 ? 32 : 42);
  hanzi(col, w, hs);
  txt(col, p, Font.mediumSystemFont(small ? 12 : 14), MUTED);
  mid.addSpacer();
  if (img) { const im = mid.addImage(img); const s = small ? 52 : large ? 84 : 76; im.imageSize = new Size(s, s); }

  wg.addSpacer(small ? 6 : 8);
  // nghĩa
  const box = wg.addStack(); box.layoutVertically(); box.backgroundColor = CARD; box.cornerRadius = 12; box.setPadding(7, 10, 7, 10);
  const r1 = box.addStack(); r1.centerAlignContent();
  txt(r1, vi, Font.semiboldSystemFont(small ? 13 : 15), INK);
  r1.addSpacer();
  if (!small) txt(box, en, Font.italicSystemFont(12.5), MUTED);
  else txt(box, en, Font.italicSystemFont(10.5), MUTED);

  if (large && ex) {
    wg.addSpacer(8);
    const exs = wg.addStack(); exs.layoutVertically();
    txt(exs, ex, Font.mediumSystemFont(large ? 15 : 13), INK, large ? 2 : 1);
    if (large && exp) txt(exs, exp, Font.systemFont(11), MUTED, 2);
    txt(exs, exv, Font.systemFont(large ? 12 : 11), MUTED, large ? 2 : 1);
  }
  if (large && order.length > 3) {
    wg.addSpacer(10);
    txt(wg, "TIẾP THEO", Font.boldSystemFont(10.5), MUTED);
    wg.addSpacer(4);
    for (let i = 1; i <= 3; i++) {
      const x = order[(k + i) % order.length];
      const row = wg.addStack(); row.centerAlignContent(); row.url = BASE + "#tu-" + encodeURIComponent(x[6]);
      hanzi(row, x, 17); row.addSpacer(8);
      txt(row, x[1], Font.systemFont(12), MUTED); row.addSpacer(8);
      txt(row, x[2], Font.systemFont(12.5), INK); row.addSpacer();
      if (i < 3) wg.addSpacer(5);
    }
  }
  wg.addSpacer();
}

if (config.runsInWidget) Script.setWidget(wg);
else if (fam === "accessoryInline") await wg.presentAccessoryInline();
else if (fam.startsWith("accessory")) await wg.presentAccessoryRectangular();
else await wg.presentMedium();
Script.complete();
