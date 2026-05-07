import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { getXLSX } from "@/utils/xlsxHelper";

export interface Organization {
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
  credentials?: { login_email: string; login_password: string } | null;
}

interface OrgFormData {
  name: string; email: string; phone: string; inn: string;
  contact_name: string; login_email: string; login_password: string;
}

const emptyForm: OrgFormData = { name: "", email: "", phone: "", inn: "", contact_name: "", login_email: "", login_password: "" };

export function useOrganizationsManager(openOrgId?: string | null, onOpenOrgHandled?: () => void) {
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
  const [showStats, setShowStats] = useState(false);
  const [formData, setFormData] = useState<OrgFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  const filteredOrganizations = organizations.filter((org) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return org.name.toLowerCase().includes(query) || org.email.toLowerCase().includes(query) ||
      (org.inn && org.inn.toLowerCase().includes(query)) || (org.phone && org.phone.toLowerCase().includes(query)) ||
      (org.contact_name && org.contact_name.toLowerCase().includes(query)) ||
      (org.credentials?.login_email && org.credentials.login_email.toLowerCase().includes(query));
  });

  const viewAsOrganization = (org: Organization) => {
    localStorage.setItem("adminViewAsOrg", JSON.stringify({ id: org.id, name: org.name }));
    navigate("/organization");
  };

  const fetchOrganizations = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("organizations").select("*, is_paid, paid_until, tariff_type, monthly_price, subscription_plan, promo_code").order("created_at", { ascending: false });
      if (error) throw error;
      const orgs = (data || []).map(org => ({ ...org, users_count: undefined as number | undefined, courses_count: undefined as number | undefined, credentials: undefined as Organization["credentials"] | undefined }));
      setOrganizations(orgs);
      setLoading(false);
      setDetailsLoading(true);
      const orgIds = orgs.map(o => o.id);
      // Один батч-RPC вместо N отдельных запросов на каждую организацию
      const [profilesRes, coursesRes, credRes] = await Promise.all([
        supabase.from("profiles").select("organization_id").in("organization_id", orgIds),
        supabase.from("courses").select("organization_id").in("organization_id", orgIds),
        supabase.rpc("get_decrypted_org_credentials_batch" as any, { p_organization_ids: orgIds }),
      ]);
      const userCounts: Record<string, number> = {};
      const courseCounts: Record<string, number> = {};
      (profilesRes.data || []).forEach(p => { userCounts[p.organization_id] = (userCounts[p.organization_id] || 0) + 1; });
      (coursesRes.data || []).forEach(c => { courseCounts[c.organization_id] = (courseCounts[c.organization_id] || 0) + 1; });
      const credMap: Record<string, any> = {};
      ((credRes.data as any[]) || []).forEach((row) => {
        credMap[row.organization_id] = { login_email: row.login_email, login_password: row.login_password };
      });
      setOrganizations(prev => prev.map(org => ({ ...org, users_count: userCounts[org.id] || 0, courses_count: courseCounts[org.id] || 0, credentials: credMap[org.id] || null })));
      setDetailsLoading(false);
    } catch (error) {
      console.error("Error fetching organizations:", error);
      toast.error("Ошибка", { description: "Не удалось загрузить организации" });
      setLoading(false); setDetailsLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrganizations(); }, []);

  useEffect(() => {
    if (openOrgId && organizations.length > 0 && !viewingOrg) {
      const org = organizations.find(o => o.id === openOrgId);
      if (org) setViewingOrg(org);
      onOpenOrgHandled?.();
    }
  }, [openOrgId, organizations]);

  const handleCreate = async () => {
    if (!formData.name || !formData.email) { toast.error("Ошибка", { description: "Заполните обязательные поля" }); return; }
    setSaving(true);
    try {
      const { data: newOrg, error } = await supabase.from("organizations").insert({ name: formData.name, email: formData.email, phone: formData.phone || null, inn: formData.inn || null, contact_name: formData.contact_name || null }).select().single();
      if (error) throw error;
      if (formData.login_email && formData.login_password) {
        const { error: userError } = await supabase.functions.invoke("create-org-user", { body: { email: formData.login_email, password: formData.login_password, fullName: formData.contact_name || "Администратор", organizationId: newOrg.id } });
        if (userError) { console.error("Error creating user:", userError); toast.error("Предупреждение", { description: "Организация создана, но не удалось создать пользователя" }); }
        else { await supabase.from("organization_credentials").insert({ organization_id: newOrg.id, login_email: formData.login_email, login_password: formData.login_password }); }
      }
      try { await supabase.functions.invoke("seed-welcome-course", { body: { organizationId: newOrg.id } }); } catch (seedErr) { console.error("Seed welcome course error:", seedErr); }
      toast.success("Успешно", { description: "Организация создана" });
      setIsCreateOpen(false); setFormData(emptyForm); fetchOrganizations();
    } catch (error) { console.error("Error creating organization:", error); toast.error("Ошибка", { description: "Не удалось создать организацию" }); }
    finally { setSaving(false); }
  };

  const handleUpdate = async () => {
    if (!editOrg || !formData.name || !formData.email) { toast.error("Ошибка", { description: "Заполните обязательные поля" }); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("organizations").update({ name: formData.name, email: formData.email, phone: formData.phone || null, inn: formData.inn || null, contact_name: formData.contact_name || null }).eq("id", editOrg.id);
      if (error) throw error;
      toast.success("Успешно", { description: "Организация обновлена" });
      setIsEditOpen(false); setEditOrg(null); setFormData(emptyForm); fetchOrganizations();
    } catch (error) { console.error("Error updating organization:", error); toast.error("Ошибка", { description: "Не удалось обновить организацию" }); }
    finally { setSaving(false); }
  };

  const deleteOrgById = async (orgId: string) => {
      const { data: courses } = await supabase.from("courses").select("id").eq("organization_id", orgId);
      const courseIds = (courses || []).map((c) => c.id);
      await supabase.from("marketplace_orders").delete().eq("buyer_organization_id", orgId);
      if (courseIds.length > 0) {
        const { data: mpCourses } = await supabase.from("marketplace_courses").select("id").eq("organization_id", orgId);
        const mpCourseIds = (mpCourses || []).map((c) => c.id);
        if (mpCourseIds.length > 0) { await supabase.from("marketplace_orders").delete().in("marketplace_course_id", mpCourseIds); await supabase.from("marketplace_course_comments").delete().in("marketplace_course_id", mpCourseIds); }
        await supabase.from("enrollments").delete().in("course_id", courseIds);
        await supabase.from("course_reminders").delete().in("course_id", courseIds);
        await supabase.from("course_documents").delete().in("course_id", courseIds);
        await supabase.from("course_access_log").delete().in("course_id", courseIds);
        await supabase.from("lessons").delete().in("course_id", courseIds);
        await supabase.from("courses").delete().eq("organization_id", orgId);
      }
      const { data: companies } = await supabase.from("companies").select("id").eq("organization_id", orgId);
      const companyIds = (companies || []).map((c) => c.id);
      if (companyIds.length > 0) {
        await supabase.from("company_requests").delete().in("company_id", companyIds);
        await supabase.from("company_documents").delete().in("company_id", companyIds);
        await supabase.from("training_plans").delete().in("company_id", companyIds);
        await supabase.from("companies").delete().eq("organization_id", orgId);
      }
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
      const { error } = await supabase.from("organizations").delete().eq("id", orgId);
      if (error) throw error;
      toast.success("Успешно", { description: "Организация удалена" });
      setDeleteOrg(null); fetchOrganizations();
    } catch (error) { console.error("Error deleting organization:", error); toast.error("Ошибка", { description: "Не удалось удалить организацию. Проверьте консоль для деталей." }); }
  };

  const openEdit = (org: Organization) => {
    setEditOrg(org);
    setFormData({ name: org.name, email: org.email, phone: org.phone || "", inn: org.inn || "", contact_name: org.contact_name || "", login_email: org.credentials?.login_email || "", login_password: org.credentials?.login_password || "" });
    setIsEditOpen(true);
  };

  const togglePassword = (orgId: string) => setShowPasswords(prev => ({ ...prev, [orgId]: !prev[orgId] }));

  const copyToClipboard = async (text: string, fieldId: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 10; i++) password += chars.charAt(Math.floor(Math.random() * chars.length));
    return password;
  };

  const handleResetPassword = async () => {
    if (!resetPasswordOrg || !newPassword) { toast.error("Ошибка", { description: "Введите новый пароль" }); return; }
    if (newPassword.length < 6) { toast.error("Ошибка", { description: "Пароль должен быть не менее 6 символов" }); return; }
    setResettingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke("reset-org-password", { body: { organization_id: resetPasswordOrg.id, new_password: newPassword } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Успешно", { description: "Пароль изменён" });
      setResetPasswordOrg(null); setNewPassword(""); fetchOrganizations();
    } catch (error) { console.error("Error resetting password:", error); toast.error("Ошибка", { description: getErrorMessage(error, "Не удалось сбросить пароль") }); }
    finally { setResettingPassword(false); }
  };

  const handleGenerateCredentials = async (org: Organization) => {
    setGeneratingCredentials(org.id);
    try {
      const { data, error } = await supabase.functions.invoke("generate-org-credentials", { body: { organization_id: org.id } });
      if (error) throw error;
      toast.success("Успешно", { description: `Учётные данные созданы: ${data.login_email}` });
      fetchOrganizations();
    } catch (error) { console.error("Error generating credentials:", error); toast.error("Ошибка", { description: "Не удалось создать учётные данные" }); }
    finally { setGeneratingCredentials(null); }
  };

  const exportToExcel = async () => {
    const XLSX = await getXLSX();
    const data = organizations.map((org, index) => ({
      "№": index + 1, "Название": org.name, "ИНН": org.inn || "",
      "Email организации": org.email, "Телефон": org.phone || "",
      "Контактное лицо": org.contact_name || "",
      "Логин для входа": org.credentials?.login_email || "",
      "Пароль": org.credentials?.login_password || "",
      "Сотрудников": org.users_count || 0, "Курсов": org.courses_count || 0,
      "Дата создания": format(new Date(org.created_at), "dd.MM.yyyy", { locale: ru }),
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    worksheet["!cols"] = [{ wch: 5 }, { wch: 30 }, { wch: 15 }, { wch: 25 }, { wch: 18 }, { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 15 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Организации");
    XLSX.writeFile(workbook, `Организации_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
    toast.success("Успешно", { description: "Файл скачан" });
  };

  return {
    organizations, filteredOrganizations, loading, detailsLoading,
    isCreateOpen, setIsCreateOpen, isEditOpen, setIsEditOpen,
    deleteOrg, setDeleteOrg, editOrg, viewingOrg, setViewingOrg,
    resetPasswordOrg, setResetPasswordOrg, newPassword, setNewPassword,
    resettingPassword, generatingCredentials,
    showPasswords, copiedField, searchQuery, setSearchQuery,
    viewMode, setViewMode, showStats, setShowStats,
    formData, setFormData, saving,
    handleCreate, handleUpdate, handleDelete, openEdit,
    togglePassword, copyToClipboard, generatePassword,
    handleResetPassword, handleGenerateCredentials,
    viewAsOrganization, exportToExcel, fetchOrganizations,
  };
}
