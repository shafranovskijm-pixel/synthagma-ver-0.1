#!/usr/bin/env python3
"""Expose the already-returned archive SHA through one existing Nginx location.
Default: inspect only. --apply: root-only CAS, private backup, nginx -t, reload.
No credentials, proxy routes, file hashes or archive permissions are changed.
"""
import argparse
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
import difflib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile

CONFIG = Path('/etc/nginx/sites-enabled/api.sintagma-rf.conf')
ROOT = Path('/etc/nginx')
BACKUPS = Path('/var/backups/sintagma-nginx/archive-hash')
OLD = 'content-range, content-length, x-supabase-api-version, x-sintagma-compiler-revision, x-sintagma-request-id, x-sintagma-register-student-revision'
NEW = OLD + ', x-archive-sha256'

class Conflict(RuntimeError):
    pass

@dataclass(frozen=True)
class Token:
    value: str
    start: int
    end: int
    quote: str = ''

@dataclass
class Directive:
    tokens: list
    children: object = None


def tokens(source):
    """Lex active syntax only. Keep exact offsets for a single insertion."""
    result, index = [], 0
    while index < len(source):
        char = source[index]
        if char.isspace():
            index += 1
            continue
        if char == '#':
            newline = source.find('\n', index)
            index = len(source) if newline < 0 else newline + 1
            continue
        begin = index
        if char in '{};':
            result.append(Token(char, index, index + 1))
            index += 1
            continue
        quote = char if char in "\"'" else ''
        if quote:
            index += 1
            value_start = index
            while index < len(source) and source[index] != quote:
                if source[index] == '\\':
                    index += 1
                index += 1
            if index >= len(source):
                raise ValueError('Unclosed quoted value; no change made')
            result.append(Token(source[value_start:index], begin, index + 1, quote))
            index += 1
            continue
        while index < len(source):
            char = source[index]
            if char == '\\':
                index += 2
            elif source.startswith(chr(36) + '{', index):
                close = source.find('}', index + 2)
                if close < 0:
                    raise ValueError('Unclosed variable; no change made')
                index = close + 1
            elif char.isspace() or char in '{};#':
                break
            elif char in "\"'":
                raise ValueError('Mixed quoted token unsupported; inspect manually')
            else:
                index += 1
        if index == begin:
            raise ValueError('Unsupported syntax; no change made')
        result.append(Token(source[begin:index], begin, index))
    return result


def directives(source):
    stream, index = tokens(source), 0
    def parse(nested):
        nonlocal index
        result, pending = [], []
        while index < len(stream):
            token = stream[index]
            index += 1
            if not token.quote and token.value == '}':
                if pending or not nested:
                    raise ValueError('Unexpected closing brace; no change made')
                return result
            if not token.quote and token.value in (';', '{'):
                if not pending:
                    raise ValueError('Empty directive; no change made')
                children = parse(True) if token.value == '{' else None
                result.append(Directive(pending, children))
                pending = []
            else:
                pending.append(token)
        if pending or nested:
            raise ValueError('Unclosed directive/block; no change made')
        return result
    return parse(False)


def flatten(nodes):
    for node in nodes:
        yield node
        if node.children is not None:
            yield from flatten(node.children)


def patch_config(source):
    nodes = list(flatten(directives(source)))
    locations = [node for node in nodes if node.tokens[0].value == 'location'
                 and any('/sb-functions' in token.value for token in node.tokens[1:])]
    if len(locations) != 1:
        raise ValueError('Expected exactly one active /sb-functions/ location')
    location = locations[0]
    shape = [token.value for token in location.tokens]
    if shape not in (['location', '/sb-functions/'], ['location', '^~', '/sb-functions/']) or location.children is None:
        raise ValueError('Unexpected /sb-functions/ location shape')
    exposes = [node for node in flatten(location.children)
               if node.tokens[0].value == 'add_header' and len(node.tokens) > 1
               and node.tokens[1].value.lower() == 'access-control-expose-headers']
    if len(exposes) != 1 or not any(exposes[0] is node for node in location.children):
        raise ValueError('Expected one direct Expose-Headers declaration')
    declaration = exposes[0].tokens
    if (len(declaration) != 4 or declaration[1].quote or not declaration[2].quote
            or declaration[3].quote or declaration[3].value != 'always'):
        raise ValueError('Expected one quoted Expose-Headers value with always')
    value = declaration[2]
    if value.value == NEW:
        return source
    if value.value != OLD:
        raise ValueError('Unexpected Expose-Headers list; no change made')
    offset = value.end - 1
    return source[:offset] + ', x-archive-sha256' + source[offset:]


