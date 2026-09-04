// Local PostgreSQL/PGlite proof only. Identity/permission helpers are fixture
// implementations, not proof of the Live Supabase helper or deployment.
// node scripts/verify-group-class-journal-marks.mjs /path/to/@electric-sql/pglite/dist/index.js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { PGlite } = await import(process.argv[2]
  ? pathToFileURL(resolve(process.argv[2])).href
  : "@electric-sql/pglite");
const db = new PGlite();
const ids = Object.fromEntries([
  "owner", "reader", "writer", "expired", "outsider", "admin", "learner", "learner2",
  "foreignLearner", "org", "foreignOrg", "group", "otherGroup", "foreignGroup",
  "noCourseGroup", "noDatesGroup", "course", "newCourse", "noCourseLearner", "noDatesLearner",
].map((key, index) => [key, `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`]));
const dates = ["2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07"];
let passed = 0;
const pass = label => { passed += 1; console.log(`PASS ${label}`); };
async function rejects(label, action, code) {
  await assert.rejects(action, error => error.code === code);
  pass(label);
}
async function asOwner(sql) {
  await db.exec("RESET ROLE");
  try { return await db.exec(sql); } finally { await db.exec("SET ROLE authenticated"); }
}
async function who(actor) {
  await db.query("SELECT set_config('test.actor', $1, false)", [actor ? ids[actor] : ""]);
}
async function save(overrides = {}) {
  const input = {
    organization: ids.org, group: ids.group, course: ids.course, user: ids.learner,
    slot: 1, date: dates[0], revision: null, mark: "V", ...overrides,
  };
  const result = await db.query(
    "SELECT public.save_group_class_journal_mark($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::integer,$6::text,$7::integer,$8::text) AS row",
    [input.organization, input.group, input.course, input.user, input.slot, input.date, input.revision, input.mark],
  );
  return result.rows[0].row;
}
async function rows() { return (await db.query("SELECT * FROM public.group_class_journal_marks ORDER BY slot")).rows; }

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('test.actor', true), '')::uuid
    $$;
    CREATE TABLE public.fixture_permissions(actor uuid, organization uuid, permission text, expires_at timestamptz);
    CREATE FUNCTION public.can_access_organization(org uuid, requested text)
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT org IS NOT NULL AND auth.uid() IS NOT NULL AND (
        auth.uid() = '${ids.admin}'::uuid OR EXISTS (
          SELECT 1 FROM public.fixture_permissions p WHERE p.actor = auth.uid()
            AND p.organization = org AND p.permission = requested
            AND (p.expires_at IS NULL OR p.expires_at > now())
        )
      )
    $$;
    CREATE TABLE public.organizations(id uuid PRIMARY KEY);
    CREATE TABLE public.student_groups(id uuid PRIMARY KEY, organization_id uuid NOT NULL,
      course_id uuid, training_dates date[]);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE,
      organization_id uuid, student_group_id uuid, archived_at timestamptz);
    INSERT INTO public.organizations VALUES ('${ids.org}'), ('${ids.foreignOrg}');
    INSERT INTO public.student_groups VALUES
      ('${ids.group}', '${ids.org}', '${ids.course}', ARRAY['${dates.join("','")}']::date[]),
      ('${ids.otherGroup}', '${ids.org}', '${ids.course}', ARRAY['${dates.join("','")}']::date[]),
      ('${ids.foreignGroup}', '${ids.foreignOrg}', '${ids.course}', ARRAY['${dates.join("','")}']::date[]),
      ('${ids.noCourseGroup}', '${ids.org}', NULL, ARRAY['${dates.join("','")}']::date[]),
      ('${ids.noDatesGroup}', '${ids.org}', '${ids.course}', ARRAY[NULL]::date[]);
    INSERT INTO public.profiles(user_id,organization_id,student_group_id) VALUES
      ('${ids.learner}', '${ids.org}', '${ids.group}'),
      ('${ids.learner2}', '${ids.org}', '${ids.otherGroup}'),
      ('${ids.foreignLearner}', '${ids.foreignOrg}', '${ids.foreignGroup}'),
      ('${ids.noCourseLearner}', '${ids.org}', '${ids.noCourseGroup}'),
      ('${ids.noDatesLearner}', '${ids.org}', '${ids.noDatesGroup}');
    INSERT INTO public.fixture_permissions VALUES
      ('${ids.owner}','${ids.org}','documents.read',NULL),
      ('${ids.owner}','${ids.org}','documents.write',NULL),
      ('${ids.reader}','${ids.org}','documents.read',NULL),
      ('${ids.writer}','${ids.org}','documents.write',NULL),
      ('${ids.expired}','${ids.org}','documents.read','2000-01-01'),
      ('${ids.expired}','${ids.org}','documents.write','2000-01-01');
    GRANT USAGE ON SCHEMA auth,public TO authenticated;
    GRANT SELECT ON public.student_groups TO authenticated;
    ALTER TABLE public.student_groups ENABLE ROW LEVEL SECURITY;
    CREATE POLICY fixture_group_read ON public.student_groups FOR SELECT TO authenticated USING (
      public.can_access_organization(organization_id,'documents.read') OR
      public.can_access_organization(organization_id,'documents.write')
    );
  `);
  const migration = readFileSync(new URL("../supabase/migrations/20260904134000_group_class_journal_marks.sql", import.meta.url), "utf8");
  await db.exec(`BEGIN; ${migration} COMMIT;`);
  await db.exec("SET ROLE authenticated");
  await who("owner");
  assert.equal((await rows()).length, 0); pass("migration does not backfill marks");
  const first = await save();
  assert.deepEqual({ group: first.group_id, user: first.user_id, course: first.course_id, slot: first.slot,
    date: first.source_date, mark: first.mark, revision: first.revision, by: first.updated_by },
  { group: ids.group, user: ids.learner, course: ids.course, slot: 1, date: dates[0], mark: "V", revision: 1, by: ids.owner });
  assert.ok(first.id); assert.ok(Number.isFinite(Date.parse(first.updated_at)));
  pass("explicit first mark has confirmed scope and provenance");
  await rejects("second create conflicts", () => save(), "40001");
  await rejects("stale update conflicts", () => save({ revision: 7 }), "40001");
  await rejects("update cannot create an absent slot", () => save({ slot: 2, date: dates[1], revision: 1 }), "40001");
  const cleared = await save({ revision: 1, mark: "" });
  assert.equal(cleared.id, first.id); assert.equal(cleared.mark, ""); assert.equal(cleared.revision, 2);
  pass("empty text explicitly clears without deleting the cell");
  const literal = await save({ revision: 2, mark: ' []<>&"\t\n\r' });
  assert.equal(literal.mark, ' []<>&"\t\n\r'); pass("literal punctuation whitespace and XML-safe controls are preserved");
  for (const slot of [null, 0, 5]) await rejects(`invalid slot ${slot}`, () => save({ slot, revision: 3 }), "22023");
  for (const date of [null, "", "2026-02-30", "0000-01-01", "infinity", "2026-9-04"])
    await rejects(`invalid date ${String(date)}`, () => save({ date, revision: 3 }), "22023");
  await rejects("a valid but stale column date conflicts", () => save({ date: dates[1], revision: 3 }), "40001");
  await rejects("missing stored date conflicts", () => save({ group: ids.noDatesGroup, user: ids.noDatesLearner }), "40001");
  await rejects("unexpected course conflicts", () => save({ course: ids.newCourse, revision: 3 }), "40001");
  await rejects("null mark rejected", () => save({ mark: null, revision: 3 }), "22023");
  await rejects("13 code points rejected", () => save({ mark: "😀".repeat(13), revision: 3 }), "22023");
  const unicode = await save({ mark: "😀".repeat(12), revision: 3 });
  assert.equal(unicode.mark, "😀".repeat(12)); pass("12 Unicode code points accepted");
  for (const codePoint of [1, 8, 11, 12, 14, 31, 65534, 65535])
    await rejects(`XML forbidden U+${codePoint.toString(16)}`, () => save({ mark: String.fromCodePoint(codePoint), revision: 4 }), "22023");
  await rejects("foreign organization denied", () => save({ organization: ids.foreignOrg, revision: 4 }), "42501");
  await who("admin");
  await rejects("privileged actor cannot mismatch actual group tenant", () => save({ organization: ids.foreignOrg, revision: 4 }), "42501");
  await who("owner");
  await rejects("member of another group denied", () => save({ user: ids.learner2 }), "42501");
  await rejects("foreign-tenant learner denied", () => save({ user: ids.foreignLearner }), "42501");
  await rejects("missing learner denied", () => save({ user: ids.outsider }), "42501");
  const nullCourse = await save({ group: ids.noCourseGroup, user: ids.noCourseLearner, course: null });
  assert.equal(nullCourse.course_id, null); pass("explicit null course is supported");
  for (const command of ["UPDATE public.group_class_journal_marks SET mark='x'", "DELETE FROM public.group_class_journal_marks",
    "INSERT INTO public.group_class_journal_marks DEFAULT VALUES"])
    await rejects(`direct ${command.split(" ")[0]} denied`, () => db.exec(command), "42501");
  const signature = "public.save_group_class_journal_mark(uuid,uuid,uuid,uuid,integer,text,integer,text)";
  const privileges = await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') AS anon, has_function_privilege('authenticated',$1,'EXECUTE') AS authenticated", [signature]);
  assert.deepEqual(privileges.rows[0], { anon: false, authenticated: true }); pass("RPC execute is not public/anonymous");
  await who("reader"); assert.equal((await rows()).length, 2); pass("read-only document actor can read");
  await rejects("read-only actor cannot save", () => save({ revision: 4 }), "42501");
  await who("writer"); assert.equal((await rows()).length, 2);
  const writerSave = await save({ revision: 4, mark: "проверено" });
  assert.equal(writerSave.updated_by, ids.writer); pass("write-only document actor can read and save");
  for (const actor of ["expired", "outsider", "learner"]) {
    await who(actor); assert.equal((await rows()).length, 0);
    await rejects(`${actor} cannot save or see marks`, () => save({ revision: 5 }), "42501");
  }
  await who(null); await rejects("missing authentication denied", () => save({ revision: 5 }), "28000");
  await who("owner");
  await asOwner(`UPDATE public.profiles SET student_group_id='${ids.otherGroup}' WHERE user_id='${ids.learner}'`);
  assert.equal((await rows()).find(row => row.id === first.id).revision, 5);
  await rejects("moved learner marks retained but not writable", () => save({ revision: 5 }), "42501");
  await asOwner(`UPDATE public.profiles SET student_group_id='${ids.group}', archived_at=now() WHERE user_id='${ids.learner}'`);
  assert.ok((await rows()).some(row => row.id === first.id));
  await rejects("archived learner marks retained but not writable", () => save({ revision: 5 }), "42501");
  await asOwner(`UPDATE public.profiles SET archived_at=NULL WHERE user_id='${ids.learner}';
    UPDATE public.student_groups SET course_id='${ids.newCourse}', training_dates=ARRAY['2026-09-08','2026-09-09']::date[] WHERE id='${ids.group}'`);
  const historical = (await rows()).find(row => row.id === first.id);
  assert.equal(historical.course_id, ids.course); assert.equal(historical.source_date, dates[0]); assert.equal(historical.revision, 5);
  pass("group course/date changes do not transfer historical marks automatically");
  await rejects("old course context cannot save after group edit", () => save({ revision: 5 }), "40001");
  await rejects("old date context cannot save after group edit", () => save({ revision: 5, course: ids.newCourse }), "40001");
  const resaved = await save({ revision: 5, course: ids.newCourse, date: "2026-09-08", mark: "V" });
  assert.equal(resaved.course_id, ids.newCourse); assert.equal(resaved.source_date, "2026-09-08"); assert.equal(resaved.revision, 6);
  pass("only explicit current-context CAS save changes the source context");
  await asOwner(`DELETE FROM public.profiles WHERE user_id='${ids.learner}'`);
  assert.ok((await rows()).some(row => row.id === first.id)); pass("profile deletion preserves source UUID and marks");
  await asOwner(`UPDATE public.student_groups SET organization_id='${ids.foreignOrg}' WHERE id='${ids.group}'`);
  await who("admin");
  assert.ok(!(await rows()).some(row => row.id === first.id)); pass("RLS rejects inconsistent actual group tenant even for document-admin helper");
  await asOwner(`DELETE FROM public.student_groups WHERE id='${ids.group}'`);
  const remaining = await rows(); assert.equal(remaining.length, 1); assert.equal(remaining[0].group_id, ids.noCourseGroup);
  pass("explicit group deletion cascades only that group's marks");
  console.log(JSON.stringify({ passed, engine: "PGlite PostgreSQL", identityHelpers: "isolated fixtures", productionVerified: false }));
} finally {
  await db.close();
}
