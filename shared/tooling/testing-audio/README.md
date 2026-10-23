<a id="testing-audio"></a>

# Kiểm tra âm thanh

Gói này chạy các bài kiểm tra micrô đã ghi thông qua đường ống âm thanh thực của Angela.

```text
input.wav -> virtual microphone -> VAD -> ASR -> LLM -> TTS -> playback -> UI
```

Gói này xuất các API `describe`, `it` và `expect` nhận biết âm thanh. Vitest sở hữu cây nhiệm vụ và giao thức kết quả. Mỗi dự án bắt đầu Playwright runtime được cấu hình của nó.

`src` chỉ sở hữu tính năng lập lịch kiểm tra, khởi động runtime, thăm dò trình duyệt và so khớp. Môi trường, bộ lưu trữ, hoạt động nhà cung cấp, route và UI theo từng trường hợp cụ thể trực tiếp trong `cases/shared`:

```text
cases/shared/
  configurations/  # preflight callbacks that configure one concern
  interactions/    # reusable UI operations selected by a case
```

<a id="configure-a-case"></a>

## Cấu hình một trường hợp

Trường `preflight` tùy chọn là mảng gọi lại theo thứ tự. Tích hợp Vitest micrô giả khởi động runtime trước khi nó gọi các lệnh gọi lại này. Mỗi cuộc gọi lại nhận được:

- `env`: môi trường xử lý cho trường hợp này
- `runtime`: Playwright runtime sạch sẽ
- `skip`: Kiểm soát bỏ qua cấp trường hợp của Vitest

Mỗi trường hợp đều chọn rõ ràng cấu hình mà nó cần. Không tạo một preflight "đường dẫn hoàn chỉnh" được chia sẻ để che giấu sự kết hợp nhà cung cấp.

```ts
import { describe, expect, it } from '../../src'
import { configureModuleHearing, configureOnboarding, loadCaseEnvironment } from '../shared/configurations'
import { enableChatMicrophone } from '../shared/interactions'
import { openaiAsr } from '../shared/providers'

describe('audio input pipeline', () => {
  it('transcribes a greeting', {
    input: new URL('./input.test.wav', import.meta.url),
    preflight: [
      configureOnboarding(() => ({ completed: true })),
      configureModuleHearing(async (context) => {
        const environment = await loadCaseEnvironment(context.env)
        const apiKey = environment.TESTING_AUDIO_ASR_API_KEY
        context.skip(!apiKey, 'Set TESTING_AUDIO_ASR_API_KEY to run this ASR case.')
        if (!apiKey)
          return undefined

        return {
          provider: openaiAsr({
            apiKey,
            baseUrl: environment.TESTING_AUDIO_ASR_API_BASE_URL ?? 'https://api.openai.com/v1/',
            model: environment.TESTING_AUDIO_ASR_MODEL ?? 'whisper-1',
            provider: environment.TESTING_AUDIO_ASR_PROVIDER ?? 'openai-compatible-audio-transcription',
          }),
          captureFormat: 'wav',
        }
      }),
    ],
  }, async ({ audio }) => {
    await enableChatMicrophone(audio)
    await expect(audio).toHaveTranscriptions([
      ['Please say hello.'],
    ])
  })
})
```

Một trường hợp có thể chọn cấu hình VAD, ASR, LLM và TTS một cách độc lập. Lệnh gọi lại cấu hình có thể đọc môi trường của chính nó, ghi bộ nhớ cục bộ, sử dụng cơ chế lưu giữ khác hoặc cố tình để quá trình triển khai chưa hoàn tất.

<a id="test-wake-word-detection"></a>

## Kiểm tra phát hiện từ đánh thức

Sử dụng `configureWakeWord` để thêm Thẻ Angela kèm theo lời đánh thức. Mỗi cấu hình thêm một thẻ có một từ đánh thức và cách phát âm của nó. Cuộc gọi lại cũng bật micrô và chọn chế độ đầu vào Nghe `wake-word`. Vỏ máy không cần ASR nhà cung cấp.

Đặt `pipelines: ['kws']`. Sau đó, Web runner tải xuống và xác minh KWS mô hình được ghim trước khi micrô của tệp bắt đầu. Trang Web lấy mô hình từ bộ đệm workspace chứ không phải từ mạng. Electron sử dụng mô hình đi kèm của nó.

