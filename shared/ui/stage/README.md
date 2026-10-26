# Stage UI

Lõi chia sẻ cho stage

## Phát giọng nói độc lập với avatar

`useSpeechOutput` kết nối chat, tổng hợp giọng nói, phát âm thanh và caption trong một renderer.
Scope sở hữu các hook và kết nối đầu ra. Khi scope đóng, chúng được giải phóng.
Desktop dùng composable này trực tiếp. Stage trên web dùng thêm `beforeResponse` để chuẩn bị nhép miệng.
Host chỉ dùng chat gọi `initializeStageModel({ loadModel: false })` trước khi khởi tạo hồ sơ.
Chế độ này giữ lựa chọn model đã lưu nhưng không đọc model, tạo URL hoặc khởi tạo renderer.

<a id="shared-local-provider-settings"></a>

## Cài đặt nhà cung cấp cục bộ được chia sẻ

`connectLocalProviderConfig` kết nối nhà cung cấp hiện có và các hành động thẻ với cấu hình transport thuộc sở hữu của host. desktop cung cấp Eventa IPC. Trang web cục bộ cung cấp Vite HTTP transport từ `@angela/local-config`. Chỉ người lãnh đạo Pinia mới đọc và ghi tệp. Người theo dõi gửi hành động rõ ràng thông qua store được đồng bộ hóa hiện có. Ảnh chụp nhanh từ xa được áp dụng mà không có tiếng vang liên tục. Mỗi cấu hình nhập nhà cung cấp trực tiếp hiện có của nó một lần cho mỗi tệp cấu hình. Bộ nhớ cục bộ giữ lại trạng thái giao diện và ảnh chụp nhanh nhà cung cấp được lưu vào bộ nhớ đệm. Tệp được chia sẻ sở hữu nhà cung cấp trực tiếp và trò chuyện mô hình đã chọn. Dừng kết nối khi ứng dụng ngắt kết nối. Sử dụng `flush()` để chờ ghi đang chờ xử lý.

<a id="experimental-features"></a>

## Tính năng thử nghiệm

Đăng ký cờ trong `libs/feature-flags.ts`. Đọc trạng thái của họ thông qua `useFeatureFlagsStore().isEnabled(key)`. Đặt `availability` thành `local` hoặc `cloud`. Cờ cục bộ hiển thị các thiết bị chuyển mạch mà không có quyền truy cập vào Đám mây. Cloud quyết định xem mỗi cờ Cloud được cấp có cho phép chọn tham gia tài khoản hay sử dụng quyền kiểm soát trực tiếp. Đăng ký khách hàng không trùng lặp chế độ này. Cờ `cloud-opt-in` chỉ hiển thị các công tắc sau khi Cloud cấp quyền truy cập vào tài khoản đã được xác minh. Họ bắt đầu bị vô hiệu hóa và giữ lại các lựa chọn cho mỗi tài khoản trên thiết bị này. Cờ `cloud-controlled` tuân theo sự cấp phép trực tiếp của Đám mây và không bao giờ để lộ công tắc. Thiếu trợ cấp Đám mây sẽ vô hiệu hóa các tính năng của Đám mây. Làm mới các lỗi và thay đổi tài khoản sẽ xóa các khoản trợ cấp chứ không phải các lựa chọn cục bộ. `useCloudFetch()` trong `composables/cloud.ts` chia sẻ nguồn gốc Đám mây và ranh giới tìm nạp được xác thực. store đọc `GET /v1/feature-flags`. Đặt `VITE_CLOUD_URL` cho nguồn gốc Đám mây tùy chỉnh. Triển khai quá trình di chuyển của nó và API trước máy khách. Giữ kiểm tra ủy quyền trên máy chủ.

<a id="message-times"></a>

## Số lần nhắn tin

Lịch sử trò chuyện hiển thị dấu thời gian ở giữa trước tin nhắn ghi ngày đầu tiên và sau năm phút không có tin nhắn. Dấu thời gian sử dụng thời gian của tin nhắn được lưu trữ, ngôn ngữ giao diện và múi giờ của thiết bị. Tin nhắn không có dấu thời gian hợp lệ sẽ không có dấu phân cách. Dấu phân cách ngày nay chỉ hiển thị thời gian. Hôm qua và ngày hôm trước sử dụng nhãn tương đối. Các dấu phân cách cũ hơn hiển thị tháng và ngày. Ngày bên ngoài năm hiện tại cũng hiển thị năm. Nhấp vào dấu phân cách để chuyển đổi ngày và giờ đầy đủ của nó. Nhãn tương đối được làm mới mỗi phút khi lịch sử được mở. `date-fns` xử lý so sánh lịch và định dạng bản địa hóa thông qua `intlFormat` và `intlFormatDistance`. Danh sách phiên hiển thị và sắp xếp theo dấu thời gian tin nhắn hợp lệ mới nhất của người dùng hoặc trợ lý. Các phiên không có tin nhắn hội thoại ghi ngày tháng sẽ sử dụng thời gian tạo của chúng. Đang tải tin nhắn cập nhật danh sách từ lịch sử được lưu trữ. Việc lưu hoặc đồng bộ hóa phiên không thay đổi thời gian hoạt động được hiển thị trừ khi thông báo của phiên đó thay đổi.

