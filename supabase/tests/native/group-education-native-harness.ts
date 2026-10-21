// Explicit native-only suite. Never imported by the normal PGlite test glob.
import {afterAll, expect, it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {
  createUcGroupEducationFixture, seedGroupEducationScenario,
  executeAsGroupEducationCaller, groupEducationId, groupEducationIds,
} from '../../functions/_shared/uc-group-education-facts.fixture';

export type NativeConnection = {
  exec(sql: string): Promise<unknown>;
  query<T = any>(sql: string, args?: any[]): Promise<{rows: T[]}>;
  pid(): Promise<number>;
  label: string;
};
export type NativeFixture = Awaited<ReturnType<typeof createUcGroupEducationFixture>> & {
  native: {connect(label: string): NativeConnection; record: any; name: string};
};
export type InFlight<T> = {
  promise: Promise<{ok: true; value: T} | {ok: false; error: any}>;
  settled(): boolean;
};
export type NativeContext = {
  db: NativeFixture;
  s: Awaited<ReturnType<typeof seedGroupEducationScenario>>;
  ids: typeof groupEducationIds;
  a: NativeConnection;
  b: NativeConnection;
  monitor: NativeConnection;
  owner(connection: NativeConnection): Promise<void>;
  caller(connection: NativeConnection, user: string | null, role?: string): Promise<void>;
  source(connection: NativeConnection): Promise<void>;
  read(connection: NativeConnection, query?: any, group?: string): Promise<any>;
  apply(connection: NativeConnection, revision: number, action: any, request?: string, group?: string): Promise<any>;
  initialize(connection?: NativeConnection, group?: string): Promise<any>;
  publishCalendar(connection?: NativeConnection, group?: string): Promise<any>;
  capture(connection?: NativeConnection, group?: string): Promise<any>;
  roster(connection?: NativeConnection, group?: string, asOf?: any, revision?: number | null): Promise<any>;
  clock(connection?: NativeConnection): Promise<string>;
  locks(pids?: number[]): Promise<any[]>;
  waitBlocked(waiter: NativeConnection, blocker: NativeConnection, timeoutMs?: number): Promise<any>;
  launch<T>(promise: Promise<T>): InFlight<T>;
  resolve<T>(work: InFlight<T>): Promise<T>;
  note(facts: any): void;
  uuid(): string;
  id(n: number): string;
  addStudents(count: number, first?: number): Promise<string[]>;
};

const output = process.env.UC116_NATIVE_OUTPUT;
if (!output || !process.env.UC116_NATIVE_CHECKOUT) throw Error('Explicit isolated native lab required');
const results: any[] = [];
const registered = new Set<string>();
const tick = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const row = async (connection: NativeConnection, sql: string, args: any[] = []) =>
  (await connection.query(sql, args)).rows[0];

export function registerNativeCase(id: string, title: string, run: (context: NativeContext) => Promise<void>) {
  if (!/^N(?:0[1-9]|1[0-9]|2[0-6])$/.test(id) || registered.has(id)) throw Error('Invalid or duplicate native case ' + id);
  registered.add(id);
  it(id + ' ' + title, async () => {
    const record: any = {id, title, status: 'RUNNING', startedAt: new Date().toISOString(), facts: []};
    results.push(record);
    let db: NativeFixture | undefined;
    try {
      db = await createUcGroupEducationFixture(true) as NativeFixture;
      if (!db.native) throw Error('PGlite is not native PostgreSQL evidence');
      const s = await seedGroupEducationScenario(db);
      const a = db.native.connect(id.toLowerCase() + '_a');
      const b = db.native.connect(id.toLowerCase() + '_b');
      const monitor = db.native.connect(id.toLowerCase() + '_monitor');
      const pids = await Promise.all([a.pid(), b.pid(), monitor.pid()]);
      expect(new Set(pids).size).toBe(3);
      record.database = db.native.name;
      record.backendPids = {a: pids[0], b: pids[1], monitor: pids[2]};
      record.roleScope = 'Synthetic authenticated JWT claims and SQL roles in an agent-owned isolated database; not real Auth/browser/API proof.';
      const owner = (connection: NativeConnection) => executeAsGroupEducationCaller(connection as any, s.ids.owner);
      const source = async (connection: NativeConnection) => {
        await connection.exec('RESET ROLE');
        await connection.query("SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false)");
      };
      const read = async (connection: NativeConnection, query: any = {kind: 'state'}, group = s.ids.group) =>
        (await row(connection, 'SELECT public.read_group_education_facts($1,$2,$3)d', [s.ids.organization, group, JSON.stringify(query)])).d;
      const apply = async (connection: NativeConnection, revision: number, action: any, request = randomUUID(), group = s.ids.group) =>
        (await row(connection, 'SELECT public.apply_group_education_facts_action($1,$2,$3,$4,$5)d', [s.ids.organization, group, revision, request, JSON.stringify(action)])).d;
      const initialize = async (connection = b, group = s.ids.group) => {
        const state = await read(connection, {kind: 'state'}, group);
        return apply(connection, 0, {action: 'initialize_history', timezone: 'Asia/Vladivostok', expected_program_ref: state.program_ref, reason: 'Synthetic native ' + id + ' baseline observed now'}, randomUUID(), group);
      };
      const publishCalendar = async (connection = b, group = s.ids.group) => {
        let state = (await read(connection, {kind: 'state'}, group)).state;
        if (!state) state = (await initialize(connection, group)).envelope.state;
        const draft = (await read(connection, {kind: 'calendar', selection: {kind: 'current', view: 'draft'}}, group)).calendar;
        const saved = await apply(connection, state.revision, {action: 'save_calendar_version', base_version_id: draft?.id ?? null, expected_program_ref: state.program_ref, timezone: state.timezone, planned_start_date: '2026-10-19', planned_end_date: '2026-10-22', coverage: 'whole_program', partial_reason: null,
          lessons: [19, 20, 21, 22].map(day => ({lesson_id: null, local_date: '2026-10-' + day, starts_at: null, ends_at: null, topic: 'Synthetic native lesson ' + day, module_label: null, course_lesson_id: null, academic_hours: '18', teacher_user_id: s.ids.teacher, status: 'planned', cancellation_reason: null})), reason: 'Synthetic native planned calendar'}, randomUUID(), group);
        const calendar = (await read(connection, {kind: 'calendar', selection: {kind: 'current', view: 'draft'}}, group)).calendar;
        return apply(connection, saved.envelope.state.revision, {action: 'publish_calendar_version', version_id: calendar.id, expected_content_hash: calendar.content_hash, expected_program_ref: saved.envelope.state.program_ref, reason: 'Synthetic native publication'}, randomUUID(), group);
      };
      const capture = async (connection = b, group = s.ids.group) => {
        const state = (await read(connection, {kind: 'state'}, group)).state;
        const calendar = (await read(connection, {kind: 'calendar', selection: {kind: 'current', view: 'published'}}, group)).calendar;
        if (!state || !calendar) throw Error('Explicit initialize/publishCalendar prerequisites required');
        return apply(connection, state.revision, {action: 'capture_roster_snapshot', as_of: {kind: 'current'}, knowledge_revision: state.revision, calendar_version_id: calendar.id, expected_calendar_hash: calendar.content_hash, expected_program_ref: state.program_ref, purpose: 'document_batch', reason: 'Synthetic native retained source'}, randomUUID(), group);
      };
      const locks = async (selected = pids) => (await monitor.query("SELECT a.pid,a.wait_event_type,a.wait_event,a.state,pg_blocking_pids(a.pid)blocking_pids,l.locktype,l.mode,l.granted,l.relation::regclass::text relation,l.classid::text classid,l.objid::text objid,l.objsubid FROM pg_stat_activity a LEFT JOIN pg_locks l ON l.pid=a.pid WHERE a.pid=ANY($1::int[]) ORDER BY a.pid,l.granted,l.locktype,l.mode", [selected])).rows;
      const context: NativeContext = {
        db, s, ids: s.ids, a, b, monitor, owner, source,
        caller: (connection, user, role = 'authenticated') => executeAsGroupEducationCaller(connection as any, user, role),
        read, apply, initialize, publishCalendar, capture,
        roster: (connection = b, group = s.ids.group, asOf = {kind: 'current'}, revision = null) => read(connection, {kind: 'roster', as_of: asOf, knowledge_revision: revision, after_user_id: null, limit: 100}, group),
        clock: async (connection = monitor) => (await row(connection, 'SELECT to_jsonb(clock_timestamp())at')).at,
        locks,
        async waitBlocked(waiter, blocker, timeoutMs = 10000) {
          const waiterPid = await waiter.pid(), blockerPid = await blocker.pid();
          const deadline = Date.now() + timeoutMs;
          while (Date.now() < deadline) {
            const observations = await locks([waiterPid]);
            const actual = observations.find(v => v.wait_event_type === 'Lock' && v.granted === false && v.blocking_pids.includes(blockerPid));
            if (actual) { record.facts.push({kind: 'observed_native_block', ...actual, blockerPid}); return actual; }
            await tick(20);
          }
          record.facts.push({kind: 'block_not_observed', waiterPid, blockerPid, locks: await locks([waiterPid, blockerPid])});
          throw Error('Required native lock wait was not observed for ' + waiterPid + ' blocked by ' + blockerPid);
        },
        launch<T>(promise: Promise<T>): InFlight<T> {
          let settled = false;
          const result = promise.then(value => ({ok: true as const, value}), error => ({ok: false as const, error})).finally(() => { settled = true; });
          return {promise: result, settled: () => settled};
        },
        async resolve<T>(work: InFlight<T>): Promise<T> { const outcome = await work.promise; if (!outcome.ok) throw (outcome as any).error; return outcome.value; },
        note(facts) { const text = JSON.stringify(facts); if (text.length > 100000 || record.facts.length > 200) throw Error('Bounded native evidence exceeded'); record.facts.push(facts); },
        uuid: randomUUID, id: groupEducationId,
        async addStudents(count, first = 100000) {
          await source(monitor);
          const users = Array.from({length: count}, (_, n) => groupEducationId(first + n));
          await monitor.query('INSERT INTO auth.users(id) SELECT unnest($1::uuid[])', [users]);
          await monitor.query("INSERT INTO profiles(user_id,organization_id,full_name) SELECT u,$1,'Synthetic116 learner '||u::text FROM unnest($2::uuid[])u", [s.ids.organization, users]);
          await monitor.query("INSERT INTO user_roles(user_id,role)SELECT u,'student' FROM unnest($1::uuid[])u", [users]);
          return users;
        },
      };
      await Promise.all([owner(a), owner(b)]);
      await source(monitor);
      await run(context);
      record.status = 'PASS';
    } catch (error: any) {
      record.status = 'FAIL';
      record.error = {code: error?.code ?? null, message: String(error?.message ?? error).slice(0, 2000), stack: String(error?.stack ?? '').slice(0, 12000)};
      throw error;
    } finally {
      if (db) {
        record.connections = db.native.record.connections;
        try { await db.close(); record.cleanup = 'PASS'; }
        catch (error: any) { record.status = 'FAIL'; record.cleanup = String(error?.message ?? error).slice(0, 1000); throw error; }
      }
      record.finishedAt = new Date().toISOString();
      writeFileSync(join(output, 'native-cases.json'), JSON.stringify({scope: 'Actual native product SQL/fixture, separate persistent PostgreSQL backends, synthetic role simulation only.', registered: [...registered].sort(), cases: results}, null, 2) + '\n');
    }
  }, ['N06', 'N07', 'N08', 'N25'].includes(id) ? 600000 : 120000);
}

afterAll(() => {
  writeFileSync(join(output!, 'native-cases.json'), JSON.stringify({scope: 'Actual native product SQL/fixture, separate persistent PostgreSQL backends, synthetic role simulation only.', registered: [...registered].sort(), cases: results}, null, 2) + '\n');
});
