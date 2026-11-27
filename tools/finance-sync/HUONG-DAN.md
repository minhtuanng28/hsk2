# Ngân hàng Mintun: kết nối Google Sheet (5 phút, làm 1 lần)

App đọc trực tiếp sheet **Income & expenditure of mintun** qua một Apps Script gắn vào chính sheet đó.
Số tiền không nằm trên GitHub. Chỉ ai có **link web app + mã APP_KEY** mới đọc/ghi được.

```
tools/finance-sync/Code.gs          ← dán vào Apps Script của sheet
tools/finance-sync/appsscript.json  ← múi giờ + quyền + cấu hình web app
finance/                            ← app chi tiết (minhtuanng28.github.io/hsk2/finance/)
academy/                            ← toà "Ngân hàng Mintun" trong Học viện
```

## Bước 1: Dán code vào sheet

1. Mở sheet thu chi, chọn **Tiện ích mở rộng → Apps Script**.
2. Xoá code mặc định trong `Code.gs`, dán toàn bộ `Code.gs` ở thư mục này vào.
3. Bấm biểu tượng bánh răng **Cài đặt dự án**, tick **Hiện tệp kê khai "appsscript.json"**. Quay lại trình soạn thảo, mở `appsscript.json`, dán đè nội dung file `appsscript.json` ở thư mục này.
4. Bấm **Lưu**.

## Bước 2: Tạo mã kết nối

1. Ở thanh trên, chọn hàm `caiDat` rồi bấm **Chạy**.
2. Lần đầu Google hỏi quyền: chọn tài khoản → **Nâng cao** → **Đi tới (không an toàn)** → **Cho phép**. (Script của chính bạn nên Google cảnh báo "chưa xác minh".)
3. Mở **Nhật ký thực thi**, copy dòng `APP_KEY (dán vào app …): xxxxxxxx`.
4. Tab mới **App · Giao dịch** xuất hiện trong sheet. Đây là nhật ký các khoản bạn ghi từ app (có ngày giờ). Đừng xoá tab này.

Muốn kiểm tra: chạy hàm `thuDoc`. Nhật ký sẽ báo số dòng, số ghi chú, số comment đọc được.

## Bước 3: Triển khai web app

1. Bấm **Triển khai → Triển khai mới**, loại **Ứng dụng web**.
2. **Thực thi với tư cách:** Tôi. **Người có quyền truy cập:** Bất kỳ ai. (Vẫn an toàn vì mọi yêu cầu phải có APP_KEY.)
3. Bấm **Triển khai**, copy **URL ứng dụng web** (dạng `https://script.google.com/macros/s/…/exec`).

## Bước 4: Dán vào app

