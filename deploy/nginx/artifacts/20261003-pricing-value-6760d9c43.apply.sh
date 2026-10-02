#!/usr/bin/env sh
set -eu

# Root fills both placeholders before publishing this helper with the archive.
delivery_commit=${1:?Pass the verified full delivery commit}
case "$delivery_commit" in ''|*[!0-9a-f]*) exit 2 ;; esac
test "${#delivery_commit}" -eq 40
root=/srv/sintagma-preview
release=20261003-pricing-value-6760d9c43
archive_hash=4e0746a3bb0923e7372632a8a60869671d9179df7ce58909f338da62d96fc3f5
prior_release=20261002-start100-770fe7efb
settings="$root/preview-settings.json"
deployer_hash=ae224f63c92c6e4b9280db75a0f60971013be4e1ca5f3e01af747869b0109f0c
source_base="https://raw.githubusercontent.com/shafranovskijm-pixel/synthagma-ver-0.1/$delivery_commit/deploy/nginx"
case "$release" in ''|20261003-pricing-value-6760d9c43|*[!A-Za-z0-9._-]*|.*|*..*) exit 2 ;; esac
case "$archive_hash" in ''|*[!0-9a-f]*) exit 2 ;; esac
test "${#archive_hash}" -eq 64
test -f "$settings"
test ! -L "$settings"
test -L "$root/current"

# Read-only guard: configuration, PID, command and shared temp ownership must
# match the repaired two-instance setup. This never chowns/chmods or starts Nginx.
guard_runtime() {
  python3 - "$settings" <<'PY'
import hashlib, json, os, pathlib, pwd, re, stat, subprocess, sys

def require(condition, message):
    if not condition:
        raise SystemExit(message)

root = pathlib.Path('/srv/sintagma-preview')
config = root / 'nginx-preview.conf'
pid_file = root / 'run/nginx.pid'
require(os.geteuid() == 0, 'Expected the existing root console')
require(root.is_dir() and not root.is_symlink(), 'Unexpected preview root')
settings = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
require(settings['deploymentRoot'] == str(root), 'Unexpected deployment root')
require(settings['allowedRoots'] == [str(root)], 'Unexpected allowed roots')
require(settings['nginxBinary'] == '/usr/sbin/nginx', 'Unexpected Nginx binary')
require(settings['nginxConfig'] == str(config), 'Unexpected Nginx config')
require(settings['reloadCommand'] == ['/usr/sbin/nginx', '-s', 'reload', '-c', str(config)], 'Unexpected reload command')
require(config.is_file() and not config.is_symlink(), 'Unexpected preview config file')
config_bytes = config.read_bytes()
config_text = config_bytes.decode('utf-8')
require(re.findall(r'^\s*user\s+([^;]+);', config_text, re.M) == ['www-data'], 'Preview must retain user www-data')
require(re.findall(r'^\s*pid\s+([^;]+);', config_text, re.M) == [str(pid_file)], 'Unexpected preview PID directive')
require(re.search(r'^\s*listen\s+127\.0\.0\.1:8088\s*;', config_text, re.M), 'Expected existing localhost preview listener')
require((root / 'run').is_dir() and not (root / 'run').is_symlink(), 'Unexpected preview run directory')
require(pid_file.is_file() and not pid_file.is_symlink(), 'Unexpected preview PID file')
pid_text = pid_file.read_text().strip()
require(pid_text.isdecimal() and int(pid_text) > 1, 'Invalid preview PID')
pid = int(pid_text)
process_root = pathlib.Path(f'/proc/{pid}')
require(process_root.stat().st_uid == 0, 'Preview master must be root')
command = (process_root / 'cmdline').read_bytes().replace(b'\0', b' ').decode().strip()
expected_command = 'nginx: master process /usr/sbin/nginx -c ' + str(config)
require(command == expected_command, 'PID file does not identify the expected preview master command')
rows = subprocess.check_output(['ps', '-eo', 'pid,args'], text=True).splitlines()
system_masters = []
for row in rows:
    parts = row.strip().split(None, 1)
    if len(parts) == 2 and parts[1].startswith('nginx: master process /usr/sbin/nginx') and str(config) not in parts[1]:
        system_masters.append(int(parts[0]))
require(len(system_masters) == 1 and pid not in system_masters, 'Expected a distinct unchanged system master')
account = pwd.getpwnam('www-data')
require(account.pw_uid == 33, 'Unexpected www-data UID')
temp_root = pathlib.Path('/var/lib/nginx')
require(temp_root.is_dir() and not temp_root.is_symlink(), 'Unexpected shared temp root')
proxy_root = temp_root / 'proxy'
require(proxy_root.is_dir() and not proxy_root.is_symlink(), 'Unexpected proxy temp directory')
temp_directories = []
for path in sorted(temp_root.iterdir()):
    require(not path.is_symlink(), 'Unexpected symlink in shared temp roots')
    if path.is_dir():
        metadata = path.stat()
        mode = stat.S_IMODE(metadata.st_mode)
        require(metadata.st_uid == account.pw_uid and mode == 0o700, 'Shared temp ownership/mode changed: ' + str(path))
        temp_directories.append({'path': str(path), 'uid': metadata.st_uid, 'gid': metadata.st_gid, 'mode': mode})
print(json.dumps({'previewMasterPid': pid, 'previewCommand': command, 'systemMasterPids': system_masters,
                 'configSha256': hashlib.sha256(config_bytes).hexdigest(), 'temporaryRoots': temp_directories}))
PY
}

