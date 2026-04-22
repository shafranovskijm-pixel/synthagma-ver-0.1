import { ChevronDown } from "lucide-react";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type SectionId = "learning" | "clients" | "tools" | "settings";

const SECTION_ITEMS: Record<SectionId, { tab: string; label: string }[]> = {
  learning: [
    { tab: "courses", label: "Курсы" },
    { tab: "homework-review", label: "Домашние работы" },
    { tab: "ai-tutors", label: "ИИ-уроки" },
    { tab: "labor-safety", label: "Охрана труда" },
  ],
  clients: [
    { tab: "students", label: "Ученики" },
    { tab: "organizations", label: "Клиенты-компании" },
    { tab: "sales", label: "Продажи" },
    { tab: "chats", label: "Чаты" },
  ],
  tools: [
    { tab: "stats", label: "Статистика" },
    { tab: "links", label: "Ссылки регистрации" },
    { tab: "library", label: "Хранилище" },
    { tab: "journals", label: "Журналы" },
    { tab: "documents", label: "Документы учеников" },
    { tab: "frdo", label: "ФИС ФРДО" },
  ],
  settings: [
    { tab: "profile", label: "Профиль" },
    { tab: "subscription", label: "Тариф и оплата" },
    { tab: "org-documents", label: "Документы школы" },
    { tab: "whats-new", label: "Что нового" },
  ],
};

interface SectionBreadcrumbDropdownProps {
  section: SectionId | null;
  label: string;
  activeTab: string;
}

export function SectionBreadcrumbDropdown({ section, label, activeTab }: SectionBreadcrumbDropdownProps) {
  const d = useOrgDashboard();

  if (!section) {
    return <span className="text-muted-foreground/80">{label}</span>;
  }

  const items = SECTION_ITEMS[section] || [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center gap-0.5 text-muted-foreground/80 hover:text-primary transition-colors">
          <span>{label}</span>
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 rounded-xl">
        {items.map((it) => (
          <DropdownMenuItem
            key={it.tab}
            onClick={() => d.tabNavigation.setActiveTab(it.tab as any)}
            className={
              "rounded-lg gap-2 py-2 focus:bg-primary/10 focus:text-primary " +
              (activeTab === it.tab ? "bg-primary/10 text-primary font-medium" : "")
            }
          >
            {it.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
