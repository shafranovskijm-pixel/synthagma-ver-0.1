#!/usr/bin/env python3
"""S040: expose the existing registration revision through the production proxy.

Default: inspect and print the proposed header change. Run with --apply as root
on the existing Nginx server to back up, validate and reload this one change.
"""

import argparse
import difflib
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from datetime import datetime, timezone


CONFIG = Path("/etc/nginx/sites-enabled/api.sintagma-rf.conf")
REVISION_HEADER = "x-sintagma-register-student-revision"
EXISTING_HEADERS = [
    "content-range", "content-length", "x-supabase-api-version",
    "x-sintagma-compiler-revision", "x-sintagma-request-id",
]


def block_end(source, opening):
    """Find this location's closing brace without treating strings as syntax."""
    depth, quote, escaped, comment = 0, None, False, False
    for offset in range(opening, len(source)):
        char = source[offset]
        if comment:
            comment = char != "\n"
            continue
        if escaped:
            escaped = False
            continue
        if char == "\\":
            escaped = True
        elif quote:
            if char == quote:
                quote = None
        elif char in "\"'":
            quote = char
        elif char == "#":
            comment = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return offset
    raise ValueError("Unclosed /sb-functions/ location; no change made")


def patch_config(source):
    locations = list(re.finditer(
        r"(?m)^[ \t]*location\s+(?:\^~\s+)?/sb-functions/?\s*\{", source,
    ))
    if len(locations) != 1:
        raise ValueError("Expected exactly one /sb-functions/ location; no change made")
    start = locations[0].end()
    end = block_end(source, start - 1)
    block = source[start:end]
    declarations = list(re.finditer(
        r"(?im)^[ \t]*add_header\s+Access-Control-Expose-Headers\b", block,
    ))
    matches = list(re.finditer(
        r"(?im)^[ \t]*add_header\s+Access-Control-Expose-Headers\s+"
        r"(?P<quote>[\"'])(?P<headers>[^\"'\r\n]*)(?P=quote)\s+always\s*;",
        block,
    ))
    if len(declarations) != 1 or len(matches) != 1:
        raise ValueError("Expected one quoted Expose-Headers directive with always; no change made")
    match = matches[0]
    headers = [value.strip().lower() for value in match.group("headers").split(",")]
    if headers == EXISTING_HEADERS + [REVISION_HEADER]:
        return source
    if headers != EXISTING_HEADERS:
        raise ValueError("Unexpected Expose-Headers list; inspect the live configuration first")
    insertion = start + match.end("headers")
    return source[:insertion] + ", " + REVISION_HEADER + source[insertion:]


def nginx_command(*command):
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode:
        raise RuntimeError(f"{' '.join(command)} failed: {result.stderr.strip() or result.stdout.strip()}")


def replace_config(path, content, metadata):
    """Atomically replace the resolved file, retaining ownership and permissions."""
    descriptor, temporary = tempfile.mkstemp(prefix=".s040-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fchown(stream.fileno(), metadata.st_uid, metadata.st_gid)
            os.fchmod(stream.fileno(), stat.S_IMODE(metadata.st_mode))
            os.fsync(stream.fileno())
        shutil.copystat(path, temporary)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Back up, validate and reload Nginx")
    args = parser.parse_args()
    path = CONFIG.resolve(strict=True)
    if Path("/etc/nginx") not in path.parents or not path.is_file():
        raise ValueError("The resolved configuration must be a regular file inside /etc/nginx")
    original = path.read_bytes()
    source = original.decode("utf-8")
    patched = patch_config(source)
    if not args.apply:
        print("Already patched; no changes." if patched == source else "Dry run; no changes:")
        sys.stdout.writelines(difflib.unified_diff(
            source.splitlines(keepends=True), patched.splitlines(keepends=True),
            fromfile=str(path), tofile=str(path), n=0,
        ))
        return
    if os.name != "posix" or os.geteuid() != 0:
        raise PermissionError("--apply must run as root on the Nginx server")
    if patched == source:
        nginx_command("nginx", "-t")
        print("Already patched; nginx -t passed; no reload needed.")
        return
    metadata = path.stat()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    # Keep backups outside sites-enabled/conf.d: Nginx may include every file there.
    backup_dir = Path("/var/backups/sintagma-nginx")
    backup_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    backup = backup_dir / (path.name + ".s040-" + stamp + ".bak")
    if path.read_bytes() != original:
        raise RuntimeError("Configuration changed during inspection; no change made")
    shutil.copy2(path, backup)
    os.chown(backup, metadata.st_uid, metadata.st_gid)
    reload_attempted = False
    try:
        replace_config(path, patched.encode("utf-8"), metadata)
        nginx_command("nginx", "-t")
        reload_attempted = True
        nginx_command("systemctl", "reload", "nginx")
    except Exception as failure:
        replace_config(path, original, metadata)
        try:
            nginx_command("nginx", "-t")
            if reload_attempted:
                nginx_command("systemctl", "reload", "nginx")
        except Exception as rollback_failure:
            raise RuntimeError(f"Original file restored; recovery validation/reload failed: {rollback_failure}; backup: {backup}") from failure
        raise RuntimeError(f"Original file restored after failure: {failure}; backup: {backup}") from failure
    print(f"Applied; nginx -t and reload passed. Backup: {backup}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError) as error:
        sys.exit(str(error))