```ts
import { describe, expect, it } from '../../src'
import { configureOnboarding, configureWakeWord } from '../shared/configurations'
import { readSessionCharacterId } from '../shared/interactions'

describe('wake word detection', () => {
  it('begins a voice input for the character', {
    input: new URL('./input.test.wav', import.meta.url),
    pipelines: ['kws'],
    preflight: [
      configureOnboarding(() => ({ completed: true })),
      configureWakeWord(() => [{
        targetCardId: 'testing-audio-wake-word',
        text: 'Light up',
        pronunciations: [['L', 'AY1', 'T', 'AH1', 'P']],
      }]),
    ],
  }, async ({ audio }) => {
    const input = await audio.waitForVoiceInput({ timeout: 90_000 })
    await expect(readSessionCharacterId(audio, input.sessionId)).resolves.toBe('testing-audio-wake-word')
  })
})
```

Việc đánh thức không làm thay đổi thẻ đang hoạt động. Nó bắt đầu nhập giọng nói trong phiên trò chuyện của nhân vật phù hợp. `waitForVoiceInput` đọc đầu vào đó từ ảnh chụp nhanh host bằng giọng nói trên bus lời nói. `readSessionCharacterId` đọc chủ sở hữu phiên từ chỉ mục phiên trò chuyện được lưu trữ.

Ở chế độ `wake-word`, chỉ có giọng nói sẽ không bắt đầu đầu vào. Do đó, đầu vào bằng giọng nói đầu tiên của trường hợp này xuất phát từ sự đánh thức.

Each pronunciation is a token sequence of the pinned zh/en Zipformer model. The vocabulary is in `shared/ui/stage/src/libs/voice/kws-vocabulary.json`. English tokens are CMU phonemes with stress digits, for example `AY1`. Mandarin tokens are pinyin initials and finals with tone marks, for example `zh ī m a k āi m én` for 芝麻开门. A neutral tone has no mark.

Các trường hợp từ đánh thức:

| Trường hợp | Nó chứng tỏ điều gì | Ghi âm | Đánh thức từ (phát âm) |
| --- | --- | --- | --- |
| `wake-word` | Quá trình đánh thức bắt đầu quá trình nhập trong phiên của chủ sở hữu chứ không phải phiên của thẻ đang hoạt động. | "Thắp sáng" 3 lần, macOS giọng Samantha, 35 giây im lặng | “Thắp sáng”: `L AY1 T AH1 P` |
| `wake-word-routing` | Một máy dò giữ các từ của hai ký tự. Đầu vào sẽ chuyển đến ký tự có từ được nói. | "Xin chào máy tính" 3 lần, giọng OpenAI `tts-1` `alloy`, im lặng 15 giây | "Thắp sáng": `L AY1 T AH1 P`. "Chào máy tính": `HH AH0 L OW1 K AH0 M P Y UW1 T ER0` |
| `wake-word-second-pronunciation` | A pronunciation after the first one wakes the character, and a Mandarin token sequence matches Mandarin speech. | "芝麻开门" 3 times, OpenAI `tts-1` `alloy` voice, 15 s leading silence | "Open sesame": `OW1 P AH0 N S EH1 S AH0 M IY0`, then `zh ī m a k āi m én` |

Tất cả mẫu kiểm thử đều là các tệp PCM WAV đơn âm 16 kHz. Khoảng lặng chủ đạo giúp máy dò có thời gian khởi động trước khi bắt đầu phát biểu. Sau mỗi cụm từ có khoảng dừng 1 giây.

<a id="generate-the-fixtures"></a>

### Tạo mẫu kiểm thử

`scripts/generate-wake-word-fixtures.ts` ghi `wake-word-routing` và `wake-word-second-pronunciation` mẫu kiểm thử. Nó gửi từng cụm từ đến điểm cuối `/audio/speech` tương thích với OpenAI và yêu cầu âm thanh `pcm` 24 ​​kHz. Sau đó, nó chuyển đổi âm thanh thành 16 kHz, loại bỏ khoảng lặng xung quanh mỗi cụm từ và thêm các khoảng dừng mẫu kiểm thử. Nó không cần `ffmpeg`.

