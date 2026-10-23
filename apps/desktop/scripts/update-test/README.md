<a id="angela-electron-updater-local-test-harness"></a>

# Angela Electron Cập nhật thử nghiệm cục bộ bộ kiểm thử

Thư mục này cung cấp quy trình làm việc của máy chủ cập nhật mô phỏng cục bộ cho stage Tamagotchi.

Nó nhằm mục đích xác minh đường dẫn cập nhật của Angela:

- chế độ ghi đè `UPDATE_SERVER_URL` rõ ràng
- Chuyển đổi luồng (`stable`, `beta`, `alpha`, `nightly`) qua `AIRI_UPDATE_CHANNEL`
- kiểm tra chẩn đoán trình cập nhật chỉ dành cho nhà phát triển

<a id="files"></a>

## Tập tin

- `generate-manifest.ts`: tạo siêu dữ liệu `latest-*.yml` cục bộ và trình giữ chỗ artifact
- `start-server.ts`: phục vụ mẫu kiểm thử được tạo qua HTTP
- `setup.sh`: chuẩn bị các thư mục mẫu kiểm thử cục bộ
- `run-test.sh`: trình bao bọc dàn nhạc mỏng
- `dev-app-update.local.yml`: mẫu nhà cung cấp chung tùy chọn dành cho các thử nghiệm chỉ dành cho phát triển

<a id="quick-start"></a>

## Bắt đầu nhanh

Từ gốc repo:

```bash
bash apps/desktop/scripts/update-test/setup.sh
pnpm -F @angela/desktop update-test:generate \
  --root scripts/update-test/fixtures/server \
  --channel stable \
  --target aarch64-apple-darwin \
  --version 9.9.9-update-test.1
pnpm -F @angela/desktop update-test:server \
  --port 8787 \
  --root scripts/update-test/fixtures/server
```

Sau đó, trong một thiết bị đầu cuối khác:

```bash
cd apps/desktop
UPDATE_SERVER_URL=http://127.0.0.1:8787/stable pnpm run dev
# optional lane override:
# AIRI_UPDATE_CHANNEL=beta UPDATE_SERVER_URL=http://127.0.0.1:8787/beta pnpm run dev
```

<a id="verification-flow"></a>

## Luồng xác minh

1. Mở trang Giới thiệu.
2. Nhấp vào `Check for updates`.
3. Xác nhận bản cập nhật có sẵn.
4. Nhấp vào `Download update`.
5. Xác nhận trình cập nhật đạt trạng thái `downloaded`.
6. Mở `Settings > System > Developer`.
7. Kích hoạt `Inspect updater diagnostics`.
8. Mở `Devtools > Updater`.
9. Xác nhận:
   - `overrideActive=true`
   - `feedUrl` trỏ tới `http://127.0.0.1:8787/stable`
   - `platform`, `arch` và `channel` khớp với runtime hiện tại

<a id="helper-wrapper"></a>

## Trình bao bọc trợ giúp

Bạn cũng có thể in các lệnh quy trình công việc bằng:

```bash
bash apps/desktop/scripts/update-test/run-test.sh
```

Để kiểm tra ma trận tự động (chế độ cấp dữ liệu luồng x runtime + ma trận kiểm tra phiên bản gói), hãy chạy:

```bash
pnpm -F @angela/desktop update-test:matrix
```

Kịch bản này:

- chạy thử nghiệm ma trận cập nhật Vitest (bao gồm phiên bản đi kèm: stable/beta/alpha)
- tạo mẫu kiểm thử cục bộ cho `stable`, `beta`, `alpha`, `nightly`
- chạy kiểm tra ứng dụng đóng gói cho hai chế độ runtime:
  - Chế độ ghi đè `UPDATE_SERVER_URL`
  - không ghi đè (chế độ phân giải GitHub luồng)
- ghi lại nhật ký và tóm tắt trong `scripts/update-test/artifacts/`
- viết báo cáo ma trận green/red tại `scripts/update-test/artifacts/<run-id>/summary.md`

Các biến môi trường được trình bao bọc hỗ trợ:

- `PORT`
- `CHANNEL`
- `TARGET`
- `VERSION`
- `AIRI_UPDATE_CHANNEL` (tại thời điểm khởi chạy ứng dụng; độc lập với `CHANNEL`)
- `RUN_SECONDS` (ứng dụng ma trận runtime cho mỗi trường hợp; `18` mặc định)
- `LOG_DIR` (ghi đè thư mục ma trận artifact)

Mục tiêu chung:

- Apple Silicon macOS: `aarch64-apple-darwin`
- Intel macOS: `x86_64-apple-darwin`
- Windows x64: `x86_64-pc-windows-msvc`
- Linux x64: `x86_64-unknown-linux-gnu`

<a id="notes"></a>

## Ghi chú

- artifact được tạo là một tệp giữ chỗ dùng để khám phá bản cập nhật và xác minh luồng tải xuống sớm.
- Việc thực thi trình cài đặt có chữ ký thực vẫn là một bước xác minh thủ công riêng biệt.
- Lần đầu tiên được thực hiện thủ công theo thiết kế. Lớp Playwright `_electron` kiểm tra nhanh có thể được thêm lên trên sau.
- Khi gọi các tập lệnh gói thông qua `pnpm -F @angela/desktop`, hãy coi `--root` có liên quan đến `apps/desktop` chứ không phải gốc workspace.
