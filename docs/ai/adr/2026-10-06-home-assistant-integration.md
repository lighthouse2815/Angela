<a id="home-assistant-connection"></a>

# Kết nối Trợ lý tại nhà

Trạng thái: đã chấp nhận

<a id="context"></a>

## Bối cảnh

Sự cố #1491 yêu cầu AIRI đọc và điều khiển Trợ lý gia đình. Một người dùng muốn nói "tắt đèn phòng khách" và nhờ AIRI làm việc đó.

`plugins/airi-plugin-homeassistant` là khung ban đầu. Cam kết `4401b96c9` (29/12/2025) đã thêm `package.json`, `tsconfig.json`, cấu hình tsdown và một `src/index.ts` duy nhất chứa `console.warn('WIP')`. khung ban đầu phụ thuộc vào `@angela/server-sdk`, điều này cho thấy plugin kênh là ý tưởng khởi đầu. `plugins/airi-plugin-bilibili-laplace` đến cùng ngày với hình dạng tương tự. Không có gì nhập gói và công việc này sẽ xóa gói đó vì sự tích hợp tồn tại trong ứng dụng thay vì trong một quy trình của chính nó.

<a id="decision"></a>

## Phán quyết

Home Assistant là dịch vụ hạng nhất của quy trình chính stage Tamagotchi Electron, đằng sau các công cụ đã nhập mà renderer gắn cho mô hình.

| Mối quan tâm | Vị trí |
| --- | --- |
| Địa chỉ, token và mọi yêu cầu gửi đi | `apps/desktop/src/main/services/airi/home-assistant/` |
| Hợp đồng IPC | `apps/desktop/src/shared/eventa/home-assistant.ts` |
| Ứng dụng khách API của Home Assistant và xác nhận của nó | `shared/ui/stage/src/libs/home-assistant/client.ts` |
| Định nghĩa công cụ | `shared/ui/stage/src/tools/home-assistant.ts` |
| Trang lắp đặt công cụ và cài đặt | `apps/desktop/src/renderer/` |

Cơ chế này tuân theo `computer-use` và `mcp-servers`, là hai dịch vụ xử lý chính hiện có cung cấp công cụ cho mô hình.

<a id="why-not-a-channel-plugin"></a>

### Tại sao không phải là plugin kênh

Plugin kênh trả lời lệnh gọi công cụ trước khi plugin bắt đầu bất kỳ công việc nào. `builtIn_emitSparkCommand` tiếp cận mô-đun thông qua một phong bì đã nhập có hành động là văn bản chưa được nhập và nó trả về `spark:command sent (id) to ...` ngay khi socket chấp nhận sự kiện. Do đó, mô hình không thể đọc kết quả của cuộc gọi Trợ lý gia đình và kết quả của công cụ cho thấy thành công mà không ai xác minh.

Giao thức mang hình dạng ack, `spark:emit` với lệnh `eventId` và `handleSparkEmit` trong `shared/ui/stage/src/stores/character/orchestrator/store.ts` là một hàm trống. Kết quả chỉ có thể đến sau, thông qua `context:update` hoặc `spark:notify`, đây là một ngã rẽ khác.

Plugin kênh cũng yêu cầu người dùng bắt đầu quy trình bằng tay và máy chủ kênh store không có cấu hình, vì vậy plugin phải duy trì cài đặt riêng và trang cài đặt chỉ có thể đẩy bản cập nhật trực tiếp.

<a id="why-not-an-extension"></a>

### Tại sao không phải là phần mở rộng

`@angela/plugin-sdk` cung cấp một công cụ được gõ có giá trị trả về thực, do đó nó đáp ứng yêu cầu tương tự. Ba sự thật quyết định chống lại nó ở đây.

- Không có tiện ích mở rộng nào có thể nhận cấu hình. `ExtensionSetupContext` chỉ mang `extension`, `subscriptions`, `kits` và `modules`, đồng thời trình phân tích cú pháp tệp kê khai từ chối các trường không xác định, do đó URL cơ sở và token không có đường dẫn vào.
- Mã mở rộng chạy trong quy trình chính của Electron không có hộp cát và không có ranh giới quy trình, đồng thời quy trình chính không có trình xử lý `uncaughtException`. Việc ném sau `setup` có thể kết thúc ứng dụng.
- `shared/sdk/plugin/src/index.ts` tuyên bố rằng API có thể thay đổi mà không có cảnh báo và không có tiện ích mở rộng ví dụ nào đăng ký một công cụ. Con đường chưa được chứng minh.

