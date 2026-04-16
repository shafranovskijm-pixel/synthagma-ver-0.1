import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ClipboardList, CheckCircle2, AlertCircle, ChevronDown, ChevronRight, Search, FileText, Users, BookOpen, Award, FileCheck, Shield, Copy, UserCheck, Briefcase, ClipboardCheck, Download, Plus, Edit, BarChart3, Trash2, Settings, Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { JournalEditor } from "./JournalEditor";
import { AutoAttendanceJournal } from "./AutoAttendanceJournal";
import { AutoGradesJournal } from "./AutoGradesJournal";
import { AutoFinalAttestationJournal } from "./AutoFinalAttestationJournal";
import { AutoDocumentRegistrationJournal } from "./AutoDocumentRegistrationJournal";
import { CopiesDuplicatesJournal } from "./CopiesDuplicatesJournal";
import { EducationDocumentsJournal } from "./EducationDocumentsJournal";
import { JournalCreationWizard } from "./JournalCreationWizard";
import { IdentificationJournal } from "./IdentificationJournal";

// ── Types & Constants ──

interface JournalItem { id: string; title: string; description: string; required: boolean; }
interface CustomJournal { id: string; title: string; description: string; fields: string[]; createdAt: string; }
interface JournalCategory { id: string; title: string; icon: React.ElementType; color: string; bgColor: string; journals: JournalItem[]; }

