import { parseGroupProgramGeneration, type ProgramGeneration } from "../../../../supabase/functions/_shared/program-facts";

/** Show the pinned programme even while some existing learners await confirmation. */
export function groupProgramPresentation(data: unknown, organizationId: string, groupId: string, userIds: string[]) {
  let projection: ProgramGeneration | null = null;
  try {
    projection = parseGroupProgramGeneration(data, organizationId, groupId, []);
    parseGroupProgramGeneration(data, organizationId, groupId, userIds);
    return { projection, error: null as string | null };
  } catch {
    return { projection, error: "Подтвердите программу и сведения обучения участников группы перед созданием документов." };
  }
}
