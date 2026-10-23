<a id="provider-inference-extraction-specification"></a>

# Đặc tả trích xuất suy luận nhà cung cấp

Trạng thái: Đề xuất xem xét kiến ​​trúc

Giai đoạn: 1 của quá trình chiết nhà cung cấp

Gói mục tiêu: `@angela/provider-inference`

<a id="1-purpose"></a>

## 1. Mục đích

Thông số kỹ thuật này xác định trích xuất nhà cung cấp đầu tiên từ `@angela/stage-ui`.

Giai đoạn 1 trích xuất các định nghĩa nhà cung cấp từ `shared/ui/stage/src/libs/providers/providers`.

Gói này không được phụ thuộc vào các API lưu giữ dữ liệu của Vue, Vue Pinia hoặc Trình duyệt.

API dành riêng cho trình duyệt được cho phép khi nhà cung cấp cần chúng.

Gói phải tải trong môi trường kiểm tra Node.js và Trình duyệt.

Mỗi nhà cung cấp phải khai báo hoặc chứng minh runtime mà nó có thể thực thi.

Giai đoạn này giữ nguyên thiết kế định nghĩa nhà cung cấp hiện có trừ khi có thay đổi loại bỏ phần phụ thuộc bị cấm.

<a id="2-terms"></a>

## 2. Điều khoản

- **Định nghĩa nhà cung cấp** mô tả cấu hình, xác thực, khả năng và tạo nhà cung cấp.
- **Phiên bản nhà cung cấp** thực hiện một thao tác như văn bản sinh nội dung hoặc lời nói sinh nội dung.
- **cloud-api nhà cung cấp** gọi dịch vụ từ xa hosted.
- **local-api nhà cung cấp** gọi một dịch vụ chạy trên máy hoặc mạng của người dùng.
- **nhà cung cấp chạy cục bộ** chạy mô hình hoặc khả năng nền tảng trong ứng dụng hiện tại runtime.
- **nhà cung cấp di động** đã vượt qua các bài kiểm tra trong cả Node.js và Trình duyệt runtime.
- **nhà cung cấp chỉ dành cho trình duyệt** thực thi trong Trình duyệt nhưng không thực thi trong Node.js.
- **Bộ chuyển đổi runtime** cung cấp khả năng khác nhau giữa runtime.
- **nhà cung cấp đăng ký** store nhà cung cấp định nghĩa và trả về chúng theo mã định danh.

<a id="3-phase-1-goals"></a>

## 3. Mục tiêu giai đoạn 1

Giai đoạn 1 có các mục tiêu sau:

1. Tạo `providers/inference` dưới dạng gói workspace độc lập.
2. Trích xuất các định nghĩa nhà cung cấp không phụ thuộc vào tính bền vững của Vue, Vue Pinia hoặc Trình duyệt.
3. Cho phép API trình duyệt bên trong triển khai nhà cung cấp khi nhà cung cấp cần chúng.
4. Phân loại nhà cung cấp thành `cloud-api`, `local-api` hoặc `local-run`.
5. Xác minh sự hỗ trợ runtime của từng nhà cung cấp bằng các bài kiểm tra Node.js và Trình duyệt.
6. Sử dụng `vitest-plugin-fakemic` để chấp nhận đường ống ASR.
7. Giữ giao diện định nghĩa nhà cung cấp gần với hình dạng hiện tại của nó.
8. Giữ trạng thái UI, Pinia, tính bền vững và tập hợp ứng dụng trong stage-ui.

<a id="4-scope"></a>

## 4. Phạm vi

<a id="41-included"></a>

### 4.1 Bao gồm

Giai đoạn 1 bao gồm:

- Định nghĩa nhà cung cấp trong `shared/ui/stage/src/libs/providers/providers`.
- Sổ đăng ký nhà cung cấp trong `providers/registry.ts`.
- Các loại nhà cung cấp lõi mà định nghĩa nhà cung cấp di động hoặc Trình duyệt yêu cầu.
- Trình xác thực nhà cung cấp và các loại khả năng không phụ thuộc vào Vue hoặc Pinia.
- Các thử nghiệm nhà cung cấp sử dụng Node.js, Trình duyệt hoặc hàng giả runtime rõ ràng.
- Cấu hình thử nghiệm Cross-runtime và dành riêng cho trình duyệt.
- Xuất gói, cấu hình TypeScript và cấu hình bản dựng `tsdown`.

Gói có thể sử dụng các API trình duyệt như `window`, `navigator`, `MediaStream`, `SpeechRecognition`, `FileReader`, `Worker` và WebGPU.

Gói có thể sử dụng các API được chia sẻ như `fetch`, `URL`, `AbortSignal`, `ReadableStream`, `Response`, `Blob` và `ArrayBuffer`.

<a id="42-excluded"></a>

### 4.2 Bị loại trừ

Giai đoạn 1 loại trừ:

- Các thành phần Vue và Vue các composable.
- Đồng bộ hóa Vue Pinia store và Pinia.
- Tính bền vững của trình duyệt, bao gồm `localStorage`, IndexedDB, Bộ nhớ đệm API và quyền truy cập cookie.
- Triển khai native chỉ có điện tử.
- stage-ui store, xác thực, cấu hình máy chủ và phân tích.
- `shared/ui/stage/src/services/inference-service-providers.ts`.
- Việc triển khai runtime trong `shared/ui/stage/src/libs/inference`.
- Gói `@angela/testing-audio` đầy đủ dưới dạng phần phụ thuộc của gói lõi.

