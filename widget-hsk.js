// HSK · Từ mới trên màn hình khoá (Scriptable)
// Tham số widget:  <sách>,<phút>,<vị trí>
//   hsk3,30        → HSK3, đổi từ mỗi 30 phút
//   hsk2:1-8,60    → HSK2 bài 1–8, đổi mỗi 60 phút
//   all,15,2       → cả hai sách, 15 phút, widget thứ 2 (để 2 widget cạnh nhau không trùng từ)
const DATA = "https://minhtuanng28.github.io/hsk2/words.json";

const P = (args.widgetParameter || "all,30").toLowerCase().replace(/\s/g, "").split(",");
let book = "all", lo = 1, hi = 99;
const m = (P[0] || "").match(/^(hsk1|hsk2|hsk3|all)(?::(\d+)(?:-(\d+))?)?$/);
if (m) { book = m[1]; if (m[2]) { lo = +m[2]; hi = +(m[3] || m[2]); } }
const mins = Math.max(5, parseInt(P[1]) || 30);
const pos = Math.max(1, parseInt(P[2]) || 1);

const fm = FileManager.local();
const file = fm.joinPath(fm.documentsDirectory(), "hsk-words.json");
async function load() {
  const age = fm.fileExists(file) ? Date.now() - fm.modificationDate(file).getTime() : Infinity;
  if (age > 12 * 3600e3) {
    try { const r = new Request(DATA); r.timeoutInterval = 8; const s = await r.loadString(); JSON.parse(s).w.length; fm.writeString(file, s); } catch (e) {}
  }
  try { return JSON.parse(fm.readString(file)); } catch (e) { return null; }
}
function rnd(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const data = await load();
const wg = new ListWidget();
const slot = Math.floor(Date.now() / (mins * 60e3));
wg.refreshAfterDate = new Date((slot + 1) * mins * 60e3);
let w = null;
if (data) {
  const list = data.w.filter(x => (book === "all" || x[4] === book) && x[5] >= lo && x[5] <= hi);
  if (list.length) {
    const n = list.length, cyc = Math.floor(slot / n), r = rnd(cyc * 31 + 7), o = list.slice();
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
    w = o[(slot % n + (pos - 1) * Math.ceil(n / 3)) % n];
  }
}
const fam = config.widgetFamily;
if (!w) {
  wg.addText(data ? "Không có từ trong phạm vi này" : "Bật mạng để tải từ HSK").font = Font.systemFont(12);
} else {
  const [h, p, vi, en, bk, L] = w;
  if (fam === "accessoryInline") {
    wg.addText(`${h} ${p} · ${vi}`);
  } else if (fam === "accessoryCircular") {
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
}
if (config.runsInWidget) Script.setWidget(wg);
else if (fam === "accessoryInline") await wg.presentAccessoryInline();
else await wg.presentAccessoryRectangular();
Script.complete();
