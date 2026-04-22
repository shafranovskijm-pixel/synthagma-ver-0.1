import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Plus, Trash2, Users, Shield, BookOpen, Edit3, Eye, Mail } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { StaffInvitationDialog, type StaffInvitationRole } from "@/components/staff/StaffInvitationDialog";
import { RoleAuditLog } from "@/components/staff/RoleAuditLog";
import { OrgPermissionMatrix } from "@/components/staff/PermissionMatrix";
import { OrgCustomRolesManager } from "@/components/staff/OrgCustomRolesManager";
import { StaffExpirationButton } from "@/components/staff/StaffExpirationButton";
import { OwnershipTransfer } from "@/components/staff/OwnershipTransfer";
import { useAuth } from "@/hooks/useAuth";

interface StaffMember {
  id: string;
  user_id: string;
  role: string;
  display_name: string;
  bio: string | null;
  visibility: string;
  expires_at: string | null;
  created_at: string;
}

const ROLES = [
  { value: "owner", label: "Владелец", icon: Shield, color: "bg-amber-500/10 text-amber-600", description: "Полный доступ ко всем разделам, управление школой и сотрудниками" },
  { value: "admin", label: "Администратор", icon: Shield, color: "bg-red-500/10 text-red-600", description: "Все разделы, управление курсами, учениками и настройками" },
  { value: "school_editor", label: "Редактор школы", icon: Edit3, color: "bg-blue-500/10 text-blue-600", description: "Редактирование страниц школы, лендингов, дизайна" },
  { value: "course_editor", label: "Редактор курсов", icon: BookOpen, color: "bg-green-500/10 text-green-600", description: "Создание и редактирование курсов и уроков" },
  { value: "teacher", label: "Преподаватель", icon: Users, color: "bg-indigo-500/10 text-indigo-600", description: "Проверка заданий, общение с учениками, доступ к курсам" },
];

const INVITATION_ROLES: StaffInvitationRole[] = ROLES.map(r => ({
  value: r.value,
  label: r.label,
  description: r.description,
}));

const VISIBILITY = [
  { value: "all", label: "Все ученики" },
  { value: "course_only", label: "Только ученики его курсов" },
  { value: "hidden", label: "Скрыт" },
];

interface StaffManagerProps {
  organizationId: string;
}

export function StaffManager({ organizationId }: StaffManagerProps) {
  const { user, userRole } = useAuth();
  const isOwner = userRole === "organization";
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("teacher");
  const [visibility, setVisibility] = useState("all");
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadStaff(); }, [organizationId]);

  const loadStaff = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("org_staff")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at");
    setStaff((data as any[]) || []);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!email.trim()) { toast.error("Введите email"); return; }
    setSaving(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("email", email.trim().toLowerCase())
      .single();

    if (!profile) {
      toast.error("Пользователь с таким email не найден. Используйте «Пригласить» — мы пришлём ссылку на регистрацию.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("org_staff").insert({
      organization_id: organizationId,
      user_id: profile.user_id,
      role,
      display_name: displayName.trim() || email.trim(),
      visibility,
    } as any);

    if (error) {
      if (error.code === "23505") toast.error("Этот сотрудник уже добавлен");
      else toast.error("Ошибка: " + error.message);
    } else {
      toast.success("Сотрудник добавлен");
      setDialogOpen(false);
      setEmail(""); setDisplayName(""); setRole("teacher"); setVisibility("all");
      await loadStaff();
    }
    setSaving(false);
  };

  const handleChangeRole = async (id: string, newRole: string) => {
    const { error } = await supabase.from("org_staff").update({ role: newRole }).eq("id", id);
    if (error) toast.error("Ошибка: " + error.message);
    else { toast.success("Роль обновлена"); await loadStaff(); }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("org_staff").delete().eq("id", id);
    if (error) toast.error("Ошибка удаления");
    else { toast.success("Сотрудник удалён"); await loadStaff(); }
  };

  const getRoleConfig = (r: string) => ROLES.find(x => x.value === r) || ROLES[4];
  const selectedRoleConfig = getRoleConfig(role);

  return (
    <TooltipProvider>
      <div className="space-y-8">
        {/* Staff list */}
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2"><Users className="w-5 h-5" />Сотрудники</h2>
              <p className="text-sm text-muted-foreground">Управление ролями и доступом сотрудников</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-xl gap-2" onClick={() => setInviteOpen(true)}>
                <Mail className="w-4 h-4" />Пригласить по email
              </Button>
              <Button className="btn-gradient rounded-xl gap-2" onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4" />Добавить
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><SigmaSpinner /></div>
          ) : staff.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium">Нет сотрудников</p>
              <p className="text-sm">Добавьте первого сотрудника, чтобы начать</p>
            </div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Имя</TableHead>
                    <TableHead>Роль</TableHead>
                    <TableHead>Срок действия</TableHead>
                    <TableHead>Видимость</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map(s => {
                    const rc = getRoleConfig(s.role);
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.display_name}</TableCell>
                        <TableCell>
                          <Select value={s.role} onValueChange={(v) => handleChangeRole(s.id, v)}>
                            <SelectTrigger className="w-44 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLES.map(r => (
                                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className={`${rc.color} mt-1 cursor-help`}>{rc.label}</Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[250px]">
                              <p className="font-medium">{rc.label}</p>
                              <p className="text-xs text-muted-foreground">{rc.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <StaffExpirationButton
                            table="org_staff"
                            staffId={s.id}
                            expiresAt={s.expires_at}
                            onChange={loadStaff}
                          />
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground flex items-center gap-1">
                            <Eye className="w-3.5 h-3.5" />
                            {VISIBILITY.find(v => v.value === s.visibility)?.label || s.visibility}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(s.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Permissions matrix */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold">Что может каждая роль</h2>
            <p className="text-sm text-muted-foreground">
              Подробная матрица возможностей. Изменения вступают в силу мгновенно после смены роли.
            </p>
          </div>
          <OrgPermissionMatrix />
        </div>

        {/* Custom roles */}
        <OrgCustomRolesManager organizationId={organizationId} />

        {/* Audit log */}
        <RoleAuditLog scope="organization" organizationId={organizationId} limit={30} />

        {/* Invitation dialog */}
        <StaffInvitationDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          roles={INVITATION_ROLES}
          defaultRole="teacher"
          invitationType="organization"
          organizationId={organizationId}
          onInvited={loadStaff}
        />

        {/* Add staff dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Добавить существующего пользователя</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Email пользователя</Label>
                <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" />
                <p className="text-xs text-muted-foreground">
                  Пользователь должен быть уже зарегистрирован. Иначе используйте «Пригласить по email».
                </p>
              </div>
              <div className="space-y-2">
                <Label>Отображаемое имя</Label>
                <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Иван Иванов" />
              </div>
              <div className="space-y-2">
                <Label>Роль</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedRoleConfig.description}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Видимость для учеников</Label>
                <Select value={visibility} onValueChange={setVisibility}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VISIBILITY.map(v => (
                      <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
              <Button onClick={handleAdd} disabled={saving} className="btn-gradient gap-2">
                {saving ? <SigmaSpinner size="sm" /> : <Plus className="w-4 h-4" />}
                Добавить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