Giai đoạn 1 không thêm lớp tương thích cho đường dẫn nhập nhà cung cấp cũ.

<a id="5-runtime-policy"></a>

## 5. Chính sách runtime

<a id="51-forbidden-dependencies"></a>

### 5.1 Các phụ thuộc bị cấm

Gói mới không được nhập hoặc sử dụng:

- `vue`
- `vue-i18n`
- `pinia`
- `pinia-plugin-synced`
- `@angela/stage-ui`
- stage-ui store hoặc các mô-đun kiên trì
- `localStorage`
- `indexedDB`
- `caches`
- `document.cookie`
- Trình bao bọc bộ nhớ trình duyệt sử dụng các API này trong nội bộ

Chỉ nhập loại cũng được tính là phụ thuộc khi chúng nhập biểu đồ loại gói.

<a id="52-allowed-browser-apis"></a>

### 5.2 API trình duyệt được phép

API trình duyệt không phải là hạn chế trên toàn gói.

nhà cung cấp có thể sử dụng Trình duyệt API khi định nghĩa của nó tải an toàn trong Node.js và báo cáo tính khả dụng chính xác ở đó.

nhà cung cấp chỉ dành cho trình duyệt không được truy cập API của trình duyệt trong quá trình nhập mô-đun.

nhà cung cấp chỉ dành cho trình duyệt phải truy cập API bên trong chức năng sẵn có được bảo vệ hoặc bên trong thực thi nhà cung cấp.

Kiểm tra Node.js phải tải định nghĩa nhà cung cấp mà không xác định các phần tổng thể của Trình duyệt.

Bài kiểm tra Trình duyệt phải thực hiện nhà cung cấp với khả năng Trình duyệt giả mạo thực sự hoặc rõ ràng.

<a id="53-persistence-rule"></a>

### 5.3 Quy tắc kiên trì

Cấu hình nhà cung cấp vẫn còn trong ứng dụng host.

Gói nhà cung cấp nhận các giá trị cấu hình làm đầu vào chức năng.

Gói nhà cung cấp không lưu thông tin xác thực, lựa chọn mô hình, trạng thái xác thực hoặc trạng thái runtime.

<a id="6-runtime-classification"></a>

## 6. Phân loại runtime

Việc phân loại mô tả hành vi của nhà cung cấp.

Nó không yêu cầu trường mới trong `ProviderDefinition` trong Giai đoạn 1.

Việc phân loại sử dụng các thư mục nguồn `cloud` và `local` cố định.

<a id="61-cloud-api"></a>

### 6.1 Đám mây API

Đám mây API nhà cung cấp gọi các dịch vụ hosted.

Đám mây dự kiến ​​API nhà cung cấp bao gồm:

- `302-ai`
- `aihubmix`
- `aliyun-nls`
- `amazon-bedrock`
- `anthropic`
- `atlascloud`
- `azure-ai-foundry`
- `azure-openai`
- `byteplus`
- `byteplus-coding-plan`
- `cerebras-ai`
- `cloudflare-workers-ai`
- `comet-api`
- `deepseek`
- `elevenlabs`
- `featherless-ai`
- `fireworks-ai`
- `google-gemini-audio-speech`
- `google-generative-ai`
- `groq`
- `mimo`
- `mimo-audio`
- `minimax`
- `minimax-speech`
- `mistral-ai`
- `modelscope`
- `moonshot-ai`
- `n1n`
- `novita-ai`
- `nvidia`
- `openai`
- `openai-audio`
- `openai-compatible`
- `openpaths`
- `openrouter-ai`
- `openrouter-audio-speech`
- `perplexity-ai`
- `together-ai`
- `unspeech`
- `volcengine-coding-plan`
- `xai`
- `zai`

`official` cũng là một đám mây API nhà cung cấp theo hành vi.

Việc triển khai hiện tại của nó vẫn bị loại trừ vì nó phụ thuộc vào trạng thái máy chủ Vue, Pinia, xác thực và stage-ui.

Một số định nghĩa API trên đám mây cũng hỗ trợ điểm cuối cục bộ do người dùng chọn.

`openai-compatible` là một ví dụ.

`cloudflare-workers-ai` vẫn là một đám mây API nhà cung cấp. Tên của nó không có nghĩa là nó sử dụng Trình duyệt worker.

Cấu hình điểm cuối chứ không phải tên thư mục sẽ quyết định vị trí dịch vụ thực tế.

<a id="62-local-api"></a>

### 6.2 API cục bộ

API nhà cung cấp cục bộ gọi dịch vụ HTTP hoặc WebSocket cục bộ.

API cục bộ dự kiến ​​​​nhà cung cấp bao gồm:

- `index-tts-vllm`
- `lm-studio`
- `ollama`
- `player2-speech`
- `voicevox`

API nhà cung cấp cục bộ có thể chạy trong Node.js và Trình duyệt khi nó sử dụng transport tương thích.

Kiểm tra trình duyệt phải tính đến CORS và quyền truy cập mạng cục bộ.

CORS là một ràng buộc triển khai, không phải là sự phụ thuộc vào Vue hay tính bền vững.

Bộ thử nghiệm phải sử dụng transport giả để kiểm tra hợp đồng nhà cung cấp xác định.

