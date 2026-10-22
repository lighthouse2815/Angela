"""Hardware-free JSONL fixture process. The production worker does not load fixtures."""

import json
import sys
import time
from pathlib import Path

fixture = json.loads(Path(__file__).with_name("smile-screen.json").read_text())
end = int(time.time() * 1000)
print(json.dumps({"type": "ready"}), flush=True)
for index in range(fixture["samples"]):
    timestamp = end - (fixture["samples"] - 1 - index) * fixture["intervalMs"]
    print(json.dumps({**fixture["observation"], "timestamp": timestamp}), flush=True)
sys.stdin.read()
