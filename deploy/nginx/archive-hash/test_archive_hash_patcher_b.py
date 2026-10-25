"""Prepared unit tests only; never contact Nginx or replace a real config.
The Windows-only fcntl stand-in allows source tests to import a Linux script;
private_lock is not executed by these tests. Production keeps real fcntl.
"""
import importlib.util
from pathlib import Path
import subprocess
import sys
import types
import unittest
from unittest.mock import Mock, call, patch

try:
    import fcntl
except ImportError:
    sys.modules['fcntl'] = types.ModuleType('fcntl')

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('archive_hash_patcher', HERE / 'patch-archive-hash-exposure-b.py')
MOD = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MOD
SPEC.loader.exec_module(MOD)


def config(headers=None, location='location /sb-functions/', quote='"', extra=''):
    if headers is None:
        headers = MOD.OLD
    return ('server {\n  proxy_hide_header Access-Control-Expose-Headers;\n'
            '  location /other/ { add_header Access-Control-Expose-Headers "untouched" always; }\n'
            '  ' + location + ' {\n    ' + extra + '\n'
            '    add_header Access-Control-Expose-Headers ' + quote + headers + quote + ' always;\n'
            '    proxy_pass http://existing_upstream;\n  }\n}\n')


class ParserTests(unittest.TestCase):
    def test_complete_actual_generator_template(self):
        before = (HERE / 'fixtures/generator-before.conf').read_bytes().decode('utf-8')
        after = (HERE / 'fixtures/generator-after.conf').read_bytes().decode('utf-8')
        self.assertEqual(MOD.patch_config(before), after)
        self.assertEqual(after.replace(', x-archive-sha256', '', 1), before)

    def test_one_exact_append_and_inverse(self):
        before = config()
        after = MOD.patch_config(before)
        self.assertEqual(after, before.replace('"' + MOD.OLD + '"', '"' + MOD.NEW + '"', 1))
        self.assertEqual(after.replace(', x-archive-sha256', '', 1), before)
        self.assertIn('"untouched" always;', after)
        self.assertIn('proxy_hide_header Access-Control-Expose-Headers;', after)

    def test_idempotent(self):
        before = config(MOD.NEW)
        self.assertEqual(MOD.patch_config(before), before)

    def test_prefix_modifier(self):
        before = config(location='location ^~ /sb-functions/')
        self.assertEqual(MOD.patch_config(before), before.replace(MOD.OLD, MOD.NEW))

    def test_single_quoted_list(self):
        before = config(quote="'")
        self.assertEqual(MOD.patch_config(before), before.replace(MOD.OLD, MOD.NEW))

    def test_comment_location_and_directive_ignored(self):
        before = '# location /sb-functions/ { }\n' + config(extra='# add_header Access-Control-Expose-Headers "bad" always; }')
        self.assertEqual(MOD.patch_config(before), before.replace(MOD.OLD, MOD.NEW))

    def test_quoted_braces_hash_semicolon_and_location_ignored(self):
        before = config(extra='set $quoted "} { # ; location /sb-functions/ {";')
        self.assertEqual(MOD.patch_config(before), before.replace(MOD.OLD, MOD.NEW))

    def test_escaped_quote_and_brace_ignored(self):
        before = config(extra='set $quoted "escaped \\" quote }";')
        self.assertEqual(MOD.patch_config(before), before.replace(MOD.OLD, MOD.NEW))

    def test_unquoted_variable_braces(self):
        before = config(extra='proxy_set_header X-Existing ${existing_variable};')
        self.assertEqual(MOD.patch_config(before), before.replace(MOD.OLD, MOD.NEW))

    def test_two_active_target_locations_rejected(self):
        for second in (config(), 'server { location ~ ^/sb-functions/ { return 403; } }'):
            with self.subTest(second=second), self.assertRaises(ValueError):
                MOD.patch_config(config() + second)

    def test_no_target_rejected(self):
        with self.assertRaises(ValueError):
            MOD.patch_config(config(location='location /different/'))

    def test_regex_or_exact_match_location_rejected(self):
        for location in ('location ~ /sb-functions/', 'location = /sb-functions/'):
            with self.subTest(location=location), self.assertRaises(ValueError):
                MOD.patch_config(config(location=location))

    def test_unknown_or_reordered_list_rejected(self):
        for value in (MOD.OLD + ', unknown', MOD.OLD.upper(), ', '.join(reversed(MOD.OLD.split(', '))), '*', MOD.NEW + ', x-archive-sha256'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                MOD.patch_config(config(value))

    def test_unquoted_or_non_always_rejected(self):
        for before in (config().replace('"' + MOD.OLD + '"', MOD.OLD), config().replace(' always;', ';')):
            with self.subTest(before=before), self.assertRaises(ValueError):
                MOD.patch_config(before)

    def test_duplicate_directive_rejected(self):
        with self.assertRaises(ValueError):
            MOD.patch_config(config(extra='add_header Access-Control-Expose-Headers "bad" always;'))

    def test_nested_override_rejected(self):
        with self.assertRaises(ValueError):
            MOD.patch_config(config(extra='if ($request_method = OPTIONS) { add_header Access-Control-Expose-Headers "bad" always; }'))

    def test_only_nested_directive_rejected(self):
        before = 'server { location /sb-functions/ { if ($x) { add_header Access-Control-Expose-Headers "' + MOD.OLD + '" always; } } }'
        with self.assertRaises(ValueError):
            MOD.patch_config(before)

    def test_unclosed_syntax_rejected(self):
        for before in (config()[:-2], config() + '}', 'server { set $x "unterminated; }', 'server { set $x ${unfinished; }'):
            with self.subTest(before=before), self.assertRaises(ValueError):
                MOD.patch_config(before)


class ApplyFlowTests(unittest.TestCase):
    def setUp(self):
        self.path = Path('/etc/nginx/sites-available/api.sintagma-rf.conf')
        self.old = MOD.Snapshot(b'old', (1, 2, 3, 4, 5, 0, 0, 0o640), (('user.example', b'value'),), 7)
        self.new = MOD.Snapshot(b'new', (1, 8, 3, 4, 9, 0, 0, 0o640), self.old.xattrs, 7)
        self.restored = MOD.Snapshot(b'old', (1, 10, 3, 4, 11, 0, 0, 0o640), self.old.xattrs, 7)
        self.backup = Path('/var/backups/sintagma-nginx/archive-hash/test.bak')

    def run_flow(self, command_effect=None, replace_effect=None, compare_effect=None):
        self.comparisons = Mock(side_effect=compare_effect)
        self.commands = Mock(side_effect=command_effect)
        self.replacements = Mock(side_effect=replace_effect or [self.new, self.restored])
        with patch.object(MOD, 'compare_current', self.comparisons), patch.object(MOD, 'backup_snapshot', return_value=self.backup) as backups, patch.object(MOD, 'replace_cas', self.replacements), patch.object(MOD, 'nginx_command', self.commands):
            self.backups = backups
            return MOD.apply_change(self.path, self.old, b'new')

    def test_success_exact_order_no_rollback(self):
        self.assertEqual(self.run_flow(), self.backup)
        self.assertEqual(self.commands.call_args_list, [call('nginx', '-t'), call('systemctl', 'reload', 'nginx')])
        self.assertEqual(self.replacements.call_args_list, [call(self.path, self.old, b'new', self.old)])
        self.assertEqual(self.comparisons.call_args_list, [call(self.path, self.old), call(self.path, self.new), call(self.path, self.new)])
        self.backups.assert_called_once_with(self.old)

    def test_validation_failure_restores_and_validates_without_reload(self):
        with self.assertRaisesRegex(RuntimeError, 'Original bytes restored'):
            self.run_flow(command_effect=[RuntimeError('bad syntax'), None])
        self.assertEqual(self.commands.call_args_list, [call('nginx', '-t'), call('nginx', '-t')])
        self.assertEqual(self.replacements.call_args_list[1], call(self.path, self.new, b'old', self.old))

    def test_reload_failure_restores_validates_and_reloads_original(self):
        with self.assertRaisesRegex(RuntimeError, 'Original bytes restored'):
            self.run_flow(command_effect=[None, RuntimeError('reload failed'), None, None])
        self.assertEqual(self.commands.call_args_list, [call('nginx', '-t'), call('systemctl', 'reload', 'nginx'), call('nginx', '-t'), call('systemctl', 'reload', 'nginx')])

    def test_timeout_uses_same_recovery_without_retrying_new_config(self):
        with self.assertRaisesRegex(RuntimeError, 'Original bytes restored'):
            self.run_flow(command_effect=[None, subprocess.TimeoutExpired('reload', 30), None, None])
        self.assertEqual(self.commands.call_count, 4)
        self.assertEqual(self.replacements.call_count, 2)

    def test_initial_cas_conflict_does_not_backup_or_replace(self):
        with self.assertRaises(MOD.Conflict):
            self.run_flow(compare_effect=MOD.Conflict('changed'))
        self.backups.assert_not_called()
        self.replacements.assert_not_called()
        self.commands.assert_not_called()

    def test_conflict_before_reload_never_reloads_new_config(self):
        with self.assertRaisesRegex(RuntimeError, 'Rollback not confirmed'):
            self.run_flow(compare_effect=[None, MOD.Conflict('external writer')], replace_effect=[self.new, MOD.Conflict('external writer')])
        self.assertEqual(self.commands.call_args_list, [call('nginx', '-t')])
        self.assertEqual(self.replacements.call_count, 2)

    def test_unconfirmed_replacement_does_not_blindly_restore(self):
        with self.assertRaisesRegex(RuntimeError, 'Replacement not confirmed'):
            self.run_flow(replace_effect=RuntimeError('readback unavailable'))
        self.assertEqual(self.replacements.call_count, 1)
        self.commands.assert_not_called()

    def test_rollback_validation_failure_is_not_reported_as_success(self):
        with self.assertRaisesRegex(RuntimeError, 'Rollback not confirmed'):
            self.run_flow(command_effect=[RuntimeError('first'), RuntimeError('recovery')])

    def test_snapshot_metadata_and_bytes_are_part_of_cas(self):
        self.assertTrue(MOD.same(self.old, self.old))
        self.assertFalse(MOD.same(self.old, MOD.Snapshot(b'changed', self.old.identity, self.old.xattrs, 7)))
        self.assertFalse(MOD.same(self.old, MOD.Snapshot(b'old', (1, 3) + self.old.identity[2:], self.old.xattrs, 7)))
        self.assertFalse(MOD.same(self.old, MOD.Snapshot(b'old', self.old.identity, (), 7)))

    def test_resolved_path_change_fails_before_snapshot(self):
        with patch.object(MOD, 'resolve_config', return_value=Path('/etc/nginx/other.conf')), patch.object(MOD, 'snapshot') as reader:
            with self.assertRaises(MOD.Conflict):
                MOD.compare_current(self.path, self.old)
            reader.assert_not_called()

    def test_resolved_target_cannot_escape_nginx(self):
        fake_config = Mock()
        fake_config.resolve.return_value = Path('/tmp/foreign.conf')
        with patch.object(MOD, 'CONFIG', fake_config), self.assertRaises(ValueError):
            MOD.resolve_config()
        fake_config.resolve.assert_called_once_with(strict=True)

    def test_literal_path_and_private_backup_allowlist(self):
        self.assertEqual(str(MOD.CONFIG).replace('\\', '/'), '/etc/nginx/sites-enabled/api.sintagma-rf.conf')
        self.assertEqual(str(MOD.BACKUPS).replace('\\', '/'), '/var/backups/sintagma-nginx/archive-hash')
        self.assertNotIn(MOD.ROOT, MOD.BACKUPS.parents)

    def test_reviewed_sha_is_required_for_apply_and_exact(self):
        expected = MOD.hashlib.sha256(self.old.content).hexdigest()
        MOD.require_expected(self.old, False, None)
        MOD.require_expected(self.old, True, expected)
        for applying, value, error in ((True, None, ValueError), (True, '0' * 64, MOD.Conflict), (False, '0' * 64, MOD.Conflict), (True, expected.upper(), ValueError), (True, 'x' * 64, ValueError), (True, expected[:-1], ValueError)):
            with self.subTest(applying=applying, value=value), self.assertRaises(error):
                MOD.require_expected(self.old, applying, value)

    def test_command_timeout_and_stdin_are_bounded(self):
        with patch.object(MOD.subprocess, 'run', return_value=types.SimpleNamespace(returncode=0)) as runner:
            MOD.nginx_command('nginx', '-t')
            args, kwargs = runner.call_args
            self.assertEqual(args, (('nginx', '-t'),))
            self.assertEqual(kwargs['timeout'], 30)
            self.assertEqual(kwargs['stdin'], subprocess.DEVNULL)
            self.assertNotIn('shell', kwargs)


if __name__ == '__main__':
    unittest.main(verbosity=2)
