<a id="core-agent"></a>

# Cốt lõi agent

`@angela/core-agent` sở hữu tính năng lập lịch, bố cục bối cảnh, vòng công cụ và các sự kiện sinh nội dung. Các ứng dụng stage cung cấp tính bền bỉ và UI thông qua các cổng của nó. Đăng ký và cấu hình nhà cung cấp thuộc về `provider-inference`. Xác thực và thanh toán Flux thuộc về cổng.

<a id="conversation-and-protocol-projection"></a>

## Chiếu hội thoại và giao thức

`Conversation` chứa các giá trị `Turn` được sắp xếp. `UserTurn` sở hữu nội dung người dùng. `SystemTurn` sở hữu hướng dẫn hoặc ngữ cảnh ứng dụng. Quyền hạn của nó phân biệt các hướng dẫn hệ thống, hướng dẫn dành cho nhà phát triển và dữ liệu ngữ cảnh. Ngữ cảnh ứng dụng không nhận được quyền hướng dẫn chỉ vì ứng dụng đã cung cấp nó.

`AssistantTurn` sở hữu một mảng `rounds` có thứ tự. Một vòng đại diện cho một lệnh gọi mô hình và tất cả các lần thực thi công cụ mà nó yêu cầu, bao gồm cả các lệnh gọi song song. Nội dung của nó tham chiếu lời gọi công cụ; mỗi lệnh gọi sở hữu lệnh gọi và kết quả một lần. Id cuộc gọi nhà cung cấp tương quan với các kết quả trong vòng đó. Các lần chạy lại công cụ sử dụng id lệnh gọi Angela để phân biệt các id lệnh gọi nhà cung cấp lặp lại. Id chạy đề cập đến việc thực thi bộ lập lịch thực sự chứ không phải số vòng. Lịch sử đã nhập không có siêu dữ liệu cuộc gọi mô hình khi không có thông tin đó.

`ProviderContinuation` store Loại tin nhắn SDK riêng của mỗi giao thức: Trò chuyện `Message[]` hoặc Responses `ItemParam[]`.

`streamFrom` chọn khả năng nhà cung cấp được định cấu hình trước khi chiếu yêu cầu. Bộ điều hợp trò chuyện hiển thị tin nhắn Chat Completions. Bộ điều hợp Responses hiển thị các Mục native trực tiếp từ cùng một ngữ cảnh. Khả năng tương thích của mảng trò chuyện không thể thay đổi đầu vào Responses. Cả hai phép chiếu đều giữ nguyên ảnh chụp nhanh bối cảnh.

`streamFrom` thử lại yêu cầu tối đa ba lần khi nhà cung cấp trả về HTTP 408, 429 hoặc 5xx trước khi bất kỳ sự kiện phát trực tuyến nào đến được với người gọi. Nó chờ độ trễ `Retry-After` khi tiêu đề có thể đọc được hoặc 3 giây, 6 giây và 12 giây nếu không. `Retry-After` dài hơn 30 giây bị lỗi cùng một lúc. Các trạng thái khác, lỗi mạng và lỗi sau khi gọi đầu ra hoặc công cụ đều không thành công cùng một lúc, do đó, các tác dụng phụ của văn bản và công cụ không bao giờ lặp lại. `abortSignal` cũng hủy thời gian chờ đang chờ xử lý.

`options.diagnostics` cung cấp các phương thức đầu ra `error` và `warn` của host. Mặc định là `console`. host có thể thay thế chẩn đoán SDK bằng cách trình bày riêng. Lỗi sinh nội dung vẫn từ chối lời hứa được trả lại.

Khi người gọi cung cấp `resolveStep`, `streamFrom` sẽ đọc cài đặt hiện tại trước mỗi yêu cầu mô hình. Nó giải quyết yêu cầu đầu tiên trước khi chiếu cuộc trò chuyện. Thay đổi phạm vi liên tục sẽ bắt đầu luồng SDK mới. Các vòng đã hoàn thành và việc sử dụng vẫn còn trong một lượt hỗ trợ. Lệnh gọi lại trả về các công cụ hiện tại và phần ghi đè tiêu đề cho mỗi yêu cầu.

