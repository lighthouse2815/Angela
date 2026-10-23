<a id="zalo-personal-away-mode"></a>

# Chế độ đi vắng cá nhân của Zalo

<a id="runtime-boundary"></a>

## Ranh giới runtime

Tin nhắn Zalo đến từ người bên ngoài. Chúng không bao giờ đại diện cho những tuyên bố hay cam kết từ chủ sở hữu của Angela.

`AwayRuntimeResponder` sử dụng đường dẫn `AngelaRuntime` và `RuntimeSession.send()` sản xuất. Mỗi yêu cầu sẽ tạo ra một cuộc trò chuyện mới với kênh `zalo` và một loa ngoài rõ ràng. mô hình nhận văn bản bên ngoài hiện tại và chính sách kênh công cộng.

Kênh `zalo` không tải bộ nhớ chủ sở hữu, Recall, dự án, nhiệm vụ, kỹ năng hoặc máy khách MCP. Nó không cung cấp công cụ và không ghi lại trí nhớ dài hạn. Các lệnh gạch chéo bên ngoài không thể tiếp cận được trình xử lý lệnh của chủ sở hữu. Người quan sát runtime nhận được `external.message` thay vì `user.message`. Sự kiện chứa siêu dữ liệu không có văn bản tin nhắn bên ngoài.

mô hình chọn một danh mục phản hồi công khai thông qua một lược đồ nghiêm ngặt. Chỉ văn bản phản hồi cố định, được bản địa hóa mới có thể rời khỏi ranh giới này. JSON không hợp lệ, các trường bổ sung, văn bản tự do, lỗi nhà cung cấp và các danh mục không xác định không đóng được. Dịch vụ Đi vắng cung cấp thông báo phương án dự phòng sau lỗi mô hình. mô hình không thể truyền thông tin thực tế của chủ sở hữu hoặc hứa hẹn hành động của chủ sở hữu thông qua đầu ra tùy ý.

<a id="core-integration-changes"></a>

## Thay đổi tích hợp cốt lõi

`runtime.ts` thêm kênh Zalo, bỏ qua các nguồn riêng tư và thu nhận dữ liệu, chặn lệnh và loại trừ phát hiện MCP. `context-builder.ts` chấp nhận kênh ở dạng kết hợp của nó. Hành vi của nó không thay đổi. `events.ts` thêm kênh và sự kiện tin nhắn bên ngoài. `chat.ts`, prompt đồng hành, dữ liệu đánh giá đồng hành và kiến ​​trúc bộ nhớ không thay đổi.

Các điểm tích hợp này tồn tại do runtime sản xuất sẽ tải các khả năng của chủ sở hữu cho hầu hết các kênh.

<a id="validation-scope"></a>

## Phạm vi xác thực

Các thử nghiệm thực hiện runtime thực với mô hình nhà cung cấp giả. Họ kiểm tra các yêu cầu nhà cung cấp, phân bổ sự kiện, sự vắng mặt của công cụ, từ chối lược đồ và bộ nhớ chủ sở hữu không thay đổi. Các bước kiểm tra này không thiết lập xác thực hoặc phân phối trực tiếp Zalo.

<a id="architecture"></a>

## Ngành kiến ​​​​trúc

```text
zca-js text DM listener
  -> PersonalZaloClient normalization
  -> ZaloAdapter bounded serial queue
  -> AwayModeService authorization, replay guard, durable claim, rate limit
  -> notify-only public notification
     OR AwayRuntimeResponder -> RuntimeSession.send -> existing Chat and provider
  -> strict public response category -> localized fixed text
  -> PersonalZaloClient.sendMessage -> Zalo DM
```

Bộ điều hợp sở hữu giới hạn hàng đợi và vòng đời transport. Dịch vụ Đi vắng sở hữu chính sách kinh doanh. Telegram và Discord giữ lại các bộ điều hợp hiện có của họ. Không có tính năng trừu tượng hóa bộ điều hợp dùng chung nào tồn tại trong CLI được kiểm tra. Việc triển khai này sử dụng lại đường dẫn runtime sản xuất của họ mà không cần nhập quyền của chủ sở hữu.

MVP chỉ xử lý các tin nhắn văn bản gửi đến. Nó không có lệnh gửi công khai tùy ý hoặc công cụ tự động gửi đi. Nhóm, tệp đính kèm, cuộc gọi, phản hồi, tự động hóa bạn bè, chiến dịch và gửi hàng loạt đều bị loại trừ.

<a id="away-policy"></a>

## Chính sách đi vắng

