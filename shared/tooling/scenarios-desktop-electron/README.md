<a id="scenarios---stage-tamagotchi-electron"></a>

# Kịch bản - stage Tamagotchi Electron

Sở hữu các kịch bản Electron thu nhận dữ liệu được sử dụng để tạo ảnh chụp màn hình tài liệu tamagotchi.

<a id="purpose"></a>

## Mục đích

Gói này sở hữu các định nghĩa kịch bản Electron dành riêng cho sản phẩm và chỉ có cửa sổ Angela, trình trợ giúp điều hướng và tương tác. Nó phụ thuộc vào `@vishot/source-electron` cho:

- người trợ giúp `defineScenario()` chung
- bề mặt bối cảnh chung của Electron thu nhận dữ liệu
- ảnh chụp màn hình thô thu nhận dữ liệu và tải kịch bản

Nó không tự khởi chạy Electron và nó không sở hữu bố cục cảnh trình duyệt hoặc dàn dựng ảnh chụp màn hình được chia sẻ.

<a id="workflow"></a>

## Quy trình làm việc

Gói này là bước 1 của quy trình chụp ảnh màn hình tài liệu.

1. Xây dựng `@angela/desktop`.
2. Chạy kịch bản này thông qua `@vishot/cli`.
3. Ghi kết quả đầu ra thô vào `shared/tooling/scenarios-desktop-browser/artifacts/raw`.
4. Sau đó chạy gói trình duyệt thu nhận dữ liệu (bước 2, được ghi trong gói README đó).

<a id="agent-quickstart"></a>

## agent Khởi động nhanh

Từ gốc repo, chạy:

```bash
pnpm -F @angela/desktop build
pnpm exec vishot capture --target electron ./shared/tooling/scenarios-desktop-electron/src/scenarios/demo-controls-settings-chat-websocket/index.ts --app-entrypoint ./apps/desktop/out/main/index.js --cwd . --output-dir ./shared/tooling/scenarios-desktop-browser/artifacts/raw --format avif
```

Kết quả mong đợi:

- Tệp thô `27` trong `shared/tooling/scenarios-desktop-browser/artifacts/raw`
- những cái tên như `00-desktop.avif`... `26-devtools-vision-capture.avif`

<a id="capture-a-local-display-model"></a>

### thu nhận dữ liệu một màn hình cục bộ mô hình

Sử dụng kịch bản nhập tệp khi bằng chứng được yêu cầu phải hiển thị Live2D, VRM hoặc MMD mô hình cục bộ thay vì giá trị đặt trước:

```bash
AIRI_DISPLAY_MODEL_FORMAT=vrm \
AIRI_DISPLAY_MODEL_PATH=/absolute/path/to/avatar.vrm \
pnpm exec vishot capture \
  ./shared/tooling/scenarios-desktop-electron/src/scenarios/display-model-from-file.ts \
  --target electron \
  --app-entrypoint ./apps/desktop/out/main/index.js \
  --cwd . \
  --settle-ms 2500 \
  --output-dir ./.vishot/display-model/vrm
```

Đặt `AIRI_DISPLAY_MODEL_FORMAT` thành `live2d`, `vrm` hoặc `mmd`. Kịch bản bỏ qua quá trình triển khai lần đầu tiên trong cấu hình thu nhận dữ liệu, nhập và chọn tệp được cung cấp thông qua bộ chọn mô hình, chụp stage chính, sau đó khôi phục trạng thái lâu dài và xóa mẫu kiểm thử đã nhập.

<a id="scenario-authoring"></a>

## Viết kịch bản

```ts
import { defineStageTamagotchiScenario } from '../context'

export default defineStageTamagotchiScenario({
  id: 'settings-connection',
  async run({ capture, stageWindows, controlsIsland, settingsWindow }) {
    const mainWindow = await stageWindows.waitFor('main')

    await controlsIsland.expand(mainWindow.page)
    const settings = await controlsIsland.openSettings(mainWindow.page)
    const page = await settingsWindow.goToConnection(settings.page)
    await page.waitForTimeout(1000)

    await page.getByText('WebSocket Server Address').waitFor({ state: 'visible' })
    await capture('connection-settings', page)
  },
})
```

<a id="gesture-primitive"></a>

### Cử chỉ nguyên thủy

Sử dụng `gestures.swipe` để tái tạo thao tác vuốt chạm trực tiếp hoặc xoay bánh xe bằng hai ngón tay:

```ts
export default defineStageTamagotchiScenario({
  id: 'chat-swipe-reply',
  async run({ gestures, stageWindows }) {
    const chat = await stageWindows.waitFor('chat')
    const message = chat.page.locator('[data-swipeable]').last()

    await gestures.swipe(message, {
      input: 'wheel',
      direction: 'left',
    })
  },
})
```

Sử dụng `input: 'touch'` cho đường dẫn Sự kiện con trỏ màn hình hẹp. Nguyên thủy tính toán trung tâm mục tiêu, chia hành trình thành các mẫu và chờ cử chỉ được xử lý.

<a id="scenario-layout"></a>

## Bố cục kịch bản

Quy trình làm việc của tài liệu được tổ chức dưới dạng mô-đun kịch bản dựa trên một phần trong `src/scenarios/demo-controls-settings-chat-websocket/`. Bản kê khai phần điều phối `index.ts` cấp cao nhất.

Quan trọng:

- `--output-dir` cho `vishot capture` sẽ trỏ đến `shared/tooling/scenarios-desktop-browser/artifacts/raw`.
- Gói này không xuất bản trực tiếp nội dung tài liệu; nó chỉ chuẩn bị nội dung thô cho bố cục cảnh trình duyệt.

<a id="notes"></a>

## Ghi chú

- Các mô-đun kịch bản thô trực tiếp trong `src/scenarios`.
- Điểm nhập kịch bản phải trỏ đến `index.ts` khi quy trình làm việc được tổ chức dưới dạng thư mục phần.
- Giữ gói này tập trung vào các luồng Electron thu nhận dữ liệu để chụp ảnh màn hình tài liệu.
- Đường dẫn trong các ví dụ này được giải quyết từ thư mục gốc của kho lưu trữ.

<a id="electron-profile-note-plugin-discovery"></a>

## Ghi chú hồ sơ điện tử (Khám phá plugin)

Khi chạy các kịch bản thông qua nguồn Electron chung thu nhận dữ liệu của Vishot, ứng dụng Electron được xây dựng có thể sử dụng cấu hình `userData` khác với `dev:desktop`.

- Root plugin `dev:desktop` thường phân giải thành:
  - `~/Library/Application Support/@angela/desktop/plugins/v1`
- Các lần chạy Vishot/Electron thu nhận dữ liệu có thể giải quyết root plugin thành:
  - `~/Library/Application Support/Electron/plugins/v1`

Nếu plugin cờ vua xuất hiện trong dev nhưng không có trong Vishot (`Discovered 0` hoặc `Plugin manifest not found`), hãy liên kết thư mục plugin `dist` với thư mục gốc của plugin hồ sơ Electron:

```bash
mkdir -p "$HOME/Library/Application Support/Electron/plugins/v1"
ln -sfn "/absolute/path/to/airi-plugin-game-chess/dist" "$HOME/Library/Application Support/Electron/plugins/v1/airi-plugin-game-chess"
```
