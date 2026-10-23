<a id="local-voice-service"></a>

# Dịch vụ giọng nói cục bộ

Dịch vụ này cung cấp các điểm cuối âm thanh cho Angela CLI trên Linux. Faster Whisper nhận dạng tiếng Việt cục bộ bằng mô hình CPU với độ chính xác INT8. Edge TTS đọc câu trả lời qua dịch vụ trực tuyến của Microsoft, không cần khóa API. Văn bản trả lời được gửi đến Microsoft. Âm thanh micrô được giữ trên máy này. Edge TTS cần Internet và phụ thuộc vào tình trạng dịch vụ. Nếu phản hồi không có âm thanh, hệ thống thử lại một lần trong thời gian chờ của cùng yêu cầu.

<a id="run"></a>

## Chạy

```sh
docker compose -f capabilities/voice/local/compose.yaml up -d --build
curl http://127.0.0.1:8000/health
```

Lần nhận dạng đầu tiên tải mô hình đa ngôn ngữ `small` từ Hugging Face. Volume Docker giữ mô hình qua các lần khởi động lại. Việc tải mô hình cần Internet. Dịch vụ chỉ lắng nghe trên localhost. Không công khai điểm cuối chưa có xác thực này ra mạng. Container có giới hạn bộ nhớ 2 GiB và dùng hai luồng CPU để suy luận.

Thêm các giá trị này vào tệp `~/.config/angela/voice.env` riêng tư:

```dotenv
ANGELA_VOICE_BASE_URL=http://127.0.0.1:8000/v1/
ANGELA_STT_MODEL=small
ANGELA_TTS_MODEL=edge-tts
ANGELA_TTS_VOICE=vi-VN-HoaiMyNeural
```

Khởi động lại Angela CLI. Nhập `/voice` rồi nói mà không cần nhấn Enter. Silero VAD phát hiện lời nói và kết thúc một lượt sau khoảng 1,2 giây im lặng. Sau khi Angela đọc câu trả lời, CLI tiếp tục nghe. Nhập `/chat` để quay về chế độ văn bản. Ctrl+C hủy chế độ giọng nói. Dùng `/voice` để bật lại. Micrô tắt khi Angela đang xử lý hoặc đọc câu trả lời. Trước khi chạy Compose, đặt `ANGELA_VOICE_SILENCE_MS` để chọn khoảng lặng từ 400 đến 2000 ms. Mặc định là 1200 ms. Khoảng lặng dài hơn giảm ngắt lời nhưng tăng độ trễ phản hồi.

WebSocket `v1/audio/listen` nhận lựa chọn mô hình STT dạng JSON, sau đó nhận PCM thô 16 kHz, mono, 16 bit có dấu. Với mỗi lượt nói, kết nối phát các sự kiện `ready`, `speech`, `transcribing` và `transcript` rồi đóng. Silero dùng tài nguyên ONNX đi kèm Faster Whisper. VAD không cần tải thêm mô hình. Bộ thu giữ ba giây ngữ cảnh chờ và tối đa 30 giây cho mỗi lượt nói trong bộ nhớ. Ngắt kết nối sẽ bỏ dữ liệu đã thu. Tác vụ STT đang chạy có thể hoàn tất sau khi máy khách ngắt kết nối. Không cần khóa API giọng nói. Nhà cung cấp trò chuyện hiện có vẫn được cấu hình riêng. CLI đọc tệp này từ mọi thư mục làm việc. Biến môi trường ghi đè giá trị trong tệp. `ANGELA_VOICE_ENV` chọn tệp khác. `XDG_CONFIG_HOME` chọn thư mục cấu hình khác.

<a id="stop"></a>

## Dừng

```sh
docker compose -f capabilities/voice/local/compose.yaml stop
```

<a id="sources"></a>

## Nguồn tham khảo

- [Faster Whisper](https://github.com/SYSTRAN/faster-whisper)
- [edge TTS](https://github.com/rany2/edge-tts)

<a id="checks"></a>

## Kiểm tra

```sh
docker compose -f capabilities/voice/local/compose.yaml cp capabilities/voice/local/test_app.py voice:/app/test_app.py
docker compose -f capabilities/voice/local/compose.yaml exec -T voice python -m unittest test_app
```