Bộ phần mềm có thể sử dụng dịch vụ cục bộ trực tiếp trong một thử nghiệm chọn tham gia riêng biệt.

<a id="63-local-run"></a>

### 6.3 Chạy cục bộ

nhà cung cấp chạy cục bộ thực thi trong runtime hiện tại.

nhà cung cấp chạy cục bộ dự kiến ​​​​bao gồm:

- `browser-web-speech-api`
- `kokoro-local`
- `local-audio`
- `apple-speech`
- `speech-noop`

`browser-web-speech-api` chỉ dành cho Trình duyệt vì Node.js không cung cấp tính năng nhận dạng Giọng nói trên Web.

`kokoro-local` hướng đến Trình duyệt vì nó sử dụng WebGPU và bộ điều hợp suy luận dựa trên worker.

`local-audio` chứa các triển khai cục bộ của Trình duyệt và Điện tử.

`apple-speech` sử dụng triển khai native Electron.

`speech-noop` không có yêu cầu runtime bên ngoài.

Việc phân loại không có nghĩa là mọi nhà cung cấp chạy cục bộ đều được đưa vào gói di động.

Mỗi lần triển khai phải vượt qua phần phụ thuộc và kiểm tra runtime trước khi di chuyển.

<a id="7-folder-layout"></a>

## 7. Bố cục thư mục

Giai đoạn 1 sử dụng `cloud` và `local` làm thư mục nhà cung cấp cấp cao nhất.

Bố cục này là quyết định của Giai đoạn 1.

<a id="71-cloud-and-local-folders"></a>

### 7.1 Đám mây và thư mục cục bộ

```text
src/providers/
  cloud/
  local/
```

Thư mục `cloud` chứa đám mây API nhà cung cấp.

Thư mục `local` chứa API cục bộ và nhà cung cấp chạy cục bộ.

API cục bộ và nhà cung cấp chạy cục bộ có thể chia sẻ thư mục `local`.

Ma trận kiểm tra và phân loại nhà cung cấp phải phân biệt hai loại cục bộ này.

nhà cung cấp với các điểm cuối có thể định cấu hình sử dụng hành vi nhà cung cấp chính của chúng để đặt thư mục.

Ví dụ: `openai-compatible` có thể gọi điểm cuối cục bộ hoặc đám mây.

Đường dẫn thư mục của nó không xác định điểm cuối được cấu hình.

Không tạo các thư mục con `local-api` hoặc `local-run` trong Giai đoạn 1.

Chỉ thêm nhiều thư mục hơn trong thay đổi được xem xét về kiến ​​trúc sau này.

<a id="72-layout-rules"></a>

### 7.2 Quy tắc bố cục

Việc thực hiện phải tuân theo các quy tắc sau:

- Sổ đăng ký nhập các định nghĩa mà không có tác dụng phụ ẩn.
- Tải các định nghĩa chỉ dành cho trình duyệt mà không làm hỏng quá trình nhập Node.js.
- Ma trận thử nghiệm ánh xạ tới từng danh mục nhà cung cấp.

Tên thư mục là một trợ giúp tổ chức.

Tên thư mục không phải là hợp đồng khả năng runtime.

Định nghĩa nhà cung cấp không được chỉ lấy trường `kind` hoặc `category` để hỗ trợ bố cục thư mục.

Nếu sau này cần có danh mục có thể đọc được bằng máy, hãy thêm trường tùy chọn vào một thay đổi đã được xem xét kiến ​​trúc riêng biệt.

<a id="8-runtime-compatibility-verification"></a>

## 8. Xác minh khả năng tương thích runtime

Tuyên bố của người đứng đầu là chính xác theo hướng đối với hầu hết đám mây API và API nhà cung cấp cục bộ.

Tuyên bố này không đúng với mọi nhà cung cấp hiện tại.

Kiểm toán nguồn đã tìm thấy các nhóm này:

- Hầu hết HTTP nhà cung cấp sử dụng `@xsai`, `fetch`, `URL`, `Response` hoặc `ReadableStream`.
- Hầu hết HTTP nhà cung cấp không có tính năng nhập Vue hoặc Pinia runtime.
- Bài phát biểu trên web của trình duyệt yêu cầu khả năng của Trình duyệt.
- Kokoro cục bộ yêu cầu WebGPU và bộ điều hợp suy luận dựa trên worker.
- Apple Speech yêu cầu Electron IPC và plugin native.
- nhà cung cấp chính thức yêu cầu trạng thái máy chủ Vue, Pinia, xác thực và stage-ui.
- Aliyun NLS tạo WebSocket và cần quyết định Node transport.
- Âm thanh Mimo sử dụng `FileReader` và cần một thay đổi nhỏ về cách đọc tệp cho Node.js.
- Một số định nghĩa chỉ sử dụng cách nhập vue-i18n theo loại.

Kết quả runtime cuối cùng phải đến từ các cuộc thử nghiệm chứ không chỉ từ việc phân loại nguồn.

<a id="81-nodejs-test-requirements"></a>

### 8.1 Yêu cầu kiểm tra Node.js

Chạy mọi định nghĩa nhà cung cấp đã di chuyển trong dự án Node.js Vitest.

Dự án Node.js không được sử dụng môi trường Trình duyệt.

Dự án Node.js không được xác định `window`, `document`, `navigator`, `localStorage`, `indexedDB` hoặc `Worker`.

