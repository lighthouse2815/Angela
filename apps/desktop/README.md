<a id="stage-tamagotchi"></a>

# stage Tamagotchi

Ứng dụng Electron desktop cung cấp trò chuyện, giọng nói và các công cụ desktop của Angela.
Cửa sổ chính mở trực tiếp cuộc trò chuyện, không dựng avatar hoặc chạy hiệu ứng ánh sáng màn hình.
Desktop không khởi tạo model nhân vật và bộ tạo preview khi khởi động.
Các trang cài đặt avatar và công cụ Live2D không nằm trong định tuyến desktop.
Thanh tiêu đề giữ lựa chọn hồ sơ, lịch sử phiên, tắt giọng nói, ghim cửa sổ và cài đặt.
Phần phát giọng nói dùng chung với web qua `useSpeechOutput`, độc lập với avatar.
Mã và tài nguyên avatar dùng chung vẫn phục vụ web. Thay đổi này không loại bỏ toàn bộ dependency avatar khỏi bộ cài.

<a id="shared-local-configuration"></a>

## Cấu hình cục bộ được chia sẻ

desktop chia sẻ cài đặt nhà cung cấp trực tiếp và trò chuyện mô hình với CLI cũng như web được phục vụ cục bộ thông qua `~/.config/angela/config.json`. Đặt `ANGELA_CONFIG` trước khi khởi động ứng dụng để chọn tệp khác. Quá trình chính sở hữu quyền truy cập tệp thông qua Eventa IPC. Chỉ người lãnh đạo Pinia mới tiếp tục thực hiện các hành động cài đặt đã hoàn thành. Nhập nhà cung cấp trực tiếp hiện có một lần cho mỗi hồ sơ. Các chỉnh sửa bên ngoài được làm mới sau mỗi 1,5 giây. Phiên tài khoản và tùy chọn giao diện vẫn giữ nguyên với store hiện tại của họ. Xem [cấu hình cục bộ](../../shared/config/README.md) để biết hợp đồng tệp.

## Việc và lời nhắc

Mở biểu tượng danh sách trên thanh tiêu đề hoặc **Cài đặt → Việc và lời nhắc**.
Trang hỗ trợ tạo, sửa, hoàn thành, hủy, báo lại và lọc lịch sử theo trạng thái.
Lịch lặp hỗ trợ ngày, tuần, khoảng cách 1–52 và lựa chọn thứ trong tuần.
Ngày và giờ được diễn giải theo múi giờ IANA trong biểu mẫu.
Việc chỉ có ngày không có báo thức. Báo lại giữ lịch gốc và đặt giờ nhắc tạm thời.
Hoàn thành việc lặp ghi nhận một lần thực hiện và giữ lịch tiếp theo.

Electron main xác thực các lệnh qua Eventa và dùng `Tasks` của companion runtime.
Các thao tác quản lý không gọi model. Mỗi hồ sơ dùng thư mục task của chính nó.
Hồ sơ mặc định dùng chung task với CLI khi hai ứng dụng dùng cùng thư mục dữ liệu.
Trang đọc lại mỗi 10 giây khi hiển thị để nhận thay đổi từ chat hoặc tiến trình khác.
Lưu lỗi giữ nguyên bản nháp. Đổi hồ sơ bỏ qua các phản hồi thuộc hồ sơ trước.

Lời nhắc xuất hiện trong ứng dụng khi cửa sổ chính hiển thị và người dùng ngừng tương tác một phút.
Đồng hành chủ động và bộ nhớ không cần bật để nhận lời nhắc đã tạo rõ ràng.
Thoát ứng dụng dừng phân phối. Dịch vụ nền của CLI vẫn là cơ chế riêng.

```sh
pnpm exec vitest run --config apps/desktop/vitest.node.config.ts src/main/services/angela/companion-runtime/runtime.test.ts
pnpm -F @angela/desktop exec vitest run --project browser src/renderer/pages/settings/tasks/index.browser.test.ts
```

<a id="development"></a>

## Phát triển

Từ thư mục gốc của kho lưu trữ, hãy chạy `pnpm install`, sau đó là `pnpm dev:desktop`. Chạy `pnpm -F @angela/desktop build` để xây dựng ứng dụng.

<a id="local-model-files"></a>

## Các tệp mô hình cục bộ

