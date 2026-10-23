<a id="provider-inference"></a>

# Suy luận nhà cung cấp

`@angela/provider-inference` sở hữu các định nghĩa Angela nhà cung cấp trung tính runtime.

Sử dụng gói này để liệt kê nhà cung cấp tích hợp, tạo lược đồ cấu hình nhà cung cấp và tạo các phiên bản nhà cung cấp. Gói chạy trong Node.js và Trình duyệt runtime.

Không sử dụng gói này để duy trì cấu hình nhà cung cấp, chế độ xem Vue, trạng thái Pinia, xác thực hoặc Electron-native nhà cung cấp. Những lo ngại đó vẫn còn ở `@angela/stage-ui`.

<a id="use"></a>

## Sử dụng

```ts
import { getDefinedProvider, listProviders } from '@angela/provider-inference'

const provider = getDefinedProvider('openai')
const providers = listProviders()
```

Các định nghĩa chỉ dành cho trình duyệt, chẳng hạn như Web Speech API, tải trong Node.js. Tính khả dụng của chúng hook trả về `false` khi không có khả năng Trình duyệt được yêu cầu.

Mục gốc xuất các cài đặt trước Sherpaw mô hình và định nghĩa hàm tạo. Các plugin Vite có thể sử dụng `@angela/provider-inference/sherpaw-transcription/models` để chỉ tải siêu dữ liệu mô hình. Các cài đặt trước bao gồm ID ổn định, ngôn ngữ, loại trình nhận dạng, bản sửa đổi được ghim và URL artifact. Cả hai mục đều không tải xuống hoặc tải các tệp mô hình.

`createSherpawTranscriptionDefinition` sở hữu khả năng nhận dạng, dọn dẹp worker và là lựa chọn mô hình đầu tiên. host cung cấp mô hình, worker URL, chức năng tìm nạp và ngôn ngữ giao diện hiện tại. host cũng báo cáo liệu nó có chạy trên thiết bị di động hay không. Tiếng Trung và tiếng Anh mặc định là X-ASR trên desktop và Paraformer trên thiết bị di động. `stage-ui` cung cấp các tài nguyên này và thêm chế độ xem cài đặt Thính giác.

Sử dụng `@angela/stage-ui` để lưu cấu hình nhà cung cấp, chế độ xem cài đặt Vue, trạng thái Pinia, xác thực và Electron-native nhà cung cấp. Không sử dụng gói này để quản lý những mối quan tâm về ứng dụng đó.

<a id="verify"></a>

## Xác minh

Chạy kiểm tra gói từ root workspace:

```text
pnpm -F @angela/provider-inference typecheck
pnpm -F @angela/provider-inference test:node
pnpm -F @angela/provider-inference test:browser
pnpm -F @angela/provider-inference build
```

<a id="generation-protocols"></a>

## Giao thức sinh nội dung

Cấu hình tương thích OpenAI và OpenAI chấp nhận `api: 'chat-completions' | 'responses'`. OpenAI mặc định là `responses`. OpenAI Tương thích mặc định là `chat-completions`. Các lựa chọn giao thức đã lưu được ưu tiên. Trang cài đặt nhà cung cấp hiển thị trường này dưới dạng bộ chọn giao thức API.

`ProviderDefinition` sở hữu cấu hình và tạo phiên bản. `getGenerationProvider(instance)` điều chỉnh các phiên bản Trò chuyện SDK tại ranh giới đó. `GenerationProvider.generation(model, options)` chọn một giao thức và trả về cấu hình yêu cầu của nó. Core-agent nhận giao diện duy nhất này và chiếu bối cảnh trực tiếp vào giao thức đã chọn. Mặc định giao thức và các công cụ native vẫn là chính sách thuộc sở hữu của nhà cung cấp. Thăm dò xác nhận sử dụng giao thức đã chọn. `generationProtocolDefinitions` sở hữu siêu dữ liệu hiển thị cho mọi giao thức. Lược đồ nhà cung cấp sử dụng `generationProtocolOptions` để giữ cho các nhãn bộ chọn nhất quán. Việc thêm giao thức yêu cầu loại yêu cầu và mục nhập siêu dữ liệu phù hợp. TypeScript báo cáo sổ đăng ký chưa hoàn chỉnh hoặc chuyển đổi yêu cầu nhà cung cấp.

```ts
const definition = getDefinedProvider('openai')
const provider = await definition.createProvider({
  apiKey: 'your-key',
  api: 'responses',
})
```

nhà cung cấp do người dùng định cấu hình gửi yêu cầu Responses trực tiếp đến điểm cuối được định cấu hình của họ bằng khóa API của riêng họ. Họ không yêu cầu thay đổi phụ trợ của Angela hoặc thanh toán Flux. nhà cung cấp chính thức mặc định là Responses và cho phép người dùng chọn Chat Completions.

OpenAI có công tắc `webSearch`, bị tắt theo mặc định. Giao thức được chọn phải là Responses. Việc kích hoạt tìm kiếm một cách rõ ràng sẽ gửi công cụ hosted đến điểm cuối OpenAI chính thức. nhà cung cấp xác nhận hỗ trợ mô hình. Điểm cuối tùy chỉnh không kế thừa khai báo công cụ này. Tên mô hình không bao giờ xác định hỗ trợ tìm kiếm. Tìm kiếm sử dụng khóa OpenAI đã định cấu hình và không yêu cầu đăng nhập Angela hoặc khóa Tavily.

<a id="model-metadata"></a>

## Siêu dữ liệu mô hình

OpenAI và OpenRouter sử dụng danh mục [model-bank](https://github.com/lobehub/lobehub/tree/canary/packages/model-bank) dành riêng cho nhà cung cấp của họ. Danh sách điểm cuối mô hình vẫn có thẩm quyền về tính khả dụng. Dữ liệu danh mục chỉ làm phong phú thêm ID mô hình chính xác trên điểm cuối phù hợp. Điểm cuối tùy chỉnh không nhận được siêu dữ liệu từ route chính thức. Không có yêu cầu danh mục trực tuyến hoặc bộ nhớ đệm riêng biệt. Nâng cấp phần phụ thuộc ngân hàng mô hình đã ghim để làm mới siêu dữ liệu.

`ModelInfo.metadata` sử dụng hợp đồng `AIChatModelCard` đã xuất khẩu của ngân hàng mô hình cho các khả năng, cài đặt và giá cả. Đơn vị tiền tệ và giá cố định, theo bậc hoặc tra cứu vẫn giữ nguyên. Giá danh mục là dữ liệu tư vấn, không phải báo giá thanh toán Flux. Khả năng tìm kiếm được báo cáo không chọn triển khai công cụ native.

Điều khiển OpenAI suy luận sử dụng mức nỗ lực và mục nhập mô hình chính xác từ danh mục được ghim. Các giá trị nỗ lực không được hỗ trợ sẽ bị bỏ qua. Đặc biệt, mô hình không có nỗ lực `none` sẽ giữ máy chủ của họ ở chế độ mặc định khi suy luận bị tắt. Xác thực sinh nội dung sử dụng mô hình đã được định cấu hình trước khi tham khảo danh sách mô hình điểm cuối.
