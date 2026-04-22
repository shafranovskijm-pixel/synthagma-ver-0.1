import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Mail, FileText, FileCode, Briefcase, Boxes, Settings, Users, ListTodo, Send, Building2, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrgDashboard } from '@/contexts/OrgDashboardContext';
import { OrgEmailCampaigns } from './OrgEmailCampaigns';
import { OrgSmtpSettings } from './OrgSmtpSettings';
import { OrgServicesManager } from './OrgServicesManager';
import { OrgProposalsManager } from './OrgProposalsManager';
import { OrgContractsManager } from './OrgContractsManager';
import { EmailTemplatesManager } from '@/components/shared/sales/EmailTemplatesManager';

interface MenuItem { id: string; label: string; icon: any; soon?: boolean }
interface MenuGroup { label: string; items: MenuItem[] }

const menuGroups: MenuGroup[] = [
  {
    label: 'Главное',
    items: [
      { id: 'overview', label: 'Обзор', icon: Target, soon: true },
      { id: 'tasks', label: 'Задачи', icon: ListTodo, soon: true },
    ],
  },
  {
    label: 'Клиенты и сделки',
    items: [
      { id: 'deals', label: 'Сделки 360°', icon: Sparkles, soon: true },
      { id: 'companies', label: 'Компании', icon: Building2, soon: true },
    ],
  },
  {
    label: 'Документы',
    items: [
      { id: 'proposals', label: 'КП', icon: FileText },
      { id: 'contracts', label: 'Договоры', icon: Briefcase },
      { id: 'services', label: 'Каталог услуг', icon: Boxes },
      { id: 'templates', label: 'Шаблоны писем', icon: FileCode },
    ],
  },
  {
    label: 'Коммуникации',
    items: [
      { id: 'campaigns', label: 'Рассылки', icon: Send },
    ],
  },
  {
    label: 'Настройки',
    items: [
      { id: 'smtp', label: 'SMTP', icon: Settings },
    ],
  },
];

export function OrgSalesManager() {
  const d = useOrgDashboard();
  const organizationId = d.organizationId;
  const [section, setSection] = useState<string>('campaigns');

  if (!organizationId) return null;

  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-3 flex items-center gap-2 text-sm">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <span>
            <strong>Раздел «Продажи» — Beta.</strong> Новый «Кабинет менеджера»: единое место для КП, договоров, рассылок и общения с клиентами.
          </span>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        {/* Сайдбар продаж (по образцу админки) */}
        <div className="w-56 shrink-0 py-2 pr-4 space-y-4">
          {menuGroups.map((group, gi) => (
            <div key={group.label} className="space-y-1">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {group.label}
              </p>
              {group.items.map(item => (
                <button
                  key={item.id}
                  onClick={() => !item.soon && setSection(item.id)}
                  disabled={item.soon}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-[28px] transition-all duration-200',
                    !item.soon && 'hover:scale-105',
                    section === item.id
                      ? 'bg-primary/10 text-primary font-medium shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                    item.soon && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.soon && <span className="text-[9px] uppercase tracking-wide">soon</span>}
                </button>
              ))}
              {gi < menuGroups.length - 1 && <div className="h-px bg-border/50 mx-3 mt-3" />}
            </div>
          ))}
        </div>

        {/* Контент */}
        <div className="flex-1 min-w-0">
          {section === 'campaigns' && (
            <OrgEmailCampaigns organizationId={organizationId} onGoToSmtp={() => setSection('smtp')} />
          )}
          {section === 'templates' && <EmailTemplatesManager scope="org" organizationId={organizationId} />}
          {section === 'services' && <OrgServicesManager organizationId={organizationId} />}
          {section === 'proposals' && (
            <OrgProposalsManager organizationId={organizationId} onGoToSmtp={() => setSection('smtp')} />
          )}
          {section === 'contracts' && <OrgContractsManager organizationId={organizationId} />}
          {section === 'smtp' && <OrgSmtpSettings organizationId={organizationId} />}
        </div>
      </div>
    </div>
  );
}
