# @angela/pipelines-audio

Dàn nhạc đường truyền âm thanh được chia sẻ cho Angela. Gói này sở hữu tính năng chia sẻ đầu vào, khoảng thời gian thu nhận dữ liệu, cửa sổ dò tìm, nhóm phát lại và phân đoạn văn bản. Nó không phụ thuộc vào UI.

<a id="use-it-for"></a>

## Sử dụng nó cho

- Chia sẻ một nguồn âm thanh giữa ghi âm, phiên âm và phát hiện.
- Xây dựng và lên lịch quy trình phát lại giọng nói.
- Phân tích các sự kiện điều khiển truyền dữ liệu liên tục.

<a id="do-not-use-it-for"></a>

## Không sử dụng nó cho

- Trạng thái vòng đời của Vue hoặc Electron.
- Thông tin xác thực nhà cung cấp và lỗi dành riêng cho sản phẩm UI.
- Nguồn trình duyệt và mã hóa tệp thuộc về `@angela/audio`.

<a id="input-capture-and-observation"></a>

## Đầu vào, thu nhận dữ liệu và quan sát

`AudioInput` chia sẻ một `LiveAudioSource`, ví dụ như micrô. Người đăng ký đầu tiên mở nguồn và người cuối cùng rời đi sẽ đóng nguồn. Nguồn trực tiếp không thể đợi bên đọc của nó. Tệp là `AudioSource` nhưng không phải là nguồn trực tiếp. Mỗi bên sử dụng của một tệp sẽ mở luồng riêng của nó và luồng đó giữ áp suất ngược cho native. Mỗi đăng ký, thu nhận dữ liệu và người quan sát kết thúc bằng tín hiệu hủy bỏ của chính nó. Không có lease để phát hành.

```ts
const input = new AudioInput(source, { historyMs: 360 })

// capture() subscribes immediately. Its stream is continuous PCM for one interval.
const recording = capture(input, { signal })
const output = transcriber.transcribe({ audio: recording.stream, signal })

// The release control calls recording.finish(). Provider output continues until it completes.
for await (const event of output)
  showTranscript(event)
```

- `subscribe({ from, signal, maxBufferedMs })` trả về các khối từ bây giờ hoặc phát lại lần đầu lịch sử được giữ lại từ `from`.
- `capture(input, { from, signal, maxBufferedMs })` thêm `started`, `finish()`, `cancel(reason)` và kiểm tra khoảng cách.
- `retain(signal)` trả về lease. Người nắm giữ nó gọi `hold(position)` để giữ lịch sử từ vị trí đó.
- `observe(input, options, detector, onResult)` chạy trình phát hiện trên các cửa sổ có lập lịch `ordered` hoặc `latest`.
- `audioWindows(shape)` chỉ là biến đổi cửa sổ dành cho người gọi lên lịch công việc của riêng họ.
- `createScope(signal)` sở hữu một vòng đời: tín hiệu hủy bỏ, dọn dẹp theo thứ tự ngược và phạm vi con.

Người quan sát ủng hộ cửa sổ trượt và cửa sổ đang phát triển. `preRollMs` lưu giữ lịch sử mà các cửa sổ phát hiện đang chờ xử lý cần, bao gồm cả thời gian suy luận. Khoảng cách mẫu khởi động lại sự tăng trưởng của cửa sổ. Tọa độ khung không bao giờ chéo các kết nối nguồn. Nguồn trực tiếp không thể đợi bên đọc chậm. Mỗi người đăng ký, thu nhận dữ liệu và người quan sát `ordered` có giới hạn `maxBufferedMs`, theo mặc định là 60 giây. Khi bên đọc tụt xuống dưới giới hạn đó thì chỉ bên đọc đó không thành công. Nguồn và bên đọc khác tiếp tục. Không có thời hạn phát hiện bắt buộc. Các plugin sở hữu mô hình, giữ lại kết quả và loại bỏ.

Người chụp và người quan sát giải quyết bằng `Outcome`: `finished` có giá trị, `cancelled` có lý do hoặc `failed` có lỗi. thu nhận dữ liệu đã hoàn thành báo cáo khoảng thời gian của nó. Trình quan sát kết thúc khi nguồn kết thúc và cửa sổ cuối cùng của nó được xử lý.

<a id="playback-ownership"></a>

## Quyền sở hữu phát lại

`Playback.openGroup()` tạo một hàng đợi độc lập. Các nhóm có thể chơi đồng thời. `finish()` tiêu hao một nhóm. `stop({ fadeMs })` đóng quá trình tiếp nhận, loại bỏ các clip đã xếp hàng đợi và chờ sự im lặng thực sự. Một clip bị hủy sẽ không hủy các clip khác trong nhóm của nó.

Người lái xe sở hữu đồng hồ âm thanh. `playback.nowMs()` đọc nó. Một clip có thể đặt `startAtMs` trên đồng hồ đó. Nhóm vẫn bắt đầu các clip theo thứ tự. Mỗi mục biên nhận báo cáo `throughMs` và `interval` được hiển thị trên cùng một đồng hồ. Người gọi có thể bắt đầu đầu ra tiếp theo liên quan đến khoảng thời gian đó, chẳng hạn như 2 giây sau khi clip kết thúc. Một nhóm không trộn các clip hoặc lên lịch các luồng với nhau. Phát lại không có phiên trò chuyện, lượt hoặc hợp đồng thông báo agent. `Response` trong core-agent cung cấp các ranh giới hội thoại và thứ tự nhà sản xuất đó.

<a id="checks"></a>

## Kiểm tra

Chạy `pnpm -F @angela/pipelines-audio typecheck` và `pnpm -F @angela/pipelines-audio test:run`. Các thử nghiệm công khai bao gồm tính độc lập của thu nhận dữ liệu, lịch sử sử dụng bị trì hoãn, khoảng trống nguồn, hoàn thiện tệp, hủy và xác nhận phát lại.
