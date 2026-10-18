import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { parseProgramList, parseCourseBinding, parseGroupProgramFacts, programCandidatesSchema, programFactsSchema,
  programVersionSchema, programFactsReady, courseBindingSchema, groupBindingSchema, enrollmentSnapshotSchema,
  type ProgramCandidates, type ProgramEnvelope, type ProgramFacts } from "@/lib/programFacts";

const rpc = (name: string, args: Record<string, unknown>) => (supabase.rpc as any)(name, args);
const validId = (value: string) => z.string().uuid().safeParse(value).success;
type ResourceState<T> = { key: string; data: T | null; loading: boolean; saving: boolean; error: string | null; conflict: boolean; denied: boolean; saved: boolean };
/** An uncertain write retains its UUID and body. A receipt is followed by a fresh read. */
function useFactsResource<T>(key: string, enabled: boolean, read: () => Promise<T>) {
  const active = useRef(key), generation = useRef(0), busy = useRef(false);
  const pending = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const empty = (): ResourceState<T> => ({ key, data: null, loading: enabled, saving: false, error: null, conflict: false, denied: false, saved: false });
  const [state, setState] = useState<ResourceState<T>>(empty);
  useLayoutEffect(() => {
    active.current = key; ++generation.current; busy.current = false; pending.current = null; setState(empty());
    return () => { ++generation.current; };
  }, [key]);
  const reload = useCallback(async () => {
    if (!enabled || active.current !== key || busy.current) return;
    const run = ++generation.current;
    setState(s => ({ ...s, loading: true, error: null, saved: false }));
    try {
      const data = await read();
      if (active.current !== key || generation.current !== run) return;
      pending.current = null;
      setState({ ...empty(), data, loading: false });
    } catch (e: any) {
      if (active.current !== key || generation.current !== run) return;
      setState({ ...empty(), loading: false, denied: e?.code === "42501",
        error: e?.code === "42501" ? "Сведения о программе недоступны с вашими правами." : "Не удалось загрузить программу. Повторите загрузку." });
    }
  }, [key, enabled, read]);
  useEffect(() => { void reload(); }, [reload]);
  const mutate = async (name: string, body: Record<string, unknown>, validate: (value: unknown) => void): Promise<boolean> => {
    if (!enabled || active.current !== key || state.key !== key || !state.data || state.loading || state.conflict || state.denied || busy.current) return false;
    const fingerprint = JSON.stringify([name, body]);
    if (pending.current && pending.current.fingerprint !== fingerprint) {
      setState(s => ({ ...s, error: "Исход предыдущего сохранения неизвестен. Повторите то же действие или обновите сведения перед другим действием." }));
      return false;
    }
    pending.current ??= { fingerprint, requestId: crypto.randomUUID() };
    busy.current = true;
    const run = ++generation.current;
    let committed = false;
    setState(s => ({ ...s, saving: true, error: null, saved: false }));
    try {
      const result = await rpc(name, { ...body, p_request_id: pending.current.requestId });
      if (result.error) throw result.error;
      validate(result.data);
      committed = true;
      if (active.current !== key || generation.current !== run) return false;
      pending.current = null;
      const data = await read();
      if (active.current !== key || generation.current !== run) return false;
      setState({ ...empty(), data, loading: false, saved: true });
      return true;
    } catch (e: any) {
      if (active.current !== key || generation.current !== run) return false;
      const conflict = e?.code === "40001" || e?.code === "55000";
      if (conflict || e?.code === "42501" || e?.code === "22023") pending.current = null;
      setState(s => ({ ...s, data: committed ? null : s.data, saving: false, loading: false, saved: committed, conflict, denied: e?.code === "42501",
        error: committed ? "Изменение сохранено, но текущее состояние не загрузилось. Обновите сведения перед следующим действием."
          : conflict ? "Программа или связь изменились. Обновите сведения и проверьте текущую версию."
          : e?.code === "42501" ? "Действие недоступно. Проверьте полномочия и назначенного проверяющего."
          : e?.code === "22023" ? "Проверьте данные программы, выбранную версию и связи."
          : "Сохранение не подтверждено. Повторите то же действие или обновите сведения." }));
      return false;
    } finally { if (active.current === key && generation.current === run) busy.current = false; }
  };
  const exposed = state.key === key ? state : empty();
  return { ...exposed, reload, mutate, usable: !!exposed.data && !exposed.loading && !exposed.saving && !exposed.conflict && !exposed.denied };
}