1. Mở **minhtuanng28.github.io/hsk2/finance/**, đăng nhập Google (cùng tài khoản Học viện).
2. Lần đầu app yêu cầu **tạo mật khẩu 6 số** (nhập 2 lần). Mật khẩu này do bạn tự đặt, không ai khác biết, kể cả Claude.
3. Bấm bánh răng **Cài đặt** → dán URL và APP_KEY → **Lưu và cập nhật**.
4. Máy khác (điện thoại, iPad) chỉ cần đăng nhập cùng tài khoản Google rồi nhập mật khẩu 6 số là có đủ kết nối, mục tiêu.

## Mật khẩu 6 số

- Link Apps Script, APP_KEY, mục tiêu, bản sao sổ thu chi đều được **mã hoá (AES-256)** bằng khoá suy ra từ mật khẩu trước khi lưu vào máy và Firebase.
  Không có mật khẩu thì người mở được máy hay tài khoản cũng không đọc được số liệu.
- App và toà Ngân hàng Mintun trong Học viện đều hỏi mật khẩu. App **tự khoá** khi rời app quá 3 phút hoặc 10 phút không thao tác;
  Học viện tự khoá khi chuyển tab hoặc đóng bảng quá 3 phút. Nút ổ khoá trên đầu app để khoá ngay.
- Nhập sai 5 lần phải chờ 30 giây, sai tiếp thì thời gian chờ tăng gấp đôi (tối đa 15 phút).
- **Đổi mật khẩu:** Cài đặt → Đổi mật khẩu. Máy khác dùng mật khẩu mới ngay.
- **Quên mật khẩu:** bấm "Quên?" ở màn hình khoá. Link kết nối và mục tiêu bị xoá để đặt mật khẩu mới (sheet thu chi không ảnh hưởng);
  dán lại link + APP_KEY (chạy `caiDat` để xem lại mã) và tạo lại mục tiêu.
- Lưu ý: 6 số là khoá chống người khác xem trộm trên máy/tài khoản của bạn. Đừng dùng lại mật khẩu ngân hàng thật.

## Dùng hằng ngày

- **Ghi trong sheet như cũ**, xong bấm **Cập nhật** trong app (hoặc trong toà Ngân hàng Mintun ở Học viện).
  Ngày **1 và 16** hằng tháng nút Cập nhật có **dấu đỏ** nhắc chốt sổ, Bắp cũng nhắc trong Học viện.
- **Ghi từ app** (nút + giữa thanh dưới): chọn tiền ra/tiền vào, số tiền (gõ `85k`, `1,5tr`, `2tr5`), hạng mục, ngày giờ, ghi chú.
  App cộng thẳng vào ô tháng đó trên sheet (ô có số `x` sẽ thành công thức `=x+85000` nên vẫn xem được từng khoản),
  thêm ghi chú vào ô (`27/11 14:30 · +85.000 · trà sữa (app)`) và ghi 1 dòng vào tab **App · Giao dịch**.
- Sang tháng mới chưa có cột, app tự tạo cột tháng mới bên phải (chép định dạng và công thức Tổng của tháng trước).
- Xoá một khoản ghi từ app (dấu ✕ trong Sổ ghi) sẽ trừ lại đúng ô đó trên sheet.
- Mất mạng lúc ghi: app giữ lại và tự gửi khi có mạng.

## Bắp phân tích gì

- Thu, chi cố định, chi linh hoạt, tích lũy (sổ tiết kiệm, chứng khoán, vàng, đầu tư, gửi gia đình không tính là tiêu xài).
  Sai nhóm thì sửa trong Cài đặt → Nhóm hạng mục.
- Dòng tiền vào từ nguồn nào → đi vào nhóm nào → hạng mục nào, theo tháng/3T/6T/12T/năm/tất cả.
- Hạng mục tăng vọt so với trung bình 12 tháng, tháng thâm hụt, tỉ lệ tích lũy, độ phụ thuộc thu nhập phụ, biến động thu nhập, so với cùng kỳ năm trước.
- Mục tiêu ngắn hạn và dài hạn: tự cộng từ hạng mục tích lũy trên sheet hoặc tự nhập số, tính cần để dành bao nhiêu mỗi tháng.
- Mỗi ngày Bắp chọn một lời khuyên. Cảnh báo quan trọng được ưu tiên.

## Bản 2: dashboard, sức khoẻ tài chính, đầu tư, Bắp AI

**Ô A1 của tab thu chi:** gõ mốc cập nhật, ví dụ `Update gần nhất: 11h15 AM 27/11/2026`. App hiện dòng này ở đầu dashboard. Tháng đang điền dở vẫn xem được.

**Bắp AI (Gemini), làm 1 lần:**
1. Lấy API key ở **aistudio.google.com → Get API key** (dùng chung key với app Sức khoẻ cũng được).
2. Trong Apps Script **Ngan hang Mintun**: bánh răng **Cài đặt dự án → Thuộc tính tập lệnh → Thêm thuộc tính**, tên `GEMINI_KEY`, giá trị là key. Lưu.
3. Không cần triển khai lại. Bấm **Cập nhật** trong app là Bắp phân tích. App chỉ gửi số tổng hợp theo tháng, điểm sức khoẻ và danh mục, không gửi ghi chú.
4. Thử nhanh: chọn hàm `thuAI` rồi Chạy, xem Nhật ký thực thi.

**Giá chứng khoán:** cổ phiếu/ETF lấy giá đóng cửa từ VNDirect (dự phòng TCBS), quỹ mở lấy NAV từ Fmarket. Chạy `thuGia` để kiểm tra. Mã nào không lấy được giá thì nhập "giá tự nhập" trong app.

**Khi sửa Code.gs:** Triển khai → Quản lý triển khai → bút chì → Phiên bản: Phiên bản mới → Triển khai. Link web app giữ nguyên.

**Chạy mãi không cần Claude:** app nằm trên GitHub Pages, dữ liệu ở Google Sheet + Firebase, AI dùng key Gemini của bạn. Không phụ thuộc gói Claude.

## Sửa lỗi nhanh

| Lỗi | Cách xử lý |
|---|---|
| `Sai mã kết nối` | Dán lại APP_KEY (chạy `caiDat` để xem lại). Lộ mã thì chạy `doiMa` rồi dán mã mới. |
| `Không thấy dòng "…"` | Hạng mục đã đổi tên trong sheet. Bấm Cập nhật để app lấy danh sách mới. |
| `Ô … đang chứa chữ` | Ô tháng đó đang ghi chữ (vd "1 chỉ vàng"). Sửa ô thành số rồi ghi lại. |
| Sửa code xong app vẫn chạy bản cũ | **Triển khai → Quản lý triển khai → sửa → Phiên bản mới**. URL giữ nguyên. |
