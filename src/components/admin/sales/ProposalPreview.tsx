import { useRef } from 'react';
import { X, Download, Link2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { CommercialProposal, ProposalServiceItem } from '@/hooks/useSalesManager';

interface Props {
  open: boolean;
  onClose: () => void;
  proposal: CommercialProposal;
  services: ProposalServiceItem[];
  showActions?: boolean;
}

function formatMoney(n: number) {
  return n.toLocaleString('ru-RU');
}

function ProposalContent({ proposal, services }: { proposal: CommercialProposal; services: ProposalServiceItem[] }) {
  const total = services.reduce((s, l) => s + l.price * l.quantity, 0) || proposal.total_amount;

  return (
    <div className="proposal-print-content bg-white text-black p-8 max-w-[800px] mx-auto" style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-black pb-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-black text-white flex items-center justify-center rounded-lg text-2xl font-medium">
            Σ
          </div>
          <div>
            <div className="text-xl font-bold tracking-tight" style={{ fontFamily: "'Inter', sans-serif" }}>СИНТАГМА</div>
            <div className="text-xs text-gray-500" style={{ fontFamily: "'Inter', sans-serif" }}>Платформа дистанционного обучения</div>
          </div>
        </div>
        <div className="text-right text-sm text-gray-600" style={{ fontFamily: "'Inter', sans-serif" }}>
          <div>synthagma.ru</div>
          <div>info@synthagma.ru</div>
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
          <tr className="bg-black text-white font-bold">
            <td colSpan={4} className="p-2 text-right">ИТОГО:</td>
            <td className="p-2 text-right">{formatMoney(total)} ₽</td>
          </tr>
        </tfoot>
      </table>

      {/* Note */}
      {proposal.custom_note && (
        <div className="bg-gray-50 border-l-4 border-black p-4 mb-6 text-sm" style={{ fontFamily: "'Inter', sans-serif" }}>
          <div className="font-semibold mb-1">Примечание:</div>
          <div className="whitespace-pre-wrap">{proposal.custom_note}</div>
        </div>
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
    </div>
  );
}

export function ProposalPreview({ open, onClose, proposal, services, showActions = true }: Props) {
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
    const url = `${window.location.origin}/proposal/${proposal.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Ссылка скопирована', description: url });
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
          <ProposalContent proposal={proposal} services={services} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Exported for public page usage
export { ProposalContent };