@dataclass(frozen=True)
class Snapshot:
    content: bytes
    identity: tuple
    xattrs: tuple
    atime_ns: int


def snapshot(path):
    descriptor = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    try:
        first = os.fstat(descriptor)
        if not stat.S_ISREG(first.st_mode):
            raise ValueError('Configuration must be a regular file')
        pieces = []
        while True:
            piece = os.read(descriptor, 65536)
            if not piece:
                break
            pieces.append(piece)
        attrs = tuple(sorted((name, os.getxattr(descriptor, name)) for name in os.listxattr(descriptor)))
        last = os.fstat(descriptor)
        key = lambda meta: (meta.st_dev, meta.st_ino, meta.st_size, meta.st_mtime_ns,
                            meta.st_ctime_ns, meta.st_uid, meta.st_gid, stat.S_IMODE(meta.st_mode))
        if key(first) != key(last):
            raise Conflict('Configuration changed while being read')
        return Snapshot(b''.join(pieces), key(last), attrs, first.st_atime_ns)
    finally:
        os.close(descriptor)


def same(actual, expected):
    return (actual.content == expected.content and actual.identity == expected.identity
            and actual.xattrs == expected.xattrs)


def resolve_config():
    path = CONFIG.resolve(strict=True)
    if ROOT not in path.parents or not path.is_file():
        raise ValueError('Resolved configuration must be a file inside /etc/nginx')
    return path


def compare_current(path, expected):
    if resolve_config() != path or not same(snapshot(path), expected):
        raise Conflict('Configuration or metadata changed; refusing to overwrite')


@contextmanager
def private_lock():
    BACKUPS.mkdir(parents=True, exist_ok=True, mode=0o700)
    if BACKUPS.resolve(strict=True) != BACKUPS:
        raise ValueError('Backup directory must not contain symlinks')
    metadata = BACKUPS.stat()
    if metadata.st_uid != 0 or stat.S_IMODE(metadata.st_mode) != 0o700:
        raise PermissionError('Backup directory must be root-owned mode 0700')
    descriptor = os.open(BACKUPS / 'patch.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 0 or stat.S_IMODE(metadata.st_mode) != 0o600:
            raise PermissionError('Invalid patch lock file')
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        os.close(descriptor)


def backup_snapshot(original):
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = BACKUPS / ('api.sintagma-rf.conf.archive-sha256.' + stamp + '.bak')
    descriptor = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'wb') as stream:
        stream.write(original.content)
        stream.flush()
        os.fsync(stream.fileno())
    if backup.read_bytes() != original.content:
        raise RuntimeError('Backup readback failed; no change made')
    return backup


def replace_cas(path, expected, content, metadata):
    """Last-moment CAS; retain uid/gid/mode/xattrs/timestamps, replace resolved file.
    External non-cooperating writers can still race a filesystem rename. Every
    rollback also requires an exact snapshot match; never blindly overwrite it.
    """
    # Stage outside Nginx's included directories; an atomic rename requires the
    # private backup/staging directory to be on the same filesystem as the file.
    if BACKUPS.stat().st_dev != expected.identity[0]:
        raise ValueError('Private staging and target are on different filesystems')
    descriptor, temporary_name = tempfile.mkstemp(prefix='.archive-hash-', dir=BACKUPS)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(content)
            stream.flush()
            os.fchown(stream.fileno(), metadata.identity[5], metadata.identity[6])
            os.fchmod(stream.fileno(), metadata.identity[7])
            retained = {name for name, _ in metadata.xattrs}
            for name in os.listxattr(stream.fileno()):
                if name not in retained:
                    os.removexattr(stream.fileno(), name)
            for name, value in metadata.xattrs:
                os.setxattr(stream.fileno(), name, value)
            os.utime(stream.fileno(), ns=(metadata.atime_ns, metadata.identity[3]))
            os.fsync(stream.fileno())
        compare_current(path, expected)
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
        result = snapshot(path)
        if (result.content != content or result.identity[5:] != metadata.identity[5:]
                or result.xattrs != metadata.xattrs):
            raise RuntimeError('Atomic replacement metadata/readback mismatch')
        return result
    finally:
        if temporary.exists():
            temporary.unlink()


