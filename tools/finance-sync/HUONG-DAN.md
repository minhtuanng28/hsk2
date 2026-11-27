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
2. Bấm bánh răng **Cài đặt** → dán URL và APP_KEY → **Lưu và cập nhật**.
3. Kết nối được lưu vào tài khoản Google của bạn (Firebase), nên Học viện và máy khác đăng nhập cùng tài khoản sẽ tự có.
   Muốn điền nhanh trên điện thoại: Cài đặt → **Copy link cài nhanh cho máy khác**.

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

## Sửa lỗi nhanh

| Lỗi | Cách xử lý |
|---|---|
| `Sai mã kết nối` | Dán lại APP_KEY (chạy `caiDat` để xem lại). Lộ mã thì chạy `doiMa` rồi dán mã mới. |
| `Không thấy dòng "…"` | Hạng mục đã đổi tên trong sheet. Bấm Cập nhật để app lấy danh sách mới. |
| `Ô … đang chứa chữ` | Ô tháng đó đang ghi chữ (vd "1 chỉ vàng"). Sửa ô thành số rồi ghi lại. |
| Sửa code xong app vẫn chạy bản cũ | **Triển khai → Quản lý triển khai → sửa → Phiên bản mới**. URL giữ nguyên. |
