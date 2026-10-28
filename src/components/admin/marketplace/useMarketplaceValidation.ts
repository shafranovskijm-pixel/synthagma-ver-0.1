import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { platformCoursePublication } from "@/api/platformCoursePublication";
import { PublicationError, PublicationIntents, ownPlatformPublicationTarget, canPublishPublication, publicationReadinessLabel,
  type PublicationReadiness, type PublicationTarget } from "@/lib/platformCoursePublication";
import { toast } from "sonner";
import type { ValidationRules, AiPrompts } from "../MarketplaceSettingsTab";
import { validateCourseIssues, validateCourseIssuesSimple, type ValidationRulesConfig } from "./validationHelpers";
import { checkMarketplacePublicationStructure } from "./publicationStructuralCheck";

interface CourseItem {
  id: string; course_id: string; organization_id: string | null;
  course?: { id: string; title: string; organization_id?: string };
}
interface UseMarketplaceValidationProps {
  courses: CourseItem[]; dbCategories: unknown[]; fetchData: () => void;
  aiProvider: string; gigachatModel?: string; aiPrompts: AiPrompts; valRules: ValidationRules;
}
export interface PublicationReportRow extends PublicationTarget {
  title: string; readiness: PublicationReadiness | null; message: string; published: boolean;
}
interface ScopeOperation { serial: number; scope: string; actorId: string }
type StructuralResult = { kind: "checked"; target: PublicationTarget; title: string; issues: string[]; readiness: PublicationReadiness }
  | { kind: "unavailable" | "out_of_scope"; target: PublicationTarget; title: string };

