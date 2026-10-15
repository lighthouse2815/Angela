# Angela Hackathon Pitch

Bản trình bày gồm 20 slide, lấy từ `Angela_Hackathon_Pitch_20_Slides.html`.
File `public/index.html` chứa toàn bộ hình ảnh, CSS và JavaScript của bản gốc.

## Xem tại máy

Từ thư mục gốc repository, chạy:

```bash
python3 -m http.server 8080 --directory deploy/pitch/public
```

Mở <http://localhost:8080>.
Dùng phím mũi tên để chuyển slide và phím `F` để mở toàn màn hình.

## Cập nhật nội dung

Sửa `deploy/pitch/public/index.html`, tạo commit rồi push lên GitHub.
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
