# Kiểm tra desktop và runtime

Workflow `.github/workflows/desktop-runtime.yml` chạy khi push hoặc pull request vào `main` thay đổi các đường dẫn desktop và dependency liên quan.
Workflow vẫn hỗ trợ chạy thủ công qua `workflow_dispatch`.

Workflow kiểm tra runtime chung, desktop Node, trình duyệt, typecheck và build desktop trên Ubuntu.
Các test runtime dùng IO giả lập. Smoke cửa sổ chạy Electron thật trong Xvfb.
Workflow không chứng nhận microphone, thao tác desktop native hoặc Telegram thật.

## Chạy local

Sau khi cài dependencies, build các package desktop phụ thuộc:

```sh
pnpm --filter '@angela/desktop^...' --workspace-concurrency=1 run build
pnpm exec playwright install chromium
```

Chạy các nhóm test tương ứng:

```sh
pnpm -F @angela/companion exec vitest run --config vitest.config.ts src/companion src/runtime --maxWorkers=1 --no-file-parallelism --testTimeout=30000 --hookTimeout=30000
pnpm exec vitest run --config apps/desktop/vitest.node.config.ts --testTimeout=30000 --hookTimeout=30000
pnpm -F @angela/desktop exec vitest run --config vitest.config.ts --project browser src/renderer/composables/use-companion-runtime.browser.test.ts src/renderer/composables/use-companion-follow-ups.browser.test.ts --maxWorkers=1 --no-file-parallelism --testTimeout=30000 --hookTimeout=30000
```

Kiểm tra kiểu dữ liệu, build và lint:

```sh
pnpm -F @angela/cli typecheck
pnpm -F @angela/desktop typecheck
pnpm -F @angela/desktop build
pnpm lint
```

Nếu Node hết heap khi typecheck, chạy `NODE_OPTIONS=--max-old-space-size=4096 pnpm -F @angela/desktop typecheck`.
Workflow đặt giới hạn heap 4 GiB cho các bước Node.

Build desktop tải asset avatar và SDK khi cache chưa có. Lần chạy đầu cần mạng.
Workflow này không đóng gói installer hoặc kiểm tra thư viện native trên Windows và macOS.

## Kết quả local ngày 23-10-2026

- Runtime chung: 74 test đạt.
- Desktop Node: 90 file đạt, 678 test đạt và 2 test được bỏ qua theo cấu hình hiện có.
- Browser companion: 2 file đạt, 6 test đạt.
- Typecheck CLI và desktop đạt. Desktop dùng heap 4 GiB.
- Build desktop đạt.
- Lint toàn repository đạt với 603 cảnh báo ESLint và không có lỗi ESLint.

Kết quả này mô tả lần chạy local. Kết quả GitHub mới nằm cuối tài liệu.

## Smoke overlay Electron

Chạy smoke sau khi build dependency. Lệnh mở Electron với hồ sơ riêng trong `.temp/`.

```sh
pnpm_config_verify_deps_before_run=false pnpm -F @angela/desktop smoke:desktop-overlay-live-window
```

Biến môi trường trên ngăn pnpm tự cài dependencies trước khi chạy smoke.
Smoke chuyển tiếp biến này vào cấu hình MCP riêng của lần chạy.
Script chạy bằng Node qua `tsx`. Các import của script phải hoạt động ngoài Vite.
Test hồi quy chạy import trong một tiến trình Node riêng:

```sh
pnpm_config_verify_deps_before_run=false pnpm exec vitest run --project stage-tamagotchi:node apps/desktop/scripts/desktop-overlay-live-window-smoke.test.ts
```

Để kiểm tra bản đã build, đặt `SMOKE_USE_BUILT_APP=1`. Chế độ này không chạy Vite dev hoặc build lại ứng dụng.

```sh
pnpm_config_verify_deps_before_run=false pnpm -F @angela/desktop build
pnpm_config_verify_deps_before_run=false SMOKE_USE_BUILT_APP=1 pnpm -F @angela/desktop smoke:desktop-overlay-live-window
```

Hai smoke overlay và Linux render dùng chung cleanup cho nhóm tiến trình riêng.
Cleanup dừng cả Electron con khi wrapper pnpm đã thoát. Sau năm giây, nó gửi SIGKILL nếu nhóm vẫn tồn tại.

Executor mặc định là `macos-local`, cần macOS và quyền desktop tương ứng.
Kết quả Linux Wayland ngày 24-10-2026:

- Lần chạy dev dừng với `overlay smoke bridge timed out after 60000ms`.
- Bản production mount được renderer và trả về `OVERLAY_RPC_READY` qua Eventa.
- MCP dừng với `Connection closed`. Chạy riêng server xác nhận `macos-local` từ chối host Linux.
- Sau cleanup, không còn tiến trình thuộc hồ sơ smoke của lần chạy.
- Test overlay, CDP và cleanup đạt 49/49 trong 8 file.
- Typecheck desktop, kiểm tra TypeScript riêng cho các script và build desktop đạt.
- ESLint các script đã sửa đạt, không có cảnh báo.