def nginx_command(*command):
    result = subprocess.run(command, capture_output=True, text=True, check=False, timeout=30,
                            stdin=subprocess.DEVNULL, env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C'})
    if result.returncode:
        raise RuntimeError(' '.join(command) + ' failed: ' + (result.stderr.strip() or result.stdout.strip()))


def apply_change(path, original, patched):
    compare_current(path, original)
    backup = backup_snapshot(original)
    installed, reload_attempted = None, False
    try:
        installed = replace_cas(path, original, patched, original)
        nginx_command('nginx', '-t')
        compare_current(path, installed)
        reload_attempted = True
        nginx_command('systemctl', 'reload', 'nginx')
        compare_current(path, installed)
    except Exception as failure:
        if installed is None:
            raise RuntimeError('Replacement not confirmed; inspect current file and backup: ' + str(backup)) from failure
        try:
            restored = replace_cas(path, installed, original.content, original)
            nginx_command('nginx', '-t')
            compare_current(path, restored)
            if reload_attempted:
                nginx_command('systemctl', 'reload', 'nginx')
                compare_current(path, restored)
        except Exception as rollback_failure:
            raise RuntimeError('Rollback not confirmed; do not overwrite concurrent changes; backup: '
                               + str(backup) + '; recovery error: ' + str(rollback_failure)) from failure
        raise RuntimeError('Original bytes restored and validation/recovery completed; backup: '
                           + str(backup) + '; original error: ' + str(failure)) from failure
    return backup


def require_expected(original, applying, expected):
    if expected is None:
        if applying:
            raise ValueError('--apply requires reviewed --expected-before-sha256')
        return
    if len(expected) != 64 or any(char not in '0123456789abcdef' for char in expected):
        raise ValueError('Expected SHA-256 must be 64 lowercase hex characters')
    if hashlib.sha256(original.content).hexdigest() != expected:
        raise Conflict('Reviewed configuration SHA-256 no longer matches; no change made')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='CAS, private backup, validate and reload this one config')
    parser.add_argument('--expected-before-sha256', help='Reviewed dry-run beforeSha256; required with --apply')
    args = parser.parse_args()
    if os.name != 'posix':
        raise PermissionError('This patcher is for the existing Linux Nginx host only')
    path = resolve_config()
    original = snapshot(path)
    require_expected(original, args.apply, args.expected_before_sha256)
    source = original.content.decode('utf-8')
    patched = patch_config(source)
    print(json.dumps({'path': str(path), 'beforeSha256': hashlib.sha256(original.content).hexdigest(),
                      'afterSha256': hashlib.sha256(patched.encode('utf-8')).hexdigest(),
                      'changed': patched != source}, sort_keys=True))
    if not args.apply:
        sys.stdout.writelines(difflib.unified_diff(source.splitlines(keepends=True), patched.splitlines(keepends=True),
                                                 fromfile=str(path), tofile=str(path), n=0))
        return
    if os.geteuid() != 0:
        raise PermissionError('--apply requires root')
    with private_lock():
        compare_current(path, original)
        if patched == source:
            nginx_command('nginx', '-t')
            print('Already patched; nginx -t passed; no reload.')
            return
        backup = apply_change(path, original, patched.encode('utf-8'))
        print('Applied; nginx -t and reload passed. Backup: ' + str(backup))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        sys.exit(str(error))
