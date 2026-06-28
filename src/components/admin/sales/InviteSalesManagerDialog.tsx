import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Copy, Send, MessageCircle, Mail, Link2, Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function InviteSalesManagerDialog({ open, onOpenChange }: Props) {
  const [email, setEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null);

  const reset = () => {
    setEmail(''); setRecipientName(''); setSendEmail(false); setAcceptUrl(null);
  };

  const handleCreate = async () => {
    if (sendEmail && !email.trim()) {
      toast.error('Укажите email для отправки');
      return;
    }
    setLoading(true);
    try {
      const targetEmail = (email.trim() || `invite-${Date.now()}@sintagma.local`).toLowerCase();
      const { data, error } = await supabase.functions.invoke('send-staff-invitation', {
        body: {
          email: targetEmail,
          role: 'sales_manager',
          invitation_type: 'sales',
          recipient_name: recipientName.trim() || null,
          skip_email: !sendEmail,
        },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || 'Не удалось создать приглашение');
        return;
      }
      setAcceptUrl(data?.accept_url || null);
      if (sendEmail && data?.sent) toast.success('Ссылка отправлена на email');
      else toast.success('Ссылка создана');
    } finally {
      setLoading(false);
    }
  };

  const shareText = `Приглашаю стать менеджером по продажам в Синтагме. Регистрация по ссылке:`;
  const tg = acceptUrl ? `https://t.me/share/url?url=${encodeURIComponent(acceptUrl)}&text=${encodeURIComponent(shareText)}` : '#';
  const wa = acceptUrl ? `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + acceptUrl)}` : '#';
  const mailto = acceptUrl ? `mailto:?subject=${encodeURIComponent('Приглашение в Синтагму')}&body=${encodeURIComponent(shareText + '\n\n' + acceptUrl)}` : '#';

  const copyLink = async () => {
    if (!acceptUrl) return;
    try {
      await navigator.clipboard.writeText(acceptUrl);
      toast.success('Ссылка скопирована');
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Пригласить менеджера по ссылке</DialogTitle>
        </DialogHeader>

        {!acceptUrl ? (
          <div className="space-y-4 pt-2">
            <div>
              <Label>ФИО (необязательно)</Label>
              <Input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="Иванов Иван" />
            </div>
            <div>
              <Label>Email (необязательно)</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="manager@example.ru" />
              <p className="text-xs text-muted-foreground mt-1">Можно оставить пустым — ссылку отправите вручную.</p>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={sendEmail} onCheckedChange={(v) => setSendEmail(!!v)} />
              Сразу отправить письмо
            </label>
            <Button onClick={handleCreate} disabled={loading} className="w-full">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
              Создать ссылку
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div>
              <Label>Ссылка-приглашение</Label>
              <div className="flex gap-2 mt-1">
                <Input readOnly value={acceptUrl} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button variant="outline" size="icon" onClick={copyLink}><Copy className="w-4 h-4" /></Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Срок действия — 7 дней. По ней человек зарегистрируется и попадёт в кабинет менеджера.</p>
            </div>
            <div>
              <Label>Поделиться</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <Button asChild variant="outline"><a href={tg} target="_blank" rel="noopener noreferrer"><Send className="w-4 h-4 mr-2" />Telegram</a></Button>
                <Button asChild variant="outline"><a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle className="w-4 h-4 mr-2" />WhatsApp</a></Button>
                <Button asChild variant="outline"><a href={mailto}><Mail className="w-4 h-4 mr-2" />Email</a></Button>
                <Button variant="outline" onClick={copyLink}><Copy className="w-4 h-4 mr-2" />Скопировать</Button>
              </div>
            </div>
            <Button variant="ghost" onClick={reset} className="w-full">Создать ещё одну</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
