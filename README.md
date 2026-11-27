# Học tiếng Trung · HSK 3.0 · HSK 1 + 2 + 3 + 4 (quyển thượng, quyển hạ)

App học tiếng Trung theo bài (1894 từ: 1645 từ trong sách + 249 từ mở rộng chuẩn HSK 3.0, 68 bài, 4 lộ trình HSK 1–4) chạy trên điện thoại và máy tính, dùng được cả khi không có mạng.

- Mở app: https://minhtuanng28.github.io/hsk2/ — trên iPhone: Safari → Chia sẻ → Thêm vào MH chính.
- Flashcard ôn tập lặp lại ngắt quãng, trắc nghiệm, kế hoạch học mỗi ngày, chuỗi ngày, XP, huy hiệu.
- Mỗi từ: pinyin tô màu thanh điệu, nghĩa Việt + Anh, Hán Việt, phân tích bộ thủ, cấu tạo từ, cụm từ hay dùng, câu ví dụ.
- Bài khóa song ngữ (hội thoại + đoạn văn) có pinyin, tiếng Việt, tiếng Anh, nghe cả bài và nhập vai.
- Phát âm: ghi âm người bản xứ → giọng Google (khi có mạng) → giọng tiếng Trung của máy.
- Đăng nhập Google / email (Firebase) để đồng bộ tiến độ giữa các thiết bị và lên bảng xếp hạng.
- `widget-hsk.js` + `words.json` + `capy-*.png`: widget màn hình khoá và màn hình chính cho app Scriptable, có bé capybara.

Từ mở rộng: danh sách từ chuẩn HSK 3.0 (bộ dữ liệu complete-hsk-vocabulary, MIT), xếp vào bài có chủ đề gần nhất. Ghi âm: bộ HSK của Yue Tan (Shtooka, CC BY-SA) qua audio-cmn. Phân tích chữ: Make Me a Hanzi. Bài khóa và hình capybara được soạn/vẽ riêng cho app.

## Ngân hàng Mintun (`finance/`)

App quản lý tài chính cá nhân: https://minhtuanng28.github.io/hsk2/finance/ — tiền vào từ đâu, đi đâu (sơ đồ dòng tiền), từng hạng mục, mục tiêu ngắn/dài hạn, ghi thu chi có ngày giờ và lời khuyên của mèo Bắp mỗi ngày. Dữ liệu đọc live từ Google Sheet qua Apps Script (`tools/finance-sync`, xem HUONG-DAN.md); repo không chứa số liệu. Trong Học viện có toà **Ngân hàng Mintun** hiện bản tóm tắt.