<a id="why-not-the-mcp-tool-chain"></a>

### Tại sao không phải là chuỗi công cụ MCP

mô hình đã gõ các công cụ `builtIn_mcpListTools` và `builtIn_mcpCallTool` và quy trình chính chạy các máy chủ stdio MCP từ `mcp.json`. Home Assistant cung cấp một máy chủ MCP của riêng mình, vì vậy người dùng có thể kết nối một máy chủ ngay hôm nay mà không cần mã từ kho lưu trữ này.

Đường dẫn đó vẫn có sẵn và bản ghi này không thay thế nó. Nó cần một transport từ xa, vì Home Assistant phục vụ MCP qua HTTP và nó giao độ phân giải thực thể cho mô hình. Sự tích hợp này tồn tại để cung cấp cho mô hình một công cụ Trợ lý gia đình thực sự và để giải quyết "đèn phòng khách" trong plugin thay vì trong prompt.

<a id="what-the-model-calls"></a>

## mô hình gọi là gì

Ba công cụ đã nhập sẽ có trong danh sách công cụ của mô hình và mô hình đọc từng kết quả trong cùng một lượt:

| Công cụ | Lập luận | Kết quả |
| --- | --- | --- |
| `home_assistant_list_entities` | `domain` | Các thực thể và trạng thái của chúng, được giới hạn |
| `home_assistant_get_state` | `entity_id` | Trạng thái và thuộc tính |
| `home_assistant_call_service` | `domain`, `service`, `entity_id`, `data` | Các tiểu bang Trợ lý gia đình đã thay đổi |

`data` là chuỗi đối tượng JSON. Ràng buộc tương tự xuất hiện bên cạnh `builtIn_mcpCallTool`: `z.record()` phát ra `propertyNames`, OpenAI từ chối.

`entity_id` được yêu cầu trên `home_assistant_call_service`. Một cuộc gọi không có mục tiêu sẽ tiếp cận toàn bộ miền cùng một lúc, đây là một hành động lớn hơn mức người dùng yêu cầu. mô hình gọi dịch vụ một lần cho mỗi thực thể, do đó, "tắt đèn" sẽ tốn một cuộc gọi cho mỗi đèn.

Các công cụ gắn kết chỉ khi địa chỉ và token được lưu trữ. Tích hợp chưa được định cấu hình sẽ không hiển thị với mô hình vì mọi cuộc gọi đều không thành công.

<a id="configuration-and-credentials"></a>

## Cấu hình và thông tin xác thực

Quá trình chính sở hữu địa chỉ và token, trong `home-assistant-v1.json` trong thư mục dữ liệu người dùng Electron. renderer đọc lại địa chỉ và xem liệu token có tồn tại hay không và không bao giờ là token.

Trường token trống sẽ giữ token được lưu trữ. token thuộc về một phiên bản, do đó, việc lưu thay đổi địa chỉ cần có token cho địa chỉ mới và quy trình chính từ chối lưu mà không có địa chỉ. Do đó, trường token trống chỉ giữ bí mật khi địa chỉ vẫn còn.

token được lưu trữ ở dạng văn bản thuần túy. Mọi tệp cài đặt khác trong kho lưu trữ store này đều bí mật theo cách tương tự và không có mã nào ở đây sử dụng Electron `safeStorage`. Trang cài đặt cho biết token vẫn ở trên thiết bị.

<a id="the-request-boundary"></a>

## Ranh giới yêu cầu

renderer gửi một đường dẫn và quy trình chính sẽ áp dụng địa chỉ và token. Điều đó làm cho trình xử lý yêu cầu trở thành nơi duy nhất quyết định nơi yêu cầu đến, vì vậy nó chấp nhận ba hình dạng và không có gì khác:

| Phương pháp | Đường dẫn |
| --- | --- |
| `GET` | `/api/states` |
| `GET` | `/api/states/{domain}.{object_id}` |
| `POST` | `/api/services/{domain}/{service}` |

