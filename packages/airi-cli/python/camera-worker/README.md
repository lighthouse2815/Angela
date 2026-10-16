# Local camera worker

This worker owns camera capture and OpenSeeFace inference. It emits derived JSONL events through stdout.
Upstream diagnostics go to stderr. Frames remain in memory and never enter files, network requests, or the protocol.

From the repository root, create Angela's pinned CPU environment:

```sh
uv sync --locked --project packages/airi-cli/python/camera-worker
packages/airi-cli/python/camera-worker/.venv/bin/python packages/airi-cli/python/camera-worker/worker.py --check
packages/airi-cli/python/camera-worker/.venv/bin/python packages/airi-cli/python/camera-worker/worker.py --smoke
```

`--check` imports dependencies and checks required files without opening a camera.
`--smoke` loads real models and processes one synthetic black frame without opening a camera.
For Windows, use `.venv/Scripts/python.exe`.

For an explicit live camera test, run:

```sh
packages/airi-cli/python/camera-worker/.venv/bin/python packages/airi-cli/python/camera-worker/worker.py --device 0 --fps 10
```

Stop with Ctrl+C. The worker releases the device on exit.
Capture uses one replaceable frame slot. Inference runs at most ten times per second by default.
An unavailable device reports `camera_unavailable`. Check device permissions and whether another application owns the camera.

Run hardware-free tests with the system Python:

```sh
python3 -m unittest discover -s packages/airi-cli/python/camera-worker -p test.py
```

`face_observation` contains timestamp, presence, tracker confidence, optional pose/features, and sampling metrics.
`ready` follows the first successful capture/inference. `error` contains a bounded diagnostic code.
Missing pose or features means unknown. Failed 3D fitting never becomes a neutral cue.
Pose conversion accounts for OpenSeeFace's row/column coordinates and equivalent frontal Euler representations.
Smile-like geometry uses mouth-corner lift relative to mouth width. It does not identify a person or infer feelings.

The runtime uses Python 3.11, NumPy 1.26.4, ONNX Runtime CPU 1.23.2, and headless OpenCV 4.11.0.86.
The complete dependency graph and hashes are in `uv.lock`.
Upstream's ONNX Runtime 1.9 wheel requires an executable stack and fails on the development kernel.
Angela uses a separate runtime instead of changing the upstream source or weakening kernel protections.
Pillow and training libraries are not required by this worker.
