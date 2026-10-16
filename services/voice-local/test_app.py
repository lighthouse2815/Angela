"""Check audio contracts without downloads or external speech requests."""

import asyncio
import io
import unittest
import wave

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from edge_tts.exceptions import NoAudioReceived

from fastapi import HTTPException, UploadFile
from faster_whisper.audio import decode_audio

from app import Speech, listen, speech, transcriptions
from capture import SpeechCapture


class AudioTests(unittest.TestCase):
    def test_issue_1589_decodes_wav_with_installed_pyav(self):
        # https://github.com/SYSTRAN/faster-whisper/issues/1589
        # PyAV 19 removed metadata_errors. PyAV 18 preserves the decoder contract.
        audio = io.BytesIO()
        with wave.open(audio, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(16000)
            wav.writeframes(b"\x00\x00" * 16000)
        audio.seek(0)
        decoded = decode_audio(audio)
        self.assertEqual(len(decoded), 16000)

    def test_transcription_closes_upload_and_returns_text(self):
        upload = UploadFile(io.BytesIO(b"test audio"), filename="input.wav")
        with patch("app.transcribe_audio", return_value="Xin chào") as transcribe:
            result = asyncio.run(transcriptions(upload, "small"))
        self.assertEqual(result, {"text": "Xin chào"})
        transcribe.assert_called_once_with(b"test audio")
        self.assertTrue(upload.file.closed)

    def test_unknown_model_rejects_before_inference(self):
        upload = UploadFile(io.BytesIO(b"test audio"), filename="input.wav")
        with patch("app.transcribe_audio") as transcribe:
            with self.assertRaises(HTTPException) as caught:
                asyncio.run(transcriptions(upload, "unknown"))
        self.assertEqual(caught.exception.status_code, 400)
        transcribe.assert_not_called()
        self.assertTrue(upload.file.closed)

    def test_speech_returns_wav_from_edge_audio(self):
        async def stream():
            yield {"type": "WordBoundary", "text": "Xin"}
            yield {"type": "audio", "data": b"mp3"}
        with patch("app.edge_tts.Communicate", return_value=SimpleNamespace(stream=stream)) as communicate:
            with patch("app.decode_audio", return_value=b"RIFFwav") as decode:
                result = asyncio.run(speech(Speech(input="Xin chào")))
        communicate.assert_called_once_with("Xin chào", "vi-VN-HoaiMyNeural")
        decode.assert_called_once_with(b"mp3")
        self.assertEqual(result.media_type, "audio/wav")
        self.assertEqual(result.body, b"RIFFwav")

    def test_retries_missing_edge_audio_once(self):
        async def missing():
            raise NoAudioReceived("no audio")
            yield

        async def success():
            yield {"type": "audio", "data": b"mp3"}

        clients = [SimpleNamespace(stream=missing), SimpleNamespace(stream=success)]
        with patch("app.edge_tts.Communicate", side_effect=clients) as communicate:
            with patch("app.decode_audio", return_value=b"RIFFwav"):
                with patch("app.asyncio.sleep", new_callable=AsyncMock):
                    result = asyncio.run(speech(Speech(input="Xin chào")))
        self.assertEqual(communicate.call_count, 2)
        self.assertEqual(result.body, b"RIFFwav")

    def test_unsupported_voice_rejects_before_network(self):
        with patch("app.edge_tts.Communicate") as communicate:
            with self.assertRaises(HTTPException) as caught:
                asyncio.run(speech(Speech(input="Xin chào", voice="unknown")))
        self.assertEqual(caught.exception.status_code, 400)
        communicate.assert_not_called()


class CaptureTests(unittest.TestCase):
    def test_idle_audio_stays_bounded_and_does_not_trigger(self):
        with patch("capture.get_speech_timestamps", return_value=[]):
            capture = SpeechCapture()
            for _ in range(200):
                self.assertIsNone(capture.feed(b"\x00" * 8192))
        self.assertFalse(capture.started)
        self.assertLessEqual(len(capture.window), 96000)
        self.assertEqual(len(capture.audio), 0)

    def test_speech_ends_after_silero_reports_trailing_silence(self):
        with patch("capture.get_speech_timestamps", return_value=[{"start": 0, "end": 4096}]):
            capture = SpeechCapture()
            self.assertIsNone(capture.feed(b"\x00" * 8192))
        self.assertTrue(capture.started)
        with patch("capture.get_speech_timestamps", return_value=[]):
            audio = capture.feed(b"\x00" * 8192)
        self.assertEqual(len(audio), 16384)

    def test_long_utterances_are_limited_to_thirty_seconds(self):
        with patch("capture.get_speech_timestamps", return_value=[{"start": 0, "end": 32000}]):
            capture = SpeechCapture()
            audio = None
            for _ in range(120):
                audio = capture.feed(b"\x00" * 8192)
                if audio is not None:
                    break
        self.assertEqual(len(audio), 960000)

    def test_fragmented_frames_are_preserved(self):
        with patch("capture.get_speech_timestamps", return_value=[]):
            capture = SpeechCapture()
            capture.feed(b"a" * 8191)
            capture.feed(b"b")
        self.assertEqual(capture.window, b"a" * 8191 + b"b")
        self.assertEqual(len(capture.pending), 0)

    def test_websocket_sends_lifecycle_and_transcript(self):
        socket = SimpleNamespace(
            accept=AsyncMock(), receive_json=AsyncMock(return_value={"model": "small"}),
            receive_bytes=AsyncMock(side_effect=[b"a" * 8192, b"b" * 8192]),
            send_json=AsyncMock(), close=AsyncMock(),
        )
        with patch("capture.get_speech_timestamps", side_effect=[[{"start": 0, "end": 4096}], []]):
            with patch("app.transcribe_audio", return_value="Xin chào") as transcribe:
                asyncio.run(listen(socket))
        events = [call.args[0] for call in socket.send_json.call_args_list]
        self.assertEqual(events, [{"type": "ready"}, {"type": "speech"}, {"type": "transcribing"}, {"type": "transcript", "text": "Xin chào"}])
        self.assertTrue(transcribe.call_args.args[0].startswith(b"RIFF"))
        socket.close.assert_awaited_once()

    def test_model_mismatch_does_not_open_capture(self):
        socket = SimpleNamespace(accept=AsyncMock(), receive_json=AsyncMock(return_value={"model": "wrong"}), close=AsyncMock())
        with patch("app.SpeechCapture") as capture:
            asyncio.run(listen(socket))
        capture.assert_not_called()
        self.assertEqual(socket.close.call_args.kwargs["code"], 1008)


if __name__ == "__main__":
    unittest.main()
