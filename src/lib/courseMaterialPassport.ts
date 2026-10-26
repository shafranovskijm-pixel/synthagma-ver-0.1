import { z } from "zod";
import passportJson from "@/data/courseMaterialPassports20261026.json?raw";
import scopeJson from "@/data/platformCoursePassportScope20261026.json?raw";

const uuid = z.string().uuid();
const text = z.string().min(1);
const hours = z.number().nonnegative().finite();
const passportSchema = z.object({
  courseId: uuid,
  source: z.object({ courseId: uuid, lessonId: uuid, contentSha256: z.string().regex(/^[a-f0-9]{64}$/), sourceEdition: text }),
  sourceDeclared: z.object({
    fullTitle: text, purpose: text, audience: text, entryRequirements: text,
    outcomes: z.array(text).min(1), applicability: text,
    programmeType: z.enum(["qualification_upgrade", "professional_retraining"]), academicHours: z.number().positive().finite(),
    studyPlan: z.object({ columns: z.array(text).length(6), rows: z.array(z.object({
      title: text, sourceCells: z.array(text).length(6),
      hours: z.object({ theory: hours, practice: hours, selfStudy: hours, assessment: hours, total: hours }),
    })).min(1), declaredAcademicHours: hours, calculatedAcademicHours: hours, arithmeticConsistent: z.literal(true) }),
    authoredAssessment: z.object({ format: text, academicHours: hours, conditions: text.nullable(), criteria: text.nullable() }),
    authoredCalendar: z.object({ text, status: text }).nullable(),
  }),
  assessment: z.object({ status: z.literal("UNKNOWN") }),
  unknown: z.object({ document: z.null(), author: z.null(), rights: z.null(), methodist: z.null(), factsApproval: z.null() }),
});
export type CourseMaterialPassport = z.infer<typeof passportSchema>;
export type PassportVerification = { status: "verified" } | { status: "unconfirmed" };

export function parsePassportCatalog(value: unknown): CourseMaterialPassport[] | null {
  const parsed = z.object({ schemaVersion: z.literal(1), courses: z.array(passportSchema) }).safeParse(value);
  if (!parsed.success) return null;
  const rows = parsed.data.courses;
  if (new Set(rows.map(x => x.courseId)).size !== rows.length || new Set(rows.map(x => x.source.lessonId)).size !== rows.length) return null;
  if (rows.some(row => row.courseId !== row.source.courseId || row.sourceDeclared.studyPlan.declaredAcademicHours !== row.sourceDeclared.academicHours
    || row.sourceDeclared.studyPlan.calculatedAcademicHours !== row.sourceDeclared.academicHours
    || Math.abs(row.sourceDeclared.studyPlan.rows.reduce((sum, r) => sum + r.hours.total, 0) - row.sourceDeclared.academicHours) > 1e-9
    || row.sourceDeclared.studyPlan.rows.some(({ hours: h }) => Math.abs(h.theory + h.practice + h.selfStudy + h.assessment - h.total) > 1e-9))) return null;
  return rows;
}

function readCatalog(): CourseMaterialPassport[] {
  try { return parsePassportCatalog(JSON.parse(passportJson)) ?? []; } catch { return []; }
}
function readPlatformScope(): Set<string> {
  try {
    const scope = z.object({ organizationId: z.literal("4ac2c05a-d8b5-4e72-ba31-f2c743091d95"), courseIds: z.array(uuid) }).parse(JSON.parse(scopeJson));
    return new Set(scope.courseIds);
  } catch { return new Set(); }
}
const platformCourses = readPlatformScope();
export const courseMaterialPassports = readCatalog();
export const isPlatformPassportCourse = (courseId: string): boolean => platformCourses.has(courseId);
export const findCourseMaterialPassport = (courseId: string): CourseMaterialPassport | null =>
  isPlatformPassportCourse(courseId) ? courseMaterialPassports.find(row => row.courseId === courseId) ?? null : null;

export function verifyPlatformCourseOwnership(courseId: string, row: unknown, error: unknown = null): boolean {
  if (error || !isPlatformPassportCourse(courseId)) return false;
  const parsed = z.object({ id: uuid, organization_id: z.literal("4ac2c05a-d8b5-4e72-ba31-f2c743091d95") }).safeParse(row);
  return parsed.success && parsed.data.id === courseId;
}

export async function sha256ExactUtf8(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassportSource(passport: CourseMaterialPassport, courseId: string, row: unknown, error: unknown = null): Promise<PassportVerification> {
  if (error || !isPlatformPassportCourse(courseId) || passport.courseId !== courseId || passport.source.courseId !== courseId) return { status: "unconfirmed" };
  const source = z.object({ id: uuid, course_id: uuid, content: z.string() }).safeParse(row);
  if (!source.success || source.data.id !== passport.source.lessonId || source.data.course_id !== courseId) return { status: "unconfirmed" };
  try {
    return { status: await sha256ExactUtf8(source.data.content) === passport.source.contentSha256 ? "verified" : "unconfirmed" };
  } catch { return { status: "unconfirmed" }; }
}
