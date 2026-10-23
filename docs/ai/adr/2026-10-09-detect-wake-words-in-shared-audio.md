<a id="detect-wake-words-in-shared-audio"></a>

# Phát hiện các từ đánh thức trong âm thanh được chia sẻ

Trạng thái: đã chấp nhận. Cài đặt tìm kiếm và nguồn âm thanh được thay thế bằng các từ đánh thức [Detect trong âm thanh](./2026-10-12-detect-wake-words-in-unprocessed-audio.md) chưa được xử lý.

<a id="context"></a>

## Bối cảnh

Thẻ nhân vật store đánh thức các từ và cách phát âm mô hình token. `useWakeWordsStore` giải quyết danh mục phát âm hiện hoạt trên thiết bị cục bộ. Plugin hoạt động bằng giọng nói có điểm vào `detectWakeWord`. `useVoiceStore.resolveWakeTarget` chọn phiên của một ký tự. Không có máy dò nào sử dụng các điểm vào này.

Nhánh trước đó (#2726 và #2730) đã thêm trình nghe từ khóa với AudioContext và AudioWorklet của riêng nó. Đường dẫn thoại hiện chia sẻ một đầu vào âm thanh giữa VAD, thu nhận dữ liệu và máy đo mức. Biểu đồ âm thanh thứ hai sao chép thu nhận dữ liệu và vòng đời của nó.

<a id="decision"></a>

## Phán quyết

`WakeWordDetector` trong `stage-ui/src/libs/voice` đọc các cửa sổ 32 ms theo thứ tự mà plugin hoạt động giọng nói quan sát. Nó sở hữu một công cụ theo dõi từ khóa Sherpaw worker. Nó không sở hữu micrô, AudioContext hoặc AudioWorklet.

Máy dò trộn từng cửa sổ thành đơn sắc. Nó thay thế các mẫu không hữu hạn bằng 0 và kẹp các mẫu khác thành [-1, 1]. Nó xếp hàng các đợt 100 ms cho người theo dõi. Sherpa-ONNX lấy mẫu lại chúng theo tốc độ mô hình. Khoảng trống hoặc thay đổi tốc độ mẫu sẽ đặt lại luồng.

Công nhận chạy ra khỏi đường dẫn cửa sổ theo thứ tự. Trình quan sát hoạt động giọng nói sử dụng lập lịch `ordered` và không thành công sau 60 giây tồn đọng. Nếu mỗi cửa sổ đợi worker thì worker chậm hơn thời gian thực sẽ làm trì hoãn VAD và sau đó kết thúc quá trình quan sát. Thay vào đó, máy dò quay trở lại ngay lập tức. Một đánh thức đã được giải quyết sẽ xuất hiện ở cửa sổ sau. Dữ liệu tồn đọng về nhận dạng trên 1 giây sẽ bị loại bỏ vì việc đánh thức muộn không hữu ích.

Mỗi nhãn từ khóa là một khóa phát âm danh mục. Trận đấu đọc danh mục hiện tại, sau đó gọi `resolveWakeTarget`. Cách phát âm không hoạt động trong quá trình nhận dạng không thể đánh thức một ký tự. Thay đổi chủ sở hữu sử dụng chủ sở hữu mới mà không cần xây dựng lại từ khóa. Việc dừng hoặc xây dựng lại từ khóa sẽ loại bỏ kết quả muộn. Việc phát hiện không bao giờ bác bỏ, bởi vì việc bác bỏ sẽ kết thúc việc quan sát được chia sẻ.

`useWakeWordDetectionStore` sở hữu trình phát hiện đang chạy và tiết lộ sự chuẩn bị của nó: `unconfigured`, `preparing`, `ready` hoặc `error`. `voice.startListening` khởi động nó khi host không cung cấp `detectWakeWord`. mô hình chỉ tải khi danh mục có cách phát âm cho mô hình được ghim.

mô hình được ghim là gói Zipformer 3M KWS của Trung Quốc và Anh trong một lần sửa đổi. Danh sách token của nó được sao chép vào kho lưu trữ. Công cụ từ khóa và xác thực thẻ sử dụng danh sách này mà không cần tải xuống mô hình. Điều khiển token như `<unk>` không phải là cách phát âm hợp lệ.

Công cụ `configure_wake_words` chỉnh sửa ký tự sở hữu phiên của lượt. Nó ghi lại ID đó trước khi yêu cầu bắt đầu. Nó trả về `saved` có xung đột với ký tự đã chỉnh sửa hoặc `rejected` có lý do. Thẻ không thay đổi khi bị từ chối.

<a id="consequences"></a>

## Hậu quả

Đánh thức phát hiện từ và VAD đọc cùng một âm thanh và dừng cùng nhau. Sau khi đánh thức, plugin sẽ bắt đầu nhập bằng `after-silence`. Các trận đấu sau đó của cùng một ký tự không bắt đầu một đầu vào khác.

Độ chính xác của việc nhận dạng phụ thuộc vào cách phát âm mô hình token mà nhân vật viết. Không có chuyển đổi văn bản sang token tồn tại. Bản sửa đổi mô hình mới yêu cầu một tệp từ vựng mới và quyết định về các thẻ store `modelId` cũ.

<a id="input-modes"></a>

## Chế độ đầu vào

Chế độ đầu vào Thính giác `wake-word` giúp micrô luôn mở. Tùy chọn giọng nói store `target()` trả về không xác định trong chế độ này. Khi đó, riêng VAD không thể bắt đầu đầu vào mà chỉ có thể đánh thức. `startsInputOnSpeech` trong phiên điều trần store sở hữu quy tắc này. `always-on` cũng chạy tính năng phát hiện từ đánh thức, do đó, đánh thức sẽ chuyển đầu vào tiếp theo sang ký tự phù hợp. `push-to-talk` không nghe liên tục và không phát hiện được.

<a id="follow-up"></a>

## Theo dõi

Cài đặt điểm và ngưỡng cho mỗi cách phát âm không có trong lược đồ thẻ. Chỉ thêm chúng nếu bản ghi thực hiển thị đánh thức sai hoặc đánh thức bị bỏ lỡ.
