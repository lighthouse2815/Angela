from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent


def load_dotenv(path: Path) -> None:
    """Load a tiny .env file without adding a dependency."""
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, value)


@dataclass(frozen=True, slots=True)
class Settings:
    root_dir: Path
    data_dir: Path
    database_path: Path
    static_dir: Path
    host: str
    port: int
    llm_base_url: str
    llm_model: str
    llm_api_key: str
    llm_timeout_seconds: int
    context_messages: int
    memory_limit: int

    @classmethod
    def from_env(cls, root_dir: Path | None = None) -> "Settings":
        root = (root_dir or ROOT_DIR).resolve()
        load_dotenv(root / ".env")
        data_dir = Path(os.getenv("ANGELA_DATA_DIR", str(root / "data"))).resolve()
        host = os.getenv("ANGELA_HOST", "127.0.0.1").strip()
        if host.casefold() not in {"127.0.0.1", "localhost", "::1"}:
            raise ValueError(
                "Angela MVP chỉ cho phép địa chỉ loopback (127.0.0.1, localhost hoặc ::1)."
            )
        return cls(
            root_dir=root,
            data_dir=data_dir,
            database_path=Path(
                os.getenv("ANGELA_DATABASE_PATH", str(data_dir / "angela.db"))
            ).resolve(),
            static_dir=root / "angela" / "static",
            host=host,
            port=int(os.getenv("ANGELA_PORT", "8765")),
            llm_base_url=os.getenv(
                "ANGELA_LLM_BASE_URL", "http://127.0.0.1:8080/v1"
            ).rstrip("/"),
            llm_model=os.getenv("ANGELA_LLM_MODEL", "qwen3-4b"),
            llm_api_key=os.getenv("ANGELA_LLM_API_KEY", ""),
            llm_timeout_seconds=int(
                os.getenv("ANGELA_LLM_TIMEOUT_SECONDS", "180")
            ),
            context_messages=max(
                4, min(24, int(os.getenv("ANGELA_CONTEXT_MESSAGES", "10")))
            ),
            memory_limit=max(
                3, min(12, int(os.getenv("ANGELA_MEMORY_LIMIT", "3")))
            ),
        )