<a id="learning-reviews"></a>

## Đánh giá học tập

Các công cụ ghi nhớ học tập sử dụng ký tự phiên hiện tại và yêu cầu trích dẫn từ tin nhắn người dùng đã gửi. `schedule_learning_review` đặt khoảng thời gian là 1, 3, 7, 14 hoặc 30 ngày. Khoảng 0 sẽ loại bỏ lịch trình. Lịch trò chuyện mới trì hoãn lần đánh giá đầu tiên một khoảng thời gian. Lịch trình cài đặt hiện tại sẽ được xem xét ngay lần đầu tiên. Lịch trình lặp đi lặp lại bảo đảm tiến độ và ngày đến hạn. Việc lập kế hoạch không đánh dấu việc đánh giá là hoàn tất. Thời gian và khoảng thời gian đồng hồ không được hỗ trợ cần phải được làm rõ. Kết quả công cụ thành công tuân theo việc ghi lưu trữ lâu dài. Lời nhắc desktop được chọn tham gia. Chỉ renderer chính được chọn mới kiểm tra ký tự đã chọn, một lần mỗi phút. Biên lai native xác định ngày đến hạn chính xác. Biên nhận liên tục ngăn chặn các lời nhắc trùng lặp sau khi tải lại và không thay đổi tiến trình xem xét. Việc lên lịch lại, vô hiệu hóa bộ nhớ và xóa bản ghi sẽ làm mất hiệu lực các biên lai đang chờ xử lý.

<a id="startup-progress"></a>

## Tiến trình khởi động

`useStartupResourcesStore` ghi lại từng tài nguyên dưới dạng xếp hàng, đang tải, sẵn sàng, không thành công hoặc bị bỏ qua. Các ứng dụng đăng ký danh sách tài nguyên đầy đủ trước khi bắt đầu công việc. Luồng khởi động của họ báo cáo kết quả của từng mô-đun thông qua store. Root ứng dụng đặt lại store trước khi đăng ký. Điều này cũng ngăn tải cũ cập nhật đăng ký mới sau khi tải lại nóng. `StartupOverlay` đọc store và hiển thị giật gân, tiến trình hoặc lỗi khi thực hiện lại hành động. `useStartupResourceTimeout` gặp lỗi tài nguyên vẫn tải quá thời hạn. Web và Pocket áp dụng nó để tải ký tự mô hình. Máy chủ Mods tùy chọn kết nối bên ngoài công việc khởi động được theo dõi. Kết nối của nó không chặn việc đưa lên máy bay. HTML của mỗi ứng dụng hiển thị lần giật gân đầu tiên trước khi gắn kết Vue. CSS ẩn nó khi Vue hiển thị thành `#app`. Trang chủ báo cáo khi ký tự mô hình của nó sẵn sàng hoặc bị lỗi. mô hình bị lỗi sẽ giữ cho lớp phủ hiển thị. Nếu mô hình không thành công, người dùng có thể thử lại ứng dụng hoặc tiếp tục mà không cần nhập ký tự. Lớp phủ phát ra `finished` khi tất cả tài nguyên đã sẵn sàng. Ứng dụng mở trên tàu tại thời điểm đó.

<a id="voice-integration"></a>

## Tích hợp giọng nói

Âm thanh host sở hữu một VoiceController và một đầu vào micrô dùng chung. Các cửa sổ khác gửi lệnh Eventa và hiển thị ảnh chụp nhanh. Họ không tạo thu nhận dữ liệu cạnh tranh hoặc phát lại runtime. bên sử dụng đăng ký đầu vào micrô bằng tín hiệu hủy bỏ của riêng chúng. Người đăng ký cuối cùng rời đi sẽ nhả thiết bị.

- `useVoiceStore` sở hữu định tuyến ứng dụng, bản nháp, đăng ký lệnh Responses và host.
- `useVoiceController` liên kết trạng thái bộ điều khiển công cộng với Vue và di chuyển bộ điều khiển đến đầu vào của thiết bị đã chọn.
- Bản đồ `useVoiceInput` giữ và nhả các điều khiển thành các lệnh host.
- `VoiceInputButton` là điều khiển bằng giọng nói của desktop và các nhà soạn nhạc web. Nhấp vào nó để bắt đầu và nhấp lại để dừng. Di chuột hoặc nhấp chuột phải vào nó để mở chế độ Tự động gửi, micrô và nghe liên tục. Thanh trạng thái của nó hiển thị dạng sóng và thời gian, đồng thời giữ một tin nhắn thoại đang chờ gửi. Đọc chính tả ghi bản ghi trực tiếp của nó vào văn bản soạn nhạc và không tạo ra bản nháp giọng nói.
- `VoiceComposer` là điều khiển bằng giọng nói cảm ứng dành cho các nhà soạn nhạc di động. Giữ nó để ghi, trượt sang trái để hủy và trượt lên để khóa. Một tin nhắn thoại sẽ được gửi khi phát hành.
- `useVoiceMessagesStore` sở hữu các bản ghi tin nhắn thoại và gửi tệp đính kèm của chúng.
- Thính giác chọn nhà cung cấp và chuyển đổi PCM đã chụp sang định dạng tải lên của từng nhà cung cấp. Nó không mở micro.
- Giọng nói duy trì sự tổng hợp phân đoạn hiện có và đầu ra nhà cung cấp hai chiều.
- `createVoiceRephrasePlugin` viết lại bản ghi cuối cùng bằng cuộc trò chuyện mô hình thông qua bản vá bản ghi đã được kiểm tra. Văn bản thô vẫn còn trong lịch sử bản ghi. Mỗi phân đoạn được viết lại riêng, do đó, ranh giới phân đoạn sẽ được giữ nguyên cho các nhãn loa sau này. Một phản hồi với số lượng phân đoạn khác sẽ giữ nguyên văn bản.
- `createVoiceEndJudgePlugin` kết thúc sớm quá trình nhập bị tạm dừng khi cuộc trò chuyện mô hình đọc bản ghi của nó dưới dạng tin nhắn đã hoàn tất. mô hình là mô hình viết lại hoặc mô hình trò chuyện khi không đặt cụm từ lại nhà cung cấp.

