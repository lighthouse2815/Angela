<a id="local-camera-cues-for-angela-cli"></a>

# Tín hiệu camera cục bộ cho Angela CLI

Trạng thái: đã chấp nhận

<a id="existing-architecture"></a>

## Kiến trúc hiện có

`packages/angela-cli/src/bin/run.ts` sở hữu vòng lặp đầu cuối, lệnh gạch chéo, xử lý SIGINT/SIGTERM và dọn dẹp. `Chat.send` đã chấp nhận bối cảnh hệ thống chỉ yêu cầu cùng với các lượt hội thoại liên tục. `Context.prepare` giữ bối cảnh hệ thống trong quá trình nén và chỉ tóm tắt các lượt lịch sử. Các dịch vụ CLI đọc cài đặt môi trường, sử dụng Valibot ở ranh giới dữ liệu và báo cáo chẩn đoán cục bộ thông qua stderr. Các thay đổi của máy ảnh sử dụng một nhánh riêng biệt từ đường cơ sở CLI rõ ràng.

<a id="decision"></a>

## Phán quyết

Giữ nhận thức của máy ảnh bên trong gói CLI mà không có bộ lập lịch, lời nhắc hoặc khớp nối desktop. Sử dụng nguồn OpenSeeFace làm mặt nhà cung cấp có thể thay thế. Nhà cung cấp cây gốc hoàn chỉnh thông qua cây con Git, bao gồm giấy phép và mô hình. Ghi lại bản sửa đổi upstream trong `third_party/README.md` và siêu dữ liệu cam kết cây con.

```text
Terminal /camera on
  -> Camera session owner
    -> OpenSeeFaceProvider
      -> Python worker -> latest-frame capture -> vendored Tracker
      <- validated derived JSONL
    -> provider-local Eventa observation event
    -> AffectEngine -> rolling window + independent debouncers
    -> CameraContextProvider -> request-only context -> Chat.send -> model
```

Python sidecar sử dụng JSONL transport của gói vì trình theo dõi chạy bằng Python. Node route đã xác thực các quan sát transport thông qua bối cảnh Eventa với hợp đồng được nhập tập trung. Mỗi nhà cung cấp sở hữu bối cảnh Eventa của nó. Phiên bản camera không bao giờ chia sẻ quan sát. Không có quy trình, đồng hồ hoặc khung vòng đời nào thay thế quyền sở hữu hiện tại của CLI mô hình.

<a id="runtime-and-lifecycle"></a>

## runtime và vòng đời

Worker Python có môi trường CPU riêng, đã khóa phiên bản trong `python/camera-worker`. Tệp thực thi ONNX Runtime 1.9 từ upstream không chạy trên kernel này vì yêu cầu ngăn xếp có quyền thực thi. Angela dùng Python 3.11, NumPy 1.26.4, ONNX Runtime 1.23.2 và OpenCV 4.11.0.86 không có giao diện. Mã nguồn và lockfile upstream được giữ nguyên. Không cần vá tệp thực thi hoặc thay đổi cơ chế bảo vệ kernel.

Chỉ `/camera on` tạo quy trình nhà cung cấp. Cài đặt chọn đường dẫn và tốc độ mẫu runtime nhưng không bao giờ kích hoạt thu nhận dữ liệu. Sự sẵn sàng đòi hỏi một thu nhận dữ liệu thành công và suy luận. Khởi động có thời gian chờ 30 giây. thu nhận dữ liệu ghi đè lên một khe khung. Suy luận mặc định là 10 mẫu mỗi giây và loại bỏ các khung cũ đã xếp hàng đợi. Quá trình dọn dẹp thiết bị chạy trong khối `finally` của worker. Việc dọn dẹp CLI dừng hoạt động ở giai đoạn con trước khi phát hành các dịch vụ khác. Tắt máy cho phép SIGTERM một giây, sau đó gửi SIGKILL. Lỗi worker và thời gian chờ phát trực tiếp 5 giây sẽ vô hiệu hóa ngữ cảnh. Khởi động lại yêu cầu một `/camera on` rõ ràng khác. Thông báo tình trạng xuất hiện giữa đầu vào prompt. `/camera debug` hiển thị trạng thái dẫn xuất và mã lỗi có giới hạn.

<a id="observable-cues"></a>

