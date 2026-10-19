"""Build a portable, pure-Python RS256 verification layer. No AWS calls."""
import hashlib
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def build():
    source = ROOT / "shared"
    output = ROOT / ".build" / "auth-layer"
    target = output / "python"
    requirements = source / "requirements.txt"
    digest = hashlib.sha256(requirements.read_bytes()).hexdigest()
    marker = output / "requirements.sha256"
    if not marker.exists() or marker.read_text() != digest:
        if target.exists():
            if not target.resolve().is_relative_to((ROOT / ".build").resolve()):
                raise ValueError("Auth build target must stay inside .build")
            shutil.rmtree(target)
        target.mkdir(parents=True, exist_ok=True)
        subprocess.run([sys.executable, "-m", "pip", "install", "--upgrade", "--only-binary=:all:",
            "--target", str(target), "-r", str(requirements)], check=True)
        marker.write_text(digest)
    shutil.copyfile(source / "cognito_identity.py", target / "cognito_identity.py")
    return output


if __name__ == "__main__":
    print(build())
