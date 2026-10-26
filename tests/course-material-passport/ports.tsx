type SourceRead = { table: string; columns: string; field: string; id: string };
export const passportPort = {
  calls: [] as SourceRead[],
  read: async (_request: SourceRead): Promise<{ data: unknown; error: unknown }> => ({ data: null, error: null }),
};
export const supabase = {
  from(table: string) {
    if (table !== "lessons" && table !== "courses") throw new Error("Unexpected table in passport test");
    return { select(columns: string) { return { eq(field: string, id: string) { return { maybeSingle() {
      const request = { table, columns, field, id };
      passportPort.calls.push(request);
      return passportPort.read(request);
    } }; } }; } };
  },
};
export function CourseComments() { return <div data-testid="existing-course-comments" />; }
