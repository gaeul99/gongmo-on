# pytest 설정 — `app` 패키지를 import 경로에 넣는다.
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