Trạng thái mặc định tắt Chế độ đi vắng, chọn `notify-only` và có danh sách trắng trống. Chỉ ID người gửi số chính xác mới nhận được ủy quyền. Tên hiển thị không bao giờ cấp quyền truy cập. Cài đặt và bản ghi tin nhắn được cách ly bởi tài khoản Zalo xác thực ID. Một tài khoản khác bắt đầu với danh sách trắng trống của chính nó.

`notify-only` lưu tin nhắn bên ngoài và gửi thông báo nhận dạng cố định và ngoại tuyến. Nó không gọi mô hình hoặc thực hiện hành động của chủ sở hữu.

`assistant-reply` là phân loại mô hình an toàn, theo sau là mẫu phản hồi cố định. Nó gọi runtime sản xuất để chọn lời chào, thông báo, làm rõ, biên nhận hoặc từ chối quyền riêng tư. Nó cố tình giới hạn cuộc trò chuyện trong các mẫu công khai này. Nó không cung cấp văn xuôi được tạo ra không hạn chế hoặc các cuộc hội thoại nhiều lượt liên tục. Thời hạn của mô hình là 30 giây. Lỗi trả về thông báo ngoại tuyến đã sửa. Cấu hình nhà cung cấp và khởi tạo runtime rất chậm, theo yêu cầu `assistant-reply` được ủy quyền đầu tiên. `notify-only` không cần thông tin xác thực sinh nội dung nhà cung cấp, mô hình, API, phiên bản `AngelaRuntime` hoặc phản hồi runtime. Điểm vào CLI chỉ nhập thiết lập sinh nội dung sau khi gửi Zalo và các lệnh khác của chủ sở hữu. Việc chuyển từ chỉ thông báo sang trả lời trợ lý trong CLI cục bộ sẽ kích hoạt quá trình khởi tạo từng phần trên tin nhắn đủ điều kiện tiếp theo. mô hình bị thiếu hoặc nhà cung cấp không khả dụng sẽ ghi lại `runtime_failed` và trả về thông báo ngoại tuyến mà không dừng trình nghe. Lỗi khởi tạo nhà cung cấp vẫn được lưu vào bộ nhớ đệm cho đến khi host khởi động lại. Nó không bao giờ trở thành những lần thử khởi tạo lặp đi lặp lại cho mỗi DM gửi đến. Giai đoạn sau có thể thêm `assistant-conversation` với lịch sử nhiều lượt có giới hạn. Chế độ đó không có trong MVP này.

Việc ủy ​​quyền được kiểm tra lại sau sinh nội dung và trước khi gửi. Tắt Chế độ Đi vắng, thay đổi phiên của nó hoặc thu hồi người gửi sẽ hủy phản hồi đó. Việc gửi qua mạng đã gửi không thể bị thu hồi do thay đổi chính sách sau này.

<a id="provenance-and-pending-messages"></a>

## Nguồn gốc và tin nhắn đang chờ xử lý

Mỗi bản ghi được lưu trữ bao gồm `source: zalo`, `sourceType: external-user`, tài khoản, người gửi, cuộc trò chuyện, tin nhắn ID, văn bản và thời gian nhận. Quá trình xử lý bổ sung thêm ID phiên đi, trạng thái, thời gian xử lý, lý do và biên nhận trả lời có sẵn. Khiếu nại bên ngoài vẫn được quy cho văn bản tin nhắn. Họ không bao giờ đi vào bộ nhớ chủ sở hữu ngữ nghĩa.

Mọi thư được ủy quyền đều được giữ lại một cách thận trọng dưới dạng đề xuất yêu cầu bên ngoài đang chờ xử lý để chủ sở hữu xem xét. Ứng viên chứa văn bản bên ngoài và `status: pending`. Điều này bao gồm cuộc trò chuyện thông thường vì MVP không suy đoán ý định của chủ sở hữu từ người nói bên ngoài. Không có nhiệm vụ, thời hạn, lời hứa tài chính hoặc quyết định cá nhân nào được tạo ra.

Tắt Chế độ đi vắng sẽ tạo ra một bản tóm tắt xác định cho phiên đi vắng đó. Nó đếm các tin nhắn được ủy quyền được giữ lại và các phản hồi thành công của người gửi ổn định ID. Địa chỉ liên hệ bị từ chối chỉ có siêu dữ liệu. Nó trích dẫn tối đa 20 tin nhắn gần đây cho mỗi người gửi, với 500 ký tự cho mỗi trích dẫn. Văn bản được ủy quyền ban đầu vẫn còn trong quá trình kiểm tra riêng store cho đến khi việc lưu giữ xóa bản ghi của nó. Các ký tự điều khiển được thoát JSON trước khi hiển thị đầu cuối.

