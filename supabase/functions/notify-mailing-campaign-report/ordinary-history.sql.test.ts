// @vitest-environment jsdom
// Opt-in disposable PostgreSQL17, localhost only. No existing DB, SMTP, Telegram,
// credentials, remote network, or production migration. Artifacts remain on D:.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

const root=resolve(process.cwd(),"supabase");
const migration=readFileSync(join(root,"migrations/20260908020000_ordinary_mail_history_reports.sql"),"utf8");
const pgBin=process.env.ORDINARY_CLAIMS_PG_BIN;
const exe=(name:string)=>join(pgBin!,`${name}${process.platform==="win32"?".exe":""}`);
const enabled=!!pgBin && existsSync(exe("initdb")) && existsSync(exe("pg_ctl"));
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const c=id(1), c2=id(2), recipient=id(11), recipient2=id(12), run=id(21), run2=id(22);
const attempt=id(31), attempt2=id(32), user=id(41), pool=id(51), pool2=id(52), org=id(61), scan=id(71);
const msg=`<ordinary.${attempt}@fixture.invalid>`, msg2=`<ordinary.${attempt2}@fixture.invalid>`;
let fixtureDir="", dataDir="", port=0, started=false;
const sql=(value:unknown)=>value==null?"NULL":`'${String(value).replaceAll("'","''")}'`;
const json=(value:unknown)=>`${sql(JSON.stringify(value))}::jsonb`;
const args=()=>["-X","-q","-A","-t","-h","127.0.0.1","-p",String(port),"-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1"];
function query(statement:string):string {
  return execFileSync(exe("psql"),args(),{input:`SET request.jwt.claim.role='service_role';\n${statement}`,
    encoding:"utf8",windowsHide:true,stdio:["pipe","pipe","pipe"],timeout:15_000}).trim();
}
function result(statement:string):any {
  return JSON.parse(query(statement).split(/\r?\n/).filter(line=>line.startsWith("{")).at(-1)!);
}
function concurrent(statement:string):Promise<any> {
  return new Promise((accept,reject)=>{
    const child=spawn(exe("psql"),args(),{windowsHide:true,stdio:["pipe","pipe","pipe"]});
    let stdout="",stderr="";
    child.stdout.on("data",data=>{stdout+=String(data);}); child.stderr.on("data",data=>{stderr+=String(data);});
    child.on("error",reject); child.on("close",code=>code===0
      ?accept(JSON.parse(stdout.split(/\r?\n/).filter(line=>line.startsWith("{")).at(-1)!)):reject(new Error(stderr)));
    child.stdin.end(`SET request.jwt.claim.role='service_role'; ${statement}`);
  });
}
function outbound(overrides:Record<string,unknown>={}) {
  return {smtp_message_id:msg,from_email:"sender@fixture.invalid",from_name:"Fixture sender",reply_to:"sender@fixture.invalid",
    sender_kind:"pool",sender_pool_id:pool,subject:"Personalized fixture",html_body:"<p>Only synthetic body</p>",
    text_body:"Only synthetic body",...overrides};
}
function prepare(payload=outbound(), campaign=c, rec=recipient, runToken=run, token=attempt) {
  return `SELECT public.prepare_ordinary_campaign_message('${campaign}','${rec}','${runToken}','${token}',${json(payload)});`;
}
function transition(state:string,campaign=c,rec=recipient,runToken=run,token=attempt,message=msg,category:string|null=null) {
  return `SELECT public.transition_ordinary_campaign_attempt('${campaign}','${rec}','${runToken}','${token}',${sql(state)},${sql(message)},${sql(category)});`;
}
function begin(campaign=c,rec=recipient,runToken=run,token=attempt) {
  expect(result(`SELECT public.claim_ordinary_campaign_run('${campaign}','${runToken}',NULL,false,true,'${user}');`).claimed).toBe(true);
  expect(result(`SELECT public.claim_ordinary_campaign_recipient('${campaign}','${rec}','${runToken}','${token}');`).claimed).toBe(true);
}
function send(payload=outbound(),campaign=c,rec=recipient,runToken=run,token=attempt,message=msg) {
  begin(campaign,rec,runToken,token);
  expect(result(prepare(payload,campaign,rec,runToken,token)).prepared).toBe(true);
  expect(result(transition("dispatching",campaign,rec,runToken,token,message)).transitioned).toBe(true);
  expect(result(transition("sent",campaign,rec,runToken,token,message)).transitioned).toBe(true);
}
function finish(outcome="completed",campaign=c,runToken=run) {
  return result(`SELECT public.finish_ordinary_campaign_run('${campaign}','${runToken}',${sql(outcome)});`);
}
function beginScan(sender=pool,token=scan,validity=100) {
  expect(result(`SELECT public.claim_ordinary_inbox_scan('${sender}','${token}');`).claimed).toBe(true);
  expect(result(`SELECT public.checkpoint_ordinary_inbox_scan('${sender}','${token}',${validity},0);`).updated).toBe(true);
}
function incoming(overrides:Record<string,unknown>={}) {
  return {from_email:"recipient@fixture.invalid",from_name:"Synthetic recipient",to_email:"sender@fixture.invalid",
    subject:"Re: Personalized fixture",body_text:"Synthetic reply only",body_html:"<p>Synthetic reply only</p>",
    message_id:"<reply.1@fixture.invalid>",in_reply_to:msg,references_ids:[msg],received_at:"2026-09-08T00:00:00Z",...overrides};
}
function ingest(message=incoming(),uid=1,validity=100,sender=pool,token=scan) {
  return `SELECT public.store_ordinary_inbox_message('pool','${sender}',${validity},${uid},${json(message)},'${token}');`;
}
const eventId=()=>query("SELECT id FROM public.ordinary_mail_report_events WHERE kind='run_report' ORDER BY created_at LIMIT 1;");
const claimReport=(event=eventId(),token=id(81),target="-12345")=>
  `SELECT public.claim_ordinary_mail_report('${event}','${token}',${sql(target)});`;