type ProgramListState = { programs: ProgramEnvelope[]; candidates: ProgramCandidates | null; candidatesError: string | null };
type CreateVersion = { programId: string; name: string; description: string; fileVersionId: string; reviewerId: string; facts: ProgramFacts };
export function useProgramFacts(organizationId: string | null, canConfigure = false) {
  const org = organizationId ?? "";
  const read = useCallback(async (): Promise<ProgramListState> => {
    const result = await rpc("list_program_facts", { p_organization_id: org });
    if (result.error) throw result.error;
    const programs = parseProgramList(result.data, org);
    if (!canConfigure) return { programs, candidates: null, candidatesError: null };
    try {
      const choices = await rpc("list_program_facts_candidates", { p_organization_id: org });
      if (choices.error) throw choices.error;
      return { programs, candidates: programCandidatesSchema.parse(choices.data), candidatesError: null };
    } catch {
      return { programs, candidates: null, candidatesError: "Не удалось получить доступные файлы и сотрудников. История программ доступна; для изменений повторите загрузку." };
    }
  }, [org, canConfigure]);
  const h = useFactsResource(`programs:${org}:${canConfigure}`, !!org, read);
  const createVersion = async (input: CreateVersion) => {
    const p = h.data?.programs.find(p => p.program.id === input.programId), c = h.data?.candidates;
    if (!h.usable || !canConfigure || !c || !validId(input.programId) || !input.name.trim()
      || p && !p.capabilities.can_create_version || !c.files.some(f => f.version_id === input.fileVersionId)
      || !c.reviewers.some(r => r.user_id === input.reviewerId)) return false;
    const parsed = programFactsSchema.safeParse(input.facts);
    if (!parsed.success) return false;
    return h.mutate("create_program_facts_version", { p_organization_id: org, p_program_id: input.programId,
      p_name: input.name.trim(), p_description: input.description.trim() || null, p_file_version_id: input.fileVersionId,
      p_reviewer_id: input.reviewerId, p_facts: parsed.data, p_expected_revision: p?.program.revision ?? 0 }, value => {
      const v = programVersionSchema.parse(value);
      if (v.organization_id !== org || v.program_id !== input.programId || v.file_version_id !== input.fileVersionId) throw new Error("Unexpected program version");
    });
  };
  const transition = async (programId: string, versionId: string, action: "submit" | "approve" | "reject" | "cancel", note = "") => {
    const p = h.data?.programs.find(p => p.program.id === programId), v = p?.versions.find(v => v.id === versionId);
    if (!h.usable || !p || !v || !p.capabilities[`can_${action}`] || p.current_version?.id !== versionId
      || action === "submit" && v.state !== "draft" || ["approve", "reject"].includes(action) && v.state !== "in_review"
      || action === "approve" && !programFactsReady(v.facts) || action === "reject" && !note.trim()) return false;
    return h.mutate("transition_program_facts_version", { p_version_id: versionId, p_expected_revision: p.program.revision, p_action: action, p_note: note.trim() || null }, value => {
      const updated = programVersionSchema.parse(value);
      if (updated.organization_id !== org || updated.program_id !== programId || updated.id !== versionId) throw new Error("Unexpected program decision");
    });
  };
  return { ...h, programs: h.data?.programs ?? null, candidates: h.data?.candidates ?? null,
    candidatesError: h.data?.candidatesError ?? null, createVersion, transition };
}

export function useCourseProgramBinding(organizationId: string | null, courseId: string | null, canConfigure = false) {
  const org = organizationId ?? "", course = courseId ?? "";
  const read = useCallback(async () => {
    const r = await rpc("get_course_program_binding", { p_organization_id: org, p_course_id: course });
    if (r.error) throw r.error;
    return parseCourseBinding(r.data, org, course);
  }, [org, course]);
  const h = useFactsResource(`course:${org}:${course}:${canConfigure}`, !!org && !!course, read);
  const bind = async (versionId: string) => {
    if (!h.usable || !canConfigure || !h.data || !validId(versionId)) return false;
    return h.mutate("bind_course_program_version", { p_organization_id: org, p_course_id: course,
      p_version_id: versionId, p_expected_revision: h.data.revision }, value => {
      const b = courseBindingSchema.parse(value);
      if (b.organization_id !== org || b.course_id !== course || b.version_id !== versionId) throw new Error("Unexpected course binding");
    });
  };
  return { ...h, bind };
}

export function useGroupProgramFacts(organizationId: string | null, groupId: string | null, enrollmentId: string | null = null, canConfigure = false) {
  const org = organizationId ?? "", group = groupId ?? "";
  const read = useCallback(async () => {
    const r = await rpc("get_group_program_facts", { p_organization_id: org, p_group_id: group, p_enrollment_id: enrollmentId });
    if (r.error) throw r.error;
    return parseGroupProgramFacts(r.data, org, group, enrollmentId);
  }, [org, group, enrollmentId]);
  const h = useFactsResource(`group:${org}:${group}:${enrollmentId ?? ""}:${canConfigure}`, !!org && !!group, read);
  const bind = async (courseId: string, versionId: string) => {
    if (!h.usable || !h.data?.capabilities.can_bind || !validId(courseId) || !validId(versionId)) return false;
    return h.mutate("bind_group_program_version", { p_organization_id: org, p_group_id: group, p_course_id: courseId,
      p_version_id: versionId, p_expected_revision: h.data.revision }, value => {
      const b = groupBindingSchema.parse(value);
      if (b.organization_id !== org || b.group_id !== group || b.course_id !== courseId || b.version_id !== versionId) throw new Error("Unexpected group binding");
    });
  };
  const confirmExisting = async (enrollmentIds: string[]) => {
    const ids = [...new Set(enrollmentIds)].sort();
    if (!h.usable || !h.data?.capabilities.can_confirm_existing || !h.data.binding || !ids.length
      || ids.some(id => !h.data!.enrollments.some(e => e.enrollment_id === id && e.state === "unconfirmed"))) return false;
    return h.mutate("confirm_group_program_enrollments", { p_organization_id: org, p_group_id: group,
      p_enrollment_ids: ids, p_expected_binding_revision: h.data.binding.revision }, value => {
      const r = z.object({ snapshots: z.array(enrollmentSnapshotSchema) }).parse(value);
      if (r.snapshots.length !== ids.length || new Set(r.snapshots.map(s => s.enrollment_id)).size !== ids.length
        || r.snapshots.some(s => s.organization_id !== org || s.group_id !== group || !ids.includes(s.enrollment_id)
          || s.binding_id !== h.data!.binding!.id || s.version_id !== h.data!.binding!.version_id
          || !h.data!.enrollments.some(e => e.enrollment_id === s.enrollment_id && e.user_id === s.user_id))) throw new Error("Unexpected enrollment confirmation");
    });
  };
  return { ...h, bind, confirmExisting };
}
