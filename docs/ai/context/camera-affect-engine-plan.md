<a id="angela-camera--affect-engine--implementation-plan"></a>

# Máy ảnh Angela / Công cụ tác động - Kế hoạch thực hiện

<a id="purpose"></a>

## Mục đích

Xây dựng hệ thống con nhận thức máy ảnh cục bộ đầu tiên cho Angela CLI để Angela có thể sử dụng các tín hiệu chú ý / khuôn mặt rõ ràng làm **ngữ cảnh trò chuyện nhẹ nhàng** trong khi đóng vai trò là một người bạn và bạn đồng hành học tập của AI.

Đây **không phải** là máy dò cảm xúc y tế, tâm lý, phát hiện nói dối hoặc sự thật. Hệ thống con sẽ phát hiện các tín hiệu có thể quan sát được như sự hiện diện của khuôn mặt, biểu cảm giống nụ cười, trạng thái trung tính, hướng head/attention và các tín hiệu uncertainty/fatigue-like sau này. Angela có thể sử dụng những tín hiệu đó để điều chỉnh cách diễn đạt, tốc độ giảng dạy hoặc hành vi tiếp theo.

Ví dụ về UX dự định:

- Người dùng có vẻ bối rối trong vài giây trong khi Angela giải thích một bài học → Angela có thể đưa ra một ví dụ đơn giản hơn.
- Người dùng liên tục nhìn đi nơi khác trong buổi học → Angela có thể hỏi liệu họ có muốn nghỉ ngơi một lát không.
- Người dùng mỉm cười sau khi nhận được câu trả lời đúng → Angela có thể phản hồi nồng nhiệt hơn.
- User says "tao hiểu rồi" but visual state remains uncertain → Angela may gently verify understanding instead of asserting that the user is confused.

Không bao giờ đưa ra suy luận không chắc chắn của camera như một sự thật về trạng thái cảm xúc bên trong của người dùng.

---

<a id="product-direction"></a>

## Hướng sản phẩm

Angela hiện đang ưu tiên:

1. AI người bạn / người bạn đồng hành đàm thoại;
2. bạn đồng hành học tập / gia sư;
3. những việc vặt và nhắc nhở hàng ngày;
4. tương tác đa phương thức phong phú hơn;
5. tính năng mã hóa-agent sau này.

Do đó, tính năng này là **lớp perception/context**, không phải là bản demo thị giác máy tính độc lập và không phải là tính năng mã hóa-agent.

Nó nên được phát triển song song với Công cụ nhiệm vụ & nhắc nhở mà không cần kết hợp chặt chẽ giữa hai hệ thống.

Về mặt khái niệm:

```text
Task & Reminder Engine
        │
        └── action / assistant layer

Camera / Affect Engine
        │
        └── perception / context layer

                    ↓
              Angela Context
                    ↓
                  LLM
```

---

<a id="repository-rules"></a>

## Quy tắc lưu trữ

Trước khi mã hóa:

1. Đọc hoàn toàn gốc `AGENTS.md` và làm theo.
2. Kiểm tra `packages/angela-cli` và sử dụng lại quy trình, ghi nhật ký, cấu hình, vòng đời, dọn dẹp, sự kiện, prompt/context và các mẫu thử nghiệm hiện có.
3. Tìm kiếm trước khi tạo tiện ích.
4. Giữ mã tích hợp do Angela sở hữu trong cấu trúc dự án thông thường. Giữ nguồn upstream đã nhập cách ly trong `third_party/`.
5. Không viết lại kiến ​​trúc CLI không liên quan như một phần của tính năng này.
6. Không sử dụng `any`.
7. Sử dụng các lược đồ đã được xác thực ở ranh giới quy trình.
8. Giữ máy ảnh xử lý cục bộ theo mặc định.
9. Máy ảnh phải là OFF theo mặc định.
10. Theo mặc định, không sử dụng máy ảnh thô store frames/video.

Kế hoạch dưới đây là hướng dẫn kiến ​​trúc. Điều chỉnh đường dẫn đến kho lưu trữ thực tế thay vì buộc cấu trúc không tương thích.

---

<a id="upstream-foundation"></a>

## Quỹ upstream

<a id="base-repository"></a>

### Kho lưu trữ cơ sở

Sử dụng OpenSeeFace làm nền tảng theo dõi khuôn mặt cục bộ ban đầu:

```text
https://github.com/emilianavt/OpenSeeFace
```

OpenSeeFace cung cấp tính năng theo dõi mốc/nhận diện khuôn mặt theo thời gian thực dựa trên CPU bằng cách sử dụng Python, ONNX runtime, OpenCV, NumPy và tính năng theo dõi đi kèm mô hình.

Mục đích là đưa nguồn vào Angela để việc triển khai sau này có thể được nghiên cứu, sửa đổi, đơn giản hóa hoặc thay thế dần bằng các thành phần do Angela sở hữu.

