import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, FileText, FileCode, Briefcase, Boxes, Settings, ListTodo, Send, Building2, Target, Mail, Kanban, UserPlus, Trophy, Snowflake } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrgDashboard } from '@/contexts/OrgDashboardContext';
import { OrgEmailCampaigns } from './OrgEmailCampaigns';
import { OrgSmtpSettings } from './OrgSmtpSettings';
import { OrgServicesManager } from './OrgServicesManager';
import { OrgProposalsManager } from './OrgProposalsManager';
import { OrgContractsManager } from './OrgContractsManager';
import { EmailTemplatesManager } from '@/components/shared/sales/EmailTemplatesManager';
import { SalesOverview } from '@/components/admin/sales/SalesOverview';
import { SalesTasks } from '@/components/admin/sales/SalesTasks';
import { Deals360 } from '@/components/admin/sales/Deals360';
import { CompaniesUnified } from '@/components/admin/sales/CompaniesUnified';
import { LogActivityDialog } from '@/components/admin/sales/LogActivityDialog';
import { SalesKanban } from '@/components/admin/sales/SalesKanban';
import { LeadsManager } from '@/components/admin/sales/LeadsManager';
import { CompetitorComparison } from '@/components/admin/sales/CompetitorComparison';
import { SalesSegments } from '@/components/admin/sales/SalesSegments';
import { useOrgSmtp } from '@/hooks/useOrgSmtp';

interface MenuItem { id: string; label: string; icon: any; soon?: boolean }
interface MenuGroup { label: string; items: MenuItem[] }

const menuGroups: MenuGroup[] = [
  {
    label: 'Главное',
    items: [
      { id: 'overview', label: 'Обзор', icon: Target },
      { id: 'tasks', label: 'Задачи', icon: ListTodo },
      { id: 'comparison', label: 'Сравнение', icon: Trophy },
    ],
  },
  {
    label: 'Клиенты и сделки',
    items: [
      { id: 'kanban', label: 'Канбан сделок', icon: Kanban },
      { id: 'deals', label: 'Сделки 360°', icon: Sparkles },
      { id: 'leads', label: 'Лиды', icon: UserPlus },
      { id: 'companies', label: 'Компании', icon: Building2 },
      { id: 'segments', label: 'Сегменты', icon: Snowflake },
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

const AVAILABLE_SECTIONS = ['overview','tasks','comparison','kanban','deals','leads','companies','segments','proposals','contracts','services','templates','campaigns','smtp'];

export function OrgSalesManager() {
  const d = useOrgDashboard();
  const organizationId = d.organizationId;
  const [section, setSection] = useState<string>('overview');
  const { settings: smtp } = useOrgSmtp(organizationId);

  const [taskPrefill, setTaskPrefill] = useState<{ name: string; inn?: string | null } | null>(null);
  const [dealSelectedInn, setDealSelectedInn] = useState<string | null>(null);
  const [activityDialog, setActivityDialog] = useState<{
    open: boolean; type: 'call' | 'note'; company: { name: string; inn: string } | null;
  }>({ open: false, type: 'call', company: null });
  const [commRefresh, setCommRefresh] = useState(0);

  const openActivity = useCallback((type: 'call' | 'note') => (c: { name: string; inn: string }) => {
    setActivityDialog({ open: true, type, company: c });
  }, []);

  if (!organizationId) return null;

  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-3 flex items-center gap-2 text-sm">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <span>
            <strong>Кабинет менеджера продаж — Beta.</strong> Единое место для сделок, КП, договоров, задач и общения с клиентами вашей организации.
          </span>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        {/* Сайдбар */}
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
        <div className="flex-1 min-w-0 space-y-3">
          {/* Глобальное предупреждение SMTP, если используются разделы, требующие почту */}
          {!smtp && (section === 'campaigns' || section === 'proposals') && (
            <Card className="border-orange-500/30 bg-orange-500/5">
              <CardContent className="p-3 flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-orange-500 shrink-0" />
                <div className="flex-1">
                  <strong>SMTP не настроен.</strong> Письма получателям отправляться не будут.
                </div>
                <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setSection('smtp')}>
                  Настроить
                </Button>
              </CardContent>
            </Card>
          )}

          {section === 'overview' && (
            <SalesOverview
              organizationId={organizationId}
              availableSections={AVAILABLE_SECTIONS}
              onJump={(t, inn) => {
                if (inn) setDealSelectedInn(inn);
                if (AVAILABLE_SECTIONS.includes(t)) setSection(t);
                else setSection('deals');
              }}
            />
          )}
          {section === 'tasks' && (
            <SalesTasks
              organizationId={organizationId}
              prefillCompany={taskPrefill}
              onPrefillConsumed={() => setTaskPrefill(null)}
              onOpenDeal={(inn) => { setDealSelectedInn(inn); setSection('deals'); }}
            />
          )}
          {section === 'kanban' && (
            <SalesKanban
              organizationId={organizationId}
              onSelectCompany={(inn) => { setDealSelectedInn(inn); setSection('deals'); }}
            />
          )}
          {section === 'deals' && (
            <Deals360
              organizationId={organizationId}
              onCreateProposal={() => setSection('proposals')}
              onCreateContract={() => setSection('contracts')}
              onCreateInvoice={() => setSection('contracts')}
              onAddCall={openActivity('call')}
              onAddNote={openActivity('note')}
              onAddTask={(c) => { setTaskPrefill(c); setSection('tasks'); }}
              onSendForSigning={() => setSection('contracts')}
              communicationRefreshKey={commRefresh}
              initialSelectedInn={dealSelectedInn}
            />
          )}
          {section === 'leads' && <LeadsManager organizationId={organizationId} />}
          {section === 'companies' && <CompaniesUnified organizationId={organizationId} hideColdBase />}
          {section === 'segments' && (
            <SalesSegments
              organizationId={organizationId}
              onOpenDeal={(inn) => { if (inn) setDealSelectedInn(inn); setSection('deals'); }}
            />
          )}
          {section === 'comparison' && <CompetitorComparison />}
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

      {/* Универсальный диалог звонок/заметка */}
      {activityDialog.company && (
        <LogActivityDialog
          open={activityDialog.open}
          onOpenChange={(v) => setActivityDialog(s => ({ ...s, open: v }))}
          companyName={activityDialog.company.name}
          inn={activityDialog.company.inn}
          defaultType={activityDialog.type}
          organizationId={organizationId}
          onLogged={() => setCommRefresh(x => x + 1)}
        />
      )}
    </div>
  );
}