`prepareConversation` điều chỉnh phương tiện theo yêu cầu đã giải quyết trước khi bộ điều hợp giao thức thực hiện cuộc hội thoại. Nó chạy cho mỗi luồng SDK, do đó, nó cũng chạy sau khi thay đổi phạm vi chọn một mô hình khác. Nó trả về một bản sao yêu cầu và giữ nguyên các bản ghi được lưu trữ. stage sử dụng nó để chỉ gửi âm thanh đến mô hình chấp nhận âm thanh và bản ghi tới mô hình khác.

Người điều phối trò chuyện chuyển tiếp `resolveStep` của lệnh gửi. Nó gắn thêm phần bổ sung prompt của hệ thống gửi đó, bao gồm các hướng dẫn về nhãn dán, cho mỗi prompt đã được giải quyết.

```ts
await streamFrom({
  model: 'selected-model',
  chatProvider: selectedProvider,
  conversation: {
    turns: [{
      id: 'input-1',
      type: 'user',
      content: [{ type: 'text', text: 'Hello' }],
    }],
  },
})
```

Phiên store hiện tại sử dụng các bản ghi UI dạng trò chuyện. Bộ điều phối giải mã các bản ghi đó ở ranh giới lưu trữ, sau đó tổng hợp bối cảnh runtime thành các phân đoạn có cấu trúc. Gửi trò chuyện, đầu vào bằng hình ảnh và thông báo Spark sử dụng cùng một hợp đồng sinh nội dung. các hook và cầu nối plugin nhận được phép chiếu hiển thị riêng. Phép chiếu đó chỉ ở dạng văn bản và không bao gồm dữ liệu tiếp tục native và tải trọng phương tiện. Hình ảnh, âm thanh và tệp trở thành nhãn, bao gồm cả kết quả của công cụ.

<a id="turn-history"></a>

## Lần lượt lịch sử

Sau khi tất cả các bước SDK được giải quyết, `onGeneratedTurn` nhận được `AssistantTurn` mới. Mỗi vòng ghi lại việc sử dụng mô hình, lý do kết thúc, lệnh gọi công cụ và dữ liệu tiếp tục native. Ảnh chụp nhanh đầu vào SDK xác định ranh giới tròn; vai trò thông báo không xác định các vòng runtime.

Lượt được tạo chứa các vòng đã được giải quyết và được lưu trữ dưới khóa lịch sử `generationTranscript` hiện có. Đồng bằng trực tiếp vẫn sử dụng hợp đồng sự kiện phát trực tuyến hiện có. Việc thực thi bị gián đoạn không tạo ra một lượt store. Nếu nó tạo ra kết quả hiển thị, lịch sử Trò chuyện cục bộ sẽ lưu giữ kết quả đó bằng `interrupted: true` để người dùng có thể đọc và thử lại.

Tin nhắn hỗ trợ được lưu trữ có `createdAt` từ khi nó bắt đầu và `completedAt` từ khi nó ngừng nhận đầu ra, khi kết thúc hoặc khi nó bị gián đoạn. Windows không chạy sinh nội dung, hãy sử dụng `completedAt`, chẳng hạn như để tính thời gian hiển thị một câu trả lời.

