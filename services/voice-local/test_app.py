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

from app import Speech, speech, transcriptions


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


if __name__ == "__main__":
    unittest.main()