<a id="important-source-management-rule"></a>

#### Quy tắc quản lý nguồn quan trọng

Không sao chép tập tin thủ công mà không có nguồn gốc.

Ưu tiên một trong những cách tiếp cận sau, theo thứ tự sau:

1. `git subtree` thuộc `third_party/openseeface/`;
2. một cơ chế cung cấp kho lưu trữ-native khác nếu kho lưu trữ Angela hiện tại rõ ràng đã sử dụng một cơ chế đó;
3. chỉ sử dụng bản sao nguồn đơn giản nếu công cụ subtree/vendor không hoạt động được và lưu giữ siêu dữ liệu nguồn trong tài liệu.

Hình dạng lệnh được đề xuất:

```bash
git remote add openseeface https://github.com/emilianavt/OpenSeeFace.git
git fetch openseeface
git subtree add --prefix=third_party/openseeface openseeface master
```

Không xóa upstream `LICENSE`, `Licenses/`, thông báo bản quyền hoặc thông báo model/license.

Không sửa đổi ngay lập tức mã upstream được cung cấp trừ khi được yêu cầu tích hợp. Đầu tiên hãy xây dựng một bộ chuyển đổi xung quanh nó.

<a id="why-openseeface-instead-of-vendoring-mediapipe"></a>

#### Tại sao OpenSeeFace thay vì bán MediaPipe

Không cung cấp toàn bộ kho lưu trữ MediaPipe cho cột mốc này. Nó lớn hơn nhiều và gây ra độ phức tạp build/framework không cần thiết cho thử nghiệm CLI hiện tại của Angela.

MediaPipe sau này vẫn có thể được sử dụng như:

- một điểm chuẩn;
- một nhà cung cấp thay thế;
- một nhà cung cấp thay thế;
- so sánh về chất lượng pha trộn/mốc.

Kiến trúc không được làm cho OpenSeeFace trở thành vĩnh viễn hoặc không thể thay thế.

---

<a id="target-architecture"></a>

## Kiến trúc mục tiêu

Giữ mã theo dõi upstream tách biệt khỏi logic nhận thức do Angela sở hữu.

Bố cục khái niệm:

```text
Angela/
├── third_party/
│   └── openseeface/
│       ├── LICENSE
│       ├── Licenses/
│       ├── models/
│       └── upstream source...
│
└── packages/angela-cli/src/
    └── perception/
        ├── camera/
        ├── face/
        ├── affect/
        └── context/
```

Các thành phần logic được đề xuất:

```text
CameraSource
     ↓
FacePerceptionProvider
     ↓
OpenSeeFaceAdapter
     ↓
RawFaceObservation
     ↓
TemporalSmoother
     ↓
AffectEngine
     ↓
AffectState
     ↓
CameraContextProvider
     ↓
Angela Context / prompt
```

Tên thư mục chính xác có thể thay đổi để phù hợp với repo.

---

<a id="process-boundary"></a>

## Ranh giới quy trình

OpenSeeFace dựa trên Python trong khi Angela CLI là TypeScript/Node-oriented. Không trộn trực tiếp các phần bên trong Python vào các tệp CLI ngẫu nhiên.

Đối với V1, hãy sử dụng ranh giới **quy trình sidecar cục bộ** trừ khi kiến ​​trúc hiện tại đã có cơ chế subprocess/provider tốt hơn.

Thiết kế đề xuất:

```text
Angela CLI (TypeScript)
        │
        │ spawn
        ↓
Angela camera worker (Python)
        │
        ↓
OpenSeeFace vendored source
```

Giao tiếp nên sử dụng giao thức có cấu trúc nhỏ như JSON được phân tách bằng dòng mới trên stdin/stdout.

Ví dụ sự kiện worker:

```json
{
  "type": "face_observation",
  "timestamp": 1792188000000,
  "faceDetected": true,
  "confidence": 0.93,
  "headPose": {
    "yaw": -5.2,
    "pitch": 2.1,
    "roll": 0.8
  },
  "features": {
    "eyeOpenLeft": 0.87,
    "eyeOpenRight": 0.85,
    "mouthOpen": 0.08,
    "smileLike": 0.62
  }
}
```

Tên tính năng chính xác phải tuân theo những gì có thể được lấy từ trình theo dõi upstream.

Yêu cầu đối với ranh giới quá trình:

- xác thực các sự kiện worker đến;
- xử lý đầu ra không đúng định dạng mà không làm hỏng Angela;
- phát hiện lối ra worker;
- chỉ khởi động lại với chính sách thử lại có giới hạn;
- dừng rõ ràng quá trình máy ảnh và con trên lối ra CLI;
- không bao giờ in nhật ký gỡ lỗi worker vào luồng giao thức JSON;
- gửi nhật ký gỡ lỗi tới stderr hoặc kênh ghi nhật ký chuyên dụng;
- hiển thị các lỗi chẩn đoán rõ ràng khi thiếu phụ thuộc vào máy ảnh.

