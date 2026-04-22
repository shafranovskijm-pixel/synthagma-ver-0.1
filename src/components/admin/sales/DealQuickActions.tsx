import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, ScrollText, Receipt, Phone, StickyNote, ListTodo, Mail, Copy, Globe, FileSignature } from 'lucide-react';
import { toast } from 'sonner';

interface ContactInfo {
  phone?: string | null;
  email?: string | null;
  website?: string | null;
}

interface DealQuickActionsProps {
  companyName: string;
  inn: string;
  contact?: ContactInfo;
  onCreateProposal?: () => void;
  onCreateContract?: () => void;
  onCreateInvoice?: () => void;
  onAddCall?: () => void;
  onAddNote?: () => void;
  onAddTask?: () => void;
  onSendForSigning?: () => void;
}

export function DealQuickActions({
  companyName, inn, contact,
  onCreateProposal, onCreateContract, onCreateInvoice,
  onAddCall, onAddNote, onAddTask, onSendForSigning,
}: DealQuickActionsProps) {
  const copy = async (txt: string, label: string) => {
    await navigator.clipboard.writeText(txt);
    toast.success(`${label} скопирован`);
  };

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4 space-y-4">
        {/* Контакты */}
        {(contact?.phone || contact?.email || contact?.website) && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
              Контакты
            </div>
            <div className="space-y-1.5">
              {contact?.phone && (
                <div className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted/30 transition-colors">
                  <Phone className="w-4 h-4 text-primary shrink-0" />
                  <a href={`tel:${contact.phone}`} className="text-sm flex-1 truncate hover:underline">
                    {contact.phone}
                  </a>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg"
                    onClick={() => copy(contact.phone!, 'Телефон')}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              )}
              {contact?.email && (
                <div className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted/30 transition-colors">
                  <Mail className="w-4 h-4 text-primary shrink-0" />
                  <a href={`mailto:${contact.email}`} className="text-sm flex-1 truncate hover:underline">
                    {contact.email}
                  </a>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg"
                    onClick={() => copy(contact.email!, 'Email')}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              )}
              {contact?.website && (
                <div className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted/30 transition-colors">
                  <Globe className="w-4 h-4 text-primary shrink-0" />
                  <a href={contact.website.startsWith('http') ? contact.website : `https://${contact.website}`}
                    target="_blank" rel="noreferrer"
                    className="text-sm flex-1 truncate hover:underline">
                    {contact.website}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Быстрые действия */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
            Быстрые действия
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ActionBtn icon={FileText} label="Создать КП" onClick={onCreateProposal} />
            <ActionBtn icon={ScrollText} label="Создать договор" onClick={onCreateContract} />
            <ActionBtn icon={Receipt} label="Выставить счёт" onClick={onCreateInvoice} />
            {onSendForSigning && (
              <ActionBtn icon={FileSignature} label="На ПЭП" onClick={onSendForSigning} />
            )}
            <ActionBtn icon={Phone} label="Записать звонок" onClick={onAddCall} />
            <ActionBtn icon={StickyNote} label="Заметка" onClick={onAddNote} />
            <ActionBtn icon={ListTodo} label="Задача" onClick={onAddTask} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionBtn({ icon: Icon, label, onClick }: { icon: any; label: string; onClick?: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}
      className="rounded-xl justify-start h-auto py-2.5 hover:bg-primary/5 hover:border-primary/30">
      <Icon className="w-3.5 h-3.5 mr-2 text-primary shrink-0" />
      <span className="text-xs">{label}</span>
    </Button>
  );
}