Việc tạm dừng 1,2 giây có thể kết thúc đầu vào. Khi đánh giá cuối được bật, đây là mặc định, giới hạn im lặng của hoạt động giọng nói sẽ tăng thêm 3 giây. Sau đó, giám khảo sẽ kết thúc một tin nhắn đã hoàn thành khi tạm dừng và một tin nhắn chưa hoàn thành sẽ đợi người nói tiếp tục. Một phán đoán sai lầm hoặc chậm chạp không bao giờ cản trở lời nói mới. Nếu không có người đánh giá cuối, khoảng dừng 1,2 giây sẽ kết thúc mọi đầu vào.

Ảnh chụp nhanh host mang các phân đoạn bản ghi đã sửa của đầu vào hiện hoạt. `VoiceDrafts` hiển thị chúng dưới dạng phần tiếp theo của bản nháp, trong một đoạn văn. Đoạn văn này là chỉ đọc khi lời nói được phiên âm và trở thành bản nháp có thể chỉnh sửa khi bài phát biểu ổn định. Văn bản cuối cùng sử dụng màu cơ thể. Văn bản đang chờ xử lý sử dụng màu chủ đề ở độ mờ thấp hơn và phân đoạn đang chờ xử lý mới nhất sử dụng độ mờ hoàn toàn. Bản nháp mà host đang gửi vẫn bị ẩn. Bản nháp của các cuộc trò chuyện khác hiển thị dưới dạng các khối được đặt tên. `VoiceDrafts` phát ra `presence`, do đó host có thể phản ứng khi nó không hiển thị gì, chẳng hạn như sau khi gửi hoặc loại bỏ. Tính năng diễn đạt lại được bật theo mặc định. Lỗi hoặc hết thời gian chờ 10 giây sẽ gửi văn bản nhà cung cấp.

Bản ghi chỉ được gửi khi điều khiển của nó yêu cầu với `finish` và `send: true` hoặc với `send` rõ ràng. Gửi không thành công sẽ giữ lại bản ghi và nhận dạng thư của nó, do đó, bộ điều khiển có thể gửi lại hoặc loại bỏ nó. Trong khi bộ điều khiển ghi lại hoặc ra lệnh, host sẽ xuất mức micrô trên `voiceInputLevel`. Âm thanh native yêu cầu hỗ trợ mô hình và Chat Completions đã được khai báo. mô hình khác ghi lại bản ghi bằng Thính giác nhà cung cấp đã được định cấu hình. Mỗi yêu cầu mô hình sẽ đưa ra quyết định này một lần nữa. Một bước công cụ thay đổi mô hình cũng thay đổi cách trình chiếu âm thanh. Lịch sử cục bộ giữ lại âm thanh và bản ghi được lưu trong bộ nhớ đệm. Các lượt âm thanh vẫn cục bộ vì các bản ghi văn bản trên đám mây không thể bảo toàn phương tiện của chúng.

<a id="hearing-input-mode"></a>

### Chế độ đầu vào nghe

Thính giác store giữ `inputMode`. Công tắc micrô (`useSettingsAudioDevice().enabled`) bật hoặc tắt chế độ đã chọn.

- `always-on` giữ micrô mở và chạy phát hiện hoạt động giọng nói. Đây là mặc định.
- `push-to-talk` chỉ bắt đầu nhập giọng nói khi người dùng giữ một phím. Micrô chỉ mở trong khi giữ.
- `wake-word` giữ micrô mở và chạy phát hiện hoạt động giọng nói và phát hiện từ đánh thức. Chỉ có một sự đánh thức mới bắt đầu một đầu vào.

`startsInputOnSpeech(mode)` quyết định xem VAD có khởi động đầu vào hay không. Ở chế độ `wake-word`, mục tiêu lời nói của giọng nói store không được xác định. Tính năng phát hiện từ đánh thức chạy ở mọi chế độ nghe liên tục. Trong chế độ `always-on`, việc đánh thức cũng di chuyển đầu vào đến phiên của ký tự phù hợp. Giọng nói host xuất bản quá trình chuẩn bị máy dò trong ảnh chụp nhanh của nó dưới dạng `wakeWords`, do đó, cửa sổ cài đặt có thể hiển thị nó.

