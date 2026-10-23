# @angela/model-driver-mediapipe

Gói hội thảo thu nhận dữ liệu chuyển động một người.

**Mục tiêu**

Cung cấp một vòng lặp khép kín tối thiểu mà stage-web có thể sử dụng:

`camera frame` → `MediaPipe Tasks Vision` → `PerceptionState` → `canvas overlay`

**Thử ở đâu**

- Trang Devtools: `apps/stage-web/src/pages/devtools/model-driver-mediapipe.vue`
- Mục menu: Cài đặt → Hệ thống → Nhà phát triển → “Hội thảo MediaPipe”

**Tệp chính**

- `packages/model-driver-mediapipe/src/types.ts`: hợp đồng lớp giữa (`PerceptionState`)
- `packages/model-driver-mediapipe/src/engine.ts`: bộ lập lịch + chính sách khung bị bỏ + hợp nhất trạng thái
- `packages/model-driver-mediapipe/src/backends/mediapipe.ts`: Tích hợp `@mediapipe/tasks-vision`
- `packages/model-driver-mediapipe/src/utils/overlay.ts`: lớp phủ canvas renderer

**Giả định phụ trợ**

- Người độc thân (`maxPeople: 1`)
- Chế độ chạy: `VIDEO`
- Các mốc được chuẩn hóa (`x`/`y` trong `[0..1]`) và được vẽ trên khung vẽ lớp phủ

**Tài liệu**

Giữ upstream docs/snippets trong `packages/model-driver-mediapipe/references/`.

Bề mặt API tối thiểu mà gói này sử dụng được tóm tắt trong:

- `packages/model-driver-mediapipe/references/tasks-vision-api.md`
