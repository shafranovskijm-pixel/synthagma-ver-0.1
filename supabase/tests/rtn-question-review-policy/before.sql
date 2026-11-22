-- Disposable fixture snapshot, not old acceptance execution.
SELECT lab.keep('policy_old_functions',(SELECT jsonb_agg(to_jsonb(p)ORDER BY oid)FROM pg_proc p));
SELECT lab.keep('policy_old_keys',(SELECT jsonb_agg(to_jsonb(k)ORDER BY id)FROM rtn_private.key_sets k));
SELECT lab.keep('policy_old_releases',(SELECT jsonb_agg(to_jsonb(r)ORDER BY id)FROM rtn_private.releases r));
SELECT lab.keep('policy_old_assignments',(SELECT jsonb_agg(to_jsonb(a)ORDER BY id)FROM rtn_private.assignments a));
SELECT lab.keep('policy_old_attempts',(SELECT jsonb_agg(to_jsonb(t)ORDER BY id)FROM rtn_private.attempts t));
SELECT lab.keep('policy_old_sources',(SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM rtn_private.sources s));
SELECT lab.keep('policy_old_bank_revisions',(SELECT jsonb_agg(to_jsonb(b)ORDER BY id)FROM rtn_private.bank_revisions b));