<a id="storage-and-delivery"></a>

## Lưu trữ và giao hàng

`AwayModeStore` và `ZaloCredentialStore` là ranh giới bền vững của doanh nghiệp. Việc triển khai cục bộ tái sử dụng `MemoryFile`, bao gồm xác thực, đổi tên nguyên tử, tệp riêng tư và khóa ghi đa quy trình. Không có cơ sở dữ liệu hoặc đường dẫn bộ nhớ mới. Chỉ những tin nhắn được ủy quyền mới tạo ra các tập tin đầy đủ cho mỗi tin nhắn. Giới hạn tệp 128.000 ký tự hiện tại áp dụng cho từng lần ghi. `away_disabled`, `replay_message`, `unsupported_message` và `self_message` không lưu giữ bản ghi tin nhắn hoặc siêu dữ liệu liên hệ. `whitelist_denied` store chỉ liên hệ với tên hiển thị ID, có giới hạn, lần nhìn thấy lần cuối và số lần gọi lại. Quá trình kiểm tra liên hệ giữ lại tối đa 20 liên hệ cho mỗi tài khoản và không bao giờ lưu lại văn bản tin nhắn store. Lệnh gọi lại bị từ chối lặp đi lặp lại có thể làm tăng số lượng siêu dữ liệu này. Nó không phải là số lượng chính xác các tin nhắn duy nhất.

Quá trình lưu giữ chạy theo host lease duy nhất khi khởi động và trước khi xác nhận quyền sở hữu được ủy quyền. store đọc siêu dữ liệu bản ghi một lần khi host khởi động. Nó không quét lại lịch sử của mỗi tin nhắn đến. Hồ sơ thiết bị đầu cuối hết hạn sau 30 ngày. Việc cắt bớt công suất sẽ loại bỏ các bản ghi đủ điều kiện cũ nhất trước tiên, với hàm băm thông báo là yếu tố quyết định. Giới hạn tài khoản là 500 hồ sơ. Điều này có chủ ý phù hợp với một MVP cục bộ nhỏ và giới hạn sự phát triển tệp trên mỗi tài khoản trong tương lai. Các bản ghi dưới sáu phút vẫn được bảo vệ, ngoài khoảng thời gian phát lại trong năm phút và giới hạn đồng hồ trong tương lai của nó. Các bản ghi `received` và `sending` vẫn được bảo vệ bất kể độ tuổi vì tác dụng phụ của chúng có thể không chắc chắn. Nếu tất cả 500 vị trí được bảo vệ, các yêu cầu mới sẽ không được đóng nếu không có lệnh gọi hoặc gửi mô hình. Các tài khoản hiện có với hơn 500 hồ sơ được bảo vệ sẽ không chấp nhận khiếu nại mới cho đến khi chủ sở hữu giải phóng năng lực. Việc lưu giữ không bao giờ xóa bản ghi đang hoạt động để đáp ứng giới hạn. Sự tràn hiện có như vậy được bảo tồn thay vì bị loại bỏ một cách âm thầm. host không hoạt động sẽ dọn sạch các tệp đã hết hạn trong lần xác nhận quyền sở hữu tiếp theo hoặc khởi động lại. Không có bộ hẹn giờ hoặc dọn dẹp phân tán worker nào được thêm vào.

Việc xóa các xác nhận quyền sở hữu thiết bị đầu cuối cũ hơn sẽ rút ngắn lịch sử kiểm tra và tóm tắt. Các bản sao gần đây vẫn giữ nguyên yêu cầu của họ. Việc phát lại các bản ghi đã xóa vẫn không thực hiện được chính sách dấu thời gian trước khi tồn tại. Các ứng viên yêu cầu đang chờ xử lý đã hết hạn cũng bị xóa cùng với hồ sơ của họ. Chủ sở hữu phải xem lại bản tóm tắt trong thời gian lưu giữ.

Nhận dạng tin nhắn băm tài khoản đã xác thực, cuộc trò chuyện và tin nhắn máy chủ ID. Khiếu nại vẫn tiếp tục khởi động lại. Các bản ghi trùng lặp và đã được xác nhận sẽ không bao giờ tạo ra phản hồi khác. Các tin nhắn cũ hơn năm phút hoặc hơn 30 giây trong tương lai sẽ được ghi lại mà không trả lời. Các sự kiện nghe tin nhắn cũ không được sử dụng.