---

<a id="privacy-and-safety-requirements"></a>

## Yêu cầu về quyền riêng tư và an toàn

Đây là những yêu cầu của sản phẩm, không phải là chất đánh bóng tùy chọn.

<a id="camera-state"></a>

### Trạng thái máy ảnh

Máy ảnh phải là OFF theo mặc định.

Người dùng phải kích hoạt nó một cách rõ ràng thông qua luồng command/config, chẳng hạn như:

```text
/camera on
```

hoặc quy ước CLI hiện có tương đương.

Khi được bật, hãy hiển thị chỉ báo liên tục hoặc hiển thị rõ ràng, ví dụ:

```text
📷 Camera perception: ON
```

Cung cấp lệnh vô hiệu hóa rõ ràng:

```text
/camera off
```

<a id="raw-media"></a>

### Phương tiện thô

Theo mặc định:

- không lưu ảnh chụp màn hình;
- không lưu video;
- không tồn tại cây trồng mặt;
- không tải khung hình máy ảnh thô lên LLM/provider;
- không đặt byte hình ảnh vào phần lưu giữ conversation/session.

Xử lý các khung trong bộ nhớ và chỉ phát ra các quan sát dẫn xuất/trạng thái ảnh hưởng nhỏ gọn.

thu nhận dữ liệu khung thô sau này có thể chỉ được hiển thị dưới dạng tính năng gỡ lỗi rõ ràng với hành động rõ ràng của người dùng, không bao giờ âm thầm.

<a id="language-used-by-angela"></a>

### Ngôn ngữ được Angela sử dụng

Không cho phép bối cảnh máy ảnh đưa ra những tuyên bố có căn cứ xác đáng như:

```text
"Mày đang buồn."
"Mày đang tức giận."
"Mày đang nói dối."
```

Ưu tiên những cách diễn đạt nhẹ nhàng như:

```text
"Trông có vẻ đoạn này hơi khó theo, muốn tao giải thích cách khác không?"
"Hình như mày đang mất tập trung một chút. Nghỉ 5 phút không?"
```

Trạng thái bắt nguồn từ máy ảnh chỉ là bối cảnh tư vấn.

Không suy luận các chẩn đoán về sức khỏe tâm thần, tính cách, sự lừa dối, các thuộc tính được bảo vệ hoặc các đặc điểm nhạy cảm khác.

---

<a id="phase-1--vendor-and-run-openseeface-independently"></a>

## Giai đoạn 1 - Nhà cung cấp và vận hành OpenSeeFace độc lập

Trước khi tích hợp với logic hội thoại của Angela, hãy làm cho trình theo dõi hoạt động như một thành phần cục bộ biệt lập.

Nhiệm vụ:

1. Nhà cung cấp OpenSeeFace theo `third_party/openseeface/` trong khi vẫn bảo quản giấy phép.
2. Tài liệu đã nhập bản sửa đổi upstream chính xác.
3. Xác định bộ source/model/dependency yêu cầu tối thiểu.
4. Xác minh webcam thu nhận dữ liệu hoạt động trên nền tảng phát triển chính.
5. Xác minh tính năng theo dõi một khuôn mặt hoạt động ở độ trễ có thể sử dụng được.
6. Tránh thay đổi mã upstream trừ khi cần thiết.
7. Thêm một trình bao bọc worker nhỏ do Angela sở hữu bên ngoài thư mục upstream.

Đường dẫn worker do Angela sở hữu được đề xuất:

```text
packages/angela-cli/python/camera_worker/
```

hoặc một vị trí hiện có tương đương cho runtime phụ trợ.

worker chỉ nên hiển thị dữ liệu mà Angela thực sự cần chứ không phải toàn bộ API nội bộ của OpenSeeFace.

<a id="acceptance-for-phase-1"></a>

### Chấp nhận cho giai đoạn 1

Lệnh của nhà phát triển sẽ có thể in một luồng tương tự như:

```text
face=true yaw=-2.1 pitch=1.8 confidence=0.94
face=true yaw=-1.7 pitch=2.0 confidence=0.95
face=false
```

Chưa tích hợp LLM/context.

---

<a id="phase-2--typescript-provider--worker-manager"></a>

## Giai đoạn 2 - Trình quản lý TypeScript nhà cung cấp / worker

Tạo ranh giới TypeScript cho camera worker.

Giao diện khái niệm:

```ts
interface FacePerceptionProvider {
  start: () => Promise<void>
  stop: () => Promise<void>
  getLatestObservation: () => RawFaceObservation | undefined
  subscribe: (listener: (observation: RawFaceObservation) => void) => () => void
}
```

Thực hiện:

```text
OpenSeeFaceProvider
```

Trách nhiệm:

- sinh ra worker;
- giám sát vòng đời;
- phân tích JSONL;
- xác nhận lược đồ;
- giữ quan sát mới nhất;
- vạch trần các sự kiện;
- tắt máy duyên dáng;
- bề mặt health/status;
- tránh rò rỉ các chi tiết dành riêng cho Python vào các lớp cao hơn.

Thêm các bài kiểm tra đơn vị bằng cách sử dụng bản tóm tắt worker/process giả nếu có thể.

Không yêu cầu webcam vật lý cho các bài kiểm tra đơn vị tự động thông thường.

---

<a id="phase-3--raw-observation-model"></a>

## Giai đoạn 3 - Quan sát thô mô hình

Tạo một quan sát trung tính nhà cung cấp mô hình.

Ví dụ về hình dạng khái niệm:

```ts
interface RawFaceObservation {
  timestamp: number
  faceDetected: boolean
  confidence?: number

  headPose?: {
    yaw?: number
    pitch?: number
    roll?: number
  }

  landmarks?: FaceLandmarkSummary
  features?: FaceFeatureSummary
}
```

Không để lộ mọi mốc thô cho lớp LLM/context.

Quan sát thô mô hình có thể lưu giữ dữ liệu nội bộ phong phú hơn nếu cần để tính toán ảnh hưởng, nhưng các lớp cao hơn sẽ nhận được các bản tóm tắt chuẩn hóa.

Tính trung lập của nhà cung cấp rất quan trọng vì sau này Angela có thể thêm:

```text
OpenSeeFaceProvider
MediaPipeProvider
CustomAngelaProvider
```

mà không cần viết lại `AffectEngine`.

---

<a id="phase-4--temporal-smoothing"></a>

## Giai đoạn 4 - Làm mịn theo thời gian

Không phân loại tín hiệu từ một khung hình duy nhất.

Triển khai cửa sổ quan sát cuộn.

Yêu cầu:

- chiều dài cửa sổ có thể cấu hình;
- loại bỏ những quan sát cũ;
- gỡ bỏ trạng thái có mặt / mất mặt;
- từ chối các gai biểu thức rất ngắn;
- tư thế đầu ồn ào mượt mà;
- phơi bày thời gian cho trạng thái ổn định;
- làm cho time/clock có thể tiêm được cho các thử nghiệm xác định.

Hành vi ví dụ:

```text
smile-like for 80ms
→ ignore

smile-like for 1.5s
→ stable smile cue

look away for 200ms
→ ignore

look away for 6s
→ stable attention-away cue
```

Tránh các bài kiểm tra dựa trên giấc ngủ. Sử dụng timestamps/clock. giả

---

<a id="phase-5--angela-affect-engine-v1"></a>

## Giai đoạn 5 - Angela Affect Engine V1

Xây dựng logic này dưới dạng mã do Angela sở hữu, không phải bên trong nguồn OpenSeeFace được cung cấp.

Đầu ra V1 phải duy trì ở mức nhỏ có chủ ý.

Các tín hiệu cần thiết:

```text
face_present
neutral
smile
attention_screen
attention_away
unknown
```

Trạng thái công cộng được đề xuất:

```ts
type ExpressionCue
  = | 'neutral'
    | 'smile'
    | 'unknown'

type AttentionCue
  = | 'screen'
    | 'away'
    | 'unknown'

interface AffectState {
  facePresent: boolean
  expression: ExpressionCue
  attention: AttentionCue
  confidence: number
  stableForMs: number
  observedAt: number
}
```

Hình dạng kiểu chính xác có thể thích ứng với các quy ước mã hiện có.

<a id="rules"></a>

### Quy tắc

Chỉ sử dụng các tính năng có thể quan sát được.

Ví dụ:

- nhận diện khuôn mặt + tư thế đầu có thể cho biết hướng chú ý;
- Hình học mouth/cheek/landmark có thể góp phần tạo ra tín hiệu giống nụ cười;
- Bằng chứng weak/noisy trả về `unknown` thay vì bắt buộc một lớp.

Không thêm các danh mục V1 như:

```text
happy
sad
angry
fear
disgust
depressed
stressed
lying
```

Những nhãn đó tạo ra sự chắc chắn sai lầm và không cần thiết đối với người bạn đồng hành UX.

---

<a id="phase-6--personal-calibration"></a>

## Giai đoạn 6 - Hiệu chỉnh cá nhân

Sau khi đường cơ sở V1 hoạt động, hãy thêm hiệu chuẩn cá nhân tùy chọn.

Lý do: hình dạng khuôn mặt trung tính và biểu cảm tự nhiên của mỗi người dùng khác nhau.

Lưu lượng đề xuất:

```text
/camera calibrate
```

Angela yêu cầu người dùng cung cấp ngắn gọn:

1. Mặt normal/neutral;
2. nụ cười tự nhiên;
3. nhìn về phía màn hình;
4. nhìn đi chỗ khác.

Theo mặc định, store chỉ lấy các thông số hiệu chuẩn chứ không phải hình ảnh.

