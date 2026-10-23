# Angela CLI

Trò chuyện với Angela từ thiết bị đầu cuối Node.js. CLI sử dụng nhà cung cấp và sinh nội dung runtime hiện có của Angela. Angela có thể quản lý các công việc hàng ngày và gửi lời nhắc trong khi quy trình đầu cuối vẫn mở.

<a id="interactive-provider-menu"></a>

## Menu nhà cung cấp tương tác

Chạy `angela` trong một thiết bị đầu cuối để chọn GPT, Gemini, Claude hoặc Custom · Angela Gateway. Sử dụng ↑/↓ để chọn một hành động. Nhấn Enter để xác nhận hoặc Esc để quay lại. Menu sử dụng tiếng Anh hoặc tiếng Việt thông qua `--locale` hoặc `ANGELA_LOCALE`. GPT mở trang tài khoản Codex. Song Tử mở Gemini CLI. Claude mở trang tài khoản Claude. Xác thực tài khoản sử dụng bảng điều khiển cục bộ đi kèm trong trình duyệt của bạn chứ không phải cài đặt cổng riêng. Khi đăng nhập prompt, nhập `p` để hiển thị mật khẩu bảng điều khiển ban đầu. Nhập `b` để quay lại. Sau khi kết nối tài khoản, nhấn Enter để chọn mô hình và bắt đầu trò chuyện.

Tùy chỉnh bao gồm kết nối tài khoản, kiểm tra tài khoản, điều khiển enable/disable, lựa chọn mô hình và kiểm tra khóa API. Các hành động tiết lộ riêng biệt chỉ hiển thị khóa API được chia sẻ hoặc mật khẩu bảng điều khiển ban đầu sau khi lựa chọn rõ ràng. Bảng điều khiển đầy đủ cung cấp sổ đăng ký nhà cung cấp đã nhập, điểm cuối tùy chỉnh, tổ hợp, định tuyến và hạn ngạch. Các lựa chọn mô hình sử dụng danh mục cổng, với bộ lọc văn bản và các trang gồm 15 mô hình.

Menu khởi động Angela Gateway khi cần thiết. Nó giữ cho cổng sở hữu mở trong khi trò chuyện và dừng nó sau khi thoát. Cổng host hiện có vẫn mở. Các tài khoản được kết nối và lối thoát tồn tại mô hình đã chọn. Tiếp tục sử dụng cấu hình hiện tại. Nó cũng khởi động một cổng đã dừng khi cấu hình đó trỏ đến phiên bản cục bộ này. Lựa chọn cổng mới sẽ ghi đè các giá trị môi trường nhà cung cấp cho phiên này mà không thay đổi tệp môi trường.

`--no-menu` bỏ qua menu. Cờ nhà cung cấp rõ ràng cũng bỏ qua nó trừ khi có `--menu`. `--help`, `--list-sessions`, `--prompt`, đầu vào theo đường ống và các lệnh phụ không bao giờ hiển thị menu này. Các đường dẫn này giữ nguyên quyền ưu tiên cấu hình hiện có của chúng và không tự động khởi động cổng.

<a id="angela-gateway"></a>

## Cổng Angela

CLI bao gồm công cụ nhà cung cấp đa tài khoản cục bộ. Người dùng không cài đặt ứng dụng cổng riêng. Từ bản mã nguồn đã checkout, trước tiên hãy chạy `pnpm build:cli`. Bản phát hành di động bao gồm máy chủ được xây dựng.

```sh
angela gateway start
```

Trong một thiết bị đầu cuối khác:

```sh
angela gateway login
angela gateway password --show
angela gateway accounts
angela gateway models
angela gateway use --model PROVIDER_ALIAS/MODEL_ID
angela
```

`login [PROVIDER]` in địa chỉ bảng điều khiển đi kèm. OAuth và các mục nhập đặc biệt sử dụng giao diện trình duyệt cục bộ đó. Trang tổng quan chứa sổ đăng ký nhà cung cấp đã nhập hoàn chỉnh, không phải là tập hợp con nhỏ chỉ có CLI. mô hình có sẵn và hạn ngạch tùy thuộc vào tài khoản nhà cung cấp của bạn. Giữ cổng tiền cảnh chạy. Ctrl + C dừng nó.

Tài khoản dựa trên khóa có thể sử dụng `angela gateway add --provider ID --name NAME`. Cung cấp thông tin xác thực nhà cung cấp thông qua `ANGELA_GATEWAY_PROVIDER_KEY`, không phải đối số dòng lệnh. Đối với các trường dành riêng cho nhà cung cấp, hãy chuyển `--credentials-file PATH` với `apiKey` và `providerSpecificData` tùy chọn. Giữ các tệp thông tin xác thực ở chế độ riêng tư và bên ngoài Git.

`enable ACCOUNT_ID`, `disable ACCOUNT_ID` và `test ACCOUNT_ID` quản lý các tài khoản hiện có. `test` có thể liên hệ với nhà cung cấp. `keys` liệt kê siêu dữ liệu không có giá trị thông tin xác thực. `key --show` in rõ ràng khóa suy luận chung. `password --show` in mật khẩu bảng điều khiển ban đầu. Nếu bạn đã thay đổi mật khẩu trang tổng quan, hãy sử dụng mật khẩu mới thay thế.

Điểm cuối mặc định là `http://127.0.0.1:20129/v1/`. `--port` chọn một cổng khác. Áp dụng tùy chọn tương tự cho các lệnh truy cập vào phiên bản đó. `--data-dir` hoặc `ANGELA_GATEWAY_DATA_DIR` chọn thư mục tài khoản riêng tư khác. Thư mục mặc định là `$XDG_CONFIG_HOME/angela/gateway` hoặc `~/.config/angela/gateway` không có cấu hình XDG. Thư mục này tách biệt với bộ nhớ CLI và dữ liệu phiên. Không chia sẻ nó hoặc cam kết nó.

`use --model` lưu khóa chia sẻ thông qua tệp cấu hình riêng hiện có. Nó bảo tồn các mục nhà cung cấp khác và hỗ trợ `--config PATH` hoặc `ANGELA_CONFIG`. Cờ trò chuyện rõ ràng và ghi đè môi trường vẫn được ưu tiên hơn cấu hình đã lưu. Khóa suy luận không thể quản lý tài khoản nhà cung cấp. Việc cài đặt dịch vụ nền và hiển thị từ xa không nằm trong quá trình tích hợp này.

Xem [Angela Gateway](../provider-gateway/README.md) để biết chi tiết bản dựng và xuất xứ nguồn.

<a id="personal-zalo-away-mode"></a>

## Chế độ đi Zalo cá nhân

`angela zalo login` xác thực tài khoản cá nhân thông qua hình ảnh QR riêng tư. `angela zalo run` khôi phục phiên đã lưu của nó và khởi động trình nghe DM tiền cảnh. Sử dụng `/zalo recent`, `/zalo allow ID`, `/away on` và `/away off` trong thiết bị đầu cuối cục bộ của nó. CLI tương tác thông thường cũng chấp nhận các lệnh của chủ sở hữu này.

Trả lời tự động mặc định là từ chối. Chỉ những tin nhắn trực tiếp trong danh sách cho phép mới nhận được Angela Responses công khai trong khi Chế độ đi vắng được bật. Zalo runtime bên ngoài không có bộ nhớ chủ sở hữu, công cụ đặc quyền hoặc ghi bộ nhớ tự động. `notify-only` chạy mà không cần khóa mô hình, nhà cung cấp hoặc sinh nội dung API. `assistant-reply` phân loại tin nhắn thông qua runtime sản xuất và chọn một mẫu công khai cố định. Thiếu cấu hình nhà cung cấp sẽ quay lại thông báo ngoại tuyến. Toàn bộ lượt `assistant-conversation` được hoãn lại.

Tự động hóa tài khoản cá nhân là không chính thức và có nguy cơ đình chỉ tài khoản. Xem thiết lập [Zalo, ranh giới bảo mật, giới hạn và di chuyển VPS](../../docs/integrations/zalo-away-mode.md).

<a id="runtime-and-memory"></a>

## runtime và bộ nhớ

CLI, Telegram và Discord sử dụng `AngelaRuntime` cho bối cảnh, công cụ, sinh nội dung và các sự kiện trong vòng đời. Một host tạo ra một runtime. Bộ điều hợp nhúng có thể nhận cùng runtime đó thông qua đối số hàm tạo cuối cùng tùy chọn của chúng. host tạo runtime phải gọi `await runtime.close()`.

`runtime.open(...)` thu được bối cảnh logic hoạt động. `memory()`, `tasks()`, `skills()`, `project()`, `recall()` và `mcp()` của nó khởi tạo theo yêu cầu. Gọi `await scope.close()` sau mỗi lần mua lại. Bản phát hành cuối cùng đóng Recall và MCP và xóa bối cảnh ngay lập tức. CLI giữ lại một bối cảnh hoạt động. Telegram và Discord phát hành bối cảnh của họ sau mỗi công việc, bao gồm cả những công việc thất bại và bị hủy. Cấu hình mô hình và nhà cung cấp thuộc về runtime được chia sẻ. Đối tượng hội thoại thuộc về yêu cầu bộ điều hợp đang hoạt động.

Bus sự kiện cung cấp siêu dữ liệu đã nhập một cách đồng bộ. Các sự kiện chứa ID tương quan và tên vòng đời, không có prompt, đối số, đầu ra hoặc lịch sử. Định nghĩa công cụ và bằng chứng xác minh chỉ tồn tại trong khi yêu cầu. Bằng chứng cho phép tám đoạn trích 20.000 ký tự. Các kỹ năng không có bộ đệm hướng dẫn liên tục. Recall sử dụng lại bộ nhớ và kỹ năng của ngữ cảnh store. Trò chuyện văn bản không nhập camera hoặc xử lý giọng nói. Việc nhúng vẫn yêu cầu cấu hình mô hình nhúng rõ ràng.

| Trạng thái làm việc | Chính sách ràng buộc hoặc giải phóng |
| --- | --- |
| Bối cảnh runtime | Tám bối cảnh đồng thời, phát hành ngay sau khi chủ sở hữu cuối cùng đóng |
| Việc làm và quyền của Telegram | Tám công việc, 32 mục cấp phép, trục xuất không hoạt động trong mười phút trong lần truy cập tiếp theo |
| Hàng đợi bất hòa | Tám kênh, bốn yêu cầu xếp hàng đợi trên mỗi kênh |
| Nhắc nhở route | 128 store, ba đích kênh cho mỗi store, một bộ đếm thời gian điều chỉnh chung |
| Recall kế toán | 32 rễ workspace, 256 tên tệp bẩn, 64 chẩn đoán, 50 đoạn trích chọn lọc |
| Khám phá MCP | 512 công cụ, 64 trang, hai triệu ký tự lược đồ, được phát hành vào ngày đóng |
| Người nghe sự kiện | 32 cho mỗi loại vòng đời, bị xóa thông qua việc hủy đăng ký hoặc tắt runtime |
| Đang chờ thông báo bằng giọng nói | Tám đoạn trích gồm 4.000 ký tự, độc lập với văn bản được gửi |

Lời nhắc route giữ lại các tác vụ nhỏ-store xử lý cho người dùng đã định cấu hình. Họ đọc các tác vụ từ đĩa mà không giữ lại các cuộc hội thoại hoặc phiên bản Recall. store được chia sẻ có một bộ lập lịch. Đích kênh trực tiếp được đăng ký gần đây nhất sẽ nhận được lời nhắc. Việc đóng bộ điều hợp nhúng sẽ giải phóng đích của nó mà không đóng route của kênh khác. Bộ tính giờ lease mỗi lần gửi chỉ tồn tại trong quá trình gửi thông báo. Tất cả các bộ tính giờ thuộc sở hữu đều không được tham chiếu và bị hủy trong quá trình tắt máy.

Ảnh chụp nhanh phiên giữ lại toàn bộ lịch sử di động trên đĩa. Điểm kiểm tra `working` tùy chọn store phần bù tiền tố được nén và bản tóm tắt có giới hạn. Sau khi lưu nguyên tử, Trò chuyện sẽ giải phóng các lượt được bảo hiểm và Phiên sẽ phát hành ảnh chụp nhanh tin nhắn di động của mình. Khởi động lại sẽ khôi phục phần đuôi và bản tóm tắt đang hoạt động. Ảnh chụp nhanh toàn bộ lịch sử trực tiếp vẫn thay thế phiên và xóa điểm kiểm tra hoạt động của phiên đó. Điểm kiểm tra công cụ kết thúc trước khi yêu cầu đóng lại. Họ không bao giờ ngừng quay trong khi sinh nội dung vẫn sở hữu cuộc trò chuyện đã được chuẩn bị sẵn.

Việc sử dụng máy tính tích hợp vẫn được bật theo mặc định. Sử dụng `angela --no-computer-use` hoặc `angela telegram --no-computer-use` cho văn bản không có MCP. Kết nối MCP mặc định bắt đầu bằng sinh nội dung đầu tiên. Nó không khởi động trong khi nhập lệnh không hoạt động hoặc lệnh cục bộ. Chẩn đoán `/memory used` của Telegram áp dụng cho vòng đời Recall đang hoạt động của nó, vòng đời này sẽ kết thúc sau công việc.

Xem các phép đo bộ nhớ [ và kiểm tra tài nguyên ban đầu](benchmarks/README.md) để biết các lệnh, số liệu thô và các điểm nóng còn lại.

<a id="recall-relevance"></a>

## Mức độ liên quan của Recall

Ngữ cảnh tự động sử dụng mức độ liên quan cổng kiểm tra sau khi xếp hạng FTS/vector và trước khi xác thực nguồn, lựa chọn ngân sách và củng cố. Truy vấn từ vựng nhiều từ cần có hai nội dung token. Tra cứu token đơn lẻ cần token chính xác. Truy vấn quy trình công việc rõ ràng có thể sử dụng nhận dạng quy trình cộng với token theo chủ đề. Tầng tương tự vectơ hiện có vẫn riêng biệt. Chỉ riêng cấp bậc và thẩm quyền của RRF không thể thừa nhận một nguồn không liên quan. Tìm kiếm bộ nhớ rõ ràng vẫn rộng rãi để người gọi có thể kiểm tra các ứng viên bằng `memory_read`.

Các câu hỏi chung về cuộc trò chuyện trước đó chọn bằng chứng có giới hạn từ phiên trước đủ điều kiện mới nhất. Mục đích cần ngôn ngữ quá khứ, ngôn ngữ hội thoại và không còn chủ đề nào nữa. Các câu hỏi chuyên đề giữ lại việc truy xuất lexical/vector. Các phiên hiện tại, phạm vi workspace khác, các nguồn bị chặn và các trang đã hết hạn vẫn bị loại khỏi bản tóm tắt chung. Truy vấn tên và biệt hiệu chia sẻ cách mở rộng từ ngữ hẹp. Vòng loại chủ đề vẫn cần bằng chứng. Không có tác vụ nhà cung cấp mới, nhúng mô hình, cơ sở dữ liệu hoặc mô hình nền nào được bật.

Xem kết quả chất lượng đồng hành [](../../evals/companion/IMPROVEMENTS.md) để biết số liệu, các khoảng trống diễn giải còn lại và các lệnh hồi quy.

<a id="run"></a>

## Chạy

Từ kho lưu trữ gốc, cài đặt các phần phụ thuộc workspace và xây dựng các gói cần thiết:

```sh
pnpm install
pnpm build:cli
```

<a id="configure-the-cli"></a>

## Định cấu hình CLI

Chạy `angela setup` để chọn phiên bản nhà cung cấp, định nghĩa nhà cung cấp, mô hình và điểm cuối một cách tương tác. Sử dụng `angela setup --list-providers` cho ID định nghĩa nhà cung cấp. Thông tin xác thực đến từ `ANGELA_API_KEY` hoặc mục nhập đã chọn hiện có. Thiết lập không bao giờ yêu cầu thông tin xác thực lặp lại hoặc in nó. Điểm cuối cục bộ có thể sử dụng khóa trống. Cài đặt sử dụng tệp cấu hình chia sẻ nguyên tử, riêng tư, bị khóa hiện có. nhà cung cấp không liên quan vẫn còn nguyên. Thiết lập lưu cấu hình mà không thực hiện yêu cầu sinh nội dung.

Đối với thiết lập không tương tác:

```sh
angela setup --provider local --model your-model --base-url http://127.0.0.1:1234/v1/
angela doctor
angela
```

