# Kiểm tra desktop và runtime

Workflow `.github/workflows/desktop-runtime.yml` chỉ chạy thủ công qua `workflow_dispatch`.
Push và pull request không kích hoạt workflow này. Giữ chế độ thủ công để tiết kiệm quota GitHub Actions.

Workflow kiểm tra runtime chung, desktop Node, trình duyệt, typecheck và build desktop trên Ubuntu.
Các test dùng IO giả lập. Chúng không chứng nhận microphone, cửa sổ Electron hoặc Telegram thật.

## Chạy local

Sau khi cài dependencies, build các package desktop phụ thuộc:

```sh
pnpm --filter '@angela/desktop^...' --workspace-concurrency=1 run build
pnpm exec playwright install chromium
```

Chạy các nhóm test tương ứng:

```sh
pnpm -F @angela/companion exec vitest run --config vitest.config.ts src/companion src/runtime --maxWorkers=1 --no-file-parallelism --testTimeout=30000 --hookTimeout=30000
pnpm exec vitest run --project stage-tamagotchi:node --testTimeout=30000 --hookTimeout=30000
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

Chưa chạy workflow trên GitHub. Kết quả local không chứng nhận cài dependencies trên runner mới.

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