const JOURNAL_CATEGORIES: JournalCategory[] = [
  {
    id: "required", title: "Обязательные журналы", icon: ClipboardCheck, color: "text-red-500", bgColor: "bg-red-500/10",
    journals: [
      { id: "attendance", title: "Журнал учёта посещаемости занятий", description: "Фиксирует явку слушателей на каждое занятие", required: true },
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

interface JournalsManagerProps { organizationId: string; }

export function JournalsManager({ organizationId }: JournalsManagerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [activeJournal, setActiveJournal] = useState<{ type: string; title: string } | null>(null);
  const [activeAutoJournal, setActiveAutoJournal] = useState<string | null>(null);
  const [deletingJournal, setDeletingJournal] = useState<{ type: string; title: string; isRequired: boolean } | null>(null);
  const [journalCounts, setJournalCounts] = useState<Record<string, number>>({});
  const [customJournals, setCustomJournals] = useState<CustomJournal[]>([]);
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [editingCustomJournal, setEditingCustomJournal] = useState<CustomJournal | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(`custom_journals_${organizationId}`);
    if (saved) setCustomJournals(JSON.parse(saved));
  }, [organizationId]);

  const saveCustomJournals = (journals: CustomJournal[]) => { localStorage.setItem(`custom_journals_${organizationId}`, JSON.stringify(journals)); setCustomJournals(journals); };

  const handleSaveJournal = (data: { id?: string; title: string; description: string; fields: string[] }) => {
    if (data.id) { saveCustomJournals(customJournals.map((j) => j.id === data.id ? { ...j, ...data } : j)); setEditingCustomJournal(null); toast.success("Журнал обновлён"); }
    else { saveCustomJournals([...customJournals, { id: `custom_${Date.now()}`, title: data.title, description: data.description, fields: data.fields, createdAt: new Date().toISOString() }]); setShowCreateWizard(false); toast.success("Журнал создан"); }
  };

  const handleDeleteCustomJournal = (journalId: string) => { saveCustomJournals(customJournals.filter((j) => j.id !== journalId)); localStorage.removeItem(`journal_${journalId}_${organizationId}`); toast.success("Журнал удалён"); };

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("journal_instances").select("journal_type").eq("organization_id", organizationId);
        if (data) { const counts: Record<string, number> = {}; data.forEach((j) => { counts[j.journal_type] = (counts[j.journal_type] || 0) + 1; }); setJournalCounts(counts); }
      } catch (error) { console.error("Error fetching journal counts:", error); }
    })();
  }, [organizationId]);

  const handleDeleteJournals = async () => {
    if (!deletingJournal) return;
    try {
      if (deletingJournal.type === "copies_duplicates") { localStorage.removeItem(`copies_duplicates_${organizationId}`); toast.success("Журнал очищен"); setDeletingJournal(null); return; }
      const { error } = await supabase.from("journal_instances").delete().eq("organization_id", organizationId).eq("journal_type", deletingJournal.type);
      if (error) throw error;
      setJournalCounts((prev) => ({ ...prev, [deletingJournal.type]: 0 }));
      toast.success("Все журналы удалены"); setDeletingJournal(null);
    } catch (error) { console.error("Error deleting journals:", error); toast.error("Ошибка при удалении"); }
  };

  const filteredCategories = JOURNAL_CATEGORIES.map((cat) => ({
    ...cat, journals: cat.journals.filter((j) => j.title.toLowerCase().includes(searchQuery.toLowerCase()) || j.description.toLowerCase().includes(searchQuery.toLowerCase())),
  })).filter((cat) => cat.journals.length > 0);

  // Render active auto journal
  if (activeAutoJournal === "attendance") return <AutoAttendanceJournal organizationId={organizationId} onClose={() => setActiveAutoJournal(null)} />;
  if (activeAutoJournal === "current_control") return <AutoGradesJournal organizationId={organizationId} onClose={() => setActiveAutoJournal(null)} />;
  if (activeAutoJournal === "final_attestation") return <AutoFinalAttestationJournal organizationId={organizationId} onClose={() => setActiveAutoJournal(null)} />;
  if (activeAutoJournal === "document_registration") return <AutoDocumentRegistrationJournal organizationId={organizationId} onClose={() => setActiveAutoJournal(null)} />;
  if (activeAutoJournal === "copies_duplicates") return <CopiesDuplicatesJournal organizationId={organizationId} onClose={() => setActiveAutoJournal(null)} />;
  if (activeAutoJournal === "education_documents") return <EducationDocumentsJournal organizationId={organizationId} onClose={() => setActiveAutoJournal(null)} />;
  if (activeAutoJournal === "identification") return <IdentificationJournal organizationId={organizationId} onClose={() => setActiveAutoJournal(null)} />;
  if (activeJournal) return <JournalEditor organizationId={organizationId} journalType={activeJournal.type} journalTitle={activeJournal.title} onClose={() => setActiveJournal(null)} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0"><ClipboardList className="w-6 h-6 text-primary" /></div>
              <div><h2 className="text-xl font-bold">Полная система учёта для организаций ДПО</h2><p className="text-sm text-muted-foreground mt-1">Электронные журналы с автоматическим заполнением, экспортом и шаблонами</p></div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="outline" onClick={() => setActiveAutoJournal("identification")} className="rounded-xl"><Camera className="w-4 h-4 mr-2" />Видеоидентификация</Button>
              <Button onClick={() => setShowCreateWizard(true)} className="rounded-xl"><Plus className="w-4 h-4 mr-2" />Создать журнал</Button>
            </div>
          </div>
        </div>
        <div className="p-6 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { icon: ClipboardCheck, title: "Обязательные журналы", desc: "Посещаемость, успеваемость, итоговая аттестация, регистрация документов" },
              { icon: BarChart3, title: "Автоматическое заполнение", desc: "Данные из курсов подтягиваются автоматически" },
              { icon: BookOpen, title: "Электронные журналы онлайн", desc: "Ведите учёт прямо в браузере с еженедельной сеткой" },
              { icon: Download, title: "Экспорт и шаблоны", desc: "Скачайте готовые шаблоны или выгрузите журналы в Excel" },
              { icon: Settings, title: "Пользовательские журналы", desc: "Создавайте свои журналы с произвольными полями" },
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
                      <JournalRow key={journal.id} journal={journal} onAutoClick={() => setActiveAutoJournal(journal.id)} onManualClick={() => setActiveJournal({ type: journal.id, title: journal.title })} onDeleteClick={() => setDeletingJournal({ type: journal.id, title: journal.title, isRequired: journal.required })} hasAutoMode={!!AUTO_JOURNALS[journal.id]} isSpecial={SPECIAL_JOURNALS.has(journal.id)} />
                    ))}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>

      {/* Custom Journals */}
      {customJournals.length > 0 && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-border"><div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><FileText className="w-5 h-5 text-primary" /></div><div><h3 className="font-semibold">Пользовательские журналы</h3><p className="text-sm text-muted-foreground">{customJournals.length} журналов</p></div></div>
          <div>{customJournals.map((journal) => (
            <div key={journal.id} className="flex items-start justify-between p-4 border-b border-border last:border-b-0 hover:bg-secondary/30 transition-colors">
              <div className="flex items-start gap-3 flex-1 min-w-0"><div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5"><FileText className="w-4 h-4 text-primary" /></div><div className="min-w-0 flex-1"><span className="font-medium">{journal.title}</span><p className="text-sm text-muted-foreground mt-1">{journal.description}</p></div></div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                <Button variant="default" size="sm" className="rounded-lg" onClick={() => setActiveJournal({ type: journal.id, title: journal.title })}><Edit className="w-4 h-4 mr-2" />Вести онлайн</Button>
                <Button variant="outline" size="icon" className="rounded-lg" onClick={() => setEditingCustomJournal(journal)} title="Настроить журнал"><Settings className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" className="rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDeleteCustomJournal(journal.id)} title="Удалить журнал"><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}</div>
        </div>
      )}

      {/* Delete Dialog */}
      <AlertDialog open={!!deletingJournal} onOpenChange={() => setDeletingJournal(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить журнал?</AlertDialogTitle><AlertDialogDescription>Вы уверены, что хотите удалить все данные журнала <strong>"{deletingJournal?.title}"</strong>?{journalCounts[deletingJournal?.type || ""] > 0 && <> Будет удалено журналов: {journalCounts[deletingJournal?.type || ""]}. </>}Это действие нельзя отменить.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={handleDeleteJournals} className="bg-destructive hover:bg-destructive/90">Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      <JournalCreationWizard open={showCreateWizard || !!editingCustomJournal} onClose={() => { setShowCreateWizard(false); setEditingCustomJournal(null); }} onComplete={handleSaveJournal} editingJournal={editingCustomJournal} />
    </div>
  );
}

