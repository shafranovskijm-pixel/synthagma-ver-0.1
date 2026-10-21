import { describe, expect, it } from 'vitest';
import { assertDraftScope, assertSessionScope } from '../contract';
import { detail, draft, id, scope } from './fixtures';

describe('exact programme version retained with the conducted session and document draft', () => {
  it('accepts the exact retained programme version for both the session result and saved draft', () => {
    const session = detail(), saved = draft();
    expect(session.outcomes[0].outcome!.scope.program_version_id).toBe(session.version.source_proof.program_ref.version_id);
    expect(saved.draft.source_proof!.outcomes[0].outcome!.scope.program_version_id).toBe(saved.draft.source_proof!.session_source.program_ref.version_id);
    expect(() => assertSessionScope(session, scope.organization_id, scope.group_id, scope.course_id)).not.toThrow();
    expect(() => assertDraftScope(saved, scope.organization_id, scope.group_id, scope.course_id)).not.toThrow();
  });

  it('rejects a result for another programme version even when pupil, course, enrollment and snapshot IDs match', () => {
    const session = detail(), retained = structuredClone(session.version.source_proof.program_ref);
    session.outcomes[0].outcome!.scope.program_version_id = id(999);
    expect(() => assertSessionScope(session, scope.organization_id, scope.group_id, scope.course_id)).toThrow('UC_SESSION_INVALID_RESPONSE');
    expect(session.version.source_proof.program_ref).toEqual(retained);
  });

  it('rejects a document draft containing another programme version without rebinding the immutable source', () => {
    const saved = draft(), retained = structuredClone(saved.draft.source_proof!.session_source.program_ref);
    saved.draft.source_proof!.outcomes[0].outcome!.scope.program_version_id = id(999);
    expect(() => assertDraftScope(saved, scope.organization_id, scope.group_id, scope.course_id)).toThrow('UC_SESSION_INVALID_RESPONSE');
    expect(saved.draft.source_proof!.session_source.program_ref).toEqual(retained);
  });
});
