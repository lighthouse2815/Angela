<a id="sherpaw-models-for-vite"></a>

# Sherpaw mô hình cho Vite

Plugin này hiển thị các gói tải trước Sherpaw đã được ghim cho các ứng dụng Vite. host chọn các gói cục bộ riêng biệt để phát triển và xây dựng.

```ts
import { paraformerBilingualZhEn } from '@angela/provider-inference/sherpaw-transcription/models'
import { Sherpaw } from '@angela/vite-plugin-sherpaw'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [Sherpaw({
    models: [paraformerBilingualZhEn],
    developmentModels: [paraformerBilingualZhEn],
    bundledModels: [paraformerBilingualZhEn],
  })],
})
```

<a id="presets"></a>

## cài đặt trước

| Xuất từ ​​`@angela/provider-inference/sherpaw-transcription/models` | Ngôn ngữ | Định dạng nguồn | Kích thước trước khi nén |
| --- | --- | --- | --- |
| `paraformerBilingualZhEn` | Tiếng Trung, Tiếng Anh | Dữ liệu và siêu dữ liệu Sherpaw | Giới thiệu về 237 MB |
| `zipformerMultilingual` | Tiếng Ả Rập, Tiếng Anh, Tiếng Indonesia, Tiếng Nhật, Tiếng Nga, Tiếng Thái, Tiếng Việt, Tiếng Trung | Dữ liệu và siêu dữ liệu Sherpaw | Giới thiệu về 339 MB |
| `xAsrBilingualZhEnInt8` | Tiếng Trung, Tiếng Anh | Dữ liệu và siêu dữ liệu Sherpaw | Giới thiệu về 169 MB |

Plugin cũng chấp nhận gói phát hiện từ khóa. Angela ghim nó là `kwsModel` trong `@angela/stage-ui/libs/voice/kws-model-info`. Cặp tải trước của nó chứa bộ mã hóa, bộ giải mã, bộ nối và từ vựng token. Đó là khoảng 13 MB.

Tùy chọn `models` cần thiết sẽ kiểm soát những cài đặt trước mà runtime có thể sử dụng. Tải cài đặt trước từ xa theo yêu cầu. `developmentModels` chọn mô hình cục bộ để phát triển Vite. `bundledModels` chọn tệp cho bản dựng sản xuất. Đặt `cacheDir` để chia sẻ nội dung tải xuống giữa các ứng dụng:

```ts
import { paraformerBilingualZhEn, xAsrBilingualZhEnInt8, zipformerMultilingual } from '@angela/provider-inference/sherpaw-transcription/models'

Sherpaw({
  models: [paraformerBilingualZhEn, zipformerMultilingual, xAsrBilingualZhEnInt8],
  developmentModels: [paraformerBilingualZhEn],
  bundledModels: [paraformerBilingualZhEn],
  cacheDir: '../../.cache',
})
```

<a id="mirrors"></a>

### Gương

mô hình artifact đến từ `https://huggingface.co` theo mặc định. Một host không thể truy cập Hub đặt `HF_ENDPOINT`, cùng một biến `huggingface_hub` sẽ đọc và mọi ứng dụng sẽ chọn nó mà không thay đổi:

```shell
HF_ENDPOINT=https://hf-mirror.com pnpm dev:desktop
```

Thay vào đó, hãy chuyển `endpoint` để đặt URL cơ sở trong một cấu hình Vite:

```ts
Sherpaw({
  models: [paraformerBilingualZhEn],
  developmentModels: [paraformerBilingualZhEn],
  endpoint: 'https://hf-mirror.com',
})
```

Tùy chọn chiến thắng biến. Một dấu gạch chéo ở cuối được chấp nhận theo một trong hai cách.

Điểm cuối bao gồm cả lượt tải xuống và URL mà mô hình từ xa giữ ở runtime. Các đường dẫn artifact giữ lại kho lưu trữ và bản sửa đổi `moeru-ai` được ghim, do đó, một máy nhân bản chỉ phải phục vụ cùng một bố cục.

host tải xuống mô hình từ xa bên ngoài Vite gọi `resolveModelEndpoint` để có cùng URL cơ sở. stage Tamagotchi sử dụng nó để tải xuống trong quy trình chính của Electron.

Tất cả các cài đặt trước đều sử dụng các cặp dữ liệu và siêu dữ liệu đã xuất bản từ các bản sửa đổi Hugging Face được ghim trong kho `moeru-ai`. Plugin sao chép các cặp này mà không cần đóng gói lại các tệp ONNX. Giấy phép mô hình vẫn là giấy phép của kho nguồn của chúng.

