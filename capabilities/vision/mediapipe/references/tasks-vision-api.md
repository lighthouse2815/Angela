<a id="mediapipe-tasks-vision-minimal-api-notes"></a>

# Tầm nhìn nhiệm vụ MediaPipe (ghi chú API tối thiểu)

Gói này nhắm mục tiêu `@mediapipe/tasks-vision` (web, JS/TS).

<a id="core-init"></a>

## Khởi tạo cốt lõi

```ts
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

const vision = await FilesetResolver.forVisionTasks(wasmRoot)
const pose = await PoseLandmarker.createFromOptions(vision, {
  baseOptions: { modelAssetPath: poseModelUrl },
  runningMode: 'VIDEO',
  numPoses: 1,
})
```

<a id="video-inference"></a>

## Suy luận video

MediaPipe Nhiệm vụ Vision `detectForVideo()` chạy đồng bộ và có thể chặn luồng chính.

```ts
const nowMs = performance.now()
const res = pose.detectForVideo(videoEl, nowMs)
```

<a id="result-shapes-single-person-usage"></a>

## Hình dạng kết quả (cách sử dụng của một người)

<a id="pose"></a>

### Tư thế

- `res.landmarks`: `NormalizedLandmark[][]` (lấy `[0]` cho người độc thân)
- mỗi mốc bao gồm `{ x, y, z, visibility?, presence? }` với `x/y` trong `[0..1]`

<a id="hands"></a>

### bàn tay

- `res.landmarks`: `NormalizedLandmark[][]` (mỗi mục nhập là 21 điểm cho một tay)
- `res.handedness`: `Category[][]` được căn chỉnh theo `landmarks`
  - `handedness[i][0].categoryName` thường là `'Left' | 'Right'`
  - `handedness[i][0].score` là sự tự tin

<a id="face-optional"></a>

### Khuôn mặt (tùy chọn)

- `res.faceLandmarks`: `NormalizedLandmark[][]` (468 mốc, nặng)
- Đối với hội thảo, chúng tôi coi đây là tùy chọn chỉ hiện diện theo mặc định.