`--definition` mặc định là `openai-compatible` cho mục nhập mới. `--api responses` chọn giao thức Responses. `--config PATH` và `ANGELA_CONFIG` chọn một tệp được chia sẻ khác. Cài đặt không hợp lệ và các tập tin bị hỏng vẫn còn nguyên. Đặt `ANGELA_API_KEY` thông qua shell hoặc trình quản lý bí mật của bạn trước khi thiết lập khi nhà cung cấp của bạn yêu cầu. Thiết lập vẫn tồn tại khóa đó trong tệp cấu hình riêng tư. Ghi đè môi trường tạm thời cho cuộc trò chuyện thông thường vẫn không sửa đổi tệp này.

## Portable release

Xây dựng thư mục và kho lưu trữ nén cho hệ điều hành, kiến ​​trúc và Node ABI hiện tại:

```sh
pnpm package:cli --out /absolute/path/to/angela-portable
```

Đầu ra không được tồn tại. Nếu không có `--out`, bao bì sẽ ghi vào thư mục `dist` bị bỏ qua của thanh toán. Tập lệnh sử dụng lại quá trình triển khai pnpm và các lệnh xây dựng hiện có. `--skip-build` sử dụng các gói đã được xây dựng sẵn. Cờ chèn chỉ triển khai tạo một tệp khóa chuyên dụng mà không thay đổi cấu hình workspace hoặc các phiên bản phụ thuộc. Việc đóng gói sẽ vô hiệu hóa các tập lệnh triển khai và kiểm tra xem tất cả các liên kết tượng trưng có giải quyết được bên trong bản phát hành hay không. Nó từ chối các tệp môi trường vô tình và chỉ sao chép các tài nguyên giọng nói và camera có tên.

Chuyển `.tar.gz` kết quả, giải nén nó và giữ cùng một thư mục:

```sh
node /path/to/angela-portable/angela.mjs setup
node /path/to/angela-portable/angela.mjs
ln -s /path/to/angela-portable/angela.mjs ~/.local/bin/angela
```

Đích cần có Node.js runtime tương thích, nhưng không có bản mã nguồn đã checkout hoặc pnpm. `portable.json` ghi lại OS, kiến ​​trúc, phiên bản Node và mô-đun native ABI cần thiết. Các phần phụ thuộc native yêu cầu cùng một ABI. Xây dựng một bản phát hành khác cho một mục tiêu khác. Dữ liệu cấu hình và hội thoại vẫn còn trong thư mục người dùng thông thường và không bao giờ được đưa vào kho lưu trữ. Voice vẫn yêu cầu tiện ích âm thanh Docker và host. Tài nguyên Compose của nó được bao gồm. Mã camera và theo dõi mô hình được bao gồm. Cài đặt riêng các phần phụ thuộc Python của nó với `uv sync --locked --project /path/to/angela-portable/python/camera-worker` trước `/camera on`. `ANGELA_OPENSEEFACE_DIR` vẫn là ghi đè rõ ràng cho mô hình theo dõi.

<a id="shared-local-configuration"></a>

## Cấu hình cục bộ được chia sẻ

CLI đọc `~/.config/angela/config.json`, được chia sẻ với desktop và web được cung cấp cục bộ. Chọn nhà cung cấp trực tiếp và trò chuyện mô hình trong cài đặt của một trong hai ứng dụng, sau đó chạy `pnpm cli`. Không cần đăng nhập tài khoản cho nhà cung cấp trực tiếp. Phiên tài khoản ở bên ngoài tệp được chia sẻ.

`ANGELA_CONFIG` hoặc `--config /path/to/config.json` chọn một tệp khác. `XDG_CONFIG_HOME` thay đổi thư mục cấu hình mặc định. Sử dụng `--provider INSTANCE_ID` để chọn một phiên bản nhà cung cấp đã lưu khác. Cờ ghi đè các biến môi trường, ghi đè lên tệp được chia sẻ. Ghi đè không thay đổi tập tin. Xem [gói cấu hình](../local-config/README.md) để biết các quy tắc lưu trữ và lược đồ của nó.

<a id="environment-overrides"></a>

## Ghi đè môi trường

Định cấu hình nhà cung cấp không có tệp chia sẻ thông qua các biến môi trường:

```sh
export ANGELA_MODEL='your-model-id'
export ANGELA_API_KEY='your-provider-key'
export ANGELA_BASE_URL='https://your-provider.example/v1/'
pnpm cli
```

Sử dụng `ANGELA_API=responses` cho điểm cuối Responses. Giao thức mặc định là `chat-completions`. Điểm cuối cục bộ có thể sử dụng khóa API trống. Thông tin xác thực không có cờ dòng lệnh.

`pnpm cli` cũng đọc `.env.cli.local` từ thư mục gốc của kho lưu trữ khi tệp này tồn tại. store có các biến `ANGELA_*` tương tự cho các lần chạy sau. Các biến môi trường hiện tại được ưu tiên hơn các giá trị tệp. Git bỏ qua tập tin này. Trên hệ thống POSIX, hãy sử dụng `chmod 600 .env.cli.local` để hạn chế quyền truy cập. Tệp thực thi được xây dựng sẽ đọc các biến môi trường và cấu hình được chia sẻ. Để tải tệp này với tệp thực thi, hãy sử dụng cờ `--env-file` của Node.

```sh
pnpm cli --prompt 'Giải thích async/await'
printf 'Giải thích async/await' | pnpm cli
pnpm cli --cwd ./packages/core-agent --locale en
pnpm cli --help
```

Gói này cũng xây dựng một tệp thực thi tại `packages/angela-cli/dist/bin/run.mjs`. Với các phần phụ thuộc workspace được cài đặt và xây dựng, tệp thực thi này hoạt động từ một thư mục khác:

```sh
/absolute/path/to/Angela/packages/angela-cli/dist/bin/run.mjs --cwd /path/to/workspace
```

Việc thực thi thanh toán sử dụng các gói workspace. Sử dụng bản phát hành đóng gói độc lập bên dưới để chạy mà không cần thanh toán.

Để cài đặt lệnh `angela` trên Linux hoặc macOS, hãy chạy các lệnh này từ thư mục gốc của kho lưu trữ sau khi xây dựng:

```sh
mkdir -p "$HOME/.local/bin"
ln -s "$PWD/packages/angela-cli/dist/bin/run.mjs" "$HOME/.local/bin/angela"
```

Đảm bảo rằng `$HOME/.local/bin` nằm trên `PATH`. Giữ thanh toán này và các gói workspace được xây dựng sẵn. Từ bất kỳ thư mục nào, hãy chạy `angela`. Nó tự động kết nối các công cụ đầu cuối tích hợp. Thư mục hiện tại trở thành workspace. `--cwd` chọn thư mục khác.

Ngôn ngữ giao diện mặc định là tiếng Việt. Sử dụng `ANGELA_LOCALE=en` hoặc `--locale en` cho tiếng Anh.

Trong khi trò chuyện tương tác, Ctrl+C sẽ hủy yêu cầu hiện tại. Sử dụng `/exit` hoặc Ctrl+D để thoát. Sử dụng `/help` để liệt kê các lệnh trò chuyện và điều khiển bàn phím mà không cần liên hệ với mô hình. Nhập `/` khi bắt đầu nhập để hiển thị các gợi ý lệnh. Tiếp tục gõ để lọc chúng. Sử dụng ↑ và ↓ để chọn lệnh. Nhấn Tab hoặc Enter để hoàn thành, sau đó Enter để gửi. Yêu cầu một lần trả về mã thoát 1 nếu có lỗi và 130 để hủy.

Khởi động tương tác xóa màn hình thiết bị đầu cuối và hiển thị biểu tượng robot của Angela. Câu trả lời của Angela sử dụng màu lục lam với nhãn agent. Đầu vào prompt sử dụng màu xanh lá cây và văn bản của bạn sử dụng màu mặc định của thiết bị đầu cuối. Vùng nhập có đường viền. Các dòng trống phân tách các yêu cầu, câu trả lời và câu hỏi phê duyệt công cụ. Cài đặt màu đầu cuối, bao gồm `NO_COLOR`, hỗ trợ màu điều khiển. Các yêu cầu theo đường dẫn và một lần duy trì kết quả đơn giản mà không có biểu ngữ khởi động hoặc xóa màn hình.

Lỗi nhà cung cấp hiển thị một thông báo được bản địa hóa có trạng thái HTTP và bước tiếp theo. Ví dụ: HTTP 503 giải thích rằng mô hình bị quá tải hoặc không khả dụng. HTTP 401 yêu cầu bạn kiểm tra thông tin đăng nhập. Tự động thử lại hiển thị một thông báo tiến trình ngắn. Ngăn xếp SDK, tiêu đề phản hồi và nội dung nhà cung cấp thô nằm ngoài đầu ra của thiết bị đầu cuối.

Trong khi yêu cầu, thiết bị đầu cuối hiển thị quá trình suy nghĩ, khám phá công cụ và tiến trình thực hiện theo thời gian đã trôi qua. Kết quả của công cụ hiển thị trạng thái của chúng và tối đa ba dòng đầu ra, giới hạn ở 600 ký tự. mô hình và cuộc hội thoại đã lưu giữ lại kết quả đầy đủ của công cụ. Phê duyệt prompt hiển thị hành động hoàn chỉnh và thư mục làm việc trước khi thực hiện. Tiến trình tạm dừng trong quá trình phê duyệt và dừng trước khi có câu trả lời, hủy hoặc có lỗi. Đầu ra theo đường ống giữ các câu trả lời trên thiết bị xuất chuẩn và thông báo tiến trình đơn giản trên thiết bị xuất chuẩn. Một câu trả lời mô hình trống sẽ báo lỗi thay vì quay lại prompt một cách im lặng.

<a id="scope"></a>

## Phạm vi

Điểm vào này cung cấp tính năng trò chuyện bằng văn bản, giọng nói Linux, tín hiệu camera cục bộ tùy chọn và kết nối thiết bị đầu cuối MCP tích hợp. Các ứng dụng web và desktop cung cấp hình đại diện và cài đặt hình ảnh.

<a id="discord-chat-and-voice"></a>

## Trò chuyện và giọng nói bất hòa

Đưa Angela vào Discord bằng cuộc trò chuyện đã lưu nhà cung cấp của CLI. desktop hoặc máy khách web là không cần thiết.

```sh
angela discord --help
angela voice start
angela discord
```

Tạo bot Discord và bật Ý định nội dung tin nhắn trong Cổng thông tin dành cho nhà phát triển. Mời bot có phạm vi `bot` và `applications.commands`. Cấp quyền Xem kênh, Gửi tin nhắn, Kết nối và Nói. Lưu `DISCORD_TOKEN` và cấu hình giọng nói trong `~/.config/angela/discord.env` với chế độ tệp `600`. Sử dụng mẫu [Discord](../../integrations/discord-bot/.env.example) để làm mặc định cho dịch vụ thoại cục bộ. `ANGELA_DISCORD_ENV` chọn một tệp khác. Biến môi trường ghi đè giá trị tệp. CLI đọc cuộc trò chuyện nhà cung cấp hiện có từ `~/.config/angela/config.json`.

Đề cập đến Angela hoặc gửi tin nhắn trực tiếp để trò chuyện bằng văn bản. Tham gia kênh thoại của máy chủ và sử dụng `/summon` cho giọng nói. Sử dụng `/listen enabled:false` để tạm dừng, `/listen enabled:true` để tiếp tục và `/leave` để ngắt kết nối. Ctrl+C dừng host và hủy Responses đang chờ xử lý.

Lịch sử vẫn nằm trong thư mục `discord` của thư mục dữ liệu CLI. Các kênh và cuộc hội thoại text/voice có lịch sử riêng biệt. Yêu cầu trong mỗi cuộc trò chuyện chạy theo thứ tự. Tối đa bốn yêu cầu chờ trong một cuộc trò chuyện, bao gồm cả sinh nội dung đang hoạt động của nó. Chế độ này cung cấp trò chuyện và giọng nói. Các công cụ đầu cuối, lệnh tác vụ Telegram và micrô cục bộ thu nhận dữ liệu nằm ngoài phạm vi của nó. Xem hướng dẫn [Discord](../../integrations/discord-bot/README.md) để biết nhà cung cấp lời nói và hành vi cuộc gọi.

<a id="local-camera-cues"></a>

## Tín hiệu camera cục bộ

Cảm nhận của máy ảnh là **OFF trên mỗi lần khởi động CLI**. Không có giá trị cấu hình hoặc phiên đã lưu nào tự động bật. Sử dụng tính năng này cho các tín hiệu đàm thoại hoặc học tập tùy chọn. Nó không phát hiện cảm xúc, danh tính hay liệu bạn có hiểu bài học hay không.