Sherpaw tải các tệp mô hình từ xa vào thư mục dữ liệu người dùng ứng dụng. Quá trình chính cung cấp các tệp đã cài đặt cho renderer thông qua `airi-model`. Bản phát hành desktop bao gồm X-ASR đến `airi-sherpaw`. Cài đặt Sherpaw kiểm soát tải xuống từ xa. Đảo trạng thái tài nguyên hiển thị tiến trình truyền và lỗi.

<a id="computer-use"></a>

## Sử dụng máy tính

Trình soạn thảo trò chuyện desktop bắt đầu bằng cách bật **Sử dụng máy tính**. Tắt nó để gửi yêu cầu mà không có quyền truy cập desktop. Việc lựa chọn mang tính cục bộ đối với nhà soạn nhạc. Một nhà soạn nhạc mới bắt đầu với nó. Trong khi yêu cầu chạy, lựa chọn của nó bị khóa. Tắt nó đi trước khi gửi tin nhắn không được nhận các công cụ sử dụng máy tính.

Chỉ lựa chọn hiện tại mới cấp quyền truy cập, bao gồm cả các lần thử lại và chạy lại công cụ. Tin nhắn lịch sử không cấp quyền truy cập. Yêu cầu đã chọn sẽ nhận được `computer_use`, `computer_use_press_key`, `computer_use_paste_text`, `computer_use_windows`, `computer_use_read_image` và các công cụ thư mục học tập được mô tả bên dưới. Công cụ đầu tiên chấp nhận các đối số AUV, chẳng hạn như `["invoke", "window.list"]`. Sử dụng `["invoke", "--help"]` và trợ giúp dành riêng cho lệnh để khám phá các hoạt động được hỗ trợ. Công cụ hình ảnh trả về ảnh chụp màn hình dưới dạng nội dung hình ảnh mô hình. Nó chỉ chấp nhận PNG và JPEG artifact bên trong store sử dụng máy tính của ứng dụng. Sử dụng mô hình và nhà cung cấp hỗ trợ các lệnh gọi công cụ cho các tác vụ trực quan. Khi **Sử dụng tầm nhìn mô hình cho hình ảnh công cụ** bật, tầm nhìn mô hình sẽ đọc ảnh chụp màn hình trước tiên cho cuộc trò chuyện mô hình có nhà cung cấp không báo cáo đầu vào hình ảnh. Cuộc trò chuyện mô hình sau đó sẽ nhận được mô tả bằng văn bản. Nó có văn bản và bố cục hiển thị nhưng không có vị trí pixel. Sử dụng các lệnh AUV như `screen.findText` để lấy tọa độ.

Electron khởi động AUV SDK và CLI phù hợp theo yêu cầu, qua một đường ống có tên Unix socket hoặc Windows riêng. Nó tuần tự hóa các lệnh trên các cửa sổ, store artifact trong thư mục dữ liệu người dùng của ứng dụng và dừng daemon khi tắt ứng dụng. CLI chạy mà không cần shell. Đối số mô hình không thể thay đổi thiết bị, điểm cuối, chạy hoặc gốc lưu trữ. Các lối thoát khác 0 giữ lại chi tiết lỗi và đầu ra AUV dưới dạng lỗi công cụ. Mã thoát bằng 0 không chứng minh rằng đã xảy ra thay đổi UI dự định.

Trên macOS, cấp quyền Trợ năng và Ghi màn hình cho ứng dụng đang khởi chạy khi OS yêu cầu chúng. Một số hành động của ứng dụng cũng cần có quyền Tự động hóa. Nếu `app.probePermissions` báo cáo thiếu quyền ghi màn hình thì thu nhận dữ liệu chỉ có thể chứa nền desktop mặc dù mã thoát là 0. Các lệnh khả dụng phụ thuộc vào phần phụ trợ OS và AUV. Sử dụng tính năng này cho các ứng dụng native cục bộ. Nó không hiển thị cổng thiết bị từ xa hoặc thay thế dịch vụ `capabilities/computer-use` riêng biệt.

<a id="angela-browser"></a>

### Trình duyệt Angela

