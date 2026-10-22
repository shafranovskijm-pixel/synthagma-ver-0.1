import { useCallback, useState, useEffect } from "react";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";
import { useCopiesJournalScope } from "@/hooks/useCopiesJournalScope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ClipboardList, CheckCircle2, AlertCircle, ChevronDown, ChevronRight, Search, FileText, Users, BookOpen, Award, FileCheck, Shield, Copy, UserCheck, Briefcase, ClipboardCheck, Download, Plus, Edit, BarChart3, Trash2, Settings, Camera, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchEffectiveGroupProfiles } from "@/api/studentGroupMemberships";
import { toast } from "sonner";
import { JournalEditor } from "./JournalEditor";
import { AutoAttendanceJournal } from "./AutoAttendanceJournal";
import { AutoGradesJournal } from "./AutoGradesJournal";
import { AutoFinalAttestationJournal } from "./AutoFinalAttestationJournal";
import { AutoDocumentRegistrationJournal } from "./AutoDocumentRegistrationJournal";
import { ServerCopiesDuplicatesJournal } from "./ServerCopiesDuplicatesJournal";
import { EducationDocumentsJournal } from "./EducationDocumentsJournal";
import { CustomJournalsPanel } from './CustomJournalsPanel';
import { CustomJournalEditor } from './CustomJournalEditor';
import { useCustomJournals } from '@/hooks/useCustomJournals';
import { useScopedCustomJournals } from '@/hooks/useScopedCustomJournals';
import { ScopedCustomJournalsPanel } from './ScopedCustomJournalsPanel';
import { ScopedCustomJournalEditor } from './ScopedCustomJournalEditor';
import type { ScopedContextInput } from '@/lib/customJournals/scopedContract';
import { journalUuid } from '@/lib/customJournals/contract';
import { IdentificationJournal } from "./IdentificationJournal";
import { GroupContextBanner } from "./GroupContextBanner";
import { GroupJournalGate } from "./GroupJournalGate";
import { GroupEducationFactsPanel } from './groups/GroupEducationFactsPanel';
import {
  type GroupJournalContext,
  isGroupJournalContextActive,
  isGroupSupportedJournal,
  resolveCustomJournalGuard,
  resolveManualJournalEditorGuard,
} from "@/lib/journals/groupJournalContext";
import {
  clearEducationDocumentsJournalFocusParams,
  readEducationDocumentsJournalFocus,
} from "@/lib/organization/documentWorkspaceNavigation";


// ── Types & Constants ──

interface JournalItem { id: string; title: string; description: string; required: boolean; }
interface JournalCategory { id: string; title: string; icon: React.ElementType; color: string; bgColor: string; journals: JournalItem[]; }

const JOURNAL_CATEGORIES: JournalCategory[] = [
  {
    id: "required", title: "Обязательные журналы", icon: ClipboardCheck, color: "text-red-500", bgColor: "bg-red-500/10",
    journals: [
      { id: "attendance", title: "Журнал учёта посещаемости занятий", description: "Автоматически — завершённые уроки. Ручные записи ведутся отдельно", required: true },
      { id: "current_control", title: "Журнал текущего контроля успеваемости и промежуточной аттестации", description: "Оценки, зачёты, тесты, практические задания по модулям / дисциплинам", required: true },
      { id: "final_attestation", title: "Журнал итоговой аттестации", description: "Результаты экзаменов, зачётов, защиты проектов, состав комиссии", required: true },
      { id: "document_registration", title: "Журнал регистрации входящих и исходящих документов", description: "Фиксация заявлений, договоров, приказов о зачислении/отчислении", required: true },
      { id: "strict_forms", title: "Журнал учёта выдачи бланков строгой отчётности", description: "Приход-расход бланков удостоверений / дипломов", required: true },
      { id: "education_documents", title: "Журнал регистрации документов об образовании", description: "Учёт выданных удостоверений, дипломов, свидетельств", required: true },
    ],
  },
  {
    id: "often_required", title: "Часто требуемые журналы", icon: ClipboardList, color: "text-amber-500", bgColor: "bg-amber-500/10",
    journals: [
      { id: "copies_duplicates", title: "Журнал учёта выдачи копий / дубликатов документов", description: "Учёт выдачи копий и дубликатов документов об образовании", required: false },
      { id: "entry_control", title: "Журнал учёта результатов входного контроля", description: "Входное тестирование / собеседование / проверка базового образования", required: false },
      { id: "individual_plans", title: "Журнал (реестр) индивидуальных учебных планов", description: "Зачёт ранее полученных компетенций / НОК / сокращённое обучение", required: false },
      { id: "internship", title: "Журнал стажировки / практики", description: "Практика / стажировка на рабочем месте", required: false },
      { id: "safety_instructions", title: "Журнал учёта инструктажей по технике безопасности", description: "Для ПО рабочих профессий с практическими занятиями", required: false },
    ],
  },
];

