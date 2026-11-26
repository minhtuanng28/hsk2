# Agent đăng bài fanpage v2: hướng dẫn cài đặt

Agent tự tạo bài theo từng **tuyến bài**. Mỗi tuyến có giờ tạo, giờ đăng, nguồn tin, thư mục ảnh và hướng dẫn viết riêng.
Gemini chọn tin nổi bật trong 48h qua rồi viết lại. Bài được đẩy về **Bàn duyệt bài** trong phòng MKT của Học viện.
Chỉ bài bạn đã duyệt mới được đăng, đúng giờ hẹn. Bài nào quá 23h chưa duyệt thì không đăng.

Lúc mới cài có sẵn: page `IDC` (ID `227814593759577`) với 2 tuyến `MKT` và `BDS`.
Thêm page hay tuyến mới chỉ cần thêm dòng trong Google Sheet, không phải sửa code.

```
apps-script/Code.gs          ← backend
apps-script/appsscript.json  ← múi giờ + cấu hình web app
hoc-vien/ban-duyet-bai.js    ← Bàn duyệt bài, gắn vào phòng MKT
hoc-vien/demo.html           ← xem thử giao diện
```

---

## Bước 1: Lấy API key Gemini

1. Vào **aistudio.google.com**, chọn **Get API key**, rồi **Create API key**.
2. Nên làm thêm: kích hoạt credit $10/tháng của gói Google AI Pro, rồi liên kết billing trong AI Studio. Khi dùng gói trả phí, dữ liệu gửi lên không bị Google dùng để huấn luyện.
   - Nếu tài khoản thanh toán là loại trả trước, bạn phải nạp tiền trả trước một khoản nhỏ thì credit mới dùng được.
3. Code dùng `gemini-3.8-flash`, tự chuyển sang `3.7-flash` → `3.5-flash` → `3.5-flash-lite` khi model đang dùng quá tải (lỗi 503). Muốn đổi danh sách model thì sửa `CFG.MODEL` và `CFG.MODEL_DU_PHONG` trong Code.gs.

## Bước 2: Token Facebook bằng System User (khuyên dùng)

Tại sao nên dùng System User:
- Token không gắn với tài khoản Facebook cá nhân của bạn. Đổi mật khẩu hay bị đăng xuất cũng không làm hỏng token.
- Có thể đặt token không bao giờ hết hạn.
- Một token dùng được cho nhiều page. Sau này mở rộng thêm page không phải tạo token mới.

Các bước:

1. Tạo Meta App (nếu chưa có):
   - Vào **developers.facebook.com**, chọn **Create App**, loại **Business**.
   - Gắn app vào Business Portfolio đang quản lý page (ID `4591959437551209`).
2. Tạo System User:
   - Vào **business.facebook.com/settings**, chọn **Người dùng** → **Người dùng hệ thống** → **Thêm**.
   - Đặt tên, ví dụ `agent-dang-bai`. Chọn vai trò **Nhân viên**, không cần Admin.
3. Cấp quyền page cho System User:
   - Chọn System User vừa tạo, bấm **Thêm tài sản**, chọn **Trang**, chọn page `227814593759577`.
   - Chỉ bật quyền **Nội dung** (tạo/quản lý bài viết). Không cấp toàn quyền.
4. Thêm app vào System User:
   - Trong mục **Ứng dụng** của Business Settings, gán app cho System User.
5. Tạo token:
   - Chọn System User, bấm **Tạo mã truy cập**, chọn app.
   - Hạn dùng: **Không bao giờ**.
   - Tick 3 quyền: `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`.
6. Copy token. Token chỉ hiện **một lần**, và chỉ được dán vào Script Properties ở bước 4.

> Không có System User? Vẫn dùng được Page Access Token riêng (cách cũ qua Graph API Explorer). Lưu vào Script Property `FB_TOKEN_IDC`. Code sẽ ưu tiên token riêng nếu có.

## Bước 3: Thư mục ảnh trên Drive

1. Tạo mỗi tuyến 1 thư mục, ví dụ `Ảnh – MKT` và `Ảnh – BĐS`.
2. Bỏ vào 10–20 ảnh nền xuất từ Canva Pro.
3. Copy ID thư mục trên thanh địa chỉ (phần sau `/folders/`). Ảnh không cần để công khai.

## Bước 4: Cài Apps Script (dùng script **độc lập**, không gắn vào Sheet)

> Vì sao phải dùng script độc lập: nếu script gắn vào Sheet, ai được quyền sửa Sheet cũng mở được script và đọc được token.
> Script độc lập thì bạn chia sẻ Sheet cho team xem hay sửa thoải mái, token vẫn chỉ mình bạn thấy.

