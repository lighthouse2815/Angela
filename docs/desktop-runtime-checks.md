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
pnpm -F @angela/cli exec vitest run --config vitest.config.ts src/companion src/runtime --maxWorkers=1 --no-file-parallelism --testTimeout=30000 --hookTimeout=30000
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