## Tín hiệu có thể quan sát được

worker chuyển đổi hệ tọa độ của OpenSeeFace thành tư thế tương đối phía trước. Phân rã Euler tương đối với ma trận xử lý các phép quay phía trước tương đương mà không có tín hiệu chú ý sai lầm. Hình học giống nụ cười sử dụng lực nâng ở góc miệng so với chiều rộng của miệng. Việc điều chỉnh 3D không thành công sẽ bỏ qua tư thế và các tính năng thay vì tạo ra kết quả trung tính.

`AffectEngine` là nhà cung cấp trung tính. Nó triển khai sự hiện diện, biểu thức neutral/smile/unknown và sự chú ý của screen/away/unknown. Quy tắc cửa sổ cuộn, trình gỡ lỗi, độ tin cậy cổng kiểm tra và độ mới được ghi lại trong `src/perception/README.md`. Đối số đồng hồ cho phép kiểm tra xác định mà không cần ngủ. Khoảng cách lấy mẫu runtime thiết lập lại tính liên tục. Sự chú ý của màn hình gần đúng với hướng đầu. Nó không đo lường cái nhìn của mắt hoặc khả năng hiểu bài học.

<a id="privacy-and-conversation-policy"></a>

## Chính sách quyền riêng tư và hội thoại

Camera mặc định là OFF, kể cả sau khi khởi động lại hoặc tiếp tục phiên. Các khung vẫn còn trong quy trình Python và không được lưu trữ cũng như không được tải lên. Lược đồ quy trình nghiêm ngặt loại trừ phương tiện, mốc thô và trường nhận dạng. Đầu ra gỡ lỗi chỉ chứa các tín hiệu dẫn xuất và chỉ số hiệu suất.

Các tín hiệu mới, ổn định hiện tại nhập vào mọi yêu cầu mô hình do người dùng khởi tạo, bao gồm cả các yêu cầu sau kết quả của công cụ. Phân phối bối cảnh không có thời gian hồi chiêu. Các tín hiệu không thay đổi vẫn có sẵn cho đến khi cũ, yếu, không ổn định hoặc bị vô hiệu hóa. CLI sử dụng `resolveStep` hook hiện có để đọc trạng thái camera trước mỗi cuộc gọi SDK mô hình. Riêng `prepareConversation` chạy trước mỗi luồng SDK và không thể làm mới ngữ cảnh giữa tất cả các vòng công cụ trong luồng đó. Hệ thống yêu cầu prompt kết hợp bối cảnh nhân vật gốc và bối cảnh máy ảnh hiện tại. Bối cảnh nhiệm vụ và bộ nhớ vẫn duy trì sự độc lập của hệ thống. Chỉ prompt đi thay đổi. Lượt hệ thống của cuộc trò chuyện được lưu trữ vẫn không thay đổi.

Cơ hội phản ứng đàm thoại tách biệt với việc cung cấp trạng thái. `CameraContextProvider` track chỉ là cơ hội bình luận cuối cùng và phím gợi ý của nó. Các tín hiệu đã thay đổi cần mười giây giữa các cơ hội. Tín hiệu không thay đổi cần sáu mươi giây. Trong khoảng thời gian đó, yêu cầu vẫn chứa trạng thái nhỏ gọn hoàn chỉnh kèm theo hướng dẫn chống lại bình luận không được yêu cầu. Điều chỉnh giai điệu yên tĩnh hoặc tốc độ vẫn có sẵn. Những câu hỏi rõ ràng về tín hiệu có thể nhận được câu trả lời thận trọng. Chính sách track mang lại cơ hội, không phải bằng chứng cho thấy mô hình đã nhận xét. Nó không phân tích câu trả lời hoặc phân loại cảm xúc. Bối cảnh ủng hộ lời nói của người dùng và cấm các tuyên bố thực tế về cảm xúc, chẩn đoán, danh tính, đặc điểm nhạy cảm, sự hiểu biết hoặc lừa dối. mô hình có thể điều chỉnh tông màu hoặc tốc độ giải thích mà không cần nhận xét về từng thay đổi hình ảnh. Không có bối cảnh quan sát hoặc bối cảnh được chèn vào lịch sử phiên, tóm tắt, bộ nhớ hồ sơ hoặc bộ nhớ dự án. Các câu trả lời được tạo sẽ duy trì tính bền vững của cuộc trò chuyện bình thường.

