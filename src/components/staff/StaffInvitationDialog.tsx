import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Mail, Copy } from "lucide-react";

export interface StaffInvitationRole {
  value: string;
  label: string;
  description?: string;
}

interface StaffInvitationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: StaffInvitationRole[];
  defaultRole?: string;
  invitationType: "admin" | "organization" | "company";
  organizationId?: string;
  companyId?: string;
  onInvited?: () => void;
}

export function StaffInvitationDialog({
  open,
  onOpenChange,
  roles,
  defaultRole,
  invitationType,
  organizationId,
  companyId,
  onInvited,
}: StaffInvitationDialogProps) {
  const [email, setEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [role, setRole] = useState(defaultRole || roles[0]?.value || "");
  const [sending, setSending] = useState(false);
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null);

  const reset = () => {
    setEmail("");
    setRecipientName("");
    setRole(defaultRole || roles[0]?.value || "");
    setAcceptUrl(null);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSend = async () => {
    if (!email.trim()) {
      toast.error("Введите email");
      return;
    }
    if (!role) {
      toast.error("Выберите роль");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-staff-invitation", {
        body: {
          email: email.trim().toLowerCase(),
          role,
          invitation_type: invitationType,
          organization_id: organizationId,
          company_id: companyId,
          recipient_name: recipientName.trim() || null,
        },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Не удалось отправить приглашение");
        return;
      }
      setAcceptUrl(data?.accept_url || null);
      if (data?.sent) {
        toast.success("Приглашение отправлено на email");
      } else {
        toast.warning("Приглашение создано, но письмо не отправлено. Скопируйте ссылку.");
      }
      onInvited?.();
    } catch (e: any) {
      toast.error(e?.message || "Ошибка");
    } finally {
      setSending(false);
    }
  };

  const copyLink = async () => {
    if (!acceptUrl) return;
    await navigator.clipboard.writeText(acceptUrl);
    toast.success("Ссылка скопирована");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Пригласить сотрудника
          </DialogTitle>
          <DialogDescription>
            Сотрудник получит email со ссылкой. Срок действия — 7 дней.
          </DialogDescription>
        </DialogHeader>

        {!acceptUrl ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" type="email" />
            </div>
            <div className="space-y-2">
              <Label>Имя (необязательно)</Label>
              <Input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="Иван Иванов" />
            </div>
            <div className="space-y-2">
              <Label>Роль</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roles.map(r => (
                    <SelectItem key={r.value} value={r.value}>
                      <div className="flex flex-col">
                        <span>{r.label}</span>
                        {r.description && <span className="text-xs text-muted-foreground">{r.description}</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Если письмо не дойдёт, отправьте сотруднику эту ссылку вручную:
            </p>
            <div className="flex items-center gap-2">
              <Input value={acceptUrl} readOnly className="font-mono text-xs" />
              <Button size="icon" variant="outline" onClick={copyLink}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          {!acceptUrl ? (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>Отмена</Button>
              <Button onClick={handleSend} disabled={sending}>
                {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                Отправить
              </Button>
            </>
          ) : (
            <Button onClick={() => handleClose(false)}>Закрыть</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
