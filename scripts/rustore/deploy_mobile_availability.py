#!/usr/bin/env python3
"""Install S043's public-only probe on the existing reviewed Timeweb VPS."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import pwd
import subprocess
import sys

BASELINE = "92655c70931c5518683afaef3c8616dd70fad09399be630208745818e92a57ea"
TARGET = Path("/etc/nginx/sites-enabled/api.sintagma-rf.conf")
UNITS = ("sintagma-rustore-public-check.service", "sintagma-rustore-public-check.timer")
LOCATION = '''    # S043: public app availability only; existing CORS allowlist is retained.
    location = /mobile/rustore-availability.json {
        alias /srv/sintagma-mobile/rustore-availability.json;
        default_type application/json;
        add_header Cache-Control "public, max-age=300" always;
        add_header Access-Control-Allow-Origin $cors_origin always;
        add_header Vary Origin always;
        add_header X-Content-Type-Options nosniff always;
    }

'''


def sha(data):
    return hashlib.sha256(data).hexdigest()


def run(*args):
    subprocess.run(args, check=True, timeout=70)


def main():
    if sys.platform != "linux" or os.geteuid() != 0:
        raise RuntimeError("This explicit deployment requires root on the existing Linux VPS")
    stage = Path(__file__).resolve().parent
    manifest = json.loads((stage / "transfer-manifest.json").read_text())
    for name, digest in manifest.items():
        if "/" in name or name not in (*UNITS, "check_rustore_public.py"):
            raise RuntimeError("Unexpected payload file")
        if sha((stage / name).read_bytes()) != digest:
            raise RuntimeError("Payload hash mismatch: " + name)
    source = TARGET.read_bytes()
    if sha(source) != BASELINE:
        raise RuntimeError("Nginx changed since the reviewed baseline; stop without modifying it")
    text = source.decode("utf-8")
    anchor = "    location /sb-api/ {"
    if text.count(anchor) != 1 or "/mobile/" in text or 'map $http_origin $cors_origin {' not in text:
        raise RuntimeError("Unexpected virtual-host structure")
    # The observed baseline has no server-wide add_header directives. Preserve
    # every old byte and add one exact public JSON location inside the same vhost.
    candidate = text.replace(anchor, LOCATION + anchor, 1).encode("utf-8")
    if candidate.replace(LOCATION.encode("utf-8"), b"", 1) != source:
        raise RuntimeError("Unrelated Nginx change")
    user = pwd.getpwnam("www-data")
    code_dir = Path("/opt/sintagma-mobile")
    data_dir = Path("/srv/sintagma-mobile")
    if code_dir.exists() or data_dir.exists() or any((Path('/etc/systemd/system') / u).exists() for u in UNITS):
        raise RuntimeError("Existing installation found; verify state rather than overwriting it")
    run("nginx", "-t")
    backup = Path("/root/sintagma-backups/S043-20261008")
    backup.mkdir(parents=True, exist_ok=True)
    saved = backup / "api.sintagma-rf.conf.bak"
    if saved.exists():
        raise RuntimeError("Existing deployment backup; stop rather than repeat the action")
    saved.write_bytes(source)
    code_dir.mkdir(mode=0o755)
    probe = code_dir / "check_rustore_public.py"
    probe.write_bytes((stage / probe.name).read_bytes())
    probe.chmod(0o644)
    data_dir.mkdir(mode=0o755)
    os.chown(data_dir, user.pw_uid, user.pw_gid)
    for unit in UNITS:
        installed = Path("/etc/systemd/system") / unit
        installed.write_bytes((stage / unit).read_bytes())
        installed.chmod(0o644)
    run("systemd-analyze", "verify", *(str(Path('/etc/systemd/system') / u) for u in UNITS))
    run("systemctl", "daemon-reload")
    run("systemctl", "start", UNITS[0])
    state = json.loads((data_dir / "rustore-availability.json").read_text())
    if state.get("packageName") != "ru.sintagma.app" or state.get("schemaVersion") != 1:
        raise RuntimeError("First probe did not generate the expected JSON")
    try:
        TARGET.write_bytes(candidate)
        run("nginx", "-t")
        run("systemctl", "reload", "nginx")
    except Exception:
        TARGET.write_bytes(source)
        run("nginx", "-t")
        run("systemctl", "reload", "nginx")
        raise
    run("systemctl", "enable", "--now", UNITS[1])
    timer_active = subprocess.check_output(("systemctl", "is-active", UNITS[1]), text=True).strip()
    report = {
        "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "sourceSha256": sha(source), "installedSha256": sha(TARGET.read_bytes()),
        "payloadSha256": manifest, "timer": timer_active, "firstProbe": state,
        "url": "https://api.xn--80aaiswd0ak.xn--p1ai/mobile/rustore-availability.json",
    }
    (backup / "receipt.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