Bộ điều hợp duy trì dữ liệu liên tục của SDK mà không phân tích cú pháp các trường nhà cung cấp lồng nhau thông qua các lược đồ cục bộ. Nó kiểm tra mảng bên ngoài trước khi phát lại. Phạm vi của nó chứa danh tính nhà cung cấp, điểm cuối, mô hình và hội thoại. Thông tin xác thực và tiêu đề yêu cầu không thay đổi phạm vi này. Một giao thức hoặc phạm vi thay đổi dự án xoay quanh nội dung. Nội dung native không xác định ghi lại sự cố trình chiếu mà không xóa tải trọng gốc hoặc các mục có thể đọc được khác. Trình chiếu đa giao thức báo cáo sự cố thay vì âm thầm bỏ qua nội dung. Việc chỉnh sửa kết quả công cụ cục bộ sẽ làm mất hiệu lực dữ liệu native cho vòng đó và các vòng sau sử dụng kết quả cũ. lần sinh nội dung bị hủy hoặc không thành công không thực hiện lượt được tạo. `AssistantTurn.status` do đó là `completed`. Việc thực thi công cụ trong lượt đó vẫn có thể báo cáo lỗi.

Lịch sử cục bộ bảo tồn các lượt hoàn chỉnh và đầu ra hiển thị từ các lượt bị gián đoạn. Các bản ghi bị gián đoạn vẫn còn trên thiết bị vì định dạng dây đám mây không thể duy trì trạng thái chưa hoàn chỉnh của chúng. Đồng bộ hóa trò chuyện trên đám mây hiện đang chuyển văn bản đã hoàn thành và không khôi phục việc tiếp tục native trên thiết bị khác.

## Responses API

nhà cung cấp giải quyết `GenerationRequest` bị phân biệt đối xử trước khi chiếu ngữ cảnh. Bộ điều hợp sở hữu định dạng dây và chuyển đổi sự kiện SDK. Bộ chuyển đổi sử dụng `@xsai-ext/responses` với `store: false`. Nó phát lại các Mục hoàn chỉnh và thực thi các công cụ chức năng cục bộ trong tối đa mười bước.

Bộ điều hợp Responses hiện tại hỗ trợ văn bản, hình ảnh, dữ liệu tệp hoặc URL, từ chối và gọi hàm. Nó từ chối đầu vào âm thanh và ID tệp nhà cung cấp. Nó hỗ trợ tìm kiếm trên web do nhà cung cấp thực hiện cùng với các công cụ chức năng cục bộ. Các bản ghi tìm kiếm vẫn được tiếp tục native. Các sự kiện trích dẫn và văn bản di động giữ lại URL nguồn và phần bù. Responses và EOF chưa hoàn thiện trước khi sự kiện đầu cuối làm hỏng sinh nội dung. Việc hủy phiên sẽ hủy bỏ yêu cầu nhà cung cấp đang hoạt động.

transport thời gian thực không được triển khai. Bộ điều hợp phiên trong tương lai có thể chiếu cùng một bối cảnh nhưng phải xác định riêng quyền sở hữu phiên, gián đoạn và đầu vào liên tục.

<a id="verify"></a>

## Xác minh

```sh
pnpm -F @angela/core-agent typecheck
pnpm -F @angela/core-agent exec vitest run src/runtime src/messages src/agents/spark-notify
```

<a id="type-boundaries"></a>

## Loại ranh giới

Lần lượt các loại hạn chế nội dung của họ. Lượt người dùng và hệ thống không thể chứa các vòng thực hiện. Chỉ có trợ lý làm tròn lời gọi công cụ riêng. Các tập tin có chính xác một nguồn. Đầu ra SDK và khả năng tiếp tục được khôi phục đi qua ranh giới giao thức. Liên minh sự kiện phát trực tuyến công khai không có nhánh `any`. Bộ điều hợp giao thức chuyển các sự kiện SDK sang hợp đồng này. Bộ lập lịch chỉ cam kết một lượt được tạo sau khi transport, các công cụ cục bộ và sự kiện bên sử dụng hoàn thành. Các liên kết nguồn vẫn tách biệt khỏi văn bản lời nói và tồn tại lâu dài trong lịch sử cục bộ.

<a id="chat-stickers"></a>

## Nhãn dán trò chuyện