Đối với runtime nhà cung cấp kép, cấu hình thử nghiệm, tạo nhà cung cấp, trình xác thực và hành vi yêu cầu nhà cung cấp.

Đối với nhà cung cấp chỉ dành cho Trình duyệt, hãy kiểm tra độ an toàn khi nhập và `isAvailableBy` trong Node.js.

Đối với nhà cung cấp chỉ có Electron, hãy giữ nhà cung cấp bên ngoài gói di động.

<a id="82-browser-test-requirements"></a>

### 8.2 Yêu cầu kiểm tra trình duyệt

Chạy mọi định nghĩa nhà cung cấp đã di chuyển trong dự án Trình duyệt Vitest.

Sử dụng kho lưu trữ Playwright Trình duyệt nhà cung cấp.

Đối với runtime nhà cung cấp kép, hãy kiểm tra hành vi công khai tương tự như kiểm tra Node.js.

Đối với nhà cung cấp chỉ dành cho Trình duyệt, hãy kiểm tra khả năng của Trình duyệt và thực thi nhà cung cấp.

Đối với API trình duyệt không tồn tại trong không có giao diện Chrome, hãy sử dụng API giả mạo rõ ràng.

Không sử dụng tính kiên trì của Trình duyệt để chuẩn bị bài kiểm tra đơn vị.

<a id="83-runtime-result-categories"></a>

### 8.3 Loại kết quả runtime

Mỗi báo cáo thử nghiệm nhà cung cấp phải sử dụng một trong các kết quả sau:

- `node-and-browser`: Việc thực thi nhà cung cấp được thực hiện trong cả runtime.
- `browser-only`: nhà cung cấp tải trong Node.js và thực thi trong Trình duyệt.
- `node-only`: nhà cung cấp tải trong Trình duyệt và thực thi trong Node.js.
- `runtime-excluded`: nhà cung cấp vẫn nằm ngoài gói vì nó cần Electron, Vue, Pinia hoặc tính bền bỉ.

Giai đoạn 1 chấp nhận `browser-only` cho nhà cung cấp chẳng hạn như Web Speech.

Giai đoạn 1 dự kiến ​​​​`node-and-browser` cho đám mây HTTP API và các ứng viên API cục bộ.

<a id="9-minimal-provider-definition-changes"></a>

## 9. Thay đổi định nghĩa nhà cung cấp tối thiểu

Định nghĩa nhà cung cấp hiện tại vẫn là giao diện chính.

Giai đoạn 1 giữ các trường và hành vi này:

- `id`
- `name`
- `description`
- `nameLocalize`
- `descriptionLocalize`
- `tasks`
- `createProviderConfig`
- `createProvider`
- `extraMethods`
- `validationRequiredWhen`
- `validators`
- `capabilities`
- `requiresCredentials`
- `configuredBy`
- `business`

Những thay đổi sau đây là bắt buộc:

1. Thay thế `ComposerTranslation` bằng loại chức năng dịch đơn giản.
2. Giữ hình dạng ngữ cảnh `{ t }` hiện có cho các định nghĩa nhà cung cấp.
3. Di chuyển trường Vue `views` sang sổ đăng ký dạng xem stage-ui.
4. Giữ `isAvailableBy` làm runtime sẵn có hook hiện có.
5. Tiếp tục kiểm tra khả năng của Trình duyệt trong quá trình thực thi `isAvailableBy` hoặc nhà cung cấp.

Thay đổi trình dịch sẽ loại bỏ phần phụ thuộc loại vue-i18n.

Thay đổi chế độ xem sẽ loại bỏ sự phụ thuộc vào thành phần Vue.

Các hợp đồng tạo, xác thực, khả năng và phương thức bổ sung nhà cung cấp hiện tại không thay đổi.

Giai đoạn 1 không thêm trường danh mục nhà cung cấp.

Giai đoạn 1 không thêm vùng chứa phụ thuộc vào mọi định nghĩa nhà cung cấp.

Bộ điều hợp chỉ được thêm khi nhà cung cấp không thể chạy trên cả runtime đích mà không có bộ điều hợp.

<a id="91-mimo-audio-change"></a>

### 9.1 Thay đổi âm thanh Mimo

`providers/mimo-audio/index.ts` sử dụng `FileReader` làm đầu vào phiên âm.

Thay thế trình trợ giúp đó bằng `Blob.arrayBuffer()` và chuyển đổi base64 chéo runtime.

Thay đổi này loại bỏ lỗi thực thi Node.js.

Nó không thay đổi hình dạng định nghĩa nhà cung cấp.

<a id="92-aliyun-nls-change"></a>

### 9.2 Aliyun NLS thay đổi

`providers/aliyun-nls/provider.ts` tạo WebSocket toàn cầu.

Hỗ trợ trình duyệt WebSocket có sẵn trong Trình duyệt đích runtime.

Node.js cần bộ chuyển đổi WebSocket rõ ràng hoặc Node transport.

Quyết định về Giai đoạn 1 đang chờ xem xét kiến ​​trúc và kết quả kiểm tra Node.

Các mô-đun tiện ích token và URL có thể di chuyển độc lập khi biểu đồ nhập của chúng tách biệt.

<a id="93-official-provider-change"></a>

### 9.3 Thay đổi nhà cung cấp chính thức

Các định nghĩa nhà cung cấp chính thức vẫn có trong stage-ui trong Giai đoạn 1.