Plugin tải các tệp cục bộ xuống bộ đệm trong phạm vi sửa đổi. Nó loại bỏ đầu ra `public/sherpaw` trước đó trước khi Vite bắt đầu. Bản dựng sản xuất chỉ thêm `bundledModels` vào biểu đồ tài sản Vite. Danh sách trống cho chế độ hiện tại không thực hiện tải xuống mô hình. Bộ đệm tải xuống vẫn tồn tại sau những thay đổi lựa chọn. Đường dẫn mặc định của nó là `.cache` liên quan đến root Vite.

`@angela/provider-inference/sherpaw-transcription/models` sở hữu các cài đặt trước phiên âm, bao gồm kiến ​​trúc nhận dạng và ngôn ngữ được hỗ trợ. stage UI sở hữu gói nhận dạng từ khóa. Plugin chỉ đọc thư mục ID, kho lưu trữ, bản sửa đổi và artifact của mỗi gói (`SherpawModelArtifacts`).

Lỗi tải xuống cục bộ khiến quá trình khởi động hoặc quá trình xây dựng dừng lại. Quá trình phát triển phục vụ `developmentModels` thông qua Vite. Các tệp từ xa giữ các URL Hugging Face được ghim của chúng và tải khi quá trình nhận dạng bắt đầu.

VAD mô hình của Angela có đường dẫn tải xuống riêng nên chỉ riêng plugin này không làm cho ứng dụng hoàn chỉnh hoạt động ngoại tuyến.

<a id="runtime-urls-and-remote-storage"></a>

## URL runtime và bộ nhớ từ xa

Plugin thay thế `@angela/vite-plugin-sherpaw/assets` bằng nhập URL cho mô hình đã chọn:

```ts
import { assets } from '@angela/vite-plugin-sherpaw/assets'

const model = assets['paraformer-zh-en']
```

Mỗi mục có các trường `data`, `metadata` và `source`. `source` là `remote` hoặc `bundled`. Vite phân giải các URL được nhóm cho cơ sở ứng dụng. host không có plugin sẽ nhận được một danh mục trống và không thể sử dụng nhà cung cấp này.

`?url&no-inline` giữ cả hai tệp trong biểu đồ nội dung. Với Basemove, bao gồm các tệp `.data` và `.metadata` và luôn bật tính năng xóa cục bộ. Basemove ghi lại các URL, tải tệp lên và xóa chúng khỏi thư mục triển khai. Bộ nhớ từ xa phải cho phép các yêu cầu của trình duyệt thông qua CORS.

Bản dựng phát hành điện tử giữ các bản sao cục bộ. Angela viết lại URL mô hình của họ thành `airi-sherpaw://assets/` trong `electron.vite.config.ts`. Quá trình chính phục vụ các URL này từ gói renderer. renderer `fetch()` không thể đọc cùng một tệp thông qua `file://`.

<a id="development-loading"></a>

## Tải phát triển

Các bản tải xuống plugin chỉ được định cấu hình `developmentModels` trước khi máy chủ phát triển Vite khởi động. Các tập tin bộ đệm hiện có được sử dụng lại. Angela Electron và stage Pocket sử dụng thư mục `.cache/sherpaw/<model-id>/<revision>/` của kho lưu trữ cho gói phát hiện từ khóa.

Vite chuyển đổi nội dung nhập URL được tạo thành URL phát triển cục bộ. Các tập tin bên ngoài ứng dụng gốc sử dụng `/@fs/` route của Vite. Sherpaw đọc mô hình đã chọn thông qua máy chủ đó khi quá trình nhận dạng bắt đầu. Basemove chỉ chạy trong quá trình xây dựng sản xuất.

Tất cả Angela host đều giữ các cài đặt trước phiên âm từ xa trong quá trình phát triển. Dịch vụ tài sản host mô hình cài đặt chúng khi nhận dạng cần chúng. desktop phát hành gói quy trình làm việc X-ASR. Các bản dựng CI thông thường giữ tất cả các cài đặt trước phiên âm ở xa. Electron và Pocket luôn gói gói phát hiện từ khóa. Web giữ nó ở xa. Kho lưu trữ nội dung renderer mô hình cài đặt nó trong OPFS khi chuẩn bị phát hiện từ đánh thức lần đầu tiên.