<a id="v1-boundaries"></a>

## Ranh giới V1

Hiệu chuẩn cá nhân tùy chọn vẫn được trì hoãn cho đến khi đánh giá cơ bản trên máy ảnh thực. Sự kết hợp giọng nói timing/prosody và biểu cảm nâng cao mô hình vẫn là những cột mốc quan trọng sau này. Không có nhận dạng, xác thực sinh trắc học, theo dõi cơ thể, HSEmotion hoặc đào tạo mô hình tùy chỉnh. Việc sử dụng CPU không được đo lường. Báo cáo gỡ lỗi capture/processed FPS, độ trễ suy luận và khung hình bị rớt. Lệnh `--check` của worker cung cấp chẩn đoán phụ thuộc mà không cần mở máy ảnh. Lệnh `doctor` chung không khởi tạo camera runtime.

<a id="validation-on-2026-10-17"></a>

## Xác thực vào ngày 17-10-2026

- Bài kiểm tra đơn vị Python worker: 11 bài đã vượt qua mà không phụ thuộc vào webcam hoặc suy luận.
- Các bài kiểm tra TypeScript của máy ảnh: 33 bài đã đạt, bao gồm một quy trình con mẫu kiểm thử thực và các xác nhận mô hình request/persistence.
- CLI và i18n typecheck/build: đã vượt qua.
- bài kiểm tra i18n: 20 đã đạt.
- Bộ CLI đầy đủ: 163 đã đạt, hiện có một lỗi trong bộ nhớ cá nhân tự động Recall.
- Lỗi bộ nhớ tương tự tái tạo trên cam kết cơ sở `2991a5b` trong một worktree riêng biệt.
- Root `pnpm lint`: một lỗi chữ ký phương thức hiện có trong `docs/ai/context/task-reminder-engine-plan.md:310`, cùng với các cảnh báo hiện có.
- Các tệp tính năng vượt qua `moeru-lint` mà không có cảnh báo.
- Root `pnpm typecheck`: `stage-ui` đã vượt quá vùng heap mặc định của Node. Quá trình thử lại vùng heap lớn hơn đã dừng do áp lực bộ nhớ host.
- Khởi tạo và suy luận OpenSeeFace mô hình thực trên khung đen tổng hợp được truyền qua `worker.py --smoke`.
- Các lệnh CLI được xây dựng được thực hiện từ `/tmp`: trạng thái, bật thiết bị không khả dụng, lưu giữ chẩn đoán, tắt và thoát sạch.
- Không có thiết bị `/dev/video*` nào tồn tại trên host này. Chất lượng webcam trực tiếp, độ trễ có thể sử dụng và hành vi ngắt kết nối yêu cầu sự chấp nhận của phần cứng.

Các thử nghiệm không cần phần cứng bao gồm các sự cố, tình trạng ngừng hoạt động, giao thức không đúng định dạng, việc hủy, báo cáo tắt máy và hành vi thiếu thiết bị. Họ không chứng nhận độ chính xác của tín hiệu khuôn mặt đối với người dùng hoặc điều kiện ánh sáng.

Các lệnh được thực thi:

| Lệnh | Kết quả |
| --- | --- |
| `python3 -m unittest discover -s packages/angela-cli/python/camera-worker -p test.py` | 11 đã qua |
| `pnpm -F @angela/cli exec vitest run src/perception` | 33 đã qua |
| `pnpm -F @angela/cli test` | 163 đã vượt qua, một lần thất bại cơ bản |
| `pnpm -F @angela/i18n test` | 20 trôi qua |
| `pnpm -F @angela/cli typecheck` | Đã vượt qua |
| `pnpm -F @angela/i18n typecheck` | Đã vượt qua |
| `pnpm -F @angela/cli build` | Đã vượt qua |
| `pnpm -F @angela/i18n build` | Đã vượt qua |
| `pnpm lint` | Lỗi kế hoạch cơ bản được mô tả ở trên |
| `pnpm typecheck` | Vùng heap mặc định đã cạn kiệt trong stage-ui |
| `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck --concurrency=2` | Bị gián đoạn thủ công vì áp lực bộ nhớ |
| `packages/angela-cli/python/camera-worker/.venv/bin/python packages/angela-cli/python/camera-worker/worker.py --check` | Phụ thuộc và mô hình có sẵn |
| `packages/angela-cli/python/camera-worker/.venv/bin/python packages/angela-cli/python/camera-worker/worker.py --smoke` | Real mô hình đã xử lý khung đen tổng hợp |