Cấu hình desktop MCP mới bao gồm `angela-browser`. Cấu hình hiện tại không thay đổi. Máy chủ cung cấp điều hướng, ảnh chụp nhanh khả năng truy cập, biểu mẫu, tab, tải lên, ảnh chụp màn hình, đầu ra PDF và gỡ lỗi trình duyệt. Cầu MCP hiện có phát hiện ra các công cụ này và đăng ký chúng với trò chuyện mô hình. Sử dụng mô hình hỗ trợ lệnh gọi công cụ.

Cài đặt Node.js với npm và `npx` trên desktop host. Máy chủ đầu tiên bắt đầu tải xuống runtime đã được ghim. Trình duyệt mặc định là Chrome. Cài đặt Chrome trước hành động đầu tiên của trình duyệt.

Đối với cấu hình hiện có:

1. Mở **Cài đặt → Mô-đun → MCP** và mở tệp cấu hình.
2. Chạy `pnpm -F @angela/desktop setup:browser /absolute/path/to/mcp.json` từ kho lưu trữ gốc.
3. Trong cài đặt MCP, áp dụng và khởi động lại máy chủ.
4. Kiểm tra xem `angela-browser` có chạy không và kiểm tra kết nối của nó có liệt kê các công cụ trình duyệt hay không.
5. Yêu cầu Angela mở một trang web, đọc nội dung và điền vào biểu mẫu.

Lệnh thiết lập sẽ bảo vệ các máy chủ khác và mọi mục nhập `angela-browser` hiện có, bao gồm cả các mục nhập bị vô hiệu hóa. Các công cụ trình duyệt sử dụng đường dẫn đăng ký MCP hiện có. Công tắc **Sử dụng máy tính** điều khiển riêng các công cụ native AUV. Tắt `angela-browser` trong cài đặt MCP để xóa quyền truy cập trình duyệt.

Trình duyệt sử dụng cấu hình tự động hóa liên tục. Đăng nhập vào bên trong trình duyệt đó để giữ lại phiên. Để kết nối phiên bản Chrome hiện có, hãy thêm `--cdp-endpoint` và điểm cuối cục bộ của nó vào đối số máy chủ. Đối với trình duyệt không có cửa sổ hiển thị, hãy thêm `--headless`. Giữ dữ liệu hồ sơ và các tệp riêng tư đã tải xuống bên ngoài Git.

runtime sử dụng gói `@playwright/mcp` đã xuất bản ở phiên bản `0.0.83` trong Apache-2.0. Gói của nó giữ lại các thông báo giấy phép của bên thứ ba cần thiết. Angela Browser là tên tích hợp.

<a id="literal-text-and-vietnamese"></a>

### Văn bản chữ và tiếng Việt