Dữ liệu hiệu chuẩn có thể có (khái niệm, không thể thực hiện được TypeScript):

```text
interface AffectCalibration {
  neutralFeatureBaseline: ...
  smileThresholdAdjustment: number
  screenYawCenter: number
  screenPitchCenter: number
  calibratedAt: string
}
```

Duy trì hiệu chuẩn bằng cách sử dụng các quy ước bền vững cục bộ an toàn hiện có của CLI.

Hiệu chuẩn phải là tùy chọn. Động cơ cần mặc định hợp lý.

---

<a id="phase-7--camera-commands-and-diagnostics"></a>

## Giai đoạn 7 - Lệnh và chẩn đoán máy ảnh

Thêm bề mặt quản lý hướng tới người dùng tối thiểu bằng cách sử dụng các quy ước lệnh CLI hiện có.

Khả năng được đề xuất:

```text
/camera status
/camera on
/camera off
/camera calibrate
/camera debug
```

`/camera debug` sẽ hiển thị trạng thái dẫn xuất, không phải khung thô theo mặc định.

Ví dụ:

```text
Camera: ON
Worker: healthy
Face: detected
Expression cue: smile
Attention: screen
Confidence: 0.78
Stable: 2.4s
FPS/sample rate: 10
```

Thêm chẩn đoán health/doctor khi thích hợp:

- Thiếu Python runtime;
- OpenCV không có sẵn;
- ONNX runtime không có sẵn;
- Thiếu tệp mô hình;
- quyền sử dụng máy ảnh bị từ chối;
- thiết bị camera không có sẵn;
- worker bị lỗi.

Đừng để lỗi camera làm hỏng cuộc trò chuyện bình thường của Angela.

---

<a id="phase-8--camera-context-provider"></a>

## Giai đoạn 8 - Bối cảnh máy ảnh nhà cung cấp

Khi nhận thức đã ổn định, chỉ hiển thị trạng thái nhỏ gọn cho đường dẫn context/prompt hiện có của Angela.

Khái niệm nhà cung cấp:

```ts
interface CameraContextProvider {
  getContext: () => CameraContext | undefined
}
```

Ví dụ về biểu diễn hướng về LLM:

```text
Visual context (camera, uncertain soft cues):
- face present
- expression cue: slight smile
- attention: screen
- confidence: medium
```

Đừng tiêm vào mọi khung hình.

Cung cấp trạng thái mới, ổn định hiện tại với mọi yêu cầu mô hình do người dùng liên quan khởi tạo trong khi máy ảnh là ON. Giữ các tín hiệu không thay đổi có sẵn trên các yêu cầu liên tiếp và trạng thái làm mới sau khi có kết quả của công cụ. Lấy mẫu và làm mịn theo thời gian cập nhật trạng thái độc lập với việc gửi yêu cầu. Không bao giờ sử dụng thời gian hồi chiêu để bỏ qua bối cảnh máy ảnh hiện tại. Sử dụng chính sách phản hồi đàm thoại riêng biệt để hạn chế những nhận xét không được yêu cầu lặp lại về tín hiệu.

Đừng để trạng thái máy ảnh tiêu tốn ngân sách ngữ cảnh lớn.

Đừng cố chấp mọi quan sát vào lịch sử trò chuyện.

---

<a id="phase-9--conversational-policy"></a>

## Giai đoạn 9 - Chính sách đàm thoại

Nhận thức của camera phải ảnh hưởng đến **cách Angela phản ứng** chứ không phải ảnh hưởng đến cuộc trò chuyện.

Ví dụ:

<a id="study-mode"></a>

### Chế độ học tập

Nếu các tín hiệu giống như sự không chắc chắn ổn định được thêm vào sau đó và độ tin cậy là đủ:

```text
"Đoạn này hơi khó theo à? Tao lấy ví dụ khác nhé?"
```

Nếu sự chú ý bị mất đi trong một khoảng thời gian kéo dài trong một buổi học tích cực:

```text
"Mất tập trung rồi à? Muốn nghỉ vài phút không?"
```

Nếu một nụ cười xuất hiện sau một câu trả lời đúng:

```text
"Ừ, đúng rồi đấy 😄"
```

<a id="general-conversation"></a>

### Hội thoại chung

Đừng bình luận về mọi thay đổi trên khuôn mặt.

Thêm chính sách thời gian hồi chiêu/đàm thoại để Angela không liên tục nói những câu như:

```text
"Mày đang cười."
"Mày nhìn đi chỗ khác."
```

Tính năng tốt nhất của máy ảnh thường không được nhìn thấy: Angela chỉ cần điều chỉnh tông màu hoặc quyết định xem có xác minh sự hiểu biết hay không.

---

<a id="phase-10--voice-integration"></a>

## Giai đoạn 10 - Tích hợp giọng nói

Chỉ sau khi bối cảnh camera và hệ thống giọng nói hiện tại ổn định.

