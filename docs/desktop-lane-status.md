# Trạng thái desktop overlay

Cập nhật: 24-10-2026.

Tài liệu này theo dõi overlay tùy chọn bật bằng `AIRI_DESKTOP_OVERLAY=1`.
Overlay đọc trạng thái từ MCP `computer_use`. Nó không phải đường thực thi AUV của chat desktop.

## Kết quả kiểm tra hiện tại

Trên Linux Wayland, bản desktop đã build tạo được cửa sổ overlay và mount renderer.
Lệnh smoke in `OVERLAY_RPC_READY` sau khi Eventa trả về trạng thái `ready`.
Điều này xác nhận RPC đã đăng ký trước khi renderer gọi handshake.

MCP chưa khởi động được trong lần chạy này.
Executor mặc định `macos-local` yêu cầu host macOS.
Smoke hiện kiểm tra điều kiện host trước khi mở Electron.
`linux-x11` cần cấu hình host SSH. Smoke chuyển tiếp các biến `COMPUTER_USE_REMOTE_*` tới MCP.
Chế độ `dry-run` bị từ chối vì không chứng minh thao tác native.
Chạy riêng server trên Linux xác nhận lỗi `macos-local executor requires a darwin host, current platform is linux`.

Lần chạy dev trước đó mở được cửa sổ nhưng timeout khi chờ renderer mount bridge.
Chế độ kiểm tra bản đã build tránh phụ thuộc Vite dev và không build lại ứng dụng.

## Các lỗi đã sửa

- Smoke import trực tiếp `@moeru/std`, tránh barrel cần `import.meta.env` của Vite.
- Smoke chuyển tiếp cấu hình kiểm tra dependency của pnpm vào tiến trình MCP.
- Hai smoke Electron dùng chung cleanup cho nhóm tiến trình riêng.
- Cleanup xử lý cả trường hợp wrapper đã thoát nhưng Electron con vẫn còn chạy.
- Cleanup gửi SIGKILL sau năm giây nếu SIGTERM không dừng được nhóm.

Test hồi quy chạy import trong Node thật và kiểm tra cleanup bằng tiến trình thật.
Bộ test overlay, CDP và cleanup đạt 49/49 trong 8 file.
Typecheck desktop, kiểm tra TypeScript các script và build desktop đạt.
ESLint các script đã sửa đạt.

## Chạy lại trên macOS

Cài dependencies và build các package desktop phụ thuộc trước khi chạy smoke.
Dùng Chrome và cấp quyền desktop tương ứng cho host thực thi.

```sh
pnpm_config_verify_deps_before_run=false pnpm -F @angela/desktop build
pnpm_config_verify_deps_before_run=false SMOKE_USE_BUILT_APP=1 pnpm -F @angela/desktop smoke:desktop-overlay-live-window
```

Log nằm trong `.temp/desktop-overlay-live-window-smoke-<thời-gian>/stage-tamagotchi.log`.
Xem [lệnh kiểm tra](desktop-runtime-checks.md#smoke-overlay-electron) để chạy test hồi quy.

## Phần chưa được xác nhận

- Chuỗi `desktop_ensure_chrome → desktop_observe → desktop_click_target → desktop_get_state` trên macOS hiện tại.
- Heartbeat chứa snapshot và pointer intent sau click native.
- Overlay không chặn chuột người dùng trong phiên desktop thực.
- Hành vi Chrome DOM, iframe và khôi phục con trỏ trên host được hỗ trợ.

Các test đơn vị về window contract không thay thế kiểm tra chuột native.
RPC sẵn sàng không chứng minh thao tác desktop đã thực hiện thành công.
Giữ trạng thái kiểm tra toàn luồng là chưa đạt cho đến khi smoke trên macOS thành công.

## Kiểm tra bổ sung ngày 24-10-2026

- Các test overlay, CDP và cleanup đạt 52/52 trong 8 file.
- Toàn bộ desktop Node đạt 684 test. Hai test bỏ qua theo cấu hình hiện có.
- Preflight kiểm tra executor, hệ điều hành và cấu hình SSH trước khi mở ứng dụng.
- Typecheck toàn repo đạt 60 tác vụ với heap Node 4 GiB.
- Build desktop đạt sau khi sửa đường dẫn đầu ra H3 trong `@angela/better-ws`.
- Package khai báo export `server/h3` nhưng cấu hình build cũ tạo `backend/h3`.

Các kiểm tra này không xác nhận thao tác native trên macOS hoặc host Linux X11 từ xa.

Smoke cửa sổ Electron thật đã đạt trên Linux Wayland sau khi dùng `preview --skipBuild`.
Báo cáo xác nhận renderer có nội dung, cửa sổ hiển thị và backend Ozone là `wayland`.
Lệnh smoke không build lại ứng dụng. Nó yêu cầu đủ đầu ra desktop đã build.
Đây là kiểm tra hiển thị cửa sổ, không phải kiểm tra click hoặc gõ native.

Cấu hình MCP của smoke có quyền file `0600`, trong thư mục riêng `0700`.
Các biến remote và `COMPUTER_USE_ALLOWED_BOUNDS` được chuyển tiếp khi người dùng cung cấp.
