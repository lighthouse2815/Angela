<a id="scenarios---stage-tamagotchi-browser"></a>

# Kịch bản - Trình duyệt Tamagotchi stage

Compose xuất cảnh trình duyệt cuối cùng cho Angela desktop từ ảnh chụp màn hình Electron thô.

<a id="purpose"></a>

## Mục đích

Gói này là lớp thành phần trình duyệt tamagotchi. Nó chứa:

- ứng dụng cảnh Vite/Vue
- các thành phần bố cục cảnh và gốc thu nhận dữ liệu
- định tuyến cảnh dựa trên tệp từ `src/scenes/**` qua `unplugin-vue-router`
- tập lệnh `capture` xuất trình duyệt cuối cùng được chụp thông qua `@vishot/renderer-browser`

Nó hy vọng ảnh chụp màn hình doanh nghiệp thô sẽ tồn tại trong `artifacts/raw` trước khi tiến hành xuất lần cuối.

Tài liệu hiện tại thu nhận dữ liệu nhắm mục tiêu route:

- `/docs/setup-and-use` -> `src/scenes/docs/setup-and-use/index.vue`
- `/docs/setup-and-use/intro-chat` -> `src/scenes/docs/setup-and-use/intro-chat.vue`
- `/docs/setup-and-use/intro-websocket` -> `src/scenes/docs/setup-and-use/intro-websocket.vue`
- `/docs/setup-and-use/main-window` -> `src/scenes/docs/setup-and-use/main-window.vue`
- `/docs/setup-and-use/settings` -> `src/scenes/docs/setup-and-use/settings.vue`

<a id="workflow"></a>

## Quy trình làm việc

1. Chạy Electron thu nhận dữ liệu trước và điền `artifacts/raw` (xem gói electron README).
2. Chạy trình duyệt thu nhận dữ liệu và xuất các tệp được soạn thảo cuối cùng thành nội dung tài liệu.

<a id="agent-quickstart"></a>

## agent Khởi động nhanh

Từ gốc repo, chạy:

```bash
pnpm exec vishot capture --target electron ./shared/tooling/scenarios-desktop-electron/src/scenarios/demo-controls-settings-chat-websocket/index.ts --app-entrypoint ./apps/desktop/out/main/index.js --cwd . --output-dir ./shared/tooling/scenarios-desktop-browser/artifacts/raw --format avif
pnpm -F @angela/scenarios-desktop-browser capture --format avif --route '/docs/setup-and-use/intro-chat' --output-dir ../../airi-docs/content/en/docs/manual/tamagotchi/setup-and-use/assets --settle-ms 800
pnpm -F @angela/scenarios-desktop-browser capture --format avif --route '/docs/setup-and-use/intro-websocket' --output-dir ../../airi-docs/content/en/docs/manual/tamagotchi/setup-and-use/assets --settle-ms 800
pnpm -F @angela/scenarios-desktop-browser capture --format avif --route '/docs/setup-and-use/main-window' --output-dir ../../airi-docs/content/en/docs/manual/tamagotchi/setup-and-use/assets --settle-ms 800
pnpm -F @angela/scenarios-desktop-browser capture --format avif --route '/docs/setup-and-use/settings' --output-dir ../../airi-docs/content/en/docs/manual/tamagotchi/setup-and-use/assets --settle-ms 800
```

Kết quả mong đợi:

- Nguyên: Tệp `27` trong `shared/tooling/scenarios-desktop-browser/artifacts/raw`
- Nội dung tài liệu cuối cùng: `manual-*.avif` và `intro-chat-window.avif` thuộc `airi-docs/content/en/docs/manual/tamagotchi/setup-and-use/assets`

Tài liệu tồn tại trong [moeru-ai/airi-docs](https://github.com/moeru-ai/airi-docs). Sao chép nó vào `airi-docs/` tại thư mục gốc của kho lưu trữ (bị Git bỏ qua) trước khi chụp.

<a id="capture-flags"></a>

## Cờ thu nhận dữ liệu

Tập lệnh thu nhận dữ liệu của trình duyệt hỗ trợ:

- `--format <png|avif>` (mặc định: `png`)
- `--route </path>` (mặc định: `/docs/setup-and-use`)
- `--output-dir <path>` (mặc định: `artifacts/final`)
- `--settle-ms <number>` (mặc định: `500`) tăng thêm độ trễ sau khi cảnh sẵn sàng trước ảnh chụp màn hình

Ví dụ:

```bash
pnpm -F @angela/scenarios-desktop-browser capture --format avif --settle-ms 800
pnpm -F @angela/scenarios-desktop-browser capture --route /docs/setup-and-use --settle-ms 800
pnpm -F @angela/scenarios-desktop-browser capture --route /docs/setup-and-use/settings --settle-ms 800
pnpm -F @angela/scenarios-desktop-browser capture --format avif --route /docs/setup-and-use --output-dir ../../airi-docs/content/en/docs/manual/tamagotchi/setup-and-use/assets --settle-ms 800
```

Luồng thu nhận dữ liệu của trình duyệt bắt đầu từ ảnh chụp màn hình Playwright PNG, sau đó chuyển đổi tùy ý thành AVIF thông qua Vishot `imageTransformers`.

<a id="notes"></a>

## Ghi chú

- Gói này có thể host nhiều trang cảnh. Thêm Vue SFC route trong `src/scenes/**` (ví dụ `src/scenes/docs/setup-and-use/index.vue`).
- thu nhận dữ liệu route mặc định là `/docs/setup-and-use`. Ghi đè nó bằng `--route /your/path`.
- Việc chụp chỉ được thực hiện đối với các rễ được gắn bởi route chính xác mà bạn vượt qua. Để có nội dung thủ công thiết lập đầy đủ, hãy chạy bản ghi cho `/docs/setup-and-use/intro-chat`, `/docs/setup-and-use/intro-websocket`, `/docs/setup-and-use/main-window` và `/docs/setup-and-use/settings`.
- Việc xuất cuối cùng phụ thuộc vào cảnh trình duyệt đạt cờ `__SCENARIO_CAPTURE_READY__` sau khi tải hình ảnh thô của nó.
- Nếu thu nhận dữ liệu thô bị thiếu hoặc cũ, quá trình xuất cuối cùng sẽ không thành công hoặc hiển thị nội dung lỗi thời.
- Nếu bạn bật đầu ra AVIF, tên tệp artifact cuối cùng sẽ chuyển từ `.png` sang `.avif` vì máy biến áp sẽ thay thế các tệp PNG được phát ra sau thu nhận dữ liệu.
- Đường dẫn trong các ví dụ `pnpm -F` này được giải quyết từ thư mục làm việc của gói đã lọc.