1. Tạo Google Sheet mới tên `Agent đăng bài`. Copy ID của Sheet (phần giữa `/d/` và `/edit`).
2. Vào **script.google.com**, chọn **New project**, đặt tên `Agent đăng bài`.
   - Dán `Code.gs` vào file code.
   - Vào ⚙ **Project Settings**, tick **Show "appsscript.json"**, rồi dán nội dung `appsscript.json` vào file đó.
3. Vào ⚙ **Project Settings → Script properties**, thêm:

   | Property | Giá trị |
   |---|---|
   | `SHEET_ID` | ID Sheet ở bước 4.1 |
   | `GEMINI_API_KEY` | key ở bước 1 |
   | `FB_SYSTEM_USER_TOKEN` | token ở bước 2 |

4. Chạy hàm `setup`, cấp quyền khi Google hỏi. Hàm này sẽ:
   - Tạo 6 sheet: `Bai_dang`, `Page`, `Tuyen_bai`, `Nguon_RSS`, `Nguon_tay`, `Log`.
   - Tạo 2 lịch chạy: `tick` mỗi 15 phút (đăng bài tới giờ, tạo bài cho tuyến tới giờ tạo) và `donBaiHetHan` lúc 23h.
   - Ghi `DESK_KEY` ra Execution log. Copy lại mã này.
5. Mở sheet `Tuyen_bai`, dán ID thư mục ảnh vào cột `thu_muc_anh` của từng tuyến.
6. Chạy hàm `kiemTra`. Log sẽ báo:
   - Gemini key có hay chưa.
   - Từng page có OK không (kèm tên page lấy từ Facebook).
   - Thư mục ảnh của từng tuyến.
   - Từng nguồn RSS lấy được bao nhiêu tin.

   Sửa hết các dòng báo LỖI rồi mới chạy tiếp.
7. Deploy:
   - Vào **Deploy → New deployment → Web app**.
   - **Execute as:** Me. **Who has access:** Anyone.
   - Copy URL `/exec`.

> Sau này sửa code: vào **Deploy → Manage deployments → ✏ → Version: New version** để URL giữ nguyên.

## Bước 5: Gắn vào phòng MKT

```html
<div id="ban-duyet-bai"></div>
<script src="ban-duyet-bai.js"></script>
<script>
  BanDuyetBai.init({
    container: '#ban-duyet-bai',
    onBadge: n => { /* số bài chờ duyệt trên toà nhà phòng MKT */ },
    onMo: () => { /* chuyển sang phòng MKT */ },
  });
  BanDuyetBai.kiemTraKhiMo(); // gọi 1 lần khi mở app
</script>
```

Mở Học viện, bấm **Cài đặt**, dán URL `/exec` và `DESK_KEY`. Mỗi thiết bị nhập một lần.

## Bước 6: Chạy thử

1. Chạy hàm `taoBaiNgay`. Hàm này tạo bài ngay cho mọi tuyến, không chờ tới giờ tạo.
2. Mở Học viện. Thông báo phải báo có bài cần duyệt.
3. Duyệt một bài, đặt giờ đăng là giờ hiện tại.
4. Chờ tối đa 15 phút. Bài phải lên page và chuyển sang **Đã đăng**.

---

## Mở rộng: thêm tuyến, thêm page

**Thêm tuyến bài:** thêm 1 dòng vào sheet `Tuyen_bai`:

| cột | ví dụ |
|---|---|
| tuyen_id | `TIPS_ADS` (viết liền, không trùng) |
| page_key | `IDC` |
| ten_tuyen | `Mẹo chạy ads` |
| gio_tao | `8` |
| gio_dang | `09:00` |
| thu_muc_anh | ID thư mục Drive |
| huong_dan_chon_tin | Ưu tiên tin gì, tránh tin gì |
| huong_dan_viet | Cấu trúc bài, giọng viết, CTA |

Sau đó thêm nguồn RSS cho tuyến vào sheet `Nguon_RSS`, cột đầu ghi `TIPS_ADS`.

**Thêm page:**
1. Trong Business Settings, gán page mới cho System User với quyền **Nội dung**.
2. Thêm 1 dòng vào sheet `Page`: `page_key`, tên page, ID page.
3. Chạy `kiemTra` để chắc page đã OK.
4. Tạo tuyến cho page đó như trên.

Bàn duyệt bài sẽ tự hiện bộ lọc page khi có từ 2 page trở lên.

