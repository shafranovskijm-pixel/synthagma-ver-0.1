import { useState, useEffect, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Pencil, Trash2, Building2, Loader2, Users, BookOpen, Key, Eye, EyeOff, Copy, Check, Download, ExternalLink, Search, X, FolderOpen, DollarSign, Calendar, RefreshCw, Mail, Phone, Crown, LayoutGrid, List } from "lucide-react";
import { getPlanInfo, type SubscriptionPlan } from "@/constants/subscriptionPlans";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { getXLSX } from "@/utils/xlsxHelper";
import { OrganizationDetailsView } from "./OrganizationDetailsView";
import { toast } from "sonner";

interface Organization {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  inn: string | null;
  contact_name: string | null;
  ai_enabled: boolean;
  ai_provider?: string;
  created_at: string;
  subscription_plan?: string;
  promo_code?: string | null;
  is_paid?: boolean;
  paid_until?: string | null;
  tariff_type?: string;
  monthly_price?: number;
  users_count?: number;
  courses_count?: number;
  credentials?: {
    login_email: string;
    login_password: string;
  } | null;
}

export function OrganizationsManager() {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [deleteOrg, setDeleteOrg] = useState<Organization | null>(null);
  const [editOrg, setEditOrg] = useState<Organization | null>(null);
  const [viewingOrg, setViewingOrg] = useState<Organization | null>(null);
  const [resetPasswordOrg, setResetPasswordOrg] = useState<Organization | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);
  const [generatingCredentials, setGeneratingCredentials] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
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
  // Filter organizations based on search query
  const filteredOrganizations = organizations.filter((org) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      org.name.toLowerCase().includes(query) ||
      org.email.toLowerCase().includes(query) ||
      (org.inn && org.inn.toLowerCase().includes(query)) ||
      (org.phone && org.phone.toLowerCase().includes(query)) ||
      (org.contact_name && org.contact_name.toLowerCase().includes(query)) ||
      (org.credentials?.login_email && org.credentials.login_email.toLowerCase().includes(query))
    );
  });

  const viewAsOrganization = (org: Organization) => {
    // Store admin view context in localStorage
    localStorage.setItem("adminViewAsOrg", JSON.stringify({
      id: org.id,
      name: org.name,
    }));
    navigate("/organization");
  };

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      // Phase 1: Load org list immediately
      const { data, error } = await supabase
        .from("organizations")
        .select("*, is_paid, paid_until, tariff_type, monthly_price, subscription_plan, promo_code")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const orgs = (data || []).map(org => ({
        ...org,
        users_count: undefined as number | undefined,
        courses_count: undefined as number | undefined,
        credentials: undefined as Organization["credentials"] | undefined,
      }));

      setOrganizations(orgs);
      setLoading(false);

      // Phase 2: Load aggregated counts + credentials in background
      setDetailsLoading(true);
      const orgIds = orgs.map(o => o.id);

      const [profilesRes, coursesRes, ...credResults] = await Promise.all([
        // One query for all profile counts
        supabase.from("profiles").select("organization_id").in("organization_id", orgIds),
        // One query for all course counts
        supabase.from("courses").select("organization_id").in("organization_id", orgIds),
        // Batch credentials for all orgs
        ...orgIds.map(id =>
          supabase.rpc("get_decrypted_org_credentials", { p_organization_id: id })
            .then(res => ({ orgId: id, data: res.data?.[0] || null }))
        ),
      ]);

      // Aggregate counts
      const userCounts: Record<string, number> = {};
      const courseCounts: Record<string, number> = {};
      (profilesRes.data || []).forEach(p => {
        userCounts[p.organization_id] = (userCounts[p.organization_id] || 0) + 1;
      });
      (coursesRes.data || []).forEach(c => {
        courseCounts[c.organization_id] = (courseCounts[c.organization_id] || 0) + 1;
      });

      // Build credentials map
      const credMap: Record<string, any> = {};
      credResults.forEach((cr: any) => {
        credMap[cr.orgId] = cr.data;
      });

      // Merge into state
      setOrganizations(prev =>
        prev.map(org => ({
          ...org,
          users_count: userCounts[org.id] || 0,
          courses_count: courseCounts[org.id] || 0,
          credentials: credMap[org.id] || null,
        }))
      );
      setDetailsLoading(false);
    } catch (error) {
      console.error("Error fetching organizations:", error);
      toast.error("Ошибка", { description: "Не удалось загрузить организации" });
      setLoading(false);
      setDetailsLoading(false);
    }
  };




  const handleCreate = async () => {
    if (!formData.name || !formData.email) {
      toast.error("Ошибка", { description: "Заполните обязательные поля" });
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
          toast.error("Предупреждение", { description: "Организация создана, но не удалось создать пользователя" });
        } else {
          // Save credentials for admin reference
          await supabase.from("organization_credentials").insert({
            organization_id: newOrg.id,
            login_email: formData.login_email,
            login_password: formData.login_password,
          });
        }
      }

      // Seed welcome course (non-blocking)
      try {
        await supabase.functions.invoke("seed-welcome-course", {
          body: { organizationId: newOrg.id },
        });
      } catch (seedErr) {
        console.error("Seed welcome course error:", seedErr);
      }

      toast.success("Успешно", { description: "Организация создана" });
      setIsCreateOpen(false);
      setFormData({ name: "", email: "", phone: "", inn: "", contact_name: "", login_email: "", login_password: "" });
      fetchOrganizations();
    } catch (error) {
      console.error("Error creating organization:", error);
      toast.error("Ошибка", { description: "Не удалось создать организацию" });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editOrg || !formData.name || !formData.email) {
      toast.error("Ошибка", { description: "Заполните обязательные поля" });
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

      toast.success("Успешно", { description: "Организация обновлена" });
      setIsEditOpen(false);
      setEditOrg(null);
      setFormData({ name: "", email: "", phone: "", inn: "", contact_name: "", login_email: "", login_password: "" });
      fetchOrganizations();
    } catch (error) {
      console.error("Error updating organization:", error);
      toast.error("Ошибка", { description: "Не удалось обновить организацию" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteOrg) return;

    try {
      const orgId = deleteOrg.id;

      // 1. Get all course IDs for this organization
      const { data: courses } = await supabase
        .from("courses")
        .select("id")
        .eq("organization_id", orgId);
      const courseIds = (courses || []).map((c) => c.id);

      // 2. Delete marketplace orders referencing this org as buyer
      await supabase.from("marketplace_orders").delete().eq("buyer_organization_id", orgId);

      if (courseIds.length > 0) {
        // 3. Delete marketplace orders linked to marketplace_courses of this org
        const { data: mpCourses } = await supabase
          .from("marketplace_courses")
          .select("id")
          .eq("organization_id", orgId);
        const mpCourseIds = (mpCourses || []).map((c) => c.id);
        if (mpCourseIds.length > 0) {
          await supabase.from("marketplace_orders").delete().in("marketplace_course_id", mpCourseIds);
          await supabase.from("marketplace_course_comments").delete().in("marketplace_course_id", mpCourseIds);
        }

        // 4. Delete enrollments linked to these courses
        await supabase.from("enrollments").delete().in("course_id", courseIds);
        // 5. Delete course_reminders linked to these courses
        await supabase.from("course_reminders").delete().in("course_id", courseIds);
        // 6. Delete course_documents linked to these courses
        await supabase.from("course_documents").delete().in("course_id", courseIds);
        // 7. Delete course_access_log linked to these courses
        await supabase.from("course_access_log").delete().in("course_id", courseIds);
        // 8. Delete lessons linked to these courses
        await supabase.from("lessons").delete().in("course_id", courseIds);
        // 9. Delete courses
        await supabase.from("courses").delete().eq("organization_id", orgId);
      }

      // 7. Delete companies and their documents
      const { data: companies } = await supabase
        .from("companies")
        .select("id")
        .eq("organization_id", orgId);
      const companyIds = (companies || []).map((c) => c.id);
      if (companyIds.length > 0) {
        await supabase.from("company_requests").delete().in("company_id", companyIds);
        await supabase.from("company_documents").delete().in("company_id", companyIds);
        await supabase.from("training_plans").delete().in("company_id", companyIds);
        await supabase.from("companies").delete().eq("organization_id", orgId);
      }

      // 8. Delete other related records
      await Promise.all([
        supabase.from("profiles").delete().eq("organization_id", orgId),
        supabase.from("registration_links").delete().eq("organization_id", orgId),
        supabase.from("organization_credentials").delete().eq("organization_id", orgId),
        supabase.from("org_documents").delete().eq("organization_id", orgId),
        supabase.from("org_notifications").delete().eq("organization_id", orgId),
        supabase.from("organization_comments").delete().eq("organization_id", orgId),
        supabase.from("audit_logs").delete().eq("organization_id", orgId),
        supabase.from("consent_documents").delete().eq("organization_id", orgId),
        supabase.from("course_categories").delete().eq("organization_id", orgId),
        supabase.from("journal_instances").delete().eq("organization_id", orgId),
        supabase.from("library_folders").delete().eq("organization_id", orgId),
        supabase.from("library_documents").delete().eq("organization_id", orgId),
        supabase.from("document_issuance_log").delete().eq("organization_id", orgId),
        supabase.from("education_document_records").delete().eq("organization_id", orgId),
        supabase.from("system_diagnostics").delete().eq("organization_id", orgId),
        supabase.from("organization_feature_categories").delete().eq("organization_id", orgId),
        supabase.from("organization_feature_usage").delete().eq("organization_id", orgId),
        supabase.from("organization_features").delete().eq("organization_id", orgId),
        supabase.from("marketplace_courses").delete().eq("organization_id", orgId),
        supabase.from("labor_safety_groups").delete().eq("organization_id", orgId),
        supabase.from("labor_safety_profiles").delete().eq("organization_id", orgId),
        supabase.from("student_groups").delete().eq("organization_id", orgId),
        supabase.from("testimonials").delete().eq("organization_id", orgId),
        supabase.from("student_consents").delete().eq("organization_id", orgId),
        supabase.from("program_categories").delete().eq("organization_id", orgId),
        supabase.from("balance_transactions").delete().eq("organization_id", orgId),
        supabase.from("ai_usage_log").delete().eq("organization_id", orgId),
        supabase.from("admin_org_messages").delete().eq("organization_id", orgId),
        supabase.from("course_access_log").delete().eq("organization_id", orgId),
        supabase.from("course_requests").delete().eq("organization_id", orgId),
        supabase.from("org_billing_documents").delete().eq("organization_id", orgId),
        supabase.from("student_login_history").delete().eq("organization_id", orgId),
        supabase.from("knowledge_bank").delete().eq("organization_id", orgId),
      ]);

      // 9. Finally delete the organization itself
      const { error } = await supabase.from("organizations").delete().eq("id", orgId);
      if (error) throw error;

      toast.success("Успешно", { description: "Организация удалена" });
      setDeleteOrg(null);
      fetchOrganizations();
    } catch (error) {
      console.error("Error deleting organization:", error);
      toast.error("Ошибка", { description: "Не удалось удалить организацию. Проверьте консоль для деталей." });
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

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const handleResetPassword = async () => {
    if (!resetPasswordOrg || !newPassword) {
      toast.error("Ошибка", { description: "Введите новый пароль" });
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Ошибка", { description: "Пароль должен быть не менее 6 символов" });
      return;
    }

    setResettingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke("reset-org-password", {
        body: {
          organization_id: resetPasswordOrg.id,
          new_password: newPassword,
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Успешно", { description: "Пароль изменён" });
      setResetPasswordOrg(null);
      setNewPassword("");
      fetchOrganizations();
    } catch (error: any) {
      console.error("Error resetting password:", error);
      toast.error("Ошибка", { description: error?.message || "Не удалось сбросить пароль" });
    } finally {
      setResettingPassword(false);
    }
  };

  const handleGenerateCredentials = async (org: Organization) => {
    setGeneratingCredentials(org.id);
    try {
      const { data, error } = await supabase.functions.invoke("generate-org-credentials", {
        body: { organization_id: org.id }
      });

      if (error) throw error;

      toast.success("Успешно", { description: `Учётные данные созданы: ${data.login_email}` });
      fetchOrganizations();
    } catch (error) {
      console.error("Error generating credentials:", error);
      toast.error("Ошибка", { description: "Не удалось создать учётные данные" });
    } finally {
      setGeneratingCredentials(null);
    }
  };

  const exportToExcel = async () => {
    const XLSX = await getXLSX();
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
    
    toast.success("Успешно", { description: "Файл скачан" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show organization details view if selected
  if (viewingOrg) {
    return (
      <OrganizationDetailsView
        organization={viewingOrg}
        onBack={() => {
          setViewingOrg(null);
          fetchOrganizations(); // Refresh data when returning
        }}
      />
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="transition-transform hover:scale-[1.02]">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                <Building2 className="w-3.5 h-3.5 text-primary" />
              </div>
              Всего организаций
            </CardDescription>
            <CardTitle className="text-3xl">{organizations.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-green-500/30 bg-green-500/5 transition-transform hover:scale-[1.02]">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-md bg-green-500/10 flex items-center justify-center">
                <DollarSign className="w-3.5 h-3.5 text-green-600" />
              </div>
              С оплатой
            </CardDescription>
            <CardTitle className="text-3xl text-green-600">
              {organizations.filter(o => o.is_paid).length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-orange-500/30 bg-orange-500/5 transition-transform hover:scale-[1.02]">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-md bg-orange-500/10 flex items-center justify-center">
                <Building2 className="w-3.5 h-3.5 text-orange-600" />
              </div>
              Без оплаты
            </CardDescription>
            <CardTitle className="text-3xl text-orange-600">
              {organizations.filter(o => !o.is_paid).length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="transition-transform hover:scale-[1.02]">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center">
                <Users className="w-3.5 h-3.5 text-blue-600" />
              </div>
              Всего сотрудников
            </CardDescription>
            <CardTitle className="text-3xl">
              {organizations.reduce((acc, org) => acc + (org.users_count || 0), 0)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="transition-transform hover:scale-[1.02]">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-md bg-purple-500/10 flex items-center justify-center">
                <BookOpen className="w-3.5 h-3.5 text-purple-600" />
              </div>
              Всего курсов
            </CardDescription>
            <CardTitle className="text-3xl">
              {organizations.reduce((acc, org) => acc + (org.courses_count || 0), 0)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Search + View Toggle */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по названию, email, ИНН, телефону..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setSearchQuery("")}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center border rounded-lg overflow-hidden">
          <Button variant={viewMode === 'grid' ? 'default' : 'ghost'} size="icon" className="h-8 w-8 rounded-none" onClick={() => setViewMode('grid')}>
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="icon" className="h-8 w-8 rounded-none" onClick={() => setViewMode('list')}>
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Organizations */}
      {filteredOrganizations.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>{searchQuery ? "Ничего не найдено" : "Организации не найдены"}</p>
        </div>
      ) : viewMode === 'list' ? (
        /* LIST VIEW */
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Организация</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Контакты</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Статистика</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrganizations.map((org) => (
                <tr key={org.id} className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors border-l-4 ${org.is_paid ? 'border-l-green-500' : 'border-l-orange-500'}`}>
                  {/* Name + Tariff */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setViewingOrg(org)}>
                      <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-primary-foreground ${org.is_paid ? 'bg-green-500' : 'bg-orange-500'}`}>
                        {org.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm hover:underline truncate max-w-[200px]">{org.name}</span>
                          {org.subscription_plan && org.subscription_plan !== 'free' && (
                            <Badge variant="secondary" className="text-[10px] gap-0.5 px-1.5 py-0 h-4 flex-shrink-0">
                              <Crown className="w-2.5 h-2.5" />
                              {getPlanInfo(org.subscription_plan as SubscriptionPlan).name}
                            </Badge>
                          )}
                        </div>
                        {org.inn && <div className="text-xs text-muted-foreground">ИНН: {org.inn}</div>}
                      </div>
                    </div>
                  </td>
                  {/* Contacts */}
                  <td className="px-4 py-3">
                    <div className="text-xs space-y-0.5">
                      <div className="flex items-center gap-1.5 truncate max-w-[200px]">
                        <Mail className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <span className="truncate">{org.email}</span>
                      </div>
                      {org.phone && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="w-3 h-3 flex-shrink-0" />
                          <span>{org.phone}</span>
                        </div>
                      )}
                    </div>
                  </td>
                  {/* Stats */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="gap-1 text-xs"><Users className="w-3 h-3" />{org.users_count ?? 0}</Badge>
                      <Badge variant="secondary" className="gap-1 text-xs"><BookOpen className="w-3 h-3" />{org.courses_count ?? 0}</Badge>
                    </div>
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="outline" size="sm" onClick={() => setViewingOrg(org)} className="text-xs h-7">
                        <FolderOpen className="w-3.5 h-3.5 mr-1" />
                        Просмотр
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => viewAsOrganization(org)} className="text-xs h-7">
                        <ExternalLink className="w-3.5 h-3.5 mr-1" />
                        Войти как
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(org)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteOrg(org)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredOrganizations.map((org) => (
            <Card
              key={org.id}
              className={`transition-all hover:shadow-lg border-l-4 ${org.is_paid ? 'border-l-green-500' : 'border-l-orange-500'}`}
            >
              {/* Header: Avatar + Name + Status */}
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div
                    className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity min-w-0 flex-1"
                    onClick={() => setViewingOrg(org)}
                  >
                    <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-white ${org.is_paid ? 'bg-green-500' : 'bg-orange-500'}`}>
                      {org.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-primary hover:underline truncate">{org.name}</div>
                      {org.inn && (
                        <div className="text-xs text-muted-foreground">ИНН: {org.inn}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {org.is_paid ? (
                      <Badge className="bg-green-500 hover:bg-green-600 text-xs">
                        <DollarSign className="w-3 h-3 mr-0.5" />
                        Оплачено
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-orange-500 text-orange-600 text-xs">
                        Без оплаты
                      </Badge>
                    )}
                    {org.tariff_type && org.tariff_type !== 'trial' && (
                      <Badge variant="secondary" className="text-xs">
                        <Calendar className="w-3 h-3 mr-0.5" />
                        {org.tariff_type === 'yearly' ? 'Год' : 'Мес'}
                      </Badge>
                    )}
                  </div>
                </div>
                {(org.promo_code || org.paid_until) && (
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {org.promo_code && (
                      <Badge variant="outline" className="text-xs border-green-500 text-green-600">
                        🎟 {org.promo_code}
                      </Badge>
                    )}
                    {org.paid_until && (
                      <span className="text-xs text-muted-foreground">
                        до {format(new Date(org.paid_until), "d MMM yyyy", { locale: ru })}
                      </span>
                    )}
                  </div>
                )}
              </CardHeader>

              {/* Body: Contacts + Credentials */}
              <CardContent className="pb-3 space-y-3">
                {/* Contacts */}
                <div className="text-sm space-y-1">
                  <div className="flex items-center gap-2 truncate">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">{org.email}</span>
                  </div>
                  {org.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{org.phone}</span>
                    </div>
                  )}
                </div>

                {/* Credentials — mini-card */}
                <div className="bg-muted/50 rounded-lg p-2.5">
                  {org.credentials === undefined && detailsLoading ? (
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  ) : org.credentials ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <Key className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs font-mono truncate">{org.credentials.login_email}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 flex-shrink-0"
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
                        <span className="text-xs font-mono text-muted-foreground ml-4">
                          {showPasswords[org.id] ? org.credentials.login_password : '••••••••'}
                        </span>
                        <Button variant="ghost" size="icon" className="h-5 w-5 flex-shrink-0" onClick={() => togglePassword(org.id)}>
                          {showPasswords[org.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-5 w-5 flex-shrink-0" onClick={() => copyToClipboard(org.credentials!.login_password, `pass-${org.id}`)}>
                          {copiedField === `pass-${org.id}` ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 flex-shrink-0"
                          onClick={() => { setResetPasswordOrg(org); setNewPassword(generatePassword()); }}
                          title="Сбросить пароль"
                        >
                          <RefreshCw className="w-3 h-3 text-orange-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 flex-shrink-0"
                          title="Скопировать всё"
                          onClick={() => {
                            const text = `Логин: ${org.credentials!.login_email}\nПароль: ${org.credentials!.login_password}`;
                            copyToClipboard(text, `all-${org.id}`);
                          }}
                        >
                          {copiedField === `all-${org.id}` ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-primary" />}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleGenerateCredentials(org)}
                      disabled={generatingCredentials === org.id}
                      className="text-xs w-full"
                    >
                      {generatingCredentials === org.id ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : (
                        <Key className="w-3 h-3 mr-1" />
                      )}
                      Создать учётные данные
                    </Button>
                  )}
                </div>
              </CardContent>

              {/* Footer: Stats + Actions */}
              <div className="flex items-center justify-between px-6 pb-4">
                <div className="flex items-center gap-2">
                  {org.users_count === undefined && detailsLoading ? (
                    <>
                      <Skeleton className="h-5 w-12 rounded-full" />
                      <Skeleton className="h-5 w-12 rounded-full" />
                    </>
                  ) : (
                    <>
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <Users className="w-3 h-3" />
                        {org.users_count ?? 0}
                      </Badge>
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <BookOpen className="w-3 h-3" />
                        {org.courses_count ?? 0}
                      </Badge>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => setViewingOrg(org)} className="text-xs">
                    <FolderOpen className="w-3.5 h-3.5 mr-1" />
                    Просмотр
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => viewAsOrganization(org)} className="text-xs">
                    <ExternalLink className="w-3.5 h-3.5 mr-1" />
                    Войти как
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(org)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteOrg(org)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

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

      {/* Reset Password Dialog */}
      <Dialog open={!!resetPasswordOrg} onOpenChange={() => { setResetPasswordOrg(null); setNewPassword(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Сброс пароля организации</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium">{resetPasswordOrg?.name}</p>
              <p className="text-xs text-muted-foreground">{resetPasswordOrg?.credentials?.login_email}</p>
            </div>
            <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
              <p className="text-xs text-orange-700 dark:text-orange-400">
                Если текущий пароль не работает — сбросьте его здесь. 
                Новый пароль будет синхронизирован с системой авторизации.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Новый пароль</Label>
              <div className="flex gap-2">
                <Input
                  id="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNewPassword(generatePassword())}
                  title="Сгенерировать пароль"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => copyToClipboard(newPassword, 'new-pass')}
                  title="Копировать"
                >
                  {copiedField === 'new-pass' ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
            <Button onClick={handleResetPassword} disabled={resettingPassword} className="w-full">
              {resettingPassword ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Сохранить и синхронизировать пароль
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
