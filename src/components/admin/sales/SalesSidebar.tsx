import { Target, FileText, Building2, ScrollText, PenTool, Sparkles, Send, ListTodo, Package, BarChart3, GitCompareArrows, Users, LineChart, Headphones } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

/** Основной поток продаж — иконка-рейл слева */
const railGroups: MenuGroup[] = [
  {
    label: 'Главное',
    items: [
      { id: 'shift', label: 'Смена', icon: Headphones },
      { id: 'overview', label: 'Обзор', icon: Target },
      { id: 'tasks', label: 'Задачи', icon: ListTodo },
      { id: 'report', label: 'Отчёт', icon: LineChart },
      { id: 'managers', label: 'Менеджеры', icon: Users },
    ],
  },
  {
    label: 'Сделки',
    items: [
      { id: 'deals', label: 'Сделки 360°', icon: Sparkles },
      { id: 'companies', label: 'Компании', icon: Building2 },
    ],
  },
  {
    label: 'Документы',
    items: [
      { id: 'proposals', label: 'КП', icon: FileText },
      { id: 'contracts', label: 'Договоры', icon: ScrollText },
      { id: 'signing', label: 'Подписание', icon: PenTool },
    ],
  },
  {
    label: 'Коммуникации',
    items: [
      { id: 'broadcast', label: 'Рассылки', icon: Send },
    ],
  },
];

/** Дополнительные вкладки — вынесены в меню под аватаром */
export const salesExtraItems: MenuItem[] = [
  { id: 'services', label: 'Услуги', icon: Package },
  { id: 'control', label: 'Контроль', icon: BarChart3 },
  { id: 'comparison', label: 'Сравнение', icon: GitCompareArrows },
];


/** Все пункты — для лейблов/мобильного меню */
export const salesMenuGroups: MenuGroup[] = [
  ...railGroups,
  { label: 'Прочее', items: salesExtraItems },
];

interface SalesSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

/** Мобильное меню — полные подписи */
export function SalesSidebarContent({ activeTab, onTabChange }: SalesSidebarProps) {
  return (
    <div className="space-y-4">
      {salesMenuGroups.map((group, gi) => (
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
                activeTab === item.id
                  ? "bg-primary/10 text-primary font-medium shadow-sm"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          ))}
          {gi < salesMenuGroups.length - 1 && <div className="h-px bg-border/50 mx-3 mt-3" />}
        </div>
      ))}
    </div>
  );
}

/** Десктоп: узкий icon-rail с тултипами */
export function SalesSidebar({ activeTab, onTabChange }: SalesSidebarProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="hidden md:flex w-14 shrink-0 flex-col items-center py-2 sticky top-2 self-start max-h-[calc(100vh-1rem)] overflow-y-auto">
        {railGroups.map((group, gi) => (
          <div key={group.label} className="w-full flex flex-col items-center gap-1">
            {group.items.map(item => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onTabChange(item.id)}
                      aria-label={item.label}
                      className={cn(
                        "w-10 h-10 flex items-center justify-center rounded-2xl transition-all duration-200",
                        active
                          ? "bg-primary/10 text-primary shadow-sm"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      <Icon className="w-5 h-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            })}
            {gi < railGroups.length - 1 && <div className="h-px w-6 bg-border/50 my-2" />}
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
