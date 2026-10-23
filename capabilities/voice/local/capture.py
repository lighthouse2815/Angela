"""Bounded speech capture using Faster Whisper's bundled Silero ONNX detector."""

import os

import numpy as np
from faster_whisper.vad import VadOptions, get_speech_timestamps, get_vad_model


class SpeechCapture:
    """Keep three seconds of context until speech starts, then retain at most 30 seconds."""

    def __init__(self):
        get_vad_model()
        self.started = False
        self.window = bytearray()
        self.audio = bytearray()
        self.pending = bytearray()
        silence_ms = int(os.environ.get("ANGELA_VOICE_SILENCE_MS", "1200"))
        if not 400 <= silence_ms <= 2000:
            raise ValueError("ANGELA_VOICE_SILENCE_MS must be between 400 and 2000")
        self.silence_samples = (silence_ms - 160) * 16
        self.options = VadOptions(
            min_speech_duration_ms=240, min_silence_duration_ms=silence_ms,
            speech_pad_ms=160,
        )

    def feed(self, data):
        # PCM is mono, signed 16-bit, 16 kHz. Analyze 256 ms at a time.
        self.pending.extend(data)
        while len(self.pending) >= 8192:
            block = self.pending[:8192]
            del self.pending[:8192]
            self.window.extend(block)
            del self.window[:-96000]
            samples = np.frombuffer(self.window, dtype="<i2").astype(np.float32) / 32768
            segments = get_speech_timestamps(samples, vad_options=self.options)
            if self.started:
                self.audio.extend(block)
            elif segments:
                self.started = True
                self.audio.extend(self.window)
            if self.started:
                # Silero pads segment ends by 160 ms. Compare the remaining silence without that padding.
                ended = not segments or len(samples) - segments[-1]["end"] >= self.silence_samples
                if ended or len(self.audio) >= 960000:
                    return bytes(self.audio[:960000])
        return None