host có thể cung cấp `stickers` trong các tùy chọn gửi. Mỗi mục có `id` và mô hình hướng mặt về `description`. host bao gồm tên hình ảnh và thẻ cảm xúc trong mô tả đó. Hàng đợi sao chép danh mục khi yêu cầu được gửi, cùng với danh tính nhà cung cấp và phần bổ sung prompt của hệ thống. Các phiên đồng thời và gửi theo hàng đợi sẽ giữ lại danh mục riêng của chúng. runtime thêm các hướng dẫn đánh dấu của nó vào hệ thống prompt của yêu cầu đó. Danh mục vắng mặt hoặc trống sẽ vô hiệu hóa đầu ra nhãn dán và không thêm hướng dẫn prompt.

Trình phân tích cú pháp điểm đánh dấu hiện có chấp nhận `<|STICKER id|>` trên các đoạn luồng. runtime store có nhiều nhất một ID được biết đến dưới dạng `ChatSlicesSticker` trên mỗi câu trả lời. ID không xác định sẽ bị bỏ qua. Điểm đánh dấu nhãn dán không bao giờ đạt đến lời nói theo nghĩa đen hoặc đặc biệt-token các hook. Các điểm đánh dấu đặc biệt khác vẫn giữ nguyên hành vi hiện tại của chúng. Câu trả lời có thể chứa văn bản, nhãn dán hoặc cả hai. host renderer phân giải ID thành tác phẩm nghệ thuật cục bộ. Lõi không có nội dung hình ảnh, URL, bộ lưu trữ hoặc phần phụ thuộc mô hình.

## VoiceController

Điều phối viên được triển khai là `VoiceController`. Nó bao gồm các bản âm thanh gốc với phiên âm, plugin đáng tin cậy, gửi và gián đoạn phản hồi được đặt tên. Sử dụng nó cho vòng đời cuộc trò chuyện. Sử dụng trực tiếp đường ống-âm thanh để đính kèm bản ghi độc lập. Tài nguyên trình duyệt vẫn ở trong bộ điều hợp âm thanh. Lựa chọn ký tự và tính kiên trì vẫn nằm trong bộ điều hợp ứng dụng.

```text
src/voice/
├── index.ts         # The public voice API. Import from the package root, not from these files.
├── controller.ts    # VoiceController and its options
├── interruption.ts  # Interruption receipts and the durable interruption event
├── turn.ts          # TurnRef and turnKey
├── input/           # One speech input: admission, capture, transcript, end detection, submission
├── output/          # VoiceResponse and ordered SpeechStream producers
└── plugins/         # Trusted plugin types, installation, input scopes, and task lifetimes
```

`input/` và `output/` không nhập `controller.ts`. `plugins/` đọc các loại đầu vào nhưng không bao giờ đọc bộ điều khiển.

```ts
const voice = new VoiceController({
  audio,
  transcriber: sessionId => hearingFor(sessionId),
  submit: (input, signal) => saveDraftOrSubmit(input, signal),
  speech: turn => speechOutputFor(turn),
  recordInterruption: event => agent.receiveInterruption(event),
})

const input = voice.beginInput({
  sessionId,
  interruptTurns: [currentTurn],
  start: { kind: 'after-silence' },
})

// The release control calls end. Provider final output and selected plugin work can then finish.
const result = await input.end()
```

