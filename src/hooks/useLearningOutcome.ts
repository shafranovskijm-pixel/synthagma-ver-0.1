import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { captureOfflineActor, isOfflineActorCurrent } from '@/utils/courseCache';
import * as api from '@/lib/learningOutcomes/client';
import * as c from '@/lib/learningOutcomes/contract';

type View = {
  key: string;
  associations: c.OutcomeAssociations | null;
  selected: c.OutcomeScope | null;
  data: c.OutcomeEnvelope | null;
  loading: boolean;
  error: c.OutcomeErrorCode | null;
  busy: boolean;
  pending: boolean;
  operationError: c.OutcomeErrorCode | null;
  decisionOptions: c.LearningDecisionOptions | null;
};
const emptyView = (key: string, loading = false): View => ({
  key, associations: null, selected: null, data: null, loading, error: null, busy: false, pending: false, operationError: null, decisionOptions: null,
});

/** The result, selection and uncertain request live only in this actor's in-memory generation. */
export function useLearningOutcome(
  organizationId: string, studentUserId: string, courseId: string, enrollmentId: string,
  enabled = true, observedAccessKey = '',
) {
  const { user, userRole, loading: authLoading } = useAuth();
  const accessRevision = captureOfflineActor(user?.id);
  const targetKey = JSON.stringify([user?.id, userRole, accessRevision, authLoading, organizationId, studentUserId, courseId, enrollmentId, enabled, observedAccessKey]);
  const live = useRef({ key: targetKey, generation: 0 });
  if (live.current.key !== targetKey) live.current = { key: targetKey, generation: live.current.generation + 1 };
  const generation = live.current.generation;
  const key = JSON.stringify([targetKey, generation]);
  const lifecycle = useRef({ active: true, revision: 0 });
  const authorityEpoch = useRef(0);
  const selectionEpoch = useRef(0);
  const sequence = useRef(0);
  const work = useRef<{ generation: number; busy: boolean; prepared: api.PreparedLearningOutcomeCapture | null }>({ generation, busy: false, prepared: null });
  if (work.current.generation !== generation) work.current = { generation, busy: false, prepared: null };
  const [view, setView] = useState<View>(() => emptyView(''));
  const current = () => lifecycle.current.active && live.current.generation === generation && enabled && !authLoading
    && !!user && isOfflineActorCurrent(user.id, accessRevision)
    && [organizationId, studentUserId, courseId, enrollmentId].every(id => c.outcomeUuid.safeParse(id).success);
  const visible = current() && view.key === key;
  const data = visible ? view.data : null;
  const selected = visible ? view.selected : null;
  const makeScope = (association: c.OutcomeScope | null, includeSelection = true) => {
    const life = lifecycle.current.revision, authority = authorityEpoch.current, selection = selectionEpoch.current;
    return api.captureLearningOutcomeScope(organizationId, studentUserId, courseId, enrollmentId, association, () => current()
      && lifecycle.current.revision === life && authorityEpoch.current === authority && (!includeSelection || selectionEpoch.current === selection));
  };
  const denyAccess = () => {
    if (!current()) return;
    authorityEpoch.current++; selectionEpoch.current++; sequence.current++;
    work.current = { generation, busy: false, prepared: null };
    setView({ ...emptyView(key), error: 'ACCESS_DENIED' });
  };
  const publishError = (scope: api.LearningOutcomeActorScope, error: unknown, requestSequence: number) => {
    if (!api.learningOutcomeScopeCurrent(scope) || requestSequence !== sequence.current) return;
    const code = api.normalizeLearningOutcomeError(error).code;
    if (code === 'ACCESS_DENIED') denyAccess();
    else setView(previous => previous.key === key ? { ...previous, data: null, loading: false, error: code } : { ...emptyView(key), error: code });
  };
  const refreshAssociations = async (more = false): Promise<void> => {
    if (!current() || work.current.busy || work.current.prepared) return;
    const old = visible ? view.associations : null;
    if (more && (!old || !old.next_after_snapshot_id)) return;
    selectionEpoch.current++;
    const scope = makeScope(null, false), requestSequence = ++sequence.current;
    setView(previous => ({ ...emptyView(key, true), associations: more && previous.key === key ? previous.associations : null,
      pending: !!work.current.prepared }));
    try {
      const result = await api.readLearningOutcomeAssociations(scope, more ? old!.next_after_snapshot_id : null);
      if (!api.learningOutcomeScopeCurrent(scope) || requestSequence !== sequence.current) return;
      const associations = more && old ? [...old.associations, ...result.associations] : result.associations;
      if (new Set(associations.map(item => item.scope.program_enrollment_snapshot_id)).size !== associations.length) throw new api.LearningOutcomeError();
      const all = { ...result, associations };
      const single = associations.length === 1 && result.next_after_snapshot_id === null ? associations[0] : null;
      setView({ ...emptyView(key), associations: all, selected: single?.scope || null, data: single, pending: !!work.current.prepared });
    } catch (error) { publishError(scope, error, requestSequence); }
  };
  const readSelected = async (association: c.OutcomeScope): Promise<void> => {
    if (!current() || work.current.busy) return;
    const scope = makeScope(association), requestSequence = ++sequence.current;
    setView(previous => previous.key === key ? { ...previous, selected: association, data: null, loading: true, error: null, decisionOptions: null }
      : { ...emptyView(key, true), selected: association });
    try {
      const result = await api.readLearningOutcome(scope);
      if (!api.learningOutcomeScopeCurrent(scope) || requestSequence !== sequence.current) return;
      setView(previous => previous.key === key ? { ...previous, selected: association, data: result, loading: false, error: null } : previous);
    } catch (error) { publishError(scope, error, requestSequence); }
  };
  const selectAssociation = (association: c.OutcomeScope | null) => {
    if (!current() || work.current.busy || work.current.prepared) return;
    if (association && (!visible || !view.associations?.associations.some(item => c.sameOutcomeScope(item.scope, association)))) return;
    selectionEpoch.current++; sequence.current++;
    setView(previous => previous.key === key ? { ...previous, selected: association, data: null, loading: !!association, error: null, operationError: null, decisionOptions: null } : previous);
    if (association) void readSelected(association);
  };
  const refresh = async () => {
    if (!current() || work.current.busy) return;
    if (selected) await readSelected(selected);
    else await refreshAssociations();
  };
  useEffect(() => {
    lifecycle.current.active = true; lifecycle.current.revision++;
    selectionEpoch.current++; sequence.current++;
    work.current = { generation, busy: false, prepared: null };
    setView(emptyView(key, current()));
    if (current()) void refreshAssociations();
    return () => {
      lifecycle.current.active = false; lifecycle.current.revision++; selectionEpoch.current++; sequence.current++;
      work.current = { generation, busy: false, prepared: null };
    };
  }, [key]);

  const execute = async (prepared: api.PreparedLearningOutcomeCapture): Promise<boolean> => {
    if (!current() || work.current.busy || !api.learningOutcomeScopeCurrent(prepared.scope)) return false;
    work.current.busy = true; work.current.prepared = prepared;
    setView(previous => previous.key === key ? { ...previous, busy: true, pending: true, operationError: null } : previous);
    try {
      const result = await api.applyPreparedLearningOutcomeAction(prepared);
      if (!api.learningOutcomeScopeCurrent(prepared.scope)) return false;
      sequence.current++; work.current.prepared = null;
      setView(previous => previous.key === key ? { ...previous, data: result.current, selected: result.current.scope, loading: false,
        error: null, busy: false, pending: false, operationError: null, decisionOptions: null } : previous);
      return true;
    } catch (error) {
      if (!api.learningOutcomeScopeCurrent(prepared.scope)) return false;
      const code = api.normalizeLearningOutcomeError(error).code;
      if (code === 'ACCESS_DENIED') { denyAccess(); return false; }
      const uncertain = code === 'DEPENDENCY_UNAVAILABLE';
      if (!uncertain) work.current.prepared = null;
      setView(previous => previous.key === key ? { ...previous, busy: false, pending: uncertain, operationError: code } : previous);
      return false;
    } finally { if (api.learningOutcomeScopeCurrent(prepared.scope)) work.current.busy = false; }
  };
  const capture = async (reason: string): Promise<boolean> => {
    if (!current() || !data || !selected || !data.criteria_ref || !data.capabilities.can_capture || view.loading || view.error
      || work.current.busy || work.current.prepared) return false;
    const actorScope = makeScope(selected);
    const command = { action: 'capture_machine_result' as const, scope: selected, expected_revision: data.revision,
      expected_criteria_ref: data.criteria_ref, reason: reason.trim() };
    if (!c.outcomeCaptureCommandSchema.safeParse(command).success) return false;
    work.current.busy = true;
    setView(previous => previous.key === key ? { ...previous, busy: true, operationError: null } : previous);
    try {
      const prepared = await api.prepareLearningOutcomeCapture(actorScope, command, crypto.randomUUID());
      if (!api.learningOutcomeScopeCurrent(actorScope)) return false;
      work.current.busy = false;
      return await execute(prepared);
    } catch (error) {
      if (api.learningOutcomeScopeCurrent(actorScope)) {
        const code = api.normalizeLearningOutcomeError(error).code;
        if (code === 'ACCESS_DENIED') denyAccess();
        else setView(previous => previous.key === key ? { ...previous, busy: false, operationError: code } : previous);
      }
      return false;
    } finally { if (api.learningOutcomeScopeCurrent(actorScope)) work.current.busy = false; }
  };
  const decide = async (input: Pick<c.OutcomeDecisionCommand, 'outcome' | 'basis' | 'staff_reason' | 'learner_summary'
    | 'reviewed_current_component_ids' | 'recognized_component_ids' | 'recognition_file_version_id'>): Promise<boolean> => {
    if (!current() || !data || data.audience !== 'staff' || !selected || !data.criteria_ref || !data.machine
      || !data.capabilities.can_decide || view.loading || view.error || work.current.busy || work.current.prepared) return false;
    const command: c.OutcomeDecisionCommand = { ...input, action: data.last_decision ? 'supersede_decision' : 'record_attestation_decision',
      scope: selected, expected_revision: data.revision, criteria_ref: data.criteria_ref, machine_result_id: data.machine.id,
      expected_machine_input_hash: data.machine.input_hash, expected_decision_id: data.last_decision?.id || null };
    if (!c.outcomeDecisionCommandSchema.safeParse(command).success) return false;
    const actorScope = makeScope(selected); work.current.busy = true;
    setView(previous => previous.key === key ? { ...previous, busy: true, operationError: null } : previous);
    try {
      const prepared = await api.prepareLearningOutcomeAction(actorScope, command, crypto.randomUUID());
      if (!api.learningOutcomeScopeCurrent(actorScope)) return false;
      work.current.busy = false; return await execute(prepared);
    } catch (error) {
      if (api.learningOutcomeScopeCurrent(actorScope)) {
        const code = api.normalizeLearningOutcomeError(error).code;
        if (code === 'ACCESS_DENIED') denyAccess();
        else setView(previous => previous.key === key ? { ...previous, busy: false, operationError: code } : previous);
      }
      return false;
    } finally { if (api.learningOutcomeScopeCurrent(actorScope)) work.current.busy = false; }
  };
  const loadDecisionOptions = async () => {
    if (!current() || !selected || !data || data.audience !== 'staff' || !data.capabilities.can_decide || work.current.busy || work.current.prepared) return;
    const actorScope = makeScope(selected), machineId = data.machine?.id;
    try {
      const options = await api.readLearningDecisionOptions(actorScope);
      if (api.learningOutcomeScopeCurrent(actorScope)) setView(previous => previous.key === key && previous.data?.machine?.id === machineId
        ? { ...previous, decisionOptions: options, operationError: null } : previous);
    } catch (error) {
      if (api.learningOutcomeScopeCurrent(actorScope)) {
        const code = api.normalizeLearningOutcomeError(error).code;
        if (code === 'ACCESS_DENIED') denyAccess();
        else setView(previous => previous.key === key ? { ...previous, decisionOptions: null, operationError: code } : previous);
      }
    }
  };
  return {
    viewKey: JSON.stringify([key, generation, authorityEpoch.current, selectionEpoch.current]), data, selected,
    associations: visible ? view.associations : null,
    loading: current() && (!visible || view.loading), error: visible ? view.error : null,
    busy: visible && view.busy, pending: visible && view.pending, operationError: visible ? view.operationError : null,
    decisionOptions: visible ? view.decisionOptions : null,
    refresh, refreshAssociations, selectAssociation, capture, decide, loadDecisionOptions, denyAccess,
    retryPending: () => work.current.prepared ? execute(work.current.prepared) : Promise.resolve(false),
  };
}

export type LearningOutcomeController = ReturnType<typeof useLearningOutcome>;
