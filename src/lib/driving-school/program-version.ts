import type { Row } from './types';

/** Display only the exact linked programme; names and newer editions are not identity. */
export function linkedProgramVersion(
  resources: readonly Row[],
  programId: string | null | undefined,
): string {
  const program = resources.find(
    (resource): resource is Row<'program'> =>
      resource.kind === 'program' && resource.id === programId,
  );
  if (!program) return 'программа не найдена';
  return program.data.version.trim() || 'не указана';
}
