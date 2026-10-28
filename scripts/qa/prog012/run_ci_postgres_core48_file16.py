"""CI-only native PostgreSQL unit runner. No application/deployment entrypoint.

Uses the GitHub job's one fresh, digest-pinned synthetic service via docker exec.
Never starts/stops/removes a container, opens host ports, or accesses production.
"""
import argparse
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import threading
import time

DATABASE = "sintagma_pcr_v4_r2_lab_20261028"
DATA = "/var/lib/postgresql/data"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--container-id", required=True)
    parser.add_argument("--expected-manifest-sha256", required=True)
    parser.add_argument("--expected-integration-manifest-sha256", required=True)
    parser.add_argument("--ci-source-reviewed-only", action="store_true")
    args = parser.parse_args()
    if (not args.ci_source_reviewed_only or os.environ.get("GITHUB_ACTIONS") != "true"
            or sys.platform != "linux" or not re.fullmatch(r"[a-f0-9]{64}", args.container_id)
            or not re.fullmatch(r"[a-f0-9]{64}", args.expected_manifest_sha256)
            or not re.fullmatch(r"[a-f0-9]{64}", args.expected_integration_manifest_sha256)):
        raise RuntimeError("EXPLICIT_GITHUB_LINUX_SERVICE_AND_REVIEWED_SOURCE_REQUIRED")
    run_id, attempt = os.environ.get("GITHUB_RUN_ID", ""), os.environ.get("GITHUB_RUN_ATTEMPT", "")
    if not re.fullmatch(r"[0-9]+", run_id) or not re.fullmatch(r"[0-9]+", attempt):
        raise RuntimeError("GITHUB_RUN_IDENTITY_REQUIRED")
    here = Path(__file__).resolve().parent
    workspace = Path(os.environ["GITHUB_WORKSPACE"]).resolve(strict=True)
    if here != workspace / "scripts/qa/prog012":
        raise RuntimeError("FIXED_CI_SOURCE_DIRECTORY_REQUIRED")
    output = Path(os.environ["RUNNER_TEMP"]).resolve(strict=True) / ("prog012-postgres-unit-" + run_id + "-" + attempt)
    output.mkdir(exist_ok=False)
    env = {key: os.environ[key] for key in ("PATH", "HOME", "LANG", "LC_ALL") if key in os.environ}
    report = {"schemaVersion": 1, "status": "RUNNING", "createdAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "githubSha": os.environ.get("GITHUB_SHA"), "runId": run_id, "runAttempt": attempt,
              "production": False, "ordinaryCloudAuth": False, "fullSchemaParity": False,
              "fullPROG012Accepted": False, "containerLifecycleMutations": 0, "retries": 0,
              "candidateCommitState": "NOT_REQUESTED", "stages": [], "nativeSessionExits": []}
    source_pins = []
    integration_source_pins = []
    manifest_path = here / "ci-inputs.json"

    def command(label, argv, data=None, timeout=120):
        started = time.monotonic()
        try:
            result = subprocess.run(argv, input=data, env=env, cwd=str(here), capture_output=True,
                                    timeout=timeout, shell=False)
        except subprocess.TimeoutExpired as error:
            (output / (label + ".stdout.log")).write_bytes(error.stdout or b"")
            (output / (label + ".stderr.log")).write_bytes(error.stderr or b"")
            report["stages"].append({"label": label, "timedOut": True, "timeoutSeconds": timeout,
                                     "durationMs": round((time.monotonic() - started) * 1000)})
            raise
        (output / (label + ".stdout.log")).write_bytes(result.stdout)
        (output / (label + ".stderr.log")).write_bytes(result.stderr)
        report["stages"].append({"label": label, "exitCode": result.returncode,
            "durationMs": round((time.monotonic() - started) * 1000),
            "stdoutSHA256": sha(result.stdout), "stderrSHA256": sha(result.stderr)})
        if result.returncode != 0:
            raise RuntimeError("NATIVE_PROCESS_FAILED_" + label)
        return result

    try:
        integration_bytes = (here / "ci-integration-inputs.json").read_bytes()
        if sha(integration_bytes) != args.expected_integration_manifest_sha256:
            raise RuntimeError("REVIEWED_INTEGRATED_CI_ENTRYPOINT_REQUIRED")
        integration_source_pins = json.loads(integration_bytes)["files"]
        if len(integration_source_pins) != 3:
            raise RuntimeError("EXACT_THREE_INTEGRATION_CHAIN_INPUTS_REQUIRED")
        for pin in integration_source_pins:
            target = (here / pin["path"]).resolve(strict=True)
            if target.parent != here or target.stat().st_size != pin["bytes"] or sha(target.read_bytes()) != pin["sha256"]:
                raise RuntimeError("INTEGRATED_CI_SOURCE_DRIFT")
        manifest_bytes = manifest_path.read_bytes()
        if sha(manifest_bytes) != args.expected_manifest_sha256:
            raise RuntimeError("REVIEWED_CI_INPUT_MANIFEST_REQUIRED")
        manifest = json.loads(manifest_bytes)
        source_pins = manifest["files"]
        if len(source_pins) != 6:
            raise RuntimeError("EXACT_SIX_CI_INPUTS_REQUIRED")
        for pin in source_pins:
            source = (here / pin["path"]).resolve(strict=True)
            if source.parent != here or source.stat().st_size != pin["bytes"] or sha(source.read_bytes()) != pin["sha256"]:
                raise RuntimeError("FROZEN_CI_SOURCE_DRIFT")
        docker = shutil.which("docker", path=env.get("PATH"))
        if not docker:
            raise RuntimeError("GITHUB_DOCKER_CLI_REQUIRED")
        inspect = command("00-container-inspect", [docker, "container", "inspect", args.container_id], timeout=20)
        containers = json.loads(inspect.stdout)
        if len(containers) != 1:
            raise RuntimeError("ONE_SERVICE_CONTAINER_REQUIRED")
        container = containers[0]
        ports = container.get("NetworkSettings", {}).get("Ports", {}) or {}
        host = container.get("HostConfig", {})
        state = container.get("State", {})
        if (container.get("Id") != args.container_id or state.get("Running") is not True
                or state.get("Health", {}).get("Status") != "healthy"
                or container.get("Config", {}).get("Image") != manifest["image"]["reference"]
                or container.get("Image") != manifest["image"]["configDigest"]
                or host.get("NetworkMode") in (None, "", "host", "bridge", "none")
                or not container.get("NetworkSettings", {}).get("Networks")
                or host.get("PortBindings") or any(value for value in ports.values())
                or any(mount.get("Type") == "bind" for mount in container.get("Mounts", []))):
            raise RuntimeError("PINNED_FRESH_JOB_SERVICE_NO_HOST_PORTS_OR_BINDS_REQUIRED")
        report["service"] = {"id": args.container_id, "image": container["Config"]["Image"],
            "imageId": container["Image"], "startedAt": state.get("StartedAt"), "pid": state.get("Pid"),
            "networkMode": host.get("NetworkMode"), "publishedPorts": False}
        # The service contains only the official image and synthetic CI settings.
        # No host files are mounted. Host scripts stream through native psql stdin.
        exec_base = [docker, "exec", "-i", "--env", "PGCLIENTENCODING=UTF8", "--env",
                "PGOPTIONS=-c pcr.lab_authorized=source-reviewed-root-run-only", args.container_id]
        psql_args = ["-X", "-q", "-v", "ON_ERROR_STOP=1", "--no-password",
                "--host=127.0.0.1", "--port=5432", "--username=postgres", "--dbname=" + DATABASE]
        # File stages keep native stdout/stderr separate for notice assertions.
        base = exec_base + ["psql"] + psql_args
        # Join interactive stderr inside the container, before Docker multiplexes
        # its streams; otherwise stdout PCR_DONE can overtake an earlier error.
        # The shell program is constant; every psql option remains a distinct argv
        # item, and all SQL still travels only through the original Session stdin.
        interactive_base = exec_base + ["sh", "-c", 'exec psql "$@" 2>&1', "pcr-ci"] + psql_args
        version = command("00-psql-version", [docker, "exec", args.container_id, "psql", "--version"], timeout=20)
        if not re.fullmatch(r"psql \(PostgreSQL\) 17\.11(?:[^\r\n]*)\r?\n?", version.stdout.decode("utf-8")):
            raise RuntimeError("EXACT_PSQL_1711_REQUIRED")
        preflight = command("00-database-preflight", base + ["-A", "-t", "-c",
            "SELECT json_build_object('database',current_database(),'address',host(inet_server_addr()),"
            "'port',inet_server_port(),'data_directory',current_setting('data_directory'),'actor',current_user,"
            "'version',current_setting('server_version_num'),'marker',current_setting('pcr.lab_authorized',true),"
            "'empty',to_regclass('public.courses') IS NULL AND to_regclass('auth.users') IS NULL "
            "AND to_regclass('public.platform_course_publication_review_events') IS NULL);"], timeout=20)
        observed = json.loads(preflight.stdout.decode("utf-8").strip())
        if (observed["database"] != DATABASE or observed["address"] != "127.0.0.1" or observed["port"] != 5432
                or observed["data_directory"] != DATA or observed["actor"] != "postgres" or observed["version"] != "170011"
                or observed["marker"] != "source-reviewed-root-run-only" or observed["empty"] is not True):
            raise RuntimeError("EXACT_EMPTY_SYNTHETIC_POSTGRES1711_DATABASE_REQUIRED")
        report["preflight"] = observed
        for label, filename in (("01-bootstrap", "minimal-unit-bootstrap.sql"),
                ("02-candidate", "platform_template_publication_review.candidate.sql"),
                ("03-regressions", "review-gate-regression.sql")):
            if label == "02-candidate":
                report["candidateCommitState"] = "UNKNOWN_UNTIL_NATIVE_SUCCESS_ACK"
            result = command(label, base + ["-f", "-"], (here / filename).read_bytes())
            if label == "02-candidate":
                report["candidateCommitState"] = "COMMITTED_NATIVE_PSQL_EXIT0_ACK"
        stderr = result.stderr.decode("utf-8", errors="strict")
        ids = re.findall(r"PCR_UNIT_PASS\s+(PCRV2S\d{2})\b", stderr)
        if ids != ["PCRV2S" + str(i).zfill(2) for i in range(1, 19)]:
            raise RuntimeError("EXACT_EIGHTEEN_BASE_IDENTITIES_REQUIRED")
        report["actualCases"] = ids
        auth_ids = re.findall(r"PCR_AUTH_SUBCASE_PASS\s+(S02_[A-Z_]+)\b", stderr)
        if auth_ids != ["S02_NULL_ROLE_POSITIVE_ADMIN_DENIED", "S02_SAME_ADMIN_AUTHENTICATED_ALLOWED"]:
            raise RuntimeError("EXACT_TWO_AUTH_SUBGROUPS_REQUIRED")
        report["actualAuthSubgroups"] = auth_ids
        spec = importlib.util.spec_from_file_location("pcr_ci_native_concurrency", here / "concurrency_cases.py")
        cases = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cases)
        with (output / "04-concurrency.jsonl").open("w", encoding="utf-8") as trace_file:
            trace_guard = threading.Lock()
            def trace(item):
                with trace_guard:
                    trace_file.write(json.dumps(item, ensure_ascii=False) + "\n")
                    trace_file.flush()
            original_close = cases.Session.close
            closed = set()
            def checked_close(session):
                if session.proc.pid in closed:
                    return
                close_error = None
                try:
                    original_close(session)
                except Exception as error:
                    # Cleanup evidence never replaces an already raised test failure.
                    close_error = type(error).__name__
                if session.proc.poll() is None:
                    try:
                        session.proc.kill()
                        session.proc.wait(timeout=5)
                    except Exception as error:
                        close_error = close_error or type(error).__name__
                receipt = {"session": session.name, "pid": session.proc.pid,
                           "exitCode": session.proc.poll(), "closeError": close_error}
                report["nativeSessionExits"].append(receipt)
                closed.add(session.proc.pid)
                trace({"nativeProcessExit": receipt})
            cases.Session.close = checked_close
            actual = cases.run_cases(interactive_base, env, trace)
        if (not report["nativeSessionExits"] or any(r["exitCode"] != 0 or r["closeError"] for r in report["nativeSessionExits"])):
            raise RuntimeError("ALL_NATIVE_CONCURRENT_CLIENTS_MUST_EXIT_NATURALLY_ZERO")
        if [name.split(" ", 1)[0] for name in actual] != ["PCRV2C" + str(i).zfill(2) for i in range(1, 19)]:
            raise RuntimeError("EXACT_EIGHTEEN_CONCURRENCY_IDENTITIES_REQUIRED")
        report["actualConcurrencyCases"] = actual
        extra = command("05-cascade-extra-ten", base + ["-f", "-"], (here / "cascade-extra-ten.sql").read_bytes())
        extra_ids = re.findall(r"PCR_CASCADE_SUBCASE_PASS\s+([A-Z0-9_]+)\b", extra.stderr.decode("utf-8", errors="strict"))
        if extra_ids != ["C15_CLIENT_COURSE_CASCADE", "C15_CLIENT_LESSON_CASCADE", "C15_CLIENT_MODULE_SET_NULL",
                "C16_OWN_COURSE_CASCADE", "C16_OWN_LESSON_CASCADE", "C16_OWN_MODULE_SET_NULL",
                "C15_NESTED_PARENT_BEFORE_MODULE_SET_NULL", "C15_CANCELLED_CLIENT_PARENT_NO_TOMBSTONE",
                "C15_ORPHAN_INSERT_STILL_REJECTED", "C16_RETAINED_HISTORY_EXACT"]:
            raise RuntimeError("EXACT_TEN_CASCADE_SUBGROUPS_REQUIRED")
        if "PCR_CASCADE_EXTRA10_ROLLBACK_COMPLETE" not in extra.stdout.decode("utf-8", errors="strict"):
            raise RuntimeError("CASCADE_EXTRA10_ROLLBACK_NOT_ACKNOWLEDGED")
        report["actualCascadeSubgroups"] = extra_ids
        file_spec = importlib.util.spec_from_file_location("pcr_ci_native_file_stage", here / "run_file_stage.py")
        file_stage = importlib.util.module_from_spec(file_spec)
        file_spec.loader.exec_module(file_stage)
        report["fileStage"] = file_stage.run_file_stage(
            here, command, base, interactive_base, env, output, report,
            "c90954eaf3df9122bb59eb4f1b7e66a4725b5f1821fcd8f93d5c5e5daed217b4")
        report["status"] = "PASS_MINIMAL_SYNTHETIC_POSTGRES1711_UNIT_NOT_CLOUD_OR_FULL_SCHEMA"
    except Exception as error:
        report["status"] = "FAIL_CI_UNIT_OR_GUARD_NO_RETRY"
        report["errorType"] = type(error).__name__
        report["errorCode"] = str(error)[:500]
    finally:
        report["cleanupFailures"] = [r for r in report["nativeSessionExits"] if r["exitCode"] != 0 or r["closeError"]]
        report["sourceUnchanged"] = bool(source_pins) and all(
            sha((here / p["path"]).read_bytes()) == p["sha256"] for p in source_pins)
        report["integrationSourceUnchanged"] = bool(integration_source_pins) and all(
            sha((here / p["path"]).read_bytes()) == p["sha256"] for p in integration_source_pins)
        if report["status"].startswith("PASS_") and (not report["sourceUnchanged"] or not report["integrationSourceUnchanged"] or report["cleanupFailures"]):
            report["status"] = "FAIL_SOURCE_OR_NATIVE_EXIT_CHANGED"
        (output / "result.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "report": str(output / "result.json")}))
    return 0 if report["status"].startswith("PASS_") else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, OSError, ValueError) as error:
        print(json.dumps({"status": "STOP_BEFORE_SQL", "errorType": type(error).__name__, "errorCode": str(error)[:500]}))
        sys.exit(2)