Mỗi trang stage gọi `useVoiceListening` một lần. Đó là nơi bắt đầu hoặc dừng việc nghe liên tục. `listensContinuously(mode)` trong `stores/modules/hearing.ts` quyết định chế độ nào chạy phát hiện và giữ micrô mở. Để thêm chế độ, hãy mở rộng `HearingInputMode`, `listensContinuously`, `startsInputOnSpeech` và `useVoiceListening`.

`useVoicePushToTalk` kết nối giữ với `voice.beginManual`. Báo chí ghi lại phiên hoạt động, do đó, chuyển đổi phiên trong khi giữ sẽ không di chuyển bài phát biểu. `useVoiceHold` sở hữu vòng đời giữ: nó bỏ qua việc lặp lại phím, hủy một lần nhấn ngắn hơn 300 mili giây và hủy khi tắt hoặc hủy. `useVoiceHoldKey` điều khiển việc giữ bằng phím trong trang, Dấu cách theo mặc định. Nó bỏ qua các trường văn bản, điều khiển và các phím đã sửa đổi, đồng thời hủy khi trang mất tiêu điểm. Trang web stage sử dụng Space. desktop stage sử dụng phím tắt chung có thể định cấu hình.

Mỗi ứng dụng host sẽ khai báo liệu ứng dụng đó có trình kích hoạt Push to Talk hay không. Nó cung cấp `pushToTalkTriggerKey` từ `composables/push-to-talk-trigger` ở cấp ứng dụng. Không có nhà cung cấp, host không có trình kích hoạt. Sau đó, bộ chọn chế độ đầu vào của `HearingConfig` sẽ tắt tùy chọn Push to Talk. Nếu chế độ đã lưu đã là `push-to-talk` trên host đó thì việc nghe sẽ bị tắt. `HearingConfig` và menu nút giọng nói hiển thị cảnh báo. `HearingConfig` được sử dụng trên trang Tổng quan về Thính giác và trong hộp thoại Thính giác. Nó chỉ yêu cầu quyền sử dụng micrô khi người dùng bật công tắc micrô. Chế độ này không quay trở lại `always-on` vì chế độ này luôn mở micrô.

| host | Kích hoạt |
| --- | --- |
| stage-tamagotchi | Đúng. Tất cả các cửa sổ đều chia sẻ một ứng dụng nên cửa sổ cài đặt cũng cung cấp chế độ này. |
| stage-web | Chỉ với một con trỏ tốt, `(any-pointer: fine)`. Không gian là yếu tố kích hoạt duy nhất và không có Web API nào báo cáo bàn phím phần cứng. |
| stage-pocket, stage-tamagotchi-kirie | Không. Họ không cung cấp gì cả. |

<a id="wake-words"></a>

### Đánh thức lời nói

`useWakeWordsStore` xác thực cách phát âm dựa trên từ vựng mô hình được cung cấp và lưu giữ chúng trong thẻ ký tự được xuất. Danh mục thiết bị cục bộ của nó tạm dừng các xung đột phát âm chưa được giải quyết. `chooseOwner` kích hoạt bản sao của ký tự đã chọn. `setWords` trả về xung đột cho các công cụ hoặc cài đặt xuất hiện. Nó không phát minh ra mô hình hoặc UI quản lý từ khóa.

Công cụ `configure_wake_words` chỉnh sửa các từ đánh thức của nhân vật sở hữu phiên của lượt. Nó xác thực token dựa trên từ vựng KWS được ghim trong `libs/voice/kws-model`. Nó trả về `saved` có xung đột hoặc `rejected` có lý do.

`voice.startListening` chạy tính năng phát hiện KWS tích hợp khi host không vượt qua `detectWakeWord`. `WakeWordDetector` nghe `useSettingsAudioDevice().unprocessedInput`, thu nhận dữ liệu thứ hai của micrô đã chọn mà không có chức năng khử tiếng vang, khử tiếng ồn hoặc tăng âm của trình duyệt. Quá trình xử lý đó sẽ thay đổi điện thoại mà từ khóa mô hình nghe thấy. thu nhận dữ liệu thứ hai chỉ mở khi danh mục có cách phát âm đang hoạt động. Trình phát hiện xếp hàng các lô mẫu đơn hữu hạn dài 100 ms cho trình phát hiện từ khóa Sherpaw worker. Sherpa-ONNX lấy mẫu lại chúng theo tốc độ mô hình. Sự công nhận không chờ đợi worker. Plugin hoạt động bằng giọng nói sẽ thu thập thông tin đánh thức trên cửa sổ tiếp theo. Một hồ sơ tồn đọng hơn 1 giây sẽ bị loại bỏ. Plugin cũng chuyển kết quả VAD của nó tới máy dò. Việc tạm dừng 0,5 giây sẽ bắt đầu một luồng phát hiện mới vì luồng chạy trong vài phút sẽ bỏ lỡ hầu hết các cuộc gọi. Mỗi từ khóa sử dụng cài đặt tìm kiếm của `kwsSearch` và thêm các biến thể âm sắc từ `kwsToneVariants`. Một biến thể làm thay đổi thanh điệu của một bính âm cuối cùng, bởi vì tên được gọi thường thay đổi thanh điệu của nó. Trận đấu ánh xạ thông qua danh mục đang hoạt động tới `voice.resolveWakeTarget(characterId, signal)`. Thao tác này sẽ chọn một phiên mà không cần điều hướng cửa sổ trò chuyện. Những thay đổi trong danh mục sẽ xây dựng lại các từ khóa của người theo dõi. Kết quả sau khi dừng hoặc xây dựng lại từ khóa sẽ bị loại bỏ.

