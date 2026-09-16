// @vitest-environment jsdom
// Opt-in disposable PostgreSQL fixture. Never uses PGHOST, DATABASE_URL, Supabase,
// production credentials, SMTP or an existing database/server.
// ORDINARY_CLAIMS_PG_BIN must point to an already installed PostgreSQL bin folder.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

const root = resolve(process.cwd(), "supabase");
const migrationPath = join(root, "migrations/20260908010000_ordinary_campaign_claims.sql");
const migration = readFileSync(migrationPath, "utf8");
const pgBin = process.env.ORDINARY_CLAIMS_PG_BIN;
const exe = (name: string) => join(pgBin!, `${name}${process.platform === "win32" ? ".exe" : ""}`);
const fixtureEnabled = !!pgBin && existsSync(exe("initdb")) && existsSync(exe("pg_ctl"));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const c = id(1), other = id(2), r1 = id(11), r2 = id(12), run = id(21), run2 = id(22);
const attempt = id(31), attempt2 = id(32), user = id(41);
const messageId = `<ordinary.${attempt}@fixture.invalid>`;
let fixtureDir = "", dataDir = "", port = 0, started = false;

describe("ordinary claims migration source contract", () => {
  it("is additive, owner-only and has no scheduler/SMTP/quota or time-based reclaim", () => {
    expect(migration).toContain("ordinary_campaign_one_active_run");
    expect(migration).toContain("UNIQUE (campaign_id, recipient_id)");
    expect(migration).toContain("FROM PUBLIC,anon,authenticated");
    expect(migration).not.toMatch(/cron\.schedule|net\.http_post|DELETE FROM public\.ordinary_campaign|claimed_at\s*</i);
    expect(migration).not.toMatch(/PERFORM public\.(consume_email_quota|claim_org_email_quota)/i);
  });
});

