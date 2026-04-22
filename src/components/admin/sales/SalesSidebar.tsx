import { FileText, Package, Users, Building2, BarChart3, ScrollText, GitCompareArrows, CreditCard, PenTool, Database, Sparkles, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

const menuGroups: MenuGroup[] = [
  {
    label: 'Сделки',
    items: [
      { id: 'deals', label: 'Сделки 360°', icon: Sparkles },
      { id: 'leads', label: 'Лиды', icon: Building2 },
      { id: 'companies-db', label: 'База компаний', icon: Database },
      { id: 'company-card', label: 'Карточка', icon: CreditCard },
    ],
  },
  {
    label: 'Документы',
    items: [
      { id: 'proposals', label: 'КП', icon: FileText },
      { id: 'contracts', label: 'Договоры', icon: ScrollText },
      { id: 'signing', label: 'Подписание', icon: PenTool },
      { id: 'services', label: 'Услуги', icon: Package },
    ],
  },
  {
    label: 'Коммуникации',
    items: [
      { id: 'broadcast', label: 'Рассылки', icon: Send },
    ],
  },
  {
    label: 'Аналитика',
    items: [
      { id: 'control', label: 'Контроль', icon: BarChart3 },
      { id: 'comparison', label: 'Сравнение', icon: GitCompareArrows },
      { id: 'managers', label: 'Менеджеры', icon: Users },
    ],
  },
];

interface SalesSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function SalesSidebar({ activeTab, onTabChange }: SalesSidebarProps) {
  return (
    <div className="w-56 shrink-0 py-2 pr-4 space-y-4">
      {menuGroups.map((group, gi) => (
        <div key={group.label} className="space-y-1">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            {group.label}
          </p>
          {group.items.map(item => (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-[28px] transition-all duration-200",
                "hover:scale-105",
                activeTab === item.id
                  ? "bg-primary/10 text-primary font-medium shadow-sm"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          ))}
          {gi < menuGroups.length - 1 && <div className="h-px bg-border/50 mx-3 mt-3" />}
        </div>
      ))}
    </div>
  );
}