Kiểm tra `moeru-lint` được nhắm mục tiêu bao gồm các nguồn CLI đã thay đổi, chuỗi i18n, README, mẫu kiểm thử và ADR này mà không có lỗi hoặc cảnh báo.

<a id="changed-files"></a>

## Tập tin đã thay đổi

Việc chỉnh sửa ngữ cảnh yêu cầu đã vượt qua tất cả 225 bài kiểm tra CLI, bản dựng CLI kiểm tra kiểu dữ liệu và CLI. Kiểm tra hồi quy bao gồm các yêu cầu liên tiếp, tín hiệu đã thay đổi, trạng thái cũ, OFF, phần tiếp theo của công cụ và nội dung tệp phiên. Không có thử nghiệm camera trực tiếp hoặc thay đổi ngưỡng nào thuộc về hiệu chỉnh này.

| Đường dẫn | Vai trò |
| --- | --- |
| `third_party/openseeface/**` | Hoàn thành các thông báo về nguồn upstream, mô hình và giấy phép không thay đổi |
| `third_party/README.md` | Sửa đổi, xuất xứ cây con, yêu cầu kiểm kê source/model |
| `.gitignore`, `eslint.config.ts` | Bỏ qua Python artifact cục bộ và giữ nguyên định dạng được cung cấp |
| `packages/angela-cli/package.json`, `pnpm-lock.yaml` | Tái sử dụng phần phụ thuộc danh mục Eventa hiện có và bao gồm các tệp nguồn worker |
| `packages/angela-cli/python/camera-worker/worker.py` | Bộ chuyển đổi thu nhận dữ liệu, OpenSeeFace, chẩn đoán, nhà sản xuất JSONL |
| `packages/angela-cli/python/camera-worker/test.py` | Các bài kiểm tra worker không cần phần cứng |
| `packages/angela-cli/python/camera-worker/pyproject.toml`, `uv.lock` | Khóa độc lập CPU runtime |
| `packages/angela-cli/python/camera-worker/README.md` | Thiết lập runtime và các lệnh độc lập |
| `packages/angela-cli/src/perception/observation.ts`, `observation.test.ts` | Giao thức, quan sát trung lập, hợp đồng Eventa và kiểm tra xác nhận |
| `packages/angela-cli/src/perception/openseeface-provider.ts`, `openseeface-provider.test.ts` | Các bài kiểm tra vòng đời của trẻ em, nhà cung cấp và lệnh camera |
| `packages/angela-cli/src/perception/affect-engine.ts`, `affect-engine.test.ts` | Làm mịn tạm thời và kiểm tra tín hiệu có thể quan sát được |
| `packages/angela-cli/src/perception/camera-context.ts`, `camera-context.test.ts` | Chính sách trạng thái nhỏ gọn, mới mẻ và bình luận riêng hiện nay |
| `packages/angela-cli/src/perception/camera.ts` | Chọn tham gia phiên, lệnh, thông báo tình trạng và thành phần |
| `packages/angela-cli/src/perception/pipeline.test.ts` | Kiểm tra tính bền vững và tích hợp quy trình với mô hình |
| `packages/angela-cli/src/perception/fixtures/worker.py`, `smile-screen.json` | Quy trình con thực mẫu kiểm thử không có phụ thuộc suy luận |
| `packages/angela-cli/src/perception/README.md` | Ngữ nghĩa miền và ngưỡng mặc định chính xác |
| `packages/angela-cli/src/bin/run.ts` | Các lệnh, chỉ báo, bối cảnh yêu cầu và nối dây vòng đời |
| `packages/i18n/src/cli.ts` | Tin nhắn và gợi ý lệnh tiếng Anh và tiếng Việt |
| `packages/angela-cli/README.md` | Thiết lập thực tế, hành vi bảo mật, lệnh, cài đặt và giới hạn |
| ADR này | Bản ghi kiến ​​trúc và xác nhận |