Hai hình dạng bên ngoài danh sách đó có ý nghĩa quan trọng. `POST /api/template` chạy Jinja tùy ý trên Home Assistant host và `POST /api/states/{id}` ghi trạng thái. Phép đo xác định rằng token được lưu trữ đã đạt được cả hai. Khách hàng không xây dựng hình dạng.

Mọi phân đoạn mà khách hàng xây dựng đều khớp với `[a-z0-9_.]`, do đó các mẫu cũng từ chối phần trăm thoát, phân đoạn `..`, dấu gạch chéo kép và khoảng trắng. Sau khi URL được tạo, `pathname` đã được giải quyết vẫn phải nằm trong đường dẫn cơ sở vì proxy ngược có thể phục vụ Home Assistant dưới đường dẫn phụ.

Quy tắc thứ hai bao gồm địa chỉ. token thuộc về một phiên bản Home Assistant, do đó, không có bản cập nhật nào có thể di chuyển địa chỉ trong khi token được lưu trữ vẫn ở lại. Nếu không có quy tắc đó, renderer sẽ chuyển địa chỉ đến máy chủ mà nó kiểm soát và yêu cầu tiếp theo sẽ gửi token đến đó.

<a id="device-access"></a>

## Quyền truy cập thiết bị

Người dùng quyết định mô hình tiếp cận thiết bị nào. Trang cài đặt cung cấp ba chế độ và các công cụ áp dụng chính sách.

| Chế độ | Tiếp cận |
| --- | --- |
| `all` (mặc định) | Mọi thiết bị |
| `allow` | Các thiết bị nằm trong danh sách cho phép và không có gì khác |
| `deny` | Mọi thiết bị ngoại trừ những thiết bị trong danh sách chặn |

Đơn vị là thiết bị, không phải miền. Một miền chứa cả thiết bị vô hại và cánh cửa, do đó quy tắc miền không thể tách chúng ra. Thay vào đó, miền là một cách để duyệt qua danh sách: trang cài đặt hiển thị một tab cho mỗi miền, được đặt tên theo ngôn ngữ của trang.

Một danh sách trống giữ nguyên nghĩa đen của nó trong mỗi chế độ. Danh sách cho phép trống không đạt được gì, bởi vì "chỉ cho phép những thứ này" mà không có lựa chọn nào có nghĩa là "không cho phép". Danh sách chặn trống tiếp cận mọi thứ, đó là lý do tại sao `all` và `deny` có danh sách trống hoạt động giống nhau. Giá trị mặc định vẫn là `all`, do đó người dùng mới sẽ tiếp cận mọi thiết bị.

Hai danh sách được lưu trữ riêng biệt. Một danh sách chia sẻ sẽ biến mọi thiết bị được phép thành thiết bị bị chặn ngay khi người dùng chuyển chế độ.

Chính sách này tồn tại trong renderer store, bên cạnh công tắc mô-đun, vì người dùng sở hữu lựa chọn và các công cụ đọc nó trực tiếp trong renderer.

Các công cụ chạy trong cửa sổ dẫn đầu và cửa sổ cài đặt là cửa sổ theo dõi. Bộ chọn viết bản sao của chính nó cùng một lúc để bộ điều khiển trả lời, sau đó áp dụng chính sách tương tự thông qua một hành động được đồng bộ hóa. Một sự kiện lưu trữ sẽ đến với người dẫn đầu theo lịch trình riêng của nó, để lại một cuộc gọi mô hình đã giữ nguyên quy tắc mà người dùng vừa thay thế. Một lần đẩy không thành công sẽ báo cáo nó trên trang, vì khi đó lưới sẽ hiển thị một quy tắc mà người dẫn đầu không tuân theo. Hai danh sách di chuyển dưới dạng mảng đơn giản, vì transport sao chép các đối số của cuộc gọi được định tuyến và proxy phản ứng Vue không sao chép.

<a id="what-a-call-can-run"></a>

### Cuộc gọi có thể diễn ra như thế nào

Chính sách đặt tên cho thiết bị và việc kiểm tra thiết bị chỉ hoạt động tốt khi dịch vụ hoạt động trên đó. Hai loại dịch vụ sẽ phá vỡ liên kết giữa thiết bị mà người gọi đã kiểm tra và nội dung cuộc gọi thay đổi.

