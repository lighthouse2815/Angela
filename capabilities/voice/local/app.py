"""Expose local Vietnamese STT and online Edge TTS through the CLI audio contract."""

import asyncio
import io
import logging
import os
import subprocess
import wave
from functools import lru_cache
from threading import Lock

import edge_tts
from faster_whisper import WhisperModel
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from capture import SpeechCapture

app = FastAPI(docs_url=None, redoc_url=None)
transcription_lock = Lock()
logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def recognizer():
    """Load one CPU model on first use and reuse it for subsequent turns."""
    return WhisperModel(
        os.environ.get("ANGELA_WHISPER_MODEL", "small"),
        device="cpu", compute_type="int8", cpu_threads=2,
    )


@app.get("/health")
def health():
    return {"status": "ok", "stt": "faster-whisper", "tts": "edge-tts"}


def transcribe_audio(audio):
    # Serialize inference to keep CPU and memory bounded on desktop machines.
    with transcription_lock:
        segments, _ = recognizer().transcribe(
            io.BytesIO(audio), language="vi", beam_size=1, vad_filter=True,
        )
        return " ".join(segment.text.strip() for segment in segments).strip()


@app.post("/v1/audio/transcriptions")
async def transcriptions(file: UploadFile = File(...), model: str = Form(...)):
    try:
        audio = await file.read(20 * 1024 * 1024 + 1)
        if len(audio) > 20 * 1024 * 1024:
            raise HTTPException(413, "Audio exceeds 20 MiB")
        if model != os.environ.get("ANGELA_WHISPER_MODEL", "small"):
            raise HTTPException(400, "Model does not match ANGELA_WHISPER_MODEL")
        text = await run_in_threadpool(transcribe_audio, audio)
        return {"text": text}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Transcription failed")
        raise HTTPException(502, "Transcription failed") from None
    finally:
        await file.close()


@app.websocket("/v1/audio/listen")
async def listen(socket: WebSocket):
    """One connection owns one utterance. Disconnect discards its in-memory capture."""
    await socket.accept()
    try:
        async with asyncio.timeout(10):
            config = await socket.receive_json()
        if config.get("model") != os.environ.get("ANGELA_WHISPER_MODEL", "small"):
            await socket.close(code=1008, reason="STT model mismatch")
            return
        capture = await run_in_threadpool(SpeechCapture)
        await socket.send_json({"type": "ready"})
        while True:
            data = await socket.receive_bytes()
            if not data or len(data) > 65536:
                await socket.close(code=1009, reason="Invalid audio frame")
                return
            started = capture.started
            audio = await run_in_threadpool(capture.feed, data)
            if capture.started and not started:
                await socket.send_json({"type": "speech"})
            if audio is None:
                continue
            await socket.send_json({"type": "transcribing"})
            wav = io.BytesIO()
            with wave.open(wav, "wb") as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(16000)
                output.writeframes(audio)
            text = await run_in_threadpool(transcribe_audio, wav.getvalue())
            await socket.send_json({"type": "transcript", "text": text})
            await socket.close()
            return
    except WebSocketDisconnect:
        return
    except Exception:
        logger.exception("Automatic listening failed")
        try:
            await socket.close(code=1011, reason="Automatic listening failed")
        except RuntimeError:
            pass


class Speech(BaseModel):
    input: str = Field(min_length=1, max_length=10000)
    model: str = "edge-tts"
    voice: str = "vi-VN-HoaiMyNeural"
    response_format: str = "wav"


def decode_audio(audio):
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
         "-f", "wav", "-acodec", "pcm_s16le", "pipe:1"],
        input=audio, capture_output=True, check=True, timeout=30,
    )
    return result.stdout


@app.post("/v1/audio/speech")
async def speech(body: Speech):
    if body.response_format != "wav" or body.model != "edge-tts":
        raise HTTPException(400, "Use model edge-tts and response_format wav")
    if body.voice not in {"vi-VN-HoaiMyNeural", "vi-VN-NamMinhNeural"}:
        raise HTTPException(400, "Select a Vietnamese Edge voice")
    try:
        async with asyncio.timeout(90):
            for attempt in range(2):
                chunks = []
                try:
                    async for chunk in edge_tts.Communicate(body.input, body.voice).stream():
                        if chunk["type"] == "audio":
                            chunks.append(chunk["data"])
                    break
                except edge_tts.exceptions.NoAudioReceived:
                    if attempt == 1:
                        raise
                    await asyncio.sleep(0.5)
            audio = await run_in_threadpool(decode_audio, b"".join(chunks))
            return Response(audio, media_type="audio/wav")
    except Exception:
        logger.exception("Speech failed")
        raise HTTPException(502, "Edge speech service unavailable") from None
