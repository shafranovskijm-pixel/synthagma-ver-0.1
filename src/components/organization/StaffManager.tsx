import { useState, useEffect, useLayoutEffect, useRef } from "react";
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
import { Plus, Trash2, Users, Shield, BookOpen, Edit3, Eye, Mail, KeyRound, Copy } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { StaffInvitationDialog, type StaffInvitationRole } from "@/components/staff/StaffInvitationDialog";
import { RoleAuditLog } from "@/components/staff/RoleAuditLog";
import { OrgPermissionMatrix } from "@/components/staff/PermissionMatrix";
import { OrgCustomRolesManager } from "@/components/staff/OrgCustomRolesManager";
import { StaffExpirationButton } from "@/components/staff/StaffExpirationButton";
import { OwnershipTransfer } from "@/components/staff/OwnershipTransfer";
import { useAuth } from "@/hooks/useAuth";
import { generateStrongPassword } from "@/utils/credentials";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { isCurrentOrganizationAccess, useDocumentActionPermissions } from "@/hooks/useDocumentActionPermissions";
import { StaffDocumentGroupsDialog } from "@/components/staff/StaffDocumentGroupsDialog";
import { captureOfflineActor, isOfflineActorCurrent } from "@/utils/courseCache";

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
  { value: "sales_manager", label: "Специалист по рассылкам", icon: Mail, color: "bg-fuchsia-500/10 text-fuchsia-600", description: "Рассылки, компании, чаты и просмотр связанных данных учеников и документов" },
];

// The database role keeps its legacy `sales_manager` key because mailing
// authorization currently relies on sales.read/write. In the organization UI
// it is presented only as a mailing role; the unfinished CRM stays hidden.
const ASSIGNABLE_ROLES = ROLES.filter(r => r.value !== "owner");