- Một dịch vụ là mục tiêu riêng của mình. Một tập lệnh đăng ký một dịch vụ được đặt theo tên của nó, vì vậy `POST /api/services/script/good_night` chạy tập lệnh đó và bỏ qua `entity_id` trong nội dung. Đo lường: tập lệnh chạy trong khi nội dung đặt tên cho một công tắc không liên quan.
- Một dịch vụ mở rộng mục tiêu của nó. Một cuộc gọi dịch vụ trên một thực thể nhóm sẽ đến được với mọi thành viên. Đo lường: một nhóm có hai thành viên thay đổi cả hai.

Một lượt mô hình giữ các công cụ mà nó đã giải quyết khi lượt bắt đầu. Do đó, các công cụ sẽ đọc chính sách ở mỗi lệnh gọi, do đó, một thay đổi trong lượt đó sẽ ảnh hưởng đến các lệnh gọi mà lượt đó vẫn thực hiện.

Do đó, việc tích hợp chỉ chạy các dịch vụ hoạt động trên thiết bị mà người gọi đặt tên. Một dịch vụ bên ngoài danh sách không thành công và thông báo đặt tên cho những gì miền chấp nhận. Cuộc gọi mà mục tiêu báo cáo danh sách thành viên cũng không thành công và mô hình yêu cầu người dùng nhập tên một thiết bị.

Một cuộc gọi cũng báo cáo các trạng thái mà nó đã thay đổi. Một cảnh, một tập lệnh hoặc một thao tác tự động hóa sẽ thay đổi các thiết bị mà người dùng chưa bao giờ đặt tên, do đó, báo cáo sẽ đưa ra các thiết bị mà chính sách hiển thị và số lượng thiết bị mà chính sách đó ẩn đi. Danh sách và trạng thái đọc áp dụng cùng một chính sách, do đó, thiết bị bị chặn không thể truy cập thông qua hiệu ứng của thiết bị khác.

<a id="one-instance"></a>

### Một trường hợp

Id thực thể có nghĩa là một thiết bị trên một phiên bản. Việc thay đổi địa chỉ sẽ xóa cả hai danh sách vì danh sách được viết cho phiên bản cũ sẽ đến một thiết bị khác trên danh sách mới.

Hai danh sách rõ ràng về các mặt khác nhau của việc di chuyển. Danh sách cho phép trống không có tác dụng gì, vì vậy việc xóa nó trước khi di chuyển địa chỉ chỉ có thể làm mất đi phạm vi tiếp cận. Một danh sách chặn trống sẽ tiếp cận mọi thứ, do đó, việc xóa danh sách đó trước khi di chuyển sẽ mở phiên bản cũ trong thời gian lưu. Nó sẽ xóa sau khi tiến trình chính giữ địa chỉ mới, khi phiên bản cũ nằm ngoài tầm với.

Một lần lưu sẽ đọc địa chỉ mà tiến trình chính giữ tại thời điểm nó chạy. Giá trị mà trang đọc khi nó được gắn sẽ trống cho đến khi trang đó được đọc và giá trị trống sẽ được đọc dưới dạng cấu hình đầu tiên. Danh sách phiên bản mà người dùng rời đi sau đó sẽ tồn tại trong danh sách phiên bản mới.

Các công cụ áp dụng chính sách hơn là quy trình chính. mô hình chỉ tiếp cận Trợ lý gia đình thông qua các công cụ này, vì vậy đây là lúc thiết bị bị chặn nằm ngoài tầm với. Hai hậu quả theo sau.

- Một danh sách ẩn một thiết bị bị chặn và báo cáo số lượng thiết bị đó đã ẩn. Danh sách trống im lặng cho mô hình biết rằng người dùng không sở hữu thiết bị đó.
- Việc đọc hoặc cuộc gọi trên thiết bị bị chặn không thành công kèm theo thông báo nêu tên thiết bị và danh sách chứa thiết bị đó. mô hình đọc thông báo đó và yêu cầu người dùng thực hiện một thay đổi hữu ích.