Giới hạn tốc độ cho phép tối đa ba lần trả lời cho mỗi người gửi trong 60 giây. Các nỗ lực lâu dài bao gồm gửi thành công, gửi không thành công và gửi không chắc chắn trong các lần khởi động lại và các phiên đi. `reply-rates.json` chứa tối đa 512 cửa sổ người gửi với ba dấu thời gian trên mỗi cửa sổ. Mỗi lần đặt trước sẽ cắt bớt các dấu thời gian đã trôi qua một cách nguyên tử, kiểm tra người gửi và tiếp tục nỗ lực trước sinh nội dung hoặc gửi. Việc này tốn tối đa 512 cửa sổ nhỏ, không phụ thuộc vào số lượng tin nhắn lịch sử. Các cửa sổ đang hoạt động không bao giờ bị loại bỏ để tiếp nhận người gửi khác. Tệp tỷ lệ đầy đủ không đóng được. Tệp tỷ lệ ban đầu tạo ra các lần thử gần đây từ chỉ mục bản ghi khởi động một lần cho dữ liệu phiên hiện có. Những lần đặt chỗ tiếp theo không bao giờ gọi `records()` hoặc đọc lịch sử tin nhắn. Trạng thái vẫn nằm trong phạm vi tài khoản và vẫn tồn tại khi khởi động lại host, thay đổi Chế độ vắng mặt và thay đổi danh sách trắng. Việc thay đổi đồng hồ lùi sẽ giữ lại các đặt chỗ cho đến khi cửa sổ của chúng hết hạn theo đồng hồ hiện tại. Một host lease cục bộ ngăn cản những người nghe cạnh tranh và các cuộc đua kiểm tra tỷ lệ.

Hàng đợi gửi đến chứa tối đa 32 tin nhắn và xử lý chúng một cách tuần tự. Tràn được ghi lại mà không có phản hồi. Không có tính năng tự động gửi lại sau khi gửi thất bại. Một lần gửi không chắc chắn vẫn được yêu cầu sau khi xảy ra sự cố quy trình. Điều này ưu tiên tránh các câu trả lời trùng lặp so với việc gửi được đảm bảo. SDK không cung cấp xác nhận phân phối máy chủ cho các cuộc gọi lại đến hoặc khôi phục lịch sử tự động sau khi ngắt kết nối. Các thư không bao giờ đến được quy trình hoặc không được lưu lại trong hàng đợi khi xảy ra sự cố, bộ điều hợp này không thể khôi phục được.

Khôi phục ngắt kết nối sẽ tạo SDK API mới sau khi dừng trình nghe cũ. Nó cho phép thử lại ba lần trong mỗi vòng đời của host, với độ trễ là một, hai và bốn giây. Sự kiệt sức khiến host còn sống và ghi lại `reconnect_exhausted`. Chủ sở hữu phải khởi động lại hoặc xác thực lại. Thời hạn bắt tay WebSocket là 20 giây. Các yêu cầu SDK HTTP có trần 120 giây. Việc tắt máy sẽ hủy sinh nội dung và độ trễ kết nối lại, dừng trình nghe và loại bỏ các công việc được chấp nhận.

<a id="credential-security"></a>

## Bảo mật thông tin xác thực

Ghi nhật ký `zca-js` và kiểm tra cập nhật của nó bị tắt. Tính năng tự gửi tin nhắn bị vô hiệu hóa và được lọc độc lập. Chỉ triển khai thông tin xác thực mới đọc hoặc ghi tệp phiên. Phiên đã lưu chứa tài khoản được xác thực ID, cookie, IMEI và người dùng agent. Khôi phục sẽ kiểm tra tài khoản đã xác thực ID và làm mới cookie từ lọ cookie kết quả.

Thư mục cục bộ sử dụng chế độ `0700`. Các tệp thông tin xác thực và QR sử dụng chế độ `0600` trên các nền tảng hỗ trợ các quyền này. Hình ảnh QR là tài liệu đăng nhập tạm thời riêng tư và bị xóa sau khi thành công, thất bại hoặc hủy. Lỗi SDK được thay thế bằng lỗi công khai đã sửa. Lỗi thô, giá trị cookie, bối cảnh QR token và nhà cung cấp không bao giờ nhập nhật ký. Git bỏ qua các tệp thông tin xác thực, hình ảnh QR đăng nhập, lease và lưu trữ tin nhắn tài khoản. Thông tin xác thực không được mã hóa khi lưu trữ. Do đó, quyền truy cập hệ thống tập tin vẫn là một ranh giới bảo mật.

