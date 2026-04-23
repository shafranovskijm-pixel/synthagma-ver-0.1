import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Trash2, Mail } from "lucide-react";

type StaffRole = "owner" | "manager" | "viewer";

interface StaffRow {
  id: string;
  user_id: string;
  role: StaffRole;
  expires_at: string | null;
  created_at: string;
  profile?: { full_name: string | null; email: string | null };
}

interface CompanyStaffManagerProps {
  companyId: string;
  companyName: string;
  ownerUserId: string | null;
}

const ROLE_LABEL: Record<StaffRole, string> = {
  owner: "Владелец",
  manager: "Менеджер",
  viewer: "Наблюдатель",
};

const ROLE_DESCRIPTION: Record<StaffRole, string> = {
  owner: "Полный доступ, может приглашать и удалять сотрудников",
  manager: "Может управлять обучением, заявками, документами",
  viewer: "Только просмотр данных компании",
};

export function CompanyStaffManager({ companyId, companyName, ownerUserId }: CompanyStaffManagerProps) {
  const { user } = useAuth();
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<StaffRole>("manager");
  const [sending, setSending] = useState(false);

  // Является ли текущий пользователь владельцем (companies.user_id) — он всегда может управлять
  const isOwner = user?.id === ownerUserId;
  // Также управлять могут пользователи с ролью owner в company_staff
  const myStaffRow = rows.find(r => r.user_id === user?.id);
  const canManage = isOwner || myStaffRow?.role === "owner";

  const load = async () => {
    setLoading(true);
    const { data: staff, error } = await supabase
      .from("company_staff")
      .select("id, user_id, role, expires_at, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const userIds = (staff || []).map(s => s.user_id);
    let profilesMap: Record<string, { full_name: string | null; email: string | null }> = {};
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);
      profilesMap = Object.fromEntries(
        (profs || []).map(p => [p.user_id, { full_name: p.full_name, email: p.email }])
      );
    }

    setRows((staff || []).map(s => ({
      ...(s as any),
      profile: profilesMap[s.user_id],
    })));
    setLoading(false);
  };

  useEffect(() => {
    if (companyId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const sendInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error("Укажите email");
      return;
    }
    setSending(true);
    try {
      const { error } = await safeInvoke<any>("send-staff-invitation", {
        body: {
          email: inviteEmail.trim().toLowerCase(),
          role: inviteRole,
          invitation_type: "company",
          company_id: companyId,
          recipient_name: inviteName.trim() || undefined,
        },
      });
      if (error) throw error;
      toast.success("Приглашение отправлено", {
        description: `${inviteEmail} получит письмо со ссылкой для входа в «${companyName}»`,
      });
      setInviteOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("manager");
    } catch (e: any) {
      toast.error("Ошибка отправки", { description: getErrorMessage(e) });
    } finally {
      setSending(false);
    }
  };

  const updateRole = async (staffId: string, role: StaffRole) => {
    const { error } = await supabase.from("company_staff").update({ role }).eq("id", staffId);
    if (error) {
      toast.error("Не удалось обновить роль", { description: getErrorMessage(error) });
      return;
    }
    toast.success("Роль обновлена");
    await load();
  };

  const removeStaff = async (staffId: string, name: string) => {
    if (!confirm(`Удалить ${name} из сотрудников компании?`)) return;
    const { error } = await supabase.from("company_staff").delete().eq("id", staffId);
    if (error) {
      toast.error("Не удалось удалить", { description: getErrorMessage(error) });
      return;
    }
    toast.success("Сотрудник удалён");
    await load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Сотрудники компании</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Дополнительные пользователи с доступом к кабинету «{companyName}»
          </p>
        </div>
        {canManage && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <UserPlus className="w-4 h-4 mr-2" />
                Пригласить
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Пригласить в кабинет компании</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@example.com"
                  />
                </div>
                <div>
                  <Label>Имя (необязательно)</Label>
                  <Input
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="Иван Петров"
                  />
                </div>
                <div>
                  <Label>Роль</Label>
                  <Select value={inviteRole} onValueChange={(v: StaffRole) => setInviteRole(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["owner", "manager", "viewer"] as StaffRole[]).map((r) => (
                        <SelectItem key={r} value={r}>
                          <div className="flex flex-col">
                            <span>{ROLE_LABEL[r]}</span>
                            <span className="text-xs text-muted-foreground">{ROLE_DESCRIPTION[r]}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground flex items-start gap-2">
                  <Mail className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  Получатель получит письмо со ссылкой. Срок действия — 7 дней.
                </p>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setInviteOpen(false)}>
                  Отмена
                </Button>
                <Button onClick={sendInvite} disabled={sending}>
                  {sending ? "Отправка..." : "Отправить приглашение"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {/* Owner row (companies.user_id) */}
        {ownerUserId && (
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <div className="font-medium text-sm flex items-center gap-2">
                Основной владелец
                <Badge variant="secondary" className="text-[10px]">owner</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {ownerUserId === user?.id ? "Вы" : "Зарегистрирован системно"}
              </div>
            </div>
            <span className="text-xs text-muted-foreground">Не удаляется</span>
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Загрузка...</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Нет дополнительных сотрудников. Пригласите коллегу для совместной работы.
          </div>
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between py-3 gap-4">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">
                    {row.profile?.full_name || row.profile?.email || "Без имени"}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {row.profile?.email}
                    {row.expires_at && (
                      <> • до {new Date(row.expires_at).toLocaleDateString("ru-RU")}</>
                    )}
                  </div>
                </div>
                {canManage ? (
                  <Select
                    value={row.role}
                    onValueChange={(v: StaffRole) => updateRole(row.id, v)}
                  >
                    <SelectTrigger className="w-[140px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["owner", "manager", "viewer"] as StaffRole[]).map((r) => (
                        <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline">{ROLE_LABEL[row.role]}</Badge>
                )}
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => removeStaff(row.id, row.profile?.full_name || row.profile?.email || "сотрудника")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