// Роль «Владелец» намеренно исключена: передача владения выполняется
// только через OwnershipTransfer (Phase 5D.2).
const INVITATION_ROLES: StaffInvitationRole[] = ASSIGNABLE_ROLES.map(r => ({
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
  const { user } = useAuth();
  const permissions = useStaffPermissions();
  const documentActions = useDocumentActionPermissions(organizationId);
  const staffAccessReady = isCurrentOrganizationAccess(permissions, organizationId) &&
    !(permissions.organizationId === null && ["viewer", "sales_manager"].includes(permissions.adminRole ?? ""));
  const canReadStaff = staffAccessReady && (permissions.can("staff.read") || permissions.can("staff.write"));
  const canWriteStaff = staffAccessReady && permissions.can("staff.write");
  const [documentStaff, setDocumentStaff] = useState<(StaffMember & { organizationId: string }) | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const loadGeneration = useRef(0);
  const activeOrganization = useRef(organizationId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("teacher");
  const [visibility, setVisibility] = useState("all");
  const [createPassword, setCreatePassword] = useState(generateStrongPassword());
  const [saving, setSaving] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addDisplayName, setAddDisplayName] = useState("");
  const [addRole, setAddRole] = useState("teacher");
  const [addVisibility, setAddVisibility] = useState("all");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addDialogOwner, setAddDialogOwner] = useState<string | null>(null);
  const addOperation = useRef<symbol | null>(null);
  const addContextKey = JSON.stringify([
    organizationId, user?.id ?? null, user?.email?.trim().toLowerCase() ?? null,
    canWriteStaff, permissions.organizationId, permissions.orgRole, permissions.adminRole,
    permissions.loading, permissions.error, [...permissions.orgPermissions].sort(), [...permissions.adminSections].sort(),
  ]);
  const addContext = useRef({ key: addContextKey, revision: 0, mounted: true, open: false });
  if (addContext.current.key !== addContextKey) {
    addContext.current.key = addContextKey;
    addContext.current.revision += 1;
    addContext.current.open = false;
  }
  const addOwner = `${addContext.current.key}:${addContext.current.revision}`;
  const addDialogVisible = dialogOpen && canWriteStaff && addDialogOwner === addOwner;
  const changeAddDialog = (open: boolean) => {
    const context = addContext.current;
    context.revision += 1;
    context.open = open && canWriteStaff;
    addOperation.current = null;
    setDialogOpen(context.open);
    setAddDialogOwner(context.open ? `${context.key}:${context.revision}` : null);
    setAddError(null);
    setAddSaving(false);
    setAddEmail(""); setAddDisplayName(""); setAddRole("teacher"); setAddVisibility("all");
  };

  useLayoutEffect(() => {
    addContext.current.mounted = true;
    return () => {
      addContext.current.mounted = false;
      addContext.current.open = false;
      addContext.current.revision += 1;
      addOperation.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setIsOwner(false);
      return;
    }

    void (supabase.rpc as any)("is_org_owner", {
      _user_id: user.id,
      _organization_id: organizationId,
    }).then(({ data, error }: { data: boolean | null; error: unknown }) => {
      if (!cancelled) setIsOwner(!error && data === true);
    });

    return () => { cancelled = true; };
  }, [organizationId, user]);

  useLayoutEffect(() => {
    activeOrganization.current = organizationId;
    loadGeneration.current += 1;
    setStaff([]);
    setLoadError(false);
    setLoading(true);
    setDialogOpen(false);
    setInviteOpen(false);
    setCreateOpen(false);
    setDocumentStaff(null);
    return () => { loadGeneration.current += 1; };
  }, [organizationId]);

  useEffect(() => { void loadStaff(); }, [organizationId]);

  const loadStaff = async (scope?: { authorization: string; isCurrent: () => boolean }) => {
    if (activeOrganization.current !== organizationId || (scope && !scope.isCurrent())) return;
    const generation = ++loadGeneration.current;
    setLoading(true);
    setLoadError(false);
    try {
      let query = supabase
        .from("org_staff")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at");
      if (scope) query = query.setHeader("Authorization", scope.authorization);
      const { data, error } = await query;
      if (generation !== loadGeneration.current || (scope && !scope.isCurrent())) return;
      if (error) throw error;
      setStaff((data as StaffMember[]) || []);
    } catch {
      if (generation !== loadGeneration.current || (scope && !scope.isCurrent())) return;
      setStaff([]);
      setLoadError(true);
    } finally {
      if (generation === loadGeneration.current && (!scope || scope.isCurrent())) setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!addEmail.trim()) { toast.error("Введите email"); return; }
    if (!user || !canWriteStaff || !addDialogVisible || addOperation.current) return;
    const actorId = user.id;
    const authRevision = captureOfflineActor(actorId);
    const key = addContext.current.key;
    const revision = addContext.current.revision;
    const operation = Symbol("add-existing-staff");
    const draft = { email: addEmail.trim().toLowerCase(), displayName: addDisplayName.trim() || addEmail.trim(), role: addRole, visibility: addVisibility, organizationId };
    const stale = new Error("staff_add_context_changed");
    const isCurrent = () => addContext.current.mounted && addContext.current.open &&
      addContext.current.key === key && addContext.current.revision === revision &&
      addOperation.current === operation && isOfflineActorCurrent(actorId, authRevision);
    const requireCurrent = () => { if (!isCurrent()) throw stale; };
    addOperation.current = operation;
    setAddSaving(true);
    setAddError(null);
    try {
      requireCurrent();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      requireCurrent();
      const session = sessionData.session;
      if (sessionError || session?.user.id !== actorId || !session.access_token) throw new Error("Войдите заново и повторите добавление сотрудника.");
      const { data: identity, error: identityError } = await supabase.auth.getUser(session.access_token);
      requireCurrent();
      if (identityError || identity.user?.id !== actorId) throw new Error("Не удалось подтвердить текущую учётную запись. Повторите попытку.");
      const authorization = `Bearer ${session.access_token}`;
      let targetUserId: string;
      // The authenticated account exists independently of its optional profile.
      // This fallback applies only to the exact account verified with its original JWT.
      if (draft.email === user.email?.trim().toLowerCase() && draft.email === identity.user.email?.trim().toLowerCase()) {
        targetUserId = actorId;
      } else {
        const { data: profile, error: profileError } = await supabase.from("profiles")
          .select("user_id").eq("email", draft.email).single().setHeader("Authorization", authorization);
        requireCurrent();
        if (profileError && profileError.code !== "PGRST116") throw new Error("Не удалось найти пользователя. Повторите попытку.");
        if (!profile?.user_id) throw new Error("Пользователь с таким email не найден. Используйте «Пригласить» — мы пришлём ссылку на регистрацию.");
        targetUserId = profile.user_id;
      }
      requireCurrent();
      const { error } = await supabase.from("org_staff").insert({
        organization_id: draft.organizationId, user_id: targetUserId, role: draft.role,
        display_name: draft.displayName, visibility: draft.visibility,
      }).setHeader("Authorization", authorization);
      requireCurrent();
      if (error) throw new Error(error.code === "23505" ? "Этот сотрудник уже добавлен" : "Ошибка: " + error.message);
      await loadStaff({ authorization, isCurrent });
      requireCurrent();
      toast.success("Сотрудник добавлен");
      changeAddDialog(false);
    } catch (error) {
      if (error !== stale && isCurrent()) {
        const message = error instanceof Error ? error.message : "Не удалось добавить сотрудника. Повторите попытку.";
        setAddError(message);
        toast.error(message);
      }
    } finally {
      if (addOperation.current === operation) {
        addOperation.current = null;
        if (addContext.current.mounted && addContext.current.key === key && addContext.current.revision === revision) setAddSaving(false);
      }
    }
  };

  const handleCreateStaff = async () => {
    if (!email.trim() || !createPassword.trim()) { toast.error("Введите email и пароль"); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-org-staff", {
        body: {
          email: email.trim(),
          password: createPassword,
          fullName: displayName.trim() || email.trim(),
          organizationId,
          role,
          displayName: displayName.trim() || email.trim(),
          visibility,
        },
      });
      if (error || data?.error) {
        toast.error("Ошибка: " + (data?.error || error?.message));
      } else {
        if (data?.existed) {
          toast.success("Сотрудник уже зарегистрирован — добавлен в организацию");
        } else {
          await navigator.clipboard.writeText(`${data.login} / ${data.password}`).catch(() => {});
          toast.success(`Создан. Логин: ${data.login}, пароль: ${data.password} (скопировано)`, { duration: 10000 });
        }
        setCreateOpen(false);
        setEmail(""); setDisplayName(""); setRole("teacher"); setVisibility("all");
        setCreatePassword(generateStrongPassword());
        await loadStaff();
      }
    } finally { setSaving(false); }
  };

  const handleChangeRole = async (id: string, newRole: string) => {
    const { error } = await supabase.from("org_staff").update({ role: newRole }).eq("id", id);
    if (error) toast.error("Ошибка: " + error.message);
    else { toast.success("Роль обновлена"); await loadStaff(); }
  };

  const handleDelete = async (id: string) => {
    const { data, error } = await (supabase.rpc as any)("remove_org_staff_member", {
      p_staff_id: id,
    });
    if (error || data !== true) toast.error("Ошибка удаления");
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
            <div className="flex gap-2 flex-wrap">
              <Button className="btn-gradient rounded-xl gap-2" onClick={() => setInviteOpen(true)}>
                <Mail className="w-4 h-4" />Пригласить сотрудника
              </Button>
              <Button variant="outline" className="rounded-xl gap-2" onClick={() => { setCreatePassword(generateStrongPassword()); setCreateOpen(true); }}>
                <KeyRound className="w-4 h-4" />Создать с паролем
              </Button>
              <Button variant="ghost" className="rounded-xl gap-2" disabled={!canWriteStaff} onClick={() => changeAddDialog(true)}>
                <Plus className="w-4 h-4" />Добавить существующего
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><SigmaSpinner /></div>
          ) : loadError ? (
            <div role="alert" className="rounded-xl border border-destructive/30 p-6 space-y-3">
              <p>Не удалось загрузить сотрудников. Проверьте соединение и повторите попытку.</p>
              <Button variant="outline" onClick={() => void loadStaff()}>Повторить загрузку</Button>
            </div>
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
                              {ASSIGNABLE_ROLES.map(r => (
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
                          <Button variant="ghost" size="icon" disabled={!canReadStaff}
                            title={`Доступ сотрудника ${s.display_name}`} aria-label={`Доступ сотрудника ${s.display_name}`}
                            onClick={() => setDocumentStaff({ ...s, organizationId })}>
                            <Users className="w-4 h-4" />
                          </Button>
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
        <StaffDocumentGroupsDialog organizationId={organizationId}
          staff={documentStaff?.organizationId === organizationId ? documentStaff : null}
          canWrite={canWriteStaff} onClose={() => setDocumentStaff(null)} onSaved={() => void loadStaff()}
          canGrantSign={permissions.orgRole !== "teacher" && documentActions.canSign}
          canGrantIssue={permissions.orgRole !== "teacher" && documentActions.canIssue} />

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

        {/* Ownership transfer (only for current owner) */}
        {isOwner && user && (
          <OwnershipTransfer organizationId={organizationId} currentOwnerId={user.id} />
        )}

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
        <Dialog open={addDialogVisible} onOpenChange={changeAddDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Добавить существующего пользователя</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Email пользователя</Label>
                <Input value={addEmail} onChange={e => setAddEmail(e.target.value)} placeholder="email@example.com" disabled={addSaving} />
                <p className="text-xs text-muted-foreground">
                  Пользователь должен быть уже зарегистрирован. Иначе используйте «Пригласить сотрудника».
                </p>
              </div>
              <div className="space-y-2">
                <Label>Отображаемое имя</Label>
                <Input value={addDisplayName} onChange={e => setAddDisplayName(e.target.value)} placeholder="Иван Иванов" disabled={addSaving} />
              </div>
              <div className="space-y-2">
                <Label>Роль</Label>
                <Select value={addRole} onValueChange={setAddRole} disabled={addSaving}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE_ROLES.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {getRoleConfig(addRole).description}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Видимость для учеников</Label>
                <Select value={addVisibility} onValueChange={setAddVisibility} disabled={addSaving}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VISIBILITY.map(v => (
                      <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {addError && <p role="alert" className="text-sm text-destructive">{addError}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => changeAddDialog(false)}>Отмена</Button>
              <Button onClick={handleAdd} disabled={addSaving} className="btn-gradient gap-2">
                {addSaving ? <SigmaSpinner size="sm" /> : <Plus className="w-4 h-4" />}
                Добавить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create staff with password dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Создать сотрудника с логином и паролем</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Email (логин)</Label>
                <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" />
                <p className="text-xs text-muted-foreground">Будет создан аккаунт с этим email. Если такой пользователь уже есть — он просто будет добавлен в организацию.</p>
              </div>
              <div className="space-y-2">
                <Label>ФИО / отображаемое имя</Label>
                <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Иван Иванов" />
              </div>
              <div className="space-y-2">
                <Label>Пароль</Label>
                <div className="flex gap-2">
                  <Input value={createPassword} onChange={e => setCreatePassword(e.target.value)} />
                  <Button type="button" variant="outline" size="icon" onClick={() => setCreatePassword(generateStrongPassword())} title="Сгенерировать">
                    <KeyRound className="w-4 h-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(createPassword); toast.success("Скопировано"); }} title="Скопировать">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Роль</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE_ROLES.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">{selectedRoleConfig.description}</p>
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
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button>
              <Button onClick={handleCreateStaff} disabled={saving} className="btn-gradient gap-2">
                {saving ? <SigmaSpinner size="sm" /> : <KeyRound className="w-4 h-4" />}
                Создать
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