Các định nghĩa sử dụng trạng thái Vue và trạng thái phiên trò chuyện Pinia.

Họ cũng sử dụng cấu hình máy chủ và xác thực stage-ui.

Di chuyển chúng đòi hỏi một bộ điều hợp ứng dụng được xem xét.

Bộ điều hợp đó không phải là một phần của thiết kế lại định nghĩa nhà cung cấp cốt lõi.

<a id="10-restricted-parts"></a>

## 10. Các bộ phận bị hạn chế

Các phần sau không thể vào gói lõi nếu không có thay đổi riêng.

<a id="101-provider-barrel"></a>

### Thùng 10.1 nhà cung cấp

`providers/index.ts` nhập mọi nhà cung cấp để tìm tác dụng phụ.

Nó hiện đang tải các mô-đun Vue, Electron, suy luận cục bộ và Trình duyệt runtime cùng nhau.

Chia nó thành thùng runtime di động hoặc được phê duyệt và thùng stage-ui runtime.

Điểm vào gói gốc không được tải nhà cung cấp bị loại trừ.

<a id="102-vue-and-pinia-dependencies"></a>

### 10.2 Phụ thuộc Vue và Pinia

Các tệp sau chứa các phần phụ thuộc Vue hoặc Pinia bị cấm:

- `providers/official/index.ts`
- `providers/official/shared.ts`
- `providers/apple-speech/hearing-settings.vue`
- `providers/provider-definitions.test.ts`
- `providers/voicevox/define.test.ts`
- `providers/elevenlabs/index.ts`, thông qua việc sử dụng vue-i18n chỉ có loại
- `providers/openai-audio/index.ts`, thông qua việc sử dụng vue-i18n chỉ có loại
- `providers/unspeech/index.ts`, thông qua việc sử dụng vue-i18n chỉ có loại
- `providers/local-audio/index.ts`, thông qua việc sử dụng vue-i18n chỉ có loại

Việc nhập chỉ loại yêu cầu thay thế bằng loại trình dịch cốt lõi.

Quá trình nhập runtime Vue và Pinia yêu cầu quyền sở hữu stage-ui hoặc bộ chuyển đổi đã được đánh giá.

<a id="103-browser-persistence"></a>

### 10.3 Tính kiên trì của trình duyệt

Các định nghĩa nhà cung cấp không được nhập nhà cung cấp store hoặc các trình trợ giúp liên tục.

`shared/ui/stage/src/stores/providers/config.ts` vẫn còn trong stage-ui.

Nó sở hữu trạng thái Pinia và tính bền bỉ `useLocalStorage`.

Gói nhà cung cấp nhận cấu hình kết quả làm đầu vào.

Thiết lập `shared/tooling/testing-audio` hiện tại cũng sử dụng `localStorage` để chuẩn bị ứng dụng.

Việc sử dụng đó hợp lệ trong tích hợp bộ kiểm thử nhưng bị cấm trong gói nhà cung cấp.

<a id="104-apple-speech"></a>

### 10.4 Bài phát biểu của Apple

Các tệp sau vẫn còn trong stage-ui:

- `providers/apple-speech/index.ts`
- `providers/apple-speech/provider.ts`
- `providers/apple-speech/hearing-settings.vue`
- `providers/apple-speech/index.test.ts`

nhà cung cấp sử dụng Electron renderer IPC và plugin Apple Speech Electron.

Nó truy cập trạng thái nền tảng `window.electron.ipcRenderer` và native.

Chế độ xem sử dụng Vue và VueUse.

nhà cung cấp này là nhà cung cấp do Electron chạy cục bộ, không phải là Web và Node nhà cung cấp.

<a id="105-browser-web-speech"></a>

### 10.5 Bài phát biểu trên web của trình duyệt

`providers/browser-web-speech-api` có thể nhập gói sau khi biểu đồ loại sạch.

Việc sử dụng trình duyệt API được cho phép đối với nhà cung cấp này.

nhà cung cấp sử dụng hành vi phương tiện `window.SpeechRecognition` và Trình duyệt.

Node.js không cung cấp Nhận dạng giọng nói.

Kiểm tra Node phải tải định nghĩa và báo cáo hỗ trợ không có sẵn.

Bài kiểm tra Trình duyệt phải sử dụng triển khai Nhận dạng giọng nói giả mạo thực sự hoặc rõ ràng.

nhà cung cấp này là `browser-only`, không phải `runtime-excluded`.

<a id="106-kokoro-local-provider"></a>

### 10.6 Lỗi cục bộ nhà cung cấp

`providers/kokoro-local/index.ts` cần được xem xét trước khi di chuyển.

Nó sử dụng trạng thái `navigator.gpu` và stage-shared WebGPU.

Nó gọi bộ điều hợp suy luận stage-ui.

Bộ điều hợp đó sử dụng hành vi worker và mô hình runtime cục bộ.

Cho phép sử dụng trình duyệt API, nhưng việc nhập suy luận stage-ui không phải là phần phụ thuộc gói cốt lõi.

nhà cung cấp có thể di chuyển sau khi khả năng suy luận cục bộ có bộ điều hợp được sở hữu hoặc tiêm vào gói.

<a id="107-local-audio-providers"></a>

### 10.7 Âm thanh cục bộ nhà cung cấp

`providers/local-audio/index.ts` cần được xem xét trước khi di chuyển.