**Tạm tắt một page hoặc tuyến:** ghi `x` vào cột `tat`.

**Giới hạn:**
- Mỗi lượt `tick` chạy tối đa 4,5 phút. Tuyến nào chưa kịp tạo sẽ được tạo ở lượt sau (15 phút sau).
- Tài khoản Gmail thường có giới hạn tổng thời gian chạy trigger mỗi ngày, khoảng 90 phút. Một bài mất khoảng 30–60 giây, nên làm được khoảng 30–40 tuyến mỗi ngày.
- Vượt mức đó thì chuyển sang Google Workspace hoặc Cloud Run.

---

## Bảo mật: đã xử lý gì, bạn cần giữ gì

**Đã xử lý trong code:**
- Token Facebook và key Gemini chỉ nằm trong Script Properties.
  - Khi gọi API, token và key đi trong header, không nằm trên URL.
  - Token và key không bao giờ được ghi vào Sheet, Log hay trả về Bàn duyệt bài.
- Mọi lệnh gửi tới Web App phải có `DESK_KEY`:
  - Mã dài 44 ký tự, so sánh kiểu chống dò từng ký tự.
  - Gửi sai mã thì server cố tình phản hồi chậm.
- Bàn duyệt bài chỉ mở link `http(s)`. Link `javascript:` lấy từ RSS độc hại sẽ bị chặn, và mọi nội dung đều được escape trước khi hiển thị.
- URL Web App chỉ chấp nhận dạng `script.google.com/.../exec`. Như vậy mã không thể bị gửi nhầm sang server lạ.
- Chống prompt injection:
  - Nội dung bài báo được đánh dấu là dữ liệu, Gemini được dặn bỏ qua mọi câu "ra lệnh" nằm trong nguồn.
  - Mọi link AI tự chèn vào bài đều bị xoá.
  - Bạn vẫn là người duyệt cuối.
- Chống đăng trùng:
  - Bài được chuyển sang "Đang đăng" trước khi gửi lên Facebook. Nếu script chết giữa chừng, hệ thống không tự đăng lại mà báo bạn kiểm tra.
  - Hai lượt `tick` không chạy chồng lên nhau.
- Sửa bằng AI sau khi đã duyệt thì bài tự quay về "Chờ duyệt". Nội dung chưa được bạn xem sẽ không bao giờ tự đăng.

**Bạn cần giữ:**
1. **Không** chia sẻ quyền sửa project Apps Script cho ai. Ai sửa được script là đọc được token.
2. Không gửi `DESK_KEY` hay token qua chat, Zalo, email.
   - Lộ `DESK_KEY`: xoá property `DESK_KEY`, chạy lại `setup`, nhập mã mới trên các máy.
   - Lộ token: vào Business Settings, thu hồi token của System User rồi tạo token mới.
3. Học viện chạy trên GitHub Pages: mọi repo của bạn dùng chung tên miền `<tên>.github.io`, nên trang nào cũng đọc được mã đã lưu trong trình duyệt. Có hai việc nên làm:
   - Đừng nhúng script lạ (quảng cáo, widget bên thứ ba) vào bất kỳ repo nào.
   - Nếu được, cho Học viện một domain riêng.
4. System User chỉ cấp quyền **Nội dung** trên đúng những page cần đăng, không cấp toàn quyền.

## Khi có lỗi

Xem sheet `Log` trước, hoặc chạy `kiemTra`.

| Lỗi | Xử lý |
|---|---|
| `Thiếu Script Property` | Thiếu một dòng ở bước 4.3 |
| `Chưa có token cho page …` | Chưa có `FB_SYSTEM_USER_TOKEN` hoặc `FB_TOKEN_<PAGE_KEY>` |
| `System User chưa được gán page …` | Gán page cho System User (bước 2.3) |
| `Facebook: … (code 190)` | Token bị thu hồi hoặc hết hạn, tạo token mới |
| `Gemini quá tải (… 503 …)` | Mọi model đều đang quá tải, lượt sau (15 phút) sẽ tự thử lại |
| `Gemini 400/403` | Key sai hoặc bị thu hồi, tạo key mới |
| `Gemini 429` | Hết hạn mức, kiểm tra billing/credit |
| `Không có tin mới…` | Chạy `kiemTra`, thêm hoặc sửa nguồn RSS của tuyến |
| Bài kẹt ở "Đang đăng" | Xem trên page. Bài đã lên thì sửa trạng thái trong `Bai_dang` thành `Đã đăng`, chưa lên thì sửa về `Đã duyệt` |
