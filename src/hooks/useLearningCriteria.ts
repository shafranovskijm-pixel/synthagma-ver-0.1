import { useEffect, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import { captureOfflineActor, isOfflineActorCurrent } from '@/utils/courseCache';
import * as api from '@/lib/learningOutcomes/client';
import * as c from '@/lib/learningOutcomes/contract';

type View = { key: string; data: c.LearningCriteriaEnvelope | null; options: c.LearningCriteriaOptions | null;
  loading: boolean; error: c.OutcomeErrorCode | null; busy: boolean; pending: boolean; operationError: c.OutcomeErrorCode | null };
const empty = (key: string, loading = false): View => ({ key, data: null, options: null, loading, error: null, busy: false, pending: false, operationError: null });

export function useLearningCriteria(organizationId: string, courseId: string, programVersionId: string, enabled = true) {
  const { user, userRole, loading: authLoading } = useAuth();
  const revision = captureOfflineActor(user?.id);
  const target = JSON.stringify([user?.id, userRole, revision, authLoading, organizationId, courseId, programVersionId, enabled]);
  const live = useRef({ target, generation: 0 });
  if (live.current.target !== target) live.current = { target, generation: live.current.generation + 1 };
  const generation = live.current.generation, key = JSON.stringify([target, generation]);
  const lifecycle = useRef({ active: true, epoch: 0 });
  const authority = useRef(0), sequence = useRef(0);
  const work = useRef<{ generation: number; busy: boolean; prepared: api.PreparedLearningCriteriaAction | null }>({ generation, busy: false, prepared: null });
  if (work.current.generation !== generation) work.current = { generation, busy: false, prepared: null };
  const [view, setView] = useState<View>(() => empty(''));
  const current = () => lifecycle.current.active && live.current.generation === generation && enabled && !authLoading && !!user
    && isOfflineActorCurrent(user.id, revision) && [organizationId, courseId, programVersionId].every(id => c.outcomeUuid.safeParse(id).success);
  const visible = current() && view.key === key;
  const data = visible ? view.data : null;
  const makeScope = () => {
    const life = lifecycle.current.epoch, epoch = authority.current;
    return api.captureLearningCriteriaScope(organizationId, courseId, programVersionId, () => current() && life === lifecycle.current.epoch && epoch === authority.current);
  };
  const deny = () => {
    if (!current()) return;
    authority.current++; sequence.current++; work.current = { generation, busy: false, prepared: null };
    setView({ ...empty(key), error: 'ACCESS_DENIED' });
  };
  const reload = async () => {
    if (!current() || work.current.busy) return;
    const scope = makeScope(), request = ++sequence.current;
    setView(previous => ({ ...empty(key, true), pending: previous.key === key && previous.pending }));
    try {
      const result = await api.readLearningCriteria(scope);
      const options = result.capabilities.can_save ? await api.readLearningCriteriaOptions(scope) : null;
      if (!api.learningOutcomeScopeCurrent(scope) || request !== sequence.current) return;
      setView({ ...empty(key), data: result, options, pending: !!work.current.prepared });
    } catch (error) {
      if (!api.learningOutcomeScopeCurrent(scope) || request !== sequence.current) return;
      const code = api.normalizeLearningOutcomeError(error).code;
      if (code === 'ACCESS_DENIED') deny();
      else setView({ ...empty(key), error: code, pending: !!work.current.prepared });
    }
  };
  useEffect(() => {
    lifecycle.current.active = true; lifecycle.current.epoch++; sequence.current++;
    work.current = { generation, busy: false, prepared: null }; setView(empty(key, current()));
    if (current()) void reload();
    return () => { lifecycle.current.active = false; lifecycle.current.epoch++; sequence.current++; work.current = { generation, busy: false, prepared: null }; };
  }, [key]);
  const execute = async (prepared: api.PreparedLearningCriteriaAction): Promise<boolean> => {
    if (!current() || work.current.busy || !api.learningOutcomeScopeCurrent(prepared.scope)) return false;
    work.current.busy = true; work.current.prepared = prepared;
    setView(previous => previous.key === key ? { ...previous, busy: true, pending: true, operationError: null } : previous);
    try {
      const result = await api.applyPreparedLearningCriteriaAction(prepared);
      if (!api.learningOutcomeScopeCurrent(prepared.scope)) return false;
      sequence.current++; work.current.prepared = null;
      setView(previous => previous.key === key ? { ...previous, data: result.current, busy: false, pending: false, loading: false, error: null, operationError: null } : previous);
      return true;
    } catch (error) {
      if (!api.learningOutcomeScopeCurrent(prepared.scope)) return false;
      const code = api.normalizeLearningOutcomeError(error).code;
      if (code === 'ACCESS_DENIED') { deny(); return false; }
      const uncertain = code === 'DEPENDENCY_UNAVAILABLE';
      if (!uncertain) work.current.prepared = null;
      setView(previous => previous.key === key ? { ...previous, busy: false, pending: uncertain, operationError: code } : previous);
      return false;
    } finally { if (api.learningOutcomeScopeCurrent(prepared.scope)) work.current.busy = false; }
  };
  const mutate = async (command: c.LearningCriteriaAction): Promise<boolean> => {
    if (!current() || !data?.capabilities.can_save || view.loading || view.error || work.current.busy || work.current.prepared
      || !c.learningCriteriaActionSchema.safeParse(command).success) return false;
    if (command.action === 'save_criteria_version' && command.draft_id !== null) {
      const draft = data.versions.find(version => version.id === command.draft_id);
      if (!draft || draft.state !== 'draft' || draft.created_by !== user?.id || draft.revision !== command.expected_revision) return false;
    }
    if (command.action === 'approve_criteria_version') {
      const draft = data.versions.find(version => version.id === command.version_id);
      if (!draft || draft.state !== 'draft' || draft.revision !== command.expected_revision || draft.content_hash !== command.expected_content_hash
        || draft.reviewer_id !== user?.id || draft.definition.independent_review_required && draft.created_by === user?.id) return false;
    }
    const scope = makeScope(); work.current.busy = true;
    setView(previous => previous.key === key ? { ...previous, busy: true, operationError: null } : previous);
    try {
      const prepared = await api.prepareLearningCriteriaAction(scope, command, crypto.randomUUID());
      if (!api.learningOutcomeScopeCurrent(scope)) return false;
      work.current.busy = false; return await execute(prepared);
    } catch (error) {
      if (api.learningOutcomeScopeCurrent(scope)) {
        const code = api.normalizeLearningOutcomeError(error).code;
        if (code === 'ACCESS_DENIED') deny();
        else setView(previous => previous.key === key ? { ...previous, busy: false, operationError: code } : previous);
      }
      return false;
    } finally { if (api.learningOutcomeScopeCurrent(scope)) work.current.busy = false; }
  };
  return { viewKey: JSON.stringify([key, authority.current]), actorId: current() ? user?.id : null, data,
    options: visible ? view.options : null, loading: current() && (!visible || view.loading), error: visible ? view.error : null,
    busy: visible && view.busy, pending: visible && view.pending, operationError: visible ? view.operationError : null,
    reload, mutate, retryPending: () => work.current.prepared ? execute(work.current.prepared) : Promise.resolve(false) };
}
export type LearningCriteriaController = ReturnType<typeof useLearningCriteria>;