`useWakeWordDetectionStore().preparation` báo cáo `unconfigured`, `preparing`, `ready` hoặc `error` cho UI. mô hình chỉ tải khi danh mục có cách phát âm cho mô hình được ghim. Cho đến khi mô hình sẵn sàng, tính năng phát hiện sẽ không đánh thức. Trong khi không có người nghe nào chạy, việc chuẩn bị là `unconfigured`.

host có thể chuyển `detectWakeWord` của chính nó tới `voice.startListening`. Sau đó, tính năng phát hiện tích hợp không bắt đầu. Máy dò vẫn hoạt động trong khi phát lại. Trình phân loại `acceptSpeech` được cung cấp có thể từ chối tiếng vang phát lại trước khi nhập. Chính sách mặc định cho phép xâm nhập khi trình duyệt báo cáo loại bỏ tiếng vang. Nếu không có sự hỗ trợ đó, việc nhập học tự động sẽ chờ quá trình phát lại kết thúc. Lựa chọn mô hình, phân loại tiếng vang âm thanh và đăng ký vẫn được tích hợp bên ngoài.

<a id="chat-sampling"></a>

## Lấy mẫu trò chuyện

Trong **Cài đặt → Mô-đun → Ý thức**, nhiệt độ tùy chỉnh và Top P bị tắt theo mặc định. Chỉ bật từng tham số khi mô hình đã chọn hỗ trợ nó. Một số mô hình chỉ chấp nhận một tham số lấy mẫu tại một thời điểm.

Việc tắt một tham số sẽ giữ nguyên giá trị thanh trượt nhưng bỏ qua giá trị đó khỏi các yêu cầu trò chuyện. Các giá trị đã lưu trước đó vẫn bị tắt cho đến khi người dùng bật chúng. Ghi đè rõ ràng theo yêu cầu vẫn được ưu tiên hơn các cài đặt này.

<a id="chat-images"></a>

## Hình ảnh trò chuyện

Các nhà soạn nhạc Web và Electron chia sẻ bản nháp và bản xem trước hình ảnh. Họ chấp nhận các tệp PNG, JPEG, WebP và GIF, mỗi tệp có tối đa 20 tệp MB, thông qua việc chọn hoặc dán tệp. Bản xem trước sở hữu URL đối tượng của chúng. Thay đổi phiên loại bỏ các lần đọc hình ảnh đang chờ xử lý. Gửi không thành công, khôi phục bản nháp thông qua trình soạn thảo được chia sẻ.

Chọn nhà cung cấp và mô hình trong **Cài đặt → Mô-đun → Tầm nhìn** và bật **Sử dụng mô hình tầm nhìn cho hình ảnh trò chuyện**. Tầm nhìn mô hình mô tả hình ảnh trước câu trả lời mô hình trò chuyện đã chọn. Luồng này chạy khi cuộc trò chuyện nhà cung cấp không báo cáo đầu vào hình ảnh cho mô hình đã chọn. Hầu hết nhà cung cấp không báo cáo điều đó. Lịch sử cục bộ lưu giữ những hình ảnh. nhà cung cấp prompt thay thế hình ảnh bằng các mô tả, bao gồm hình ảnh từ các lượt trước đó và các lần thử lại. Lịch sử đám mây hiện tại store chỉ có văn bản tin nhắn. Việc đọc hình ảnh ở lượt hiện tại không thành công và không gửi được. Người lãnh đạo lưu giữ một lần đọc không thành công của hình ảnh trước đó trong bộ nhớ cho phiên và lựa chọn tầm nhìn của nó, vì vậy các lượt sau sẽ không đọc lại hình ảnh đó.

**Sử dụng tầm nhìn mô hình cho hình ảnh công cụ** áp dụng quy trình tương tự cho hình ảnh mà công cụ trả về, chẳng hạn như ảnh chụp màn hình `computer_use_read_image` và nội dung hình ảnh MCP. Vision mô hình đọc từng hình ảnh khi công cụ chạy và chạy lại công cụ cũng đọc nó. Trong khi Vision mô hình đọc hình ảnh công cụ, nhà cung cấp prompt thay thế hình ảnh công cụ được lưu trữ bằng một ghi chú ngắn. Lịch sử được lưu giữ giữ hình ảnh.