Cài đặt [uv](https://docs.astral.sh/uv/getting-started/installation/), sau đó tạo CPU runtime từ thư mục gốc của kho lưu trữ:

```sh
uv sync --locked --project packages/angela-cli/python/camera-worker
packages/angela-cli/python/camera-worker/.venv/bin/python packages/angela-cli/python/camera-worker/worker.py --check
packages/angela-cli/python/camera-worker/.venv/bin/python packages/angela-cli/python/camera-worker/worker.py --smoke
```

Các lệnh kiểm tra và kiểm tra nhanh không truy cập được vào camera. kiểm tra nhanh tải mô hình theo dõi thực tế và xử lý một khung màu đen tổng hợp. Trên Windows, thay thế `.venv/bin/python` bằng `.venv/Scripts/python.exe`. runtime sử dụng Python 3.11, NumPy, CPU ONNX runtime và không có giao diện OpenCV với các phiên bản và hàm băm bị khóa. Xem [worker setup](python/camera-worker/README.md) để biết chi tiết phụ thuộc và kiểm tra trực tiếp độc lập. Giữ `third_party/openseeface` và thư mục worker bên cạnh CLI đã xây dựng trong phần kiểm tra này. Tệp thực thi được xây dựng sẽ tìm thấy chúng độc lập với thư mục làm việc hiện tại.

Trong khi trò chuyện bằng văn bản hoặc giọng nói tương tác:

```text
/camera on
/camera status
/camera debug
/camera off
```

`on` chờ thu nhận dữ liệu và suy luận thành công đầu tiên. Chỉ báo `📷 ON` hiển thị đi kèm với prompt đầu vào tiếp theo. `off` dừng worker và xóa trạng thái tạm thời cũng như chính sách phản hồi hội thoại. Khởi động lại Angela yêu cầu `on` rõ ràng mới. Các lệnh này chạy cục bộ và không yêu cầu yêu cầu mô hình hoặc phê duyệt quyền của công cụ. `debug` hiển thị trạng thái dẫn xuất, độ tin cậy của trình theo dõi, thời lượng ổn định, sự kiện không hợp lệ, capture/processed FPS, độ trễ và khung hình bị rớt.

Máy ảnh worker xử lý các khung hình trong bộ nhớ. Nó không lưu hình ảnh, cắt khuôn mặt hoặc video hoặc gửi chúng qua mạng. Chỉ các quan sát dẫn xuất mới vượt qua ranh giới JSONL đã được xác thực của nó. Toàn bộ các mốc và ID khuôn mặt vẫn nằm ngoài giao thức của Angela. TypeScript nhà cung cấp route đã xác thực các quan sát thông qua bối cảnh Eventa riêng tư. Lấy mẫu mặc định là 10 lần cập nhật mỗi giây. Một khe khung có thể thay thế duy nhất sẽ ngăn hàng đợi suy luận không giới hạn.

Công cụ này kết hợp một cửa sổ cuộn với các trình gỡ lỗi độc lập để mang lại sự hiện diện, biểu cảm và sự chú ý gần đúng trên màn hình. Nó phát ra `facePresent`, `neutral|smile|unknown` và `screen|away|unknown`. Các gai ngắn không thiết lập được tín hiệu. Bằng chứng yếu, hình học không chắc chắn và tư thế bị thiếu trả về `unknown`. Quan sát hết hạn sau hai giây. Sự chú ý trên màn hình sử dụng hướng đầu chứ không phải ánh mắt. Xem ngưỡng [ và thời gian](src/perception/README.md).

Các tín hiệu mới, ổn định hiện tại đi kèm với mọi yêu cầu mô hình do người dùng khởi tạo dưới dạng bối cảnh tư vấn không chắc chắn, bao gồm các yêu cầu sau kết quả của công cụ. Các tín hiệu không thay đổi vẫn có sẵn cho các yêu cầu liên tiếp. Phân phối bối cảnh không có thời gian hồi chiêu. Hướng dẫn phản ứng trong cuộc trò chuyện là riêng biệt: các cơ hội đưa ra nhận xét tự nguyện sẽ đợi 10 giây nếu có tín hiệu thay đổi hoặc 60 giây nếu có tín hiệu không thay đổi. Những khoảng này chỉ giới hạn bình luận. mô hình vẫn nhận được tín hiệu hiện tại và có thể lặng lẽ điều chỉnh âm thanh hoặc tốc độ giải thích. Một cơ hội không chứng minh được rằng mô hình đã đề cập đến một gợi ý. Những câu hỏi rõ ràng về tín hiệu vẫn có thể nhận được câu trả lời thận trọng. Cập nhật máy ảnh không bao giờ kích hoạt các yêu cầu mô hình hoặc tin nhắn trò chuyện không mong muốn. Bối cảnh khuyên Angela nên thiên về lời nói của bạn, thích ứng một cách nhẹ nhàng và tránh những khẳng định dựa trên sự thật về cảm xúc, sự hiểu biết hoặc những đặc điểm nhạy cảm. Các quan sát và bối cảnh được chèn không nhập vào lịch sử phiên, tệp bộ nhớ hoặc tóm tắt. Các câu trả lời được tạo thông thường vẫn tuân theo sự duy trì trò chuyện bình thường.

Lỗi camera khiến trò chuyện không khả dụng. `/camera debug` giữ lại mã chẩn đoán khởi động mới nhất. Thiếu phần phụ thuộc, tệp mô hình, quyền thiết bị, quyền sở hữu máy ảnh, sự cố và luồng bị đình trệ đều xử lý lỗi có giới hạn. nhà cung cấp đợi tối đa 30 giây để khởi động và 5 giây để hoạt động phát trực tuyến. Tắt máy sẽ gửi SIGTERM, sau đó là SIGKILL sau một giây nếu cần. Không có nỗ lực khởi động lại tự động. Lỗi runtime xuất hiện giữa prompt nên chúng không ghi đè lên đầu vào đang diễn ra. Sau khi sửa lỗi, hãy sử dụng `/camera on` để thử lại một cách rõ ràng.

| Biến môi trường | Mặc định và mục đích |
| --- | --- |
| `ANGELA_CAMERA_PYTHON` | worker của `.venv` Python khi có mặt, nếu không thì `python3`. Chỉ chọn tệp thực thi. |
| `ANGELA_OPENSEEFACE_DIR` | Thanh toán này là `third_party/openseeface`. Chọn nguồn được cung cấp và mô hình. |
| `ANGELA_CAMERA_DEVICE` | `0`. Chỉ số thiết bị máy ảnh, 0–99. |
| `ANGELA_CAMERA_FPS` | `10`. Tốc độ mẫu suy luận tối đa, 1–30. |
| `ANGELA_CAMERA_WINDOW_MS` | `1000`. Cửa sổ cuộn, 100–30000 ms, có giới hạn tới 300 quan sát. |

Cấu hình camera không hợp lệ chỉ được báo cáo khi bạn bật tính năng này. Nó không chặn việc khởi động trò chuyện thông thường. Mặc định là heuristic và không được hiệu chỉnh. Độ chính xác phụ thuộc vào hình dạng khuôn mặt, ánh sáng, vị trí camera và chất lượng thiết bị theo dõi. Hiệu chỉnh cá nhân và kết hợp nhịp điệu giọng nói nằm ngoài V1 này. Không có cảm xúc nâng cao mô hình, tính năng theo dõi cơ thể hoặc nhận dạng nào đang hoạt động.

Kiểm tra máy ảnh không cần phần cứng:

```sh
python3 -m unittest discover -s packages/angela-cli/python/camera-worker -p test.py
pnpm -F @angela/cli exec vitest run src/perception
```

Thử nghiệm tích hợp sử dụng quy trình con mẫu kiểm thử Python và ranh giới mô hình HTTP mô phỏng. Các bài kiểm tra máy ảnh thông thường không bao giờ mở webcam hoặc yêu cầu OpenCV/ONNX.. Chúng chỉ yêu cầu thư viện chuẩn của Node và Python.

<a id="local-voice-service-commands"></a>

## Lệnh dịch vụ thoại cục bộ

```sh
angela voice start
angela voice status
angela voice stop
```

Các lệnh này hoạt động từ bất kỳ thư mục nào và không cần thông tin xác thực trò chuyện mô hình hoặc nhà cung cấp. `start` xây dựng và khởi động dịch vụ Docker cục bộ, sau đó chờ sẵn sàng. Nó chỉ tạo mặc định giọng nói cục bộ riêng tư khi `voice.env` không tồn tại. Cấu hình hiện tại không thay đổi. `status` hiển thị trạng thái vùng chứa, tình trạng điểm cuối được định cấu hình và tính khả dụng của các lệnh PipeWire. Nó không ghi lại âm thanh. Micrô thực tế được kiểm tra khi thu nhận dữ liệu khởi động. `stop` dừng dịch vụ và giữ lại lịch sử và mô hình đã tải xuống. Cần có Docker với Compose và một daemon đang chạy. Giữ sẵn bản mã nguồn đã checkout này. `ANGELA_VOICE_COMPOSE` chọn một tệp Compose khác khi dịch vụ đã di chuyển.

<a id="voice-in-the-current-session"></a>

## Giọng nói trong phiên hiện tại

Nhập `/voice` trong khi trò chuyện tương tác để bắt đầu nghe tự động. Nói chuyện bình thường. Khoảng 1,2 giây im lặng sẽ kết thúc câu nói của bạn và tự động gửi đi. Angela đọc câu trả lời. Khi tính năng gián đoạn được bật, bạn có thể nói trong khi trả lời. Nhập là không cần thiết. Thiết bị đầu cuối hiển thị khi micrô bật, khi giọng nói bắt đầu và khi bắt đầu phiên âm hoặc phát lại. Nhập `/chat` để loại bỏ thu nhận dữ liệu hiện tại và quay lại trò chuyện bằng văn bản. Ctrl+C dừng thao tác hiện tại và quay lại chế độ văn bản. `/voice` bắt đầu nghe lại. Theo mặc định, `/voice` tạo bộ lọc tiếng vang PipeWire WebRTC riêng tư và cho phép ngắt giọng nói. Nếu bộ lọc không có sẵn, Angela sẽ báo cáo điều này và sử dụng các lượt nghe và nói riêng biệt. Khi bật tính năng ngắt giọng nói, thu nhận dữ liệu riêng biệt sẽ lắng nghe trong khi trả lời mà không cần đọc đầu vào của thiết bị đầu cuối. Văn bản nói chỉ được gửi đến mô hình. Chỉ các lệnh đã gõ mới có thể thay đổi quyền của công cụ. Quyền hội thoại và công cụ vẫn ở cùng một phiên.

Tính năng nghe tự động yêu cầu điểm cuối `audio/listen` WebSocket của dịch vụ thoại cục bộ. CLI phát trực tiếp PCM đơn âm 16 kHz từ PipeWire. Ảnh chụp sẽ lưu lại trong bộ nhớ và bị loại bỏ sau mỗi lượt. Silero phát hiện giọng nói bằng ONNX mô hình đã đi kèm với Faster Whisper. Âm thanh nhàn rỗi sử dụng cửa sổ cuộn ba giây. Lời nói được giới hạn trong 30 giây. Lỗi dịch vụ hoặc micrô sẽ quay lại chế độ văn bản thay vì khởi động lại theo vòng lặp.

Để thiết lập miễn phí mà không cần khóa API, hãy sử dụng [dịch vụ thoại cục bộ](../../services/voice-local/README.md).

Giọng nói Linux sử dụng các lệnh PipeWire hiện có `pw-record` và `pw-play`. Định cấu hình dịch vụ âm thanh tương thích OpenAI trong `.env.cli.local` hoặc các biến môi trường:

```dotenv
ANGELA_VOICE_BASE_URL=http://localhost:8000/v1/
ANGELA_STT_MODEL=whisper-1
ANGELA_TTS_MODEL=tts-1
ANGELA_TTS_VOICE=alloy
```

Cấu hình âm thanh `~/.config/angela/voice.env` store cho CLI đã cài đặt từ bất kỳ thư mục nào. `ANGELA_VOICE_ENV` chọn một tệp khác. Biến môi trường ghi đè giá trị tệp. `ANGELA_VOICE_API_KEY` cung cấp thông tin xác thực âm thanh tùy chọn, tách biệt với thông tin xác thực trò chuyện. Dịch vụ âm thanh phải hỗ trợ `audio/transcriptions` và `audio/speech` với đầu ra WAV. Tên mô hình và giọng nói phải khớp với dịch vụ của bạn. router chỉ dành cho trò chuyện không tự động cung cấp âm thanh. Âm thanh đi đến dịch vụ được định cấu hình. Các tập tin âm thanh tạm thời sẽ bị xóa sau mỗi thao tác. Angela bắt đầu đọc các câu hoàn chỉnh trong khi mô hình tiếp tục trả lời. Dấu phẩy và số từ không chia câu thành các yêu cầu âm thanh riêng biệt. Âm thanh đầu tiên chờ ranh giới câu. Quá trình hoàn thành sinh nội dung sẽ phát hành bất kỳ văn bản cuối cùng nào mà không có dấu câu. Văn bản chờ âm thanh là có giới hạn. Phát lại chậm áp dụng áp suất ngược cho quá trình xử lý sự kiện mô hình. Chỉ có một yêu cầu âm thanh và phát lại chạy cùng một lúc. Ctrl+C hủy tất cả lời nói còn lại. Các câu trả lời đã hoàn thành sẽ được lưu trước khi âm thanh cuối cùng cạn kiệt. sinh nội dung bị hủy sẽ giữ nguyên trạng thái phiên bị gián đoạn hiện có. Lỗi âm thanh sẽ dừng lời nói cho câu trả lời đó trong khi văn bản sinh nội dung và lịch sử vẫn tiếp tục. Việc phát lại không thành công sẽ hiển thị câu trả lời trong cuộc trò chuyện. Chế độ giọng nói yêu cầu thiết bị đầu cuối tương tác.

<a id="terminal-tools"></a>

## Công cụ đầu cuối

Xây dựng dịch vụ trước lần chạy đầu tiên. CLI tự động kết nối các công cụ đầu cuối của nó:

```sh
pnpm -F @angela/computer-use-mcp build
angela --cwd ./packages/core-agent
```

mô hình khám phá các công cụ thông qua `builtIn_mcpListTools` và gọi chúng thông qua `builtIn_mcpCallTool`. Kết nối tích hợp chỉ hiển thị các công cụ đầu cuối. Đọc và chỉnh sửa tập tin sử dụng các lệnh đầu cuối. `--computer-use` vẫn được chấp nhận. `--mcp-command` rõ ràng chọn một máy chủ khác thay vì dịch vụ tích hợp. CLI cung cấp workspace đã chọn khi cuộc gọi đầu cuối bỏ qua `cwd`. workspace là một thư mục làm việc, không phải hộp cát hệ thống tập tin.

Theo mặc định, CLI hiển thị từng lệnh gọi công cụ và yêu cầu xác nhận. Nhập `yes` để cho phép cuộc gọi chính xác đó. Các hành động đang chờ xử lý phía máy chủ yêu cầu xác nhận thứ hai ở chế độ này. Sử dụng `/permistion` để xem chế độ hiện tại, `/permistion full` để truy cập đầy đủ và `/permistion ask` để khôi phục xác nhận. `/permission` là bí danh. `on` chọn quyền truy cập đầy đủ và `off` khôi phục xác nhận. Toàn quyền truy cập tự động phê duyệt các lệnh gọi công cụ và các hành động đang chờ xử lý của máy chủ. CLI vẫn hiển thị từng hành động và kết quả của nó. Chế độ này kéo dài cho quá trình hiện tại. Phiên mới và phiên tiếp tục bắt đầu với yêu cầu xác nhận. Các lệnh cấp phép chạy cục bộ mà không cần liên hệ với mô hình. Chúng không kết nối máy chủ MCP hoặc ghi đè các từ chối chính sách của máy chủ. mô hình không thể gọi trực tiếp các điểm cuối phê duyệt. Nếu không có thiết bị đầu cuối bên đọc, các lệnh gọi công cụ sẽ bị từ chối. Việc hủy sẽ dừng yêu cầu mô hình và chờ MCP. Các hành động bên ngoài đã hoàn thành hoặc đang chạy có thể giữ lại tác dụng phụ.

Để kết nối một máy chủ stdio MCP đáng tin cậy khác, hãy cung cấp riêng các đối số và tệp thực thi của nó:

```sh
pnpm cli --mcp-command pnpm --mcp-arg=-F --mcp-arg=@angela/computer-use-mcp --mcp-arg=start
```

Máy chủ khởi động trong `--cwd`. Stderr của nó đi đến thiết bị đầu cuối. Đầu ra CLI không bao giờ trộn lẫn với giao thức máy chủ. Tiến trình con không nhận được `ANGELA_API_KEY`. Các biến môi trường khác vẫn có sẵn cho máy chủ. Các tệp kiểm tra dịch vụ tích hợp nằm trong thư mục phiên CLI, bên ngoài workspace. `COMPUTER_USE_SESSION_ROOT` rõ ràng sẽ ghi đè vị trí này.

<a id="sessions"></a>

## Phiên

Mỗi lần chạy sẽ lưu một phiên trong `~/.angela/sessions`. Sử dụng `ANGELA_DATA_DIR` hoặc `--data-dir` để thay đổi thư mục này. CLI in phiên ID của nó thành stderr. Các tệp phiên sử dụng quyền riêng tư và thay thế nguyên tử.

```sh
pnpm cli --list-sessions
pnpm cli --resume SESSION_ID
```

Tiếp tục yêu cầu cấu hình nhà cung cấp giống như một cuộc trò chuyện mới. Thông tin xác thực và cấu hình nhà cung cấp không được lưu trữ trong tệp phiên. workspace đã lưu vẫn hoạt động trừ khi `--cwd` chỉ định cùng thư mục. Khóa phiên ngăn hai quy trình CLI ghi cùng một phiên. Sau sự cố, chỉ xóa tệp `.lock` của nó sau khi bạn xác nhận rằng quá trình trước đó đã dừng.

Lịch sử lưu giữ văn bản và các lệnh gọi công cụ tương quan cũng như kết quả thông qua trình chiếu thông báo di động của lõi runtime. Phần tiếp theo của native nhà cung cấp và siêu dữ liệu suy luận vẫn còn trong bộ nhớ cho quy trình hiện tại. Yêu cầu bị gián đoạn được đánh dấu. CLI không tạo ra câu trả lời trợ lý hoặc hoàn tác các hành động bên ngoài.

<a id="data-maintenance"></a>

## Bảo trì dữ liệu

```sh
angela sessions list
angela sessions usage
angela sessions delete SESSION_ID
angela sessions cleanup-audio
```

Các lệnh này không cần trò chuyện nhà cung cấp. `--data-dir` chọn một thư mục phiên CLI khác. Báo cáo sử dụng CLI lịch sử JSON byte. Không bao gồm lịch sử Telegram, bộ đệm mô hình và tệp kiểm tra công cụ. Việc xóa sẽ hiển thị siêu dữ liệu lịch sử đã chọn và yêu cầu lại ID đầy đủ của nó trong một thiết bị đầu cuối tương tác. Một phiên mở hoặc bị khóa không thể bị xóa. Không có lịch sử nào bị xóa tự động.

Khởi động trò chuyện sẽ xóa các thư mục âm thanh được nhận dạng cũ hơn 24 giờ, trừ khi quy trình chủ sở hữu của chúng vẫn còn tồn tại. Nội dung không xác định được bảo tồn. `cleanup-audio` chạy cùng một quá trình dọn dẹp một cách rõ ràng. Việc phát lại bình thường sẽ xóa WAV tạm thời của nó ngay lập tức. Micrô tự động thu nhận dữ liệu vẫn được lưu trong bộ nhớ.

<a id="telegram"></a>

## điện tín

Chạy `angela telegram` để trò chuyện và sử dụng các công cụ đầu cuối cục bộ thông qua Telegram, sử dụng tính năng bỏ phiếu dài grammY. host này sử dụng lại cấu hình nhà cung cấp được chia sẻ của Angela và lưu trữ phiên. Nó không cần cơ sở dữ liệu, cổng công cộng hoặc webhook. Sự tích hợp hiện có trong `integrations/telegram-bot` vẫn là một dịch vụ riêng biệt với các tính năng phương tiện và cơ sở dữ liệu riêng.

Tạo bot thông qua `@BotFather` của Telegram và nhận người dùng Telegram số ID của bạn. store bot token và ID người dùng được phép trong `~/.config/angela/telegram.env`:

```dotenv
ANGELA_TELEGRAM_BOT_TOKEN=<your-bot-token>
ANGELA_TELEGRAM_ALLOWED_USER_IDS=<your-numeric-user-id>
```

Sử dụng `chmod 600 ~/.config/angela/telegram.env` để hạn chế quyền truy cập. Giữ tập tin này bên ngoài Git. Biến môi trường ghi đè giá trị tệp. `ANGELA_TELEGRAM_ENV` chọn một tệp môi trường khác. `XDG_CONFIG_HOME` thay đổi thư mục cấu hình. Phân tách nhiều ID được phép bằng dấu phẩy. Bot từ chối khởi động nếu không có token và danh sách ID số không trống. Người dùng, nhóm và kênh trái phép không nhận được phản hồi và không thể truy cập phiên hoặc mô hình.

```sh
angela telegram
angela telegram --cwd /path/to/project --model your-model-id
angela telegram --help
```

Giữ quy trình này và nhà cung cấp của bạn, chẳng hạn như bộ định tuyến 9 cục bộ, chạy trong khi bạn sử dụng Telegram. Chỉ một quy trình bỏ phiếu có thể sử dụng bot token. Một webhook hiện có sẽ ngăn khởi động thay vì bị xóa âm thầm.

Lệnh điện tín:

- `/start`: giới thiệu Angela.
- `/help`: liệt kê các lệnh Telegram và mô tả từng lệnh.
- `/status`: hiển thị mô hình, phiên ID, workspace, quyền và tiến trình yêu cầu đã lưu mới nhất.
- `/result`: đọc câu trả lời đã lưu mới nhất mà không cần gọi mô hình hoặc công cụ khác.
- `/resume`: kiểm tra và tiếp tục yêu cầu chưa hoàn thành mới nhất với các phê duyệt công cụ mới.
- `/new`: xóa cuộc trò chuyện được lưu trữ của cuộc trò chuyện hiện tại, đóng các công cụ của cuộc trò chuyện đó và khôi phục chế độ xác nhận.
- `/cancel`: hủy yêu cầu hiện tại, bao gồm cả xác nhận công cụ đang chờ xử lý.
- `/permistion`: hiển thị quyền. Sử dụng `/permistion full` để phê duyệt tự động hoặc `/permistion ask` để xác nhận.
- `/permission`: bí danh của `/permistion`.

Mỗi cuộc trò chuyện riêng tư có một phiên riêng, cũng được cách ly bởi bot ID. Phiên trực tiếp trong `~/.angela/sessions/telegram` và tiếp tục khởi động lại. Khởi động lại từ cùng một workspace để tiếp tục chúng. Bot chạy một yêu cầu cho mỗi cuộc trò chuyện và luôn phản hồi khi hủy trong khi mô hình hoạt động. Yêu cầu hết thời gian sau năm phút. Ctrl+C hủy các yêu cầu đang hoạt động và giải phóng các khóa phiên. Các câu trả lời dài được chia thành các tin nhắn Telegram đơn giản. Telegram không hiểu đầu ra mô hình là định dạng.

Mỗi cuộc trò chuyện kết nối các công cụ đầu cuối MCP giống như CLI. Đọc và chỉnh sửa tập tin sử dụng các lệnh đầu cuối. Công cụ chạy trên máy chủ bot, trong workspace đã chọn. workspace không phải là hộp cát hệ thống tập tin. Các cờ `--mcp-command` và `--mcp-arg` lặp đi lặp lại sẽ chọn một máy chủ stdio đáng tin cậy khác. Mỗi cuộc trò chuyện sở hữu một kết nối MCP riêng biệt. Các yêu cầu thông thường sẽ giữ trạng thái cuối cho đến khi được đặt lại, hủy hoặc tắt. Quá trình con công cụ không nhận được khóa nhà cung cấp hoặc bot Telegram token thông qua các biến môi trường Angela của chúng.

Chế độ xác nhận là mặc định. Bot gửi hành động hoàn chỉnh và workspace trước khi hiển thị các nút Cho phép và Từ chối. Mỗi nút cho phép một hành động trong cuộc trò chuyện riêng tư ban đầu. Các nút bị hủy, hoàn thành và thay thế không thể ủy quyền cho một hành động khác. Các hành động đang chờ xử lý phía máy chủ yêu cầu xác nhận thứ hai. Toàn quyền truy cập tự động xử lý cả hai giai đoạn xác nhận. Toàn quyền truy cập thuộc về một cuộc trò chuyện và kéo dài cho đến `/new`, thay đổi quyền rõ ràng hoặc khởi động lại quy trình. Chỉ lệnh Telegram được ủy quyền mới có thể thay đổi quyền. Đầu ra mô hình và các cuộc hội thoại đã lưu không thể thay đổi chúng.

Bot chỉnh sửa một thông báo tiến trình kèm theo suy nghĩ, trạng thái công cụ và kết quả rút gọn.
Bản xem trước công cụ sử dụng lại giới hạn ba dòng, 600 ký tự của CLI. mô hình và phiên đã lưu giữ lại kết quả đầy đủ.
Yêu cầu mới nhất, trạng thái phê duyệt, tiến trình có giới hạn và phản hồi cuối cùng chia sẻ ảnh chụp nhanh nguyên tử riêng tư của phiên.
`/status` remains available during a request. Short questions such as `việc lúc nãy đến đâu rồi?` also show this status.
Trạng thái yêu cầu mô tả sinh nội dung và phân phối. Trả lời được gửi không chứng minh rằng tác vụ được yêu cầu đã thành công.
Sau khi khởi động lại, các trạng thái hoạt động đã lưu sẽ xuất hiện dưới dạng bị gián đoạn. `/result` truy xuất câu trả lời đã lưu ngay cả khi việc gửi ban đầu không thành công.
`/resume` and `tiếp tục việc lúc nãy` reuse the original request and saved progress. They reset tool permissions to confirmation mode.
Quá trình khôi phục prompt yêu cầu kiểm tra trạng thái hiện tại trước khi thực hiện các hành động lặp lại. Các kết quả trước đó không chắc chắn đòi hỏi người dùng phải đặt câu hỏi.
Chính sách này phụ thuộc vào mô hình đã chọn. Nó không thể đảm bảo rằng một hành động bên ngoài sẽ chạy chính xác một lần sau khi xảy ra sự cố.
Các câu trả lời đã hoàn thành sử dụng `/result` thay vì một sinh nội dung khác. Quá trình khôi phục không bao giờ tự động bắt đầu sau khi khởi động lại.
Telegram chỉ có thể lấy lại khóa phiên khi chủ sở hữu được ghi lại của nó đã thoát trên cùng một host.
Chủ sở hữu trực tiếp, chủ sở hữu không xác định và khóa từ host khác vẫn được bảo vệ. Quá trình khôi phục khóa bị gián đoạn có thể để lại tệp `.lock.recovery`.
Nếu tệp này chặn quá trình khôi phục, trước tiên hãy xác nhận rằng tất cả người ghi đã dừng. Sau đó chỉ xóa điểm đánh dấu khôi phục đó và thử lại.
Trạng thái và kết quả vẫn được cách ly bởi bot, trò chuyện riêng tư và workspace. `/new` xóa siêu dữ liệu yêu cầu này bằng cuộc trò chuyện.
Các hành động đã chạy có thể giữ lại tác dụng phụ sau khi hủy. Việc hủy sẽ đóng kết nối MCP của cuộc trò chuyện đó.
Nó không gửi các cuộc hội thoại CLI hiện có tới Telegram. Việc gửi không thành công sẽ để lại câu trả lời được tạo trong phiên đã lưu.
Xác thực định tuyến và ủy quyền bằng các bài kiểm tra API cục bộ trước khi bạn kết nối bot thực.

<a id="telegram-tasks-and-memory"></a>

### Nhiệm vụ và bộ nhớ Telegram

Telegram hiển thị các công cụ tác vụ đã được xác thực, bộ nhớ cá nhân, keyword/semantic Recall và danh mục kỹ năng đã lưu dưới dạng trò chuyện trên thiết bị đầu cuối. Sử dụng `/tasks [all]`, `/today`, `/done ID`, `/cancel ID` và `/snooze ID 10m` mà không có yêu cầu mô hình. `/cancel` không có ID vẫn hủy sinh nội dung đang hoạt động. Các thay đổi về nhiệm vụ sẽ đợi cho đến khi sinh nội dung hiện tại kết thúc. Sử dụng các lệnh `/memory`, `/remember TEXT`, `/forget ID`, bộ nhớ search/settings và `/skills` để kiểm tra và kiểm soát store riêng tư. Nhập và chỉnh sửa các tệp kỹ năng thông qua CLI cục bộ. Telegram không thể nhập các đường dẫn host tùy ý thông qua các lệnh kỹ năng trực tiếp. Việc lưu kỹ năng mô hình yêu cầu phải có xác nhận trong tin nhắn của người dùng hiện tại. Đầu ra MCP không thiết lập xác minh kỹ năng trong host này.

Theo mặc định, các nhiệm vụ, sự kiện, kỹ năng, cài đặt Recall và chỉ mục được cách ly bởi bot và người dùng riêng trong `telegram/companions/BOT_ID/USER_ID` trong thư mục dữ liệu CLI. Các phiên trò chuyện giữ vị trí riêng biệt hiện có của chúng. Recall riêng tư tìm kiếm các sự kiện và kỹ năng đã lưu. Cuộc trò chuyện Telegram hiện tại vẫn giữ nguyên bối cảnh phiên hiện tại. Người dùng và bot khác không thể tìm kiếm store riêng tư này. `/new` xóa lịch sử hội thoại, giữ lại nhiệm vụ và bộ nhớ cá nhân.

Để sử dụng các tác vụ đầu cuối và bộ nhớ từ tài khoản Telegram của riêng bạn, hãy đặt rõ ràng:

```dotenv
ANGELA_TELEGRAM_SHARED_USER_ID=<one-allowed-numeric-user-id>
```

ID phải xuất hiện trong `ANGELA_TELEGRAM_ALLOWED_USER_IDS`. Chỉ người dùng đó mới chia sẻ thư mục dữ liệu đầu cuối và lịch sử Recall của nó. Những người dùng được phép khác giữ store riêng biệt. Việc thay đổi cài đặt này sẽ chọn một store khác mà không xóa cài đặt cũ. Hãy coi cài đặt này như quyền truy cập vào thông tin cá nhân, kỹ năng, nhiệm vụ và lịch sử thiết bị đầu cuối đã lưu của bạn.

Bot khởi động bộ lập lịch được phép của mỗi người dùng sau khi khởi động, bao gồm cả việc gửi quá hạn mà không có tin nhắn đến khác. Gửi Telegram thành công xác nhận đã gửi. Sự cố ngừng hoạt động khiến các yêu cầu có thể thử lại được và các bản phát hành ngừng hoạt động đang chờ xử lý. Thông báo chờ phản hồi và phê duyệt tích cực. Việc đóng Telegram host sẽ ngừng phân phối cho đến khi khởi động lại. Nhiệm vụ của thiết bị đầu cuối dùng chung và Telegram sử dụng một yêu cầu giao hàng, vì vậy host thành công đầu tiên sẽ chọn bề mặt phân phối.

<a id="checks"></a>

## Kiểm tra

```sh
pnpm -F @angela/cli typecheck
pnpm -F @angela/cli test
pnpm -F @angela/cli build
```

<a id="audio-device-selection"></a>

## Lựa chọn thiết bị âm thanh

Đặt các giá trị tùy chọn này trong `~/.config/angela/voice.env` để chọn thiết bị cho Angela:

```dotenv
ANGELA_VOICE_SOURCE=angela_echo_source
ANGELA_VOICE_SINK=angela_echo_sink
```

Các giá trị chấp nhận tên hoặc số sê-ri PipeWire Node. Không có phần ghi đè, Angela tạo ra một nguồn và phần chìm được lọc tiếng vang riêng. Bộ lọc sử dụng micrô và loa của hệ thống hiện tại. Mỗi phiên thoại có tên thiết bị duy nhất. Sử dụng `wpctl status -n` để kiểm tra tên thiết bị. Khởi động lại chế độ giọng nói sau khi thay đổi cấu hình. Lựa chọn thiết bị chỉ ảnh hưởng đến Angela. Nó không thay đổi mặc định của hệ thống.

Để khử tiếng vang, PipeWire cung cấp [module-echo-cancel](https://docs.pipewire.org/page_pulse_module_echo_cancel.html). Angela tự động tạo và xóa bộ lọc riêng. Đối với bộ lọc được quản lý thủ công, hãy sử dụng dịch vụ tương thích PulseAudio:

```sh
pactl load-module module-echo-cancel source_name=angela_echo_source sink_name=angela_echo_sink aec_method=webrtc
```

Lệnh in một mô-đun ID. Giữ ID đó để xóa mô-đun này sau:

```sh
pactl unload-module MODULE_ID
```

route Angela thông qua cả hai tên trên để bộ lọc nhận âm thanh micro và tham chiếu phát lại. Với cả hai giá trị thiết bị được định cấu hình, gián đoạn giọng nói sẽ tự động bắt đầu. Sử dụng cặp nguồn và bộ thu âm được lọc tiếng vang để phát lại loa. Lựa chọn thiết bị một mình không loại bỏ tiếng vang. Đối với tai nghe, hãy đặt `ANGELA_VOICE_BARGE_IN=1` không có nguồn ảo hoặc bồn rửa. Đặt `ANGELA_VOICE_BARGE_IN=0` để tắt gián đoạn bất kể lựa chọn thiết bị.

Khi bài phát biểu bắt đầu, Angela hủy sinh nội dung, bài phát biểu được xếp hàng đợi, phát lại và công cụ đang chờ phê duyệt. thu nhận dữ liệu bị gián đoạn vẫn tồn tại thông qua phiên mã. Lượt tiếp theo bắt đầu sau khi lượt trước ổn định và lưu. Các hành động công cụ đã hoàn thành vẫn có hiệu lực. lần sinh nội dung bị gián đoạn vẫn giữ nguyên trạng thái khôi phục phiên hiện có của chúng. Tin nhắn trả lời hoàn chỉnh vẫn được lưu ngay cả khi quá trình phát lại bị gián đoạn. Một bản ghi trống sẽ bắt đầu nghe lại. Ctrl+C loại bỏ thu nhận dữ liệu và quay lại chế độ văn bản. Văn bản nói không bao giờ hoạt động như một lệnh CLI hoặc cấp quyền cho công cụ. `/chat`, Ctrl+C, lỗi dịch vụ, thoát bình thường và SIGTERM xóa bộ lọc mà Angela đã tạo. Các thiết bị do người dùng định cấu hình và các bộ lọc được tải thủ công không thay đổi. Chế độ tai nghe rõ ràng (`ANGELA_VOICE_BARGE_IN=1`) bỏ qua chức năng khử tiếng vang tự động. Việc tắt tính năng gián đoạn (`ANGELA_VOICE_BARGE_IN=0`) cũng bỏ qua tính năng khử tiếng vang tự động. Nếu chỉ cài đặt ghi đè một thiết bị, Angela sẽ giữ các lượt nghe và nói riêng biệt. Việc buộc phải hủy quá trình hoặc sự cố máy sẽ ngăn cản việc dọn dẹp. Khởi động lại dịch vụ âm thanh sẽ loại bỏ các mô-đun còn lại.

<a id="request-privacy"></a>

## Yêu cầu quyền riêng tư

`RuntimeSession.send` giải quyết yêu cầu bảo mật trước thu nhận dữ liệu hoặc mô hình sinh nội dung tự động. Chỉ thị no-store bằng tiếng Việt và tiếng Anh cũng như tính năng phát hiện thông tin xác thực có giới hạn bảo vệ yêu cầu hoàn chỉnh. Chính sách công cụ sử dụng nguồn gốc này trước các đoạn trích được mô hình chọn. Diễn giải không thể cho phép viết. Việc ghi bị từ chối trả về lý do không có giá trị được bảo vệ và không tạo ra sự kiện lưu được xác minh.

Yêu cầu được bảo vệ bỏ qua quan sát, tập, học tự động, trang, thông tin cá nhân, kỹ năng, điểm kiểm tra dự án và ghi nhiệm vụ. Khám phá MCP vẫn có sẵn. Các yêu cầu được bảo vệ không thể gọi các hoạt động MCP tùy ý vì hiệu ứng lưu trữ của chúng không xác định. Việc vô hiệu hóa bộ nhớ cá nhân cũng từ chối việc ghi cá nhân dưới khóa lưu trữ. Các điểm kiểm tra dự án độc lập và các nhiệm vụ được yêu cầu rõ ràng vẫn có sẵn cho các miền riêng của chúng. Mục tiêu học tập cá nhân không thể sử dụng những store đó làm bộ nhớ thay thế.

Cuộc hội thoại vẫn giữ lại các lượt và tóm tắt được bảo vệ trong RAM. Các tệp phiên chỉ giữ lại tiền tố trước khi bảo vệ. Điểm kiểm tra khôi phục Telegram bỏ qua văn bản, tiến trình và câu trả lời yêu cầu được bảo vệ. Telegram giữ lại các cuộc hội thoại làm việc riêng tư trong bộ đệm có giới hạn hiện có cho đến khi `/new`, trục xuất hoặc host tắt. Các lượt sau kế thừa sự bảo vệ vì họ có thể rút ra các sự kiện từ bối cảnh trước đó. Bắt đầu cuộc trò chuyện mới để tiếp tục thu nhận dữ liệu lâu bền. Những ký ức không liên quan hiện có vẫn còn nguyên vẹn.

Tính năng phát hiện sử dụng các cụm từ xác định và định dạng thông tin xác thực chứ không phải phân loại ngữ nghĩa hoặc hệ thống DLP hoàn chỉnh. Các yêu cầu nhà cung cấp vẫn bao gồm văn bản cuộc hội thoại hiện tại. Ranh giới này kiểm soát store bền cục bộ của Angela. Người gửi bên ngoài Zalo giữ lại ranh giới runtime riêng biệt của họ mà không có bộ nhớ chủ sở hữu, Recall, nhiệm vụ, MCP hoặc thu nhận dữ liệu dài hạn.

<a id="personal-memory"></a>

## Ký ức cá nhân

Bộ nhớ cá nhân Các sự kiện và tùy chọn store trên các phiên CLI sử dụng cùng một thư mục dữ liệu. Nó hoạt động cho văn bản và giọng nói. Bộ nhớ học tập desktop và bộ nhớ Telegram tách biệt. Không cần dịch vụ bổ sung hoặc AI mô hình cục bộ. Recall sử dụng chỉ mục SQLite được nhúng.

Sử dụng các lệnh tương tác sau:

```text
/remember Tôi thích câu trả lời ngắn bằng tiếng Việt
/memory
/memory edit ID Tôi thích giải thích chi tiết bằng tiếng Việt
/forget ID
/memory auto off
/memory auto on
/memory off
/memory on
```

`/memory` hiển thị số lượng bản ghi, ID bản ghi đầy đủ, văn bản và trạng thái kích hoạt. Thay thế `ID` bằng một ID được liệt kê.
Lệnh lưu và chỉnh sửa trực tiếp hiển thị văn bản đã lưu và ID sau khi ghi thành công. Họ không gọi AI nhà cung cấp.
Automatic memory is on by default. Clear statements such as “Tôi tên là Đăng” can be saved without a remember request.
Trò chuyện hiện có mô hình chọn các dữ kiện lâu dài ở góc nhìn thứ nhất và viết chúng thông qua công cụ native của nó. Không có yêu cầu trích xuất riêng biệt nào được thêm vào.
Sử dụng `/memory auto off` để chỉnh sửa chỉ theo yêu cầu rõ ràng trong khi vẫn giữ sẵn các thông tin đã lưu. `/memory auto on` khôi phục lựa chọn tự động.
`/memory off` vô hiệu hóa các công cụ ngữ cảnh cá nhân và bộ nhớ cá nhân đã lưu. Việc bật lại sẽ duy trì cài đặt lựa chọn tự động của bạn.
Lịch sử và kỹ năng có các điều khiển Recall độc lập. Điểm kiểm tra dự án vẫn thuộc `/project`.
Tâm trạng tạm thời, lệnh nhiệm vụ, trích dẫn, ví dụ giả định và đặc điểm được suy luận đều bị loại trừ bởi hướng dẫn mô hình.
Chỉ hành vi lặp đi lặp lại không tạo nên sự ưa thích lâu dài. Angela hỏi trước khi biến suy luận thành sự thật đã được lưu lại.
Xóa bản ghi cập nhật tự sửa lỗi phù hợp. Những xung đột mơ hồ đòi hỏi phải làm rõ và các dữ kiện tương đương sẽ sử dụng lại hồ sơ hiện có.
Các quyết định ngữ nghĩa này phụ thuộc vào mô hình đã chọn. Kiểm tra `/memory` để kiểm tra xem nó thực sự đã lưu những gì.
Việc lưu mô hình yêu cầu trích đoạn nguyên văn từ tin nhắn hiện tại của bạn. Các sự kiện được diễn giải hoặc suy luận đều bị bác bỏ.
CLI hiển thị thông báo bộ nhớ sau mỗi lần ghi công cụ mô hình thành công, bao gồm cả lượt chuyển đổi bằng giọng nói.
Thông báo đã lưu và cập nhật hiển thị văn bản và ghi lại ID. Thông báo đã xóa hiển thị bản ghi ID.
Các chỉnh sửa bị từ chối hiển thị thông báo lỗi và lý do. Những thông báo này xuất hiện ở đầu ra của thiết bị đầu cuối, các câu trả lời bằng giọng nói bên ngoài.
Trả lời không thành công hoặc bị hủy sẽ không hoàn tác việc ghi bộ nhớ đã hoàn thành. Thông báo không phụ thuộc vào việc mô hình xác nhận thành công.
Sử dụng `/memory` để kiểm tra các bản ghi đã lưu.
Bản ghi giọng nói được chuyển đến mô hình. Chỉ gõ lệnh gạch chéo trực tiếp chỉnh sửa bộ nhớ.

Bộ nhớ chứa tối đa 50 bản ghi, với 500 ký tự cho mỗi bản ghi. Bản sao chính xác sẽ lưu lại bản ghi hiện có. Nó được lưu trữ dưới dạng bản rõ riêng tại `<data-dir>/memory/personal.json`. Thư mục dữ liệu mặc định là `~/.angela/sessions`. Thông tin đã lưu sẽ được gửi đến cuộc trò chuyện hiện được chọn nhà cung cấp. Không lưu thông tin xác thực hoặc bí mật. Thông tin hồ sơ cốt lõi đã bật và hồ sơ cá nhân có liên quan được làm mới trước mỗi yêu cầu CLI. Việc tắt nó sẽ xóa ngữ cảnh và công cụ đã lưu khỏi các yêu cầu sau này. Tin nhắn hội thoại trước đó, kết quả công cụ và lịch sử phiên đã lưu vẫn không thay đổi sau khi tắt hoặc quên một dữ kiện. Một phiên mới bắt đầu một cuộc trò chuyện làm việc mới. Thông tin đã lưu và các trang bộ nhớ đã chọn vẫn có sẵn cho Recall. Việc tiếp tục phiên cũ vẫn có thể hiển thị các tin nhắn trước đó. Xóa phiên trò chuyện không xóa bộ nhớ cá nhân.

Các chỉnh sửa công cụ song song trong một quy trình CLI được tuần tự hóa. Mỗi lần ghi sẽ khóa tệp bộ nhớ và thay thế nó một cách nguyên tử. Những người viết khác báo cáo lỗi khóa thay vì mất các chỉnh sửa. Dữ liệu không thể đọc được vẫn còn nguyên. Trò chuyện tiếp tục mà không có bộ nhớ cho câu trả lời đó và hiển thị cảnh báo. Chỉnh sửa bộ nhớ vẫn bị chặn cho đến khi dữ liệu được sửa chữa. Sau khi xảy ra sự cố trong quá trình, `memory/personal.lock` bị bỏ rơi có thể chặn các chỉnh sửa. Trước khi xóa khóa đó theo cách thủ công, hãy đảm bảo không có quá trình CLI nào đang ghi bộ nhớ.

Thiết kế bộ nhớ cá nhân sử dụng ngữ cảnh cốt lõi có giới hạn như [các khối bộ nhớ Letta](https://docs.letta.com/v1-sdk/memory/memory-blocks), trích xuất có chọn lọc như [Mem0](https://docs.mem0.ai/core-concepts/memory-operations/add), và tách dữ kiện lâu dài khỏi bản ghi hội thoại như [OpenClaw](https://docs.openclaw.ai/concepts/memory-architecture). Angela dùng kho lưu trữ và runtime công cụ cục bộ hiện có. Không thêm các framework này vào gói phụ thuộc. Các bản ghi cá nhân được chọn đi vào ngữ cảnh mô hình kèm ID. Đoạn trích Recall cũng mang ngày và phiên bản nguồn. Danh tính và hành vi trợ lý được giữ trong system prompt gốc. Bộ nhớ người dùng không thể thay đổi cấu hình phê duyệt công cụ.

<a id="memory-v2"></a>

## Bộ nhớ V2

Bộ nhớ làm việc vẫn ở trong cuộc trò chuyện và điểm kiểm tra đang hoạt động.
Các yêu cầu có ý nghĩa, kết quả công cụ đã được xác minh, thay đổi nhiệm vụ, quyết định và lỗi tạo ra các trang nhiều tập có giới hạn mà không cần lệnh gọi mô hình bổ sung.
Technical facts use semantic pages. Explicit `Workflow: ...` or `Quy trình: ...` statements can create procedural pages.
Ký ức Cá nhân hiện có vẫn là chủ sở hữu của các thông tin cá nhân rõ ràng.

Các trang chia sẻ `memory/recall.sqlite`, chỉ mục FTS5 và phép chiếu vectơ tùy chọn của nó. Các trang được thay thế nằm ngoài Recall bình thường. Các tập phim lạnh được thu gọn trong khi vẫn bảo toàn các quyết định có giới hạn và chẩn đoán theo nghĩa đen. Kiến thức được ghim và bền lâu không tự động già đi.

```text
/memory status
/memory search SQLite
/memory read memory:PAGE_ID
/memory consolidate
/memory age
/memory purge memory:PAGE_ID
```

`/memory consolidate` tùy chọn làm phong phú thêm tập hiện tại bằng nhà cung cấp đã được định cấu hình. Các bản tóm tắt cơ bản vẫn có sẵn khi nhà cung cấp đó bị lỗi. `/memory age` chạy một lượt nén có giới hạn. `/memory purge` xóa xác nhận quyền sở hữu, các phiên bản của nó và các trang dẫn xuất downstream. Thay thế `memory:PAGE_ID` bằng ID được trả về bằng tìm kiếm bộ nhớ.

thu nhận dữ liệu tự động yêu cầu bật bộ nhớ cá nhân, tính năng ghi tự động và Recall. `/memory auto off` dừng thu nhận dữ liệu tự động. Các trang hiện tại vẫn có thể tìm kiếm được trong khi bộ nhớ cá nhân và Recall vẫn được bật. `/memory history off` kiểm soát việc lập chỉ mục kho lưu trữ thô. `/memory semantic off` kiểm soát việc truy xuất nhúng. Các công tắc này không vô hiệu hóa các tầng trang mới. Người dùng Telegram riêng tư giữ các cơ sở dữ liệu riêng biệt trừ khi tùy chọn chia sẻ chủ sở hữu hiện tại được định cấu hình rõ ràng. Trò chuyện desktop renderer vẫn giữ lại luồng bộ nhớ hiện có.

Xem [kiến trúc](../../docs/ai/adr/angela-memory-v2.md) và [báo cáo đánh giá](../../docs/ai/audits/angela-memory-v2.md) để biết các bất biến, phép đo và hạn chế.

<a id="project-memory"></a>

## Bộ nhớ dự án

Bộ nhớ dự án giữ một điểm kiểm tra công việc nhỏ gọn trên các phiên CLI: mục tiêu, trạng thái, quyết định, công việc đã hoàn thành được báo cáo, trở ngại và bước tiếp theo. Nó độc lập với bộ nhớ cá nhân, lịch sử trò chuyện và trình theo dõi tác vụ trong quá trình sử dụng máy tính. Các thư mục lồng nhau trong một kho lưu trữ Git có chung một điểm kiểm tra. Không có Git, thư mục làm việc chuẩn sẽ xác định dự án. Các bản sao và cây làm việc riêng biệt có các điểm kiểm tra riêng biệt. Bí danh liên kết tượng trưng phân giải vào cùng một thư mục chuẩn.

```text
/project
/project off
/project on
/project clear
```

`/project` hiển thị dự án đã chọn, điểm kiểm tra đã lưu, bản sửa đổi và phiên nguồn. `/project off` xóa bối cảnh và công cụ của nó khỏi các yêu cầu tiếp theo mà không xóa tác phẩm đã lưu. `/project clear` chỉ xóa điểm kiểm tra này. Các tệp dự án, lịch sử trò chuyện và bộ nhớ cá nhân không thay đổi. Văn bản nói sẽ được chuyển tới mô hình. Chỉ gõ lệnh trực tiếp vô hiệu hóa hoặc xóa bộ nhớ dự án.

Cuộc trò chuyện mô hình sử dụng `project_memory` sau một tiến trình có ý nghĩa. Không yêu cầu thêm mô hình hoặc yêu cầu trích xuất nền. Mỗi lần lưu sẽ thay thế điểm kiểm tra có giới hạn và kiểm tra bản sửa đổi dự kiến ​​​​của nó dưới khóa tệp bộ nhớ dùng chung. Các phiên đồng thời nhận được điểm kiểm tra hiện tại về xung đột để chúng có thể hợp nhất tác phẩm mới hơn trước khi thử lại. Công cụ này yêu cầu trích dẫn nguồn từ thông báo của người dùng hiện tại hoặc đầu ra MCP do host quan sát trong lượt đó. Các câu trả lời mô hình và kết quả của công cụ bộ nhớ không thể đóng vai trò là bằng chứng MCP được quan sát. Bằng chứng thiết lập nguồn gốc, không phải bằng chứng cho mọi tuyên bố tóm tắt. mô hình phải phân biệt các kế hoạch, báo cáo của người dùng, lỗi và các hành động đã hoàn thành của công cụ. Các quyết định ngữ nghĩa này phụ thuộc vào mô hình đã chọn. Các điểm kiểm tra cũ hơn là các báo cáo lịch sử không đáng tin cậy. Angela phải kiểm tra các tệp trực tiếp, trạng thái Git và các bài kiểm tra có liên quan trước khi dựa vào các xác nhận hoàn thành trước đó. Các lượt bị gián đoạn có thể đã lưu một trạm kiểm soát. Xác minh hiệu ứng công cụ thực tế trước khi lặp lại công việc.

Các tệp điểm kiểm tra riêng tư trực tiếp trong `<data-dir>/memory/projects/`, được lập chỉ mục bằng hàm băm của đường dẫn dự án chuẩn. Chúng chứa tối đa tám quyết định, mười mục đã hoàn thành, năm mục tiêu trở ngại và có giới hạn cũng như văn bản bước tiếp theo. Các điểm kiểm tra đã kích hoạt sẽ được gửi đến mô hình đã chọn. Không sử dụng bí mật store hoặc bản ghi thô. Các tập tin điểm kiểm tra không thể đọc được vẫn còn nguyên. Trò chuyện tiếp tục mà không có bối cảnh dự án và hiển thị cảnh báo. Bộ nhớ cá nhân và dự án sử dụng lại cùng một trình ghi tệp nguyên tử, quyền riêng tư và hàng đợi ghi trên mỗi quy trình. Sau sự cố, chỉ xóa dự án `.lock` bị bỏ rơi sau khi kiểm tra xem người viết dự án đó đã dừng chưa.

<a id="long-conversation-context"></a>

## Bối cảnh hội thoại dài

CLI lưu giữ toàn bộ lịch sử hội thoại trên đĩa và chuẩn bị chế độ xem yêu cầu nhỏ hơn khi các lượt cũ hơn vượt quá ngân sách ngữ cảnh của nó. `/context` hiển thị ngân sách đã định cấu hình, token đầu vào ước tính, dự trữ đầu ra, lượt tóm tắt và số lần nén. Đặt `ANGELA_CONTEXT_TOKENS` trước khi bắt đầu Angela để chọn ngân sách từ 4096 đến 2000000 (mặc định: 32000). Chọn ngân sách phù hợp với mô hình đã chọn của bạn. Cài đặt này không phát hiện hoặc thay đổi dung lượng cửa sổ ngữ cảnh của nó.

Ước tính đầu vào sử dụng độ dài byte UTF-8 chia cho ba, bao gồm các thông báo được chiếu và lược đồ công cụ tùy chỉnh. Chúng là những ước tính theo kinh nghiệm, không phải nhà cung cấp token. Tải trọng đa phương thức và chi phí dành riêng cho nhà cung cấp có thể khác nhau. CLI dự trữ tới 4096 token ước tính cho đầu ra hoặc một phần tư ngân sách nhỏ hơn. Khoản dự trữ là khoảng trống kế toán, không phải là giới hạn đầu ra nhà cung cấp-token.

Khi cần, Angela gọi mô hình đã được định cấu hình mà không cần công cụ để tóm tắt các lượt hoàn chỉnh cũ hơn. Mỗi bản tóm tắt giữ lại các yêu cầu, quyết định, đường dẫn, kết quả được báo cáo, thất bại và công việc chưa được giải quyết trong vòng 3000 ký tự. Lần lượt người dùng mới nhất, bối cảnh hệ thống và bộ nhớ cũng như các vòng công cụ tiếp theo vẫn được giữ nguyên. Các cuộc gọi công cụ và kết quả trong các lượt trợ lý được giữ lại sẽ ở cùng nhau. Tóm tắt là các báo cáo lịch sử không đáng tin cậy, không phải là quyền của công cụ hoặc bằng chứng cho thấy các hành động trước đó vẫn khớp với workspace. Họ có thể mất chi tiết. Lịch sử phiên đầy đủ vẫn có sẵn để phục hồi.

Tóm tắt chỉ thêm các yêu cầu API khi cần nén. Quá trình lưu trữ bản tóm tắt cuộn của nó cho các lượt sau. Tóm tắt không được lưu dưới dạng lịch sử hoặc bộ nhớ cá nhân. Việc tiếp tục một phiên lớn sẽ xây dựng lại bản tóm tắt và có thể phát sinh các yêu cầu mới. Việc hủy, tóm tắt trống và tóm tắt quá khổ sẽ dừng yêu cầu mà không thay thế lịch sử. Nếu đầu vào hiện tại, bối cảnh hệ thống bắt buộc hoặc một lượt lịch sử không thể phù hợp, hãy rút ngắn nó hoặc bắt đầu một phiên mới. Quá trình chuẩn bị bối cảnh chạy trước luồng sinh nội dung. Đầu ra dao tích lũy bên trong luồng đó vẫn có thể vượt quá cửa sổ nhà cung cấp. Bản phát hành này không cắt bớt đầu ra của công cụ đang hoạt động hoặc tự động thử lại các lỗi giới hạn ngữ cảnh của nhà cung cấp.

<a id="diagnose-a-cli-setup"></a>

## Chẩn đoán thiết lập CLI

Chạy `angela doctor` trước khi bắt đầu trò chuyện hoặc `angela doctor --json` để có kết quả có cấu trúc. Sử dụng `--locale en|vi`, `--config`, `--data-dir`, `--cwd`, `--model` và `--base-url` với ý nghĩa tương tự như trong trò chuyện. `angela doctor --help` liệt kê các tùy chọn này.

Lệnh kiểm tra cấu hình nhà cung cấp, ngân sách ngữ cảnh, quyền thư mục, bộ nhớ cá nhân và dự án, phiên đã lưu, tệp khóa, tình trạng giọng nói, lệnh âm thanh và các thiết bị âm thanh có sẵn. Việc thiếu bộ nhớ hoặc lịch sử là điều bình thường khi thiết lập mới. Nó bảo vệ các tập tin bị hỏng và khóa. Một chiếc khóa có thể thuộc về một người viết đang chạy; hãy kiểm tra quá trình đó trước khi tự mình tháo khóa.

Đối với nhà cung cấp tương thích với OpenAI, nó sẽ gửi yêu cầu có giới hạn GET đến điểm cuối `/models` được định cấu hình với khóa API được định cấu hình. Nó từ chối chuyển hướng và không in thông tin xác thực hoặc nội dung lỗi nhà cung cấp. Nó không gửi prompt hoặc bộ nhớ và không đưa ra yêu cầu sinh nội dung. nhà cung cấp không có kiểm tra này sẽ nhận được cảnh báo. mô hình được liệt kê không chứng minh rằng sinh nội dung hoạt động hoặc các quyền của nó là đủ.

Doctor không ghi tập tin, khởi động dịch vụ, ghi âm, phát âm thanh hoặc tải các mô-đun khử tiếng vang. Kiểm tra quyền thư mục không kiểm tra khả năng ghi thực tế hoặc dung lượng trống. Danh sách thiết bị và sức khỏe giọng nói không xác minh chất lượng phiên âm, giọng nói hoặc micrô. Sử dụng `/voice` cho một cuộc trò chuyện thực sự để kiểm tra những điều đó và loại bỏ tiếng vang. Kiểm tra tiếng vang luôn báo cáo giới hạn này như một cảnh báo.

Mã thoát 1 có nghĩa là có ít nhất một lỗi; riêng cảnh báo trả về 0. JSON chứa `healthy` (không có lỗi) và `checks`, mỗi `id`, `status` và `message` được bản địa hóa.


<a id="memory-stores-and-reusable-skills"></a>

## Bộ nhớ store và các kỹ năng tái sử dụng

Thông tin cá nhân vẫn còn trong `memory/personal.json`. Các trường `core` và `source` tùy chọn mô tả các sự kiện và bằng chứng được ghim cho mỗi chỉnh sửa. Sự thật chưa được phân loại không có chỉ định cốt lõi. Lệnh trực tiếp ghi lại văn bản của họ làm bằng chứng. mô hình ghi cũng ghi lại phiên nguồn. Sử dụng `/memory pin ID` và `/memory unpin ID` để kiểm soát cấu hình lõi, giới hạn ở 4000 ký tự.

Quy trình làm việc có thể tái sử dụng trực tiếp trong `memory/skills/NAME/SKILL.md` với các trường YAML `name` và `description`. Hướng dẫn kỹ năng mô tả thời điểm sử dụng quy trình làm việc, các bước, cạm bẫy và xác minh. Tiêu đề ghi lại báo giá xác minh mới nhất và thời gian cập nhật. Băm tệp xác định các phiên bản để phát hiện xung đột. Nhập rõ ràng và mô hình tiết kiệm sử dụng tính năng thay thế nguyên tử và khóa độc quyền cho mỗi kỹ năng. Nhập khẩu tạo ra những kỹ năng mới. Cập nhật một kỹ năng hiện có yêu cầu phiên bản hiện tại của nó. Các tệp dự án được phát hiện bởi agent không tự động tham gia store đáng tin cậy này. Kỹ năng là hướng dẫn có thể tái sử dụng, không bao giờ là bằng chứng cho thấy nhiệm vụ hiện tại đã thành công hay được phép chạy một công cụ.

<a id="recall-index"></a>

## Chỉ số Recall

CLI duy trì chỉ mục dẫn xuất riêng tại `memory/recall.sqlite` bằng cách sử dụng Node.js SQLite và FTS5.
Cần có Node.js 22.13 hoặc mới hơn cho tính năng này. Chỉ mục không bao giờ thay thế các tệp nguồn có thẩm quyền.
FTS5 ranks keyword matches with BM25. Vietnamese keywords support accents and common unaccented spelling, including `đ`.

Thông tin cá nhân, các kỹ năng được kích hoạt và các tin nhắn CLI user/assistant trước đó có danh tính nguồn riêng biệt. Tải trọng công cụ thô, prompt hệ thống, lịch sử Telegram và cấu hình nhà cung cấp được loại trừ khỏi chỉ mục này. Lịch sử thường nằm trong workspace hiện tại. Các tìm kiếm workspace chéo rõ ràng có thể tìm thấy các phiên CLI khác trong cùng thư mục dữ liệu. Thông báo phiên hiện tại vẫn nằm trong trình quản lý bối cảnh hiện có và không được sao chép vào Recall. Các đoạn trích có ghi nguồn, phiên bản và thời gian cập nhật. Ngày của phiên mô tả các cập nhật của phiên chứ không phải dấu thời gian của từng tin nhắn.

Thông báo tập tin lên lịch cập nhật lịch sử gia tăng. Điều chỉnh định kỳ phát hiện các thông báo bị bỏ lỡ. Các nguồn không thay đổi giữ lại các vectơ được lưu trong bộ nhớ cache. Lô nhúng nền mang lại kết quả giữa các yêu cầu. Mỗi lần đọc sẽ kiểm tra lại nguồn có thẩm quyền và công tắc bật của nó trước khi trả về dữ liệu. Các tệp không hợp lệ vẫn không bị ảnh hưởng và tạo trạng thái Recall một phần. Các bản cập nhật nguyên tử và khóa ghi độc quyền tiếp tục bảo vệ các tệp nguồn.

Truy xuất ngữ nghĩa được chọn tham gia thông qua `ANGELA_EMBEDDING_MODEL`. `ANGELA_EMBEDDING_BASE_URL` chọn điểm cuối nhúng tương thích với OpenAI. Nếu không thì cơ sở trò chuyện URL sẽ được sử dụng. `ANGELA_EMBEDDING_API_KEY` chọn thông tin xác thực của nó. Thông tin đăng nhập trò chuyện chỉ được kế thừa cho cùng một nguồn gốc. Việc bật tính năng nhúng sẽ gửi văn bản được lập chỉ mục, bao gồm các tin nhắn user/assistant lịch sử, tới điểm cuối đó. CLI không cài đặt mô hình cục bộ. Thiếu cấu hình sử dụng tìm kiếm từ khóa. Yêu cầu không thành công báo cáo trạng thái ngữ nghĩa bị suy giảm và giữ lại quyền truy cập từ khóa. Yêu cầu từ chối chuyển hướng và kích thước phản hồi bị ràng buộc, kích thước vectơ và thời gian thực hiện. Các chỉ mục phân biệt điểm cuối nhúng, mô hình và kích thước. Thứ hạng từ khóa và cosine kết hợp thông qua phản ứng tổng hợp thứ hạng đối ứng. Các đoạn trích trùng lặp và các lần truy cập nguồn lặp lại bị hạn chế trước khi chọn ngữ cảnh.

Ngân sách trích đoạn tách biệt với hướng dẫn bộ nhớ cố định và danh mục kỹ năng có giới hạn. Sự thật cốt lõi được ưu tiên. Các tài liệu dài vẫn có thể đọc được thông qua các công cụ Recall rõ ràng. `/memory used` báo cáo các nguồn được cung cấp, không phải bằng chứng cho thấy mô hình dựa vào mọi nguồn hoặc các kết quả cũ vẫn đúng.


<a id="automatic-recall-and-controls"></a>

## Recall tự động và điều khiển

Lần lượt văn bản và giọng nói chia sẻ Recall tự động. host cung cấp thông tin hồ sơ được ghim, các đoạn trích phù hợp và danh mục kỹ năng có giới hạn trước sinh nội dung. mô hình có thể tìm kiếm các nguồn bổ sung và đọc các kỹ năng dài trong các trang. Nó phải tải một kỹ năng hoàn chỉnh có liên quan trước khi thực hiện theo quy trình làm việc của nó. Kết quả của công cụ tìm kiếm chứa đoạn có giới hạn. `memory_read` trả về tối đa 4000 ký tự và phần bù tiếp tục. Các đoạn trích tự động mặc định có 12000 ký tự, với các thông tin hồ sơ được ghim được ưu tiên. Hướng dẫn cố định và danh mục kỹ năng có giới hạn riêng. Ngân sách này không thay đổi ngân sách ngữ cảnh mô hình do `ANGELA_CONTEXT_TOKENS` kiểm soát. `/memory status` cũng báo cáo độ trễ tìm kiếm hoàn thành mới nhất, kích thước ngữ cảnh đã chuẩn bị và số lượng nguồn được chọn.

```text
/memory pin ID
/memory unpin ID
/memory search cách chạy dự án
/memory search-all lỗi hôm qua
/memory read SOURCE_ID
/memory used
/memory status
/memory budget 12000
/memory history off
/memory semantic off
/memory recall off
/memory recall on
/memory reindex
/skills
/skills show NAME
/skills import /path/to/SKILL.md
/skills edit NAME /path/to/instructions.md
/skills off NAME
/skills on NAME
/skills forget NAME
```

`/memory history off` xóa lịch sử khỏi Recall mà không xóa phiên. Bật nó lên lập chỉ mục cho chúng một lần nữa. `/memory recall off` vô hiệu hóa tính năng tìm kiếm và trích đoạn tự động. Hồ sơ cá nhân được ghim và các điều khiển bộ nhớ cá nhân hiện có vẫn khả dụng. `/memory auto off` kiểm soát việc ghi mô hình, độc lập với Recall. `/memory off` vô hiệu hóa tất cả các công cụ bối cảnh cá nhân và bộ nhớ cá nhân. `/skills off` vô hiệu hóa kỹ năng store. Các kỹ năng cá nhân có thể bị vô hiệu hóa mà không cần xóa tài liệu của họ. `/skills edit` đọc văn bản hướng dẫn từ tệp đã chọn và giữ nguyên tên cũng như mô tả kỹ năng. `/skills forget` xóa tài liệu kỹ năng đã chọn và chỉ mục dẫn xuất của nó. Nó không xóa các cuộc hội thoại lịch sử đã đề cập đến quy trình làm việc đó.

Các dữ kiện mới được mô hình lưu bao gồm trích dẫn nguồn và phiên ID. mô hình đánh dấu các thông tin nhận dạng và giao tiếp độc lập với nhiệm vụ là cốt lõi. Sử dụng pin/unpin để sửa trực tiếp lựa chọn đó. Các sự kiện chưa được phân loại hiện có vẫn có thể tìm kiếm được. host cung cấp `skill_save` cho quy trình công việc có thể tái sử dụng với bằng chứng của người dùng hiện tại hoặc đầu ra MCP được quan sát thành công. Bản ghi kỹ năng bao gồm loại nguồn và phiên. Kiểm tra kích thước tuần tự chạy trước khi thay thế nguyên tử để bảo toàn các tệp nguồn có thể đọc được. Các kế hoạch được đề xuất, câu trả lời của mô hình và kết quả của công cụ bị lỗi không thể dùng làm bằng chứng xác minh host. Việc diễn giải ngữ nghĩa của xác nhận của người dùng và chất lượng quy trình làm việc vẫn phụ thuộc vào mô hình đã chọn. Các kỹ năng đã lưu không đào tạo lại trọng lượng mô hình.

Lập chỉ mục phiên store các đoạn trích chồng chéo cộng với tổng quan trích xuất từ ​​các thông báo mở và đóng. Những cái nhìn tổng quan này trích dẫn những thông điệp thực tế. Chúng không phải là các tuyên bố hoàn thiện hoặc bằng chứng cho thấy các tác dụng phụ của công cụ cũ vẫn đúng. Truy vấn Today/yesterday sử dụng ngày theo lịch cục bộ và ngày cập nhật phiên được ghi lại. Ngày của tin nhắn riêng lẻ không có sẵn ở định dạng phiên hiện có.

Việc quên hoặc cập nhật thông tin cá nhân sẽ loại bỏ các đoạn trích và vectơ dẫn xuất của chúng. Các sự kiện không thay đổi vẫn giữ nguyên vectơ của chúng. Việc xóa một phiên cũng sẽ xóa nguồn dẫn xuất của nó. Các tệp được thay đổi bởi quy trình CLI khác sẽ được xác thực lại trước khi sử dụng. Nếu quá trình dọn dẹp chỉ mục không thành công sau khi ghi nguồn, CLI sẽ báo cáo kết quả một phần đó. Reindex sau khi giải quyết được lỗi lưu trữ. `/memory used` ẩn văn bản được lưu trong bộ nhớ đệm khi nguồn sau đó bị xóa, vô hiệu hóa hoặc thay đổi. Các tệp nguồn và lịch sử phiên đã lưu có các điều khiển xóa riêng biệt. Việc quên đi một sự thật sẽ không xóa các tin nhắn trước đó của người dùng hoặc các bản sao lưu bên ngoài. Các tác vụ nền dừng khi tắt CLI và hủy bỏ các yêu cầu nhúng đang chờ xử lý. Không có yêu cầu trò chuyện-sinh nội dung bổ sung nào được thêm vào để lập chỉ mục.

CLI Recall tuân theo sự phân tách hồ sơ, kỹ năng và tìm kiếm hội thoại trong [Hermes](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory), tải kỹ năng lũy ​​tiến trong [Pi](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md) và truy xuất kết hợp trong [OpenClaw](https://docs.openclaw.ai/concepts/memory-search). Việc triển khai này sử dụng lại bộ lưu trữ Angela, quản lý ngữ cảnh, MCP và xử lý quyền.

<a id="tasks-and-reminders"></a>

## Nhiệm vụ và lời nhắc

`Tasks` sở hữu các công việc cần làm hàng ngày, lời nhắc, thời hạn, quy trình và nội dung theo dõi trong các phiên CLI. Nó tái sử dụng `MemoryFile` để lưu trữ nguyên tử, riêng tư, được xác thực tại `tasks/tasks.json` trong thư mục dữ liệu CLI. store chấp nhận tối đa 100 tác vụ đang chờ xử lý và giữ lại tối đa 50 tác vụ đã hoàn thành hoặc bị hủy. Mỗi miền thay đổi trạng thái, bao gồm cả các yêu cầu gửi, sẽ cắt bớt các bản ghi không hoạt động lâu đời nhất dưới cùng một khóa ghi. Các bản ghi không hoạt động được sắp xếp theo `updatedAt`, sau đó là tác vụ ổn định ID. Nhiệm vụ đang chờ xử lý không bao giờ cắt tỉa ứng viên. Lịch sử được cắt bớt hơn nữa để giữ tổng số trong phạm vi 100 bản ghi và giới hạn lưu trữ 128000 ký tự hiện có. Lịch sử lớn hơn hợp lệ sẽ được đọc và cắt bớt trên thay đổi trạng thái tiếp theo. Bộ nhớ bị hỏng vẫn còn nguyên. Người viết cạnh tranh có thể nhận được lỗi bận rõ ràng và thử lại. Việc ghi không thành công không bao giờ cam kết dọn dẹp một phần. Khóa trình ghi xuất bản siêu dữ liệu tên máy chủ và PID hoàn chỉnh thông qua liên kết cứng nguyên tử. Sau sự cố, lần ghi tiếp theo chỉ khôi phục khóa khi quá trình host tương tự của nó được chứng minh là đã chết. Sơ yếu lý lịch phiên CLI sử dụng cùng một biện pháp kiểm tra khôi phục. Chủ sở hữu đang hoạt động và các khóa không xác định vẫn được bảo vệ. Các khóa đánh dấu khôi phục trống, bị hỏng, host ngoại lai hoặc bị bỏ rơi cần phải kiểm tra thủ công. Lưu trữ tác vụ yêu cầu hệ thống tệp cục bộ có hỗ trợ đổi tên nguyên tử và liên kết cứng.

Dịch vụ này hiển thị các hoạt động tạo, liệt kê, tìm, cập nhật, hoàn thành, hủy và báo lại. Nhiệm vụ chỉ có ngày sẽ giữ lại ngày của chúng mà không có thời gian báo thức. Báo lại giữ nguyên nhiệm vụ ID và thời gian đến hạn ban đầu. Thói quen hàng ngày và hàng tuần sử dụng thời gian theo lịch cục bộ. Các ngày trong tuần đã chọn sử dụng Chủ Nhật là 0 và Thứ Bảy là 6. Việc hoàn thành quy trình ghi lại lượt đăng ký và giữ lại chuỗi. Việc hủy sẽ dừng chuỗi. Việc hoàn thành sớm sẽ tiêu tốn lần xuất hiện tiếp theo chưa được gửi. Việc kiểm tra sau khi giao hàng sẽ giữ lại lần xuất hiện thường xuyên tiếp theo.

<a id="conversation-and-management"></a>

### Đối thoại và quản lý

Ask Angela to create or change tasks in ordinary conversation. For example: `10h tối nhắc tao học tiếng Trung`.
Các yêu cầu tiếng Việt được hỗ trợ sử dụng trích xuất cục bộ và phân tích thời gian trước sinh nội dung. Các yêu cầu khác sử dụng sáu công cụ mô hình đã được xác thực: `task_create`, `task_list`, `task_update`, `task_complete`, `task_cancel` và `task_snooze`.
Thời gian tương đối sử dụng đồng hồ mới và múi giờ CLI cục bộ. Những thời điểm mơ hồ cần được làm rõ.
Yêu cầu nhắc nhở không có thời gian báo thức chính xác yêu cầu làm rõ trước khi lưu. Các công cụ tác vụ chỉ có ngày rõ ràng vẫn giữ nguyên hành vi không cảnh báo riêng biệt của chúng.

Sử dụng các lệnh này trong khi trò chuyện tương tác:

```text
/tasks
/tasks all
/today
/done ID
/cancel ID
/snooze ID 10m
```

Các lệnh sử dụng toàn bộ tác vụ ID được in bởi `/tasks`. Báo lại cũng chấp nhận các khoảng thời gian như `30m`, `2h` và `1d`. `/tasks all` bao gồm lịch sử đã hoàn thành và bị hủy. `/today` sử dụng ngày theo lịch cục bộ. Tài liệu tham khảo hội thoại sử dụng trạng thái phiên có giới hạn, lịch sử trò chuyện gần đây và kết quả công cụ đã được xác minh.

<a id="commitment-extraction-and-follow-up"></a>

### Trích xuất và theo dõi cam kết

Cam kết là một yêu cầu của người dùng đã được lưu với trạng thái riêng và cảnh báo tùy chọn. Trạng thái của nó vẫn tồn tại trong quá trình nén hội thoại, thay đổi phiên và khởi động lại quy trình. Quá trình tạo lặp lại có cùng tiêu đề, loại, múi giờ, lịch trình và thời gian lặp lại đang chờ xử lý sẽ sử dụng lại ID hiện có. Báo lại giữ nguyên ID đó và tăng `snoozeCount`.

Trích xuất cục bộ và `task_create` chia sẻ `classifyCommitmentIntent`. Kết quả của nó tách biệt việc tạo, theo dõi, meta, giả thuyết, trích dẫn, tiêu cực, không chắc chắn và vắng mặt. Các dự đoán, ví dụ, mã, trích dẫn, thảo luận về trình phân tích cú pháp, phủ định và các yêu cầu giả định không thể tạo ra nhiệm vụ. Nhiều hành động yêu cầu làm rõ. Thiếu nguồn gốc yêu cầu cũng từ chối các tác vụ do mô hình tạo. Thảo luận meta và giả thuyết không thể thay đổi tác vụ hiện có thông qua một công cụ tác vụ khác. Các công cụ mô hình giữ lại các yêu cầu trực tiếp được hỗ trợ mà quá trình trích xuất cục bộ không thể phân tích cú pháp.

Supported time expressions include `10 phút nữa`, `2 tiếng nữa`, `mai lúc 9h`, and `thứ sáu lúc 8h`.
`ngày 25 lúc 9h`, `25/10 9h`, and `tối nay 9h` also resolve in the reminder timezone.
For reminder alarms, `mai`, `tối nay`, `thứ sáu`, `ngày 25`, and `25/10` without an hour require clarification.
`cuối tuần` requires a precise day and hour. Angela does not invent a weekend alarm.
Trả lời trong thời gian ngắn có thể hoàn thành yêu cầu chỉ có ngày trước đó.
Thời gian trong quá khứ, ngày dương lịch không hợp lệ, khoảng trống DST và số giờ DST lặp lại cần phải chỉnh sửa hoặc làm rõ.
Các ngày trong tuần có nghĩa là lần xuất hiện lịch tiếp theo. Ngày không có năm có nghĩa là năm đủ điều kiện tiếp theo của họ.

After a reminder, `2 tiếng nữa nhắc lại`, `Xong rồi`, and `Không cần nhắc cái đó nữa` change that commitment.
`ActiveCommitments` store có tối đa tám ID tác vụ gần đây cho thư mục dữ liệu chính xác, workspace, phiên và kênh.
Tài liệu tham khảo tồn tại trong các câu trả lời không liên quan và khởi động lại. Chúng hết hạn sau tám yêu cầu hoặc sáu giờ.
Một số tài liệu tham khảo đang chờ xử lý gần đây yêu cầu phải có tiêu đề. Angela không bao giờ chọn một nhiệm vụ đang chờ xử lý một cách tùy tiện.
CLI và Telegram ghi lại các tham chiếu sau khi trình bày thông báo. Đặt lại phiên sẽ xóa trạng thái tham chiếu của phiên đó.
Tệp tham chiếu chứa ID và dấu thời gian, không có tiêu đề nhiệm vụ hoặc nội dung hội thoại.

```text
> Mai 9h nhắc tao học LINQ.
Angela: Được, tôi sẽ nhắc bạn: [09:00 ngày mai, học LINQ, ID]

09:00
Angela: Angela nhắc bạn: [học LINQ, ID]

> 2 tiếng nữa nhắc lại.
Angela: Được, tôi sẽ nhắc lại: [11:00, học LINQ, cùng ID]

11:00
Angela: Angela nhắc bạn: [học LINQ, cùng ID]

> Xong rồi.
Angela: Đã đánh dấu hoàn thành: [học LINQ, cùng ID]
```

Quản lý độc lập không cần mô hình hoặc trò chuyện mở:

```sh
angela tasks
angela tasks all
angela task show ID
angela task done ID
angela task snooze ID 2h
angela task cancel ID
```

Các lệnh này chấp nhận `--data-dir` và `--locale`. các thay đổi trạng thái cũng chấp nhận `--cwd` cho bộ nhớ workspace. Các lệnh `angela reminders` hiện có quản lý dịch vụ thông báo nền.

Tác vụ các thay đổi trạng thái phát ra các sự kiện đã nhập sau khi tồn tại nguyên tử. `CommitmentMemoryProjection` chỉ làm mới `commitment:<taskId>` bị ảnh hưởng từ tác vụ có thẩm quyền store. Mỗi lần chuyển tiếp sẽ thay thế một trang hiện tại. Các tập của phiên giữ lại bằng chứng lịch sử ngày tháng. Lỗi trình chiếu không thể từ chối hoặc khôi phục tác vụ đã lưu. Khởi động và khôi phục trong 5 phút sẽ sửa chữa các thay đổi bên ngoài và các dự đoán không thành công. Những yêu cầu thông thường không dung hòa được ký ức cam kết. Siêu dữ liệu phiên nguồn và phạm vi thuộc sở hữu của host cho phép khôi phục trình chiếu ban đầu. Đối số công cụ mô hình không thể cung cấp siêu dữ liệu này. Bộ nhớ bị vô hiệu hóa không cấp phép chiếu. Việc ngăn chặn ngăn cản quá trình phục hồi tạo lại nội dung bị lãng quên. Các hoạt động tác vụ rõ ràng vẫn giữ lại các biện pháp kiểm soát quyền riêng tư độc lập hiện có của chúng.

Bối cảnh mô hình thông thường chứa tối đa 8 nhiệm vụ quá hạn, 8 nhiệm vụ đến hạn hôm nay, 6 nhiệm vụ sắp tới, 5 nhiệm vụ đột xuất và 3 nhiệm vụ đã hoàn thành gần đây. Hoàn thành gần đây có nghĩa là bảy ngày. Các tác vụ đã hủy và các lần hoàn thành cũ hơn yêu cầu `task_list` hoặc truy xuất bộ nhớ rõ ràng. Ảnh chụp nhanh có thẩm quyền của có giới hạn không bao giờ ngụ ý rằng không có tác vụ bị bỏ qua. Lịch sử tác vụ giữ lại giới hạn lưu giữ không hoạt động hiện có. Không có cơ sở dữ liệu tác vụ đầy đủ nào được đưa vào bộ nhớ ngữ nghĩa. Dấu thời gian của nhiệm vụ, sự kiện runtime, phân phối theo lịch trình, tài liệu tham khảo và phép chiếu cam kết sử dụng đồng hồ được chèn.

<a id="proactive-companion-loop"></a>

### Vòng lặp đồng hành chủ động

Explicit requests such as `Mai hỏi tao xem phần auth làm xong chưa` create the existing `follow_up` task type.
`Chiều mai hỏi lại xem báo cáo tới đâu rồi` and `Ngày mai check xem tôi đã học LINQ chưa` also work locally.
`Nhớ hỏi tôi lại chuyện này vào tối mai` uses the preceding conversation topic, or asks for a subject.
Casual statements such as `Tao hơi mệt` never create follow-ups.

Theo dõi thô sử dụng 09:00 giờ cục bộ, buổi chiều sử dụng 15:00 và buổi tối sử dụng 19:00. Xác nhận đã lưu sẽ hiển thị thời gian đã chọn. Giờ rõ ràng được ưu tiên. Báo thức nhắc nhở giữ nguyên quy tắc làm rõ giờ chính xác.

`ProactiveCandidate` lấy được danh tính, chủ đề, lý do, độ tin cậy, mức độ ưu tiên và thời hạn sử dụng task/occurrence ổn định từ trạng thái nhiệm vụ có thẩm quyền. Lý do là cam kết đúng hạn, cam kết quá hạn, theo dõi rõ ràng hoặc vòng lặp tiềm ẩn. Thí sinh không có store riêng biệt. `ProactivePolicy` kiểm tra mức độ liên quan, mức độ hoàn thành, độ tin cậy, phân phối trùng lặp, thời gian hết hạn, giờ yên tĩnh, thời gian hồi chiêu và hoạt động gần đây. Thời hạn nhận được mức độ ưu tiên cao hơn lời nhắc. Nội dung theo dõi sẽ đợi hai phút sau hoạt động trò chuyện gần đây. store hiển thị tối đa một lần theo dõi mỗi đợt, với khoảng thời gian mặc định là 30 phút giữa các lần theo dõi. Các xác nhận quyền sở hữu thực thi khoảng thời gian này và ngăn chặn các hoạt động theo dõi đồng thời trên host có chung store. `followUp.promptCount`, `lastPromptedAt`, `nextEligibleAt`, `expiresAt` và `resolvedAt` luôn kiên trì với từng nhiệm vụ. Trình bày thành công thừa nhận sự xuất hiện đó. Khởi động lại không hỏi lại câu hỏi tương tự. Việc theo dõi không báo trước sẽ hết hạn sau 48 giờ. Các lần xuất hiện đã hết hạn sẽ trở thành `skipped` và vẫn có thể quản lý được thông qua các lệnh tác vụ. Quá trình theo dõi định kỳ bị bỏ qua sẽ chuyển sang lần xuất hiện tiếp theo trong lịch trong tương lai. Việc báo lại rõ ràng sẽ mở ra một cửa sổ xuất hiện và mức độ liên quan khác.

runtime host có thể định cấu hình `proactive.quietHours`, `cooldownMs`, `recentActivityMs` và `followUpCooldownMs` thông qua `RuntimeOptions`. Giờ yên tĩnh trì hoãn việc giao hàng mà không thừa nhận nó. Dấu thời gian liên tục thực thi thời gian hồi chiêu sau khi khởi động lại. Thông báo sử dụng từ ngữ tiếng Anh hoặc tiếng Việt xác định cho văn bản, thông báo desktop và đầu ra giọng nói tùy chọn. Việc phân phối theo lịch trình không yêu cầu mô hình. Sự kiện `proactive.prompted` hiển thị ID ứng viên và lý do mà không có nội dung tin nhắn.

<a id="implicit-unresolved-threads"></a>

### Chủ đề ngầm chưa được giải quyết

`Tao đang bí phần refresh token` can create a separate OpenLoop. It creates no Task or reminder alarm.
host trích xuất các vấn đề hiện tại, công việc chưa hoàn thành, chờ đợi, mục tiêu cụ thể và các sự kiện đã được hỗ trợ bằng các quy tắc xác định của Việt Nam.
Ví dụ, tuyên bố giả định, cuộc thảo luận được trích dẫn, sự việc cũ, cảm xúc đơn độc, sở thích và cuộc nói chuyện nhỏ không tạo ra vòng lặp.

Sự cố chờ ít nhất bốn giờ và hết sau 48 giờ. Chuỗi chờ chờ 12 giờ và hết hạn sau bảy ngày. Các sự kiện ngày mai phải chờ đến 09:00 sau ngày diễn ra sự kiện chính thức tại cục bộ. Ngày sự kiện không được hỗ trợ không tạo ra prompt. prompt tiềm ẩn chờ 15 phút sau hoạt động và tuân thủ 22:00–08:00 giờ yên tĩnh theo mặc định. Cuộc trò chuyện thường xuyên sẽ thêm thời gian trì hoãn hoạt động thêm một giờ. Cấu hình giờ yên tĩnh runtime thay thế mặc định ngầm.

Mỗi vòng lặp cho phép một lần thử. Người dùng store cho phép thực hiện một lần thử ngầm trong mỗi tám giờ, bao gồm cả lần khởi động lại.
`Xong rồi` resolves the exact focused loop. `Đừng hỏi vụ này nữa` dismisses it.
Named outcomes such as `Fix được auth rồi` also resolve a matching thread.
`Quên vụ auth đi` and `Đừng hỏi tôi về auth nữa` dismiss only a matching current-workspace loop.
Một yêu cầu quên chung cần có một tiêu điểm chính xác. Sự mơ hồ yêu cầu làm rõ.
Việc quên rõ ràng cũng xóa một hồ sơ cá nhân phù hợp thông qua việc dọn dẹp bộ nhớ hiện có. Nhiều trận đấu yêu cầu lựa chọn thông qua `/memory`.
Yêu cầu không hỏi sẽ giữ nguyên hồ sơ cá nhân. Chọn không tham gia rõ ràng vẫn hoạt động khi bộ nhớ tự động bị tắt.
Một Tác vụ rõ ràng tương đương đang chờ xử lý chỉ ngăn chặn đường dẫn ngầm khi xuất xứ workspace do host sở hữu của nó khớp.
Các tác vụ không có nguồn gốc hoặc từ một workspace khác không thể âm thầm loại bỏ chuỗi này.

Trạng thái OpenLoop tồn tại trong `open-loops/state.json` riêng tư, độc lập với bộ nhớ lịch sử và Nhiệm vụ. Bộ nhớ cá nhân, bộ nhớ tự động, Recall và yêu cầu kiểm soát quyền riêng tư việc trích xuất và phân phối cổng kiểm tra. store thừa nhận 50 bản ghi đang hoạt động và giữ lại tối đa 30 bản ghi không hoạt động trong bảy ngày. Bối cảnh mô hình hiện tại bao gồm tối đa sáu bản tóm tắt vòng lặp cục bộ workspace.

CLI và host đồng hành của Telegram cung cấp văn bản xác định mà không cần mô hình. Phân phối ngầm dự trữ một lần thử trình bày tối đa một lần trước khi gọi bộ chuyển đổi. Một thất bại sau khi đặt trước và trước khi trình bày bên ngoài được xác nhận có thể làm mất đi sự theo dõi ngầm. Sự cố xử lý, lỗi Telegram API, lỗi thiết bị xuất chuẩn, ngoại lệ bộ điều hợp và lỗi mạng không thử lại lần thử đã đặt trước. Lời nhắc nhiệm vụ vẫn giữ nguyên đảm bảo thử lại và xác nhận hiện có. Dịch vụ nhắc nhở desktop độc lập tiếp tục chỉ cung cấp Nhiệm vụ rõ ràng.

Xem [the OpenLoop ADR](../../docs/ai/adr/2026-10-23-implicit-companion-follow-up.md) để biết chính sách, sự kiên trì, trọng tâm và những hạn chế.

<a id="scheduler-and-occurrence-policy"></a>

### Chính sách lập lịch và sự cố

`ReminderScheduler` sở hữu một bộ hẹn giờ và một `ReminderNotifier` có thể hoán đổi cho nhau. Nó sắp xếp các lần xuất hiện quá hạn sau khi khởi động. Quá trình phân phối diễn ra từ trạng thái chờ xử lý đến yêu cầu đến phân phối theo khóa tệp hiện có. Một hàng rào token duy nhất cho mỗi yêu cầu. lease hết hạn sau 30 giây và gia hạn sau mỗi 10 giây trong khi trình bày ở hàng đợi hoặc chậm. Chủ sở hữu bị hỏng để lại sự cố có thể thử lại. Lỗi trình thông báo sẽ có thể thử lại sau 30 giây. Bộ lập lịch điều chỉnh các lần thử lại trong vòng một phút. Tắt máy sạch sẽ giải quyết các khiếu nại ngay lập tức. Chỉ bản trình bày văn bản thành công mới ghi lại `lastNotifiedAt` và nâng cao quy trình. Thông báo xếp hàng đợi không được gửi. Người thông báo kiểm tra quyền sở hữu ngay trước khi trình bày và hủy bỏ danh dự. Phân phối thiết bị đầu cuối chờ gọi lại luồng đầu ra. Giao hàng thành công bình thường không phát lại sau khi khởi động lại. Giao hàng thất bại không bao giờ đánh dấu một nhiệm vụ đã hoàn thành. Sự cố sau khi trình bày nhưng trước khi xác nhận có thể lặp lại thông báo. Việc giao hàng ít nhất một lần được ưu tiên hơn việc mất mát thầm lặng. Các điểm đánh dấu `notifiedFor` hiện tại vẫn xác nhận sự xuất hiện của chúng. Nhiệm vụ mới không có siêu dữ liệu phân phối sẽ bắt đầu chờ xử lý. Giọng nói vẫn là tùy chọn sau khi gửi văn bản. Lỗi TTS không hoàn tác thông báo văn bản thành công.

Sự lặp lại hàng ngày và hàng tuần giữ lại thời gian trên tường cục bộ qua các thay đổi bù trừ múi giờ. Thời gian DST không tồn tại sẽ di chuyển về phía trước theo khoảng trống. Thời gian DST lặp lại sử dụng lần xuất hiện đầu tiên của nó. Các quy trình ngoại tuyến tạo ra một thông báo quá hạn và sau đó chuyển sang lần xuất hiện tiếp theo trong tương lai. Một lần báo lại sau khi giao hàng sẽ giữ lại lần xuất hiện thường xuyên tiếp theo. Bộ lập lịch điều chỉnh các thay đổi của đồng hồ và các bộ ghi CLI khác trong vòng một phút. các thay đổi trạng thái cục bộ lên lịch lại ngay lập tức.

<a id="notifications-and-voice"></a>

### Thông báo và giọng nói

CLI tương tác tự động khởi động bộ lập lịch. Thông báo xuất hiện phía trên prompt có thể chỉnh sửa và giữ lại văn bản cũng như con trỏ của bạn. Thông báo sẽ đợi cho đến khi các câu trả lời trực tiếp và quá trình phê duyệt công cụ kết thúc. ID nhiệm vụ của họ nhập vào lịch sử phiên hiện có. Các công cụ mô hình và xử lý theo dõi cục bộ sử dụng ngữ cảnh này để giải quyết các tham chiếu sau khi được nhắc nhở. Yêu cầu một lần cũng khôi phục các lời nhắc quá hạn. Lối thoát thông thường của họ sẽ loại bỏ các thông báo do lỗi và lưu phiên.

Ở chế độ `/voice`, văn bản vẫn là thông báo chính. Angela nói lời nhắc xếp hàng thông qua dịch vụ phát lại và TTS hiện có. Lời nhắc sẽ đợi cho đến khi Angela hoàn thành câu trả lời hiện tại của mình. Họ cũng đợi trong khi bạn nói hoặc nhập lệnh ở chế độ giọng nói. Micrô rảnh thu nhận dữ liệu dừng trước khi phát lại lời nhắc và tiếp tục lại sau đó. Lỗi TTS khiến thông báo văn bản hiển thị. `/chat` tắt lời nhắc nhở. Các bài kiểm tra nhiệm vụ cốt lõi không yêu cầu dịch vụ âm thanh.

Các tác vụ chia sẻ thư mục dữ liệu CLI trên workspace và các phiên. Telegram cũng hỗ trợ các tác vụ và lời nhắc trong người dùng riêng store. Theo mặc định, đồng hồ và lịch sử dụng múi giờ của hệ điều hành. Một tác vụ có thể giữ lại múi giờ IANA rõ ràng. Sử dụng `ANGELA_TIMEZONE=Asia/Ho_Chi_Minh angela` để chọn múi giờ nhắc nhở độc lập với múi giờ của quy trình. Biến môi trường `TZ` tiêu chuẩn cũng kiểm soát mặc định khi `ANGELA_TIMEZONE` vắng mặt. Khoảng thời gian định kỳ hỗ trợ 1–52 ngày hoặc tuần. Thời lượng báo lại hỗ trợ từ 1 phút đến 366 ngày.

Việc đóng trò chuyện sẽ ngừng phân phối thiết bị đầu cuối. Dịch vụ nền Linux tùy chọn tiếp tục phân phối desktop sau khi cuộc trò chuyện kết thúc. Nhiệm vụ chỉ có ngày sẽ không có thông báo cho đến khi bạn chọn thời gian báo thức. Các tác vụ đã hoàn thành và bị hủy được giữ lại xuất hiện trong `/tasks all`.

<a id="background-desktop-reminders"></a>

### Lời nhắc nền desktop

Máy tính để bàn Linux có dịch vụ người dùng systemd và `notify-send` có thể chạy bộ lập lịch hiện có một cách độc lập với trò chuyện:

```sh
angela reminders install
angela reminders start
angela reminders status
angela reminders stop
```

Chạy `install` từ tệp thực thi được xây dựng. Nó viết một đơn vị người dùng riêng mà không có thông tin xác thực và tải lại systemd. Nó bảo tồn một đơn vị hiện có khác nhau. Xem lại tập tin đó trước khi thay thế nó bằng tay. `start` kích hoạt dịch vụ khi đăng nhập và khởi động dịch vụ ngay lập tức. `stop` dừng nó và vô hiệu hóa khởi động đăng nhập. Để sử dụng tiền cảnh, hãy chạy `angela reminders run`. Ctrl+C hủy bỏ xác nhận quyền sở hữu và dừng host. `--data-dir` chọn lưu trữ tác vụ. Cung cấp cùng một thư mục khi cài đặt với cấu hình trò chuyện của bạn. Dịch vụ sử dụng đường dẫn thực thi và Node đã cài đặt. Giữ sẵn cả hai cho đến khi bạn thay thế hoặc tháo thiết bị.

host không cần thông tin xác thực mô hình, nhà cung cấp trò chuyện hoặc thiết bị đầu cuối mở. Nó sử dụng các xác nhận quyền sở hữu, gia hạn, lặp lại và thử lại hiện có. Tuyên bố chia sẻ thiết bị đầu cuối và nền tảng host. Chủ sở hữu thành công đầu tiên cung cấp mỗi lần xuất hiện thông qua bề mặt của chính nó. Việc gửi desktop thành công xác nhận việc gửi. Nó không chứng minh rằng bạn đã đọc thông báo. Hỗ trợ thông báo bị thiếu khiến các lần xuất hiện có thể thử lại được. Lỗi xuất hiện trong `journalctl --user -u angela-reminders`. Cần có một daemon thông báo và đăng nhập đồ họa đã được mở khóa. Dịch vụ này không đánh thức máy tính đã tắt nguồn.

<a id="validation"></a>

### Xác thực

Chạy kiểm tra gói từ thư mục gốc của kho lưu trữ:

```sh
pnpm -F @angela/cli typecheck
pnpm -F @angela/cli test
pnpm -F @angela/cli build
pnpm lint
```

Kiểm tra tác vụ bao gồm tính bền vững, trích xuất, phân tích thời gian, theo dõi theo ngữ cảnh, chính sách chủ động, lệnh quản lý, lặp lại và hàng thông báo. `commitment-scenario.test.ts` chạy vòng đời nhắc nhở đầy đủ với bộ nhớ thực, khởi động lại phiên, bộ nhớ hiện tại và đồng hồ giả được đưa vào. Tác vụ tác vụ không yêu cầu yêu cầu mô hình. Cuộc trò chuyện không liên quan sử dụng stub nhà cung cấp để thực hiện đường dẫn yêu cầu hoàn chỉnh. Các kịch bản tiếp theo bao gồm phân phối chính xác, khôi phục ngoại tuyến, ba lần khởi động lại, tham chiếu riêng biệt, hoàn thành và bộ nhớ hiện tại. Các thử nghiệm CLI sử dụng nhà cung cấp stub cục bộ với sinh nội dung thực và công cụ runtime. Kiểm tra hội thoại bao gồm việc lên lịch lại, tạm dừng sau khi thông báo, hoàn thành, làm rõ giữa hai trận đấu và khởi động lại sau khi phân phối bị gián đoạn. stub xác minh bối cảnh phiên và tích hợp công cụ. Nó không đánh giá khả năng hiểu ngôn ngữ của trực tiếp mô hình. Các thử nghiệm phân phối sử dụng đồng hồ giả để xác định thời hạn sử dụng, gia hạn, xác nhận quyền sở hữu đồng thời, lỗi thông báo, lỗi xác nhận và tắt máy của lease. Kiểm tra khả năng lưu giữ bao gồm các lịch sử lớn, bảo quản tác vụ đang hoạt động, cắt tỉa xác định, ghi đồng thời và bảo quản bộ nhớ không hợp lệ. Các thử nghiệm đầu cuối POSIX sử dụng Python 3 và PTY thực để thực hiện các đề xuất đầu vào, vị trí con trỏ, gói và lệnh prompt.

<a id="live-model-evaluation"></a>

## Đánh giá trực tiếp mô hình

```sh
angela eval
angela eval --case relative-time --repeat 3 --json
angela eval --case memory --timeout-ms 60000 --model your-model
```

Lệnh này sử dụng cuộc trò chuyện thực nhà cung cấp đã chọn và sinh nội dung runtime hiện có. Yêu cầu có thể phải chịu chi phí nhà cung cấp. Nó tạo store tạm thời riêng tư, sử dụng prompt tiếng Việt tổng hợp và xóa store sau mỗi trường hợp. Nó không bao giờ đọc bộ nhớ cá nhân, các cuộc hội thoại đã lưu hoặc Telegram store và không bao giờ khởi động MCP hoặc thực thi các lệnh shell do mô hình chọn. Cấu hình nhà cung cấp chỉ cung cấp thông tin xác thực cho sinh nội dung. Tính năng nhúng vẫn bị vô hiệu hóa trong Recall store tổng hợp này.

Các trường hợp đo lường hành vi được quan sát:

- `relative-time`: lưu đúng một lời nhắc hai mươi phút sau đồng hồ được cung cấp theo múi giờ Việt Nam.
- `ambiguous-task`: liệt kê hai nhiệm vụ giống nhau và yêu cầu lựa chọn mà không hoàn thành một nhiệm vụ.
- `memory`: lưu tên được cung cấp, đọc tên từ đĩa và gọi lại tên đó trong một cuộc trò chuyện mới thông qua chỉ mục Recall thực.
- `tool-selection`: chọn công cụ ghi chú nghiên cứu chỉ đọc và trả về mã không thể đoán trước từ tệp mẫu kiểm thử thực tế.

Các báo cáo bao gồm mô hình ID, trường hợp ID, lần lặp, thời lượng, tên công cụ và kiểm tra boolean riêng lẻ. Chúng loại trừ thông tin xác thực, nội dung nhà cung cấp, prompt và các câu trả lời được tạo. Tuyên bố thành công không thể vượt qua hiệu ứng công cụ bị thiếu. `--json` tạo ra đầu ra có cấu trúc. Thoát 0 có nghĩa là mọi trường hợp đều được thông qua. Thoát 1 có nghĩa là trường hợp không thành công hoặc thiết lập không thành công. Ctrl+C hủy đánh giá với lối ra 130. SIGTERM sử dụng lối ra 143. Mỗi trường hợp được mặc định có thời gian chờ là 45 giây. `--repeat` chấp nhận 1–5. `--timeout-ms` chấp nhận 1000–300000. Ghi đè mô hình và nhà cung cấp phù hợp với cấu hình CLI thông thường.

mẫu kiểm thử này đo lường một tập hợp nhỏ các hành vi. Chúng không thiết lập chất lượng chung của mô hình, chất lượng giọng nói hoặc độ tin cậy sản xuất. Việc kiểm tra làm rõ sử dụng phương pháp phỏng đoán cụm từ question/selection đơn giản. Câu trả lời của mô hình có thể khác nhau trong các lần chạy. Các thử nghiệm tự động thông thường sử dụng ranh giới nhà cung cấp cục bộ để xác minh người đánh giá và vẫn độc lập với thông tin xác thực trực tiếp. Chạy riêng lệnh trực tiếp khi so sánh nhà cung cấp hoặc thay đổi mô hình. Giữ kết quả của nó khác biệt với kết quả kiểm tra đơn vị.

<a id="core-pr-validation"></a>

## Xác thực lõi PR

Luồng công việc `Angela CLI core` chạy trên các yêu cầu kéo vào `main`. Nó cài đặt các phần phụ thuộc cố định mà không cần cài đặt sau gốc, sau đó chỉ xây dựng các điều kiện tiên quyết CLI với một workspace worker. Các thử nghiệm, kiểm tra kiểu dữ liệu, bản dựng, gói lint và kiểm tra CLI kiểm tra nhanh được xây dựng sẽ chạy trong một công việc. Vitest sử dụng một worker và thử nghiệm 30 giây cũng như giới hạn hook. Node 26.11.1 và phiên bản trình quản lý gói trong tệp kê khai gốc xác định môi trường sao chép. cổng kiểm tra không bao gồm các bài kiểm tra monorepo đầy đủ. Các lỗi hiện tại không liên quan vẫn được ghi lại trong quá trình kiểm tra Bộ nhớ V2.

Telegram sử dụng `AngelaRuntime.acquire` để giữ lại Recall sau mỗi tin nhắn. `RuntimeOptions.telegramSessions` nội bộ mặc định có 32 mục nhập không hoạt động và TTL dài 10 phút. Bộ đệm sử dụng bộ nhớ chính xác của người dùng, workspace, phiên và nhận dạng kênh. Các máy khách MCP và lệnh gọi lại yêu cầu sẽ đóng sau mỗi yêu cầu. Bối cảnh hoạt động giữ lại giới hạn đồng thời hiện có là tám. Đặt lại, loại bỏ và tắt host kết thúc phân đoạn phiên runtime. Cuộc trò chuyện và bộ nhớ dai dẳng vẫn tồn tại sau khi bị trục xuất và khởi động lại quá trình.
