<a id="angela-discord-bot"></a>

# Angela Bất hòa bot

Angela có thể trò chuyện thông qua các đề cập và tin nhắn trực tiếp, đồng thời tham gia kênh thoại của máy chủ để trò chuyện bằng giọng nói. Chạy `angela discord` để sử dụng trò chuyện đã lưu nhà cung cấp của CLI mà không cần desktop hoặc ứng dụng khách web. Bộ điều hợp độc lập cũng hỗ trợ kênh máy chủ Angela hiện có với desktop hoặc máy khách web được kết nối. Sử dụng gói này để trò chuyện bằng giọng nói. Các lệnh tác vụ, quyền, trạng thái và khôi phục Telegram của CLI là các tính năng riêng biệt.

<a id="cli-setup"></a>

## Thiết lập CLI

Từ thư mục gốc của kho lưu trữ, hãy xây dựng CLI và các phần phụ thuộc workspace của nó:

```sh
pnpm build:cli
mkdir -p ~/.config/angela
cp integrations/discord/.env.example ~/.config/angela/discord.env
chmod 600 ~/.config/angela/discord.env
```

Đặt `DISCORD_TOKEN` trong `discord.env`. Giữ mặc định giọng nói cho dịch vụ thoại cục bộ hoặc định cấu hình lời nói tương thích khác nhà cung cấp. CLI đọc cuộc trò chuyện nhà cung cấp và mô hình từ `~/.config/angela/config.json`. `AIRI_URL` và `AIRI_TOKEN` không được sử dụng ở chế độ CLI. `ANGELA_DISCORD_ENV` chọn một tệp cấu hình Discord khác. Biến môi trường ghi đè giá trị tệp.

Bắt đầu dịch vụ thoại, sau đó khởi động Discord:

```sh
angela voice start
angela discord
```

Nếu không có tệp thực thi đã cài đặt, hãy chạy `pnpm cli discord` từ thư mục gốc của kho lưu trữ. Sử dụng `angela discord --help` để được trợ giúp về cấu hình. Sử dụng Ctrl+C để dừng bot và hủy các câu trả lời đang chờ xử lý. Đề cập đến Angela trong kênh văn bản hoặc gửi tin nhắn trực tiếp cho bot. Đối với giọng nói, hãy tham gia kênh thoại của máy chủ và sử dụng `/summon`.

Chế độ CLI Lịch sử store trong thư mục `discord` của thư mục dữ liệu CLI. Mỗi kênh có các cuộc hội thoại bằng văn bản và giọng nói riêng biệt. Các yêu cầu trong một cuộc trò chuyện diễn ra theo thứ tự. Chế độ CLI chỉ hỗ trợ hội thoại. Nó không hiển thị các công cụ đầu cuối, lệnh tác vụ Telegram hoặc micrô cục bộ. Ngắt lời nói, tạm dừng, rời khỏi và tắt máy sẽ hủy AI sinh nội dung cục bộ. Trò chuyện văn bản không nhập lời nói, Opus hoặc giọng nói transport. Lệnh thoại tải các mô-đun này một lần cho mỗi quy trình. host cho phép bốn cuộc gọi đồng thời và bốn lần thu âm loa hoạt động cho mỗi cuộc gọi. Việc rời đi hoặc tắt máy sẽ giải phóng tài nguyên của họ. Trả lời bằng giọng nói sử dụng ngữ cảnh cuộc gọi và các câu nói ngắn gọn. Bản ghi không rõ ràng prompt làm rõ thay vì chẩn đoán micrô được đoán. CLI từ chối chẩn đoán cổng Google được quan sát và báo cáo lỗi cuộc gọi cục bộ thay vì đọc to chẩn đoán. Chẩn đoán đã lưu trước đó vẫn còn trong tệp lịch sử nhưng nằm ngoài các yêu cầu mô hình.

<a id="standalone-adapter-setup"></a>

## Thiết lập bộ chuyển đổi độc lập

Sử dụng phiên bản workspace Node.js và pnpm. Cài đặt phụ thuộc từ kho lưu trữ gốc. Cài đặt FFmpeg và đặt nó trên PATH. Các gói Opus và giọng nói Discord hiện có xử lý transport và giải mã âm thanh.