Tập lệnh đọc các biến `TESTING_AUDIO_TTS_*` theo cách tương tự như các trường hợp. Đặt chúng trong `shared/tooling/testing-audio/.env.local` hoặc `.env.test.local`. Sau đó chạy:

```bash
pnpm -F @angela/testing-audio exec tsx scripts/generate-wake-word-fixtures.ts
```

Bài phát biểu thay đổi một chút theo từng yêu cầu. Sau khi bạn tạo mẫu kiểm thử, hãy chạy các trường hợp trên cả host. Nếu một cụm từ không đánh thức được ký tự, hãy thay đổi cụm từ đó hoặc cách phát âm của nó. Đừng thay đổi các khẳng định.

Chạy các trường hợp trên cả host:

```bash
pnpm -F @angela/testing-audio test:run cases/wake-word
```

Đối với một host, hãy xây dựng ứng dụng của nó và chọn `--project audio-web` hoặc `--project audio-electron`.

<a id="provider-environment"></a>

## Môi trường nhà cung cấp

Mỗi trường hợp chọn các biến môi trường của nó. `loadCaseEnvironment` sử dụng chế độ kiểm tra Vite để đọc các tệp môi trường kho lưu trữ, `shared/ui/stage` và gói. Các biến quy trình có mức độ ưu tiên cao nhất.

Đặt thông tin xác thực kiểm tra cục bộ vào `shared/tooling/testing-audio/.env.test.local`. Git bỏ qua tập tin này.

Trình trợ giúp nhà cung cấp tương thích với OpenAI không đọc được môi trường. Truyền điểm cuối, khóa API, mô hình và giọng nói từ lệnh gọi lại trường hợp.

Các trường hợp được bao gồm sử dụng các biến rõ ràng sau:

```dotenv
TESTING_AUDIO_ASR_PROVIDER=openai-compatible-audio-transcription
TESTING_AUDIO_ASR_MODEL=whisper-1
TESTING_AUDIO_ASR_API_BASE_URL=https://api.openai.com/v1/
TESTING_AUDIO_ASR_API_KEY=...

TESTING_AUDIO_ASR_ALIYUN_NLS_PROVIDER=aliyun-nls-transcription
TESTING_AUDIO_ASR_ALIYUN_NLS_ALIYUN_AK_ID=...
TESTING_AUDIO_ASR_ALIYUN_NLS_ALIYUN_AK_SECRET=...
TESTING_AUDIO_ASR_ALIYUN_NLS_APPKEY=...

TESTING_AUDIO_LLM_PROVIDER=openai-compatible
TESTING_AUDIO_LLM_MODEL=gpt-4o-mini
TESTING_AUDIO_LLM_API_BASE_URL=https://api.openai.com/v1/
TESTING_AUDIO_LLM_API_KEY=...

TESTING_AUDIO_TTS_PROVIDER=openai-compatible-audio-speech
TESTING_AUDIO_TTS_MODEL=tts-1
TESTING_AUDIO_TTS_VOICE=alloy
TESTING_AUDIO_TTS_API_BASE_URL=https://api.openai.com/v1/
TESTING_AUDIO_TTS_API_KEY=...
```

Các thử nghiệm này sẽ gửi âm thanh và văn bản tới nhà cung cấp bên ngoài. Mỗi lần chạy có thể phải chịu phí nhà cung cấp.

<a id="run-the-tests"></a>

## Chạy thử nghiệm

Xây dựng cả hai mục tiêu và chạy tất cả các dự án runtime:

```bash
pnpm -F @angela/testing-audio test:run
```

Sử dụng các bản dựng hiện có:

```bash
pnpm -F @angela/testing-audio test:existing-builds
```

Chạy một dự án runtime:

```bash
pnpm -F @angela/testing-audio exec vitest run --project audio-web
pnpm -F @angela/testing-audio exec vitest run --project audio-electron
```

Sử dụng `*.audio.web.test.ts` cho các trường hợp chỉ dành cho Web. Sử dụng `*.audio.electron.test.ts` cho các trường hợp chỉ có Electron. Mẫu `*.audio.test.ts` chạy trong cả hai dự án.

Không sử dụng Chế độ trình duyệt Vitest cho những trường hợp này. Mỗi tác vụ cần có một đối số quy trình micrô giả Chrome dành riêng cho từng trường hợp.
