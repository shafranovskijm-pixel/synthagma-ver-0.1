#!/usr/bin/env python3
"""Validate, stage and atomically select a static release. Default: dry run.

No shell execution, package manager, API/DB calls, production-config writes,
release deletion or asset-history pruning. Configuration is operator-controlled.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import uuid

RELEASE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,95}\Z")
HASHED = re.compile(r"(?:assets/(?:[^/]+/)*[^/]+-[A-Za-z0-9_-]{8}\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|svg|webp|avif|gif|ico|wasm)|workbox-[A-Za-z0-9_-]{8}\.js)\Z")
HEX = re.compile(r"[a-f0-9]{64}\Z")
MAX_BYTES = 2 * 1024 ** 3


def digest_file(file):
    result = hashlib.sha256()
    with open(file, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def relative_name(name):
    if not isinstance(name, str) or not name or "\\" in name or ":" in name or any(ord(c) < 32 for c in name):
        raise ValueError("Unsafe archive path")
    parts = name.rstrip("/").split("/")
    if any(part in ("", ".", "..") for part in parts) or PurePosixPath(name).is_absolute():
        raise ValueError("Unsafe archive path")
    return "/".join(parts)


def release_name(name):
    if not isinstance(name, str) or not RELEASE.fullmatch(name) or ".." in name:
        raise ValueError("Invalid release identifier")
    return name


def manifest_entries(manifest):
    if not isinstance(manifest, dict):
        raise ValueError("Manifest must be an object")
    if manifest.get("schemaVersion") != 1:
        raise ValueError("Unsupported manifest schema")
    release_name(manifest.get("releaseId"))
    source = manifest.get("source", {})
    build = manifest.get("build", {})
    if not isinstance(source, dict) or not isinstance(build, dict) or not isinstance(source.get("gitCommit"), str) or not isinstance(build.get("publicSettingsSha256"), str) or not re.fullmatch(r"[a-f0-9]{40}", source["gitCommit"]) or build.get("mode") != "production" or not HEX.fullmatch(build["publicSettingsSha256"]):
        raise ValueError("Manifest requires exact source commit and public production-settings SHA256")
    files = manifest.get("files")
    if not isinstance(files, list) or not files or len(files) > 100000:
        raise ValueError("Invalid manifest file list")
    result = {}
    for item in files:
        if not isinstance(item, dict) or not isinstance(item.get("sha256"), str):
            raise ValueError("Manifest entry must contain a digest string")
        name = relative_name(item.get("path"))
        if name in result or not isinstance(item.get("bytes"), int) or item["bytes"] < 0 or not HEX.fullmatch(item.get("sha256", "")):
            raise ValueError("Duplicate or invalid manifest entry")
        result[name] = item
    if "index.html" not in result or "sw.js" not in result or sum(x["bytes"] for x in result.values()) > MAX_BYTES:
        raise ValueError("Missing entry point/service worker or package exceeds 2 GiB")
    for name, item in result.items():
        if "encoding" in item and (item["encoding"] != "gzip" or item.get("original") not in result or name != item["original"] + ".gz"):
            raise ValueError("Invalid precompressed entry")
    return result


def validate_archive(archive, sha256_file):
    archive, sha256_file = Path(archive), Path(sha256_file)
    if not archive.is_file() or archive.is_symlink() or not sha256_file.is_file() or sha256_file.is_symlink():
        raise ValueError("Archive and checksum must be regular files")
    checksum = sha256_file.read_text(encoding="utf-8").strip().split()
    if len(checksum) != 2 or not HEX.fullmatch(checksum[0]) or checksum[1] != archive.name or digest_file(archive) != checksum[0]:
        raise ValueError("Archive SHA256 or checksum filename mismatch")
    with tarfile.open(archive, "r:gz") as bundle:
        members = bundle.getmembers()
        if len(members) > 110000:
            raise ValueError("Archive has too many members")
        by_name = {}
        for member in members:
            name = relative_name(member.name)
            if name in by_name or not (member.isfile() or member.isdir()) or member.size < 0:
                raise ValueError("Duplicate member, link or special file in archive")
            if name != "manifest.json" and name != "site" and not name.startswith("site/"):
                raise ValueError("Archive member outside allowlisted manifest.json/site paths")
            if name == "site" and not member.isdir():
                raise ValueError("Archive site root must be a directory")
            by_name[name] = member
        metadata = by_name.get("manifest.json")
        if metadata is None or not metadata.isfile() or metadata.size > 20 * 1024 ** 2:
            raise ValueError("Missing or oversized manifest")
        manifest = json.load(bundle.extractfile(metadata))
        expected = manifest_entries(manifest)
        actual = {name[5:] for name, member in by_name.items() if name.startswith("site/") and member.isfile()}
        if actual != set(expected):
            raise ValueError("Archive files differ from manifest")
        for name, entry in expected.items():
            member = by_name["site/" + name]
            if member.size != entry["bytes"]:
                raise ValueError("Manifest size mismatch: " + name)
            result = hashlib.sha256()
            with bundle.extractfile(member) as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    result.update(chunk)
            if result.hexdigest() != entry["sha256"]:
                raise ValueError("Manifest digest mismatch: " + name)
    return manifest


def settings_from_file(file):
    settings = json.loads(Path(file).read_text(encoding="utf-8-sig"))
    raw_root = Path(settings["deploymentRoot"])
    if not raw_root.is_absolute() or raw_root.is_symlink():
        raise ValueError("Deployment root must be an absolute nonsymlink allowlisted path")
    root = raw_root.resolve()
    allowed = settings.get("allowedRoots", [])
    if not allowed or str(root) not in {str(Path(p).resolve()) for p in allowed if Path(p).is_absolute()}:
        raise ValueError("Deployment root is not in the operator allowlist")
    settings["root"] = root
    return settings


def contained(root, file):
    if not file.resolve().is_relative_to(root.resolve()):
        raise ValueError("Target escapes deployment root or is a symlink")
    candidate = file
    while candidate != root:
        if candidate.is_symlink():
            raise ValueError("Symlink in target path")
        if candidate.parent == candidate:
            raise ValueError("Target is outside deployment root")
        candidate = candidate.parent
    return file


def nginx_test(settings):
    subprocess.run([settings["nginxBinary"], "-t", "-c", settings["nginxConfig"]], check=True)


def nginx_reload(settings):
    command = settings["reloadCommand"]
    if not isinstance(command, list) or not command or not all(isinstance(x, str) for x in command):
        raise ValueError("Reload command must be an argument array")
    if command[0] != settings["nginxBinary"] and not (Path(command[0]).name == "systemctl" and command[1:] == ["reload", "nginx"]):
        raise ValueError("Reload executable is not allowlisted nginx/systemctl")
    subprocess.run(command, check=True)


def selected_release(root):
    current = root / "current"
    if not current.exists() and not current.is_symlink():
        return None
    if not current.is_symlink():
        raise ValueError("Existing current must be a managed release symlink")
    target = current.resolve(strict=True)
    if target.parent.parent != (root / "releases").resolve() or target.name != "site":
        raise ValueError("Current link is outside managed releases")
    release_name(target.parent.name)
    return target.parent.name


def verify_site(root, target, manifest):
    expected = manifest_entries(manifest)
    site = contained(root, target / "site")
    actual = set()
    for file in site.rglob("*"):
        contained(root, file)
        if file.is_file():
            actual.add(file.relative_to(site).as_posix())
    if actual != set(expected):
        raise ValueError("Installed files differ from manifest")
    for name, entry in expected.items():
        file = contained(root, site / name)
        if not file.is_file() or file.stat().st_size != entry["bytes"] or digest_file(file) != entry["sha256"]:
            raise ValueError("Installed file differs from manifest: " + name)


def verify_installed(root, release):
    target = contained(root, root / "releases" / release_name(release))
    metadata = contained(root, target / "manifest.json")
    manifest = json.loads(metadata.read_text(encoding="utf-8"))
    if manifest["releaseId"] != release:
        raise ValueError("Installed release identifier differs from manifest")
    verify_site(root, target, manifest)
    return manifest


def stage_release(settings, archive, manifest):
    root = settings["root"]
    releases = contained(root, root / "releases")
    releases.mkdir(parents=True, exist_ok=True)
    destination = contained(root, releases / manifest["releaseId"])
    if destination.exists():
        raise ValueError("Release already exists; retained versions are never overwritten")
    incoming = releases / (".incoming-" + manifest["releaseId"] + "-" + uuid.uuid4().hex)
    incoming.mkdir()
    # Each filename and digest was validated; never use extractall or archive permissions.
    with tarfile.open(archive, "r:gz") as bundle:
        for member in bundle.getmembers():
            name = relative_name(member.name)
            if not (member.isfile() or member.isdir()) or (name != "manifest.json" and name != "site" and not name.startswith("site/")):
                raise ValueError("Archive changed after validation")
            target = contained(root, incoming / name)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with bundle.extractfile(member) as source, open(target, "xb") as output:
                    shutil.copyfileobj(source, output)
                target.chmod(0o644)
    if json.loads((incoming / "manifest.json").read_text(encoding="utf-8")) != manifest:
        raise ValueError("Archive manifest changed after validation")
    verify_site(root, incoming, manifest)
    # Add immutable assets before selecting HTML; reject same name/different bytes.
    history = contained(root, root / "asset-history")
    history.mkdir(exist_ok=True)
    for entry in manifest["files"]:
        name = entry["path"]
        base = name[:-3] if name.endswith(".gz") else name
        if not HASHED.fullmatch(base):
            continue
        source = incoming / "site" / name
        target = contained(root, history / name)
        if target.exists():
            if digest_file(target) != entry["sha256"]:
                raise ValueError("Immutable asset collision: " + name)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_name(target.name + ".incoming-" + uuid.uuid4().hex)
            shutil.copyfile(source, temporary)
            temporary.chmod(0o644)
            os.replace(temporary, target)
    incoming.rename(destination)
    verify_installed(root, manifest["releaseId"])


def point_current(root, release):
    temporary = root / ("current.next-" + uuid.uuid4().hex)
    os.symlink("releases/" + release_name(release) + "/site", temporary, target_is_directory=True)
    os.replace(temporary, root / "current")


def activate(settings, release):
    root = settings["root"]
    previous = selected_release(root)
    if previous == release:
        return {"status": "already_selected", "releaseId": release}
    verify_installed(root, release)
    point_current(root, release)
    try:
        nginx_test(settings)
        nginx_reload(settings)
    except Exception as failure:
        if previous is not None:
            point_current(root, previous)
            try:
                nginx_test(settings)
                nginx_reload(settings)
            except Exception as rollback_failure:
                raise RuntimeError("Current restored to " + previous + "; rollback reload failed: " + str(rollback_failure)) from failure
        else:
            # Only remove the newly selected symlink; release/materials are retained.
            (root / "current").unlink()
        raise RuntimeError("Activation failed; current restored to " + str(previous) + ": " + str(failure)) from failure
    return {"status": "selected_and_reloaded", "releaseId": release, "previousReleaseId": previous}


def render(settings, mode):
    folder = Path(__file__).parent
    root = settings["root"].as_posix()
    mime = settings.get("mimeTypes", "/etc/nginx/mime.types")
    if not re.fullmatch(r"[A-Za-z0-9_./:-]+", root) or not re.fullmatch(r"[A-Za-z0-9_./:-]+", mime):
        raise ValueError("Nginx paths contain unsupported characters")
    locations = (folder / "locations.conf.template").read_text(encoding="utf-8").replace("__ROOT__", root)
    content = (folder / (mode + ".conf.template")).read_text(encoding="utf-8")
    return content.replace("__ROOT__", root).replace("__MIME_TYPES__", mime).replace("__LOCATIONS__", locations)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["deploy", "rollback", "render"])
    parser.add_argument("--settings", required=True)
    parser.add_argument("--archive")
    parser.add_argument("--sha256-file")
    parser.add_argument("--release")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--mode", choices=["preview", "production"], default="preview")
    args = parser.parse_args()
    settings = settings_from_file(args.settings)
    if args.operation == "render":
        if args.apply:
            parser.error("render only prints a config; installing it is a separate action")
        print(render(settings, args.mode))
        return
    root = settings["root"]
    previous = selected_release(root)
    if args.operation == "deploy":
        if not args.archive or not args.sha256_file:
            parser.error("deploy requires --archive and --sha256-file")
        manifest = validate_archive(args.archive, args.sha256_file)
        release = manifest["releaseId"]
        if args.release and args.release != release:
            parser.error("--release differs from archive manifest")
        if (root / "releases" / release).exists():
            raise ValueError("Release already exists; use rollback to select it")
    else:
        release = release_name(args.release)
        manifest = verify_installed(root, release)
    result = {"operation": args.operation, "mode": "apply" if args.apply else "dry-run", "releaseId": release, "previousReleaseId": previous, "gitCommit": manifest["source"]["gitCommit"], "publicSettingsSha256": manifest["build"]["publicSettingsSha256"], "files": len(manifest["files"])}
    if args.apply:
        if os.name != "posix":
            raise ValueError("Activation is supported on Linux; validation/render also run on Windows")
        nginx_test(settings)  # Fail before staging or switching if the existing config is invalid.
        os.umask(0o022)  # New static directories/files must be readable by the nginx worker.
        root.mkdir(parents=True, exist_ok=True)
        if args.operation == "deploy":
            stage_release(settings, args.archive, manifest)
        result.update(activate(settings, release))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, RuntimeError, subprocess.CalledProcessError, tarfile.TarError, json.JSONDecodeError) as error:
        print("ERROR: " + str(error), file=sys.stderr)
        sys.exit(1)