// ── Journal Row ──

function JournalRow({ journal, onAutoClick, onManualClick, onDeleteClick, hasAutoMode, isSpecial }: {
  journal: JournalItem; onAutoClick: () => void; onManualClick: () => void; onDeleteClick: () => void; hasAutoMode: boolean; isSpecial: boolean;
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
            <Button variant="default" size="sm" className="rounded-lg" onClick={onAutoClick}><BarChart3 className="w-4 h-4 mr-2" />Автоматический</Button>
            <Button variant="outline" size="sm" className="rounded-lg" onClick={onManualClick}><Edit className="w-4 h-4 mr-2" />Ручной</Button>
          </>
        ) : isSpecial ? (
          <Button variant="default" size="sm" className="rounded-lg" onClick={onAutoClick}><Edit className="w-4 h-4 mr-2" />Вести журнал</Button>
        ) : (
          <Button variant="default" size="sm" className="rounded-lg" onClick={onManualClick}><Edit className="w-4 h-4 mr-2" />Вести онлайн</Button>
        )}
        <Button variant="outline" size="sm" className="rounded-lg"><Download className="w-4 h-4 mr-2" />Шаблон</Button>
        {!journal.required && <Button variant="ghost" size="icon" className="rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10" onClick={onDeleteClick} title="Удалить журнал"><Trash2 className="w-4 h-4" /></Button>}
      </div>
    </div>
  );
}
