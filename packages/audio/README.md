<a id="audio-adapters"></a>

# Bộ điều hợp âm thanh

`@angela/audio` sở hữu tài nguyên âm thanh trình duyệt và chuyển đổi định dạng. `@angela/pipelines-audio` sở hữu các khoảng thu nhận dữ liệu, cửa sổ quan sát và nhóm phát lại.

<a id="use-it-for"></a>

## Sử dụng nó cho

- Mở micrô, MediaStream mượn hoặc tệp âm thanh làm nguồn PCM.
- Mã hóa PCM thành WAV hoặc chuyển đổi định dạng đầu vào PCM sang nhà cung cấp.
- Phát tệp hoặc phát trực tuyến PCM qua Web Audio.
- fade sở hữu các nút phát lại trước khi báo cáo sự im lặng.

<a id="audio-sources"></a>

## Nguồn âm thanh

Nguồn là `AudioSource`. Cuộc gọi `open(signal)` của nó trả về luồng PCM. Việc hủy bỏ tín hiệu sẽ giải phóng kết nối.

| Nguồn | Mô-đun | trực tiếp | Chủ sở hữu của track hoặc dữ liệu |
| --- | --- | --- | --- |
| `microphoneSource(constraints, options)` | `@angela/audio/browser` | Có | Nguồn. Nó dừng track và đóng AudioContext của nó. |
| `mediaStreamSource(stream, context)` | `@angela/audio/browser` | Có | Người gọi. Nguồn chỉ ngắt kết nối các nút của chính nó. |
| `fileSource(blob)` | `@angela/audio/encoding` | Không | Người gọi. Mediabunny giải mã tập tin cho mỗi kết nối. |

Nguồn trực tiếp không thể đợi bên đọc của nó. Gói nguồn trực tiếp vào `AudioInput` để chia sẻ nó. Mỗi bên sử dụng đăng ký bằng tín hiệu riêng.

Tệp không phải là trực tiếp. bên đọc của nó đặt tốc độ giải mã. Mỗi bên sử dụng mở luồng riêng của nó:

```ts
const events = transcriber.transcribe({ audio: fileSource(recording).open(signal), signal })
```

```ts
import { microphoneSource } from '@angela/audio/browser'
import { encodeWav } from '@angela/audio/encoding'
import { AudioInput, capture } from '@angela/pipelines-audio'

const input = new AudioInput(microphoneSource({ audio: { echoCancellation: true } }), { historyMs: 360 })

// Start this in the click handler. getUserMedia starts before the first await.
const recording = capture(input)
const wav = encodeWav(recording.stream, { sampleRate: 16000, channels: 1 })

// Call finish when the control is released. Call cancel to discard the interval.
await recording.finish()
showPreview(await wav)
```

Người đăng ký đầu tiên mở micrô. Người đăng ký cuối cùng rời đi sẽ dừng track. Kết quả cấp phép muộn sau thời điểm đó sẽ dừng track của nó ngay lập tức.

`toMediaStream(stream, context, signal)` phát PCM thành track mới. Sử dụng nó cho các API chỉ chấp nhận MediaStream, chẳng hạn như nhận dạng giọng nói trên web.

<a id="playback"></a>

## Phát lại

```ts
import { BrowserPlayback } from '@angela/audio/browser'
import { Playback } from '@angela/pipelines-audio'

const playback = new Playback(new BrowserPlayback(audioContext))
const group = playback.openGroup('answer')
void group.enqueue({ id: 'first', audio: audioBlob })
const receipt = await group.stop({ fadeMs: 100 })
```

Việc nhận dừng tuân theo đồng hồ âm thanh và hoàn thành nguồn. Nó không dựa vào bộ đếm thời gian UI. `BrowserPlayback` sử dụng `audioContext.currentTime` làm đồng hồ phát lại. `startAtMs` và biên nhận `interval` tính bằng mili giây trên đồng hồ đó. Người gọi sở hữu `audioContext` và đóng nó sau khi bên sử dụng kết thúc.

<a id="do-not-use-it-for"></a>

## Không sử dụng nó cho

- Định tuyến ký tự, duy trì trò chuyện hoặc thông báo agent.
- Chính sách VAD, khớp từ đánh thức, tìm kiếm bộ nhớ hoặc viết lại bản ghi.
- Lệnh trạng thái Vue hoặc cửa sổ chéo.

<a id="checks"></a>

## Kiểm tra

Chạy `pnpm -F @angela/audio typecheck` và các dự án Vitest của nó. Các bài kiểm tra Node bao gồm mã hóa và giải mã tệp WAV. Các bài kiểm tra trình duyệt bao gồm Âm thanh trên web, chia sẻ micrô, quyền truy cập muộn và dọn dẹp track.
