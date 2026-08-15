from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from angela.config import Settings
from angela.server import request_is_local


class LocalOnlySecurityTests(unittest.TestCase):
    def test_non_loopback_bind_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            os.environ, {"ANGELA_HOST": "0.0.0.0"}, clear=False
        ):
            with self.assertRaisesRegex(ValueError, "loopback"):
                Settings.from_env(Path(directory))

    def test_host_and_origin_must_both_be_local(self) -> None:
        self.assertTrue(request_is_local("127.0.0.1:8765", None))
        self.assertTrue(
            request_is_local("localhost:8765", "http://localhost:8765")
        )
        self.assertFalse(request_is_local("evil.example", None))
        self.assertFalse(
            request_is_local("127.0.0.1:8765", "https://evil.example")
        )
        self.assertFalse(request_is_local("127.0.0.1:8765", "null"))


if __name__ == "__main__":
    unittest.main()
