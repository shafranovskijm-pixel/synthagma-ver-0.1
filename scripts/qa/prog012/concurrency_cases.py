"""SOURCE ONLY; not executed. Exactly 18 isolated, multi-session PG17 cases.

Imported by the separately guarded lab runner. No server startup, database
creation/deletion, production URL, password, or cloud access. Every operation
uses synthetic fixture UUIDs and is logged. File-backed claims remain blocked;
the two library MVCC cases exercise private coordination only, never approvals.
"""
from __future__ import annotations

import json
import queue
import re
import subprocess
import threading
import time
import uuid

OWN = "4ac2c05a-d8b5-4e72-ba31-f2c743091d95"
CLIENT = "20000000-0000-0000-0000-000000000001"
ADMIN = "10000000-0000-0000-0000-000000000001"
STATE = re.compile(r"(?:ERROR|FATAL):\s+([A-Z0-9]{5}):")


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def ident():
    return str(uuid.uuid4())


class Session:
    def __init__(self, args, env, name, trace):
        self.name, self.trace = name, trace
        self.lines = queue.Queue()
        self.proc = subprocess.Popen(
            args + ["-q", "-A", "-t", "-v", "ON_ERROR_STOP=0", "-v", "VERBOSITY=verbose"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", errors="replace", env=env, bufsize=1,
        )
        threading.Thread(target=self._read, daemon=True).start()
        self.ok("SET statement_timeout='12s'; SET lock_timeout='4s';")

    def _read(self):
        for line in self.proc.stdout:
            self.lines.put(line.rstrip("\r\n"))
        self.lines.put(None)

    def run(self, sql):
        token = "PCR_DONE_" + uuid.uuid4().hex
        self.trace({"session": self.name, "sql": sql})
        self.proc.stdin.write(sql + "\n\\echo " + token + "\n")
        self.proc.stdin.flush()
        output = []
        deadline = time.monotonic() + 18
        while True:
            try:
                line = self.lines.get(timeout=max(0.01, deadline - time.monotonic()))
            except queue.Empty as exc:
                self.proc.kill()
                raise AssertionError(f"{self.name}: timeout; no silent retry") from exc
            if line is None:
                raise AssertionError(f"{self.name}: psql terminated: {output}")
            if line == token:
                break
            output.append(line)
        states = STATE.findall("\n".join(output))
        self.trace({"session": self.name, "output": output, "sqlstates": states})
        return output, states

    def ok(self, sql):
        output, states = self.run(sql)
        if states or any("ERROR:" in x or "FATAL:" in x for x in output):
            raise AssertionError(f"{self.name}: expected success: {output}")
        return output

    def error(self, sql, state, prefix=None):
        output, states = self.run(sql)
        if states != [state] or (prefix and not any(prefix in x for x in output)):
            raise AssertionError(f"{self.name}: expected only {state}/{prefix}: {output}")
        return output

    def check(self, expression):
        output = self.ok("SELECT CASE WHEN (" + expression + ") IS TRUE THEN 'PCR_CHECK_OK' ELSE 'PCR_CHECK_FAILED' END;")
        if output != ["PCR_CHECK_OK"]:
            raise AssertionError(f"{self.name}: failed assertion: {expression}: {output}")

    def admin(self):
        self.ok("SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub'," + quote(ADMIN) + ",false); SELECT set_config('request.jwt.claim.role','authenticated',false);")

    def rollback(self):
        self.ok("ROLLBACK;")

    def close(self):
        if self.proc.poll() is None:
            try:
                self.proc.stdin.write("ROLLBACK;\n\\q\n")
                self.proc.stdin.flush()
                self.proc.wait(timeout=5)
            except (BrokenPipeError, subprocess.TimeoutExpired):
                self.proc.kill()
                self.proc.wait(timeout=5)


def seed(s, own=False, listing=False, with_listing=True, questions=1):
    f = {k: ident() for k in ("c", "u", "l", "q", "q2", "m", "b", "d", "a")}
    org = OWN if own else CLIENT
    s.ok("INSERT INTO public.courses(id,organization_id,title) VALUES(" + quote(f["c"]) + "," + quote(org) + ",'PCR V2 SYNTHETIC');"
         "INSERT INTO public.course_modules(id,course_id,title,order_index) VALUES(" + quote(f["u"]) + "," + quote(f["c"]) + ",'Synthetic module',0);"
         "INSERT INTO public.lessons(id,course_id,module_id,title,type,content,order_index) VALUES(" + quote(f["l"]) + "," + quote(f["c"]) + "," + quote(f["u"]) + ",'Synthetic test','test','',0);")
    for q in ("q", "q2")[:questions]:
        s.ok("INSERT INTO public.test_questions(id,lesson_id,question,options,correct_answer,explanation,order_index) VALUES(" + quote(f[q]) + "," + quote(f["l"]) + ",'Synthetic code?','[\"28\",\"17\"]',0,'Synthetic only',0);")
    if with_listing:
        # New own TRUE is never seeded: ordinary public review must create it.
        if own and listing:
            raise AssertionError("seed may not fabricate an own approval")
        s.ok("INSERT INTO public.marketplace_courses(id,course_id,organization_id,is_validated,is_active) VALUES(" + quote(f["m"]) + "," + quote(f["c"]) + "," + quote(org) + "," + ("true" if listing else "false") + ",true);")
    return f


def library(s, f, link=False):
    s.ok("INSERT INTO public.library_documents(id,organization_id,edition_label,external_url) VALUES(" + quote(f["b"]) + "," + quote(OWN) + ",'Synthetic edition','https://example.invalid/synthetic');")
    if link:
        link_library(s, f)


def link_library(s, f):
    s.ok("INSERT INTO public.course_documents(id,course_id,library_document_id,name,file_url,sort_order) VALUES(" + quote(f["d"]) + "," + quote(f["c"]) + "," + quote(f["b"]) + ",'Synthetic reference','https://example.invalid/synthetic',0);")


def dossier():
    ref = [{"reference": "synthetic fixture source", "edition": "fixture-v2", "checked_at": "2026-10-01T00:00:00Z"}]
    result = {"schema_version": 1, "passport": {k: "Explicit synthetic test evidence" for k in (
        "purpose", "audience", "entry_requirements", "outcomes", "teaching_plan", "workload", "assessment_criteria", "applicability")}}
    for k in ("source_review", "subject_keys", "rights"):
        result[k] = {"state": "confirmed", "rationale": "Explicit synthetic fixture", "evidence": ref}
    for k in ("practices", "document_links"):
        result[k] = {"state": "not_applicable", "rationale": "This synthetic inline-only fixture has no such component"}
    return result


def publish(s, f, accepted_only=False):
    """Use ordinary authenticated new RPCs; never insert evidence directly."""
    m = quote(f["m"])
    ready = s.ok("SELECT public.read_platform_course_publication_readiness(" + m + ")::text;")
    data = json.loads(ready[-1])
    sha = data["edition_sha256"]
    prop = s.ok("SELECT public.submit_platform_course_publication_proposal(" + m + "," + quote(sha) + "," + quote(json.dumps(dossier())) + "::jsonb," + quote(ident()) + ")::text;")
    proposal = json.loads(prop[-1])["proposal_id"]
    s.ok("SELECT public.record_platform_course_publication_review(" + m + "," + quote(proposal) + "," + quote(sha) + ",'accepted_for_template_publication','Explicit SYNTHETIC review',clock_timestamp()+interval '1 day'," + quote(ident()) + ");")
    if not accepted_only:
        s.ok("SELECT public.publish_platform_course_proposal(" + m + "," + quote(proposal) + "," + quote(sha) + "," + quote(ident()) + ");")
    return sha


def internal_library_coordination(s, f):
    """PG owner unit only. This creates NO approval/event or true flag.

    Current external-file contract deliberately blocks accepted dossier review.
    These calls test native marker MVCC, not a working file-backed publication.
    """
    c = quote(f["c"])
    s.ok("BEGIN; SELECT public.pcr_v2_lock(ARRAY[" + c + "::uuid],'exclusive','own-edition');"
         "SELECT public.pcr_v2_parent_courses(ARRAY[" + c + "::uuid],false);"
         "SELECT public.pcr_v2_claim_touch(" + c + "); COMMIT;")


def run_cases(psql_args, env, trace):
    """All 18 cases fail on any unexpected SQL state or timeout; no retries."""
    sessions = []
    passed = []

    def session(label):
        obj = Session(psql_args, env, label, trace)
        sessions.append(obj)
        return obj

    def done(n, description):
        name = f"PCRV2C{n:02d} {description}"
        passed.append(name)
        trace({"pass": name})

    try:
        owner = session("fixture-owner")
        owner.check("current_database()='sintagma_pcr_v4_r2_lab_20261028' AND inet_server_addr()='127.0.0.1'::inet AND current_setting('pcr.lab_authorized',true)='source-reviewed-root-run-only' AND current_setting('server_version_num')::int BETWEEN 170000 AND 179999")

        a, b = session("C01-A"), session("C01-B")
        f = seed(owner, questions=2)
        a.ok("BEGIN ISOLATION LEVEL REPEATABLE READ; UPDATE public.test_questions SET explanation='parallel A' WHERE id=" + quote(f["q"]) + ";")
        b.ok("BEGIN ISOLATION LEVEL SERIALIZABLE; UPDATE public.test_questions SET explanation='parallel B' WHERE id=" + quote(f["q2"]) + "; COMMIT;")
        a.ok("COMMIT;")
        owner.check("(SELECT count(*)=2 FROM public.test_questions WHERE lesson_id=" + quote(f["l"]) + " AND explanation LIKE 'parallel %') AND NOT EXISTS(SELECT 1 FROM public.platform_course_publication_scope_revisions WHERE course_id=" + quote(f["c"]) + ")")
        done(1, "client child writers share parents in RR and serializable without own marker")

        f = seed(owner)
        # Seed first, then forbid ANY later UPDATE of this false foreign-tenant
        # listing. The oracle catches a no-op write even if now() is unchanged.
        before_foreign_listing = owner.ok("SELECT to_jsonb(m)::text FROM public.marketplace_courses m WHERE id=" + quote(f["m"]) + ";")[-1]
        owner.ok("CREATE FUNCTION public.qa_pcr_c02_forbid_listing_update() RETURNS trigger LANGUAGE plpgsql AS $qa$ "
                 "BEGIN IF OLD.id=" + quote(f["m"]) + "::uuid THEN RAISE EXCEPTION 'PCR_QA_FOREIGN_LISTING_WRITE' USING ERRCODE='PZ001'; END IF; RETURN NEW; END; $qa$; "
                 "CREATE TRIGGER qa_pcr_c02_foreign_listing_write BEFORE UPDATE ON public.marketplace_courses FOR EACH ROW EXECUTE FUNCTION public.qa_pcr_c02_forbid_listing_update();")
        # Calibrate the oracle: an unconditional false-to-false UPDATE must fail.
        owner.error("UPDATE public.marketplace_courses SET is_validated=false WHERE id=" + quote(f["m"]) + ";", "PZ001", "PCR_QA_FOREIGN_LISTING_WRITE")
        a.ok("BEGIN; UPDATE public.test_questions SET explanation='drained before transfer' WHERE id=" + quote(f["q"]) + ";")
        results = queue.Queue()
        def transfer():
            try:
                results.put((True, b.ok("UPDATE public.courses SET organization_id=" + quote(OWN) + " WHERE id=" + quote(f["c"]) + ";")))
            except Exception as exc:
                results.put((False, repr(exc)))
        thread = threading.Thread(target=transfer, daemon=True)
        thread.start()
        time.sleep(0.15)
        if not thread.is_alive():
            raise AssertionError("parent UPDATE did not wait for child SHARE barrier")
        a.ok("COMMIT;")
        thread.join(8)
        if thread.is_alive():
            raise AssertionError("transfer remained blocked after child commit")
        result = results.get_nowait()
        if not result[0]:
            raise AssertionError(result[1])
        owner.check("(SELECT organization_id=" + quote(OWN) + "::uuid FROM public.courses WHERE id=" + quote(f["c"]) + ") AND NOT (SELECT is_validated FROM public.marketplace_courses WHERE id=" + quote(f["m"]) + ")")
        owner.check("(SELECT to_jsonb(m)=" + quote(before_foreign_listing) + "::jsonb FROM public.marketplace_courses m WHERE id=" + quote(f["m"]) + ")")
        owner.ok("DROP TRIGGER qa_pcr_c02_foreign_listing_write ON public.marketplace_courses; DROP FUNCTION public.qa_pcr_c02_forbid_listing_update();")
        done(2, "parent ownership transfer drains earlier client writer and remains allowed")

        f = seed(owner, with_listing=False)
        a.ok("BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT count(*) FROM public.marketplace_courses WHERE course_id=" + quote(f["c"]) + ";")
        b.ok("INSERT INTO public.marketplace_courses(id,course_id,organization_id,is_validated) VALUES(" + quote(f["m"]) + "," + quote(f["c"]) + "," + quote(CLIENT) + ",true);")
        a.error("UPDATE public.courses SET organization_id=" + quote(OWN) + " WHERE id=" + quote(f["c"]) + ";", "40001")
        a.rollback()
        owner.check("(SELECT organization_id=" + quote(CLIENT) + "::uuid FROM public.courses WHERE id=" + quote(f["c"]) + ") AND (SELECT is_validated FROM public.marketplace_courses WHERE id=" + quote(f["m"]) + ")")
        done(3, "RR transfer cannot miss post-snapshot true client listing INSERT")

        f = seed(owner)
        a.ok("BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT is_validated FROM public.marketplace_courses WHERE id=" + quote(f["m"]) + ";")
        b.ok("UPDATE public.marketplace_courses SET is_validated=true WHERE id=" + quote(f["m"]) + ";")
        a.error("UPDATE public.courses SET organization_id=" + quote(OWN) + " WHERE id=" + quote(f["c"]) + ";", "40001")
        a.rollback()

        # Also exercise an existing true row re-pointed into the transfer target,
        # which is absent from the RR target-course listing lookup.
        f, g = seed(owner, with_listing=False), seed(owner, listing=True)
        a.ok("BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT count(*) FROM public.marketplace_courses WHERE course_id=" + quote(f["c"]) + ";")
        b.ok("UPDATE public.marketplace_courses SET course_id=" + quote(f["c"]) + " WHERE id=" + quote(g["m"]) + ";")
        a.error("UPDATE public.courses SET organization_id=" + quote(OWN) + " WHERE id=" + quote(f["c"]) + ";", "40001")
        a.rollback()
        owner.check("(SELECT organization_id=" + quote(CLIENT) + "::uuid FROM public.courses WHERE id=" + quote(f["c"]) + ") AND (SELECT is_validated AND course_id=" + quote(f["c"]) + "::uuid FROM public.marketplace_courses WHERE id=" + quote(g["m"]) + ")")
        done(4, "RR transfer cannot miss post-snapshot true client listing promotion or re-point")

        f = seed(owner)
        a.ok("BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT organization_id FROM public.courses WHERE id=" + quote(f["c"]) + ";")
        b.ok("UPDATE public.courses SET organization_id=" + quote(OWN) + " WHERE id=" + quote(f["c"]) + ";")
        a.error("UPDATE public.test_questions SET explanation='must rollback' WHERE id=" + quote(f["q"]) + ";", "40001")
        a.rollback()
        owner.check("(SELECT explanation='Synthetic only' FROM public.test_questions WHERE id=" + quote(f["q"]) + ")")
        done(5, "RR parent SHARE detects owner transfer instead of stale client classification")

        f, g = seed(owner), seed(owner)
        a.ok("BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT course_id FROM public.lessons WHERE id=" + quote(f["l"]) + ";")
        b.ok("UPDATE public.lessons SET module_id=NULL,course_id=" + quote(g["c"]) + " WHERE id=" + quote(f["l"]) + ";")
        a.error("UPDATE public.test_questions SET explanation='must rollback' WHERE id=" + quote(f["q"]) + ";", "40001")
        a.rollback()
        done(6, "RR lesson SHARE detects changed parent course")

        f = seed(owner)
        a.ok("BEGIN; SELECT 1 FROM public.lessons WHERE id=" + quote(f["l"]) + " FOR UPDATE;")
        started = time.monotonic()
        b.error("UPDATE public.test_questions SET explanation='must rollback' WHERE id=" + quote(f["q"]) + ";", "40001", "PCR_PARENT_CHANGED_RETRY")
        if time.monotonic() - started > 2:
            raise AssertionError("additional lesson lock waited instead of NOWAIT")
        a.rollback()
        done(7, "already-locked question cannot wait behind locked lesson parent")

        for n, level in ((8, "REPEATABLE READ"), (9, "SERIALIZABLE")):
            f = seed(owner, own=True)
            a.ok("BEGIN ISOLATION LEVEL " + level + "; SELECT is_validated FROM public.marketplace_courses WHERE id=" + quote(f["m"]) + ";")
            p = session(f"C{n:02d}-ordinary-moderator")
            p.admin()
            publish(p, f)
            a.error("UPDATE public.test_questions SET explanation='must rollback' WHERE id=" + quote(f["q"]) + ";", "40001")
            a.rollback()
            owner.check("(SELECT is_validated FROM public.marketplace_courses WHERE id=" + quote(f["m"]) + ") AND (SELECT explanation='Synthetic only' FROM public.test_questions WHERE id=" + quote(f["q"]) + ")")
            done(n, level + " source writer cannot preserve newly published true flag from old false snapshot")

        for n, initially_linked in ((10, False), (11, True)):
            f = seed(owner, own=True)
            library(owner, f, initially_linked)
            a.ok("BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT count(*) FROM public.course_documents WHERE course_id=" + quote(f["c"]) + ";")
            if not initially_linked:
                link_library(b, f)
            internal_library_coordination(b, f)
            a.error("UPDATE public.library_documents SET edition_label='must rollback' WHERE id=" + quote(f["b"]) + ";", "40001")
            a.rollback()
            owner.check("(SELECT edition_label='Synthetic edition' FROM public.library_documents WHERE id=" + quote(f["b"]) + ") AND NOT EXISTS(SELECT 1 FROM public.platform_course_publication_review_events WHERE course_id=" + quote(f["c"]) + ")")
            done(n, "library native MVCC marker detects " + ("existing own reference" if initially_linked else "new own fanout absent from RR snapshot") + "; private helper only, no approval")

        f, g = seed(owner), seed(owner)
        library(owner, f)
        library(owner, g)
        a.ok("BEGIN; UPDATE public.library_documents SET edition_label='parallel library A' WHERE id=" + quote(f["b"]) + ";")
        b.ok("UPDATE public.library_documents SET edition_label='parallel library B' WHERE id=" + quote(g["b"]) + ";")
        a.ok("COMMIT;")
        done(12, "different library markers never add cross-document serialization")

        f = seed(owner, own=True)
        library(owner, f, True)
        a.ok("BEGIN; SELECT 1 FROM public.library_documents WHERE id=" + quote(f["b"]) + " FOR UPDATE;")
        p = session("C13-ordinary-moderator")
        p.admin()
        p.error("SELECT public.read_platform_course_publication_readiness(" + quote(f["m"]) + ");", "40001", "PCR_PARENT_CHANGED_RETRY")
        a.rollback()
        done(13, "claim/readiness parent lock never waits for library target-row writer")

        f = seed(owner, own=True)
        p = session("C14-ordinary-moderator")
        p.admin()
        p.ok("BEGIN;")
        publish(p, f, accepted_only=True)
        b.error("UPDATE public.test_questions SET explanation='must rollback' WHERE id=" + quote(f["q"]) + ";", "40001", "PCR_SOURCE_CHANGED_RETRY")
        p.ok("COMMIT;")
        done(14, "owned source writer TRY fence cannot deadlock on active accepted claim")

        f = seed(owner)
        owner.ok("INSERT INTO public.lesson_attachments(id,lesson_id,name,file_url) VALUES(" + quote(f["a"]) + "," + quote(f["l"]) + ",'Synthetic attachment','https://example.invalid/test');")
        owner.ok("DELETE FROM public.courses WHERE id=" + quote(f["c"]) + ";")
        owner.check("NOT EXISTS(SELECT 1 FROM public.test_questions WHERE id=" + quote(f["q"]) + ") AND NOT EXISTS(SELECT 1 FROM public.lesson_attachments WHERE id=" + quote(f["a"]) + ") AND NOT EXISTS(SELECT 1 FROM public.platform_course_publication_deleted_parents)")
        done(15, "client course lesson question attachment CASCADE remains allowed with cleaned witnesses")

        f = seed(owner, own=True)
        p = session("C16-ordinary-moderator")
        p.admin()
        publish(p, f)
        before = owner.ok("SELECT public.pcr_v2_sha(jsonb_agg(to_jsonb(e) ORDER BY sequence)) FROM public.platform_course_publication_review_events e WHERE course_id=" + quote(f["c"]) + ";")[-1]
        owner.ok("DELETE FROM public.courses WHERE id=" + quote(f["c"]) + ";")
        owner.check("NOT EXISTS(SELECT 1 FROM public.test_questions WHERE id=" + quote(f["q"]) + ") AND NOT EXISTS(SELECT 1 FROM public.platform_course_publication_deleted_parents) AND (SELECT NOT active FROM public.platform_course_publication_scope_revisions WHERE course_id=" + quote(f["c"]) + ") AND (SELECT public.pcr_v2_sha(jsonb_agg(to_jsonb(e) ORDER BY sequence))=" + quote(before) + " FROM public.platform_course_publication_review_events e WHERE course_id=" + quote(f["c"]) + ")")
        done(16, "own cascade keeps append-only historical evidence byte-exact and generation inactive")

        f = seed(owner, own=True)
        p = session("C17-ordinary-moderator")
        p.admin()
        old_sha = publish(p, f)

        owner.ok("INSERT INTO public.courses(id,organization_id,title) VALUES(" + quote(f["c"]) + "," + quote(OWN) + ",'duplicate must not replace') ON CONFLICT(id) DO NOTHING;")
        duplicate_ready = json.loads(p.ok("SELECT public.read_platform_course_publication_readiness(" + quote(f["m"]) + ")::text;")[-1])
        if duplicate_ready["edition_sha256"] != old_sha or duplicate_ready["state"] != "eligible" or not duplicate_ready["is_validated"]:
            raise AssertionError("duplicate own INSERT DO NOTHING invalidated an unchanged edition")
        owner.ok("UPDATE public.marketplace_courses SET is_validated=false WHERE id=" + quote(f["m"]) + "; UPDATE public.courses SET organization_id=" + quote(CLIENT) + " WHERE id=" + quote(f["c"]) + "; UPDATE public.courses SET organization_id=" + quote(OWN) + " WHERE id=" + quote(f["c"]) + ";")
        ready = json.loads(p.ok("SELECT public.read_platform_course_publication_readiness(" + quote(f["m"]) + ")::text;")[-1])
        if ready["edition_sha256"] == old_sha or ready["state"] != "review_stale":
            raise AssertionError("own re-entry reused old edition approval")
        done(17, "own exit and re-entry requires a new generation and cannot reuse old review")

        f = seed(owner, own=True)
        p = session("C18-ordinary-moderator")
        p.admin()
        p.ok("BEGIN ISOLATION LEVEL REPEATABLE READ;")
        p.error("SELECT public.read_platform_course_publication_readiness(" + quote(f["m"]) + ");", "25000", "PCR_NEW_RPC_READ_COMMITTED_REQUIRED")
        p.rollback()
        p.ok("SELECT set_config('pcr.invocation_context','true',false);")
        p.error("UPDATE public.marketplace_courses SET is_validated=true WHERE id=" + quote(f["m"]) + ";", "23514", "PCR_PUBLICATION_RPC_REQUIRED")
        g = seed(owner)
        # Existing AFTER INSERT validation invalidation remains unchanged.
        # Complete source fixture setup before the serializable promotion.
        owner.ok("INSERT INTO public.lesson_attachments(id,lesson_id,name) VALUES(" + quote(g["a"]) + "," + quote(g["l"]) + ",'client truncate fixture');")
        b.ok("BEGIN ISOLATION LEVEL SERIALIZABLE; UPDATE public.marketplace_courses SET is_validated=true WHERE id=" + quote(g["m"]) + "; COMMIT;")
        client_listing_before = owner.ok("SELECT to_jsonb(m)::text FROM public.marketplace_courses m WHERE id=" + quote(g["m"]) + ";")[-1]
        if json.loads(client_listing_before)["is_validated"] is not True:
            raise AssertionError("C18 current client promotion must be true before TRUNCATE")
        # No own attachments exist; retain actual native client-only TRUNCATE.
        owner.ok("TRUNCATE public.lesson_attachments;")
        owner.check("NOT EXISTS(SELECT 1 FROM public.lesson_attachments) AND (SELECT to_jsonb(m)=" + quote(client_listing_before) + "::jsonb FROM public.marketplace_courses m WHERE id=" + quote(g["m"]) + ")")
        done(18, "new own RPC RC contract and private context do not ban client serializable promotion or client-only truncate")

        if len(passed) != 18:
            raise AssertionError("exact 18 concurrency case inventory required")
        return passed
    finally:
        for s in reversed(sessions):
            s.close()