Nó chứa các triển khai cục bộ của Trình duyệt và Electron.

Nó sử dụng bộ nhớ thiết bị và kiểm tra WebGPU.

Nó sử dụng tính năng phát hiện nền tảng stage-shared và các mô-đun runtime âm thanh cục bộ.

Nhánh Trình duyệt của nó có thể nhập bản sửa đổi gói sau khi bộ điều hợp runtime bị cô lập.

Nhánh Electron của nó vẫn ở stage-ui.

<a id="108-mimo-audio-provider"></a>

### 10.8 Kịch câm âm thanh nhà cung cấp

`providers/mimo-audio/index.ts` có thể vào nhóm API trên đám mây sau khi trình trợ giúp `FileReader` thay đổi.

Trình trợ giúp hiện tại không có sẵn trong Node.js.

Thay đổi bắt buộc là chuyển đổi cục bộ sang đầu vào âm thanh.

Giao diện định nghĩa nhà cung cấp không cần thay đổi.

<a id="109-aliyun-nls-provider"></a>

### 10.9 Aliyun NLS nhà cung cấp

Các tệp sau cần có quyết định Node transport:

- `providers/aliyun-nls/provider.ts`
- `providers/aliyun-nls/session.ts`
- `providers/aliyun-nls/provider.test.ts`

nhà cung cấp tạo và quản lý các kết nối WebSocket.

Trình duyệt WebSocket được cho phép.

Node.js yêu cầu bộ điều hợp được đưa vào hoặc triển khai Node tương thích.

Giữ nhà cung cấp bên ngoài bộ `node-and-browser` cho đến khi quá trình kiểm tra bộ điều hợp vượt qua.

Các tệp sau có thể di chuyển dưới dạng mô-đun tiện ích khi biểu đồ nhập của chúng vẫn độc lập:

- `providers/aliyun-nls/token.ts`
- `providers/aliyun-nls/token.test.ts`
- `providers/aliyun-nls/utils.ts`

<a id="1010-nvidia-availability-dependency"></a>

### 10.10 Sự phụ thuộc vào tính khả dụng của NVIDIA

`providers/nvidia/index.ts` sử dụng trình trợ giúp stage-shared `isStageTamagotchi`.

Người trợ giúp đó đọc trạng thái môi trường Vite.

Gói mới không thể phụ thuộc vào trạng thái môi trường xây dựng ứng dụng để thực thi Node.js.

Chuyển quyết định về tính khả dụng sang stage-ui hoặc thay bằng hook không phụ thuộc runtime đã được xem xét.

Bản thân việc triển khai HTTP nhà cung cấp vẫn là một ứng viên API trên nền tảng đám mây.

<a id="1011-ui-metadata"></a>

### 10.11 Siêu dữ liệu UI

Các tệp sau vẫn còn trong stage-ui:

- `shared/ui/stage/src/libs/providers/metadata.ts`
- `shared/ui/stage/src/libs/providers/hearing-view.ts`

Mô-đun siêu dữ liệu sử dụng trình trợ giúp lược đồ Vue i18n và stage-ui.

Mô-đun chế độ xem thính giác sử dụng tính năng tiêm Vue và các tham chiếu được tính toán.

Các mô-đun này hiển thị hoặc chuẩn bị hành vi UI.

Chúng không thuộc lõi nhà cung cấp.

<a id="11-asr-acceptance-feasibility"></a>

## 11. Tính khả thi của việc chấp nhận ASR

Sử dụng `@angela/vitest-plugin-fakemic` để chấp nhận ASR là khả thi.

Plugin khởi động Playwright Web hoặc Electron runtime.

Nó cung cấp cho Chrome đầu vào micrô giả được hỗ trợ bằng tệp.

Do đó, nó có thể kiểm tra đường dẫn âm thanh thực từ đầu vào micrô đến đầu ra ASR.

Plugin không thay thế các bài kiểm tra đơn vị nhà cung cấp.

Nó không trực tiếp kiểm tra chức năng nhà cung cấp bị cô lập.

<a id="111-test-ownership"></a>

### 11.1 Kiểm tra quyền sở hữu

Duy trì khả năng chấp nhận đường truyền âm thanh đầy đủ trong `@angela/testing-audio`.

Gói đó đã sở hữu phần khởi động runtime, route, bộ chọn, chuẩn bị ứng dụng và quan sát âm thanh.

Cập nhật thiết lập nhà cung cấp của nó để nhập định nghĩa từ `@angela/provider-inference` sau khi trích xuất.

Không thêm `@angela/testing-audio` làm phần phụ thuộc của gói nhà cung cấp.

Gói nhà cung cấp chỉ có thể sử dụng `@angela/vitest-plugin-fakemic` làm phần phụ thuộc phát triển nếu sau này nó sở hữu runtime bộ kiểm thử dành riêng cho gói.

<a id="112-audio-fixtures"></a>

### 11.2 Âm thanh mẫu kiểm thử

Gói `testing-audio` hiện có chứa các WAV mẫu kiểm thử có thể sử dụng được này:

- `cases/long-leading-silence/input.test.wav`
- `cases/single-utterance-pipeline/input.test.wav`
- `cases/two-utterance-streaming/input.test.wav`

Sao chép các tệp WAV cần thiết vào mẫu kiểm thử thử nghiệm thuộc sở hữu gói khi bộ chấp nhận gói cục bộ cần chúng.