// Journals that have automatic mode
const AUTO_JOURNALS: Record<string, string> = {
  attendance: "auto", current_control: "auto", final_attestation: "auto", document_registration: "auto",
};
// Journals with special editor
const SPECIAL_JOURNALS = new Set(["copies_duplicates", "education_documents"]);

// ── Component ──

interface JournalsManagerProps {
  organizationId: string;
  /** Контекст группы (из папки группы): фильтрация/предзаполнение и возврат. */
  groupId?: string | null;
  courseId?: string | null;
  returnToGroupId?: string | null;
}

export function JournalsManager({ organizationId, groupId, courseId, returnToGroupId }: JournalsManagerProps) {
  const { scope: copyScope, isCurrent: isCurrentCopyScope } = useCopiesJournalScope(organizationId, JSON.stringify([groupId ?? null, returnToGroupId ?? null]));
  const { params: searchParams, updateParams: setSearchParams } = useUrlNavigation();
  const educationDocumentFocus = readEducationDocumentsJournalFocus(searchParams);
  const focusedEducationEnrollmentId = educationDocumentFocus?.enrollmentId ?? null;
  const focusedEducationRecordId = educationDocumentFocus?.recordId ?? null;
  const hasEducationDocumentFocus = Boolean(focusedEducationEnrollmentId);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [deletingJournal, setDeletingJournal] = useState<{ type: string; title: string; isRequired: boolean } | null>(null);
  const [journalCounts, setJournalCounts] = useState<Record<string, number>>({});
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [groupMemberUserIds, setGroupMemberUserIds] = useState<string[] | null>(null);
  const [groupStatus, setGroupStatus] = useState<"loading" | "ready" | "error">("loading");
  const [groupError, setGroupError] = useState<string | null>(null);

  useEffect(() => { setDeletingJournal(null); }, [copyScope]);

  const journalType = searchParams.get("journalType");
  const journalView = searchParams.get("journalView");
  const knownManualJournal = JOURNAL_CATEGORIES.flatMap(category => category.journals).find(journal => journal.id === journalType)
;
  const activeJournal = journalView === "manual" && knownManualJournal && knownManualJournal.id !== "copies_duplicates"
    ? { type: knownManualJournal.id, title: knownManualJournal.title } : null;
  const activeAutoJournal = journalType === "copies_duplicates" && (journalView === "auto" || journalView === "manual") ? "copies_duplicates" : journalView === "auto" && journalType
    && (AUTO_JOURNALS[journalType] || SPECIAL_JOURNALS.has(journalType) || journalType === "identification")
    ? journalType : hasEducationDocumentFocus ? "education_documents" : null;

  const customModel = useCustomJournals(organizationId, !isGroupJournalContextActive({groupId,returnToGroupId}));
  const scopedGroupId = groupId ?? returnToGroupId ?? null;
  const scopedContext:ScopedContextInput = scopedGroupId!==null ? {kind:'group',group_id:scopedGroupId} : {kind:'organization'};
  const scopedModel = useScopedCustomJournals(organizationId,scopedContext);
  const navigateJournal = useCallback((type: string | null, view?: "auto" | "manual" | "group-facts" | "custom" | "scoped-custom") => {
    setSearchParams(current => {
      const next = clearEducationDocumentsJournalFocusParams(current);
      if (type && view) {
        next.set("journalType", type);
        next.set("journalView", view);
      } else {
        next.delete("journalType");
        next.delete("journalView");
      }
      return next;
    });
  }, [setSearchParams]);
  const openAutoJournal = (journalId: string) => navigateJournal(journalId, "auto");

  // Фактические участники группы (не по совпадению курса): нужны для фильтрации авто-журналов.
  // Важно: loading и «нет контекста» — разные состояния, иначе журнал успеет показать всю организацию.
  useEffect(() => {
    if (!groupId) { setGroupMemberUserIds(null); setGroupStatus("ready"); setGroupError(null); return; }
    let cancelled = false;
    setGroupMemberUserIds(null);
    setGroupStatus("loading");
    setGroupError(null);
    (async () => {
      try {
        const data = await fetchEffectiveGroupProfiles<{ user_id: string }>(supabase, organizationId, groupId, { select: "user_id" });
        if (cancelled) return;
        setGroupMemberUserIds(data.map(r => r.user_id));
        setGroupStatus("ready");
      } catch (error) {
        if (!cancelled) { setGroupStatus("error"); setGroupError(error instanceof Error ? error.message : "Ошибка загрузки состава группы"); }
      }
    })();
    return () => { cancelled = true; };
  }, [groupId, organizationId]);

  const groupContext: GroupJournalContext | null = groupId
    ? { groupId, courseId: courseId || null, memberUserIds: groupMemberUserIds, status: groupStatus, errorMessage: groupError }
    : null;



  const inGroupContext = isGroupJournalContextActive({ groupId, returnToGroupId });
  const customGuard = resolveCustomJournalGuard({ groupId, returnToGroupId });
  const manualEditorGuard = resolveManualJournalEditorGuard({ groupId, returnToGroupId });


  const openCreateWizard = () => {
    if (!scopedModel.canWrite || scopedModel.loading || scopedModel.pending || scopedModel.saving) return;
    setShowCreateWizard(true);
  };

  const openManualJournal = (type: string, title: string) => {
    if (manualEditorGuard.blocked) { toast.error(manualEditorGuard.reason!); return; }
    navigateJournal(type, "manual");
  };

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("journal_instances").select("journal_type").eq("organization_id", organizationId);
        if (data) { const counts: Record<string, number> = {}; data.forEach((j) => { counts[j.journal_type] = (counts[j.journal_type] || 0) + 1; }); setJournalCounts(counts); }
      } catch (error) { console.error("Error fetching journal counts:", error); }
    })();
  }, [organizationId]);

  const requestDeleteJournal = (journal: JournalItem) => {
    if (journal.id === "copies_duplicates") {
      if (isCurrentCopyScope()) toast.info("Общий реестр не очищается из списка журналов. Отдельные записи можно сохранить в архиве реестра.");
      return;
    }
    setDeletingJournal({ type: journal.id, title: journal.title, isRequired: journal.required });
  };

  const handleDeleteJournals = async () => {
    if (!deletingJournal) return;
    try {
      if (deletingJournal.type === "copies_duplicates") {
        setDeletingJournal(null);
        toast.info("Записи общего реестра и прежний локальный исходник сохранены. Используйте архив внутри реестра.");
        return;
      }
      const { error } = await supabase.from("journal_instances").delete().eq("organization_id", organizationId).eq("journal_type", deletingJournal.type);
      if (error) throw error;
      setJournalCounts((prev) => ({ ...prev, [deletingJournal.type]: 0 }));
      toast.success("Все журналы удалены"); setDeletingJournal(null);
    } catch (error) { console.error("Error deleting journals:", error); toast.error("Ошибка при удалении"); }
  };

  // В контексте группы показываем только журналы, которые надёжно ограничиваются
  // составом группы (group_id + course_id + участники). Остальные скрыты.
  const filteredCategories = JOURNAL_CATEGORIES.map((cat) => ({
    ...cat,
    journals: cat.journals
      .filter((j) => !inGroupContext || j.id === "copies_duplicates" || isGroupSupportedJournal(j.id))
      .filter((j) => j.title.toLowerCase().includes(searchQuery.toLowerCase()) || j.description.toLowerCase().includes(searchQuery.toLowerCase())),
  })).filter((cat) => cat.journals.length > 0);


  // Render active auto journal — контекст группы должен быть виден на каждом экране
  const activeView = (() => {
    if (journalView === 'group-facts' && groupId) return <div className="space-y-3"><Button variant="outline" onClick={()=>navigateJournal(null)}>Назад к журналам</Button><GroupEducationFactsPanel organizationId={organizationId} groupId={groupId} mode="readonly" /><p className="text-xs text-muted-foreground">Это источник состава и календаря. Прежние журналы и отметки сохраняют прежнюю структуру; связь отметок с занятиями здесь не устанавливается.</p></div>;
    const gate = (journalType: string, node: React.ReactNode, onClose?: () => void) => (
      <GroupJournalGate journalType={journalType} groupContext={groupContext} onClose={onClose}>
        {node}
      </GroupJournalGate>
    );
    const closeAuto = () => navigateJournal(null);
    if (activeAutoJournal === "attendance") return gate("attendance", <AutoAttendanceJournal organizationId={organizationId} initialCourseId={courseId || undefined} groupContext={groupContext} onClose={closeAuto} />, closeAuto);
    if (activeAutoJournal === "current_control") return gate("current_control", <AutoGradesJournal organizationId={organizationId} initialCourseId={courseId || undefined} groupContext={groupContext} onClose={closeAuto} />, closeAuto);
    if (activeAutoJournal === "final_attestation") return gate("final_attestation", <AutoFinalAttestationJournal organizationId={organizationId} groupContext={groupContext} onClose={closeAuto} />, closeAuto);
    if (activeAutoJournal === "document_registration") return gate("document_registration", <AutoDocumentRegistrationJournal organizationId={organizationId} groupContext={groupContext} onClose={closeAuto} />, closeAuto);
    if (activeAutoJournal === "copies_duplicates") return <ServerCopiesDuplicatesJournal organizationId={organizationId} registryScope={scopedGroupId !== null ? { kind: 'group', group_id: scopedGroupId } : { kind: 'organization' }} onClose={closeAuto} />;
    if (activeAutoJournal === "education_documents") return gate("education_documents", (
      <EducationDocumentsJournal
        organizationId={organizationId}
        groupContext={groupContext}
        onClose={closeAuto}
        focusRecordId={focusedEducationRecordId}
        focusEnrollmentId={focusedEducationEnrollmentId}
      />
    ), closeAuto);
    if (activeAutoJournal === "identification") return gate("identification", <IdentificationJournal organizationId={organizationId} groupContext={groupContext} onClose={closeAuto} />, closeAuto);
    if (activeJournal && !manualEditorGuard.blocked) {
      const close = () => navigateJournal(null);
      return gate(activeJournal.type, <JournalEditor organizationId={organizationId} journalType={activeJournal.type} journalTitle={activeJournal.title} onClose={close} />, close);
    }
    return null;
  })();

  if (journalView==='scoped-custom'&&journalUuid.safeParse(journalType).success) {
    return <div className="space-y-6">{scopedGroupId&&<GroupContextBanner groupId={scopedGroupId} returnToGroupId={returnToGroupId}/>}<ScopedCustomJournalEditor key={scopedModel.contextKey+'|'+journalType} model={scopedModel} organizationId={organizationId} journalId={journalType!} onClose={()=>navigateJournal(null)}/></div>;
  }
  if (journalView==='custom'&&journalUuid.safeParse(journalType).success) {
    return customGuard.blocked ? <div className="space-y-3"><Button variant="outline" className="rounded-xl" onClick={()=>navigateJournal(null)}>Назад к журналам</Button><p className="text-sm text-muted-foreground">{customGuard.reason}</p></div>
      : <CustomJournalEditor key={organizationId+'|'+journalType} model={customModel} journalId={journalType!} onClose={()=>navigateJournal(null)} />;
  }
  if (activeView) {
    return (
      <div className="space-y-6">
        {groupId && <GroupContextBanner groupId={groupId} returnToGroupId={returnToGroupId} />}
        {activeView}
      </div>
    );
  }


  return (
    <div className="space-y-6">
      {groupId && (
        <GroupContextBanner groupId={groupId} returnToGroupId={returnToGroupId} />
      )}
      {/* Header */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0"><ClipboardList className="w-6 h-6 text-primary" /></div>
              <div><h2 className="text-xl font-bold">Полная система учёта для организаций ДПО</h2><p className="text-sm text-muted-foreground mt-1">Электронные журналы с автоматическим заполнением, экспортом и шаблонами</p></div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {groupId && <Button variant="outline" onClick={()=>navigateJournal('group-facts','group-facts')} className="rounded-xl">Состав и календарь группы</Button>}
              <Button variant="outline" onClick={() => openAutoJournal("identification")} className="rounded-xl"><Camera className="w-4 h-4 mr-2" />Видеоидентификация</Button>
              <Button onClick={openCreateWizard} disabled={!scopedModel.canWrite||scopedModel.loading||scopedModel.pending||scopedModel.saving} className="rounded-xl"><Plus className="w-4 h-4 mr-2" />{inGroupContext?'Создать журнал группы':'Создать журнал'}</Button>
            </div>

          </div>
        </div>
        <div className="p-6 pt-4">
          {inGroupContext && (
            <div className="mb-3 flex items-start gap-3 p-3 rounded-xl border border-amber-500/40 bg-amber-500/10" data-testid="group-journals-scope-notice">
              <Lock className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                Открыты журналы этой группы. Заметки можно вести и без закреплённой программы.
                Для связи с подтверждёнными занятиями и результатами закрепите программу группы. Прежние журналы организации доступны в общем разделе журналов.
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { icon: ClipboardCheck, title: "Обязательные журналы", desc: "Посещаемость, успеваемость, итоговая аттестация, регистрация документов" },
              { icon: BarChart3, title: "Автоматическое заполнение", desc: "Данные из курсов подтягиваются автоматически" },
              { icon: BookOpen, title: "Электронные журналы онлайн", desc: "Ведите учёт прямо в браузере с еженедельной сеткой" },
              { icon: Download, title: "Экспорт и шаблоны", desc: "Скачайте готовые шаблоны или выгрузите журналы в Excel" },
              ...(inGroupContext ? [] : [{ icon: Settings, title: "Пользовательские журналы", desc: "Создавайте свои журналы с произвольными полями" }]),
              { icon: Camera, title: "Видеоидентификация", desc: "Верификация личности студентов с фотографиями" },

            ].map((feature, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-secondary/40">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"><feature.icon className="w-4 h-4 text-primary" /></div>
                <div><p className="text-sm font-medium">{feature.title}</p><p className="text-xs text-muted-foreground mt-0.5">{feature.desc}</p></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Поиск журналов..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 rounded-xl" /></div>

      {/* Categories */}
      <div className="space-y-4">
        {filteredCategories.map((category) => {
          const CategoryIcon = category.icon;
          const isExpanded = expandedCategories.includes(category.id);
          return (
            <Collapsible key={category.id} open={isExpanded} onOpenChange={() => setExpandedCategories((prev) => prev.includes(category.id) ? prev.filter((id) => id !== category.id) : [...prev, category.id])}>
              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg ${category.bgColor} flex items-center justify-center`}><CategoryIcon className={`w-5 h-5 ${category.color}`} /></div>
                      <div className="text-left"><h3 className="font-semibold">{category.title}</h3><p className="text-sm text-muted-foreground">{category.journals.length} журналов{category.journals.filter(j => j.required).length > 0 && <span className="ml-2">(обязательных: {category.journals.filter(j => j.required).length})</span>}</p></div>
                    </div>
                    {isExpanded ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t border-border">
                    {category.journals.map((journal) => (
                      <JournalRow key={journal.id} journal={journal} onAutoClick={() => openAutoJournal(journal.id)} onManualClick={() => openManualJournal(journal.id, journal.title)} onDeleteClick={() => requestDeleteJournal(journal)} hasAutoMode={!!AUTO_JOURNALS[journal.id]} isSpecial={SPECIAL_JOURNALS.has(journal.id)} inGroupContext={inGroupContext} />
                    ))}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>

      {/* Server custom journals preserve the existing list/card shell. */}
      <ScopedCustomJournalsPanel model={scopedModel} createOpen={showCreateWizard} onCreateOpenChange={setShowCreateWizard} onOpen={id=>navigateJournal(id,'scoped-custom')}/>
      {!inGroupContext&&<details className="space-y-4" open><summary className="font-semibold cursor-pointer">Прежние журналы и перенос определений</summary><p className="text-xs text-muted-foreground">Эти журналы сохраняют прежнюю область организации. Записи не привязываются к группе автоматически.</p><CustomJournalsPanel organizationId={organizationId} model={customModel} createOpen={false} onCreateOpenChange={()=>{}} onOpen={id=>navigateJournal(id,'custom')} /></details>}

      {/* Delete Dialog */}
      <AlertDialog open={!!deletingJournal && deletingJournal.type !== "copies_duplicates"} onOpenChange={() => setDeletingJournal(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить журнал?</AlertDialogTitle><AlertDialogDescription>Вы уверены, что хотите удалить все данные журнала <strong>"{deletingJournal?.title}"</strong>?{journalCounts[deletingJournal?.type || ""] > 0 && <> Будет удалено журналов: {journalCounts[deletingJournal?.type || ""]}. </>}Это действие нельзя отменить.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={handleDeleteJournals} className="bg-destructive hover:bg-destructive/90">Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

// ── Journal Row ──

function JournalRow({ journal, onAutoClick, onManualClick, onDeleteClick, hasAutoMode, isSpecial, inGroupContext = false }: {
  journal: JournalItem; onAutoClick: () => void; onManualClick: () => void; onDeleteClick: () => void; hasAutoMode: boolean; isSpecial: boolean; inGroupContext?: boolean;
}) {
  return (
    <div className="flex items-start justify-between p-4 border-b border-border last:border-b-0 hover:bg-secondary/30 transition-colors">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${journal.required ? "bg-red-500/10" : "bg-amber-500/10"}`}>
          {journal.required ? <AlertCircle className="w-4 h-4 text-red-500" /> : <FileText className="w-4 h-4 text-amber-500" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap"><span className="font-medium">{journal.title}</span>{journal.required && <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 flex-shrink-0">Обязательный</span>}</div>
          <p className="text-sm text-muted-foreground mt-1">{journal.description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
        {hasAutoMode ? (
          <>
            <Button variant="default" size="sm" className="rounded-lg" onClick={onAutoClick}><BarChart3 className="w-4 h-4 mr-2" />{inGroupContext ? "Открыть по группе" : "Автоматический"}</Button>
            {!inGroupContext && (
              <Button variant="outline" size="sm" className="rounded-lg" onClick={onManualClick}><Edit className="w-4 h-4 mr-2" />Ручной</Button>
            )}
          </>
        ) : isSpecial ? (
          <Button variant="default" size="sm" className="rounded-lg" onClick={onAutoClick}><Edit className="w-4 h-4 mr-2" />Вести журнал</Button>
        ) : inGroupContext ? (
          <Button variant="outline" size="sm" className="rounded-lg" disabled title="Журнал ведётся по организации и не ограничивается составом группы">
            <Lock className="w-4 h-4 mr-2" />Недоступно в группе
          </Button>
        ) : (
          <Button variant="default" size="sm" className="rounded-lg" onClick={onManualClick}><Edit className="w-4 h-4 mr-2" />Вести онлайн</Button>
        )}
        <Button variant="outline" size="sm" className="rounded-lg"><Download className="w-4 h-4 mr-2" />Шаблон</Button>
        {!journal.required && !inGroupContext && journal.id !== "copies_duplicates" && <Button variant="ghost" size="icon" className="rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10" onClick={onDeleteClick} title="Удалить журнал"><Trash2 className="w-4 h-4" /></Button>}
      </div>
    </div>
  );
}
