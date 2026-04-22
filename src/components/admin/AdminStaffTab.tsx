import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, UserCog, Shield, Eye, Briefcase, Mail } from "lucide-react";
import { toast } from "sonner";
import { StaffInvitationDialog, type StaffInvitationRole } from "@/components/staff/StaffInvitationDialog";
import { RoleAuditLog } from "@/components/staff/RoleAuditLog";
import { AdminPermissionMatrix } from "@/components/staff/PermissionMatrix";
import { TwoFactorSetup } from "@/components/auth/TwoFactorSetup";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: typeof Shield; description: string }> = {
  super_admin: {
    label: "Супер-админ",
    color: "bg-destructive/10 text-destructive",
    icon: Shield,
    description: "Полный доступ ко всем разделам, управление другими админами",
  },
  admin: {
    label: "Администратор",
    color: "bg-primary/10 text-primary",
    icon: UserCog,
    description: "Управление организациями, пользователями, контентом",
  },
  sales_manager: {
    label: "Менеджер по продажам",
    color: "bg-amber-500/10 text-amber-600",
    icon: Briefcase,
    description: "Продажи, коммерческие предложения, биллинг",
  },
  viewer: {
    label: "Наблюдатель",
    color: "bg-muted text-muted-foreground",
    icon: Eye,
    description: "Просмотр аналитики и отчётов без возможности изменений",
  },
};

interface StaffMember {
  id: string;
  user_id: string;
  role: string;
  full_name: string;
  email: string;
  created_at: string;
}

export function AdminStaffTab() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("viewer");
  const [saving, setSaving] = useState(false);

  const fetchStaff = useCallback(async () => {
    const { data } = await supabase
      .from("admin_staff")
      .select("*")
      .order("created_at", { ascending: false });
    setStaff((data as StaffMember[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const handleAdd = async () => {
    if (!newFullName.trim() || !newEmail.trim()) {
      toast.error("Заполните ФИО и email");
      return;
    }
    setSaving(true);
    try {
      // Look up user by email in profiles
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("email", newEmail.trim().toLowerCase())
        .single();

      if (!profile) {
        toast.error("Пользователь с таким email не найден");
        setSaving(false);
        return;
      }

      const { error } = await supabase.from("admin_staff").insert({
        user_id: profile.user_id,
        full_name: newFullName.trim(),
        email: newEmail.trim().toLowerCase(),
        role: newRole,
      });

      if (error) {
        if (error.code === "23505") {
          toast.error("Этот сотрудник уже добавлен");
        } else {
          throw error;
        }
      } else {
        toast.success("Сотрудник добавлен");
        setShowAddDialog(false);
        setNewFullName("");
        setNewEmail("");
        setNewRole("viewer");
        fetchStaff();
      }
    } catch (e: any) {
      toast.error(e?.message || "Ошибка добавления");
    }
    setSaving(false);
  };

  const handleChangeRole = async (id: string, role: string) => {
    await supabase.from("admin_staff").update({ role }).eq("id", id);
    fetchStaff();
    toast.success("Роль обновлена");
  };

  const handleDelete = async (id: string) => {
    await supabase.from("admin_staff").delete().eq("id", id);
    fetchStaff();
    toast.success("Сотрудник удалён");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Сотрудники платформы</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Управляйте командой администраторов и менеджеров
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowInviteDialog(true)} className="gap-2">
            <Mail className="w-4 h-4" />
            Пригласить
          </Button>
          <Button onClick={() => setShowAddDialog(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Добавить
          </Button>
        </div>
      </div>

      {/* Role cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Object.entries(ROLE_CONFIG).map(([key, cfg]) => {
          const count = staff.filter(s => s.role === key).length;
          const Icon = cfg.icon;
          return (
            <div key={key} className="rounded-xl border border-border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${cfg.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{cfg.label}</p>
                  <p className="text-xs text-muted-foreground">{count} чел.</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{cfg.description}</p>
            </div>
          );
        })}
      </div>

      {/* Staff table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ФИО</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Роль</TableHead>
              <TableHead>Добавлен</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Загрузка...</TableCell>
              </TableRow>
            ) : staff.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Нет сотрудников</TableCell>
              </TableRow>
            ) : (
              staff.map(s => {
                const cfg = ROLE_CONFIG[s.role] || ROLE_CONFIG.viewer;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">{s.email}</TableCell>
                    <TableCell>
                      <Select value={s.role} onValueChange={(v) => handleChangeRole(s.id, v)}>
                        <SelectTrigger className="w-44 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROLE_CONFIG).map(([k, c]) => (
                            <SelectItem key={k} value={k}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(s.created_at), { addSuffix: true, locale: ru })}
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(s.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Удалить</TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Permissions matrix */}
      <div className="space-y-3">
        <div>
          <h3 className="text-base font-bold">Что может каждая роль</h3>
          <p className="text-sm text-muted-foreground">
            Доступ к разделам админ-панели по ролям. Изменения вступают в силу сразу после смены роли.
          </p>
        </div>
        <AdminPermissionMatrix />
      </div>

      {/* 2FA для текущего пользователя (super-admin) */}
      <TwoFactorSetup />

      {/* Audit log */}
      <RoleAuditLog scope="admin" limit={30} />

      {/* Invitation dialog */}
      <StaffInvitationDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        roles={Object.entries(ROLE_CONFIG).map(([value, c]) => ({
          value,
          label: c.label,
          description: c.description,
        })) as StaffInvitationRole[]}
        defaultRole="viewer"
        invitationType="admin"
        onInvited={fetchStaff}
      />

      {/* Add dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить существующего пользователя</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">ФИО</label>
              <Input value={newFullName} onChange={e => setNewFullName(e.target.value)} placeholder="Иванов Иван Иванович" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Email</label>
              <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="user@example.com" type="email" />
              <p className="text-xs text-muted-foreground mt-1">
                Пользователь должен быть уже зарегистрирован. Иначе используйте «Пригласить».
              </p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Роль</label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_CONFIG).map(([k, c]) => (
                    <SelectItem key={k} value={k}>
                      <div>
                        <span>{c.label}</span>
                        <span className="text-xs text-muted-foreground ml-2">— {c.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Отмена</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? "Сохранение..." : "Добавить"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
