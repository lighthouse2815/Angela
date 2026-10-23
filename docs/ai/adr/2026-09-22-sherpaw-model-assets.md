<a id="sherpaw-model-asset-lifecycle"></a>

# Vòng đời tài sản Sherpaw mô hình

Trạng thái: đã chấp nhận

<a id="decision"></a>

## Phán quyết

Siêu dữ liệu Sherpaw mô hình và logic nhận dạng trực tiếp trong `provider-inference/src/providers/local/sherpaw-transcription`. Danh mục sở hữu ID ổn định, ngôn ngữ được hỗ trợ, kiến ​​trúc nhận dạng, bản sửa đổi được ghim và vị trí artifact. nhà cung cấp sở hữu mỗi phiên worker. host cung cấp URL mô hình, tìm nạp nội dung và worker URL.

Plugin Vite hiển thị mọi mô hình được định cấu hình cho runtime. mô hình có thể sử dụng URL từ xa được ghim hoặc URL cục bộ. `bundledModels` chọn tệp xây dựng sản xuất. Nó là tập hợp con của `models`.

Theo mặc định, các URL mô hình artifact đến từ `https://huggingface.co`. Plugin chấp nhận tùy chọn `endpoint` và đọc `HF_ENDPOINT`, do đó quá trình triển khai có thể phân phát các bản sửa đổi được ghim tương tự từ một bản sao. Điểm cuối được định cấu hình áp dụng cho cả quá trình tải xuống và URL mà mô hình từ xa giữ ở runtime. Đường dẫn và bản sửa đổi artifact không thay đổi. Quá trình chính của Electron tải xuống desktop mô hình từ xa bên ngoài Vite. Bản dựng của nó giải quyết điểm cuối bằng `resolveModelEndpoint` của plugin, vì vậy các bản tải xuống desktop sử dụng cùng một bản sao với renderer.

Web và Pocket hiển thị mô hình từ xa và cài đặt mô hình đã chọn trong OPFS. Phát triển desktop cài đặt mô hình đã chọn trong thư mục dữ liệu người dùng ứng dụng. Quy trình phát hành desktop được thiết lập `SHERPAW_BUNDLE_MODELS=true` và gói X-ASR. mô hình khác vẫn ở xa. Vite viết lại các URL mô hình đã nhóm thành `airi-sherpaw://assets/` trong các bản dựng Electron. Quá trình chính phục vụ các tệp mô hình được đóng gói thông qua giao thức này. renderer `fetch()` không thể đọc cùng một tệp thông qua `file://`.

Plugin cũng hiển thị gói phát hiện từ khóa `kwsModel` từ `stage-ui/src/libs/voice/kws-model-info.ts`. Plugin chỉ cần gói ID, kho lưu trữ, bản sửa đổi và thư mục artifact. Theo mặc định, Electron và Pocket gói gói này và đọc nó từ bộ đệm của kho lưu trữ trong quá trình phát triển. Đó là khoảng 13 MB. desktop có thể đặt `SHERPAW_BUNDLE_KWS=false` để giữ gói từ xa trong quá trình phát triển và sản xuất. Quy trình chính của Electron cài đặt các gói từ khóa từ xa trong dữ liệu người dùng thông qua cùng một kho lưu trữ với các gói phiên mã. Hồ sơ này bắt đầu trò chuyện API mà không cần tải xuống gói từ khóa tại thời điểm xây dựng. Mặc định vẫn gói gói. Web hiển thị điều khiển từ xa URL được ghim của nó. Kho lưu trữ nội dung renderer mô hình cài đặt nó trong OPFS khi chuẩn bị phát hiện từ đánh thức lần đầu tiên. Trạng thái, việc hủy, mục nhập Cài đặt dữ liệu và `clear()` tuân theo phiên âm mô hình.

UI lấy các tùy chọn mô hình của nó từ các nội dung được host cung cấp. Nó hiển thị tên ngôn ngữ được bản địa hóa từ `supportedLanguages`. Nó không được sao chép danh sách ngôn ngữ trong các tệp dịch hoặc cung cấp mô hình mà host không hiển thị.

<a id="runtime-lifecycle"></a>

## Vòng đời của runtime

Tính khả dụng, cài đặt, lựa chọn và kích hoạt của mô hình là các trạng thái riêng biệt:

- Danh mục nói rằng mô hình tồn tại.
- Mô-đun tài sản host cho biết mô hình ở xa hoặc được đóng gói.
- Kho lưu trữ tài sản ghi lại xem mô hình từ xa có bị thiếu, tải xuống, cài đặt hay không.
- Cấu hình nhà cung cấp chọn mô hình ID.
- Người quản lý runtime sở hữu trình nhận dạng hoạt động và worker của nó.

Sherpaw transport hiện tại loại bỏ phiên worker của nó khi một phiên mã truyền dữ liệu liên tục kết thúc. Việc triển khai sau này phải thêm ranh giới runtime tồn tại lâu dài trước khi yêu cầu sử dụng lại bộ nhớ mô hình. Nó không được mô tả bộ nhớ đệm HTTP của trình duyệt dưới dạng tái sử dụng trình nhận dạng.

<a id="platform-storage"></a>

## Lưu trữ nền tảng

