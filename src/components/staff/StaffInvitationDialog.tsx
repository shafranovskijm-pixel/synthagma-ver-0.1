import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Mail, Copy, Link } from "lucide-react";

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

type DeliveryMethod = "link" | "email";

interface CreatedInvitation {
  context: string;
  email: string;
  roleLabel: string;
  acceptUrl: string;
  delivery: DeliveryMethod;
  sent: boolean;
}

async function invitationErrorMessage(error: unknown): Promise<string> {
  let message = error instanceof Error ? error.message : "";
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.clone().json();
      if (typeof body?.error === "string") message = body.error;
    } catch {
      // The response may not be JSON; keep the SDK error as a fallback.
    }
    if (error.context.status === 401) return "Сессия истекла. Войдите заново и повторите приглашение.";
    if (error.context.status === 403 && (!message || message === error.message)) {
      return "Недостаточно прав для приглашения сотрудника.";
    }
    if (!message || message === error.message) {
      return error.context.status >= 500
        ? "Сервис приглашений временно недоступен. Попробуйте позже."
        : "Не удалось создать приглашение. Проверьте данные и попробуйте ещё раз.";
    }
  }
  if (message === "Unauthorized") return "Сессия истекла. Войдите заново и повторите приглашение.";
  return message || "Не удалось создать приглашение. Попробуйте ещё раз.";
}

function validInvitationUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol)
      && url.pathname === "/accept-invitation"
      && !!url.searchParams.get("token");
  } catch {
    return false;
  }
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
  const initialRole = defaultRole || roles[0]?.value || "";
  const context = JSON.stringify([invitationType, organizationId, companyId]);
  const [email, setEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [role, setRole] = useState(initialRole);
  const [delivery, setDelivery] = useState<DeliveryMethod>("link");
  const [sending, setSending] = useState(false);
  const [invitation, setInvitation] = useState<CreatedInvitation | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const generation = useRef(0);
  const pending = useRef(false);
  const linkInput = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    generation.current += 1;
    pending.current = false;
    setEmail("");
    setRecipientName("");
    setRole(initialRole);
    setDelivery("link");
    setInvitation(null);
    setSending(false);
    setCopyFailed(false);
    return () => { generation.current += 1; };
  }, [open, context, initialRole]);

  const handleClose = (next: boolean) => {
    if (!next) {
      generation.current += 1;
      pending.current = false;
      setInvitation(null);
      setSending(false);
      setCopyFailed(false);
    }
    onOpenChange(next);
  };

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity() || pending.current) return;
    if (!roles.some(item => item.value === role)) {
      toast.error("Выберите роль");
      return;
    }
    const requestGeneration = generation.current;
    const isCurrent = () => requestGeneration === generation.current;
    const invitedEmail = email.trim().toLowerCase();
    pending.current = true;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-staff-invitation", {
        body: {
          email: invitedEmail,
          role,
          invitation_type: invitationType,
          organization_id: organizationId,
          company_id: companyId,
          recipient_name: recipientName.trim() || null,
          skip_email: delivery === "link",
        },
      });
      if (!isCurrent()) return;
      if (error || data?.error) {
        const message = data?.error || await invitationErrorMessage(error);
        if (isCurrent()) toast.error(message);
        return;
      }
      if (!validInvitationUrl(data?.accept_url)) {
        toast.error("Сервер не вернул ссылку приглашения. Приглашение могло быть создано; обратитесь в поддержку перед повторной отправкой.");
        return;
      }
      setInvitation({
        context,
        email: invitedEmail,
        roleLabel: roles.find(item => item.value === role)?.label || role,
        acceptUrl: data.accept_url,
        delivery,
        sent: data.sent === true,
      });
      if (delivery === "link") toast.success("Ссылка приглашения создана");
      else if (data.sent === true) toast.success("Приглашение отправлено на email");
      else toast.warning("Приглашение создано, но письмо не отправлено. Передайте ссылку сотруднику.");
      onInvited?.();
    } catch (error: unknown) {
      const message = await invitationErrorMessage(error);
      if (isCurrent()) toast.error(message);
    } finally {
      if (isCurrent()) {
        pending.current = false;
        setSending(false);
      }
    }
  };

  const currentInvitation = invitation?.context === context ? invitation : null;
  const copyLink = async () => {
    if (!currentInvitation) return;
    const copyGeneration = generation.current;
    try {
      await navigator.clipboard.writeText(currentInvitation.acceptUrl);
      if (copyGeneration !== generation.current) return;
      setCopyFailed(false);
      toast.success("Ссылка скопирована");
    } catch {
      if (copyGeneration !== generation.current) return;
      setCopyFailed(true);
      linkInput.current?.focus();
      linkInput.current?.select();
    }
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
            Создайте персональную ссылку или отправьте её по email. Ссылка действует 7 дней.
          </DialogDescription>
        </DialogHeader>

        {!currentInvitation ? (
          <form onSubmit={handleSend}>
            <fieldset disabled={sending} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="staff-invitation-email">Email сотрудника</Label>
                <Input id="staff-invitation-email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" type="email" required autoComplete="email" />
                <p className="text-xs text-muted-foreground">Сотрудник должен войти или зарегистрироваться с этим email, чтобы принять приглашение.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-invitation-name">Имя (необязательно)</Label>
                <Input id="staff-invitation-name" value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="Иван Иванов" autoComplete="name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-invitation-role">Роль</Label>
                <Select value={role} onValueChange={setRole} disabled={sending}>
                  <SelectTrigger id="staff-invitation-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roles.map(item => (
                      <SelectItem key={item.value} value={item.value}>
                        <div className="flex flex-col">
                          <span>{item.label}</span>
                          {item.description && <span className="text-xs text-muted-foreground">{item.description}</span>}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium mb-2">Как передать приглашение</legend>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="invitation-delivery" value="link" checked={delivery === "link"} onChange={() => setDelivery("link")} />
                  Получить ссылку без письма
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="invitation-delivery" value="email" checked={delivery === "email"} onChange={() => setDelivery("email")} />
                  Отправить письмо сотруднику
                </label>
              </fieldset>
            </fieldset>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>Отмена</Button>
              <Button type="submit" disabled={sending}>
                {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : delivery === "link" ? <Link className="w-4 h-4 mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                {delivery === "link" ? "Создать ссылку" : "Отправить приглашение"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <div className="space-y-3 py-2">
              <p className="text-sm">Приглашение для <strong>{currentInvitation.email}</strong>. Роль: <strong>{currentInvitation.roleLabel}</strong>.</p>
              <p className="text-sm text-muted-foreground">
                {currentInvitation.delivery === "link"
                  ? "Письмо не отправлялось. Скопируйте ссылку и передайте её сотруднику."
                  : currentInvitation.sent
                    ? "Приглашение отправлено по email. При необходимости передайте ссылку вручную."
                    : "Приглашение создано, но письмо не отправлено. Передайте ссылку сотруднику вручную."}
              </p>
              <div className="space-y-2">
                <Label htmlFor="staff-invitation-link">Ссылка приглашения</Label>
                <div className="flex items-center gap-2">
                  <Input id="staff-invitation-link" ref={linkInput} value={currentInvitation.acceptUrl} readOnly onFocus={event => event.currentTarget.select()} className="font-mono text-xs" />
                  <Button size="icon" variant="outline" onClick={copyLink} aria-label="Скопировать ссылку">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {copyFailed && <p role="alert" className="text-sm text-destructive">Браузер не разрешил копирование. Ссылка выделена — скопируйте её вручную через меню или сочетанием Ctrl+C.</p>}
            </div>
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Закрыть</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
