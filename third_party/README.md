# Vendored sources

## OpenSeeFace

- Upstream: <https://github.com/emilianavt/OpenSeeFace>
- Revision: `50c09741897010faad721a218b2bbe14ecad6251` (`master`, imported 2026-10-17).
- Import: `git subtree add --prefix=third_party/openseeface --squash <upstream> master`.
- License: BSD-2-Clause. Keep `openseeface/LICENSE`, `Licenses/`, and all embedded copyright and model notices.
- The imported tree is unchanged. Angela owns its adapter in `packages/airi-cli/python/camera-worker/`.

The worker uses `tracker.py`, `retinaface.py`, `similaritytransform.py`, and `remedian.py`.
Model type 3 uses `lm_model3_opt.onnx` and `mnv3_detection_opt.onnx`.
The tracker also initializes RetinaFace sessions and requires `retinaface_640x640_opt.onnx` and `priorbox_640x640.json`.
Gaze tracking is disabled, but the tracker still loads `mnv3_gaze32_split_opt.onnx` during initialization.
Keep the complete upstream tree for provenance and future subtree updates.

Upstream pins Python 3.9 and its runtime dependencies in `pyproject.toml` and `uv.lock`.
Use that environment for the Angela worker. Do not install training dependencies from `Source/`.

To update, use `git subtree pull --prefix=third_party/openseeface --squash <upstream> master`.
Then update this revision and run the camera tests before release.
