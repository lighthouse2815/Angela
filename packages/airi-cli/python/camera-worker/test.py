import importlib.util
import io
import json
import math
import threading
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("camera_worker", Path(__file__).with_name("worker.py"))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


def face(**changes):
    points = [[0.0, 0.0, 0.0] for _ in range(70)]
    points[58] = [-0.5, 0.1, 0.0]
    points[62] = [0.5, 0.1, 0.0]
    return SimpleNamespace(conf=0.9, success=True, pnp_error=2, euler=(180, 0, 90), pts_3d=points, **changes)


class WorkerTests(unittest.TestCase):
    def test_absent_face_has_no_pose_or_features(self):
        event = worker.observation([], 1234, {})
        self.assertFalse(event["faceDetected"])
        self.assertNotIn("features", event)
        self.assertNotIn("headPose", event)

    def test_smile_geometry_and_frontal_coordinate_conversion(self):
        event = worker.observation([face()], 1234, {})
        for value in event["headPose"].values():
            self.assertAlmostEqual(value, 0)
        self.assertGreater(event["features"]["smileLike"], 0.65)
        self.assertEqual(event["features"]["mouthOpen"], 0)
        self.assertNotIn("pts_3d", event)
        self.assertNotIn("id", event)

    def test_neutral_and_wraparound_pose(self):
        sample = face()
        sample.pts_3d[58][1] = -0.1
        sample.pts_3d[62][1] = -0.1
        sample.euler = (-179, 35, 88)
        event = worker.observation([sample], 1234, {})
        self.assertLessEqual(event["features"]["smileLike"], 0.25)
        self.assertAlmostEqual(event["headPose"]["yaw"], -35)
        self.assertAlmostEqual(event["headPose"]["pitch"], 1)
        self.assertAlmostEqual(event["headPose"]["roll"], 2)

    def test_equivalent_opencv_euler_representation_is_still_frontal(self):
        sample = face()
        sample.euler = (0, 180, -90)
        event = worker.observation([sample], 1234, {})
        for value in event["headPose"].values():
            self.assertAlmostEqual(value, 0)

    def test_failed_pose_and_degenerate_geometry_stay_unknown(self):
        sample = face()
        sample.success = False
        self.assertNotIn("features", worker.observation([sample], 0, {}))
        sample.success = True
        sample.pts_3d[58] = sample.pts_3d[62]
        self.assertNotIn("features", worker.observation([sample], 0, {}))
        sample.euler = (math.nan, 0, 0)
        self.assertNotIn("headPose", worker.observation([sample], 0, {}))

    def test_latest_capture_overwrites_and_counts_dropped_frames(self):
        stopped = threading.Event()
        values = iter([(True, "old"), (True, "latest"), (False, None)] * 1)
        device = SimpleNamespace(read=lambda: next(values, (False, None)))
        capture = worker.LatestCapture(device, stopped)
        capture.read()
        self.assertTrue(capture.failed)
        self.assertEqual(capture.take(), "latest")
        self.assertIsNone(capture.take())
        self.assertEqual(capture.dropped, 1)
        self.assertEqual(capture.captured, 2)

    def test_source_and_model_diagnostics_without_dependencies(self):
        with TemporaryDirectory() as directory:
            upstream = Path(directory)
            with self.assertRaises(worker.WorkerError) as error:
                worker.dependencies(upstream)
            self.assertEqual(error.exception.code, "source_missing")
            (upstream / "tracker.py").touch()
            with self.assertRaises(worker.WorkerError) as error:
                worker.dependencies(upstream)
            self.assertEqual(error.exception.code, "model_missing")

    def test_dependency_check_never_opens_a_camera(self):
        events = []
        fake_cv = SimpleNamespace(VideoCapture=lambda *_: self.fail("camera accessed"))
        args = SimpleNamespace(upstream=Path("unused"), check=True)
        with patch.object(worker, "dependencies", return_value=(fake_cv, None, None)):
            worker.run(args, events.append, threading.Event())
        self.assertEqual(events, [{"type": "ready"}])

    def test_camera_unavailable_releases_device(self):
        released = []
        device = SimpleNamespace(isOpened=lambda: False, release=lambda: released.append(True))
        fake_cv = SimpleNamespace(VideoCapture=lambda *_: device)
        args = SimpleNamespace(upstream=Path("unused"), check=False, smoke=False, device=0)
        with patch.object(worker, "dependencies", return_value=(fake_cv, None, lambda *_, **__: None)):
            with self.assertRaises(worker.WorkerError) as error:
                worker.run(args, lambda _: None, threading.Event())
        self.assertEqual(error.exception.code, "camera_unavailable")
        self.assertEqual(released, [True])

    def test_main_preserves_jsonl_and_excludes_upstream_prints(self):
        output = io.StringIO()
        args = ["worker.py", "--check"]

        def dependencies(_):
            print("upstream diagnostic")
            raise worker.WorkerError("dependencies_missing")

        with patch.object(worker, "dependencies", side_effect=dependencies), patch("sys.argv", args), redirect_stdout(output):
            self.assertEqual(worker.main(), 1)
        self.assertEqual(json.loads(output.getvalue()), {"type": "error", "code": "dependencies_missing"})


if __name__ == "__main__":
    unittest.main()
