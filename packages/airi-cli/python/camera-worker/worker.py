"""Local capture -> OpenSeeFace -> derived JSONL. No images leave this process."""

import argparse
import contextlib
import json
import math
import signal
import sys
import threading
import time
from pathlib import Path


def observation(faces, timestamp, metrics):
    """Strip tracker identity and landmarks at the process boundary."""
    result = {
        "type": "face_observation", "timestamp": timestamp,
        "faceDetected": bool(faces), "confidence": 0.0, "metrics": metrics,
    }
    if not faces:
        return result
    face = faces[0]
    result["confidence"] = min(1.0, max(0.0, float(face.conf)))
    if not face.success or face.pnp_error > 30:
        return result

    # OpenSeeFace landmarks use (row, column), and its canonical face has Y up.
    # A frontal face has raw Euler (180, 0, 90), equivalently (0, 180, -90).
    # See tracker.py: landmarks(), face_3d, and estimate_depth().
    if not all(math.isfinite(float(value)) for value in face.euler):
        return result
    x, y, z = [math.radians(float(value)) for value in face.euler]
    # Decompose R_front.T @ R, not offsets of Euler angles. This handles both
    # equivalent OpenCV representations without classifying frontal faces as away.
    cy = math.cos(y)
    pose = {
        "yaw": math.degrees(math.asin(-math.sin(y))),
        "pitch": math.degrees(math.atan2(-math.sin(x) * cy, -math.cos(x) * cy)),
        "roll": math.degrees(math.atan2(cy * math.cos(z), cy * math.sin(z))),
    }
    if all(math.isfinite(value) for value in pose.values()):
        result["headPose"] = pose

    points = face.pts_3d
    left, right = points[58], points[62]
    width = math.dist(left[:2], right[:2])
    if width > 0.000001:
        upper = sum(float(points[index][1]) for index in (49, 50, 51)) / 3
        corners = (float(left[1]) + float(right[1])) / 2
        # Dimensionless mouth-corner lift. The heuristic is a visible cue, not emotion.
        # Upstream's canonical neutral mouth has a lift ratio near -0.125.
        # Corners near the upper-lip line produce a smile-like score near 0.67.
        smile = ((corners - upper) / width + 0.12) / 0.18
        opening = abs(sum(float(points[index][1]) for index in (59, 60, 61))
                      - sum(float(points[index][1]) for index in (63, 64, 65))) / (3 * width)
        if math.isfinite(smile) and math.isfinite(opening):
            result["features"] = {"smileLike": min(1.0, max(0.0, smile)), "mouthOpen": min(1.0, opening)}
    return result


class LatestCapture:
    """Own one frame slot. Capture replaces old frames instead of queuing them."""

    def __init__(self, device, stopped):
        self.device = device
        self.stopped = stopped
        self.lock = threading.Lock()
        self.frame = None
        self.captured = 0
        self.dropped = 0
        self.failed = False
        self.thread = threading.Thread(target=self.read, daemon=True)

    def read(self):
        failures = 0
        while not self.stopped.is_set():
            ok, frame = self.device.read()
            if not ok:
                failures += 1
                if failures >= 3:
                    self.failed = True
                    return
                self.stopped.wait(0.05)
                continue
            failures = 0
            with self.lock:
                if self.frame is not None:
                    self.dropped += 1
                self.frame = frame
                self.captured += 1

    def take(self):
        with self.lock:
            frame, self.frame = self.frame, None
            return frame


class WorkerError(Exception):
    def __init__(self, code):
        self.code = code


def dependencies(upstream):
    if not (upstream / "tracker.py").is_file():
        raise WorkerError("source_missing")
    models = upstream / "models"
    for name in ("lm_model3_opt.onnx", "mnv3_detection_opt.onnx", "mnv3_gaze32_split_opt.onnx",
                 "retinaface_640x640_opt.onnx", "priorbox_640x640.json"):
        if not (models / name).is_file():
            raise WorkerError("model_missing")
    sys.path.insert(0, str(upstream))
    try:
        import cv2
        import numpy
        import onnxruntime
        from tracker import Tracker
    except (ImportError, OSError):
        raise WorkerError("dependencies_missing") from None
    return cv2, numpy, Tracker


