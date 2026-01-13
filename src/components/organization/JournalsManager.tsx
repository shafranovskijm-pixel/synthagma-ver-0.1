import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ClipboardList,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Search,
  FileText,
  Users,
  BookOpen,
  Award,
  FileCheck,
  Shield,
  Copy,
  UserCheck,
  Briefcase,
  ClipboardCheck,
  Download,
  Plus,
  Edit,
} from "lucide-react";
import { JournalEditor } from "./JournalEditor";

interface JournalItem {
  id: string;
  title: string;
  description: string;
  required: boolean;
}

interface JournalCategory {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  journals: JournalItem[];
}

const JOURNAL_CATEGORIES: JournalCategory[] = [
  {
    id: "required",
    title: "Обязательные журналы",
    icon: ClipboardCheck,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    journals: [
      {
        id: "attendance",
        title: "Журнал учёта посещаемости занятий",
        description: "Фиксирует явку слушателей на каждое занятие (лекция, практика, вебинар) по каждой группе / программе / модулю",
        required: true,
      },
      {
        id: "current_control",
        title: "Журнал текущего контроля успеваемости и промежуточной аттестации",
        description: "Оценки, зачёты, тесты, практические задания, даты и формы контроля по модулям / дисциплинам",
        required: true,
      },
      {
        id: "final_attestation",
        title: "Журнал итоговой аттестации",
        description: "Результаты экзаменов / зачётов / защиты проектов / квалификационных работ, состав комиссии, решения",
        required: true,
      },
      {
        id: "document_registration",
        title: "Журнал регистрации входящих и исходящих документов",
        description: "Для фиксации заявлений, договоров, приказов о зачислении/отчислении (общий канцелярский)",
        required: true,
      },
      {
        id: "strict_forms",
        title: "Журнал учёта выдачи бланков строгой отчётности",
        description: "Приход-расход бланков удостоверений / дипломов до момента их заполнения и регистрации",
        required: true,
      },
    ],
  },
  {
    id: "often_required",
    title: "Часто требуемые журналы",
    icon: ClipboardList,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    journals: [
      {
        id: "copies_duplicates",
        title: "Журнал учёта выдачи копий / дубликатов документов",
        description: "Учёт выдачи копий и дубликатов документов об образовании / квалификации",
        required: false,
      },
      {
        id: "entry_control",
        title: "Журнал учёта результатов входного контроля",
        description: "Если проводится входное тестирование / собеседование / проверка базового образования",
        required: false,
      },
      {
        id: "individual_plans",
        title: "Журнал (реестр) индивидуальных учебных планов",
        description: "При зачёте ранее полученных компетенций / НОК / сокращённом обучении",
        required: false,
      },
      {
        id: "internship",
        title: "Журнал стажировки / практики",
        description: "Если программа включает практику / стажировку на рабочем месте",
        required: false,
      },
      {
        id: "safety_instructions",
        title: "Журнал учёта инструктажей по технике безопасности",
        description: "Особенно для ПО рабочих профессий с практическими занятиями, охрана труда",
        required: false,
      },
    ],
  },
];

interface JournalsManagerProps {
  organizationId: string;
}

export function JournalsManager({ organizationId }: JournalsManagerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<string[]>(
    JOURNAL_CATEGORIES.map((c) => c.id)
  );
  const [activeJournal, setActiveJournal] = useState<{
    type: string;
    title: string;
  } | null>(null);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  // Filter categories based on search
  const filteredCategories = JOURNAL_CATEGORIES.map((cat) => ({
    ...cat,
    journals: cat.journals.filter(
      (journal) =>
        journal.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        journal.description.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter((cat) => cat.journals.length > 0);

  // Show journal editor if active
  if (activeJournal) {
    return (
      <JournalEditor
        organizationId={organizationId}
        journalType={activeJournal.type}
        journalTitle={activeJournal.title}
        onClose={() => setActiveJournal(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <ClipboardList className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Журналы учёта</h2>
            <p className="text-sm text-muted-foreground">
              Обязательные и рекомендуемые журналы для организаций ДПО
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Поиск журналов..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 rounded-xl"
        />
      </div>

      {/* Journal Categories */}
      <div className="space-y-4">
        {filteredCategories.map((category) => {
          const CategoryIcon = category.icon;
          const isExpanded = expandedCategories.includes(category.id);
          const requiredCount = category.journals.filter((j) => j.required).length;

          return (
            <Collapsible
              key={category.id}
              open={isExpanded}
              onOpenChange={() => toggleCategory(category.id)}
            >
              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg ${category.bgColor} flex items-center justify-center`}>
                        <CategoryIcon className={`w-5 h-5 ${category.color}`} />
                      </div>
                      <div className="text-left">
                        <h3 className="font-semibold">{category.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {category.journals.length} журналов
                          {requiredCount > 0 && (
                            <span className="ml-2">(обязательных: {requiredCount})</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t border-border">
                    {category.journals.map((journal) => (
                      <div
                        key={journal.id}
                        className="flex items-start justify-between p-4 border-b border-border last:border-b-0 hover:bg-secondary/30 transition-colors"
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                              journal.required
                                ? "bg-red-500/10"
                                : "bg-amber-500/10"
                            }`}
                          >
                            {journal.required ? (
                              <AlertCircle className="w-4 h-4 text-red-500" />
                            ) : (
                              <FileText className="w-4 h-4 text-amber-500" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{journal.title}</span>
                              {journal.required && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 flex-shrink-0">
                                  Обязательный
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {journal.description}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                          <Button
                            variant="default"
                            size="sm"
                            className="rounded-lg"
                            onClick={() =>
                              setActiveJournal({
                                type: journal.id,
                                title: journal.title,
                              })
                            }
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Вести онлайн
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-lg"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Шаблон
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