- `SpeechInputAttempt` tồn tại trong khi phát lại fade và cho đến khi nguồn phát ra âm thanh, bao gồm quyền truy cập micrô.
- `SpeechInput` tồn tại sau khi nhập thu nhận dữ liệu. Nó giữ lại bản ghi thô, văn bản đã sửa, bằng chứng của người nói và ngữ cảnh bổ trợ.
- `end()` hoàn tất quá trình ghi. `cancel(reason)` từ chối lần xuất bản sau này.
- `interrupt({ turns, cause })` nhắm mục tiêu có tên Responses và báo cáo sự im lặng riêng biệt với quá trình phân phối agent.
- Người nhận thông báo loại bỏ trùng lặp theo sự kiện ID. Sự thừa nhận của nó có nghĩa là việc nhận được lâu dài, không có tin nhắn hoặc phản hồi của người dùng khác.
- `audio` là `AudioInput` được chia sẻ. Các nỗ lực và plugin đăng ký nó. Bộ điều khiển không bao giờ đóng nó.
- `replaceAudio(input)` hủy các lần thử hoạt động và chuyển các quan sát plugin sang đầu vào mới.
- Bộ chuyển mã nhận được PCM liên tục. Bộ điều hợp cần tệp hoặc MediaStream sẽ tự chuyển đổi PCM.

<a id="trusted-plugins"></a>

### Các plugin đáng tin cậy

```ts
voice.use({
  name: 'memory',
  setup(plugin) {
    plugin.onSpeechInput((input) => {
      input.subscribe({ transcript: 'corrected', speakers: true, scheduling: 'latest' }, async (ctx) => {
        const matches = await memory.search({
          text: ctx.snapshot.transcript.text,
          speakers: ctx.snapshot.speakers,
          signal: ctx.signal,
        })
        ctx.context.set('matches', matches)
      })
    })
  },
})
```

Bối cảnh nhiệm vụ kiểm tra độ mới khi xuất bản. Một kết quả cũ không thể thay thế bối cảnh hiện tại. `ordered` xử lý mọi ảnh chụp nhanh được chấp nhận theo thứ tự. `latest` hủy công việc cũ và thay thế các ảnh chụp nhanh đang chờ xử lý. Nhiệm vụ vòng đời có thể chờ `untilTranscriptionEnded()` hoặc `untilDependenciesSettled()`. Thời gian chờ và thời gian gia hạn gửi là tùy chọn của người gọi. runtime không áp đặt hạn ngạch tài nguyên.

VAD, PTT, từ đánh thức, loa mô hình, phát hiện lần lượt, tìm kiếm bộ nhớ và ghi lại mô hình vẫn là chính sách hoặc bộ điều hợp bên ngoài. Các plugin nhận được các cửa sổ được gắn thẻ nguồn và các điều khiển có phạm vi. Họ không nhận được quyền truy cập bộ điều khiển không hạn chế. Các bản vá tự động sử dụng tọa độ từ hoặc câu thô và lưu giữ lịch sử thô.

<a id="output-without-voice-input"></a>

### Đầu ra không có đầu vào bằng giọng nói

```ts
const voice = new VoiceController({ speech: turn => speechOutputFor(turn) })
const response = voice.openResponse({ sessionId, turnId })
const acknowledgment = response.openSpeech({ purpose: 'acknowledgment' })
const answer = response.openSpeech({ purpose: 'answer' })

await acknowledgment.write('Let me check.')
acknowledgment.end()
await answer.write(answerText)
answer.end()
await response.finish()
```

Nhà sản xuất có thể tổng hợp đồng thời. Phát lại theo thứ tự đặt trước của họ. Tổng hợp không phải truyền dữ liệu liên tục giữ từng câu trong một yêu cầu âm thanh, bao gồm cả các câu dài có dấu phẩy. Yêu cầu đầu tiên chờ ranh giới câu. Một dòng rõ ràng, token đặc biệt hoặc đầu của nhà sản xuất cũng phát hành văn bản đang chờ xử lý. nhà cung cấp hai chiều kiểm soát ranh giới âm thanh của riêng mình. Việc hủy một xác nhận sẽ giải phóng vị trí của nó mà không báo cáo sự gián đoạn của người dùng. Việc gián đoạn toàn bộ lượt sẽ hủy bỏ sinh nội dung, tổng hợp, âm thanh được xếp hàng đợi và phát lại cho phản hồi đó.
