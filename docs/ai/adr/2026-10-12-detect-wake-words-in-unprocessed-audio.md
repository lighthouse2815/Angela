<a id="detect-wake-words-in-unprocessed-audio"></a>

# Phát hiện các từ đánh thức trong âm thanh chưa được xử lý

Trạng thái: đã chấp nhận

Thay thế cài đặt tìm kiếm và nguồn âm thanh của [Detect các từ đánh thức trong âm thanh được chia sẻ](./2026-10-09-detect-wake-words-in-shared-audio.md). Danh mục, worker, hàng đợi và các quy tắc chế độ đầu vào của bản ghi đó vẫn tồn tại.

<a id="context"></a>

## Bối cảnh

Lệnh gọi trực tiếp của từ đánh thức không đánh thức nhân vật trong stage-tamagotchi. Mỗi lớp đã được kiểm tra trong ứng dụng đang chạy vào ngày 12/10/2026:

- Máy dò nhận được các cửa sổ 16 kHz, máy dò tìm xử lý từng đợt và danh mục có cách phát âm như mong đợi.
- Người theo dõi không trả lại kết quả nào trong khoảng 28 phút âm thanh micrô chứa các cuộc gọi lặp lại.
- mô hình được ghim giống nhau khớp với cùng một từ khóa trong giọng nói tổng hợp và trong bản ghi âm kiểm tra sherpa-onnx upstream.
- Bản ghi cuộc gọi của người dùng chỉ khớp sau ba lần thay đổi:
  - tone variants of the last syllable, because the user said `lù` or `lú` while the card stored `lū`
  - một luồng phát hiện mới trong mỗi lần tạm dừng: một kết quả phù hợp trong một luồng liên tục, ba kết quả được đặt lại ở mỗi lần tạm dừng
  - cài đặt tìm kiếm của cài đặt trước hộp cát Sherpaw

Hộp cát Sherpaw phát hiện cùng một từ khóa trong bài phát biểu trực tiếp. Nó khác với AIRI ở hai điểm:

- Nó mở micrô mà không khử tiếng vang, khử tiếng ồn hoặc tăng tự động.
- Nó sử dụng 16 đường dẫn hoạt động, tăng từ khóa 1,5 và ngưỡng 0,1. AIRI đã sử dụng các giá trị mặc định của sherpa-onnx: 4 đường dẫn, tăng 1 và ngưỡng 0,25.

<a id="decision"></a>

## Phán quyết

- `useAudioDevice` cung cấp hai đầu vào cho thiết bị được chọn:
  - `input` tiếp tục xử lý trình duyệt. VAD, thu nhận dữ liệu và máy đo mức sử dụng nó.
  - `unprocessedInput` không có trình duyệt xử lý. Chỉ phát hiện từ khóa mới sử dụng nó.
  - Chrome mở cả hai ảnh chụp của một thiết bị bằng cài đặt riêng. Một sự thay đổi thiết bị sẽ thay thế cả hai.
- `WakeWordDetector.listen(input, signal)` quan sát `unprocessedInput` trong cửa sổ 100 ms. `useWakeWordDetectionStore` chỉ tiếp tục nghe khi danh mục có cách phát âm tích cực của mô hình được ghim. Thiết bị không có từ đánh thức sẽ không mở được thu nhận dữ liệu thứ hai.
- Plugin hoạt động bằng giọng nói vẫn sở hữu quyền truy cập đánh thức. Trên mỗi cửa sổ của nó, nó gọi `detectWakeWord` với kết quả VAD. Trình phát hiện trả về đánh thức đã được giải quyết và bắt đầu luồng phát hiện mới sau 0,5 giây VAD không có giọng nói.
- `kwsSearch` giữ cài đặt tìm kiếm của gói được ghim: 16 đường dẫn hoạt động, tăng 1,5 và ngưỡng 0,1.
- `kwsToneVariants` thêm các biến thể thanh điệu vào mỗi cách phát âm thẻ. Mỗi biến thể thay đổi âm điệu của một bính âm cuối cùng. Số đếm tăng tuyến tính với số lượng âm tiết. Cách phát âm lá bài giữ nguyên trình tự token của nó khi một biến thể của lá bài khác bằng với nó.

<a id="consequences"></a>

## Hậu quả

- Phát hiện từ khóa và VAD đọc các ảnh chụp riêng biệt của một thiết bị. Cửa sổ của chúng không được căn chỉnh theo khung, do đó, dấu kết quả VAD chỉ tạm dừng một cách xấp xỉ. Khoảng dừng 0,5 giây sẽ hấp thụ sự khác biệt đó.
- Quá trình xử lý giọng nói của macOS sẽ hủy âm thanh mà hệ thống phát. Thử nghiệm phát giọng nói qua loa có thể đạt tới thu nhận dữ liệu chưa được xử lý chứ không phải VAD.
- Ngưỡng 0,1 có thể gây ra tình trạng đánh thức sai. Cài đặt theo cách phát âm sẽ nằm ngoài lược đồ thẻ cho đến khi bản ghi hiển thị đánh thức sai.
- Phát âm thẻ vẫn đến từ nhân vật. Tên tiếng Anh rất dễ vỡ: ví dụ: cài đặt sẵn Sherpaw ánh xạ "Iru" tới `IY1 L UW0` chứ không phải `IY1 R UW1`.