Tắt các tùy chọn này để gửi hình ảnh trực tiếp đến cuộc trò chuyện mô hình hỗ trợ chúng. Nếu không có tầm nhìn được định cấu hình mô hình, hình ảnh cũng sẽ chuyển trực tiếp đến cuộc trò chuyện mô hình. Sử dụng luồng này cho tệp đính kèm trò chuyện và hình ảnh công cụ, không phải màn hình định kỳ thu nhận dữ liệu.

<a id="character-card-module-settings"></a>

## Cài đặt mô-đun thẻ nhân vật

Thẻ store sở hữu ba trạng thái riêng biệt:

- `moduleDefaults` store toàn cầu nhà cung cấp, mô hình, các lựa chọn giọng nói và hiển thị.
- Mỗi thẻ store ghi đè rõ ràng. Một chuỗi trống có nghĩa là kế thừa.
- Mô-đun store hiển thị các lựa chọn runtime đã giải quyết được ứng dụng sử dụng.

Sử dụng `configureForAuthentication` để đăng nhập và đăng xuất. Nó cập nhật các giá trị mặc định chung, sau đó áp dụng lại thẻ đang hoạt động mà không lưu các giá trị mặc định vào thẻ đó. Sử dụng lệnh thẻ để kích hoạt và chỉnh sửa rõ ràng. Các trang cài đặt không được lưu thẻ từ người theo dõi: xác thực và ảnh chụp nhanh từ xa cũng kích hoạt chúng. Người lãnh đạo đồng bộ hóa sở hữu các lệnh này; những người theo dõi nhận được ảnh chụp nhanh.

mô hình chỉ kế thừa trong cùng một nhà cung cấp. Giọng nói cũng yêu cầu mô hình tương tự. Chọn một tầm nhìn nhà cung cấp trên trang tầm nhìn store danh mục mặc định mô hình của nhà cung cấp đó trên thẻ đang hoạt động. Một nhà cung cấp khác không có mô hình vẫn chưa được định cấu hình thay vì nhận id mô hình không liên quan. Trình chỉnh sửa yêu cầu mô hình để trò chuyện hoặc xem nhà cung cấp rõ ràng trừ khi mô hình đó có thể được kế thừa một cách an toàn.

Giá trị mặc định được gieo một lần từ runtime hiện tại khi nâng cấp. Điều này không thể khôi phục các giá trị lịch sử toàn cầu mà thẻ cũ đã ghi đè. Các lựa chọn `speech-noop` hiện tại được giữ nguyên vì chúng có thể thể hiện sự im lặng có chủ ý. Người dùng có thể chọn **Kế thừa cài đặt chung** một cách rõ ràng trong trình chỉnh sửa; nhập hoặc lưu trường thẻ không liên quan sẽ không thay đổi trường đó.

<a id="character-sessions"></a>

## Phiên nhân vật

Mỗi phiên trò chuyện thuộc về một nhân vật. Lệnh gửi sẽ đọc nhà cung cấp, mô hình và hệ thống prompt của ký tự đó chứ không phải thẻ đã chọn. Việc chọn một lá bài khác trong khi một lượt đang chờ trong hàng đợi sẽ không làm thay đổi lượt đó. Trước mỗi yêu cầu mô hình, lần lượt đọc lại cài đặt của ký tự. Một công cụ chỉnh sửa ký tự sẽ thay đổi yêu cầu tiếp theo. Mỗi yêu cầu sẽ xây dựng lại các tiêu đề tương quan phân tích cho nhà cung cấp của nó. Lỗi tương thích với công cụ và mảng nội dung thuộc về mô hình của yêu cầu không thành công, không phải mô hình đầu tiên của lượt. Đặt lại phiên và Artistry các hook tự trị cũng sử dụng ký tự phiên. Mỗi lượt đồng thời sở hữu dấu vết IO của nó. `activeTurnSpan` chỉ đến lượt bắt đầu gần đây nhất vẫn đang chạy.

<a id="button-analytics"></a>

## Phân tích nút

Đăng ký plugin chia sẻ một lần trong mỗi ứng dụng Vue:

```ts
import { trackButtonPlugin } from '@angela/stage-ui/directives/track-button'

createApp(App)
  .use(trackButtonPlugin)
  .mount('#app')
```

Sau đó, các nút thể hiện mục đích nhấp chuột phân tích sản phẩm có thể khai báo một sự kiện đã nhập mà không cần gói trình xử lý công việc của chúng:

```vue
<Button
  v-track-button="{ name: 'update_check_clicked', channel: selectedChannel }"
  @click="checkForUpdates()"
/>
```

Giữ các kết quả không đồng bộ, các thay đổi trạng thái đã xác nhận, số lượt hiển thị và các sự kiện trong vòng đời trong quy trình kinh doanh của riêng chúng thay vì gắn chúng vào lần nhấp đầu tiên.

<a id="histoire-ui-storyboard"></a>

## Câu chuyện (bảng phân cảnh UI)

https://histoire.dev/

```shell
pnpm -F @angela/stage-ui run story:dev
```

Câu chuyện **Misc → Thao tác vuốt** hiển thị một hàng có hai hành động bắt đầu và ba hành động kết thúc. Điều khiển **Hiển thị nhãn** của nó chuyển đổi giữa nhãn văn bản và bề mặt lấp đầy chiều cao có sẵn. Sử dụng câu chuyện này để so sánh cách trình bày cử chỉ chứ không phải hành vi lưu trữ cuộc trò chuyện.