/** Moderator check/review workflow. It never generates or repairs materials. */
export function useMarketplaceValidation({ courses, fetchData, valRules }: UseMarketplaceValidationProps) {
  const auth = useAuth();
  const actorId = !auth.loading && !auth.authError && auth.userRole === "admin" ? auth.user?.id ?? null : null;
  const [validatedCourses, setValidatedCourses] = useState<Record<string, "ok" | "error">>({});
  const [publicationByCourse, setPublicationByCourse] = useState<Record<string, PublicationReadiness>>({});
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [bulkValidatingGroup, setBulkValidatingGroup] = useState<string | null>(null);
  const [bulkValidateProgress, setBulkValidateProgress] = useState("");
  const [validationReport, setValidationReport] = useState<{ courseId: string; title: string; issues: string[] }[] | null>(null);
  const [validationReportOk, setValidationReportOk] = useState(0);
  const [publicationReport, setPublicationReport] = useState<PublicationReportRow[]>([]);
  const [publishedCount, setPublishedCount] = useState(0);
  const [reportKind, setReportKind] = useState<"structure" | "publish">("structure");
  const mounted = useRef(false), serial = useRef(0), busy = useRef(false);
  const intents = useRef(new PublicationIntents());
  const scope = `${actorId ?? "unavailable"}|${courses.map(c => `${c.id}:${c.course_id}:${c.organization_id}:${c.course?.organization_id ?? "unknown"}`).sort().join("|")}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; serial.current++; }; }, []);
  useEffect(() => {
    serial.current++; busy.current = false; intents.current.clear();
    setValidatedCourses({}); setPublicationByCourse({}); setValidatingId(null); setBulkValidatingGroup(null); setBulkValidateProgress("");
    setValidationReport(null); setValidationReportOk(0); setPublicationReport([]); setPublishedCount(0);
  }, [scope]);
  const live = (op: ScopeOperation) => mounted.current && op.serial === serial.current && op.scope === currentScope.current;
  const begin = (): ScopeOperation | null => {
    if (!actorId || busy.current) return null;
    busy.current = true;
    return { serial: ++serial.current, scope: currentScope.current, actorId };
  };
  const end = (op: ScopeOperation) => { if (live(op)) { busy.current = false; setValidatingId(null); setBulkValidatingGroup(null); setBulkValidateProgress(""); } };
  const titleOf = (item: CourseItem) => item.course?.title || "Курс";
  const candidates = (items: CourseItem[]) => items.flatMap(item => {
    const target = ownPlatformPublicationTarget(item);
    return target ? [{ item, target }] : [];
  });
  async function structural(item: CourseItem, target: PublicationTarget, op: ScopeOperation, simple: boolean): Promise<StructuralResult | null> {
    const title = titleOf(item);
    try {
      const before = await platformCoursePublication.readiness(target);
      if (!live(op)) return null;
      if (before.state === "out_of_scope") return { kind: "out_of_scope", target, title };
      const issues = await (simple ? validateCourseIssuesSimple : validateCourseIssues)(target.courseId, valRules as ValidationRulesConfig);
      if (!live(op)) return null;
      const after = await platformCoursePublication.readiness(target);
      if (!live(op)) return null;
      if (after.state === "out_of_scope") return { kind: "out_of_scope", target, title };
      if (after.editionSha256 !== before.editionSha256) throw new PublicationError("stale");
      return { kind: "checked", target, title, issues, readiness: after };
    } catch { return live(op) ? { kind: "unavailable", target, title } : null; }
  }
  function commitStructural(results: StructuralResult[], op: ScopeOperation) {
    if (!live(op)) return;
    const checked = results.filter((r): r is Extract<StructuralResult, { kind: "checked" }> => r.kind === "checked");
    const failures = checked.filter(r => r.issues.length > 0);
    const unavailable = results.filter(r => r.kind !== "checked");
    setValidatedCourses(previous => {
      const next = { ...previous };
      for (const r of results) {
        if (r.kind === "out_of_scope") delete next[r.target.courseId];
        else next[r.target.courseId] = r.kind === "checked" && !r.issues.length ? "ok" : "error";
      }
      return next;
    });
    setPublicationByCourse(previous => ({ ...previous, ...Object.fromEntries(checked.map(r => [r.target.courseId, r.readiness])) }));
    setReportKind("structure"); setPublishedCount(0); setValidationReportOk(checked.length - failures.length);
    setValidationReport(failures.map(r => ({ courseId: r.target.courseId, title: r.title, issues: r.issues })));
    setPublicationReport(results.map(r => ({ ...r.target, title: r.title, published: false,
      readiness: r.kind === "checked" ? r.readiness : null,
      message: r.kind === "checked" ? publicationReadinessLabel(r.readiness) : r.kind === "out_of_scope" ? "Курс больше не относится к собственным материалам платформы" : "Состояние не подтверждено; повторите проверку" })));
    toast.info(`Собственные курсы: структурная проверка пройдена для ${checked.length - failures.length}, замечания — ${failures.length}, состояние не подтверждено — ${unavailable.length}. Публикация оформляется отдельно.`);
  }
  const handleValidateCourse = async (courseId: string) => {
    const item = courses.find(c => c.course_id === courseId), target = item && ownPlatformPublicationTarget(item);
    if (!item || !target) return;
    const op = begin(); if (!op) return;
    setValidatingId(courseId);
    try { const result = await structural(item, target, op, false); if (result) commitStructural([result], op); }
    finally { end(op); }
  };
  const handleBulkValidate = async (group: { category: string; courses: CourseItem[] }) => {
    const own = candidates(group.courses); if (!own.length) return;
    const op = begin(); if (!op) return;
    setBulkValidatingGroup(group.category);
    const results: StructuralResult[] = [];
    try {
      // New PCR RPCs intentionally share an actor TRY fence. Do not issue
      // five concurrent requests that would contend with this same browser.
      for (let i = 0; i < own.length && live(op); i++) {
        setBulkValidateProgress(`${i + 1}/${own.length}...`);
        const { item, target } = own[i];
        const result = await structural(item, target, op, true);
        if (result) results.push(result);
      }
      commitStructural(results, op);
    } finally { end(op); }
  };
  const handleBulkPublishReviewed = async (group: { category: string; courses: CourseItem[] }) => {
    const own = candidates(group.courses); if (!own.length) return;
    const op = begin(); if (!op) return;
    setBulkValidatingGroup(group.category);
    const rows: PublicationReportRow[] = [];
    try {
      // Explicit publication only; never submit or accept a dossier in bulk.
      for (let i = 0; i < own.length && live(op); i++) {
        const { item, target } = own[i];
        setBulkValidateProgress(`${i + 1}/${own.length}...`);
        try {
          const current = await platformCoursePublication.context(target, op.actorId);
          if (!live(op)) return;
          if (!canPublishPublication(current) || !current.proposal) {
            rows.push({ ...target, title: titleOf(item), readiness: current.readiness, published: false,
              message: current.currentFileState === "unconfirmed" ? "Версия файлов не подтверждена; выпуск недоступен" : publicationReadinessLabel(current.readiness) });
            continue;
          }
          const issues = await checkMarketplacePublicationStructure(target, current.currentEditionSha256, valRules as ValidationRulesConfig, true);
          if (!live(op)) return;
          if (issues.length) {
            rows.push({ ...target, title: titleOf(item), readiness: current.readiness, published: false, message: `Структурные замечания: ${issues.join(" • ")}. Исправьте курс в редакторе.` });
            continue;
          }
          const requestId = intents.current.id("publish", { actorId: op.actorId, ...target, proposalId: current.proposal.id, edition: current.currentEditionSha256, reviewId: current.readiness.reviewId });
          const saved = await platformCoursePublication.publish(current, requestId);
          if (!live(op)) return;
          rows.push({ ...target, title: titleOf(item), readiness: saved.readiness, published: true, message: "Выпуск точной проверенной редакции подтверждён" });
        } catch {
          if (!live(op)) return;
          rows.push({ ...target, title: titleOf(item), readiness: null, published: false, message: "Выпуск не подтверждён; проверьте досье и повторите" });
        }
      }
      if (!live(op)) return;
      const count = rows.filter(r => r.published).length;
      setReportKind("publish"); setValidationReport([]); setValidationReportOk(0); setPublicationReport(rows); setPublishedCount(count);
      setPublicationByCourse(previous => ({ ...previous, ...Object.fromEntries(rows.flatMap(r => r.readiness ? [[r.courseId, r.readiness]] : [])) }));
      toast.info(`Подтверждён выпуск ${count} из ${own.length} собственных редакций. Остальные состояния указаны в отчёте.`);
      if (count > 0) fetchData();
    } finally { end(op); }
  };
  const onPublicationConfirmed = (readiness: PublicationReadiness) => {
    if (!mounted.current || currentScope.current !== scope || !actorId || readiness.state === "out_of_scope") return;
    setPublicationByCourse(previous => ({ ...previous, [readiness.courseId]: readiness }));
    fetchData();
  };
  return { canModerate: !!actorId, validatedCourses, validatingId, bulkValidatingGroup, bulkValidateProgress,
    validationReport, validationReportOk, setValidationReport, publicationByCourse, publicationReport, publishedCount, reportKind,
    handleValidateCourse, handleBulkValidate, handleBulkPublishReviewed, onPublicationConfirmed };
}
