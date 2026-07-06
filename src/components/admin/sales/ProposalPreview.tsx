import { useRef, useState } from 'react';
import { X, Download, Link2, Printer, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { getBaseUrl } from '@/utils/getBaseUrl';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { CommercialProposal, ProposalServiceItem } from '@/hooks/useSalesManager';
import { SUBSCRIPTION_PLANS, YEARLY_DISCOUNT, formatStorageSize, type SubscriptionPlan } from '@/constants/subscriptionPlans';
import { toast } from "sonner";
import { SignatureStampBlock } from "@/components/proposal/SignatureStampBlock";
import proposalHero from "@/assets/proposal-hero-premium.jpg";


interface Props {
  open: boolean;
  onClose: () => void;
  proposal: CommercialProposal;
  services: ProposalServiceItem[];
  showActions?: boolean;
  discountPercent?: number;
  senderName?: string;
  senderEmail?: string;
  senderWebsite?: string;
}

function formatMoney(n: number) {
  return n.toLocaleString('ru-RU');
}

const planOrder: SubscriptionPlan[] = ['free', 'start', 'standard', 'professional', 'maximum'];

const featureRows: { label: string; getValue: (p: SubscriptionPlan) => string | boolean }[] = [
  { label: "Курсы", getValue: (p) => { const l = SUBSCRIPTION_PLANS[p].limits; return l.maxCourses === -1 ? "∞" : String(l.maxCourses); }},
  { label: "Ученики", getValue: (p) => { const l = SUBSCRIPTION_PLANS[p].limits; return l.maxStudents === -1 ? "∞" : String(l.maxStudents); }},
  { label: "Настройки курсов", getValue: (p) => SUBSCRIPTION_PLANS[p].limits.courseSettings },
  { label: "Магазин курсов", getValue: () => true },
  { label: "Чек-лист документов", getValue: (p) => SUBSCRIPTION_PLANS[p].limits.documentChecklist },
  { label: "Видеоидентификация", getValue: (p) => SUBSCRIPTION_PLANS[p].limits.videoIdentification },
  { label: "Брендирование", getValue: (p) => SUBSCRIPTION_PLANS[p].limits.branding },
  { label: "Документы для ЛОО", getValue: (p) => p === 'professional' || p === 'maximum' },
  { label: "Охрана труда", getValue: (p) => p === 'professional' || p === 'maximum' },
  { label: "ФИС ФРДО", getValue: (p) => p === 'maximum' },
  { label: "Отчеты 1-ПК / 1-ПО", getValue: (p) => p === 'maximum' },
  { label: "API для CRM", getValue: (p) => p === 'maximum' },
  { label: "ИИ-генерация", getValue: (p) => SUBSCRIPTION_PLANS[p].limits.aiEnabled },
  { label: "ИИ-озвучка", getValue: (p) => SUBSCRIPTION_PLANS[p].limits.aiAudioEnabled },
];

function TariffComparisonTable() {
  const [yearly, setYearly] = useState(false);

  return (
    <div className="mt-8 mb-6 break-inside-avoid" style={{ fontFamily: "'Inter', sans-serif" }}>
      <h2 className="text-xl font-bold text-center mb-4">Тарифные планы</h2>
      
      {/* Toggle */}
      <div className="flex items-center justify-center gap-3 mb-4 text-sm">
        <span className={!yearly ? 'font-bold' : 'text-gray-500'}>Помесячно</span>
        <button
          onClick={() => setYearly(!yearly)}
          className="relative w-12 h-6 rounded-full transition-colors"
          style={{ backgroundColor: yearly ? '#d4a853' : '#ccc' }}
        >
          <span
            className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
            style={{ left: yearly ? '26px' : '2px' }}
          />
        </button>
        <span className={yearly ? 'font-bold' : 'text-gray-500'}>
          За год <span className="text-xs" style={{ color: '#d4a853' }}>−{YEARLY_DISCOUNT * 100}%</span>
        </span>
      </div>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="p-2 text-left border border-gray-200 bg-gray-50 w-[130px]"></th>
            {planOrder.map(p => {
              const plan = SUBSCRIPTION_PLANS[p];
              const isHighlighted = p === 'standard';
              const monthlyPrice = yearly ? Math.round(plan.price * (1 - YEARLY_DISCOUNT)) : plan.price;
              return (
                <th key={p} className="p-2 border border-gray-200 text-center" style={isHighlighted ? { backgroundColor: '#fdf6e3', borderColor: '#d4a853', borderWidth: 2 } : { backgroundColor: '#fafafa' }}>
                  {isHighlighted && <div className="text-[10px] font-semibold mb-1" style={{ color: '#d4a853' }}>⭐ Рекомендуем</div>}
                  <div className="font-bold text-sm">{plan.name}</div>
                  <div className="text-[10px] text-gray-500">{plan.description}</div>
                  <div className="font-bold text-base mt-1">
                    {plan.price === 0 ? '0' : monthlyPrice.toLocaleString('ru-RU')} <span className="text-[10px] font-normal">₽/мес</span>
                  </div>
                  {yearly && plan.price > 0 && (
                    <div className="text-[10px] text-gray-400 line-through">{plan.price.toLocaleString('ru-RU')} ₽/мес</div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {featureRows.map((row, idx) => (
            <tr key={row.label} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="p-1.5 border border-gray-200 font-medium">{row.label}</td>
              {planOrder.map(p => {
                const val = row.getValue(p);
                const isHighlighted = p === 'standard';
                const cellStyle = isHighlighted ? { borderLeft: '2px solid #d4a853', borderRight: '2px solid #d4a853' } : {};
                return (
                  <td key={p} className="p-1.5 border border-gray-200 text-center" style={cellStyle}>
                    {typeof val === 'boolean' ? (
                      val ? <span style={{ color: '#d4a853' }}>✓</span> : <span className="text-gray-300">✕</span>
                    ) : (
                      <span className="font-semibold" style={{ color: '#d4a853' }}>{val}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-gray-500 text-center mt-2">✦ Все тарифы включают бесплатную техническую поддержку</p>
    </div>
  );
}

interface ContentProps {
  proposal: CommercialProposal;
  services: ProposalServiceItem[];
  discountPercent?: number;
  senderName?: string;
  senderEmail?: string;
  senderWebsite?: string;
}

function ProposalContent({ proposal, services, discountPercent = 0, senderName, senderEmail, senderWebsite }: ContentProps) {
  const subtotal = services.reduce((s, l) => s + l.price * l.quantity, 0) || proposal.total_amount;
  const discountAmount = Math.round(subtotal * discountPercent / 100);
  const total = subtotal - discountAmount;
  
  const displayName = senderName || 'СИНТАГМА';
  const displayEmail = senderEmail || 'support@sintagma.com.ru';
  const displayWebsite = senderWebsite || 'https://sintagma.com.ru/';

  return (
    <div
      className="proposal-print-content bg-white text-slate-900 max-w-[820px] mx-auto"
      style={{ fontFamily: "'Inter', 'Helvetica Neue', system-ui, sans-serif" }}
    >
      {/* Premium hero header */}
      <div
        className="relative overflow-hidden text-white px-10 pt-10 pb-14"
        style={{
          backgroundImage: `linear-gradient(120deg, rgba(8,25,35,0.92) 0%, rgba(15,48,60,0.88) 55%, rgba(20,80,90,0.85) 100%), url(${proposalHero})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 flex items-center justify-center rounded-xl text-3xl font-serif"
              style={{ background: 'linear-gradient(135deg, #14b8a6, #0ea5b7)', boxShadow: '0 8px 24px rgba(20,184,166,0.35)' }}
            >
              Σ
            </div>
            <div>
              <div className="text-2xl font-semibold tracking-tight leading-tight">{displayName}</div>
              <div className="text-[13px] text-cyan-100/70 mt-0.5">Платформа дистанционного обучения</div>
            </div>
          </div>
          <div className="text-right text-[12px] text-cyan-50/80 leading-relaxed">
            <div>{displayWebsite}</div>
            <div>{displayEmail}</div>
          </div>
        </div>

        <div className="mt-8">
          <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-200/70">Commercial Proposal · № {proposal.id.slice(0, 8).toUpperCase()}</div>
          <h1
            className="text-4xl font-semibold tracking-tight mt-3"
            style={{ fontFamily: "'Playfair Display', 'Georgia', serif" }}
          >
            Коммерческое предложение
          </h1>
          <div className="mt-2 text-cyan-50/80 text-sm">
            для <span className="font-medium text-white">{proposal.company_name}</span>
            {proposal.contact_person && <> · вниманию <span className="font-medium text-white">{proposal.contact_person}</span></>}
          </div>
        </div>

        {/* Decorative gold line */}
        <div className="absolute right-0 top-0 h-full w-[2px]" style={{ background: 'linear-gradient(180deg, transparent, #d4a853, transparent)' }} />
      </div>

      {/* Content padding */}
      <div className="px-10 py-8">
        {/* Intro (from preset) */}
        {(proposal as any).intro_html && (
          <div
            className="mb-6 text-[14px] leading-relaxed text-slate-700 [&_p]:mb-2 [&_strong]:text-slate-900"
            dangerouslySetInnerHTML={{ __html: (proposal as any).intro_html }}
          />
        )}

        {/* Client info card */}
        <div
          className="rounded-xl p-5 mb-8"
          style={{ background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)', border: '1px solid #e2e8f0' }}
        >
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-3 font-semibold">Реквизиты клиента</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
            <div><span className="text-slate-500">Компания:</span> <strong className="text-slate-900">{proposal.company_name}</strong></div>
            {proposal.company_inn && <div><span className="text-slate-500">ИНН:</span> <span className="font-medium">{proposal.company_inn}</span></div>}
            {proposal.contact_person && <div><span className="text-slate-500">Контакт:</span> <span className="font-medium">{proposal.contact_person}</span></div>}
            {proposal.company_email && <div><span className="text-slate-500">Email:</span> <span className="font-medium">{proposal.company_email}</span></div>}
            {proposal.company_phone && <div><span className="text-slate-500">Телефон:</span> <span className="font-medium">{proposal.company_phone}</span></div>}
            {proposal.tariff_plan && <div><span className="text-slate-500">Тариф:</span> <span className="font-medium" style={{ color: '#0d9488' }}>{proposal.tariff_plan}</span></div>}
          </div>
        </div>

        {/* Section title */}
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-[13px] uppercase tracking-[0.22em] font-semibold text-slate-500">Состав предложения</h2>
          <div className="h-px flex-1 mx-4" style={{ background: 'linear-gradient(90deg, #e2e8f0, transparent)' }} />
        </div>

        {/* Services table */}
        <table className="w-full border-collapse mb-6 text-[13px]">
          <thead>
            <tr style={{ background: 'linear-gradient(135deg, #0f172a, #134e4a)' }} className="text-white">
              <th className="p-3 text-left w-10 font-medium text-[11px] uppercase tracking-wider">№</th>
              <th className="p-3 text-left font-medium text-[11px] uppercase tracking-wider">Наименование</th>
              <th className="p-3 text-right w-28 font-medium text-[11px] uppercase tracking-wider">Цена, ₽</th>
              <th className="p-3 text-center w-14 font-medium text-[11px] uppercase tracking-wider">Кол.</th>
              <th className="p-3 text-right w-32 font-medium text-[11px] uppercase tracking-wider">Сумма, ₽</th>
            </tr>
          </thead>
          <tbody>
            {services.map((line, idx) => (
              <tr key={line.id || idx} className="border-b border-slate-200 hover:bg-slate-50/50 transition-colors">
                <td className="p-3 text-slate-400 tabular-nums align-top pt-4">{String(idx + 1).padStart(2, '0')}</td>
                <td className="p-3 align-top">
                  <div className="font-medium text-slate-900 leading-snug">{line.custom_name}</div>
                  {line.custom_description && (
                    <div className="text-[12px] text-slate-500 mt-1 leading-relaxed">{line.custom_description}</div>
                  )}
                </td>
                <td className="p-3 text-right tabular-nums align-top pt-4 text-slate-700">{formatMoney(line.price)}</td>
                <td className="p-3 text-center tabular-nums align-top pt-4 text-slate-700">{line.quantity}</td>
                <td className="p-3 text-right tabular-nums align-top pt-4 font-semibold text-slate-900">{formatMoney(line.price * line.quantity)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {discountPercent > 0 && (
              <>
                <tr>
                  <td colSpan={4} className="p-2 pr-3 text-right text-slate-500">Подытог:</td>
                  <td className="p-2 text-right tabular-nums text-slate-700">{formatMoney(subtotal)} ₽</td>
                </tr>
                <tr>
                  <td colSpan={4} className="p-2 pr-3 text-right font-medium" style={{ color: '#0d9488' }}>Скидка {discountPercent}%:</td>
                  <td className="p-2 text-right tabular-nums font-medium" style={{ color: '#0d9488' }}>−{formatMoney(discountAmount)} ₽</td>
                </tr>
              </>
            )}
            <tr style={{ background: 'linear-gradient(135deg, #0f172a, #134e4a)' }} className="text-white">
              <td colSpan={4} className="p-4 text-right text-[11px] uppercase tracking-[0.2em]">Итого к оплате</td>
              <td className="p-4 text-right tabular-nums text-2xl font-semibold">
                {formatMoney(total)} <span className="text-sm font-normal text-cyan-200">₽</span>
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Value proposition */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { title: 'Настройка бесплатно', desc: 'Первичный запуск, миграция контента, обучение персонала' },
            { title: 'Приоритетная поддержка', desc: 'Персональный менеджер и техподдержка 12 месяцев' },
            { title: 'Годовая скидка 15%', desc: 'Экономия при годовой оплате уже включена в стоимость' },
          ].map((b) => (
            <div key={b.title} className="rounded-lg p-3 border border-slate-200 bg-white">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4" style={{ color: '#0d9488' }} />
                <div className="text-[12px] font-semibold text-slate-900">{b.title}</div>
              </div>
              <div className="text-[11px] text-slate-500 leading-snug">{b.desc}</div>
            </div>
          ))}
        </div>

        {/* Tariff comparison */}
        <TariffComparisonTable />

        {/* Note */}
        {proposal.custom_note && (
          <div className="rounded-lg p-4 mb-6 text-sm" style={{ background: '#fef7ec', borderLeft: '3px solid #d4a853' }}>
            <div className="font-semibold mb-1 text-slate-900">Примечание:</div>
            <div className="whitespace-pre-wrap text-slate-700">{proposal.custom_note}</div>
          </div>
        )}

        {/* Outro marketing block (from preset) */}
        {(proposal as any).outro_html && (
          <div
            className="mb-6 text-[13px] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: (proposal as any).outro_html }}
          />
        )}

        {/* Validity + date */}
        <div className="flex justify-between items-end text-[12px] text-slate-500 border-t border-slate-200 pt-4">
          <div>
            {proposal.valid_until && (
              <div>Действительно до: <strong className="text-slate-800">{format(new Date(proposal.valid_until), 'dd MMMM yyyy', { locale: ru })}</strong></div>
            )}
          </div>
          <div>
            Дата: {format(new Date(proposal.created_at), 'dd MMMM yyyy', { locale: ru })}
          </div>
        </div>

        {/* Signature & stamp */}
        <SignatureStampBlock />
      </div>
    </div>
  );
}


export function ProposalPreview({ open, onClose, proposal, services, showActions = true, discountPercent = 0, senderName, senderEmail, senderWebsite }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = contentRef.current;
    if (!content) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>КП — ${proposal.company_name}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Georgia', serif; color: #000; }
          img { max-width: 100%; height: auto; }
          @page { size: A4; margin: 15mm; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style>
      </head>
      <body>${content.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 300);
  };

  const handleCopyLink = () => {
    const url = `${getBaseUrl()}/proposal/${proposal.id}`;
    navigator.clipboard.writeText(url);
    toast.success("Ссылка скопирована", { description: "url" });
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-[900px] max-h-[90vh] overflow-y-auto p-0">
        <DialogTitle className="sr-only">Предпросмотр КП</DialogTitle>
        {showActions && (
          <div className="sticky top-0 z-10 bg-background border-b border-border p-3 flex items-center justify-between">
            <span className="text-sm font-medium">Предпросмотр КП</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyLink}>
                <Link2 className="w-4 h-4 mr-1" />Ссылка
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-1" />PDF / Печать
              </Button>
            </div>
          </div>
        )}
        <div ref={contentRef} className="p-4">
          <ProposalContent proposal={proposal} services={services} discountPercent={discountPercent} senderName={senderName} senderEmail={senderEmail} senderWebsite={senderWebsite} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Exported for public page usage
export { ProposalContent };