Sao chép các tập tin mà không sao chép ứng dụng `testing-audio` bộ kiểm thử.

Ghi lại đường dẫn nguồn và mục đích của mẫu kiểm thử trong tài liệu kiểm tra gói.

mẫu kiểm thử hiện tại bao gồm khoảng lặng dẫn đầu, một câu nói và truyền dữ liệu liên tục nhiều câu nói.

<a id="113-asr-test-layers"></a>

### 11.3 Lớp thử nghiệm ASR

Sử dụng ba lớp thử nghiệm:

1. Node.js nhà cung cấp kiểm tra việc xây dựng yêu cầu, phân tích cú pháp phản hồi, lỗi và xử lý luồng.
2. Trình duyệt nhà cung cấp kiểm tra API trình duyệt và hành vi runtime của trình duyệt.
3. Chấp nhận đường dẫn giả mạo cho micrô thực, tích hợp VAD, ASR và UI.

Sử dụng `*.audio.test.ts` cho các trường hợp chạy ở cả âm thanh được định cấu hình runtime.

Sử dụng `*.audio.web.test.ts` cho các trường hợp chỉ dành cho Trình duyệt.

Chỉ sử dụng `*.audio.electron.test.ts` cho các trường hợp Electron native.

Không sử dụng thiết lập bền vững `@angela/testing-audio` trong các thử nghiệm Node.js nhà cung cấp.

<a id="12-test-plan"></a>

## 12. Kế hoạch kiểm tra

<a id="121-registry-tests"></a>

### 12.1 Kiểm tra đăng ký

Kiểm tra đăng ký nhà cung cấp.

Kiểm tra tra cứu bằng mã định danh nhà cung cấp.

Kiểm tra danh sách nhà cung cấp xác định.

Kiểm tra xem điểm vào lõi không đăng ký Electron hoặc Vue nhà cung cấp bị loại trừ.

Kiểm tra các định nghĩa chỉ dành cho Trình duyệt thông qua sổ đăng ký cốt lõi mà không có toàn cục Trình duyệt trong Node.js.

<a id="122-provider-tests"></a>

### 12.2 Thử nghiệm nhà cung cấp

Kiểm tra việc tạo cấu hình cho mỗi nhà cung cấp đã di chuyển.

Kiểm tra xác nhận cấu hình.

Kiểm tra xác thực runtime bằng các phương thức vận chuyển xác định.

Kiểm tra việc tạo phiên bản nhà cung cấp.

Kiểm tra khả năng trò chuyện, phiên âm và lời nói đã được khai báo.

Kiểm tra mô hình và phát hiện giọng nói trong đó nhà cung cấp xác định các phương thức đó.

Sử dụng giả mạo tìm nạp rõ ràng cho HTTP nhà cung cấp.

Sử dụng giả mạo khả năng của Trình duyệt rõ ràng cho nhà cung cấp chỉ dành cho Trình duyệt.

Sử dụng bộ chuyển đổi WebSocket rõ ràng cho Aliyun NLS nếu nó được đưa vào gói.

<a id="123-cross-runtime-matrix"></a>

### 12.3 Ma trận chéo runtime

Chạy các dự án Node.js và Trình duyệt cho mọi nhà cung cấp được di chuyển.

Ghi lại một kết quả runtime cho mỗi nhà cung cấp.

Yêu cầu `node-and-browser` cho đám mây API và các ứng viên API cục bộ trừ khi nhà cung cấp có ngoại lệ runtime được ghi lại.

Yêu cầu `browser-only` cho nhà cung cấp chạy cục bộ dành riêng cho Trình duyệt.

Giữ nhà cung cấp chỉ dành cho Electron bên ngoài gói di động.

<a id="124-import-audit"></a>

### 12.4 Kiểm toán nhập khẩu

Quét nguồn nhập và khai báo đầu ra cho các gói bị cấm.

Quét mã nguồn để tìm API lưu trữ của trình duyệt.

Cuộc kiểm toán phải từ chối:

- `vue`
- `vue-i18n`
- `pinia`
- `pinia-plugin-synced`
- `localStorage`
- `indexedDB`
- `caches`
- `document.cookie`
- `@angela/stage-ui`
- stage-ui store và các mô-đun kiên trì

Quá trình kiểm tra phải cho phép các API trình duyệt được phê duyệt.

Quá trình kiểm tra cũng phải báo cáo các API chỉ dành cho trình duyệt để ma trận kiểm tra runtime bao gồm chúng.

<a id="125-workspace-checks"></a>

### 12.5 workspace kiểm tra

Chạy gói nhà cung cấp kiểm tra kiểu dữ liệu.

Chạy thử nghiệm gói nhà cung cấp Node.js.

Chạy thử nghiệm Trình duyệt gói nhà cung cấp.

Chạy dự án chấp nhận ASR với `@angela/vitest-plugin-fakemic`.

Chạy stage-ui kiểm tra kiểu dữ liệu.

Chạy kho lưu trữ kiểm tra kiểu dữ liệu.

Chạy lệnh lint kho lưu trữ.

<a id="13-migration-rules"></a>

## 13. Quy tắc di chuyển

Việc thực hiện phải tuân theo các quy tắc sau:

1. Di chuyển hợp đồng nhà cung cấp cốt lõi trước khi di chuyển các định nghĩa nhà cung cấp.
2. Thay thế loại Vue i18n bằng loại trình dịch trung tính runtime.
3. Giữ hình dạng bối cảnh `{ t }` để giảm các thay đổi của nhà cung cấp.
4. Di chuyển chế độ xem Vue sang sổ đăng ký chế độ xem stage-ui.
5. Chia thùng tác dụng phụ thành các thùng dành riêng cho runtime đã được phê duyệt.
6. Di chuyển đám mây API và các ứng viên API cục bộ sau quá trình kiểm tra runtime.
7. Chỉ di chuyển nhà cung cấp chỉ dành cho trình duyệt khi an toàn nhập Node.js đã vượt qua.
8. Giữ Electron nhà cung cấp trong stage-ui.
9. Giữ Pinia và sự kiên trì trong stage-ui.
10. Cập nhật nhập stage-ui trong một lần di chuyển.
11. Xóa các mục nhập nhà cung cấp cũ sau khi di chuyển.
12. Không thêm trường danh mục nhà cung cấp chỉ cho tổ chức thư mục.
13. Không ẩn phần phụ thuộc bị cấm đằng sau kiểm tra runtime.

Gói nhà cung cấp sở hữu các định nghĩa nhà cung cấp và sổ đăng ký của chúng.

stage-ui sở hữu UI, tính bền bỉ, xác thực, lắp ráp nền tảng và tích hợp Electron.

<a id="14-acceptance-criteria"></a>

## 14. Tiêu chí chấp nhận

Giai đoạn 1 hoàn tất khi tất cả các điều kiện đều đạt:

- `providers/inference` tồn tại dưới dạng gói workspace.
- Tải gốc gói trong Node.js mà không có toàn cầu Trình duyệt.
- Tải gốc gói trong dự án thử nghiệm Trình duyệt.
- Gói này không có phần phụ thuộc bền vững của Vue, Vue Pinia hoặc Trình duyệt.
- nhà cung cấp dành riêng cho trình duyệt sử dụng quyền truy cập runtime được bảo vệ.
- Mỗi nhà cung cấp được di chuyển đều có kết quả kiểm tra Node.js và Trình duyệt.
- Cloud API và các ứng viên API cục bộ vượt qua cả hai bài kiểm tra runtime hoặc có một ngoại lệ được ghi lại.
- nhà cung cấp chạy cục bộ chỉ dành cho trình duyệt vượt qua các bài kiểm tra hành vi của trình duyệt và các bài kiểm tra nhập Node.js.
- nhà cung cấp chỉ có điện tử vẫn còn trong stage-ui.
- `vitest-plugin-fakemic` xác thực đường dẫn ASR.
- Bộ chấp nhận ASR sử dụng mẫu kiểm thử từ bộ kiểm tra âm thanh hiện có hoặc bản sao tài liệu.
- Thiết kế định nghĩa nhà cung cấp chỉ thay đổi khi xóa Vue, quyền sở hữu chế độ xem hoặc bộ điều hợp runtime được yêu cầu.
- stage-ui sử dụng giao diện lõi nhà cung cấp mới.
- `inference-service-providers.ts` vẫn là dịch vụ cấu hình stage-ui.
- kiểm tra kiểu dữ liệu và lint pass cho kho lưu trữ.

<a id="15-later-phases"></a>

## 15. Giai đoạn sau

Các giai đoạn sau có thể giải quyết:

- Các thư mục con nhà cung cấp bổ sung sau khi xem xét kiến ​​trúc.
- Bộ chuyển đổi Node WebSocket dành cho Aliyun NLS.
- Bộ điều hợp suy luận cục bộ được đưa vào cho Kokoro.
- Triển khai Trình duyệt và Electron riêng biệt cho âm thanh cục bộ.
- Bộ điều hợp giọng nói native cho Apple Speech.
- Bộ chuyển đổi ứng dụng đã được đánh giá dành cho nhà cung cấp chính thức.
- Gói cấu hình nhà cung cấp riêng cho CRUD từ xa.
- Phát hành gói công khai và tài liệu gói bên ngoài.

Những thay đổi này yêu cầu giao diện mới hoặc bộ điều hợp runtime.

Họ không thay đổi hợp đồng nhà cung cấp Giai đoạn 1 mà không xem xét kiến ​​trúc.

<a id="16-fixed-decisions"></a>

## 16. Quyết định cố định

Các quyết định sau đây được ấn định cho Giai đoạn 1:

- Nguồn trích xuất là `shared/ui/stage/src/libs/providers/providers`.
- Các thư mục nhà cung cấp cấp cao nhất là `cloud` và `local`.
- `local-api` và `local-run` chia sẻ thư mục `local` trong Giai đoạn 1.
- Vue, Vue Pinia và tính kiên trì của Trình duyệt vẫn bị cấm.
- API dành riêng cho trình duyệt được cho phép.
- `inference-service-providers.ts` không di chuyển.
- Các định nghĩa nhà cung cấp giữ nguyên hình dạng hiện tại của chúng ở mức tối đa.
- Cả hai bài kiểm tra Node.js và Trình duyệt đều chạy cho nhà cung cấp đã di chuyển.
- `vitest-plugin-fakemic` xác thực hành vi của đường ống ASR.
- `testing-audio` WAV mẫu kiểm thử có thể được sao chép cho các thử nghiệm chấp nhận thuộc sở hữu gói.
- Thiết lập ứng dụng `testing-audio` không trở thành phần phụ thuộc của gói cốt lõi.