runtime_before=$(guard_runtime)
current=$(readlink -f "$root/current")
if [ "$current" = "$root/releases/$release/site" ]; then
  printf 'Release already selected: %s\n' "$release"
  exit 0
fi
[ "$current" = "$root/releases/$prior_release/site" ] || {
  printf 'Current release changed; stop for review: %s\n' "$current" >&2
  exit 3
}
curl --fail --silent --show-error --max-time 15 http://127.0.0.1:8088/ -o /dev/null

test -d "$root/incoming"
test ! -L "$root/incoming"
delivery_dir="$root/incoming/$release"
if [ -e "$delivery_dir" ] || [ -L "$delivery_dir" ]; then
  test -d "$delivery_dir"
  test ! -L "$delivery_dir"
else
  mkdir "$delivery_dir"
fi
for file in runtime-before.json runtime-after.json dry-run.json deploy-receipt.json; do
  test ! -L "$delivery_dir/$file"
done
printf '%s\n' "$runtime_before" > "$delivery_dir/runtime-before.json"
for file in "$release.tar.gz" "$release.tar.gz.sha256"; do
  if [ -e "$delivery_dir/$file" ] || [ -L "$delivery_dir/$file" ]; then
    test -f "$delivery_dir/$file" && test ! -L "$delivery_dir/$file"
  else
    curl --fail --silent --show-error --location --connect-timeout 15 --max-time 240 "$source_base/artifacts/$file" -o "$delivery_dir/$file"
  fi
done
if [ -e "$delivery_dir/deploy.py" ] || [ -L "$delivery_dir/deploy.py" ]; then
  test -f "$delivery_dir/deploy.py" && test ! -L "$delivery_dir/deploy.py"
else
  curl --fail --silent --show-error --location --connect-timeout 15 --max-time 120 "$source_base/deploy.py" -o "$delivery_dir/deploy.py"
fi
printf '%s  %s\n' "$archive_hash" "$delivery_dir/$release.tar.gz" | sha256sum --check -
printf '%s  %s\n' "$deployer_hash" "$delivery_dir/deploy.py" | sha256sum --check -

python3 "$delivery_dir/deploy.py" deploy --settings "$settings" --archive "$delivery_dir/$release.tar.gz" --sha256-file "$delivery_dir/$release.tar.gz.sha256" --release "$release" > "$delivery_dir/dry-run.json"
cat "$delivery_dir/dry-run.json"
# Recheck the exact live master immediately before deploy.py tests/reloads it.
runtime_now=$(guard_runtime)
test "$runtime_now" = "$runtime_before"
test "$(readlink -f "$root/current")" = "$root/releases/$prior_release/site"
python3 "$delivery_dir/deploy.py" deploy --settings "$settings" --archive "$delivery_dir/$release.tar.gz" --sha256-file "$delivery_dir/$release.tar.gz.sha256" --release "$release" --apply > "$delivery_dir/deploy-receipt.json"
cat "$delivery_dir/deploy-receipt.json"
guard_runtime > "$delivery_dir/runtime-after.json"
python3 - "$delivery_dir/runtime-before.json" "$delivery_dir/runtime-after.json" <<'PY'
import json, pathlib, sys
before, after = [json.loads(pathlib.Path(path).read_text()) for path in sys.argv[1:]]
if before != after:
    raise SystemExit('Preview/system master, config, or shared temp metadata changed; inspect runtime receipt')
PY
test "$(readlink -f "$root/current")" = "$root/releases/$release/site"
curl --fail --silent --show-error --max-time 15 -I http://127.0.0.1:8088/admin
curl --fail --silent --show-error --max-time 15 -I http://127.0.0.1:8088/sw.js
printf 'S039 preview release selected: %s\n' "$release"