Chính sách này cũng xuất hiện trong mỗi mô tả công cụ. mô hình lập kế hoạch từ danh sách công cụ, do đó, chính sách nêu rõ rằng không có cuộc gọi khám phá nào bị thất bại.

Bộ chọn liệt kê mọi thiết bị mà phiên bản báo cáo, bao gồm cả những thiết bị bị chặn. Trang cài đặt cần có toàn bộ danh sách vì thiết bị mà mô hình không thể tiếp cận chính xác là thiết bị mà người dùng phải có thể thêm.

Lưới ô xếp hiển thị một thiết bị mà Trợ lý chính đã ngừng báo cáo trong khi danh sách vẫn giữ thiết bị đó. Hàng giữ số 0 nên người dùng vẫn có thể bỏ chọn nó.

Chính sách này ràng buộc mô hình chứ không phải renderer thù địch. Mã chạy trong renderer có thể mở rộng chính sách thông qua trình xử lý cài đặt và có thể tạo yêu cầu riêng. Quá trình chính sở hữu ranh giới chống lại điều đó.

Chính sách dành cho mỗi thiết bị khiến hành vi của mô hình trở nên tồi tệ hơn. Yêu cầu "tắt mọi đèn" hiện không thành công trên từng thiết bị khi bất kỳ đèn nào bị chặn, trong đó quy tắc miền không thành công một lần. Ghi chú liệt kê và mô tả công cụ chỉ là biện pháp giảm nhẹ và cả hai đều không hoàn hảo.

<a id="platform-scope"></a>

## Phạm vi nền tảng

stage Tamagotchi. stage Web đang chờ.

Một trang trình duyệt không thể truy cập phiên bản Home Assistant trên `http://192.168.x.x` nếu không có `cors_allowed_origins` ở phía Home Assistant và một trang được phân phát qua https bị chặn bởi nội dung hỗn hợp. stage Pocket chờ thiết bị iOS thử nghiệm.

Máy khách đã sử dụng transport, vì vậy một nền tảng khác sẽ thêm transport thay vì máy khách thứ hai.

<a id="alternatives-this-record-leaves-open"></a>

## Các lựa chọn thay thế mà bản ghi này để ngỏ

- Một plugin kênh cho stage Web. Nó chia sẻ cùng một máy khách và không trả lại kết quả nào cho mô hình.
- Một tiện ích mở rộng, sau khi plugin SDK mang cấu hình và có một ví dụ hoạt động.
- MCP route, không cần mã nào cả.

<a id="non-goals"></a>

## Ngoài phạm vi

- Không có chính sách cho mỗi tên miền. Đơn vị là thiết bị, vì vậy người dùng muốn tiếp cận mọi ánh sáng sẽ chọn từng ánh sáng hoặc không chọn gì và để trống danh sách từ chối.
- Không có trang web stage nào hoạt động.
- Không có plugin kênh. khung ban đầu trong `plugins/` đã không còn nữa và thay đổi Web stage sau đó sẽ bổ sung lại gói nếu cần.
- Không có đăng ký sự kiện. Giai đoạn đầu tiên đọc và viết theo yêu cầu. Một thiết bị tự thay đổi trạng thái là một tính năng mới hơn.

<a id="open-questions"></a>

## Câu hỏi mở

- Bộ công cụ có cần `requiresExplicitSelection` cho `call_service` như `computer_use` không? Trình soạn nhạc được chia sẻ không gửi trường `tools`, vì vậy cổng kiểm tra chỉ hoạt động trong Tamagotchi renderer.
- Trang cài đặt có cần phân chia đọc và điều khiển để mô hình đọc cảm biến cửa mà không cần mở khóa không? Một lựa chọn hiện cấp cả hai.
- Quy trình chính có sở hữu chính sách ngoài danh sách cho phép yêu cầu không? Giai đoạn này chỉ ràng buộc mô hình. renderer có chức năng thực thi mã có thể mở rộng chính sách thông qua trình xử lý cài đặt.
- Bản đồ bí danh thực thể có thuộc về trang cài đặt nên "đèn phòng khách" được giải quyết mà mô hình không đọc danh sách thực thể không?
- token có chuyển sang Electron `safeStorage` không?
- Bộ công cụ Home Assistant có phát triển theo khu vực và cảnh không?
