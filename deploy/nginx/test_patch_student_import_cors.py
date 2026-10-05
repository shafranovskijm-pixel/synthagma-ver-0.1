import importlib.util
from pathlib import Path
import unittest


spec = importlib.util.spec_from_file_location(
    "patch", Path(__file__).with_name("patch-student-import-cors.py"),
)
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)
HEADERS = ", ".join(patch.EXISTING_HEADERS)
LOCATION = '''    location /sb-functions/ {
        if ($request_method = OPTIONS) { return 204; }
        add_header Access-Control-Expose-Headers "HEADERS" always;
        proxy_pass https://$sb_host/functions/v1/;
    }
'''.replace("HEADERS", HEADERS)
SOURCE = '''server {
    location /sb-api/ {
        add_header Access-Control-Expose-Headers "content-range" always;
    }
''' + LOCATION + "}\n"


class PatchTests(unittest.TestCase):
    def test_changes_only_the_function_header(self):
        updated = patch.patch_config(SOURCE)
        self.assertEqual(updated, SOURCE.replace(HEADERS, HEADERS + ", " + patch.REVISION_HEADER))

    def test_already_applied_is_unchanged(self):
        once = patch.patch_config(SOURCE)
        self.assertEqual(patch.patch_config(once), once)

    def test_unknown_header_list_is_refused(self):
        with self.assertRaisesRegex(ValueError, "Unexpected"):
            patch.patch_config(SOURCE.replace(HEADERS, HEADERS + ", another-header"))

    def test_ambiguous_location_is_refused(self):
        with self.assertRaisesRegex(ValueError, "exactly one"):
            patch.patch_config(SOURCE + LOCATION)

    def test_missing_or_duplicate_header_is_refused(self):
        directive = f'add_header Access-Control-Expose-Headers "{HEADERS}" always;'
        for replacement in ("", directive + "\n" + directive):
            with self.subTest(replacement=replacement), self.assertRaises(ValueError):
                patch.patch_config(SOURCE.replace(directive, replacement))

    def test_unrelated_braces_in_comments_and_strings_are_ignored(self):
        source = SOURCE.replace("proxy_pass", '# } ignored\n        set $example "}";\n        proxy_pass')
        self.assertEqual(patch.patch_config(source), source.replace(HEADERS, HEADERS + ", " + patch.REVISION_HEADER))

    def test_unclosed_location_is_refused(self):
        with self.assertRaisesRegex(ValueError, "Unclosed"):
            patch.patch_config(SOURCE[:SOURCE.index("proxy_pass")])


if __name__ == "__main__":
    unittest.main()
