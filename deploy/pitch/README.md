# Angela Hackathon Pitch

Bản thuyết trình ý tưởng gồm 20 slide, phát triển từ `Angela_Hackathon_Pitch_20_Slides.html`.
Nội dung đi từ lý do chọn đề tài đến giải pháp, thách thức, lộ trình và tương lai phát triển.
Toàn bộ slide dùng nền xanh đậm, chữ sáng và điểm nhấn xanh ngọc, san hô.

- `public/index.html`: nội dung slide và ghi chú thuyết trình.
- `public/pitch.css`: giao diện, bố cục responsive và định dạng in.
- `public/pitch.js`: điều hướng, mục lục, ghi chú, nhạc nền và tình huống minh họa.
- `public/assets/`: hình Angela, icon, phông chữ và nhạc nền dùng tại máy.

## Xem tại máy

Từ thư mục gốc repository, chạy:

```bash
python3 -m http.server 8080 --directory deploy/pitch/public
```

Mở <http://localhost:8080>.

| Phím | Thao tác |
| --- | --- |
| `←` / `→`, `Page Up` / `Page Down` | Chuyển slide |
| `Home` / `End` | Về đầu / cuối |
| `F` | Bật / tắt toàn màn hình |
| `N` | Hiện / ẩn ghi chú của slide đang mở |
| `O` | Mở mục lục |
| `Esc` | Đóng mục lục hoặc thoát toàn màn hình |

Trong mục lục, chọn **In / Lưu PDF** để xuất slide bằng trình duyệt.
Bản in dùng khổ ngang 16:9 và ẩn các nút điều khiển.
Điện thoại hỗ trợ vuốt ngang chuyển slide và cuộn dọc để đọc.

## Chuyển động khi trình bày

Slide chuyển theo chiều tiến hoặc lùi. Tiêu đề xuất hiện trước các ý chính.
Hình Angela, sơ đồ và lộ trình có hiệu ứng mở đầu riêng.
Các hiệu ứng tự chạy khi mở slide, không cần bấm thêm để hiện nội dung.
Nền có ánh sáng và lưới mờ. Các nhóm nội dung dùng icon Lucide và đường nhấn đồng bộ.
Hình Angela chuyển động nhẹ và phản hồi theo chuột trên máy tính.
Sơ đồ có tín hiệu di chuyển, lộ trình có đường chạy và khung ghi nhớ có ánh sáng lướt qua.
Các hiệu ứng liên tục chỉ chạy trên slide đang mở và tạm dừng khi đổi tab.

Trang dùng CSS Animation có sẵn của trình duyệt, không cần thư viện bổ sung.
Khi thiết bị bật giảm chuyển động, trang tắt các hiệu ứng.
Bản in và PDF hiển thị đầy đủ nội dung, không có chuyển động.

Hội thoại mẫu và giọng đọc trên trang chỉ minh họa ý tưởng.
Hội thoại dùng câu trả lời soạn sẵn. Giọng đọc dùng tính năng có sẵn của trình duyệt.

## Nhạc nền

Bản pitch dùng “Doki Doki Literature Club! (Main Theme)” của Team Salvato, từ file MP3 người dùng cung cấp.
File nằm tại `public/assets/doki-doki-main-theme.mp3`.
Trang tự phát nhạc ngay khi mở, với âm lượng 18%, nếu trình duyệt cho phép.
Nếu trình duyệt chặn tự phát, nhạc bắt đầu ở lần bấm hoặc chuyển slide bằng bàn phím đầu tiên.
Nhạc phát liên tục qua các slide và tự lặp khi hết bài.
Nút **Nhạc nền** ở thanh dưới cùng dùng để tạm dừng hoặc phát tiếp.
Thanh âm lượng nằm cạnh nút trên màn hình lớn. Điện thoại dùng nút bật hoặc tạm dừng.
Khi phát lời chào mẫu, âm lượng nhạc giảm còn một phần tư và trở lại sau lời chào.
Nếu trình duyệt chặn phát nhạc, bấm **Nhạc nền** để bắt đầu.

## Hình ảnh và phông chữ

Hình `public/assets/angela-study.png` tạo bằng công cụ imagegen tích hợp, dựa trên nhân vật trong bản pitch gốc.
Prompt được lưu tại [`imagegen-prompt.txt`](./imagegen-prompt.txt).
Manrope được tải từ Google Fonts và lưu trong `public/assets/fonts/`, kèm giấy phép OFL.
Icon Lucide lấy từ bộ Iconify có sẵn trong dự án, lưu tại `public/assets/icons.svg`.
Giấy phép icon nằm tại `public/assets/lucide-license.txt`.

## Cập nhật nội dung

Sửa nội dung trong `deploy/pitch/public/index.html` hoặc giao diện trong `deploy/pitch/public/pitch.css`.
Sau đó tạo commit rồi push lên GitHub.
Trang tĩnh này không cần cài dependency hoặc build ứng dụng Angela.

## Cloudflare Pages

Địa chỉ: <https://angela-pitch.pages.dev>.

Project `angela-pitch` kết nối trực tiếp với repository `lighthouse2815/Angela` qua Git integration của Cloudflare Pages.
Mỗi lần push lên `main`, Cloudflare tự deploy lại trang chính thức.
Các nhánh khác tạo bản preview riêng.

| Cấu hình | Giá trị |
| --- | --- |
| Production branch | `main` |
| Root directory | `deploy/pitch` |
| Build command | Để trống |
| Build output directory | `public` |
| Biến môi trường production và preview | `SKIP_DEPENDENCY_INSTALL=true` |
| Build watch paths | `*` |

Cấu hình nằm trong Cloudflare Pages → `angela-pitch` → Settings.
Xem trạng thái và log của mỗi lần deploy trong tab Deployments.
Kết nối Git sử dụng quyền Cloudflare GitHub App đã có, không cần thêm secret vào repository.