Web và Pocket store từ xa mô hình trong OPFS. WebView phải hỗ trợ `navigator.storage.getDirectory()` cho đường dẫn này. Electron store từ xa mô hình trong thư mục dữ liệu người dùng ứng dụng. Eventa báo cáo trạng thái và kiểm soát tải xuống. Giao thức `airi-model` phục vụ các tệp đã cài đặt cho renderer. Mã renderer không truy cập API hệ thống tệp Node.

Kho lưu trữ tài sản chung cung cấp các hoạt động sau:

```text
list()
inspect(modelId)
remove(modelId)
ensureAvailable(modelId)
open(modelId, fileName)
cancel(modelId)
clear()
subscribe(listener)
dispose()
```

Kho lưu trữ công bố trạng thái lưu trữ. Bộ điều hợp suy luận xuất bản riêng trạng thái worker. Xóa tất cả dữ liệu trong Cài đặt dữ liệu cuộc gọi `clear()`. Nó xóa mọi mô hình được lưu trữ, bao gồm cả mô hình mà danh mục không còn liệt kê nữa. Cài đặt Đảo trạng thái tài nguyên và Sherpaw của desktop đọc trạng thái lưu trữ. Các cặp tệp đã tải xuống chỉ được cài đặt sau khi cả hai tệp và điểm đánh dấu phiên bản được lưu trữ.

Khởi động không chờ tải xuống mô hình từ xa. Quá trình tải xuống bắt đầu khi nhận dạng cần mô hình hoặc khi người dùng khởi động nó trong cài đặt.

<a id="build-profiles"></a>

## Xây dựng hồ sơ

| Hồ sơ | mô hình từ xa | mô hình cục bộ |
| --- | --- | --- |
| Phát triển và phát hành web | Tất cả cấu hình mô hình | Không có |
| Phát triển desktop | Tất cả cấu hình mô hình | Không có |
| Kéo yêu cầu CI | Tất cả cấu hình mô hình | Không có |
| Phát hành desktop | Zipformer và đa ngôn ngữ | X-ASR trong gói ứng dụng |
| Kiểm tra đơn vị | Chỉ siêu dữ liệu mẫu kiểm thử | Không có |

Bảng hồ sơ mô tả phiên mã mô hình. Gói phát hiện từ khóa tuân theo bảng sau:

| host | Phát triển | Sản xuất |
| --- | --- | --- |
| Web | Cài đặt OPFS từ điều khiển từ xa được ghim URL | Cài đặt OPFS từ điều khiển từ xa được ghim URL |
| desktop | Bộ đệm kho lưu trữ thông qua Vite | Gói ứng dụng |
| desktop với `SHERPAW_BUNDLE_KWS=false` | Cài đặt vào dữ liệu người dùng trong lần sử dụng đầu tiên | Cài đặt vào dữ liệu người dùng trong lần sử dụng đầu tiên |
| Bỏ túi | Bộ đệm kho lưu trữ thông qua Vite | Gói ứng dụng |

Các công việc CI không đóng gói bản phát hành desktop sẽ không tải xuống bản phiên âm sản xuất mô hình. Bản dựng desktop tải xuống gói phát hiện từ khóa trừ khi `SHERPAW_BUNDLE_KWS=false`. Bản dựng bỏ túi luôn tải xuống nó. Các bản tải xuống sử dụng mô hình ID và ghim bản sửa đổi làm khóa lưu trữ.

<a id="failure-behavior"></a>

## Hành vi thất bại

Kích hoạt nhà cung cấp yêu cầu ít nhất một mô hình tiếp xúc với host. Tải xuống từ xa có thể không thành công do chính sách mạng, CORS hoặc hạn mức bộ nhớ. Sự thất bại vẫn còn có thể nhìn thấy được. nhà cung cấp không chuyển sang mô hình khác.

Việc chuyển đổi mô hình sẽ từ chối hoặc hoàn tất quá trình nhận dạng trong chuyến bay trước khi loại bỏ runtime cũ. Tải xuống một phần chưa được cài đặt. Các thay đổi về bản sửa đổi sẽ tạo ra một bản nhận dạng nội dung mới và không ghi đè lên bản sửa đổi cũ hơn trước khi xác thực thành công. Sau khi bản sửa đổi mới được cam kết, bộ lưu trữ sẽ xóa các bản sửa đổi cũ hơn của mô hình đó. Xóa mô hình sẽ xóa tất cả các bản sửa đổi của nó.

<a id="non-goals"></a>

## Ngoài phạm vi

Quyết định này không khẳng định rằng Sherpaw transport hiện tại vẫn duy trì bộ nhận dạng giữa các bản ghi. Các bản sửa đổi được ghim xác định nội dung nhưng danh mục hiện tại không có bản tóm tắt tệp để kiểm tra tính toàn vẹn của mật mã.

<a id="verification"></a>

## Xác minh

Các thử nghiệm bao gồm trạng thái kho lưu trữ, các cặp tệp hoàn chỉnh, tải xuống không đầy đủ và tính bền vững của OPFS với mẫu kiểm thử nhỏ. Các URL Electron được đóng gói, hỗ trợ OPFS của thiết bị, lỗi hạn ngạch và chuyển đổi runtime vẫn cần kiểm tra tích hợp.