Tín hiệu đa phương thức trong tương lai:

```text
conversation text
+
voice timing/prosody
+
camera affect cue
+
memory
+
current study/task context
```

Đừng xây dựng một bộ phân loại cảm xúc đa phương thức lớn trong cột mốc này.

Thay vào đó, hãy để Angela suy luận cấp cao hơn sử dụng một số tín hiệu bối cảnh không chắc chắn.

Ví dụ:

```text
User text: "Ừ tao hiểu rồi"
Camera: uncertain/attention-away cue (future)
Voice: hesitant (future)

Angela:
"Tao kiểm tra nhanh một câu nhé?"
```

Đừng nói:

```text
"Tao biết mày không hiểu."
```

---

<a id="sampling-and-performance"></a>

## Lấy mẫu và hiệu suất

Không xử lý camera ở mức tối đa webcam FPS trừ khi cần thiết.

Bắt đầu với chiến lược lấy mẫu có thể định cấu hình thực tế, ví dụ: khoảng 8–15 cập nhật nhận thức mỗi giây tùy thuộc vào hiệu suất của trình theo dõi.

Mục tiêu:

- giữ cho CLI phản hồi nhanh;
- không bỏ đói TTS/STT/LLM làm việc;
- tránh sử dụng CPU quá mức;
- Khung adapt/drop thay vì xây dựng hàng đợi không giới hạn.

Sử dụng ngữ nghĩa khung mới nhất khi thích hợp:

```text
camera produces frames faster than inference
→ discard stale queued frames
→ process newest available frame
```

Hiển thị các số liệu đơn giản trong chế độ gỡ lỗi:

- capture FPS;
- đã xử lý FPS;
- Độ trễ worker;
- số khung hình bị giảm;
- Tác động của CPU nếu thực tế.

---

<a id="error-and-lifecycle-behavior"></a>

## Lỗi và hành vi vòng đời

Hệ thống con nhận thức là tùy chọn.

Trò chuyện bình thường phải tiếp tục khi:

- không có webcam tồn tại;
- sự cho phép bị từ chối;
- Python worker không thành công;
- Tải mô hình không thành công;
- máy ảnh bị ngắt kết nối;
- OpenSeeFace gặp sự cố.

Hành vi dự kiến:

```text
Camera perception disabled: camera device unavailable.
Angela chat remains available.
```

Không bao giờ tạo vòng lặp sự cố.

Sử dụng có giới hạn restart/backoff nếu khởi động lại worker tự động được triển khai.

---

<a id="testing-requirements"></a>

## Yêu cầu kiểm tra

<a id="typescript-unit-tests"></a>

### Kiểm tra đơn vị TypeScript

Tối thiểu:

- Xác thực lược đồ sự kiện worker;
- Vòng đời nhà cung cấp;
- Hành vi va chạm của worker;
- xử lý quan sát mới nhất;
- smoothing/debounce;
- ngưỡng trạng thái chú ý;
- Ngưỡng trạng thái smile/neutral;
- tuyên truyền niềm tin;
- hết thời gian chờ ở trạng thái cũ;
- đầu ra bối cảnh-nhà cung cấp;
- hành vi vô hiệu hóa máy ảnh.

<a id="python-tests"></a>

### Kiểm tra Python

Trong trường hợp thực tế, hãy kiểm tra mã worker do Angela sở hữu riêng biệt với máy ảnh thật.

Sử dụng đầu ra recorded/mock landmark/tracker thay vì yêu cầu phần cứng webcam trong CI.

<a id="integration-tests"></a>

### Kiểm tra tích hợp

Thêm ít nhất một đường dẫn được điều khiển bởi mẫu kiểm thử:

```text
fixture observations
→ worker/provider boundary
→ smoothing
→ AffectEngine
→ CameraContextProvider
```

Đầu ra dự kiến ​​phải mang tính quyết định.

Không tạo CI tiêu chuẩn tùy thuộc vào tính khả dụng của webcam.

---

<a id="manual-acceptance-scenarios"></a>

## Kịch bản chấp nhận thủ công

V1 sẽ hỗ trợ các kịch bản developer/user sau:

1. Khởi động Angela với camera bị tắt - không có camera nào được truy cập.
2. `/camera on` - camera worker khởi động và trạng thái hiển thị cho biết ON.
3. Khuôn mặt được đưa vào chế độ xem — `facePresent=true` sau khi thoát ra.
4. Chế độ xem khuôn mặt rời khỏi - trạng thái biến mất sau khi gỡ lỗi.
5. Nụ cười tự nhiên được giữ trong chốc lát - dấu hiệu nụ cười ổn định xuất hiện.
6. Chuyển động khuôn mặt rất ngắn — bị bỏ qua vì tiếng ồn.
7. Nhìn về phía màn hình - sự chú ý trở thành screen/likely-screen.
8. Nhìn đi nơi khác trong thời gian dài - sự chú ý sẽ biến mất.
9. Camera bị ngắt kết nối khi đang chạy - Angela báo lỗi nhưng cuộc trò chuyện vẫn tiếp tục.
10. `/camera off` - Tài nguyên camera/process được phát hành.
11. Khởi động lại Angela — máy ảnh vẫn giữ nguyên OFF trừ khi sản phẩm hiện có cố tình duy trì cài đặt chọn tham gia rõ ràng.
12. Ngữ cảnh bắt nguồn từ máy ảnh không chứa hình ảnh hoặc khung hình thô.
13. LLM chỉ nhận được ngữ cảnh tín hiệu mềm nhỏ gọn.
14. Angela không coi suy luận cảm xúc là sự thật.

---

<a id="non-goals-for-v1"></a>

## ngoài phạm vi cho V1

Không mở rộng nhiệm vụ này thành:

- nhận dạng khuôn mặt;
- xác thực sinh trắc học;
- ước lượng tuổi;
- ước lượng giới tính;
- ước tính race/ethnicity;
- phát hiện nói dối;
- chẩn đoán sức khỏe tâm thần;
- suy luận y tế;
- quay video liên tục;
- video đám mây truyền dữ liệu liên tục;
- tư thế cơ thể/theo dõi bàn tay;
- Tích hợp toàn diện MediaPipe đầy đủ;
- Tích hợp HSEmotion;
- đào tạo mô hình học sâu tùy chỉnh;
- sự hiểu biết về bối cảnh xã hội của nhiều người;
- kích hoạt camera tự động mà không cần hành động của người dùng.

Những thứ này không cần thiết cho trải nghiệm đồng hành cùng Angela hiện tại.

---

<a id="optional-phase--hsemotion-benchmark"></a>

## Giai đoạn tùy chọn - Điểm chuẩn HSEmotion

Không thực hiện điều này cho đến khi V1 rule/landmark-based AffectEngine hoạt động.

Sau đó, nhà cung cấp thử nghiệm có thể đánh giá trình phân loại biểu thức đã được huấn luyện trước như HSEmotion dựa trên logic gợi ý của chính Angela.

Yêu cầu nếu tìm hiểu:

- giữ nó phía sau giao diện nhà cung cấp;
- đừng thay thế những tín hiệu mềm mại bằng những nhãn hiệu sự thật về cảm xúc cứng rắn;
- so sánh độ trễ và chi phí CPU;
- so sánh độ ổn định theo thời gian, không chỉ độ chính xác của một khung hình;
- giữ lại khả năng vô hiệu hóa nó hoàn toàn.

Thí nghiệm sẽ trả lời:

```text
Does this classifier materially improve Angela's conversational behavior?
```

Nếu không, hãy loại bỏ nó.

---

<a id="future-direction--angela-owned-perception"></a>

## Định hướng tương lai - Nhận thức thuộc sở hữu của Angela

Mục tiêu học tập lâu dài có thể là thay thế dần các thành phần upstream.

Sự tiến hóa có thể xảy ra:

```text
V1
OpenSeeFace tracker
→ Angela AffectEngine

V2
OpenSeeFace detection / landmarks
→ Angela feature extraction
→ Angela AffectEngine

V3
alternate/custom provider
→ Angela temporal model
→ Angela AffectEngine

V4
Angela-owned perception stack where useful
```

Không viết lại mã upstream ML đang hoạt động chỉ để sở hữu. Thay thế các thành phần khi có lý do rõ ràng về học tập, hiệu suất, tính di động hoặc chất lượng.

---

<a id="parallel-development-with-task--reminder-engine"></a>

## Phát triển song song với công cụ nhiệm vụ và nhắc nhở

Tính năng này phải an toàn để phát triển đồng thời với:

```text
docs/ai/context/task-reminder-engine-plan.md
```

Giữ các chỉnh sửa được chia sẻ ở mức tối thiểu.

Chi nhánh Camera sở hữu chủ yếu:

```text
third_party/openseeface/
perception/camera
perception/face
perception/affect
camera commands/context integration
```

Chi nhánh nhiệm vụ sở hữu:

```text
tasks
reminders
scheduler
notifications
```

Các khu vực chồng chéo tiềm năng:

- sổ đăng ký lệnh CLI chính;
- Vòng đời startup/shutdown;
- tập hợp bối cảnh trung tâm;
- README;
- gói phụ thuộc.

Khi có thể, hãy tách các phần tích hợp thành các cam kết nhỏ để giảm xung đột khi hợp nhất.

---

<a id="suggested-implementation-order"></a>

## Đề xuất trình tự thực hiện

Hãy tuân theo thứ tự này trừ khi kiến ​​trúc hiện tại có đề xuất khác:

1. Đọc `AGENTS.md` và kiểm tra `packages/angela-cli`.
2. Nhà cung cấp OpenSeeFace theo `third_party/openseeface/` với giấy phép được bảo lưu.
3. Ghi upstream revision/provenance.
4. Tạo máy ảnh Python worker tối thiểu xung quanh nguồn được cung cấp.
5. Xác minh worker theo cách thủ công bằng webcam.
6. Xác định giao thức JSONL worker đã được xác thực.
7. Triển khai TypeScript `OpenSeeFaceProvider`.
8. Thêm các bài kiểm tra nhà cung cấp lifecycle/unit.
9. Xác định `RawFaceObservation`.
10. Triển khai smoothing/debounce. tạm thời
11. Triển khai AffectEngine V1 (`neutral`, `smile`, `screen`, `away`, `unknown`).
12. Thêm các thử nghiệm dựa trên mẫu kiểm thử.
13. Thêm `/camera status|on|off|debug`.
14. Thêm chẩn đoán camera vào luồng doctor/health nếu thích hợp.
15. Triển khai `CameraContextProvider`.
16. Tích hợp các tín hiệu mềm nhỏ gọn vào đường dẫn Angela context/prompt hiện có.
17. Thêm hiệu chuẩn tùy chọn.
18. Cập nhật `packages/angela-cli/README.md` với hành vi được triển khai thực tế và các yêu cầu về dependency/setup.
19. Chạy tất cả các bước kiểm tra theo yêu cầu của `AGENTS.md`.

Không thêm cảm xúc nâng cao mô hình trước khi đường dẫn V1 ổn định.

---

<a id="suggested-commit-breakdown"></a>

## Phân tích cam kết được đề xuất

Giữ các cam kết có thể xem xét được. Một sự phân chia hợp lý là:

1. `chore(perception): vendor openseeface source`
2. `feat(cli): add local camera perception worker`
3. `feat(cli): add face perception provider`
4. `feat(cli): add temporal affect state engine`
5. `feat(cli): add camera controls and diagnostics`
6. `feat(cli): expose camera affect context to angela`
7. `feat(cli): add camera calibration`

Không trộn lẫn các bộ tái cấu trúc không liên quan vào các cam kết này.

---

<a id="definition-of-done"></a>

## Định nghĩa xong

Cột mốc Camera / Affect Engine ban đầu hoàn tất khi:

- Nguồn OpenSeeFace hiện diện trong `third_party/` với provenance/licenses được bảo tồn;
- trình theo dõi có thể chạy cục bộ thông qua trình bao bọc worker do Angela sở hữu;
- CLI kiểm soát vòng đời worker một cách an toàn;
- máy ảnh là OFF theo mặc định và yêu cầu kích hoạt rõ ràng;
- khung máy ảnh thô không phải là persisted/uploaded theo mặc định;
- hệ thống tạo ra các quan sát trung tính nhà cung cấp ổn định;
- AffectEngine phát ra ở mức tối thiểu sự hiện diện của khuôn mặt, trạng thái chú ý neutral/smile và screen/away/unknown;
- làm mịn theo thời gian ngăn ngừa hiện tượng nhấp nháy ở mức khung hình rõ ràng;
- lỗi camera không bao giờ làm gián đoạn cuộc trò chuyện thông thường của Angela;
- trạng thái máy ảnh nhỏ gọn có thể được đưa vào bối cảnh Angela mà không làm ngập việc sử dụng token;
- Angela coi các tín hiệu là bối cảnh không chắc chắn hơn là nhãn hiệu cảm xúc thực tế;
- các bài kiểm tra tự động bao gồm nhà cung cấp, làm mịn, trạng thái ảnh hưởng và hành vi ngữ cảnh mà không yêu cầu webcam thực;
- các kịch bản chấp nhận webcam thủ công đã được thực hiện;
- tài liệu mô tả cách thiết lập, hành vi bảo mật, lệnh và giới hạn;
- yêu cầu vượt qua kiểm tra typecheck/test/lint.

---

<a id="codex-execution-instruction"></a>

## Hướng dẫn thực thi Codex

Khi triển khai kế hoạch này, Codex không nên dừng lại sau khi tạo các tệp khung.

Nó nên:

1. trước tiên hãy kiểm tra kiến ​​trúc kho lưu trữ thực;
2. triển khai đường ống V1 có thể sử dụng từ đầu đến cuối;
3. cung cấp nền tảng upstream một cách sạch sẽ;
4. viết bài kiểm tra tự động;
5. chạy kiểm tra kho lưu trữ hiện hành;
6. khắc phục các sai sót do thực hiện;
7. cập nhật tài liệu để phù hợp với những gì thực sự hoạt động;
8. báo cáo bất kỳ mục nào có chủ ý để lại không đầy đủ và tại sao.

Giữ phạm vi tập trung vào lớp nhận thức AI-bạn bè/người bạn đồng hành học tập của Angela. Không mở rộng sang nền tảng giám sát, sinh trắc học hoặc chấm điểm cảm xúc chung.