<a id="project-structure"></a>

### Cấu trúc dự án

1. Nếu một câu chuyện được liên kết với một thành phần cụ thể, nó có thể được đặt bên cạnh thành phần đó trong thư mục `src`. ví dụ: `MyComponent.story.vue`
2. Nếu một câu chuyện không bị ràng buộc với một thành phần cụ thể thì nó sẽ được đặt trong thư mục `stories`. ví dụ: `MyStory.story.vue`

<a id="local-hearing-with-sherpaw"></a>

## Phiên điều trần cục bộ với Sherpaw

Chọn **Sherpaw** trong cài đặt Thính giác. Chọn một ngôn ngữ để xem mô hình hỗ trợ ngôn ngữ đó, sau đó chọn mô hình. Đối với cấu hình Sherpaw mới, ngôn ngữ giao diện sẽ đặt bộ lọc và chọn mô hình tương thích. Tiếng Trung và tiếng Anh bắt đầu với X-ASR trên desktop và Paraformer trên Web di động hoặc stage Pocket. Lựa chọn mô hình hiện có vẫn được giữ nguyên. Việc chọn ngôn ngữ sẽ chuyển sang mô hình tương thích khi cần. mô hình phát hiện một trong những ngôn ngữ được hỗ trợ. Việc thay đổi mô hình sẽ lưu cấu hình nhà cung cấp và thay thế runtime của nó. Mỗi phiên phát biểu hiện sở hữu một worker, được phát hành khi phiên kết thúc hoặc bị hủy.

host phải kích hoạt `@angela/vite-plugin-sherpaw` để hiển thị nội dung mô hình. `provider-inference` sở hữu khả năng nhận dạng và dọn dẹp worker. `stage-ui` cung cấp URL mô hình, tìm nạp nội dung cục bộ, worker URL và chế độ xem Phiên điều trần. nhà cung cấp không khả dụng khi host không bao gồm mô hình. Sử dụng nhà cung cấp này để nhận dạng truyền dữ liệu liên tục cục bộ mà không cần thông tin xác thực API. Nó yêu cầu worker và WebAssembly. Web và Pocket store đã chọn mô hình từ xa trong OPFS. Phát triển desktop store đã chọn mô hình trong thư mục dữ liệu người dùng ứng dụng. desktop phát hành gói X-ASR và store khác mô hình trong thư mục dữ liệu người dùng. Cài đặt Sherpaw hiển thị trạng thái tải xuống và cho phép người dùng cài đặt hoặc xóa mô hình từ xa. Sử dụng nhà cung cấp từ xa khi kích thước tải xuống của mô hình hoặc bộ nhớ cục bộ khiến điều đó không phù hợp. Đường dẫn VAD hiện có có các bản tải xuống mô hình và runtime riêng biệt.

`libs/inference/transformers-cache` quản lý bộ đệm của trình duyệt được Transformers và Kokoro sử dụng. Cặp tệp Sherpaw sử dụng kho lưu trữ nội dung mô hình được chia sẻ.

<a id="compact-stage-status"></a>

### Trạng thái stage nhỏ gọn

`HearingStatus` hiển thị phiên micrô được chia sẻ, luôn bật. Đặt nó phía trên một thiết bị soạn nhạc di động hoặc ở dưới cùng của desktop stage. Nó đọc hoạt động yêu cầu cục bộ, biên độ micrô, bản ghi cuối cùng và lỗi thiết bị hoặc nhà cung cấp.

`StatusCapsule` sở hữu bề mặt viên nang và các chi tiết có thể mở rộng. Khe chỉ báo của nó nhận nội dung doanh nghiệp: Thính giác sở hữu các thanh âm thanh, trong khi đăng nhập sở hữu các biểu tượng chờ đợi và kết quả. shell không có yêu cầu hoặc trạng thái micrô. Các chi tiết của nó nằm trong giới hạn bố cục nên Electron có thể đưa chúng vào thử nghiệm nhấn chuột. `HearingStatus` sử dụng khe chi tiết để khớp các thẻ lỗi trò chuyện mà không thêm lỗi micrô vào lịch sử trò chuyện. Thành phần hỗ trợ giảm chuyển động. Người dùng desktop có thể bật chế độ Streamer trong Cài đặt chung để ẩn các lớp phủ này mà không dừng hoạt động nhập hoặc đăng nhập micrô. Chế độ phát trực tiếp bị tắt theo mặc định.

<a id="chat-stickers"></a>

## Nhãn dán trò chuyện

Mở **Cài đặt → Mô-đun → Nhãn dán**, sau đó bật nhãn dán. Tùy chọn này bị tắt theo mặc định và áp dụng cho thiết bị này. Chọn tần số: 25%, 50%, 75% hoặc 100%. Mặc định là 50% khi được bật. Tỷ lệ phần trăm kiểm soát tính đủ điều kiện trả lời. Nó không ép buộc hình ảnh hoặc đảm bảo tỷ lệ quan sát chính xác. mô hình chọn một danh mục ID từ tên hình ảnh và thẻ cảm xúc. Không có bộ phân loại cảm xúc riêng biệt nào chạy. Mỗi yêu cầu được chuẩn bị hoặc xếp hàng sẽ giữ lại danh mục của nó, nhà cung cấp, prompt và tính đủ điều kiện. Không cần thêm yêu cầu nhà cung cấp, API, thẻ ký tự hoặc mô-đun bộ nhớ.