Sử dụng `computer_use_paste_text` cho văn bản chữ, bao gồm cả tiếng Việt, sau khi tập trung vào mục nhập dự kiến. Trên Niri với `AUV_LINUX_INPUT_BACKEND=uinput`, wl-clipboard cung cấp lựa chọn hệ thống và AUV gửi Ctrl+V. Cài đặt `wl-copy` và `wl-paste` từ [wl-clipboard](https://github.com/bugaevc/wl-clipboard). Văn bản di chuyển qua stdin, các đối số quy trình bên ngoài. Các máy tính để bàn uinput Linux khác vẫn giữ lại bộ chuyển đổi clipboard Electron. Đường dẫn này không cần cổng clipboard RemoteDesktop. Các chương trình phụ trợ khác sử dụng dán native AUV. Các hoạt động desktop chia sẻ một hàng đợi, do đó một lệnh gọi công cụ khác không thể làm gián đoạn trình tự dán. Bộ điều hợp clipboard host chỉ chấp nhận các định dạng văn bản thuần túy. Nó từ chối hình ảnh, HTML và các định dạng tùy chỉnh trước khi nhập. Nó khôi phục văn bản trước đó trừ khi bảng nhớ tạm thay đổi trong quá trình phân phối. Một bản sao người dùng mới được ưu tiên. Công cụ báo cáo việc gửi mà không tuyên bố rằng ứng dụng đã nhận được văn bản. Kiểm tra UI thu được.

<a id="native-window-selection-on-niri"></a>

### Lựa chọn cửa sổ native trên Niri

Trên Linux Niri, `computer_use_windows` liệt kê các cửa sổ bộ tổng hợp native và tập trung vào ID được trả về chính xác. Sử dụng chuỗi con tiêu đề để giới hạn kết quả cho ứng dụng dự định. Kết quả chứa tối đa 200 kết quả phù hợp. host chỉ kích hoạt chương trình phụ trợ này khi có Niri socket. Các máy tính để bàn khác sử dụng các lệnh AUV hiện có của chúng. ID Niri khác với ID trợ năng AUV. Không bao giờ chuyển Niri ID thành AUV `--target`. Sau khi lấy nét, chuyển `windowId` sang `computer_use_press_key`, lệnh nhập `computer_use` và `computer_use_paste_text`. Công cụ chính chấp nhận một phím hoặc phím tắt như `ctrl+1`, `ctrl+a` hoặc `ctrl+s` mà không có đối số CLI. host kiểm tra tiêu điểm của bộ tổng hợp ngay trước đầu vào native, sau khi khởi động daemon. Tiêu điểm đã thay đổi sẽ từ chối đầu vào. Dán bảo vệ cũng kiểm tra tiêu điểm trước khi chạm vào khay nhớ tạm. Các cuộc gọi chia sẻ cùng một hàng đợi desktop. Tiêu điểm xác nhận cửa sổ đã chọn mà không xác minh nội dung tài liệu của cửa sổ đó. Kiểm tra trạng thái ứng dụng kết quả. Các cuộc gọi hiện tại không có `windowId` vẫn giữ nguyên hành vi ở nền trước hiện tại của chúng.

<a id="native-development-build"></a>

### Xây dựng phát triển native

Nếu Linux CLI đi kèm báo cáo thư viện dùng chung bị thiếu, hãy xây dựng dựa trên các thư viện hệ thống:

```sh
pnpm -F @angela/desktop setup:computer-use
pnpm dev:desktop
```

Chạy các lệnh này từ kho lưu trữ gốc. Trước tiên hãy cài đặt Rust và [bản dựng phụ thuộc ](https://github.com/moeru-ai/auv/tree/v0.0.28#install-with-cargo).
Tập lệnh thiết lập xây dựng phiên bản CLI đã cài đặt từ thẻ Git phù hợp với tệp khóa upstream.
Nó sử dụng chế độ gỡ lỗi và một quy trình biên dịch để hạn chế sử dụng bộ nhớ.
With LLVM 22 or later, follow the [isolated libclang setup](../../docs/angela-setup.md#tương-tác-laptop) for the upstream Bindgen incompatibility.

Lựa chọn có thể thực thi theo thứ tự sau:

1. `AUV_BINARY_PATH`, khi được đặt thành đường dẫn tuyệt đối.
2. `.cache/auv/<installed-cli-version>/bin/auv` để phát triển khi tệp tồn tại. Windows sử dụng `auv.exe`.
3. CLI đi kèm. Các ứng dụng đóng gói sử dụng khả năng thực thi của nó bên ngoài ASAR.

Bộ đệm nằm ngoài Git. Bản nâng cấp CLI chọn thư mục bộ đệm mới và yêu cầu bản dựng native khác.

Gói desktop bao gồm nền tảng CLI dưới dạng phần phụ thuộc tùy chọn và giải nén tệp thực thi của nó khỏi ASAR. Đừng bỏ qua các phần phụ thuộc tùy chọn khi xây dựng trình cài đặt. Windows ARM64 và Linux không có CLI phù hợp trong phiên bản này.

<a id="learning-directory"></a>

## Thư mục học tập

Khi **Sử dụng máy tính** bật, hãy yêu cầu Angela đọc tài liệu học tập và lưu bản tóm tắt Markdown. `study_workspace_directory` mở bộ chọn thư mục native. Chỉ bộ chọn đó mới cấp quyền truy cập thư mục. Hành động `status` của nó sẽ kiểm tra việc lựa chọn. Hành động `clear` của nó sẽ thu hồi quyền truy cập và vô hiệu hóa bộ chọn đang chờ xử lý. Lựa chọn được chia sẻ trên các cửa sổ desktop và hết hạn khi ứng dụng thoát.

`study_workspace_list` liệt kê các thư mục con và tài liệu được hỗ trợ. Danh sách chứa tối đa 200 mục và quét tối đa 1.000 mục. `study_workspace_read` đọc các tệp UTF-8 `.md`, `.markdown` và `.txt` lên tới 256 tệp KiB. Nó cũng trích xuất văn bản từ các tệp `.pdf` lên tới 10 MiB và 1.000 trang thông qua [unpdf](https://github.com/unjs/unpdf). Kết quả PDF chứa đường dẫn tương đối, tổng số trang, văn bản trang được đánh số và cờ `truncated`. Số trang PDF bắt đầu từ 1 và đề cập đến các trang vật lý, không phụ thuộc vào nhãn in. `startPage` và `endPage` tùy chọn chọn phạm vi bao gồm tối đa 20 trang. Phạm vi mặc định chứa 10 trang từ `startPage` hoặc trang 1 khi vắng mặt, được giới hạn ở cuối tài liệu. Mỗi lần đọc PDF trả về tối đa 256 KiB văn bản được trích xuất. Yêu cầu ít trang hơn nếu giới hạn này cản trở việc đọc. Đọc thêm các phạm vi trước khi tóm tắt tài liệu đầy đủ. Phạm vi một phần được đặt `truncated` thành true. Cả hai công cụ đều chấp nhận đường dẫn tương đối trong thư mục đã chọn. Đường dẫn ẩn và liên kết tượng trưng bị từ chối. Văn bản tài liệu chuyển đến cuộc trò chuyện nhà cung cấp đã chọn làm tài liệu tham khảo. Nó không phải là nguồn hướng dẫn công cụ hoặc ký ức cá nhân. Các trang được quét yêu cầu OCR, không được hỗ trợ. Các trang không có văn bản có thể trích xuất sẽ tạo ra lỗi rõ ràng khi toàn bộ phạm vi được yêu cầu trống. Các tài liệu được bảo vệ bằng mật khẩu, tệp `.doc` cũ và tài liệu hình ảnh không được hỗ trợ.

Trích xuất DOCX sử dụng [Mammoth](https://github.com/mwilliamson/mammoth.js) với API chuyển đổi tài liệu được ghim và vô hiệu hóa quyền truy cập tệp bên ngoài. Các tệp DOCX hỗ trợ tối đa 10 MiB được nén, 20 MiB được mở rộng và 1.000 mục ZIP. Kết quả có `format: "docx"`, được đánh số `paragraphs` và trích xuất `warnings`. Đoạn văn chứa văn bản nội dung, bao gồm các tiêu đề tiêu chuẩn và các đoạn văn trong ô bảng. Các đoạn văn trống được loại trừ khỏi việc đánh số. Mỗi đoạn bao gồm văn bản Tiêu đề 1–9 hoặc Tiêu đề tiêu chuẩn gần nhất nếu có. Các kiểu Tiêu đề được đánh số cũng bao gồm cấp độ của chúng. Dữ liệu đoạn văn phù hợp với 256 KiB và 10.000 đoạn văn. Đầu ra quá khổ tạo ra lỗi thay vì đọc một phần. Đầu trang, chân trang, chú thích cuối trang, chú thích cuối, nhận xét và văn bản hình ảnh nằm ngoài nội dung được trích xuất. Số đoạn DOCX đề cập đến thứ tự trích xuất. Chúng không phải là số trang Word hoặc nhãn danh sách đánh số.

`study_workspace_search` tìm thấy một cụm từ theo nghĩa đen trong tài liệu hoặc đệ quy trong một thư mục. Sử dụng `path: "."` cho thư mục đã chọn. Khớp bỏ qua trường hợp chữ cái, giữ nguyên dấu và chấp nhận khoảng trắng trên các ngắt dòng. Các ký tự biểu thức chính quy vẫn giữ nguyên theo nghĩa đen. Mỗi tệp văn bản, trang PDF hoặc đoạn DOCX đóng góp tối đa một đoạn trích, kèm theo đường dẫn và vị trí tương đối của nó. Kết quả DOCX bao gồm số đoạn văn và tiêu đề gần nhất nếu có. Các cụm từ không kéo dài các đoạn DOCX riêng biệt. Đoạn trích chứa tối đa 600 ký tự. Tìm kiếm đọc các tệp cục bộ hiện tại và gửi đường dẫn, đoạn trích và trạng thái quét tới cuộc trò chuyện nhà cung cấp. Một cuộc gọi kiểm tra tối đa 200 đường dẫn được xếp hàng đợi, 50 thư mục, 50 tài liệu, 100 trang PDF và 500 đoạn DOCX. Văn bản tìm kiếm có ngân sách 2 MiB. Mỗi thư mục giữ lại các giới hạn danh sách hiện có. Giới hạn và các tệp không thể đọc được đặt `truncated`. Kiểm tra `skipped` trước khi xác nhận rằng nội dung bị thiếu. Mảng `pending` chứa các phạm vi để tìm kiếm tiếp theo với cùng một truy vấn. `startPage` của nó tiếp tục một PDF duy nhất. `startParagraph` của nó tiếp tục một DOCX duy nhất. Mảng `pending` và `skipped` chứa tối đa 20 mục mỗi mảng, vì vậy các danh sách này cũng có thể không đầy đủ. Các trích đoạn tìm kiếm không cấp ghi chú trích dẫn. Đọc tài liệu hoặc trang phù hợp trước khi giải thích đầy đủ hoặc trích dẫn nguồn đã lưu.

`study_workspace_save_note` tạo các tệp Markdown mới trong `Angela Notes` trong thư mục đó. Ghi chú chứa tối đa 128 KiB. Các tập tin hiện có không bao giờ bị ghi đè. Mảng `sources` tùy chọn chấp nhận tối đa 20 tham chiếu với `path` tương đối và PDF `page` hoặc DOCX `paragraph`. Bỏ qua cả hai trường vị trí cho tệp văn bản. Chỉ những tài liệu và vị trí được đọc trong quá trình lựa chọn thư mục hiện tại mới có thể trở thành trích dẫn nguồn. Công cụ này nối thêm các liên kết Markdown tương đối với các neo trang PDF. Nhãn trích dẫn DOCX chứa số đoạn văn và tiêu đề được ghi. Các liên kết của họ mở tệp nguồn mà không cần nhảy đoạn văn. Các trích dẫn được tính vào giới hạn kích thước ghi chú. Kết quả thành công bao gồm đường dẫn tương đối đã lưu và số byte UTF-8. Thay đổi thư mục chờ hoạt động tập tin hoạt động. Xóa quyền truy cập sẽ bảo tồn các ghi chú đã lưu. Các công cụ này sử dụng API hệ thống tệp Electron IPC và Node. Chúng không yêu cầu quyền đầu vào AUV hoặc desktop.

<a id="learning-review-reminders"></a>

## Nhắc nhở đánh giá học tập

Bật lời nhắc đánh giá desktop trong cài đặt Bộ nhớ dài hạn. Tùy chọn mặc định là tắt. renderer chính kiểm tra ký tự đã chọn mỗi phút trong khi ứng dụng chạy. Electron main chỉ chấp nhận các yêu cầu phân phối từ renderer đó và nhóm các bản ghi đến hạn vào một thông báo native. Thông báo chứa số lượng, không có nội dung học tập. Nhấp vào sẽ mở Trò chuyện. Các nhóm chính sao chép các yêu cầu và giữ lại các biên nhận thành công trong các lần thay đổi lãnh đạo renderer. Việc học store vẫn duy trì các biên nhận thành công cho mỗi ngày đến hạn. Tải lại không lặp lại lời nhắc đã ghi. Việc giao hàng thất bại và chưa được xác nhận vẫn có thể thử lại. Thông báo không hoàn thành việc đánh giá hoặc chạy sau khi thoát ứng dụng.

<a id="verification"></a>

## Xác minh

Kiểm tra phát giọng nói không cần avatar và điều khiển tắt tiếng:

```sh
pnpm exec vitest run --config shared/ui/stage/vitest.config.ts --project browser use-speech-output.browser.test.ts speech-output-control.browser.test.ts
pnpm -F @angela/desktop smoke:linux-window-render
```

Smoke mở Electron thật, kiểm tra ô chat và xác nhận cửa sổ chính không có canvas avatar.

Chạy bài đánh giá store, cài đặt, phân phối native và kiểm tra bộ đếm thời gian renderer từ thư mục gốc của kho lưu trữ:

```sh
pnpm exec vitest run --config shared/ui/stage/vitest.config.ts --project browser learning-memory
pnpm exec vitest run --config apps/desktop/vitest.node.config.ts learning-reviews
pnpm exec vitest run --config apps/desktop/vitest.config.ts --project browser use-learning-review-reminders
```

Chạy các bài kiểm tra runtime tập trung:

```sh
pnpm -F @angela/desktop exec vitest run src/main/services/angela/computer-use/runtime.test.ts
```

Để truy cập thư mục học tập, IPC và yêu cầu lựa chọn, hãy chạy từ thư mục gốc của kho lưu trữ:

```sh
pnpm exec vitest run --config apps/desktop/vitest.node.config.ts apps/desktop/src/main/services/angela/study-workspace apps/desktop/src/renderer/stores/tools/built-in.test.ts
```

Đặt `AIRI_COMPUTER_USE_LIVE=1` để bao gồm kiểm tra CLI/private-daemon. Đặt `AUV_BINARY_PATH` để kiểm tra bản dựng phát triển native. Nó gọi trợ giúp và đối số không hợp lệ mà không đưa vào đầu vào desktop. Để xác minh renderer, hãy khởi chạy với `APP_REMOTE_DEBUG=true` và `APP_REMOTE_DEBUG_PORT` chưa sử dụng, sau đó đính kèm `agent-browser` vào mục tiêu trò chuyện CDP.

<a id="live-linux-input-verification"></a>

### trực tiếp Xác minh đầu vào Linux

Chạy kiểm tra nhanh trên phiên Wayland đã mở khóa với một đầu ra và quyền truy cập đầu vào tạm thời:

```sh
AUV_BINARY_PATH="$PWD/.cache/auv/0.0.28/bin/auv" AUV_LINUX_INPUT_BACKEND=uinput pnpm -F @angela/desktop smoke:computer-use-input
```

Nếu shell đặt `ELECTRON_RUN_AS_NODE`, hãy bỏ đặt nó trước khi khởi chạy. Tập lệnh không bao giờ cấp quyền cho thiết bị. Nó mở một mẫu kiểm thử toàn màn hình riêng biệt với một cấu hình tạm thời bị cô lập. Nó không cần xây dựng ứng dụng hoặc khóa API. Đầu vào native AUV phải bấm một nút, tập trung điều khiển, gõ ASCII và dán một câu tiếng Việt chính xác. mẫu kiểm thử đếm các sự kiện đáng tin cậy và đọc giá trị kết quả. Mã DOM không bao giờ cung cấp các nhấp chuột hoặc văn bản đầu vào. kiểm tra nhanh bảo tồn văn bản và nội dung bảng nhớ tạm HTML xung quanh quá trình kiểm tra văn bản thuần túy của nó. Nó từ chối các định dạng ban đầu khác. Một bản sao người dùng mới trong quá trình phân phối sẽ được ưu tiên. Tránh thay đổi tiêu điểm trong khi chạy thử nghiệm đầu vào này. Báo cáo và ảnh chụp màn hình chỉ dành cho mẫu kiểm thử được đưa vào `.cache`. Đặt `SMOKE_REPORT_DIR` để chọn thư mục đầu ra. Quá trình kiểm tra dừng daemon riêng tư của nó và xóa hồ sơ tạm thời của nó. Thu hồi quyền truy cập đầu vào tạm thời sau khi chạy. Điều này chứng tỏ khả năng thực thi native so với mẫu kiểm thử. Nó không chứng minh việc lập kế hoạch mô hình hoặc kiểm soát ứng dụng tùy ý.

<a id="model-driven-vs-code-verification"></a>

### Xác minh mã VS dựa trên mô hình

Định cấu hình trò chuyện mô hình bằng cách gọi công cụ trong hồ sơ phát triển cục bộ. Xây dựng desktop trước kiểm tra nhanh này. Chạy trên Linux Niri với quyền truy cập đầu vào tạm thời:

```sh
AUV_BINARY_PATH="$PWD/.cache/auv/0.0.28/bin/auv" AUV_LINUX_INPUT_BACKEND=uinput pnpm exec tsx apps/desktop/scripts/computer-use-model-smoke.ts
```

kiểm tra nhanh chỉ sao chép Bộ nhớ cục bộ vào một hồ sơ tạm thời riêng tư. Nó yêu cầu trạng thái tài khoản chỉ cục bộ. Đặt `SMOKE_SOURCE_PROFILE` để chọn cấu hình nguồn khác. Đặt `SMOKE_CODE_BINARY` cho mã nhị phân native VS khác. Tệp nhị phân của trình soạn thảo mặc định là `/usr/share/code/code`. kiểm tra nhanh khởi chạy các thư mục mở rộng và dữ liệu soạn thảo riêng biệt. Hai tài liệu tạm thời xuất hiện trong các cửa sổ riêng biệt. mô hình phải chọn mục tiêu, dán tiếng Việt và lưu lại. bộ kiểm thử chỉ cho phép đầu vào native vào hai cửa sổ soạn thảo của nó. Nó chuyển tiếp các cuộc gọi được phép đến người thực thi sản xuất đã đăng ký. Kiểm tra sẽ đọc mục tiêu đã lưu, kiểm tra xem tệp còn lại có còn nguyên vẹn không và xác minh mọi mục tiêu đầu vào ID. Điều này chứng tỏ quy trình làm việc của bàn phím với lựa chọn cửa sổ native. Nó không chứng minh đối chiếu ngữ cảnh trực quan hoặc hỗ trợ ứng dụng tùy ý. Bài kiểm tra yêu cầu một bảng tạm văn bản trống hoặc thuần túy. Các định dạng phong phú vẫn còn nguyên. Nó kiểm tra lựa chọn Wayland thực, dừng các nhóm quy trình của nó và xóa các cấu hình tạm thời và nhật ký nhà cung cấp. Đặt `SMOKE_DIAGNOSTICS=1` để ghi lại các lệnh gọi công cụ mẫu kiểm thử và trạng thái soạn thảo để chẩn đoán lỗi. Báo cáo chứa cờ xác minh và tên công cụ, không có thông tin xác thực hoặc nội dung tài liệu. Thu hồi quyền truy cập uinput sau khi chạy.

Cuộc chạy Niri 2026-10-16 đã diễn ra với Gemini 3.1 Flash Lite và Mã VS thực. Tài liệu đã lưu khớp với văn bản tiếng Việt được yêu cầu. Tệp còn lại vẫn nguyên vẹn và bảng tạm native trở lại trạng thái ban đầu.

<a id="companion-follow-ups"></a>

## Theo dõi đồng hành

Mở Cài đặt > Mô-đun > Bộ nhớ dài hạn và bật Đồng hành. Bộ nhớ học tập cũng phải được kích hoạt. Thêm một chủ đề chưa hoàn thành hoặc bắt đầu một hoạt động được chia sẻ. stage chính trình bày nội dung theo dõi sau một phút mà không cần nhập dữ liệu khi đến hạn ghi. Nó chờ trong khi tạo cuộc trò chuyện hoặc phát lời nói và trong khi stage bị ẩn. Quá trình theo dõi diễn ra trong khoảng thời gian từ 08:00 đến 22:00 theo múi giờ của máy, nhiều nhất là một lần mỗi giờ. Mỗi bản ghi có một lần trình bày. Việc đóng Angela dừng kiểm tra cho đến lần khởi chạy tiếp theo. Nỗ lực dành riêng có thể bị mất nếu renderer đóng trước khi bánh mì nướng xuất hiện.

Sử dụng Dừng yêu cầu để loại bỏ một chủ đề. Sử dụng Xóa bản ghi để xóa bộ nhớ đồng hành của nó. Một hoạt động đã hoàn thành sẽ ghi lại báo cáo của người dùng. Bộ đếm thời gian đã trôi qua không bao giờ đánh dấu một hoạt động đã hoàn thành. Các bản ghi cục bộ này vẫn tách biệt với Bộ nhớ CLI V2 và Telegram OpenLoops. Bảng điều khiển Đồng hành và trò chuyện sử dụng cùng các bản ghi có phạm vi ký tự trên các cửa sổ desktop.

## Study Along

Desktop có công cụ native `study_along` để đọc bài học YouTube trong tab Chrome đã chia sẻ hoặc Angela Browser đang kết nối.
Mở **Cài đặt → Học cùng Angela** để ghép nối extension, chọn local/cloud transcription và quản lý quyền upload.
Bản phát hành cung cấp yt-dlp/FFmpeg. Người dùng không cài Python package. Cloud audio mặc định tắt.
Công cụ giữ timestamp, cache transcript và lấy đoạn quanh vị trí đang xem hoặc 5 phút trước đó.
`internet_diagnostics` kiểm tra cấu hình và công cụ media cục bộ mà không upload audio.
Xem [hướng dẫn Study Along](../../docs/study-along.md) để cấu hình extraction, transcription và đọc giới hạn hỗ trợ.
