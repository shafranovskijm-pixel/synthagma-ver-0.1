SOURCE ONLY. No SQL engine, test, production DML, TypeScript, build or deployment
has run for this package. An actual held isolated reproduction is required before
calling the metadata finding reproduced or the candidate effective.

The live metadata capture contains 24 existing function definitions, actual
course/lesson policies, table columns/constraints/ACLs, all four lesson triggers,
course trigger metadata, role flags and enum/auxiliary relation metadata. Three
queries read metadata only: no accounts, credentials, student rows or business
documents. The capture is source material, not production test evidence.

The suspected path is the old permissive PUBLIC ALL lesson policy. It accepts
current_organization_id(), which returns an ordinary learner's profile tenant.
It is OR-combined with the later correct courses.write policy. Thus courses.write
false is not enough to establish that a visible same-tenant lesson is immutable.
Existing revoked-account restrictions still apply; protected CSZ triggers cover
two specific course IDs. Module schedules/overrides show related metadata but are
outside this first candidate. No finding is claimed exploited on production.

The isolated fixture is intentionally fresh and synthetic. It installs actual
captured auth/role/organization/account/admin/paid helper bodies in dependency
order. It uses actual course SELECT policies rather than an always-true course
visibility stub. The ordinary synthetic course must be visible and the real
paid_scope helper must return false before the baseline write is accepted as
reproduced. Actual paid anchor IDs are read from the helper source and created
only inside this empty lab; no production anchor/QA course is written.

Course/lesson columns, CHECK/UNIQUE constraints and lesson course/module FKs are
metadata based. Auxiliary tables keep only helper-referenced actual columns;
unrelated provisioning FKs/course triggers are not modeled. All four actual
lesson triggers run, including protected CSZ metadata and marketplace validation
invalidation. A trusted local readback confirms attempted row changes and the
actual invalidation side effect. Every scenario is rolled back.

The candidate adds one boolean predicate and three RESTRICTIVE write policies
TO PUBLIC. INSERT checks the new course; UPDATE checks both the old course through
USING and the new course through WITH CHECK; DELETE checks the old course. The
predicate requires authenticated JWT context, existing courses.write/account
permissions, current platform-admin write restrictions, an existing nondeleted,
nonbanned auth identity and an unblocked profile. It depends only on released
helpers. It has no UC013/014 dependency and changes no existing helper/ACL.

The new predicate is owner/authenticated executable after removal of unexpected
new-object default grants. All other non-BYPASS roles fail closed under the PUBLIC
restrictive policies. An explicit bystander case temporarily grants table writes
and carries an authenticated learner claim in the lab: baseline writes must be
demonstrated, then candidate writes must fail. Anonymous and default-role denials
cannot rely on an accidentally absent table grant. Database owner and trusted
service-role BYPASS semantics are separately exercised and remain unchanged.

The authored tests require actual baseline same-organization learner INSERT,
UPDATE and DELETE success with courses.write=false, real paid_scope=false and
trusted readback. They then check unauthorized/current-expiry/revocation/block
denials, genuine owner/staff/platform-admin successes, explicit teacher write
permission, both sides of reparenting, builder INSERT RETURNING/UPSERT, paid
nonbuyer denial, every preexisting SELECT result, original function metadata,
table ACLs and trigger/policy preservation. Setup failures/skips are not coverage.

The migration's preflight pins all 24 helper definitions, exact old course and
lesson policy sets, relation RLS/owner/ACL and all lesson trigger definitions.
New names/overloads/policy collisions refuse installation. A reviewed future
release must additionally preserve the full old migration ledger and urgent
students RPC, run native transaction/permission/default-ACL acceptance, save
fresh metadata pre/post evidence and pass root review. There is no authorization
to apply this migration or run old production rollback QA SQL from this file.
