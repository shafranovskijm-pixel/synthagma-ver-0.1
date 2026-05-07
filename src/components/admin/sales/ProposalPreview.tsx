import { useRef, useState } from 'react';
import { X, Download, Link2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { getBaseUrl } from '@/utils/getBaseUrl';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { CommercialProposal, ProposalServiceItem } from '@/hooks/useSalesManager';
import { SUBSCRIPTION_PLANS, YEARLY_DISCOUNT, formatStorageSize, type SubscriptionPlan } from '@/constants/subscriptionPlans';
import { toast } from "sonner";
import { SignatureStampBlock } from "@/components/proposal/SignatureStampBlock";

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
    <div className="proposal-print-content bg-white text-black p-8 max-w-[800px] mx-auto" style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-black pb-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-black text-white flex items-center justify-center rounded-lg text-2xl font-medium">
            Σ
          </div>
          <div>
            <div className="text-xl font-bold tracking-tight" style={{ fontFamily: "'Inter', sans-serif" }}>{displayName}</div>
            <div className="text-xs text-gray-500" style={{ fontFamily: "'Inter', sans-serif" }}>Платформа дистанционного обучения</div>
          </div>
        </div>
        <div className="text-right text-sm text-gray-600" style={{ fontFamily: "'Inter', sans-serif" }}>
          <div>{displayWebsite}</div>
          <div>{displayEmail}</div>
        </div>
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-center mb-6 uppercase tracking-wide">
        Коммерческое предложение
      </h1>

      {/* Client info */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-gray-500">Кому:</span> <strong>{proposal.company_name}</strong></div>
          {proposal.company_inn && <div><span className="text-gray-500">ИНН:</span> {proposal.company_inn}</div>}
          {proposal.contact_person && <div><span className="text-gray-500">Контакт:</span> {proposal.contact_person}</div>}
          {proposal.company_email && <div><span className="text-gray-500">Email:</span> {proposal.company_email}</div>}
          {proposal.company_phone && <div><span className="text-gray-500">Телефон:</span> {proposal.company_phone}</div>}
          {proposal.tariff_plan && <div><span className="text-gray-500">Тариф:</span> {proposal.tariff_plan}</div>}
        </div>
      </div>

      {/* Services table */}
      <table className="w-full border-collapse mb-6 text-sm" style={{ fontFamily: "'Inter', sans-serif" }}>
        <thead>
          <tr className="bg-black text-white">
            <th className="p-2 text-left w-10">№</th>
            <th className="p-2 text-left">Наименование</th>
            <th className="p-2 text-right w-24">Цена, ₽</th>
            <th className="p-2 text-center w-16">Кол.</th>
            <th className="p-2 text-right w-28">Сумма, ₽</th>
          </tr>
        </thead>
        <tbody>
          {services.map((line, idx) => (
            <tr key={line.id || idx} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
              <td className="p-2 border-b border-gray-200">{idx + 1}</td>
              <td className="p-2 border-b border-gray-200">
                <div className="font-medium">{line.custom_name}</div>
                {line.custom_description && (
                  <div className="text-xs text-gray-500 mt-0.5">{line.custom_description}</div>
                )}
              </td>
              <td className="p-2 border-b border-gray-200 text-right">{formatMoney(line.price)}</td>
              <td className="p-2 border-b border-gray-200 text-center">{line.quantity}</td>
              <td className="p-2 border-b border-gray-200 text-right font-medium">{formatMoney(line.price * line.quantity)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {discountPercent > 0 && (
            <>
              <tr className="bg-gray-100 font-medium">
                <td colSpan={4} className="p-2 text-right">Подытог:</td>
                <td className="p-2 text-right">{formatMoney(subtotal)} ₽</td>
              </tr>
              <tr className="bg-gray-100 font-medium" style={{ color: '#c0392b' }}>
                <td colSpan={4} className="p-2 text-right">Скидка {discountPercent}%:</td>
                <td className="p-2 text-right">−{formatMoney(discountAmount)} ₽</td>
              </tr>
            </>
          )}
          <tr className="bg-black text-white font-bold">
            <td colSpan={4} className="p-2 text-right">ИТОГО:</td>
            <td className="p-2 text-right">{formatMoney(total)} ₽</td>
          </tr>
        </tfoot>
      </table>

      {/* Tariff comparison */}
      <TariffComparisonTable />

      {/* Note */}
      {proposal.custom_note && (
        <div className="bg-gray-50 border-l-4 border-black p-4 mb-6 text-sm" style={{ fontFamily: "'Inter', sans-serif" }}>
          <div className="font-semibold mb-1">Примечание:</div>
          <div className="whitespace-pre-wrap">{proposal.custom_note}</div>
        </div>
      )}

      {/* Outro marketing block (from preset) */}
      {(proposal as any).outro_html && (
        <div
          className="mb-6"
          style={{ fontFamily: "'Inter', sans-serif" }}
          dangerouslySetInnerHTML={{ __html: (proposal as any).outro_html }}
        />
      )}

      {/* Validity + date */}
      <div className="flex justify-between items-end text-sm text-gray-600 border-t border-gray-200 pt-4" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div>
          {proposal.valid_until && (
            <div>Действительно до: <strong>{format(new Date(proposal.valid_until), 'dd MMMM yyyy', { locale: ru })}</strong></div>
          )}
        </div>
        <div>
          Дата: {format(new Date(proposal.created_at), 'dd MMMM yyyy', { locale: ru })}
        </div>
      </div>

      {/* Signature & stamp — обязательно для тендеров */}
      <SignatureStampBlock />
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