def run(args, emit, stopped):
    # Upstream prints go to stderr. Only emit() owns the original stdout stream.
    with contextlib.redirect_stdout(sys.stderr):
        cv2, numpy, tracker_type = dependencies(args.upstream)
        if args.check:
            emit({"type": "ready"})
            return
        try:
            tracker = tracker_type(640, 480, max_faces=1, max_threads=2, model_type=3,
                                   model_dir=str(args.upstream / "models"), silent=True,
                                   no_gaze=True, static_model=True)
        except Exception:
            raise WorkerError("model_load_failed") from None
        if args.smoke:
            faces = tracker.predict(numpy.zeros((480, 640, 3), dtype=numpy.uint8))
            emit(observation(faces, int(time.time() * 1000), {"captureFps": 0, "processedFps": 0, "latencyMs": 0, "droppedFrames": 0}))
            return
        device = cv2.VideoCapture(args.device)
        capture = None
        try:
            if not device.isOpened():
                raise WorkerError("camera_unavailable")
            device.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            device.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            device.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            capture = LatestCapture(device, stopped)
            capture.thread.start()
            started = time.monotonic()
            processed = 0
            ready = False
            while not stopped.is_set():
                tick = time.monotonic()
                if capture.failed:
                    raise WorkerError("camera_disconnected")
                frame = capture.take()
                if frame is None:
                    stopped.wait(0.01)
                    continue
                # Fixed inference dimensions keep pose intrinsics consistent across devices.
                frame = cv2.resize(frame, (640, 480))
                try:
                    faces = tracker.predict(frame)
                except Exception:
                    raise WorkerError("tracking_failed") from None
                if stopped.is_set():
                    break
                processed += 1
                elapsed = max(time.monotonic() - started, 0.001)
                metrics = {"captureFps": capture.captured / elapsed, "processedFps": processed / elapsed,
                           "latencyMs": (time.monotonic() - tick) * 1000, "droppedFrames": capture.dropped}
                if not ready:
                    emit({"type": "ready"})
                    ready = True
                emit(observation(faces, int(time.time() * 1000), metrics))
                stopped.wait(max(0, 1 / args.fps - (time.monotonic() - tick)))
        finally:
            stopped.set()
            device.release()
            if capture:
                capture.thread.join(timeout=1)


def main():
    """CLI -> run -> LatestCapture / Tracker -> observation -> JSONL stdout."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upstream", type=Path, default=Path(__file__).resolve().parents[4] / "third_party" / "openseeface")
    parser.add_argument("--device", type=int, default=0)
    parser.add_argument("--fps", type=float, default=10)
    parser.add_argument("--check", action="store_true", help="Check dependencies and model files without accessing a camera")
    parser.add_argument("--smoke", action="store_true", help="Run real model inference on a synthetic black frame without a camera")
    args = parser.parse_args()
    if not 1 <= args.fps <= 30 or args.device < 0:
        parser.error("fps must be 1..30 and device must be nonnegative")
    output = sys.stdout

    def emit(event):
        output.write(json.dumps(event, allow_nan=False, separators=(",", ":")) + "\n")
        output.flush()

    stopped = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stopped.set())
    signal.signal(signal.SIGINT, lambda *_: stopped.set())
    try:
        run(args, emit, stopped)
        return 0
    except WorkerError as error:
        emit({"type": "error", "code": error.code})
    except (BrokenPipeError, KeyboardInterrupt):
        return 0
    except Exception:
        # Do not include device paths, frames, landmarks, or unbounded library output.
        emit({"type": "error", "code": "worker_failed"})
    return 1


if __name__ == "__main__":
    sys.exit(main())