<a id="transport-research"></a>

## Nghiên cứu transport

Các chân triển khai `zca-js` phiên bản `2.2.0` trong danh mục và tệp khóa workspace. API của nó đã được kiểm tra dựa trên các tuyên bố đã công bố và nguồn upstream vào ngày 22-10-2026. Không cần phải có key Zalo API trả phí hoặc tài khoản Zalo OA.

| Tham khảo | Mẫu được sử dụng |
| --- | --- |
| [zca-js](https://github.com/RFS-ADRENO/zca-js/tree/0586dc5e4981985c5f16b9b3a5f285a02feb6f9b) | `loginQR`, hủy bỏ cuộc gọi lại, `login(credentials)`, ảnh chụp nhanh cookie, sự kiện của người nghe, biên nhận `ThreadType.User` và `sendMessage` |
| [OpenClaw zalouser](https://github.com/openclaw/openclaw/blob/main/extensions/zalouser/src/zalo-js.ts) | API mới khi kết nối lại, trình xử lý lỗi đầu cuối trong quá trình ngừng sử dụng socket, thử lại trình nghe rõ ràng và tự lọc |
| [openclaw-zalo-connect](https://github.com/tuanminhhole/openclaw-zalo-connect/tree/0e5908c6ccc00cde6f539a82fd82086fc90285de) | Nhận dạng trùng lặp trong phạm vi tài khoản, thời gian chờ rõ ràng và phân tách SDK transport |
| [zalo-cá nhân-mcp](https://github.com/minhkhoa0502/zalo-personal-mcp/tree/e91ecfe0c17d29bb50fa2adc22759407604c9b92) | Gọi lại hình ảnh QR, lưu giữ cookie, các tùy chọn SDK yên tĩnh và khôi phục phiên riêng biệt |

Các tài liệu tham khảo này đã cung cấp thông tin về các mẫu transport. Các lớp agent, tác vụ, bộ nhớ, tự động hóa và MCP của chúng không được bao gồm.

<a id="unofficial-automation-warning"></a>

## Cảnh báo tự động hóa không chính thức

Tự động hóa Zalo cá nhân là không chính thức. Zalo có thể thay đổi giao thức, hết phiên, ngắt kết nối máy khách hoặc tạm ngưng tài khoản. Kiểm tra danh sách trắng và giới hạn tốc độ làm giảm phạm vi của bộ chuyển đổi này. Họ không đảm bảo rằng Zalo cho phép tự động hóa. Không thực hiện bỏ qua chống bot, bỏ qua CAPTCHA, bỏ qua giới hạn, nhắn tin hàng loạt hoặc tiếp cận không theo yêu cầu. Chủ sở hữu phải chấp nhận rủi ro tài khoản trước khi xác thực tài khoản cá nhân.

<a id="local-setup-and-qr-login"></a>

## Thiết lập cục bộ và đăng nhập QR

Sử dụng Node.js 22.13 trở lên và phiên bản pnpm được ghim của kho lưu trữ. Từ thư mục gốc của kho lưu trữ, cài đặt các phần phụ thuộc và xây dựng các phần phụ thuộc CLI:

```sh
pnpm install
pnpm build:cli
```

Để phân loại mô hình, hãy định cấu hình nhà cung cấp hiện có của Angela bằng `angela setup` hoặc sử dụng cấu hình môi trường CLI hiện có. Để hoạt động chỉ thông báo miễn phí, hãy không đặt cấu hình sinh nội dung. nhà cung cấp tương thích cục bộ có thể sử dụng khóa API trống. Bản thân Zalo transport không cần key API trả phí. Các lệnh đăng nhập, trạng thái, danh sách trắng và Đi vắng không yêu cầu cấu hình mô hình. host tiền cảnh chỉ tải nhà cung cấp hiện có khi có yêu cầu `assistant-reply` được ủy quyền cần đến nó.

Các ví dụ này sử dụng tệp thực thi được xây dựng từ thư mục gốc của kho lưu trữ:

```sh
node packages/angela-cli/dist/bin/run.mjs zalo login
```

Lệnh in đường dẫn hình ảnh QR riêng tư. Mở hình ảnh đó cục bộ. Quét bằng ứng dụng di động Zalo, sau đó xác nhận xác thực trên điện thoại. Luồng QR hết hạn sau ba phút hoặc khi Zalo từ chối hoặc hết mã. Nó không bao giờ thử lại xác thực QR mà không có hành động của chủ sở hữu. Sau khi thành công, lệnh sẽ lưu cookie, IMEI, người dùng agent và tài khoản được xác thực ID. Nó xóa hình ảnh QR trước khi thoát.

```sh
node packages/angela-cli/dist/bin/run.mjs zalo status
node packages/angela-cli/dist/bin/run.mjs zalo allow 123456789
node packages/angela-cli/dist/bin/run.mjs away mode assistant-reply
node packages/angela-cli/dist/bin/run.mjs away on
node packages/angela-cli/dist/bin/run.mjs zalo run
```

Thay thế `123456789` bằng người gửi Zalo ổn định của liên hệ ID. DM gửi đến bị từ chối xuất hiện trong quá trình kiểm tra liên hệ có giới hạn cùng với ID người gửi của họ mà không có văn bản tin nhắn. Sử dụng `angela zalo recent` hoặc `/zalo recent` để kiểm tra 20 địa chỉ liên hệ gần đây nhất từ ​​quá trình kiểm tra siêu dữ liệu này. Đầu ra bao gồm tên hiển thị ID, có giới hạn của người gửi ổn định, dấu thời gian nhìn thấy lần cuối và số lần gọi lại. Nó loại trừ văn bản tin nhắn. Mã hóa JSON thoát các ký tự điều khiển trong tên liên hệ trước khi hiển thị thiết bị đầu cuối. Số lượng liên hệ được đặt lại sau khi bị trục xuất. Những liên hệ chỉ được quan sát khi Chế độ Đi vắng bị tắt sẽ bị loại trừ. Lệnh chỉ dành cho chủ sở hữu này không phân giải tên, quét thư mục bạn bè hoặc cấp quyền truy cập danh sách trắng. Giữ host tiền cảnh chạy trong khi chủ sở hữu đi vắng. Điều này có thể chạy bên cạnh quy trình đầu cuối Angela thông thường. Chỉ bắt đầu trò chuyện thông thường không bắt đầu nghe Zalo.

Khởi động lại `zalo run` để khôi phục phiên đã lưu mà không cần đăng nhập QR. Báo cáo `zalo status` đã lưu trạng thái cục bộ. Trường `connection: not-probed` của nó không xác nhận kết nối trực tiếp. Khôi phục trình nghe thành công sẽ ghi nhật ký `connected` sau khi bắt tay WebSocket. Nếu khôi phục không thành công, hãy dừng host và chạy lại `zalo login`.

Zalo host chấp nhận các lệnh của chủ sở hữu này thông qua thiết bị đầu cuối cục bộ:

```text
/away on
/away status
/away mode notify-only
/away mode assistant-reply
/zalo allow 123456789
/zalo deny 123456789
/zalo allowed
/zalo recent
/away off
```

Angela CLI tương tác thường xuyên cũng route các lệnh này cục bộ. Người gửi Zalo bên ngoài không thể thực hiện chúng. Chủ sở hữu có thể thay đổi trạng thái từ thiết bị đầu cuối thứ hai bằng `angela away ...` và `angela zalo allow|deny|allowed|recent`. `/away off` in bản tóm tắt phiên xác định tới thiết bị đầu cuối chạy lệnh. Ctrl+C dừng host mà không tắt trạng thái Đi vắng vẫn tồn tại.

Dừng host trước `angela zalo login` hoặc `angela zalo logout`. Đăng xuất sẽ xóa thông tin đăng nhập cục bộ. Nó không thu hồi thiết bị được liên kết phía máy chủ. Thu hồi phiên đó trong Zalo để đăng xuất phía máy chủ. Sau khi thoát khỏi quá trình không sạch, host hoặc khóa ghi có thể vẫn còn. Xác nhận rằng không có quy trình tương ứng nào chạy trước khi xóa khóa cũ của nó theo cách thủ công. Không có lệnh nào tự động xóa khóa khỏi quy trình khác.

<a id="local-paths-and-vps-migration"></a>

## Đường dẫn cục bộ và di chuyển VPS

Gốc dữ liệu mặc định là `~/.angela/sessions`. `ANGELA_DATA_DIR` hoặc `--data-dir` chọn gốc khác. Tất cả các lệnh của chủ sở hữu và người nghe phải sử dụng cùng một tài khoản gốc và được xác thực. Việc triển khai lưu trữ cục bộ sở hữu tất cả các đường dẫn:

```text
<data-root>/zalo/
  zalo-credentials.json
  zalo-login-qr.png              # temporary, private
  zalo-host.lock                 # active host lease
  <sha256(account-id)>/
    away.json
    messages/<sha256(message-identity)>.json
    reply-rates.json             # bounded durable rate windows
    recent-contacts.json         # at most 20 contacts, no message text
```

Cục bộ ngày nay: một quy trình Angela với store cục bộ và phiên Zalo riêng tư. VPS trong tương lai: một quy trình Angela với bộ lưu trữ liên tục và thông tin xác thực an toàn store. Logic nghiệp vụ, ủy quyền và tích hợp runtime không yêu cầu viết lại. Việc triển khai cơ sở dữ liệu có thể thay thế `AwayModeStore` trong khi vẫn giữ nguyên các xác nhận thông báo nguyên tử và cách ly tài khoản. Một vault có thể thay thế `ZaloCredentialStore`. Thành phần host sở hữu sự lựa chọn lease được phân phối trong tương lai. MVP này không triển khai VPS hay worker phân tán.

Trước khi triển khai VPS:

1. Hoàn thành quy trình chấp nhận tài khoản thực bên dưới.
2. Chạy một trình nghe cho mỗi tài khoản và sử dụng bộ nhớ lâu bền khi khởi động lại.
3. Hạn chế quyền lưu trữ và bảo vệ bản sao lưu thông tin xác thực và nhật ký tin nhắn bên ngoài.
4. Chọn triển khai thông tin xác thực an toàn hoặc ổ đĩa liên tục được mã hóa.
5. Định cấu hình mô hình nhà cung cấp hiện có mà không có bí mật do nguồn kiểm soát.
6. Xác định việc duy trì kiểm tra và giám sát dung lượng ổ đĩa trước khi nhật ký trở nên lớn.
7. Định cấu hình tắt máy có giám sát và cảnh báo ngắt kết nối hiển thị.
8. Xem xét việc thu hồi phiên, khả năng tương thích giao thức và nguy cơ tạm ngưng tài khoản.

Sử dụng chính sách lưu giữ tích hợp. Không xóa thủ công các xác nhận quyền sở hữu gần đây hoặc chưa hoàn thành mà không xem xét hậu quả của việc phân phối trùng lặp.

<a id="real-account-acceptance"></a>

## Chấp nhận tài khoản thực

Tự động kiểm tra ranh giới mock transport của Zalo. Họ không xác thực một tài khoản thực. Trạng thái trực tiếp: **đang chờ kiểm tra chấp nhận của chủ sở hữu**. Chủ sở hữu phải hoàn thành các bước sau:

1. Xác thực bằng `zalo login` và quét mã QR.
2. Khởi động `zalo run`, dừng nó và khôi phục phiên mà không cần quét QR khác.
3. Đưa vào danh sách trắng một liên hệ ổn định ID và kiểm tra `zalo recent`.
4. Bật Chế độ Đi vắng và chọn chế độ trả lời dự định.
5. Gửi tin nhắn DM thuộc danh sách trắng và xác nhận danh tính công khai của Angela trong thư trả lời.
6. Gửi DM không có trong danh sách trắng và xác nhận rằng không có phản hồi nào.
7. Gửi yêu cầu bảo mật và xác nhận rằng không có thông tin chủ sở hữu cá nhân nào được tiết lộ.
8. Yêu cầu các công cụ đặc quyền và xác nhận rằng không có hành động hoặc cam kết nào của chủ sở hữu xảy ra.
9. Tắt Chế độ Đi vắng và kiểm tra bản tóm tắt được phân bổ và các ứng viên đang chờ xử lý.

Cho đến khi luồng này chạy thành công, repo cung cấp bản triển khai đã được kiểm thử, chưa xác nhận gửi Zalo thực tế.

<a id="rebase-and-merge-preparation"></a>

## Chuẩn bị rebase và hợp nhất

Nhánh này được dựa trên cam kết chính `840cb5611223a2a5c99b867e526bc9019028c8e4`. Quá trình tìm nạp và rebase cuối cùng đã hoàn tất mà không có xung đột. Lần rebase trước đó đã giải quyết xung đột lệnh gọi lại cảnh báo trong `RuntimeSession.send()`. Độ phân giải đó giữ lại thông báo bộ sưu tập cảnh báo và bộ điều hợp có giới hạn của chính, sau đó loại trừ Zalo khỏi bối cảnh riêng tư và bộ nhớ thu nhận dữ liệu. Chính sách ngữ cảnh bị vô hiệu hóa bộ nhớ mới vẫn không thay đổi. Liên minh sự kiện giữ `external.message` tách biệt khỏi chủ sở hữu `user.message`. Sự khác biệt cuối cùng không chứa các chỉnh sửa đối với dữ liệu, báo cáo đánh giá sinh nội dung hoặc Recall đồng hành, bộ kiểm thử hoặc runner. Danh mục và tệp khóa workspace duy trì trình nhập đánh giá của chính và chỉ thêm các phần phụ thuộc Zalo transport đã được ghim. Điểm vào CLI giữ lại định tuyến lệnh hiện có và chỉ tải thiết lập sinh nội dung khi có lệnh cần đến.

<a id="automated-verification-on-2026-10-22"></a>

## Xác minh tự động vào ngày 22-10-2026

Bộ CLI bao gồm transport, khả năng lưu giữ, cửa sổ tốc độ liên tục, cách ly runtime, lệnh của chủ sở hữu và kiểm tra hồi quy bộ điều hợp hiện có. Ranh giới mạng Zalo transport và mô hình sử dụng mock. Không có tài khoản thực nào được xác thực. Các thử nghiệm bao trùm ranh giới phân loại chứ không phải trực tiếp phân phối Zalo hay chất lượng hội thoại không hạn chế.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm -F @angela/cli exec vitest run --maxWorkers=2` | 460 bài kiểm tra đã vượt qua 57 tệp, trong đó có 45 bài kiểm tra Zalo/Away |
| `pnpm -F @angela/cli exec vitest run src/adapters/zalo src/away src/zalo-command.test.ts src/zalo-host.test.ts --maxWorkers=2` | 45 bài kiểm tra Zalo/Away đã vượt qua bảy tệp |
| `pnpm -F @angela/evals-companion-generation test` | 71 bài kiểm tra được thông qua trên hai tệp |
| `pnpm -F @angela/evals-companion test` | 45 bài kiểm tra hồi quy và đánh giá Recall được chuyển qua hai tệp |
| `pnpm -F @angela/evals-companion-generation check:dataset` | 57 trường hợp, 12 danh mục, 29 quy tắc đã vượt qua kiểm tra lược đồ |
| `pnpm -F @angela/evals-companion check:dataset` | 128 trường hợp trên 16 danh mục đã vượt qua kiểm tra lược đồ |
| `pnpm -F @angela/evals-companion-generation typecheck` | Đã vượt qua |
| `pnpm -F @angela/evals-companion typecheck` | Đã vượt qua |
| `NODE_OPTIONS=--max-old-space-size=4096 pnpm typecheck --concurrency=1 --force` | 53 tác vụ workspace được thông qua mà không có kết quả được lưu vào bộ nhớ đệm, bao gồm CLI và i18n |
| `pnpm lint` | Đã vượt qua mà không có lỗi nào và 603 cảnh báo trong mã hiện có |
| `pnpm build:cli` | Đã vượt qua, bao gồm cả phụ thuộc CLI |
| `git diff --check` và `git diff --check origin/main...HEAD` | Đã vượt qua |

Quá trình xác minh thêm `--config.verify-deps-before-run=false` vào các lệnh pnpm để ngăn cài đặt phụ thuộc ngầm trong worktree này. Bootstrap pnpm đã cài đặt thiếu shebang có thể thực thi được. Xác minh Turbo sử dụng trình bao bọc shell tạm thời bên ngoài kho lưu trữ. Cả hai biện pháp đều không làm thay đổi nguồn dự án, phiên bản phụ thuộc, quy tắc xác thực hoặc cấu hình trình biên dịch. Vùng nhớ Node 4 gigabyte hỗ trợ Vue các lần kiểm tra kiểu dữ liệu của kho lưu trữ. Hai Vitest worker hạn chế tranh chấp tài nguyên. Lần chạy thử nghiệm đầu tiên đã tạo ra các bản dựng phụ thuộc chồng chéo và không thành công trong khi không có tệp `dist`. Nó cũng báo cáo thời gian chờ dưới tải đồng thời. Các lần chạy thử nghiệm cuối cùng diễn ra sau bản dựng hoàn chỉnh và kiểm tra kiểu dữ liệu đầy đủ, không có bản dựng đồng thời. Không có thử nghiệm, thời gian chờ, quy tắc xác thực hoặc nguồn sản xuất nào được thay đổi để có được những kết quả này. CLI được xây dựng cũng trả về `{"savedSession":false,"connection":"not-probed"}` từ `zalo status` mà không có mô hình được định cấu hình. Không có trực tiếp sinh nội dung trả phí nào được chạy. Trạng thái Zalo tài khoản thật vẫn **đang chờ kiểm tra chấp nhận của chủ sở hữu**.