<a id="manage-the-library"></a>

### Quản lý thư viện

Nhập hình ảnh PNG, JPG, WebP hoặc GIF. Các tệp phải giải mã thành công và duy trì trong phạm vi 2 MB và 4096 × 4096 pixel. Xem trước hình ảnh, nhập tên có 1–80 ký tự và chọn ít nhất một thẻ cảm xúc. Mỗi hình ảnh có thể sử dụng nhiều thẻ. Hình ảnh được gộp và nhập vào sử dụng cùng một định dạng danh mục. Chỉnh sửa tên hoặc thẻ của bất kỳ hình ảnh nào. Hình ảnh nhập khẩu cũng hỗ trợ thay thế. Việc xóa sẽ xóa mục nhập khỏi danh mục trong tương lai. Nó không xóa hình ảnh khỏi các câu trả lời hiện có hoặc đã được chuẩn bị sẵn. ID đã lưu không xác định hiển thị phần giữ chỗ đã dịch và không bao giờ trở thành URL hình ảnh.

Siêu dữ liệu IndexedDB store và các phiên bản hình ảnh bất biến trên thiết bị này. Việc thay thế sẽ tạo ra một hình ảnh mới ID. Các lát trò chuyện giữ lại ID đã được chọn khi yêu cầu của chúng được chuẩn bị. Các mục đã xóa sẽ giữ lại hình ảnh của chúng. Hình ảnh được lưu trữ sẽ sử dụng bộ nhớ cho đến khi dữ liệu trang web của ứng dụng bị xóa. Khóa Web tuần tự hóa các chỉnh sửa trên các cửa sổ renderer. Tín hiệu BroadcastChannel làm mới ảnh chụp nhanh cục bộ mà không truyền byte hình ảnh. Việc chuyển đổi và tần suất tuân theo các sự kiện lưu trữ cùng nguồn gốc hiện có. Đặt lại khôi phục các tùy chọn này mà không xóa thư viện. Đồng bộ hóa trò chuyện trên đám mây chỉ chuyển văn bản. Cả hình ảnh và lát nhãn dán đã nhập đều không được chuyển sang thiết bị khác. runtime sinh nội dung không yêu cầu dịch vụ hình ảnh hoặc hình ảnh-sinh nội dung mô hình.

<a id="bundled-artwork"></a>

### Tác phẩm nghệ thuật đi kèm

Gói mặc định chứa mười hai phản ứng chibi được tạo ra của nhân vật Live2D tóc xanh chính thức của AIRI. Xem [xuất xứ tác phẩm nghệ thuật](src/assets/stickers/README.md) để biết thông tin tham khảo, prompt chính xác và ghi chú kiểm tra. Đây là những tài sản tĩnh. Không bao gồm phần phụ thuộc runtime image-sinh nội dung. Bốn hình ảnh Fluent Emoji chỉ dành cho phát triển đã bị xóa. Không bao gồm quá trình di chuyển ID cũ.

<a id="companion-interactions"></a>

## Tương tác đồng hành

Cài đặt Bộ nhớ dài hạn bao gồm bảng Đồng hành. Bộ nhớ đồng hành bắt đầu bị vô hiệu hóa. Kích hoạt cả bộ nhớ học tập và bộ nhớ đồng hành để sử dụng ngữ cảnh đồng hành đã lưu. Bảng điều khiển store hỗ trợ các tùy chọn, chủ đề chưa hoàn thành và mục tiêu hoạt động chung cho mỗi nhân vật. Mỗi ký tự có giới hạn 50 bản ghi. Xóa các bản ghi cũ để giải phóng dung lượng.

Chọn một hoạt động và thời lượng để bắt đầu một buổi học hoặc làm việc chung. Thời gian trôi qua không chứng tỏ sự hoàn thành. Người dùng xác nhận hoàn thành hoặc loại bỏ chủ đề. Bảng điều khiển có thể xóa các bản ghi ngay cả khi bộ nhớ đồng hành bị tắt. Công cụ trò chuyện lưu nguyên văn văn bản của người dùng và cập nhật các bản ghi hiện có bằng ID. Các lượt được bảo vệ không có công cụ ghi đồng hành nào. Kiểm soát này không thay thế cài đặt lưu giữ lịch sử trò chuyện.

Chính sách hội thoại hỗ trợ việc lắng nghe, trợ giúp thiết thực, sửa lỗi cho người dùng và các hình thức xưng hô nhất quán. Trả lời bằng giọng nói ưu tiên các câu ngắn và chỉnh sửa mới nhất sau khi bị gián đoạn. Những hành vi này phụ thuộc vào mô hình đã chọn. Bộ điều khiển giọng nói hiện tại sở hữu thu nhận dữ liệu, tính năng gián đoạn và phát lại.
