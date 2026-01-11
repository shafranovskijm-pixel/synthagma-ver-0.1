import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Building2, Loader2, Users, BookOpen, Key, Eye, EyeOff, Copy, Check, Download } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import * as XLSX from "xlsx";

interface Organization {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  inn: string | null;
  contact_name: string | null;
  ai_enabled: boolean;
  created_at: string;
  users_count?: number;
  courses_count?: number;
  credentials?: {
    login_email: string;
    login_password: string;
  } | null;
}

export function OrganizationsManager() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [deleteOrg, setDeleteOrg] = useState<Organization | null>(null);
  const [editOrg, setEditOrg] = useState<Organization | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    inn: "",
    contact_name: "",
    login_email: "",
    login_password: "",
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get counts and credentials for each org
      const orgsWithCounts = await Promise.all(
        (data || []).map(async (org) => {
          const [usersResult, coursesResult, credentialsResult] = await Promise.all([
            supabase.from("profiles").select("id", { count: "exact" }).eq("organization_id", org.id),
            supabase.from("courses").select("id", { count: "exact" }).eq("organization_id", org.id),
            supabase.from("organization_credentials").select("login_email, login_password").eq("organization_id", org.id).maybeSingle(),
          ]);
          return {
            ...org,
            users_count: usersResult.count || 0,
            courses_count: coursesResult.count || 0,
            credentials: credentialsResult.data || null,
          };
        })
      );

      setOrganizations(orgsWithCounts);
    } catch (error) {
      console.error("Error fetching organizations:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить организации",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.email) {
      toast({
        title: "Ошибка",
        description: "Заполните обязательные поля",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      // Create organization
      const { data: newOrg, error } = await supabase.from("organizations").insert({
        name: formData.name,
        email: formData.email,
        phone: formData.phone || null,
        inn: formData.inn || null,
        contact_name: formData.contact_name || null,
      }).select().single();

      if (error) throw error;

      // If credentials provided, create user and save credentials
      if (formData.login_email && formData.login_password) {
        // Call edge function to create user
        const { error: userError } = await supabase.functions.invoke("create-org-user", {
          body: {
            email: formData.login_email,
            password: formData.login_password,
            fullName: formData.contact_name || "Администратор",
            organizationId: newOrg.id
          }
        });

        if (userError) {
          console.error("Error creating user:", userError);
          toast({
            title: "Предупреждение",
            description: "Организация создана, но не удалось создать пользователя",
            variant: "destructive",
          });
        } else {
          // Save credentials for admin reference
          await supabase.from("organization_credentials").insert({
            organization_id: newOrg.id,
            login_email: formData.login_email,
            login_password: formData.login_password,
          });
        }
      }

      toast({ title: "Успешно", description: "Организация создана" });
      setIsCreateOpen(false);
      setFormData({ name: "", email: "", phone: "", inn: "", contact_name: "", login_email: "", login_password: "" });
      fetchOrganizations();
    } catch (error) {
      console.error("Error creating organization:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось создать организацию",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editOrg || !formData.name || !formData.email) {
      toast({
        title: "Ошибка",
        description: "Заполните обязательные поля",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({
          name: formData.name,
          email: formData.email,
          phone: formData.phone || null,
          inn: formData.inn || null,
          contact_name: formData.contact_name || null,
        })
        .eq("id", editOrg.id);

      if (error) throw error;

      toast({ title: "Успешно", description: "Организация обновлена" });
      setIsEditOpen(false);
      setEditOrg(null);
      setFormData({ name: "", email: "", phone: "", inn: "", contact_name: "", login_email: "", login_password: "" });
      fetchOrganizations();
    } catch (error) {
      console.error("Error updating organization:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось обновить организацию",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteOrg) return;

    try {
      const { error } = await supabase.from("organizations").delete().eq("id", deleteOrg.id);

      if (error) throw error;

      toast({ title: "Успешно", description: "Организация удалена" });
      setDeleteOrg(null);
      fetchOrganizations();
    } catch (error) {
      console.error("Error deleting organization:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось удалить организацию. Возможно, есть связанные данные.",
        variant: "destructive",
      });
    }
  };

  const openEdit = (org: Organization) => {
    setEditOrg(org);
    setFormData({
      name: org.name,
      email: org.email,
      phone: org.phone || "",
      inn: org.inn || "",
      contact_name: org.contact_name || "",
      login_email: org.credentials?.login_email || "",
      login_password: org.credentials?.login_password || "",
    });
    setIsEditOpen(true);
  };

  const togglePassword = (orgId: string) => {
    setShowPasswords(prev => ({ ...prev, [orgId]: !prev[orgId] }));
  };

  const copyToClipboard = async (text: string, fieldId: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const exportToExcel = () => {
    const data = organizations.map((org, index) => ({
      "№": index + 1,
      "Название": org.name,
      "ИНН": org.inn || "",
      "Email организации": org.email,
      "Телефон": org.phone || "",
      "Контактное лицо": org.contact_name || "",
      "Логин для входа": org.credentials?.login_email || "",
      "Пароль": org.credentials?.login_password || "",
      "Сотрудников": org.users_count || 0,
      "Курсов": org.courses_count || 0,
      "Дата создания": format(new Date(org.created_at), "dd.MM.yyyy", { locale: ru }),
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Set column widths
    worksheet["!cols"] = [
      { wch: 5 },   // №
      { wch: 30 },  // Название
      { wch: 15 },  // ИНН
      { wch: 25 },  // Email организации
      { wch: 18 },  // Телефон
      { wch: 20 },  // Контактное лицо
      { wch: 25 },  // Логин для входа
      { wch: 15 },  // Пароль
      { wch: 12 },  // Сотрудников
      { wch: 10 },  // Курсов
      { wch: 15 },  // Дата создания
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Организации");
    
    const fileName = `Организации_${format(new Date(), "dd-MM-yyyy")}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    
    toast({ title: "Успешно", description: "Файл скачан" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-display font-bold">Организации</h2>
          <p className="text-muted-foreground">Управление организациями платформы</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportToExcel} disabled={organizations.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Экспорт в Excel
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="btn-gradient">
                <Plus className="w-4 h-4 mr-2" />
                Добавить
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Новая организация</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Название *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="ООО Компания"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="org@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Телефон</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+7 (999) 123-45-67"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inn">ИНН</Label>
                <Input
                  id="inn"
                  value={formData.inn}
                  onChange={(e) => setFormData({ ...formData, inn: e.target.value })}
                  placeholder="1234567890"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_name">Контактное лицо</Label>
                <Input
                  id="contact_name"
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  placeholder="Иван Иванов"
                />
              </div>
              
              <div className="border-t pt-4 mt-4">
                <p className="text-sm font-medium mb-3">Учётные данные для входа</p>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="login_email">Email для входа</Label>
                    <Input
                      id="login_email"
                      type="email"
                      value={formData.login_email}
                      onChange={(e) => setFormData({ ...formData, login_email: e.target.value })}
                      placeholder="admin@company.ru"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login_password">Пароль</Label>
                    <Input
                      id="login_password"
                      type="text"
                      value={formData.login_password}
                      onChange={(e) => setFormData({ ...formData, login_password: e.target.value })}
                      placeholder="Минимум 6 символов"
                    />
                  </div>
                </div>
              </div>
              <Button onClick={handleCreate} disabled={saving} className="w-full">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Создать
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Всего организаций</CardDescription>
            <CardTitle className="text-3xl">{organizations.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Всего сотрудников</CardDescription>
            <CardTitle className="text-3xl">
              {organizations.reduce((acc, org) => acc + (org.users_count || 0), 0)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Всего курсов</CardDescription>
            <CardTitle className="text-3xl">
              {organizations.reduce((acc, org) => acc + (org.courses_count || 0), 0)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Организация</TableHead>
                <TableHead>Контакты</TableHead>
                <TableHead>Учётные данные</TableHead>
                <TableHead className="text-center">Сотрудники</TableHead>
                <TableHead className="text-center">Курсы</TableHead>
                <TableHead>Создана</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <Building2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    Организации не найдены
                  </TableCell>
                </TableRow>
              ) : (
                organizations.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium">{org.name}</div>
                          {org.inn && (
                            <div className="text-sm text-muted-foreground">ИНН: {org.inn}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{org.email}</div>
                        {org.phone && <div className="text-muted-foreground">{org.phone}</div>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {org.credentials ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <Key className="w-3 h-3 text-muted-foreground" />
                            <span className="text-sm font-mono">{org.credentials.login_email}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => copyToClipboard(org.credentials!.login_email, `email-${org.id}`)}
                            >
                              {copiedField === `email-${org.id}` ? (
                                <Check className="w-3 h-3 text-green-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </Button>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-mono text-muted-foreground">
                              {showPasswords[org.id] ? org.credentials.login_password : '••••••••'}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => togglePassword(org.id)}
                            >
                              {showPasswords[org.id] ? (
                                <EyeOff className="w-3 h-3" />
                              ) : (
                                <Eye className="w-3 h-3" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => copyToClipboard(org.credentials!.login_password, `pass-${org.id}`)}
                            >
                              {copiedField === `pass-${org.id}` ? (
                                <Check className="w-3 h-3 text-green-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">Не задано</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="gap-1">
                        <Users className="w-3 h-3" />
                        {org.users_count}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="gap-1">
                        <BookOpen className="w-3 h-3" />
                        {org.courses_count}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(org.created_at), "d MMM yyyy", { locale: ru })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(org)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteOrg(org)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактировать организацию</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Название *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email *</Label>
              <Input
                id="edit-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Телефон</Label>
              <Input
                id="edit-phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-inn">ИНН</Label>
              <Input
                id="edit-inn"
                value={formData.inn}
                onChange={(e) => setFormData({ ...formData, inn: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-contact">Контактное лицо</Label>
              <Input
                id="edit-contact"
                value={formData.contact_name}
                onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
              />
            </div>
            <Button onClick={handleUpdate} disabled={saving} className="w-full">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Сохранить
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteOrg} onOpenChange={() => setDeleteOrg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить организацию?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить организацию "{deleteOrg?.name}"? Это действие нельзя
              отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