Chưa chứng nhận heartbeat với snapshot, click native hoặc cách ly chuột thực tế trên macOS.

## Kết quả local ngày 24-10-2026

- `pnpm install --lockfile-only --ignore-scripts --frozen-lockfile`: đạt, không thay đổi lockfile.
- `NODE_OPTIONS=--max-old-space-size=4096 pnpm typecheck --concurrency=1`: 60 tác vụ đạt.
- `pnpm build:cli`: 22 tác vụ đạt. Lần chạy lại dùng đủ cache, thời gian Turbo khoảng 0,3 giây.
- `pnpm -F @angela/desktop build`: đạt.
- CLI: 112 test đạt trong 16 file.
- Desktop Node: 684 test đạt, 2 test bỏ qua theo cấu hình hiện có.
- Browser companion: 6 test đạt trong 2 file.
- Smoke cửa sổ Electron: đạt trên Linux Wayland, có renderer và cửa sổ hiển thị.
- Gateway: 81 test hồi quy đạt trong 9 file.
- WebSocket: 94 test đạt trong 5 file.
- Voice client: 33 test đạt. Test dịch vụ thật chạy riêng và đạt.
- Audio pipeline: 33 test đạt trong 3 file.
- `pnpm lint`: không có lỗi, còn 603 cảnh báo hiện có.

Kiểm tra voice thật dùng PipeWire, VAD, STT và TTS với nguồn và đích âm thanh ảo.
Lần chạy có tín hiệu nói sau 2.743 ms và bản chép lời sau 20.226 ms.
Các số này gồm thời gian tổng hợp tiếng nói và xử lý dịch vụ trên máy đang build.
Chúng không đo độ trễ mic hoặc loa vật lý.

Gateway chạy bằng systemd user service và bật tự khởi động khi đăng nhập.
Kiểm tra stop/restart giữ nguyên cấu hình, tài khoản và khóa suy luận.
Playwright xác nhận lựa chọn endpoint Codex là `http://127.0.0.1:1107/angela1`.

Smoke desktop native còn cần macOS có quyền điều khiển hoặc một host Linux X11 qua SSH.
Không coi kiểm tra Node, browser hoặc RPC là bằng chứng cho click native trên host đó.

Smoke cửa sổ dùng `electron-vite preview --skipBuild` để tránh build lại trong thời gian chờ khởi động.
CI dùng Xvfb do bước cài dependency Playwright cung cấp.
Trước smoke, CI cài Electron và đặt sandbox helper thành `root:root`, quyền `4755`.
Runner Ubuntu yêu cầu quyền này để Electron khởi động với sandbox.
Cấu hình theo [hướng dẫn Chromium](https://chromium.googlesource.com/chromium/src/+/main/docs/linux/suid_sandbox_development.md).
Kiểm tra đầu vào Turbo xác nhận test không đổi mã hash cache. Thay đổi nguồn production đổi mã hash.

CI desktop dùng trực tiếp `apps/desktop/vitest.node.config.ts`.
Cấu hình gốc nạp cả các workspace nằm ngoài tập dependency được cài trên runner.
Thay đổi gateway riêng không khởi chạy lại workflow desktop. Desktop theo dõi provider inference mà nó sử dụng.

Workflow desktop giữ bước typecheck CLI và cài dependency của cả hai ứng dụng.
Nó build các package cần cho desktop và khai báo kiểu CLI theo thứ tự dependency.
Gateway engine không cần build cho typecheck. Workflow CLI vẫn kiểm tra build và runtime gateway đầy đủ.

## Kết quả GitHub ngày 24-10-2026

- [CI CLI đạt](https://github.com/lighthouse2815/Angela/actions/runs/40015286369) trên commit `e96e51e`.
- [CI desktop đạt](https://github.com/lighthouse2815/Angela/actions/runs/40020822765) trên commit `18c6b1c`.
- Runner desktop cài dependency từ lockfile và build các package phụ thuộc thành công.
- Runtime chung đạt 74 test. Desktop Node đạt 684 test, 2 test bỏ qua theo cấu hình hiện có.
- Browser companion đạt 6 test. Typecheck CLI, desktop và script smoke đều đạt.
- Lint và build desktop đạt.
- Smoke Electron thật đạt với `phase: done`, cửa sổ hiển thị, renderer có nội dung và Ozone `x11`.

Sandbox helper cần quyền `root:root`, `4755` trên runner Ubuntu này. Workflow cấu hình quyền trước khi mở Electron.
Kiểm tra click và gõ native vẫn chờ host phù hợp. Kết quả Xvfb chỉ chứng nhận hiển thị cửa sổ.
