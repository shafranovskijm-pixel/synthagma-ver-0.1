"""CI-only original read13 stage, after core48 and before file16."""
import hashlib
import json
import os
from pathlib import Path
import re


def run_read_stage(here, command, base, output, core_receipt, expected_manifest_sha256):
    here, output = Path(here).resolve(strict=True), Path(output).resolve(strict=True)
    proof = {"status": "RUNNING_ORIGINAL_READ13", "candidateCommitState": "NOT_REQUESTED",
             "actualCases": [], "sourceUnchanged": False, "production": False,
             "ordinaryCloudAuth": False, "fullSchemaParity": False,
             "fileAuthorityAccepted": False, "fullPROG012Accepted": False}
    pins = []
    try:
        if os.environ.get("GITHUB_ACTIONS") != "true":
            raise RuntimeError("READ13_GUARDED_GITHUB_JOB_ONLY")
        if (core_receipt.get("actualCases") != ["PCRV2S" + str(i).zfill(2) for i in range(1, 19)]
                or len(core_receipt.get("actualAuthSubgroups", [])) != 2
                or [x.split(" ", 1)[0] for x in core_receipt.get("actualConcurrencyCases", [])]
                    != ["PCRV2C" + str(i).zfill(2) for i in range(1, 19)]
                or len(core_receipt.get("actualCascadeSubgroups", [])) != 10
                or core_receipt.get("candidateCommitState") != "COMMITTED_NATIVE_PSQL_EXIT0_ACK"
                or not core_receipt.get("nativeSessionExits")
                or any(r["exitCode"] != 0 or r["closeError"] for r in core_receipt["nativeSessionExits"])):
            raise RuntimeError("UNCHANGED_CORE48_NATURAL_ZERO_COMPLETION_REQUIRED_FIRST")
        data = (here / "ci-read-inputs.json").read_bytes()
        if hashlib.sha256(data).hexdigest() != expected_manifest_sha256:
            raise RuntimeError("REVIEWED_ORIGINAL_READ13_MANIFEST_REQUIRED")
        pins = json.loads(data)["files"]
        if len(pins) != 3:
            raise RuntimeError("EXACT_THREE_READ13_INPUTS_REQUIRED")
        for pin in pins:
            target = (here / pin["path"]).resolve(strict=True)
            raw = target.read_bytes()
            if target.parent != here or len(raw) != pin["bytes"] or hashlib.sha256(raw).hexdigest() != pin["sha256"]:
                raise RuntimeError("READ13_SOURCE_DRIFT")
        # Read only aggregates from this already-authorized synthetic CI fixture.
        # No seed, role grant, Auth creation or client-data import is performed.
        snapshot_sql = """
SELECT json_build_object(
 'database', current_database(), 'address', host(inet_server_addr()),
 'port', inet_server_port(), 'version', current_setting('server_version_num'),
 'data_directory', current_setting('data_directory'), 'actor', current_user,
 'marker', current_setting('pcr.lab_authorized',true),
 'fixtureRows', (SELECT count(*) FROM public.marketplace_courses m JOIN public.courses c ON c.id=m.course_id
   WHERE m.id IN ('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002')
     AND c.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'),
 'clientFixtureRows', (SELECT count(*) FROM public.marketplace_courses m JOIN public.courses c ON c.id=m.course_id
   WHERE m.id='70000000-0000-0000-0000-000000000003'
     AND c.organization_id='20000000-0000-0000-0000-000000000001'),
 'persistedProposals', (SELECT count(*) FROM public.platform_course_publication_review_events
   WHERE marketplace_id='70000000-0000-0000-0000-000000000001' AND event_kind='submitted'),
 'fileNamespaceEmpty', NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE 'pcf_v1_%'),
 'historyDigest', (SELECT public.pcr_v2_sha(coalesce(jsonb_agg(to_jsonb(e) ORDER BY sequence),'[]'))
   FROM public.platform_course_publication_review_events e),
 'retainedResultsDigest', (SELECT public.pcr_v2_sha(coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]'))
   FROM public.qa_retained_results r),
 'readFunctionCount', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('pcr_v2_review_source_context','read_platform_course_publication_review_context'))
);
"""
        before = json.loads(command("06r-00-original-read13-preflight", base + ["-A", "-t", "-c", snapshot_sql]).stdout.decode("utf-8").strip())
        if (before["database"] != "sintagma_pcr_v4_r2_lab_20261028" or before["address"] != "127.0.0.1"
                or before["port"] != 5432 or before["version"] != "170011"
                or before["data_directory"] != "/var/lib/postgresql/data" or before["actor"] != "postgres"
                or before["marker"] != "source-reviewed-root-run-only" or before["fixtureRows"] != 2
                or before["clientFixtureRows"] != 1 or before["persistedProposals"] < 1
                or before["fileNamespaceEmpty"] is not True or before["readFunctionCount"] != 0):
            raise RuntimeError("EXACT_PRESERVED_CORE48_FIXTURE_BEFORE_FILE_AUTHORITY_REQUIRED")
        proof["preflight"] = before
        proof["candidateCommitState"] = "REQUESTED_OUTCOME_UNKNOWN"
        command("06r-01-additive-read-candidate", base + ["-f", "-"], (here / "persisted-review-context.candidate.sql").read_bytes())
        proof["candidateCommitState"] = "COMMITTED_NATIVE_PSQL_EXIT0_ACK"
        result = command("06r-02-original-thirteen-read-cases", base + ["-f", "-"], (here / "persisted-review-context-regression.sql").read_bytes())
        proof["actualCases"] = re.findall(r"PCR_READ_UNIT_PASS\s+(PCRUIR\d{2})\b", result.stderr.decode("utf-8", errors="strict"))
        if proof["actualCases"] != ["PCRUIR" + str(i).zfill(2) for i in range(1, 14)]:
            raise RuntimeError("EXACT_ORIGINAL_THIRTEEN_READ_IDENTITIES_REQUIRED")
        after = json.loads(command("06r-03-read13-history-readback", base + ["-A", "-t", "-c", snapshot_sql]).stdout.decode("utf-8").strip())
        proof["post"] = after
        if after != {**before, "readFunctionCount": 2}:
            raise RuntimeError("ORIGINAL_READ13_ROLLBACK_OR_FIXTURE_PRESERVATION_FAILED")
        proof["status"] = "PASS_ORIGINAL13_MINIMAL_SYNTHETIC_NATIVE_UNIT_NOT_CLOUD_AUTH"
    except Exception as error:
        proof["status"] = "FAIL_ORIGINAL_READ13_OR_GUARD_NO_RETRY"
        proof["errorType"], proof["errorCode"] = type(error).__name__, str(error)[:500]
        raise
    finally:
        proof["sourceUnchanged"] = bool(pins) and all(
            hashlib.sha256((here / p["path"]).read_bytes()).hexdigest() == p["sha256"] for p in pins)
        (output / "06r-read13-result.json").write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")
    if not proof["sourceUnchanged"]:
        raise RuntimeError("READ13_SOURCE_CHANGED_AFTER_EXECUTION")
    return proof
