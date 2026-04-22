import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Edit, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Permission,
  OrgStaffRole,
  ORG_ROLE_PERMISSIONS,
  computeOrgPermissions,
} from "@/constants/rolePermissions";

interface CustomRole {
  id: string;
  name: string;
  description: string | null;
  base_role: string | null;
  permissions: string[];
  created_at: string;
}

const PERMISSION_GROUPS: Record<string, { label: string; perms: Permission[] }> = {
  courses: { label: "Курсы", perms: ["courses.read", "courses.write"] },
  students: { label: "Ученики", perms: ["students.read", "students.write"] },
  companies: { label: "Компании", perms: ["companies.read", "companies.write"] },
  library: { label: "Библиотека", perms: ["library.read", "library.write"] },
  documents: { label: "Документы", perms: ["documents.read", "documents.write"] },
  journals: { label: "Журналы", perms: ["journals.read", "journals.write"] },
  frdo: { label: "ФРДО", perms: ["frdo.read", "frdo.write"] },
  labor_safety: { label: "Охрана труда", perms: ["labor_safety.read", "labor_safety.write"] },
  services: { label: "Услуги", perms: ["services.read", "services.write"] },
  staff: { label: "Сотрудники", perms: ["staff.read", "staff.write"] },
  billing: { label: "Биллинг", perms: ["billing.read", "billing.write"] },
  settings: { label: "Настройки", perms: ["settings.read", "settings.write"] },
  chats: { label: "Чаты", perms: ["chats.read", "chats.write"] },
  homework: { label: "Задания", perms: ["homework.read", "homework.write"] },
  webinars: { label: "Вебинары", perms: ["webinars.read", "webinars.write"] },
  sales: { label: "Продажи", perms: ["sales.read", "sales.write"] },
};

const BASE_ROLE_OPTIONS: { value: OrgStaffRole | "none"; label: string }[] = [
  { value: "none", label: "С нуля (без шаблона)" },
  { value: "teacher", label: "Преподаватель" },
  { value: "course_editor", label: "Редактор курсов" },
  { value: "school_editor", label: "Редактор школы" },
  { value: "admin", label: "Администратор" },
];

interface Props {
  organizationId: string;
}

export function OrgCustomRolesManager({ organizationId }: Props) {
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomRole | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [baseRole, setBaseRole] = useState<OrgStaffRole | "none">("none");
  const [perms, setPerms] = useState<Set<Permission>>(new Set());
  const [saving, setSaving] = useState(false);

  const loadRoles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("org_custom_roles")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Не удалось загрузить кастомные роли");
    } else {
      setRoles((data || []).map((r) => ({
        ...r,
        permissions: Array.isArray(r.permissions) ? (r.permissions as string[]) : [],
      })));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadRoles();
  }, [organizationId]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setBaseRole("none");
    setPerms(new Set());
    setDialogOpen(true);
  };

  const openEdit = (r: CustomRole) => {
    setEditing(r);
    setName(r.name);
    setDescription(r.description || "");
    setBaseRole((r.base_role as OrgStaffRole) || "none");
    setPerms(new Set(r.permissions as Permission[]));
    setDialogOpen(true);
  };

  const applyBaseRole = (role: OrgStaffRole | "none") => {
    setBaseRole(role);
    if (role === "none") {
      setPerms(new Set());
    } else {
      setPerms(new Set(ORG_ROLE_PERMISSIONS[role]));
    }
  };

  const togglePerm = (p: Permission) => {
    const next = new Set(perms);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setPerms(next);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Введите название роли");
      return;
    }
    setSaving(true);
    const payload = {
      organization_id: organizationId,
      name: name.trim(),
      description: description.trim() || null,
      base_role: baseRole === "none" ? null : baseRole,
      permissions: Array.from(perms),
    };
    const { error } = editing
      ? await supabase.from("org_custom_roles").update(payload).eq("id", editing.id)
      : await supabase.from("org_custom_roles").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message.includes("unique") ? "Роль с таким названием уже существует" : `Ошибка: ${error.message}`);
      return;
    }
    toast.success(editing ? "Роль обновлена" : "Роль создана");
    setDialogOpen(false);
    loadRoles();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить роль? Сотрудникам с этой ролью будет снят custom_role_id.")) return;
    const { error } = await supabase.from("org_custom_roles").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Роль удалена");
      loadRoles();
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Пользовательские роли
          </CardTitle>
          <CardDescription>
            Создавайте свои роли с произвольным набором прав. Назначаются сотрудникам как обычные роли.
          </CardDescription>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> Создать роль
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-sm">Загрузка...</p>
        ) : roles.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Пока нет пользовательских ролей. Создайте первую — например, «Кладовщик» с доступом только к документам.
          </p>
        ) : (
          <div className="space-y-3">
            {roles.map((r) => {
              const permsSet = computeOrgPermissions(r.base_role, r.permissions);
              return (
                <div
                  key={r.id}
                  className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold">{r.name}</h4>
                      {r.base_role && (
                        <Badge variant="outline" className="text-xs">
                          основа: {BASE_ROLE_OPTIONS.find((o) => o.value === r.base_role)?.label || r.base_role}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {permsSet.size} прав
                      </Badge>
                    </div>
                    {r.description && (
                      <p className="text-sm text-muted-foreground mt-1">{r.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editing ? "Редактировать роль" : "Новая пользовательская роль"}</DialogTitle>
            <DialogDescription>
              Выберите шаблон или соберите права с нуля. Роль будет доступна только в вашей организации.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="role-name">Название *</Label>
                <Input
                  id="role-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Кладовщик, Бухгалтер, Куратор"
                />
              </div>
              <div>
                <Label htmlFor="role-base">Шаблон базовой роли</Label>
                <Select value={baseRole} onValueChange={(v) => applyBaseRole(v as OrgStaffRole | "none")}>
                  <SelectTrigger id="role-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BASE_ROLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="role-desc">Описание</Label>
              <Textarea
                id="role-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Кому эта роль предназначена"
                rows={2}
              />
            </div>

            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              <Label className="mb-2">Права ({perms.size})</Label>
              <ScrollArea className="flex-1 border rounded-md p-3">
                <div className="space-y-3">
                  {Object.entries(PERMISSION_GROUPS).map(([key, group]) => (
                    <div key={key} className="border-b pb-2 last:border-0">
                      <div className="font-medium text-sm mb-1.5">{group.label}</div>
                      <div className="grid grid-cols-2 gap-2">
                        {group.perms.map((p) => (
                          <label key={p} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={perms.has(p)}
                              onCheckedChange={() => togglePerm(p)}
                            />
                            <span className="font-mono text-xs">{p.split(".")[1]}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Сохранение..." : editing ? "Сохранить" : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
