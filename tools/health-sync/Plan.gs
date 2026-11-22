/* ==== DÙNG CHUNG app + Apps Script (Plan.gs): giáo án 8 tuần, báo cáo tuần, nhắc đo hàng tháng ====
   Hàm thuần, không phụ thuộc DOM. K(date) -> 'yyyy-MM-dd' theo giờ VN. */
var TPL8 = {
  1: { type: 'run', name: 'Chạy nền (Z2)', w: [30, 30, 35, 25, 35, 40, 40, 30] },
  3: { type: 'swim', name: 'Bơi kỹ thuật', w: ['10×50m, nghỉ 30″', '8×75m, nghỉ 30″', '6×100m, nghỉ 30″', '400m thả lỏng (tuần nhẹ)', '5×150m, nghỉ 30″', '4×200m, nghỉ 30″', '3×300m, nghỉ 40″', '500m thả lỏng (trước kiểm tra)'] },
  5: { type: 'run', name: 'Chạy chất lượng', w: ['8×1′ nhanh / 1′30″ chạy chậm', '6×2′ nhanh / 2′ chậm', '5×3′ vùng Z4 / 2′ chậm', 'Chạy liên tục 3 km nhẹ (tuần nhẹ)', '3×6′ tempo / 2′ chậm', '2×10′ tempo / 3′ chậm', 'Tempo 20′ liên tục', 'KIỂM TRA: chạy 5 km, ghi lại thời gian'] },
  0: { type: 'swim', name: 'Bơi dài', w: ['400m liên tục (được nghỉ ngắn)', '500m liên tục', '600m liên tục', '500m nhẹ (tuần nhẹ)', '800m liên tục', '1.000m liên tục', '1.200m liên tục', 'KIỂM TRA: bơi liền 1.500m'] }
};
function planMonday(d) { var x = new Date(d.getTime()); var g = x.getDay(); x.setDate(x.getDate() - ((g + 6) % 7)); x.setHours(12, 0, 0, 0); return x; }
function planInfo(H, d, K) {
  var p = H && H.tplan; if (!p || !p.start) return null;
  var st = new Date(p.start + 'T12:00:00'), day = new Date(K(d) + 'T12:00:00');
  var wk = Math.floor(Math.round((day - st) / 864e5) / 7); if (wk < 0 || wk > 7) return { over: wk > 7, wk: wk };
  var t = TPL8[day.getDay()]; if (!t) return { wk: wk, rest: true };
  var v = t.w[wk];
  return { wk: wk, type: t.type, name: t.name, base: typeof v === 'number' ? v + '′' : v, mins: typeof v === 'number' ? v : null, key: t.type === 'run' && day.getDay() === 5 ? 'q' : t.type === 'swim' && day.getDay() === 0 ? 'long' : 'easy' };
}
function exIs(e, type) { var s = String((e && e.t) || '').toLowerCase(); return type === 'run' ? /run|chạy|treadmill/.test(s) : /swim|bơi/.test(s); }
function planDone(H, d, K) { var i = planInfo(H, d, K); if (!i || !i.type) return null; var dd = H.days[K(d)] || {}; return (dd.ex || []).some(function (e) { return exIs(e, i.type) && (e.min || 0) >= 10; }) || !!(H.tplan.manual || {})[K(d)]; }
/* điều chỉnh buổi theo mức hồi phục level 0..3 (0 nghỉ, 1 nhẹ, 2 vừa, 3 sung) */
function planSession(H, d, K, level, z) {
  var i = planInfo(H, d, K); if (!i || i.over || i.wk < 0) return null;
  var tag = 'Tuần ' + (i.wk + 1) + '/8 · ';
  if (i.rest) return { title: tag + 'Ngày nghỉ theo giáo án', body: level >= 2 ? 'Đi bộ 20–30′ hoặc giãn cơ/core 15′. Để dành sức cho buổi kế tiếp.' : 'Nghỉ hẳn, giãn cơ nhẹ và ngủ sớm.', plan: true, type: null };
  var body;
  if (i.type === 'run') {
    body = i.key === 'q' ? i.base + '. Khởi động 10′ chạy chậm, thả lỏng 5–10′.' : 'Chạy đều ' + i.base + ' ở ' + z.z2 + ' bpm (vẫn nói chuyện được).';
  } else body = i.base + '. Khởi động 200m bơi chậm, cuối buổi 100m thả lỏng.';
  var title = tag + i.name;
  if (level === 0) { title = tag + 'Hoãn ' + i.name.toLowerCase(); body = 'Cơ thể đang căng: nghỉ hôm nay, buổi này dời sang ngày nghỉ gần nhất.'; }
  else if (level === 1) {
    if (i.key === 'q') { title = tag + 'Đổi thành chạy nhẹ'; body = 'Hồi phục chưa đủ cho buổi chất lượng: chạy nhẹ 20–25′ ở ' + z.z1 + ' bpm. Buổi chính dời sang hôm sau.'; }
    else if (i.key === 'long') { title = tag + 'Bơi nhẹ'; body = 'Bơi thả lỏng 20–25′, bỏ mục tiêu cự ly hôm nay.'; }
    else if (i.mins) body = 'Rút ngắn còn ' + Math.round(i.mins * .7) + '′ chạy chậm ở ' + z.z1 + ' bpm.';
  } else if (level === 2 && i.key === 'q') body += ' Hôm nay hồi phục vừa: bớt 1 hiệp nếu thấy nặng.';
  return { title: title, body: body, plan: true, type: i.type, wk: i.wk };
}
/* báo cáo tuần (7 ngày tính đến d) */
function weekReport(H, d, K) {
  var day = function (i) { var x = new Date(d.getTime() - i * 864e5); return { x: x, d: H.days[K(x)] || {} }; };
  var cur = [], prev = []; for (var i = 0; i < 7; i++) { cur.push(day(i)); prev.push(day(i + 7)); }
  var avg = function (a, k) { var v = a.map(function (o) { return o.d[k]; }).filter(function (x) { return typeof x === 'number'; }); return v.length ? v.reduce(function (s, x) { return s + x; }, 0) / v.length : null; };
  var sum = function (a, k) { return a.reduce(function (s, o) { return s + (o.d[k] || 0); }, 0); };
  var goal = (H.cfg && H.cfg.goalSleep) || 480;
  var sl = avg(cur, 'sleepMin'), slP = avg(prev, 'sleepMin'), short = cur.filter(function (o) { return o.d.sleepMin && o.d.sleepMin < 420; }).length;
  var beds = cur.map(function (o) { if (!o.d.bed) return null; var p = o.d.bed.split(':'); var m = +p[0] * 60 + +p[1]; if (m < 720) m += 1440; return m; }).filter(function (x) { return x != null; });
  var bAvg = beds.length ? beds.reduce(function (s, x) { return s + x; }, 0) / beds.length : null, bSd = beds.length > 2 ? Math.sqrt(beds.reduce(function (s, x) { return s + (x - bAvg) * (x - bAvg); }, 0) / beds.length) : null;
  var hrv = avg(cur, 'hrv'), hrvP = avg(prev, 'hrv'), rhr = avg(cur, 'rhr'), rhrP = avg(prev, 'rhr'), azm = sum(cur, 'azm'), steps = avg(cur, 'steps');
  var runs = [], swims = []; cur.forEach(function (o) { (o.d.ex || []).forEach(function (e) { if (exIs(e, 'run')) runs.push(e); else if (exIs(e, 'swim')) swims.push(e); }); });
  var km = runs.reduce(function (s, e) { return s + (e.km || 0); }, 0), sMin = swims.reduce(function (s, e) { return s + (e.min || 0); }, 0);
  var planned = 0, done = 0; cur.forEach(function (o) { var i = planInfo(H, o.x, K); if (i && i.type) { planned++; if (planDone(H, o.x, K)) done++; } });
  var hm = function (m) { m = Math.round(m); return Math.floor(m / 60) + 'h' + ('0' + (m % 60)).slice(-2); };
  var clock = function (m) { m = ((Math.round(m) % 1440) + 1440) % 1440; return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); };
  var pct = function (a, b) { return a != null && b ? Math.round((a - b) / b * 100) : null; };
  var lines = [];
  if (sl) lines.push('Ngủ TB ' + hm(sl) + (slP ? ' (' + (sl >= slP ? '+' : '') + Math.round(sl - slP) + '′ so với tuần trước)' : '') + (short ? ', ' + short + ' đêm dưới 7h' : ''));
  if (bSd != null) lines.push('Giờ lên giường TB ' + clock(bAvg) + ', lệch ±' + Math.round(bSd) + '′');
  if (hrv) lines.push('HRV TB ' + Math.round(hrv) + ' ms' + (pct(hrv, hrvP) != null ? ' (' + (pct(hrv, hrvP) >= 0 ? '+' : '') + pct(hrv, hrvP) + '%)' : '') + (rhr ? ', nhịp nghỉ ' + Math.round(rhr) + (rhrP ? ' (' + (rhr - rhrP >= 0 ? '+' : '') + Math.round(rhr - rhrP) + ')' : '') : ''));
  lines.push(azm + '/150 phút vận động' + (steps ? ', TB ' + Math.round(steps).toLocaleString('vi-VN') + ' bước/ngày' : ''));
  lines.push('Chạy ' + runs.length + ' buổi' + (km ? ' · ' + km.toFixed(1) + ' km' : '') + ' · bơi ' + swims.length + ' buổi' + (sMin ? ' · ' + sMin + '′' : '') + (planned ? ' · giáo án ' + done + '/' + planned : ''));
  var g;
  if (sl && sl < goal - 30) g = 'Ngủ đủ: lên giường trước ' + (bAvg ? clock(Math.min(bAvg - 30, 24 * 60 + 30)) : '00:00') + ' ít nhất 5/7 đêm';
  else if (bSd != null && bSd > 45) g = 'Ngủ đều giờ: giữ giờ lên giường lệch dưới ±30′';
  else if (planned && done < planned - 1) g = 'Hoàn thành đủ ' + Math.min(4, planned) + ' buổi giáo án tuần này';
  else if (hrv && hrvP && hrv < hrvP * .9) g = 'Tuần hồi phục: giữ buổi chạy/bơi nhẹ, ngủ sớm 30′';
  else if (azm < 150) g = 'Đạt 150 phút vận động (thêm 1 buổi đi bộ nhanh 30′)';
  else g = 'Giữ nhịp hiện tại, làm tốt buổi chất lượng thứ 6';
  var score = (sl ? Math.min(1, sl / goal) * 30 : 15) + (bSd != null ? Math.max(0, 1 - Math.max(0, bSd - 30) / 60) * 15 : 8) + Math.min(1, azm / 150) * 25 + (planned ? done / planned * 20 : 10) + (hrv && hrvP ? (hrv >= hrvP * .95 ? 10 : 5) : 6);
  score = Math.round(Math.min(100, score));
  return { at: Date.now(), end: K(d), score: score, title: score >= 80 ? 'Tuần rất tốt' : score >= 65 ? 'Tuần ổn' : score >= 50 ? 'Tuần trung bình' : 'Tuần cần hồi phục', lines: lines, goal: g };
}
/* nhắc đo cân & vòng eo: ngày 1 hằng tháng hoặc đã quá 30 ngày */
function measDue(H, d, K) {
  var m = (H && H.meas) || []; if (!m.length) return true;
  var last = m[m.length - 1].d, ld = new Date(last + 'T12:00:00'), td = new Date(K(d) + 'T12:00:00');
  if (K(d) === last) return false;
  return (td - ld) / 864e5 >= 30 || (td.getDate() === 1 && last.slice(0, 7) !== K(d).slice(0, 7));
}