function args() {
  return ["-X", "-q", "-A", "-t", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
}
function query(sql: string): string {
  return execFileSync(exe("psql"), args(), {
    input: `SET request.jwt.claim.role = 'service_role';\n${sql}`,
    encoding: "utf8", windowsHide: true, stdio: ["pipe","pipe","pipe"], timeout: 15_000,
  }).trim();
}
function result(sql: string): any {
  const lines = query(sql).split(/\r?\n/).filter(line => line.startsWith("{"));
  return JSON.parse(lines.at(-1)!);
}
function concurrentQuery(sql: string): Promise<any> {
  return new Promise((accept, reject) => {
    const child = spawn(exe("psql"), args(), { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", value => { stdout += value.toString(); });
    child.stderr.on("data", value => { stderr += value.toString(); });
    child.on("error", reject);
    child.on("close", code => code === 0
      ? accept(JSON.parse(stdout.split(/\r?\n/).find(line => line.startsWith("{"))!))
      : reject(new Error(stderr)));
    child.stdin.end(`SET request.jwt.claim.role='service_role'; ${sql}`);
  });
}
function claim(token = run, expected = "NULL", service = false, consent = true, campaign = c) {
  return `SELECT public.claim_ordinary_campaign_run('${campaign}','${token}',${expected},${service},${consent},'${user}');`;
}
function claimRecipient(token = attempt, recipient = r1, runToken = run, campaign = c) {
  return `SELECT public.claim_ordinary_campaign_recipient('${campaign}','${recipient}','${runToken}','${token}');`;
}
function transition(state: string, opts: { token?: string; recipient?: string; runToken?: string; message?: string | null; category?: string | null } = {}) {
  const msg = opts.message === undefined ? messageId : opts.message;
  const sqlString = (value: string | null | undefined) => value == null ? "NULL" : `'${value.replaceAll("'", "''")}'`;
  return `SELECT public.transition_ordinary_campaign_attempt('${c}','${opts.recipient || r1}',
    '${opts.runToken || run}','${opts.token || attempt}','${state}',${sqlString(msg)},${sqlString(opts.category)});`;
}
function finish(outcome: string, token = run) {
  return `SELECT public.finish_ordinary_campaign_run('${c}','${token}','${outcome}');`;
}

describe.skipIf(!fixtureEnabled)("ordinary claims real PostgreSQL isolated fixture", () => {
  beforeAll(async () => {
    const repoRoot = resolve(root, "..");
    const parent = join(repoRoot, "work", "ordinary-claims-fixtures");
    mkdirSync(parent, { recursive: true });
    fixtureDir = mkdtempSync(join(parent, "pg17-"));
    dataDir = join(fixtureDir, "data");
    port = await new Promise<number>((accept, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") return reject(new Error("fixture port unavailable"));
        server.close(error => error ? reject(error) : accept(address.port));
      });
    });
    execFileSync(exe("initdb"), ["-D", dataDir, "-U", "postgres", "--auth=trust", "--encoding=UTF8", "--no-locale"],
      { windowsHide: true, encoding: "utf8", timeout: 45_000 });
    try {
      // Detached postgres must not inherit the test runner's output pipes on Windows.
      execFileSync(exe("pg_ctl"), ["-D", dataDir, "-l", join(fixtureDir, "postgres.log"), "-w", "-t", "30", "-o",
        `-h 127.0.0.1 -p ${port} -c fsync=off`, "start"],
      { windowsHide: true, stdio: "ignore", timeout: 40_000 });
    } finally {
      started = existsSync(join(dataDir,"postmaster.pid"));
    }
    query(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS
        $$ SELECT current_setting('request.jwt.claim.role', true) $$;
      GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
      CREATE TABLE public.email_campaigns (
        id uuid PRIMARY KEY, scope text NOT NULL DEFAULT 'platform', organization_id uuid,
        name text NOT NULL DEFAULT 'Synthetic fixture', subject text DEFAULT 'Fixture', html_body text DEFAULT '<p>Fixture</p>',
        status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','scheduled','sending','completed','failed','paused')),
        created_by uuid, updated_at timestamptz DEFAULT '2026-09-07T00:00:00Z',
        from_name text, reply_to text, sender_id uuid, manual_emails text[], recipient_source text DEFAULT 'manual',
        recipient_filter jsonb DEFAULT '{}', campaign_mode text DEFAULT 'permission_marketing', delivery_mode text DEFAULT 'standard',
        ab_test_enabled boolean DEFAULT false,subject_b text,ab_winner text,ab_sample_started_at timestamptz,ab_winner_picked_at timestamptz,
        scheduled_at timestamptz, started_at timestamptz, completed_at timestamptz,
        user_paused boolean NOT NULL DEFAULT false, paused_reason text,
        consent_confirmed_at timestamptz, consent_confirmed_by uuid, operator_attested_at timestamptz,
        total_recipients int DEFAULT 0, sent_count int DEFAULT 0, failed_count int DEFAULT 0,
        open_count int DEFAULT 0, click_count int DEFAULT 0, unsubscribe_count int DEFAULT 0
      );
      CREATE FUNCTION public.fixture_updated_at() RETURNS trigger LANGUAGE plpgsql AS
        $$ BEGIN NEW.updated_at=clock_timestamp(); RETURN NEW; END $$;
      CREATE TRIGGER fixture_updated_at BEFORE UPDATE ON public.email_campaigns
        FOR EACH ROW EXECUTE FUNCTION public.fixture_updated_at();
      CREATE TABLE public.email_campaign_recipients (
        id uuid PRIMARY KEY, campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id), email text NOT NULL,
        recipient_name text, custom_data jsonb, subject_variant text, status text NOT NULL DEFAULT 'pending'
          CHECK(status IN('pending','sent','failed','bounced','opened')),
        error text, sent_at timestamptz, opened_at timestamptz
      );
      CREATE TABLE public.mailing_send_jobs(id uuid PRIMARY KEY,campaign_id uuid);
      CREATE TABLE public.email_campaign_consent_log (
        campaign_id uuid,organization_id uuid,scope text,confirmed_by uuid,method text
      );
    `);
    query(readFileSync(join(root, "migrations/20260805120639_83a748c1-f0a7-4cf6-bbfd-16e464f7f92a.sql"), "utf8"));
    query(migration);
  }, 100_000);

  afterAll(() => {
    if (started) {
      execFileSync(exe("pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "-t", "20", "stop"],
        { windowsHide: true, stdio: "ignore", timeout: 25_000 });
      started = false;
    }
    // Keep this task-owned fixture directory/log on D: as evidence. No recursive delete.
  }, 30_000);

  beforeEach(() => {
    query(`TRUNCATE public.ordinary_campaign_attempts,public.ordinary_campaign_runs,
      public.email_campaign_recipients,public.mailing_send_jobs,public.email_campaign_consent_log,public.email_campaigns;
      INSERT INTO public.email_campaigns(id) VALUES('${c}'),('${other}');
      INSERT INTO public.email_campaign_recipients(id,campaign_id,email)
        VALUES('${r1}','${c}','one@fixture.invalid'),('${r2}','${c}','two@fixture.invalid');`);
  });

  it("denies authenticated/anon RPCs and direct service ledger writes", () => {
    for (const role of ["anon", "authenticated"]) {
      expect(() => query(`SET ROLE ${role}; ${claim()}`)).toThrow(/permission denied/);
      expect(() => query(`SET ROLE ${role}; SELECT * FROM public.ordinary_campaign_attempts;`)).toThrow(/permission denied/);
    }
    expect(() => query(`SET request.jwt.claim.role='authenticated'; ${claim()}`)).toThrow(/service_role_required/);
    expect(() => query(`SET ROLE service_role; INSERT INTO public.ordinary_campaign_runs(run_token,campaign_id,state,initial_status)
      VALUES('${run}','${c}','running','draft');`)).toThrow(/permission denied/);
  });

  it("checks version before consent writes; records consent atomically and refreshes draft flag", () => {
    expect(result(claim(run, "'2020-01-01'"))).toMatchObject({ claimed: false, reason: "campaign_changed" });
    expect(query("SELECT count(*) FROM public.email_campaign_consent_log;")).toBe("0");
    expect(query(`SELECT status FROM public.email_campaigns WHERE id='${c}';`)).toBe("draft");
    query(`UPDATE public.email_campaigns SET recipient_filter='{"draft_consent_confirmed":false}' WHERE id='${c}';`);
    const stamp = query(`SELECT updated_at FROM public.email_campaigns WHERE id='${c}';`);
    expect(result(claim(run, `'${stamp}'`))).toMatchObject({ claimed: true });
    expect(query(`SELECT recipient_filter->>'draft_consent_confirmed' FROM public.email_campaigns WHERE id='${c}';`)).toBe("true");
    expect(query("SELECT count(*) FROM public.email_campaign_consent_log;")).toBe("1");
  });

  it("has one winner across two real PG sessions, with no stale takeover", async () => {
    const outcomes = await Promise.all([
      concurrentQuery(`BEGIN; ${claim()} SELECT pg_sleep(0.25); COMMIT;`),
      concurrentQuery(claim(run2)),
    ]);
    expect(outcomes.filter(row => row.claimed)).toHaveLength(1);
    query("UPDATE public.ordinary_campaign_runs SET claimed_at='2000-01-01';");
    expect(result(claim(id(23)))).toMatchObject({ claimed: false, reason: "already_running" });
    expect(query("SELECT count(*) FROM public.email_campaign_consent_log;")).toBe("1");
  });

  it("guards service consent/manual pause and fast/managed/future campaigns", () => {
    expect(result(claim(run, "NULL", true))).toMatchObject({ claimed: false, reason: "consent_required" });
    query(`UPDATE public.email_campaigns SET consent_confirmed_at=now(),user_paused=true WHERE id='${c}';`);
    expect(result(claim(run, "NULL", true))).toMatchObject({ claimed: false, reason: "user_paused" });
    query(`UPDATE public.email_campaigns SET user_paused=false,status='scheduled',scheduled_at=now()+interval '1 day' WHERE id='${c}';`);
    expect(result(claim())).toMatchObject({ claimed: false, reason: "scheduled_in_future" });
    query(`UPDATE public.email_campaigns SET status='draft',delivery_mode='fast_2_day' WHERE id='${c}';`);
    expect(result(claim())).toMatchObject({ claimed: false, reason: "managed_by_mailing_send_jobs" });
    query(`UPDATE public.email_campaigns SET delivery_mode='standard' WHERE id='${c}';
      INSERT INTO public.mailing_send_jobs VALUES('${id(91)}','${c}');`);
    expect(result(claim())).toMatchObject({ claimed: false, reason: "managed_by_mailing_send_jobs" });
  });

  it("preserves cold-outreach attestation gate and blocks unowned sending", () => {
    query(`UPDATE public.email_campaigns SET campaign_mode='cold_outreach' WHERE id='${c}';`);
    expect(result(claim())).toMatchObject({ claimed: false, reason: "operator_attestation_required" });
    query(`UPDATE public.email_campaigns SET operator_attested_at=now(),status='sending',started_at='2000-01-01' WHERE id='${c}';`);
    expect(result(claim())).toMatchObject({ claimed: false, reason: "unowned_sending_requires_review" });
  });

  it("freezes campaign/recipient configuration and cron status theft", () => {
    expect(result(claim()).claimed).toBe(true);
    for (const mutation of ["subject='changed'", "sender_id='00000000-0000-4000-8000-000000000099'",
      "manual_emails=ARRAY['changed@fixture.invalid']", "recipient_filter='{}'", "consent_confirmed_at=NULL"]) {
      expect(() => query(`UPDATE public.email_campaigns SET ${mutation} WHERE id='${c}';`)).toThrow(/configuration_locked/);
    }
    expect(() => query(`UPDATE public.email_campaigns SET status='draft' WHERE id='${c}';`)).toThrow(/status_owned_by_run/);
    expect(() => query(`UPDATE public.email_campaign_recipients SET email='changed@fixture.invalid' WHERE id='${r1}';`)).toThrow(/configuration_locked/);
    expect(() => query(`DELETE FROM public.email_campaign_recipients WHERE id='${r1}';`)).toThrow(/configuration_locked/);
    query(`INSERT INTO public.email_campaign_recipients(id,campaign_id,email) VALUES('${id(19)}','${other}','foreign@fixture.invalid');`);
    expect(() => query(`UPDATE public.email_campaign_recipients SET campaign_id='${c}' WHERE id='${id(19)}';`)).toThrow(/campaign_immutable/);
    expect(() => query(`UPDATE public.email_campaigns SET ab_winner='B' WHERE id='${c}';`)).toThrow(/configuration_locked/);
    expect(() => query(`UPDATE public.email_campaign_recipients SET subject_variant='B' WHERE id='${r1}';`)).toThrow(/configuration_locked/);
    expect(() => query(`UPDATE public.email_campaign_recipients SET status='sent' WHERE id='${r1}';`)).toThrow(/status_owned_by_attempt/);
    expect(() => query(`UPDATE public.email_campaign_recipients SET error='forged' WHERE id='${r1}';`)).toThrow(/status_owned_by_attempt/);
    query(`UPDATE public.email_campaigns SET open_count=1 WHERE id='${c}';`);
  });

  it("atomically claims recipient once and rejects foreign run/recipient before writes", async () => {
    result(claim());
    expect(result(claimRecipient(attempt, r1, run2))).toMatchObject({ claimed: false, reason: "run_not_active" });
    expect(result(claimRecipient(attempt, id(999)))).toMatchObject({ claimed: false, reason: "recipient_mismatch" });
    const outcomes = await Promise.all([concurrentQuery(claimRecipient()), concurrentQuery(claimRecipient(attempt2))]);
    expect(outcomes.filter(row => row.claimed)).toHaveLength(1);
    expect(query("SELECT count(*) FROM public.ordinary_campaign_attempts;")).toBe("1");
  });

  it("only the attempt owner advances, stores immutable Message-ID and counts once", () => {
    result(claim()); result(claimRecipient());
    expect(result(transition("dispatching", { token: attempt2 }))).toMatchObject({ transitioned: false, reason: "attempt_mismatch" });
    expect(result(transition("dispatching", { message: null }))).toMatchObject({ transitioned: false });
    expect(result(transition("dispatching"))).toMatchObject({ transitioned: true, smtp_message_id: messageId });
    expect(result(transition("sent", { message: "<different@fixture.invalid>" }))).toMatchObject({ transitioned: false, reason: "message_id_immutable" });
    expect(result(transition("sent"))).toMatchObject({ transitioned: true });
    expect(result(transition("sent"))).toMatchObject({ transitioned: false, reason: "invalid_transition" });
    expect(query(`SELECT sent_count FROM public.email_campaigns WHERE id='${c}';`)).toBe("1");
    expect(result(claimRecipient(attempt2))).toMatchObject({ claimed: false, reason: "attempt_exists", state: "sent" });
    query(`UPDATE public.email_campaign_recipients SET status='opened',opened_at=now() WHERE id='${r1}';`);
    expect(query(`SELECT status FROM public.email_campaign_recipients WHERE id='${r1}';`)).toBe("opened");
  });

  it("distinguishes preSMTP failure from uncertain and forbids automatic resend", () => {
    result(claim()); result(claimRecipient());
    expect(result(transition("failed", { message: null, category: "suppression_lookup_failed" }))).toMatchObject({ transitioned: true });
    expect(result(claimRecipient(attempt2))).toMatchObject({ claimed: false, state: "failed" });
    result(claimRecipient(attempt2, r2));
    result(transition("dispatching", { recipient: r2, token: attempt2 }));
    expect(result(transition("failed", { recipient: r2, token: attempt2, category: "timeout" }))).toMatchObject({ transitioned: false });
    expect(result(transition("uncertain", { recipient: r2, token: attempt2, category: "smtp_unknown" }))).toMatchObject({ transitioned: true });
    expect(result(finish("completed"))).toMatchObject({ status: "paused", run_state: "uncertain", counts: { unresolved: 1 } });
    expect(result(claim(run2))).toMatchObject({ claimed: false, reason: "manual_reconciliation_required" });
    expect(result(transition("sent", { recipient: r2, token: attempt2 }))).toMatchObject({ transitioned: false });
  });

  it("late known acceptance can resolve dispatching but never unpause uncertain run", () => {
    result(claim()); result(claimRecipient()); result(transition("dispatching"));
    expect(result(finish("uncertain"))).toMatchObject({ run_state: "uncertain" });
    expect(result(transition("sent"))).toMatchObject({ transitioned: true });
    expect(result(finish("completed"))).toMatchObject({ finished: false, reason: "run_not_active" });
    expect(query(`SELECT status||':'||user_paused FROM public.email_campaigns WHERE id='${c}';`)).toBe("paused:true");
  });

  it("does not fake completed for zero rows, A/B leftovers or unresolved attempts", () => {
    result(claim());
    expect(result(finish("completed"))).toMatchObject({ status: "paused", reason: "pending_recipients_remain" });
    query(`DELETE FROM public.email_campaign_recipients; UPDATE public.email_campaigns SET status='draft',paused_reason=NULL,user_paused=false WHERE id='${c}';`);
    result(claim(run2));
    expect(result(finish("completed", run2))).toMatchObject({ status: "paused", reason: "empty_materialization" });
  });

  it("restores initial draft before SMTP, holds quota-unknown and never resets attempts", () => {
    result(claim());
    expect(result(finish("preflight_failed"))).toMatchObject({ status: "draft", run_state: "finished" });
    result(claim(run2));
    expect(result(finish("quota_unknown", run2))).toMatchObject({ status: "paused", run_state: "uncertain", reason: "quota_unknown" });
    expect(result(claim(id(23)))).toMatchObject({ claimed: false });
  });

  it("completes only after all attempts have known outcomes and does not double-count", () => {
    result(claim()); result(claimRecipient()); result(transition("dispatching")); result(transition("sent"));
    result(claimRecipient(attempt2,r2)); result(transition("dispatching",{token:attempt2,recipient:r2}));
    expect(result(transition("failed",{token:attempt2,recipient:r2,category:"smtp_rejected"})))
      .toMatchObject({transitioned:true});
    expect(result(finish("completed"))).toMatchObject({status:"completed",run_state:"finished",
      counts:{total:2,pending:0,sent:1,failed:1,unresolved:0}});
    expect(result(finish("completed"))).toMatchObject({finished:false,reason:"run_not_active"});
    expect(result(claim(run2))).toMatchObject({claimed:false,reason:"campaign_not_startable"});
  });

  it("manual pause prevents an already claimed attempt from entering SMTP dispatch", () => {
    result(claim()); result(claimRecipient());
    query(`UPDATE public.email_campaigns SET user_paused=true WHERE id='${c}';`);
    expect(result(transition("dispatching"))).toMatchObject({transitioned:false,reason:"dispatch_not_allowed"});
    expect(result(claimRecipient(attempt2,r2))).toMatchObject({claimed:false,reason:"run_not_active"});
    expect(result(finish("paused"))).toMatchObject({status:"paused",run_state:"uncertain"});
  });

  it("allows safe quota retry and waits for A/B winner without spawning another run", () => {
    result(claim());
    expect(result(`SELECT public.finish_ordinary_campaign_run('${c}','${run}','paused','quota_denied');`))
      .toMatchObject({ status: "paused", reason: "quota" });
    expect(query(`SELECT user_paused FROM public.email_campaigns WHERE id='${c}';`)).toBe("f");
    expect(result(claim(run2,"NULL",true))).toMatchObject({ claimed: true });
    result(finish("paused",run2));
    query(`UPDATE public.email_campaigns SET status='draft',paused_reason=NULL,user_paused=false,
      ab_test_enabled=true,subject_b='Fixture B' WHERE id='${c}';
      UPDATE public.email_campaign_recipients SET subject_variant='A' WHERE id='${r1}';`);
    result(claim(id(23)));
    result(claimRecipient(attempt,r1,id(23)));
    result(transition("dispatching",{runToken:id(23)}));
    result(transition("sent",{runToken:id(23)}));
    expect(result(finish("completed",id(23)))).toMatchObject({ status: "paused", reason: "ordinary_ab_wait" });
    expect(result(claim(id(24),"NULL",true))).toMatchObject({ claimed: false, reason: "ab_wait_until_winner" });
    query(`UPDATE public.email_campaigns SET ab_winner='A' WHERE id='${c}';`);
    expect(result(claim(id(24),"NULL",true))).toMatchObject({ claimed: true });
    expect(result(finish("preflight_failed",id(24)))).toMatchObject({ status: "paused",run_state: "finished",reason:"preflight_failed" });
  });
});
