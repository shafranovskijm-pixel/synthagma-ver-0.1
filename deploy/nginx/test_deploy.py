"""Local validation tests; fixtures stay under deploy/nginx/qa, never on C:."""
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("nginx_deploy", HERE / "deploy.py")
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class DeploymentValidation(unittest.TestCase):
    def setUp(self):
        (HERE / "qa").mkdir(exist_ok=True)
        self.work = Path(tempfile.mkdtemp(prefix="validation-", dir=HERE / "qa"))
        self.root = self.work / "runtime"
        self.root.mkdir()
        self.settings = {"root": self.root, "nginxBinary": "nginx", "nginxConfig": "preview.conf", "reloadCommand": ["nginx", "-s", "reload"]}

    def bundle(self, release="release-a", extra=None, bad_digest=False, asset=b"console.log('a')"):
        data = {"index.html": b"<html>fixture</html>", "sw.js": b"/* fixture */", "assets/main-ABCDEFGH.js": asset}
        sha = lambda value: deploy.hashlib.sha256(value).hexdigest()
        manifest = {"schemaVersion": 1, "releaseId": release, "source": {"gitCommit": "a" * 40}, "build": {"mode": "production", "publicSettingsSha256": "b" * 64}, "files": [{"path": name, "bytes": len(value), "sha256": sha(value)} for name, value in data.items()]}
        if bad_digest:
            manifest["files"][0]["sha256"] = "0" * 64
        archive = self.work / (release + ".tar.gz")
        with tarfile.open(archive, "w:gz") as tar:
            entries = {"manifest.json": json.dumps(manifest).encode(), **{"site/" + name: value for name, value in data.items()}}
            for name, value in entries.items():
                item = tarfile.TarInfo(name)
                item.size = len(value)
                tar.addfile(item, io.BytesIO(value))
            if extra:
                tar.addfile(extra, io.BytesIO(b""))
        checksum = archive.with_name(archive.name + ".sha256")
        checksum.write_text(deploy.digest_file(archive) + "  " + archive.name + "\n", encoding="utf-8")
        return archive, checksum, manifest

    def test_valid_bundle_and_dry_validation_do_not_stage(self):
        archive, checksum, manifest = self.bundle()
        self.assertEqual(deploy.validate_archive(archive, checksum), manifest)
        self.assertEqual(list(self.root.iterdir()), [])

    def test_rejects_archive_digest_mismatch(self):
        archive, checksum, _ = self.bundle()
        checksum.write_text("0" * 64 + "  " + archive.name, encoding="utf-8")
        with self.assertRaises(ValueError):
            deploy.validate_archive(archive, checksum)

    def test_rejects_file_digest_mismatch(self):
        archive, checksum, _ = self.bundle(bad_digest=True)
        with self.assertRaises(ValueError):
            deploy.validate_archive(archive, checksum)

    def test_rejects_unsafe_paths_and_extra_files(self):
        for n, name in enumerate(["../escape", "/tmp/escape", "site\\escape", "site/../escape", "site/unlisted.txt", "manifest.json"]):
            archive, checksum, _ = self.bundle("path-" + str(n), extra=tarfile.TarInfo(name))
            with self.subTest(name=name), self.assertRaises(ValueError):
                deploy.validate_archive(archive, checksum)

    def test_rejects_links_and_devices(self):
        for n, kind in enumerate([tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE, tarfile.FIFOTYPE]):
            item = tarfile.TarInfo("site/link")
            item.type, item.linkname = kind, "/etc/passwd"
            archive, checksum, _ = self.bundle("special-" + str(n), extra=item)
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                deploy.validate_archive(archive, checksum)

    def test_stage_retains_history_and_rejects_collision(self):
        archive, checksum, manifest = self.bundle()
        deploy.validate_archive(archive, checksum)
        deploy.stage_release(self.settings, archive, manifest)
        deploy.verify_installed(self.root, "release-a")
        self.assertTrue((self.root / "asset-history/assets/main-ABCDEFGH.js").is_file())
        archive, checksum, manifest = self.bundle("release-b", asset=b"different bytes, same hash name")
        deploy.validate_archive(archive, checksum)
        with self.assertRaisesRegex(ValueError, "Immutable asset collision"):
            deploy.stage_release(self.settings, archive, manifest)
        self.assertEqual((self.root / "asset-history/assets/main-ABCDEFGH.js").read_bytes(), b"console.log('a')")
        self.assertTrue((self.root / "releases/release-a/site/index.html").is_file())

    def test_exact_root_allowlist(self):
        file = self.work / "settings.json"
        file.write_text(json.dumps({"deploymentRoot": str(self.root), "allowedRoots": [str(self.work / "other")]}), encoding="utf-8")
        with self.assertRaises(ValueError):
            deploy.settings_from_file(file)

    def test_config_render_localhost_cache_and_spa(self):
        config = deploy.render(self.settings, "preview")
        self.assertIn("listen 127.0.0.1:8088;", config)
        self.assertIn("gzip_static on;", config)
        self.assertIn("max-age=31536000, immutable", config)
        self.assertIn("location = /sw.js", config)
        self.assertTrue(deploy.HASHED.fullmatch("assets/KaTeX_AMS-Regular-ABCDEFGH.ttf"))
        self.assertIn("|ttf|otf|", config)
        self.assertIn("try_files $uri $uri/ /index.html", config)
        self.assertNotIn("__", config)
        production = deploy.render(self.settings, "production")
        self.assertIn("__TLS_PRIVATE_KEY__", production)

    def test_activation_restores_previous_on_reload_failure(self):
        for release in ["release-a", "release-b"]:
            archive, checksum, manifest = self.bundle(release)
            deploy.validate_archive(archive, checksum)
            deploy.stage_release(self.settings, archive, manifest)
        try:
            deploy.point_current(self.root, "release-a")
        except OSError as error:
            self.skipTest("OS cannot create local symlink: " + str(error))
        with patch.object(deploy, "nginx_test"), patch.object(deploy, "nginx_reload", side_effect=[RuntimeError("injected reload failure"), None]):
            with self.assertRaisesRegex(RuntimeError, "current restored"):
                deploy.activate(self.settings, "release-b")
        self.assertEqual(deploy.selected_release(self.root), "release-a")
        self.assertTrue((self.root / "releases/release-b/site/index.html").is_file())


if __name__ == "__main__":
    unittest.main(verbosity=2)
