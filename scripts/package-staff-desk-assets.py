"""Package only the static campus assets and desk primitives; no DB or uploads."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    *[f"frontend/public/assets/staff-campus/{name}.webp" for name in (
        "campus-mobile-480", "campus-mobile-960", "campus-workspace-480",
        "campus-workspace-960", "campus-workspace-1536")],
    "frontend/public/fonts/chill-reunion/ChillReunion-Round.woff2",
    "frontend/public/fonts/chill-reunion/OFL.txt",
    "frontend/public/fonts/chill-reunion/README.md",
    "frontend/src/components/StaffPixelIcon.jsx",
    "frontend/src/pages/mentor/desk.css",
]

def package(destination):
    destination = Path(destination).resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    for name in FILES:
        source = ROOT / name
        if not source.is_file() or source.is_symlink() or not source.resolve().is_relative_to(ROOT):
            raise ValueError(f"Invalid static asset: {name}")
        data = source.read_bytes()
        rows.append({"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    with ZipFile(destination, "x", compression=ZIP_DEFLATED) as archive:
        for row in rows:
            archive.write(ROOT / row["path"], row["path"])
        archive.writestr("manifest.json", json.dumps({"format": "staff-desk-static-assets-v1", "files": rows}, ensure_ascii=False, indent=2))
        archive.writestr("README.txt", "Static campus assets and desk primitives only. Normal code/build release already includes these files. No database import is needed. Do not blindly overwrite a live deployment. No scene animation, account, teaching database, or uploaded student file is included. Font license: OFL.txt. JSX/CSS require the matching repository and dependencies.\n")
    with ZipFile(destination) as archive:
        assert archive.testzip() is None
        for row in rows:
            assert hashlib.sha256(archive.read(row["path"])).hexdigest() == row["sha256"]
    return {"archive": str(destination), "files": len(rows), "verified": True, "sha256": hashlib.sha256(destination.read_bytes()).hexdigest()}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    print(json.dumps(package(parser.parse_args().output), ensure_ascii=True))
