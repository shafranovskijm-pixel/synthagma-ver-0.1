#!/usr/bin/env sh
set -eu

delivery_commit=${1:?Pass the verified delivery commit}
case "$delivery_commit" in
  ''|*[!0-9a-f]*) exit 2 ;;
esac
test "${#delivery_commit}" -eq 40
root=/srv/sintagma-preview
release=20261002-start100-770fe7efb
settings="$root/preview-settings.json"
archive_hash=36551b2512d87774452f9d70ecde9d763807cbc0c6da0132d14728a921de811f
deployer_hash=ae224f63c92c6e4b9280db75a0f60971013be4e1ca5f3e01af747869b0109f0c
source_base="https://raw.githubusercontent.com/shafranovskijm-pixel/synthagma-ver-0.1/$delivery_commit/deploy/nginx"

test -f "$settings"
test -L "$root/current"
python3 - "$settings" <<'PY'
import json, sys
settings = json.load(open(sys.argv[1], encoding='utf-8'))
root = '/srv/sintagma-preview'
config = root + '/nginx-preview.conf'
assert settings['deploymentRoot'] == root, 'Unexpected deployment root'
assert settings['allowedRoots'] == [root], 'Unexpected allowed roots'
assert settings['nginxBinary'] == '/usr/sbin/nginx', 'Unexpected nginx binary'
assert settings['nginxConfig'] == config, 'Unexpected nginx config'
assert settings['reloadCommand'] == ['/usr/sbin/nginx', '-s', 'reload', '-c', config], 'Unexpected reload command'
PY

current=$(readlink -f "$root/current")
if [ "$current" = "$root/releases/$release/site" ]; then
  printf 'Release already selected: %s\n' "$release"
  exit 0
fi
[ "$current" = "$root/releases/20261001-bae7226/site" ] || {
  printf 'Current release changed; stop for review: %s\n' "$current" >&2
  exit 3
}
curl --fail --silent --show-error --max-time 15 http://127.0.0.1:8088/ -o /dev/null

delivery_dir="$root/incoming/$release"
mkdir -p "$delivery_dir"
for file in "$release.tar.gz" "$release.tar.gz.sha256"; do
  if [ -e "$delivery_dir/$file" ]; then
    test -f "$delivery_dir/$file" && test ! -L "$delivery_dir/$file"
  else
    curl --fail --silent --show-error --location --connect-timeout 15 --max-time 240 "$source_base/artifacts/$file" -o "$delivery_dir/$file"
  fi
done
if [ -e "$delivery_dir/deploy.py" ]; then
  test -f "$delivery_dir/deploy.py" && test ! -L "$delivery_dir/deploy.py"
else
  curl --fail --silent --show-error --location --connect-timeout 15 --max-time 120 "$source_base/deploy.py" -o "$delivery_dir/deploy.py"
fi
printf '%s  %s\n' "$archive_hash" "$delivery_dir/$release.tar.gz" | sha256sum --check -
printf '%s  %s\n' "$deployer_hash" "$delivery_dir/deploy.py" | sha256sum --check -

python3 "$delivery_dir/deploy.py" deploy --settings "$settings" --archive "$delivery_dir/$release.tar.gz" --sha256-file "$delivery_dir/$release.tar.gz.sha256" > "$delivery_dir/dry-run.json"
cat "$delivery_dir/dry-run.json"
python3 "$delivery_dir/deploy.py" deploy --settings "$settings" --archive "$delivery_dir/$release.tar.gz" --sha256-file "$delivery_dir/$release.tar.gz.sha256" --apply > "$delivery_dir/deploy-receipt.json"
cat "$delivery_dir/deploy-receipt.json"
test "$(readlink -f "$root/current")" = "$root/releases/$release/site"
curl --fail --silent --show-error --max-time 15 -I http://127.0.0.1:8088/admin
curl --fail --silent --show-error --max-time 15 -I http://127.0.0.1:8088/sw.js
printf 'S037 preview release selected: %s\n' "$release"