describe("ordinary mail history migration source",()=>{
  it("preserves existing cron cadence and uses no new secret or stale takeover",()=>{
    expect(migration).toContain("cron.alter_job");
    expect(migration).toContain("mailing_campaign_cron_secret");
    expect(migration).not.toMatch(/cron\.schedule|create_secret|claimed_at\s*<|pg_sleep|smtp_pass|app_password/i);
    expect(migration).toContain("ordinary_prepared_dispatch_guard");
    expect(migration).toContain("ordinary_message_facts_immutable");
  });
});

describe.skipIf(!enabled)("ordinary mail history real PostgreSQL isolated fixture",()=>{
  beforeAll(async()=>{
    const parent=join(resolve(root,".."),"work","ordinary-history-fixtures"); mkdirSync(parent,{recursive:true});
    fixtureDir=mkdtempSync(join(parent,"pg17-")); dataDir=join(fixtureDir,"data");
    port=await new Promise<number>((accept,reject)=>{
      const server=createServer(); server.once("error",reject); server.listen(0,"127.0.0.1",()=>{
        const address=server.address(); if(!address||typeof address==="string") return reject(new Error("No isolated port"));
        server.close(error=>error?reject(error):accept(address.port));
      });
    });
    execFileSync(exe("initdb"),["-D",dataDir,"-U","postgres","--auth=trust","--encoding=UTF8","--no-locale"],
      {windowsHide:true,encoding:"utf8",timeout:45_000});
    try {
      execFileSync(exe("pg_ctl"),["-D",dataDir,"-l",join(fixtureDir,"postgres.log"),"-w","-t","30","-o",
        `-h 127.0.0.1 -p ${port} -c fsync=off`,"start"],{windowsHide:true,stdio:"ignore",timeout:40_000});
    } finally {started=existsSync(join(dataDir,"postmaster.pid"));}
    query(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${user}'::uuid AND $2='admin' $$;
      GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
      CREATE TABLE public.organizations(id uuid PRIMARY KEY,telegram_notify_enabled boolean DEFAULT false,telegram_notify_chat_id text);
      CREATE TABLE public.email_sender_pool(id uuid PRIMARY KEY,email text NOT NULL,is_active boolean DEFAULT true,
        imap_last_uid bigint DEFAULT 999,imap_last_scan_at timestamptz);
      CREATE TABLE public.mailing_senders(id uuid PRIMARY KEY,organization_id uuid,from_email text,is_active boolean,smtp_status text);
      CREATE TABLE public.org_smtp_settings(organization_id uuid PRIMARY KEY,from_email text);
      CREATE TABLE public.email_campaigns(
        id uuid PRIMARY KEY,scope text NOT NULL DEFAULT 'platform',organization_id uuid,name text DEFAULT 'Synthetic campaign',
        subject text DEFAULT 'Fixture',html_body text DEFAULT '<p>Fixture</p>',status text NOT NULL DEFAULT 'draft',
        created_by uuid,updated_at timestamptz DEFAULT now(),from_name text,reply_to text,sender_id uuid,manual_emails text[],
        recipient_source text DEFAULT 'manual',recipient_filter jsonb DEFAULT '{}',campaign_mode text DEFAULT 'permission_marketing',
        delivery_mode text DEFAULT 'standard',ab_test_enabled boolean DEFAULT false,subject_b text,ab_winner text,
        ab_sample_started_at timestamptz,ab_winner_picked_at timestamptz,scheduled_at timestamptz,started_at timestamptz,completed_at timestamptz,
        user_paused boolean DEFAULT false,paused_reason text,consent_confirmed_at timestamptz,consent_confirmed_by uuid,
        operator_attested_at timestamptz,total_recipients int DEFAULT 0,sent_count int DEFAULT 0,failed_count int DEFAULT 0,
        open_count int DEFAULT 0,click_count int DEFAULT 0,unsubscribe_count int DEFAULT 0);
      CREATE TABLE public.email_campaign_recipients(id uuid PRIMARY KEY,campaign_id uuid REFERENCES public.email_campaigns(id),
        email text NOT NULL,recipient_name text,custom_data jsonb,subject_variant text,status text DEFAULT 'pending',
        error text,sent_at timestamptz,opened_at timestamptz);
      CREATE TABLE public.mailing_send_jobs(id uuid PRIMARY KEY,campaign_id uuid);
      CREATE TABLE public.email_campaign_consent_log(campaign_id uuid,organization_id uuid,scope text,confirmed_by uuid,method text);
    `);
    // Install actual existing Unibox tables/triggers, never its legacy cron HTTP command.
    const unibox=readFileSync(join(root,"migrations/20260706090007_b84489ef-80f1-48ed-b400-ea523e1d8dda.sql"),"utf8");
    query(unibox.split("-- Cron for inbox scanner")[0]);
    query(readFileSync(join(root,"migrations/20260805120639_83a748c1-f0a7-4cf6-bbfd-16e464f7f92a.sql"),"utf8"));
    query(readFileSync(join(root,"migrations/20260908010000_ordinary_campaign_claims.sql"),"utf8"));
    query(migration);
  },100_000);
  afterAll(()=>{
    if(started) execFileSync(exe("pg_ctl"),["-D",dataDir,"-m","fast","-w","-t","20","stop"],
      {windowsHide:true,stdio:"ignore",timeout:25_000});
    started=false;
  },30_000);
  beforeEach(()=>{
    query(`ALTER TABLE public.email_messages DROP CONSTRAINT IF EXISTS fixture_fail_history;
      TRUNCATE public.ordinary_mail_report_events,public.ordinary_inbox_receipts,public.ordinary_inbox_scan_state,
        public.ordinary_campaign_messages,public.email_messages,public.email_conversations,public.ordinary_campaign_attempts,
        public.ordinary_campaign_runs,public.email_campaign_recipients,public.email_campaign_consent_log,public.mailing_send_jobs,
        public.email_campaigns,public.email_sender_pool,public.mailing_senders,public.org_smtp_settings,public.organizations;
      INSERT INTO public.organizations(id) VALUES('${org}');
      INSERT INTO public.email_sender_pool(id,email) VALUES('${pool}','sender@fixture.invalid'),('${pool2}','other@fixture.invalid');
      INSERT INTO public.email_campaigns(id,recipient_filter) VALUES
        ('${c}','{"platform_sender_pool_id":"${pool}"}'),('${c2}','{"platform_sender_pool_id":"${pool}"}');
      INSERT INTO public.email_campaign_recipients(id,campaign_id,email) VALUES
        ('${recipient}','${c}','recipient@fixture.invalid'),('${recipient2}','${c2}','recipient@fixture.invalid');`);
  });

  it("denies client RPCs and direct ledger writes; only admins read private snapshots",()=>{
    for(const role of ["anon","authenticated"]) {
      expect(()=>query(`SET ROLE ${role}; ${prepare()}`)).toThrow(/permission denied/);
      expect(()=>query(`SET ROLE ${role}; SELECT public.claim_ordinary_inbox_scan('${pool}','${scan}');`)).toThrow(/permission denied/);
      expect(()=>query(`SET ROLE ${role}; INSERT INTO public.ordinary_mail_report_events(event_key) VALUES('spoof');`)).toThrow(/permission denied/);
    }
    expect(()=>query(`SET ROLE service_role; UPDATE public.ordinary_campaign_messages SET from_email='spoof@fixture.invalid';`)).toThrow(/permission denied/);
    expect(()=>query(`SET request.jwt.claim.role='authenticated'; ${prepare()}`)).toThrow(/service_role_required/);
    send(); finish();
    expect(query("SET ROLE authenticated; SELECT count(*) FROM public.ordinary_campaign_messages;")).toBe("0");
    expect(query(`SET ROLE authenticated; SET request.jwt.claim.sub='${user}'; SELECT count(*) FROM public.ordinary_campaign_messages;`)).toBe("1");
  });
  it("prepares exact claimed payload only, rejects wrong From and immutable replacement",()=>{
    begin();
    expect(result(prepare(outbound({from_email:"spoof@fixture.invalid"})))).toMatchObject({prepared:false,reason:"sender_mismatch"});
    expect(query("SELECT count(*) FROM public.ordinary_campaign_messages;")).toBe("0");
    expect(result(prepare())).toMatchObject({prepared:true,message_id:msg});
    expect(result(prepare()).reason).toBe("already_prepared");
    expect(result(prepare(outbound({subject:"changed"})))).toMatchObject({prepared:false,reason:"message_immutable"});
    expect(()=>query("UPDATE public.ordinary_campaign_messages SET subject='changed';")).toThrow(/ordinary_message_facts_immutable/);
    expect(result(prepare(outbound(),c,recipient,run,id(999))).prepared).toBe(false);
  });
  it("blocks dispatch before facts with zero status/history changes",()=>{
    begin(); expect(()=>query(transition("dispatching"))).toThrow(/ordinary_message_not_prepared/);
    expect(query("SELECT state FROM public.ordinary_campaign_attempts;")).toBe("claimed");
    expect(query("SELECT count(*) FROM public.email_messages;")).toBe("0");
  });
  it("records one confirmed outgoing with actual personalized payload and fixed Message-ID",()=>{
    send();
    expect(query("SELECT count(*) FROM public.email_messages WHERE direction='outgoing';")).toBe("1");
    expect(result("SELECT row_to_json(m) FROM public.email_messages m;")).toMatchObject({campaign_id:c,recipient_id:recipient,
      ordinary_attempt_token:attempt,from_email:"sender@fixture.invalid",to_email:"recipient@fixture.invalid",message_id:msg,
      subject:"Personalized fixture",body_text:"Only synthetic body",is_read:true});
    expect(result(transition("sent")).transitioned).toBe(false);
    expect(query("SELECT unread_count FROM public.email_conversations;")).toBe("0");
  });
  it("rolls back sent status and counters when atomic history write fails",()=>{
    begin(); result(prepare()); result(transition("dispatching"));
    query("ALTER TABLE public.email_messages ADD CONSTRAINT fixture_fail_history CHECK(direction<>'outgoing');");
    expect(()=>query(transition("sent"))).toThrow(/fixture_fail_history/);
    expect(query("SELECT state FROM public.ordinary_campaign_attempts;")).toBe("dispatching");
    expect(query(`SELECT status||':'||sent_count FROM public.email_campaigns WHERE id='${c}';`)).toBe("sending:0");
    expect(query("SELECT count(*) FROM public.email_conversations;")).toBe("0");
  });
  it("does not invent successful history for uncertain or failed attempts",()=>{
    begin(); result(prepare()); result(transition("dispatching")); result(transition("uncertain",c,recipient,run,attempt,msg,"smtp_outcome_unknown"));
    expect(finish("uncertain").run_state).toBe("uncertain");
    expect(query("SELECT count(*) FROM public.email_messages;")).toBe("0");
    const report=result("SELECT payload FROM public.ordinary_mail_report_events;");
    expect(report).toMatchObject({status:"paused",counts:{total:1,pending:1,sent:0,failed:0,unresolved:1}});
    expect(report.senders[0].from_email).toBe("sender@fixture.invalid");
  });
  it("snapshots actual sender/counts once, independent of later campaign/pool edits",()=>{
    send(); finish();
    query(`UPDATE public.email_campaigns SET name='Later edit' WHERE id='${c}'; UPDATE public.email_sender_pool SET email='later@fixture.invalid' WHERE id='${pool}';`);
    const report=result("SELECT payload FROM public.ordinary_mail_report_events;");
    expect(report).toMatchObject({campaign_name:"Synthetic campaign",status:"completed",counts:{total:1,pending:0,sent:1,failed:0,unresolved:0}});
    expect(report.senders[0]).toMatchObject({from_email:"sender@fixture.invalid",sender_pool_id:pool});
    expect(finish().finished).toBe(false); expect(query("SELECT count(*) FROM public.ordinary_mail_report_events;")).toBe("1");
  });
  it("claims Telegram event atomically in two PostgreSQL sessions; timeout never resends",async()=>{
    send(); finish(); const event=eventId();
    const claims=await Promise.all([concurrent(claimReport(event,id(81))),concurrent(claimReport(event,id(82)))]);
    expect(claims.filter(value=>value.claimed)).toHaveLength(1);
    const winner=claims.find(value=>value.claimed);
    expect(result(`SELECT public.finish_ordinary_mail_report('${event}','${id(99)}','sent',1);`).finished).toBe(false);
    expect(result(`SELECT public.finish_ordinary_mail_report('${event}','${winner.claim_token}','sent',NULL);`).finished).toBe(false);
    expect(result(`SELECT public.finish_ordinary_mail_report('${event}','${winner.claim_token}','uncertain',NULL,'telegram_outcome_unknown');`).finished).toBe(true);
    expect(result(claimReport(event,id(83))).claimed).toBe(false);
  });
  it("keeps missing/disabled/mismatched organization binding pending, snapshots exact existing chat",()=>{
    query(`UPDATE public.email_campaigns SET scope='org',organization_id='${org}',recipient_filter='{}' WHERE id='${c}';
      INSERT INTO public.org_smtp_settings VALUES('${org}','sender@fixture.invalid');`);
    send(outbound({sender_kind:"org_legacy",sender_pool_id:null})); finish(); const event=eventId();
    expect(query("SELECT count(*) FROM public.email_messages;")).toBe("0");
    expect(result(claimReport(event)).reason).toBe("target_not_configured");
    query(`UPDATE public.organizations SET telegram_notify_enabled=true,telegram_notify_chat_id='-23456' WHERE id='${org}';`);
    expect(result(claimReport(event)).claimed).toBe(false);
    expect(query("SELECT state FROM public.ordinary_mail_report_events;")).toBe("pending");
    expect(result(claimReport(event,id(81),"-23456")).claimed).toBe(true);
    expect(result(`SELECT public.finish_ordinary_mail_report('${event}','${id(81)}','sent',101);`).state).toBe("sent");
  });
  it("retains platform_env and org mailing facts without fake pool inbox history",()=>{
    query(`UPDATE public.email_campaigns SET recipient_filter='{}' WHERE id='${c}';`);
    send(outbound({sender_kind:"platform_env",sender_pool_id:null})); finish();
    query(`INSERT INTO public.mailing_senders VALUES('${id(53)}','${org}','sender@fixture.invalid',true,'ok');
      UPDATE public.email_campaigns SET scope='org',organization_id='${org}',sender_id='${id(53)}',recipient_filter='{}' WHERE id='${c2}';`);
    send(outbound({smtp_message_id:msg2,sender_kind:"mailing",sender_pool_id:null,mailing_sender_id:id(53)}),c2,recipient2,run2,attempt2,msg2);
    expect(query("SELECT count(*) FROM public.ordinary_campaign_messages;")).toBe("2");
    expect(query("SELECT count(*) FROM public.email_messages;")).toBe("0");
  });
  it("lists eligible pending events beyond blocked rows, clamps limit and counts missing bot",()=>{
    send(); finish();
    query(`INSERT INTO public.ordinary_mail_report_events(event_key,campaign_id,kind,scope,organization_id,payload,created_at)
      SELECT 'fixture-blocked:'||n,'${c2}','run_report','org','${org}','{}',now()-interval '1 day'
      FROM generate_series(1,25) n;`);
    const candidates=result("SELECT public.list_ordinary_mail_report_candidates(true,true);");
    expect(candidates.blocked).toBe(25); expect(candidates.events).toHaveLength(1);
    expect(candidates.events[0].campaign_id).toBe(c);
    expect(result("SELECT public.list_ordinary_mail_report_candidates(true,false);")).toMatchObject({events:[],blocked:26});
    expect(result(`SELECT public.list_ordinary_mail_report_candidates(true,true,'${c}');`).blocked).toBe(0);
    query(`UPDATE public.organizations SET telegram_notify_enabled=true,telegram_notify_chat_id='-12345' WHERE id='${org}';`);
    expect(result("SELECT public.list_ordinary_mail_report_candidates(true,true,NULL,NULL,100);").events).toHaveLength(20);
    expect(query("SELECT count(*) FROM public.ordinary_mail_report_events WHERE state='pending';")).toBe("26");
    expect(()=>query("SET ROLE authenticated; SELECT public.list_ordinary_mail_report_candidates(true,true);")).toThrow(/permission denied/);
  });
  it("starts at zero, serializes scan claims, and does not recover an uncertain lease",async()=>{
    const claims=await Promise.all([concurrent(`SELECT public.claim_ordinary_inbox_scan('${pool}','${scan}');`),
      concurrent(`SELECT public.claim_ordinary_inbox_scan('${pool}','${id(72)}');`)]);
    expect(claims.filter(value=>value.claimed)).toHaveLength(1);
    expect(claims.find(value=>value.claimed)).toMatchObject({last_uid:0,uid_validity:null});
    const token=query(`SELECT claim_token FROM public.ordinary_inbox_scan_state WHERE sender_pool_id='${pool}';`);
    expect(result(`SELECT public.release_ordinary_inbox_scan('${pool}','${token}','uncertain');`).released).toBe(true);
    expect(result(`SELECT public.claim_ordinary_inbox_scan('${pool}','${id(73)}');`).reason).toBe("manual_reconciliation_required");
  });
  it("requires owner and stored UID before checkpoint; explicit UIDVALIDITY rollover starts zero",()=>{
    beginScan();
    expect(result(`SELECT public.checkpoint_ordinary_inbox_scan('${pool}','${scan}',100,5);`).reason).toBe("message_not_stored");
    expect(result(ingest(incoming(),5,100,pool,id(99))).stored).toBe(false);
    expect(result(ingest(incoming(),5)).stored).toBe(true);
    expect(result(`SELECT public.checkpoint_ordinary_inbox_scan('${pool}','${scan}',100,5);`).updated).toBe(true);
    expect(result(`SELECT public.checkpoint_ordinary_inbox_scan('${pool}','${scan}',100,4);`).updated).toBe(false);
    expect(result(`SELECT public.checkpoint_ordinary_inbox_scan('${pool}','${scan}',200,5);`).updated).toBe(false);
    expect(result(`SELECT public.checkpoint_ordinary_inbox_scan('${pool}','${scan}',200,0);`).updated).toBe(true);
    expect(result(ingest(incoming(),6)).stored).toBe(false);
    expect(result(ingest(incoming(),1,200))).toMatchObject({stored:true,duplicate:true});
    expect(query("SELECT count(*) FROM public.ordinary_inbox_receipts;")).toBe("2");
  });
  it("stores exact reply+history+outbox atomically and deduplicates repeated UID and Message-ID",async()=>{
    send(); finish(); beginScan();
    const stores=await Promise.all([concurrent(ingest()),concurrent(ingest())]);
    expect(stores.filter(value=>value.duplicate)).toHaveLength(1);
    expect(stores[0]).toMatchObject({stored:true,attributed:true,campaign_id:c});
    expect(result(ingest(incoming(),2))).toMatchObject({stored:true,duplicate:true,attributed:true});
    expect(query("SELECT count(*) FROM public.email_messages WHERE direction='incoming';")).toBe("1");
    expect(query("SELECT count(*) FROM public.ordinary_mail_report_events WHERE kind='reply';")).toBe("1");
    expect(query("SELECT unread_count FROM public.email_conversations;")).toBe("1");
    const report=result("SELECT payload FROM public.ordinary_mail_report_events WHERE kind='reply';");
    expect(report).toMatchObject({campaign_id:c,matched:{attempt_token:attempt,smtp_message_id:msg},reply:{classification:"unclassified",text:"Synthetic reply only"}});
  });
  it("requires exact reference, recipient, pool inbox and sent state; never guesses from sender",()=>{
    send(); finish(); beginScan();
    for(const [i,overrides] of [{in_reply_to:null,references_ids:[]},{from_email:"stranger@fixture.invalid"},
      {in_reply_to:"<unmatched@fixture.invalid>",references_ids:[]}].entries()) {
      expect(result(ingest(incoming({...overrides,message_id:`<unmatched.${i}@fixture.invalid>`}),i+1)).attributed).toBe(false);
    }
    beginScan(pool2,id(72));
    expect(result(ingest(incoming({to_email:"other@fixture.invalid"}),1,100,pool2,id(72))).attributed).toBe(false);
    expect(query("SELECT count(*) FROM public.ordinary_mail_report_events WHERE kind='reply';")).toBe("0");
  });
  it("does not equate external Reply-To with the From inbox",()=>{
    send(outbound({reply_to:"external@fixture.invalid"})); finish(); beginScan();
    expect(result(ingest()).attributed).toBe(false);
    expect(query("SELECT count(*) FROM public.ordinary_mail_report_events WHERE kind='reply';")).toBe("0");
  });
  it("does not attribute prepared/dispatching references, and deduplicates headerless mail by UID",()=>{
    begin(); result(prepare()); result(transition("dispatching")); beginScan();
    expect(result(ingest(incoming({message_id:null})))).toMatchObject({stored:true,attributed:false});
    expect(result(ingest(incoming({message_id:null})))).toMatchObject({stored:true,duplicate:true,attributed:false});
    expect(query("SELECT count(*) FROM public.email_messages;")).toBe("1");
    expect(query("SELECT count(*) FROM public.ordinary_mail_report_events;")).toBe("0");
  });
  it("accepts exact References alone but never creates success for a definite pre-SMTP failure",()=>{
    send(); finish(); beginScan();
    expect(result(ingest(incoming({in_reply_to:null,references_ids:[msg]}))).attributed).toBe(true);
    begin(c2,recipient2,run2,attempt2);
    expect(result(transition("failed",c2,recipient2,run2,attempt2,msg2,"suppression_lookup_failed")).transitioned).toBe(true);
    finish("completed",c2,run2);
    const report=result(`SELECT payload FROM public.ordinary_mail_report_events WHERE campaign_id='${c2}';`);
    expect(report).toMatchObject({counts:{total:1,pending:0,sent:0,failed:1,unresolved:0},senders:[]});
    expect(query("SELECT count(*) FROM public.email_messages WHERE direction='outgoing';")).toBe("1");
  });
  it("leaves cross-campaign References ambiguous while retaining incoming history",()=>{
    send(); finish(); send(outbound({smtp_message_id:msg2}),c2,recipient2,run2,attempt2,msg2); finish("completed",c2,run2);
    beginScan();
    expect(result(ingest(incoming({in_reply_to:msg,references_ids:[msg,msg2]})))).toMatchObject({stored:true,attributed:false,campaign_id:null});
    expect(query("SELECT count(*) FROM public.ordinary_mail_report_events WHERE kind='reply';")).toBe("0");
    expect(query("SELECT count(*) FROM public.email_conversations;")).toBe("1");
  });
  it("rolls back incoming history and receipt if reply outbox insertion fails",()=>{
    send(); finish(); beginScan();
    query("ALTER TABLE public.ordinary_mail_report_events ADD CONSTRAINT fixture_fail_reply CHECK(kind<>'reply');");
    try {
      expect(()=>query(ingest())).toThrow(/fixture_fail_reply/);
      expect(query("SELECT count(*) FROM public.ordinary_inbox_receipts;")).toBe("0");
      expect(query("SELECT count(*) FROM public.email_messages WHERE direction='incoming';")).toBe("0");
      expect(query("SELECT last_uid FROM public.ordinary_inbox_scan_state;")).toBe("0");
    } finally {query("ALTER TABLE public.ordinary_mail_report_events DROP CONSTRAINT fixture_fail_reply;");}
  });
  it("durably records deliberately ignored UIDs without a message or report, rejects stale scanner",()=>{
    beginScan();
    expect(result(ingest({ignored_reason:"warmup"} as any))).toMatchObject({stored:true,ignored:true,attributed:false});
    expect(result(ingest({ignored_reason:"warmup"} as any))).toMatchObject({stored:true,duplicate:true,ignored:true});
    expect(result(`SELECT public.checkpoint_ordinary_inbox_scan('${pool}','${scan}',100,1);`).updated).toBe(true);
    expect(query("SELECT count(*) FROM public.email_messages;")).toBe("0");
    expect(query("SELECT count(*) FROM public.ordinary_mail_report_events;")).toBe("0");
    result(`SELECT public.release_ordinary_inbox_scan('${pool}','${scan}','completed');`);
    expect(result(ingest(incoming(),2)).stored).toBe(false);
    expect(result(`SELECT public.checkpoint_ordinary_inbox_scan('${pool}','${scan}',100,2);`).updated).toBe(false);
  });
  it("worker cron helper is a no-op without existing vault/net configuration",()=>{
    expect(query("SELECT public.invoke_ordinary_mail_workers() IS NULL;")).toBe("t");
  });
  it("uses existing vault values and updates only the installed cron command (all HTTP mocked)",()=>{
    query(`CREATE SCHEMA vault; CREATE SCHEMA net; CREATE SCHEMA cron;
      CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
      CREATE TABLE public.fixture_http_requests(id bigint GENERATED ALWAYS AS IDENTITY,url text,headers jsonb,body jsonb,timeout_ms int);
      CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int) RETURNS bigint LANGUAGE plpgsql AS $$
        DECLARE result_id bigint; BEGIN INSERT INTO public.fixture_http_requests(url,headers,body,timeout_ms)
          VALUES($1,$2,$3,$4) RETURNING id INTO result_id; RETURN result_id; END $$;
      CREATE TABLE cron.job(jobid bigint,jobname text,schedule text,command text,active boolean);
      CREATE FUNCTION cron.alter_job(job_id bigint,command text) RETURNS void LANGUAGE sql AS
        $$ UPDATE cron.job SET command=$2 WHERE jobid=$1 $$;
      INSERT INTO cron.job VALUES(1,'inbox-scanner-every-5min','*/5 * * * *','old-command',false),
        (2,'other-job','0 * * * *','keep-command',true);
      INSERT INTO vault.decrypted_secrets VALUES('mailing_campaign_worker_url','https://fixture.invalid/functions/v1/mailing-campaign-worker'),
        ('mailing_campaign_cron_secret','synthetic-fixture-not-a-real-secret');`);
    const cronBlock=migration.slice(migration.indexOf("DO $$\nDECLARE v_job"),migration.indexOf("REVOKE ALL ON FUNCTION public.guard_ordinary_message_facts"));
    query(cronBlock);
    expect(query("SELECT schedule||':'||active||':'||command FROM cron.job WHERE jobid=1;")).toBe("*/5 * * * *:false:SELECT public.invoke_ordinary_mail_workers();");
    expect(query("SELECT command FROM cron.job WHERE jobid=2;")).toBe("keep-command");
    expect(result("SELECT public.invoke_ordinary_mail_workers();")).toMatchObject({scanner_request_id:1,report_request_id:2});
    expect(query("SELECT count(*) FROM public.fixture_http_requests WHERE headers ? 'X-Cron-Secret' AND body='{}' AND timeout_ms=55000;")).toBe("2");
    expect(query("SELECT count(*) FROM public.fixture_http_requests WHERE url IN ('https://fixture.invalid/functions/v1/inbox-scanner','https://fixture.invalid/functions/v1/notify-mailing-campaign-report');")).toBe("2");
    query("TRUNCATE vault.decrypted_secrets;");
    expect(query("SELECT public.invoke_ordinary_mail_workers() IS NULL;")).toBe("t");
    expect(query("SELECT count(*) FROM public.fixture_http_requests;")).toBe("2");
  });
});
