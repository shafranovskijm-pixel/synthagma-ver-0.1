import { FileText, Package, Users, Building2, BarChart3, ScrollText, GitCompareArrows, Link2, CreditCard, PenTool, Database, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const menuItems = [
  { id: 'deals', label: 'Сделки 360°', icon: Sparkles },
  { id: 'proposals', label: 'КП', icon: FileText },
  { id: 'services', label: 'Услуги', icon: Package },
  { id: 'managers', label: 'Менеджеры', icon: Users },
  { id: 'leads', label: 'Лиды', icon: Building2 },
  { id: 'companies-db', label: 'База компаний', icon: Database },
  { id: 'contracts', label: 'Договоры', icon: ScrollText },
  { id: 'signing', label: 'Подписание', icon: PenTool },
  { id: 'control', label: 'Контроль', icon: BarChart3 },
  { id: 'comparison', label: 'Сравнение', icon: GitCompareArrows },
  { id: 'demo', label: 'Демо-ссылки', icon: Link2 },
  { id: 'company-card', label: 'Карточка', icon: CreditCard },
];

interface SalesSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function SalesSidebar({ activeTab, onTabChange }: SalesSidebarProps) {
  return (
    <div className="w-56 shrink-0 py-2 pr-4 space-y-1">
      {menuItems.map(item => (
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
    </div>
  );
}