Tạo bot trong Cổng thông tin dành cho nhà phát triển [Discord](https://discord.com/developers/applications). Bật Ý định nội dung tin nhắn cho trò chuyện văn bản dựa trên đề cập. Mời bot có phạm vi `bot` và `applications.commands`. Cấp quyền Xem kênh, Kết nối, Nói và Gửi tin nhắn trong kênh cuộc gọi và trò chuyện văn bản của kênh đó.

Từ thư mục gốc của kho lưu trữ, sao chép mẫu cấu hình:

```sh
cp integrations/discord/.env.example integrations/discord/.env.local
```

Đặt `DISCORD_TOKEN` trong tệp cục bộ. Đặt `AIRI_URL` và `AIRI_TOKEN` để khớp với cài đặt kênh máy chủ của Angela. Giữ thông tin xác thực trong tệp hoặc môi trường cục bộ bị bỏ qua. Không bao giờ cam kết chúng. Bot Discord ID đã được xác thực sẽ tự động đăng ký các lệnh. `DISCORD_BOT_CLIENT_ID` là không cần thiết.

Mẫu sử dụng dịch vụ thoại [](../../capabilities/voice/local/README.md) hiện có trên cổng 8000. Bắt đầu dịch vụ đó một cách riêng biệt. mô hình mặc định của nó là `small` để phiên âm và `edge-tts` cho lời nói. Giọng nói mặc định là `vi-VN-HoaiMyNeural`. Edge speech sử dụng dịch vụ bên ngoài. Đối với một nhà cung cấp tương thích khác, hãy đặt cả URL điểm cuối, tên mô hình, khóa API và giọng nói. Sử dụng URL điểm cuối HTTP hoặc HTTPS có dấu gạch chéo ở cuối. Điểm cuối giọng nói phải hỗ trợ WAV Responses. Các phím STT và TTS vẫn tách biệt. Điểm cuối cục bộ có thể sử dụng các khóa trống.

Khởi động desktop hoặc ứng dụng khách web cục bộ của Angela, sau đó khởi động bộ điều hợp:

```sh
pnpm -F @angela/discord-bot start
```

Sử dụng `ANGELA_LOCALE=en` để mô tả và thông báo lệnh bằng tiếng Anh. Tiếng Việt là mặc định.

<a id="call-controls"></a>

## Điều khiển cuộc gọi

Tham gia kênh thoại của máy chủ bình thường, sau đó sử dụng `/summon`. Angela bắt đầu lắng nghe sau khi kết nối đạt trạng thái Sẵn sàng và thông báo tham gia thành công. Thông báo cho biết rằng lời nói sẽ được chuyển đến dịch vụ phiên âm đã định cấu hình.

| Lệnh | Hành vi |
| --- | --- |
| `/summon` | Tham gia kênh thoại của bạn và bắt đầu nghe. |
| `/listen enabled:false` | Dừng thu nhận dữ liệu, lời nói xếp hàng, yêu cầu giọng nói đang chờ xử lý và phát lại. Ở lại trong kênh. |
| `/listen enabled:true` | Tiếp tục nghe một cách rõ ràng. |
| `/leave` | Dừng cuộc gọi và ngắt kết nối. |
| `/ping` | Kiểm tra xem bot có phản hồi không. |

Điều khiển cuộc gọi yêu cầu tư cách thành viên trong cùng kênh thoại với Angela. Một bot có thể sở hữu một kết nối thoại trên mỗi máy chủ. Lệnh triệu tập từ kênh khác sẽ không chuyển cuộc gọi đang hoạt động. Các cuộc gọi trực tiếp, DM nhóm và các kênh stage nằm ngoài phạm vi triển khai này.

<a id="conversation-behavior"></a>

## Hành vi hội thoại

Mỗi phòng sở hữu các luồng thu nhận dữ liệu, bộ đệm loa, hàng đợi yêu cầu, trạng thái phát lại và hủy. ID người dùng Discord xác định người nói. Đây không phải là nhận dạng giọng nói. Phiên hội thoại được chia sẻ thuộc về máy chủ và kênh thoại đó. Tiền tố người nói xác định đầu vào của mỗi người. Trò chuyện bằng văn bản vẫn giữ nguyên định tuyến và phiên hiện có.

Người nhận kết thúc bài phát biểu thu nhận dữ liệu sau 800 ms im lặng thông qua chính sách AfterSilence của Discord. Việc chụp yên tĩnh vẫn cục bộ và không kích hoạt phiên mã. Lời nói đã được xác nhận có thể làm gián đoạn câu trả lời đang chờ xử lý hoặc có thể nghe được của Angela. Một phòng chỉ giữ tối đa bốn câu phát biểu xếp hàng. Các loa chồng lên nhau giữ lại bộ đệm riêng biệt. thu nhận dữ liệu có thể tồn tại tối đa 30 giây. Các ảnh chụp dài hơn sẽ bị loại bỏ kèm theo thông báo thay vì bản ghi một phần. Mỗi câu trả lời có thời hạn 90 giây bao gồm phiên âm, phản hồi AI, lời nói sinh nội dung và phát lại.

Chỉ `output:gen-ai:chat:complete` kích hoạt lời nói. Tin nhắn trợ lý trung gian không bao giờ phát trong cuộc gọi. Phòng, loa và yêu cầu ngẫu nhiên ID phải khớp với lượt hoạt động trước khi phát lại. Responses bị gián đoạn, trùng lặp, ngắt kết nối hoặc cuộc gọi trước đó đều bị bỏ qua. Sự gián đoạn sẽ dừng phát lại và hủy bỏ việc tổng hợp giọng nói đang chờ xử lý. Quá trình phiên âm đang hoạt động có thể kết thúc để bảo toàn lời nói của người nói. Câu trả lời của một lượt bị gián đoạn vẫn im lặng. Việc tạm dừng hoặc thoát cũng sẽ hủy các yêu cầu phiên âm đang chờ xử lý. Các điều khiển này không hủy AI sinh nội dung từ xa trong máy khách desktop. Giọng nói tạm dừng và ngắt kết nối sẽ loại bỏ âm thanh đang chờ xử lý. Chúng không tự động kích hoạt lại sau khi khởi động lại.

Âm thanh vẫn nằm trong bộ nhớ có giới hạn bên trong bộ chuyển đổi. Bộ điều hợp không ghi bản ghi vào đĩa. STT nhà cung cấp được định cấu hình sẽ nhận âm thanh đã ghi. AI nhận bản ghi và TTS nhà cung cấp nhận văn bản trả lời. Lịch sử trò chuyện hiện có của Angela và cài đặt lưu giữ của nhà cung cấp vẫn có hiệu lực.

<a id="checks"></a>

## Kiểm tra

```sh
pnpm -F @angela/discord-bot typecheck
pnpm -F @angela/discord-bot test
ANGELA_DISCORD_AUDIO_TEST=1 pnpm -F @angela/discord-bot test
pnpm -F @angela/i18n typecheck
pnpm -F @angela/i18n test
pnpm -F @angela/i18n build
pnpm lint
```

Các thử nghiệm sử dụng lời nói cục bộ HTTP mẫu kiểm thử, Opus encoding/decoding định dạng Discord thực và ranh giới Discord transport mô phỏng. `ANGELA_DISCORD_AUDIO_TEST=1` cũng chạy đường dẫn phát lại WAV-to-Opus thực thông qua FFmpeg. Kiểm tra tùy chọn này yêu cầu FFmpeg trên PATH. Chúng bao gồm định tuyến phản hồi, tách loa, gián đoạn, pause/resume, thời gian chờ, lỗi kết nối và dọn dẹp. Quá trình kiểm tra chấp nhận trực tiếp vẫn cần có bot token, máy chủ Discord, hai người tham gia và bài phát biểu làm việc nhà cung cấp. Kiểm tra phát lại âm thanh, gián đoạn, loa đồng thời, `/listen`, `/leave` và hoạt động kết nối lại trong máy chủ đó.

<a id="other-similar-projects"></a>

## Các dự án tương tự khác

- [pladisdev/Discord-AI-With-STT](https://github.com/pladisdev/Discord-AI-With-STT)

<a id="acknowledgements"></a>

## Lời cảm ơn

- Triển khai xử lý và xử lý âm thanh https://github.com/TheTrueSCP/CharacterAIVoice/blob/54d6a41b4e0eba9ad996c5f9ddcc6230277af2f8/src/VoiceHandler.js
- Ví dụ về cách sử dụng https://github.com/discordjs/voice-examples/blob/da0c3b419107d41053501a4dddf3826ad53c03f7/radio-bot/src/bot.ts
- Thư viện tuyệt vời https://github.com/discordjs/discord.js
