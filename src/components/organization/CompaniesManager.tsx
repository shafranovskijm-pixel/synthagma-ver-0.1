import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Building2,
  Plus,
  Search,
  Edit,
  Trash2,
  Loader2,
  Users,
  FileSpreadsheet,
  Eye,
  Mail,
  GraduationCap,
  UserPlus,
  Check,
  Link2,
  Copy,
  BookOpen,
  FileText,
  Receipt,
  FileCheck,
  BarChart3,
  TrendingUp,
  Calendar,
  ChevronRight,
  Upload,
  Download,
  X,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import * as XLSX from "xlsx";
import { Progress } from "@/components/ui/progress";

interface Company {
  id: string;
  name: string;
  inn: string | null;
  created_at: string;
  studentsCount?: number;
}

interface CompanyDocument {
  id: string;
  company_id: string;
  type: 'contract' | 'invoice' | 'act' | 'other';
  name: string;
  file_url: string | null;
  file_path: string | null;
  file_size: number | null;
  uploaded_at: string;
}

interface CompanyStudent {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  enrollments: {
    course_title: string;
    progress: number;
    status: string;
  }[];
}

interface CompaniesManagerProps {
  organizationId: string;
}

export function CompaniesManager({ organizationId }: CompaniesManagerProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Create dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyInn, setNewCompanyInn] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Edit dialog
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editCompanyInn, setEditCompanyInn] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Delete confirm
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Students dialog
  const [showStudentsDialog, setShowStudentsDialog] = useState(false);
  const [selectedCompanyForStudents, setSelectedCompanyForStudents] = useState<Company | null>(null);
  const [companyStudents, setCompanyStudents] = useState<CompanyStudent[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState("");

  // Bulk assign students dialog
  const [showBulkAssignDialog, setShowBulkAssignDialog] = useState(false);
  const [selectedCompanyForAssign, setSelectedCompanyForAssign] = useState<Company | null>(null);
  const [availableStudents, setAvailableStudents] = useState<{ id: string; user_id: string; full_name: string; email: string; company_id: string | null; company_name: string | null }[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [isLoadingAvailableStudents, setIsLoadingAvailableStudents] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignSearchQuery, setAssignSearchQuery] = useState("");
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(false);

  // Registration link dialog
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [selectedCompanyForLink, setSelectedCompanyForLink] = useState<Company | null>(null);
  const [companyLinks, setCompanyLinks] = useState<{ id: string; token: string; name: string | null; expires_at: string | null; used_count: number }[]>([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [newLinkName, setNewLinkName] = useState("");
  const [newLinkExpiresDays, setNewLinkExpiresDays] = useState("");
  const [isCreatingLink, setIsCreatingLink] = useState(false);

  // Bulk enroll to courses dialog
  const [showBulkEnrollDialog, setShowBulkEnrollDialog] = useState(false);
  const [selectedCompanyForEnroll, setSelectedCompanyForEnroll] = useState<Company | null>(null);
  const [availableCourses, setAvailableCourses] = useState<{ id: string; title: string; is_published: boolean }[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);

  // Company detail dialog
  const [showCompanyDetail, setShowCompanyDetail] = useState(false);
  const [selectedCompanyForDetail, setSelectedCompanyForDetail] = useState<Company | null>(null);
  const [companyDocuments, setCompanyDocuments] = useState<CompanyDocument[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState<string | null>(null);
  const [isDeletingDocument, setIsDeletingDocument] = useState<string | null>(null);

  const handleOpenCompanyDetail = async (company: Company) => {
    setSelectedCompanyForDetail(company);
    setShowCompanyDetail(true);
    await fetchCompanyDocuments(company.id);
  };

  const fetchCompanyDocuments = async (companyId: string) => {
    setIsLoadingDocuments(true);
    try {
      const { data, error } = await supabase
        .from("company_documents")
        .select("*")
        .eq("company_id", companyId)
        .order("uploaded_at", { ascending: false });

      if (error) throw error;
      setCompanyDocuments((data || []) as CompanyDocument[]);
    } catch (error) {
      console.error("Error fetching documents:", error);
    } finally {
      setIsLoadingDocuments(false);
    }
  };

  const handleUploadDocument = async (type: 'contract' | 'invoice' | 'act', file: File) => {
    if (!selectedCompanyForDetail) return;
    
    setIsUploadingDocument(type);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${type}_${Date.now()}.${fileExt}`;
      const filePath = `${selectedCompanyForDetail.id}/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("company-documents")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("company-documents")
        .getPublicUrl(filePath);

      // Save to database
      const { error: dbError } = await supabase
        .from("company_documents")
        .insert({
          company_id: selectedCompanyForDetail.id,
          type,
          name: file.name,
          file_url: urlData.publicUrl,
          file_path: filePath,
          file_size: file.size,
        });

      if (dbError) throw dbError;

      toast.success("Документ загружен");
      await fetchCompanyDocuments(selectedCompanyForDetail.id);
    } catch (error) {
      console.error("Error uploading document:", error);
      toast.error("Ошибка загрузки документа");
    } finally {
      setIsUploadingDocument(null);
    }
  };

  const handleDeleteDocument = async (doc: CompanyDocument) => {
    if (!selectedCompanyForDetail) return;
    
    setIsDeletingDocument(doc.id);
    try {
      // Delete from storage
      if (doc.file_path) {
        const { error: storageError } = await supabase.storage
          .from("company-documents")
          .remove([doc.file_path]);

        if (storageError) {
          console.error("Storage delete error:", storageError);
        }
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from("company_documents")
        .delete()
        .eq("id", doc.id);

      if (dbError) throw dbError;

      toast.success("Документ удалён");
      await fetchCompanyDocuments(selectedCompanyForDetail.id);
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Ошибка удаления документа");
    } finally {
      setIsDeletingDocument(null);
    }
  };

  const handleViewDocument = async (doc: CompanyDocument) => {
    if (!doc.file_path) {
      toast.error("Файл не найден");
      return;
    }

    try {
      // Create signed URL for private bucket (valid for 1 hour)
      const { data, error } = await supabase.storage
        .from("company-documents")
        .createSignedUrl(doc.file_path, 3600);

      if (error) throw error;

      // Open in new tab
      window.open(data.signedUrl, '_blank');
    } catch (error) {
      console.error("Error viewing document:", error);
      toast.error("Ошибка открытия документа");
    }
  };

  const handleDownloadDocument = async (doc: CompanyDocument) => {
    if (!doc.file_path) return;

    try {
      const { data, error } = await supabase.storage
        .from("company-documents")
        .download(doc.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading document:", error);
      toast.error("Ошибка скачивания документа");
    }
  };

  const getDocumentsByType = (type: 'contract' | 'invoice' | 'act') => {
    return companyDocuments.filter(doc => doc.type === type);
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const fetchCompanies = async () => {
    setIsLoading(true);
    try {
      const { data: companiesData, error } = await supabase
        .from("companies")
        .select("*")
        .eq("organization_id", organizationId)
        .order("name");

      if (error) throw error;

      // Get student counts for each company
      const companiesWithStats = await Promise.all(
        (companiesData || []).map(async (company) => {
          const { count } = await supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .eq("company_id", company.id);

          return {
            ...company,
            studentsCount: count || 0,
          };
        })
      );

      setCompanies(companiesWithStats);
    } catch (error) {
      console.error("Error fetching companies:", error);
      toast.error("Ошибка загрузки компаний");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (organizationId) {
      fetchCompanies();
    }
  }, [organizationId]);

  const handleCreate = async () => {
    if (!newCompanyName.trim()) {
      toast.error("Введите название компании");
      return;
    }

    setIsCreating(true);
    try {
      const { error } = await supabase.from("companies").insert({
        organization_id: organizationId,
        name: newCompanyName.trim(),
        inn: newCompanyInn.trim() || null,
      });

      if (error) throw error;

      toast.success("Компания создана");
      setShowCreateDialog(false);
      setNewCompanyName("");
      setNewCompanyInn("");
      fetchCompanies();
    } catch (error) {
      console.error("Error creating company:", error);
      toast.error("Ошибка создания компании");
    } finally {
      setIsCreating(false);
    }
  };

  const handleEdit = (company: Company) => {
    setEditingCompany(company);
    setEditCompanyName(company.name);
    setEditCompanyInn(company.inn || "");
    setShowEditDialog(true);
  };

  const handleSave = async () => {
    if (!editingCompany || !editCompanyName.trim()) {
      toast.error("Введите название компании");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({
          name: editCompanyName.trim(),
          inn: editCompanyInn.trim() || null,
        })
        .eq("id", editingCompany.id);

      if (error) throw error;

      toast.success("Компания обновлена");
      setShowEditDialog(false);
      setEditingCompany(null);
      fetchCompanies();
    } catch (error) {
      console.error("Error saving company:", error);
      toast.error("Ошибка сохранения");
    } finally {
      setIsSaving(false);
    }
  };

  const handleViewStudents = async (company: Company) => {
    setSelectedCompanyForStudents(company);
    setShowStudentsDialog(true);
    setIsLoadingStudents(true);
    setStudentSearchQuery("");

    try {
      // Fetch profiles for this company
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email")
        .eq("company_id", company.id);

      if (error) throw error;

      // Fetch enrollments for each profile
      const studentsWithEnrollments: CompanyStudent[] = await Promise.all(
        (profiles || []).map(async (profile) => {
          const { data: enrollments } = await supabase
            .from("enrollments")
            .select("course_id, progress, status")
            .eq("user_id", profile.user_id);

          // Get course titles
          const enrollmentsWithTitles = await Promise.all(
            (enrollments || []).map(async (enrollment) => {
              const { data: course } = await supabase
                .from("courses")
                .select("title")
                .eq("id", enrollment.course_id)
                .single();

              return {
                course_title: course?.title || "Неизвестный курс",
                progress: enrollment.progress || 0,
                status: enrollment.status || "active",
              };
            })
          );

          return {
            id: profile.id,
            user_id: profile.user_id,
            full_name: profile.full_name || "Без имени",
            email: profile.email || "",
            enrollments: enrollmentsWithTitles,
          };
        })
      );

      setCompanyStudents(studentsWithEnrollments);
    } catch (error) {
      console.error("Error fetching company students:", error);
      toast.error("Ошибка загрузки учеников");
    } finally {
      setIsLoadingStudents(false);
    }
  };

  const filteredCompanyStudents = companyStudents.filter(
    (s) =>
      s.full_name.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(studentSearchQuery.toLowerCase())
  );

  const handleOpenBulkAssign = async (company: Company) => {
    setSelectedCompanyForAssign(company);
    setShowBulkAssignDialog(true);
    setSelectedStudentIds([]);
    setAssignSearchQuery("");
    setShowOnlyUnassigned(false);
    setIsLoadingAvailableStudents(true);

    try {
      // Fetch all profiles in this organization
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email, company_id")
        .eq("organization_id", organizationId);

      if (error) throw error;

      // Get company names for profiles that have a company_id
      const studentsWithCompanyNames = await Promise.all(
        (profiles || []).map(async (profile) => {
          let companyName: string | null = null;
          if (profile.company_id) {
            const { data: companyData } = await supabase
              .from("companies")
              .select("name")
              .eq("id", profile.company_id)
              .single();
            companyName = companyData?.name || null;
          }
          return {
            id: profile.id,
            user_id: profile.user_id,
            full_name: profile.full_name || "Без имени",
            email: profile.email || "",
            company_id: profile.company_id,
            company_name: companyName,
          };
        })
      );

      setAvailableStudents(studentsWithCompanyNames);
    } catch (error) {
      console.error("Error fetching available students:", error);
      toast.error("Ошибка загрузки учеников");
    } finally {
      setIsLoadingAvailableStudents(false);
    }
  };

  const handleBulkAssign = async () => {
    if (selectedStudentIds.length === 0 || !selectedCompanyForAssign) {
      toast.error("Выберите учеников для назначения");
      return;
    }

    setIsAssigning(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ company_id: selectedCompanyForAssign.id })
        .in("id", selectedStudentIds);

      if (error) throw error;

      toast.success(`${selectedStudentIds.length} учеников назначены в компанию "${selectedCompanyForAssign.name}"`);
      setShowBulkAssignDialog(false);
      setSelectedStudentIds([]);
      fetchCompanies();
    } catch (error) {
      console.error("Error assigning students:", error);
      toast.error("Ошибка назначения учеников");
    } finally {
      setIsAssigning(false);
    }
  };

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedStudentIds.length === filteredAvailableStudents.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(filteredAvailableStudents.map((s) => s.id));
    }
  };

  const filteredAvailableStudents = availableStudents.filter((s) => {
    const matchesSearch =
      s.full_name.toLowerCase().includes(assignSearchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(assignSearchQuery.toLowerCase());
    const matchesFilter = showOnlyUnassigned ? !s.company_id : true;
    return matchesSearch && matchesFilter;
  });

  // Registration links functions
  const handleOpenLinkDialog = async (company: Company) => {
    setSelectedCompanyForLink(company);
    setShowLinkDialog(true);
    setIsLoadingLinks(true);
    setNewLinkName("");
    setNewLinkExpiresDays("");

    try {
      const { data, error } = await supabase
        .from("registration_links")
        .select("id, token, name, expires_at, used_count")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCompanyLinks(data || []);
    } catch (error) {
      console.error("Error fetching company links:", error);
      toast.error("Ошибка загрузки ссылок");
    } finally {
      setIsLoadingLinks(false);
    }
  };

  const generateToken = () => {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

  const handleCreateCompanyLink = async () => {
    if (!selectedCompanyForLink) return;

    setIsCreatingLink(true);
    try {
      const token = generateToken();
      const expiresAt = newLinkExpiresDays
        ? new Date(Date.now() + parseInt(newLinkExpiresDays) * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const { data, error } = await supabase
        .from("registration_links")
        .insert({
          token,
          name: newLinkName || `Ссылка для ${selectedCompanyForLink.name}`,
          organization_id: organizationId,
          company_id: selectedCompanyForLink.id,
          expires_at: expiresAt,
        })
        .select("id, token, name, expires_at, used_count")
        .single();

      if (error) throw error;

      setCompanyLinks([data, ...companyLinks]);
      setNewLinkName("");
      setNewLinkExpiresDays("");
      toast.success("Ссылка создана");
    } catch (error) {
      console.error("Error creating link:", error);
      toast.error("Ошибка создания ссылки");
    } finally {
      setIsCreatingLink(false);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    try {
      const { error } = await supabase
        .from("registration_links")
        .delete()
        .eq("id", linkId);

      if (error) throw error;

      setCompanyLinks(companyLinks.filter((l) => l.id !== linkId));
      toast.success("Ссылка удалена");
    } catch (error) {
      console.error("Error deleting link:", error);
      toast.error("Ошибка удаления ссылки");
    }
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/join/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Ссылка скопирована");
  };

  const isLinkExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  // Bulk enroll functions
  const handleOpenBulkEnroll = async (company: Company) => {
    setSelectedCompanyForEnroll(company);
    setShowBulkEnrollDialog(true);
    setSelectedCourseIds([]);
    setIsLoadingCourses(true);

    try {
      const { data, error } = await supabase
        .from("courses")
        .select("id, title, is_published")
        .eq("organization_id", organizationId)
        .order("title");

      if (error) throw error;
      setAvailableCourses(data || []);
    } catch (error) {
      console.error("Error fetching courses:", error);
      toast.error("Ошибка загрузки курсов");
    } finally {
      setIsLoadingCourses(false);
    }
  };

  const toggleCourseSelection = (courseId: string) => {
    setSelectedCourseIds((prev) =>
      prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId]
    );
  };

  const handleBulkEnroll = async () => {
    if (!selectedCompanyForEnroll || selectedCourseIds.length === 0) {
      toast.error("Выберите курсы для зачисления");
      return;
    }

    setIsEnrolling(true);
    try {
      // Get all students in this company
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("company_id", selectedCompanyForEnroll.id);

      if (profilesError) throw profilesError;

      if (!profiles || profiles.length === 0) {
        toast.error("В компании нет учеников");
        setIsEnrolling(false);
        return;
      }

      // Get existing enrollments
      const { data: existingEnrollments, error: enrollError } = await supabase
        .from("enrollments")
        .select("user_id, course_id")
        .in("user_id", profiles.map((p) => p.user_id))
        .in("course_id", selectedCourseIds);

      if (enrollError) throw enrollError;

      const existingPairs = new Set(
        (existingEnrollments || []).map((e) => `${e.user_id}-${e.course_id}`)
      );

      // Create new enrollments
      const newEnrollments: { user_id: string; course_id: string; status: string; progress: number }[] = [];
      
      for (const profile of profiles) {
        for (const courseId of selectedCourseIds) {
          const key = `${profile.user_id}-${courseId}`;
          if (!existingPairs.has(key)) {
            newEnrollments.push({
              user_id: profile.user_id,
              course_id: courseId,
              status: "active",
              progress: 0,
            });
          }
        }
      }

      if (newEnrollments.length === 0) {
        toast.info("Все ученики уже зачислены на выбранные курсы");
        setIsEnrolling(false);
        return;
      }

      const { error: insertError } = await supabase
        .from("enrollments")
        .insert(newEnrollments);

      if (insertError) throw insertError;

      toast.success(`${newEnrollments.length} зачислений создано`);
      setShowBulkEnrollDialog(false);
      setSelectedCourseIds([]);
    } catch (error) {
      console.error("Error bulk enrolling:", error);
      toast.error("Ошибка зачисления");
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleDeleteClick = (company: Company) => {
    setDeletingCompany(company);
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    if (!deletingCompany) return;

    setIsDeleting(true);
    try {
      // First, remove company_id from all profiles
      await supabase
        .from("profiles")
        .update({ company_id: null })
        .eq("company_id", deletingCompany.id);

      // Then delete the company
      const { error } = await supabase
        .from("companies")
        .delete()
        .eq("id", deletingCompany.id);

      if (error) throw error;

      toast.success("Компания удалена");
      setShowDeleteConfirm(false);
      setDeletingCompany(null);
      fetchCompanies();
    } catch (error) {
      console.error("Error deleting company:", error);
      toast.error("Ошибка удаления");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = () => {
    const exportData = companies.map((c) => ({
      Название: c.name,
      ИНН: c.inn || "",
      "Кол-во учеников": c.studentsCount || 0,
      "Дата создания": new Date(c.created_at).toLocaleDateString("ru-RU"),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Компании");
    XLSX.writeFile(wb, "companies.xlsx");
    toast.success("Список компаний экспортирован");
  };

  const filteredCompanies = companies.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.inn && c.inn.includes(searchQuery))
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold">Компании</h2>
          <p className="text-muted-foreground">
            Управление компаниями-клиентами организации
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="rounded-xl gap-2"
            onClick={handleExport}
            disabled={companies.length === 0}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Экспорт
          </Button>
          <Button
            className="btn-gradient rounded-xl gap-2"
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="w-4 h-4" />
            Добавить компанию
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Поиск по названию или ИНН..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 rounded-xl"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-bold">{companies.length}</div>
              <div className="text-sm text-muted-foreground">Всего компаний</div>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sigma-green/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-sigma-green" />
            </div>
            <div>
              <div className="text-2xl font-bold">
                {companies.reduce((sum, c) => sum + (c.studentsCount || 0), 0)}
              </div>
              <div className="text-sm text-muted-foreground">
                Учеников в компаниях
              </div>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <div className="text-2xl font-bold">
                {companies.filter((c) => (c.studentsCount || 0) === 0).length}
              </div>
              <div className="text-sm text-muted-foreground">Без учеников</div>
            </div>
          </div>
        </div>
      </div>

      {/* Companies List */}
      {filteredCompanies.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>
            {searchQuery ? "Компании не найдены" : "Нет компаний"}
          </p>
          {!searchQuery && (
            <Button
              variant="link"
              className="mt-2"
              onClick={() => setShowCreateDialog(true)}
            >
              Добавить первую компанию
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">
                  Название
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">
                  ИНН
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">
                  Учеников
                </th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">
                  Дата создания
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCompanies.map((company) => (
                <tr
                  key={company.id}
                  className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors cursor-pointer"
                  onClick={() => handleOpenCompanyDetail(company)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-medium hover:text-primary transition-colors">
                        {company.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {company.inn || "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                      <Users className="w-3 h-3" />
                      {company.studentsCount || 0}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {new Date(company.created_at).toLocaleDateString("ru-RU")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Company Detail Dialog - Full Screen */}
      <Dialog open={showCompanyDetail} onOpenChange={setShowCompanyDetail}>
        <DialogContent className="rounded-2xl w-[95vw] max-w-6xl h-[90vh] overflow-hidden flex flex-col p-0">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 border-b border-border">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center">
                  <Building2 className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold">{selectedCompanyForDetail?.name}</h2>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                    {selectedCompanyForDetail?.inn && (
                      <span>ИНН: {selectedCompanyForDetail.inn}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {selectedCompanyForDetail && new Date(selectedCompanyForDetail.created_at).toLocaleDateString("ru-RU")}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-xl"
                  onClick={() => {
                    setShowCompanyDetail(false);
                    if (selectedCompanyForDetail) handleEdit(selectedCompanyForDetail);
                  }}
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-xl text-destructive hover:text-destructive"
                  onClick={() => {
                    setShowCompanyDetail(false);
                    if (selectedCompanyForDetail) handleDeleteClick(selectedCompanyForDetail);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-4 gap-3 mt-5">
              <div className="bg-card/80 backdrop-blur rounded-xl p-3 border border-border">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Users className="w-3.5 h-3.5" />
                  Ученики
                </div>
                <div className="text-xl font-bold">{selectedCompanyForDetail?.studentsCount || 0}</div>
              </div>
              <div className="bg-card/80 backdrop-blur rounded-xl p-3 border border-border">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <BookOpen className="w-3.5 h-3.5" />
                  Курсов
                </div>
                <div className="text-xl font-bold">—</div>
              </div>
              <div className="bg-card/80 backdrop-blur rounded-xl p-3 border border-border">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Прогресс
                </div>
                <div className="text-xl font-bold">—%</div>
              </div>
              <div className="bg-card/80 backdrop-blur rounded-xl p-3 border border-border">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <GraduationCap className="w-3.5 h-3.5" />
                  Завершили
                </div>
                <div className="text-xl font-bold">—</div>
              </div>
            </div>
          </div>

          {/* Tabs Content */}
          <Tabs defaultValue="actions" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent px-6 h-12">
              <TabsTrigger value="actions" className="rounded-lg data-[state=active]:bg-primary/10">
                Действия
              </TabsTrigger>
              <TabsTrigger value="documents" className="rounded-lg data-[state=active]:bg-primary/10">
                Документы
              </TabsTrigger>
              <TabsTrigger value="stats" className="rounded-lg data-[state=active]:bg-primary/10">
                Статистика
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto p-6">
              {/* Actions Tab */}
              <TabsContent value="actions" className="m-0 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-secondary/50 transition-all text-left group"
                    onClick={() => {
                      setShowCompanyDetail(false);
                      if (selectedCompanyForDetail) handleViewStudents(selectedCompanyForDetail);
                    }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <Eye className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">Просмотр учеников</div>
                      <div className="text-xs text-muted-foreground">Список и прогресс</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </button>

                  <button
                    className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-secondary/50 transition-all text-left group"
                    onClick={() => {
                      setShowCompanyDetail(false);
                      if (selectedCompanyForDetail) handleOpenBulkAssign(selectedCompanyForDetail);
                    }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-sigma-green/10 flex items-center justify-center group-hover:bg-sigma-green/20 transition-colors">
                      <UserPlus className="w-5 h-5 text-sigma-green" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">Назначить учеников</div>
                      <div className="text-xs text-muted-foreground">Добавить в компанию</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </button>

                  <button
                    className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-secondary/50 transition-all text-left group"
                    onClick={() => {
                      setShowCompanyDetail(false);
                      if (selectedCompanyForDetail) handleOpenLinkDialog(selectedCompanyForDetail);
                    }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                      <Link2 className="w-5 h-5 text-blue-500" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">Ссылки регистрации</div>
                      <div className="text-xs text-muted-foreground">Приглашения учеников</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </button>

                  <button
                    className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-secondary/50 transition-all text-left group"
                    onClick={() => {
                      setShowCompanyDetail(false);
                      if (selectedCompanyForDetail) handleOpenBulkEnroll(selectedCompanyForDetail);
                    }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                      <BookOpen className="w-5 h-5 text-purple-500" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">Назначить на курсы</div>
                      <div className="text-xs text-muted-foreground">Массовое зачисление</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </button>
                </div>
              </TabsContent>

              {/* Documents Tab */}
              <TabsContent value="documents" className="m-0 space-y-4">
                {isLoadingDocuments ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Contracts */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="w-5 h-5 text-orange-500" />
                          <h3 className="font-semibold">Договоры</h3>
                          <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                            {getDocumentsByType('contract').length}
                          </span>
                        </div>
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.doc,.docx"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUploadDocument('contract', file);
                              e.target.value = '';
                            }}
                            disabled={isUploadingDocument === 'contract'}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-lg gap-2 pointer-events-none h-8"
                            disabled={isUploadingDocument === 'contract'}
                          >
                            {isUploadingDocument === 'contract' ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Upload className="w-3 h-3" />
                            )}
                          </Button>
                        </label>
                      </div>
                      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                        {getDocumentsByType('contract').length === 0 ? (
                          <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-xl">
                            Нет договоров
                          </div>
                        ) : (
                          getDocumentsByType('contract').map((doc) => (
                            <div key={doc.id} className="flex items-center gap-2 p-3 rounded-xl border border-border bg-card hover:bg-secondary/30 transition-colors">
                              <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                                <FileText className="w-4 h-4 text-orange-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-xs truncate">{doc.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {formatFileSize(doc.file_size)} • {formatDate(doc.uploaded_at)}
                                </div>
                              </div>
                              <div className="flex items-center gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="rounded-lg h-7 w-7 text-primary hover:text-primary"
                                  onClick={() => handleViewDocument(doc)}
                                  title="Просмотреть"
                                >
                                  <Eye className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="rounded-lg h-7 w-7"
                                  onClick={() => handleDownloadDocument(doc)}
                                  title="Скачать"
                                >
                                  <Download className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="rounded-lg h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteDocument(doc)}
                                  disabled={isDeletingDocument === doc.id}
                                >
                                  {isDeletingDocument === doc.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <X className="w-3 h-3" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Invoices */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Receipt className="w-5 h-5 text-blue-500" />
                          <h3 className="font-semibold">Счета</h3>
                          <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                            {getDocumentsByType('invoice').length}
                          </span>
                        </div>
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.doc,.docx"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUploadDocument('invoice', file);
                              e.target.value = '';
                            }}
                            disabled={isUploadingDocument === 'invoice'}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-lg gap-2 pointer-events-none h-8"
                            disabled={isUploadingDocument === 'invoice'}
                          >
                            {isUploadingDocument === 'invoice' ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Upload className="w-3 h-3" />
                            )}
                          </Button>
                        </label>
                      </div>
                      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                        {getDocumentsByType('invoice').length === 0 ? (
                          <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-xl">
                            Нет счетов
                          </div>
                        ) : (
                          getDocumentsByType('invoice').map((doc) => (
                            <div key={doc.id} className="flex items-center gap-2 p-3 rounded-xl border border-border bg-card hover:bg-secondary/30 transition-colors">
                              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                                <Receipt className="w-4 h-4 text-blue-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-xs truncate">{doc.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {formatFileSize(doc.file_size)} • {formatDate(doc.uploaded_at)}
                                </div>
                              </div>
                              <div className="flex items-center gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="rounded-lg h-7 w-7 text-primary hover:text-primary"
                                  onClick={() => handleViewDocument(doc)}
                                  title="Просмотреть"
                                >
                                  <Eye className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="rounded-lg h-7 w-7"
                                  onClick={() => handleDownloadDocument(doc)}
                                  title="Скачать"
                                >
                                  <Download className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="rounded-lg h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteDocument(doc)}
                                  disabled={isDeletingDocument === doc.id}
                                >
                                  {isDeletingDocument === doc.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <X className="w-3 h-3" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Acts */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileCheck className="w-5 h-5 text-sigma-green" />
                          <h3 className="font-semibold">Акты</h3>
                          <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                            {getDocumentsByType('act').length}
                          </span>
                        </div>
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.doc,.docx"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUploadDocument('act', file);
                              e.target.value = '';
                            }}
                            disabled={isUploadingDocument === 'act'}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-lg gap-2 pointer-events-none h-8"
                            disabled={isUploadingDocument === 'act'}
                          >
                            {isUploadingDocument === 'act' ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Upload className="w-3 h-3" />
                            )}
                          </Button>
                        </label>
                      </div>
                      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                        {getDocumentsByType('act').length === 0 ? (
                          <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-xl">
                            Нет актов
                          </div>
                        ) : (
                          getDocumentsByType('act').map((doc) => (
                            <div key={doc.id} className="flex items-center gap-2 p-3 rounded-xl border border-border bg-card hover:bg-secondary/30 transition-colors">
                              <div className="w-8 h-8 rounded-lg bg-sigma-green/10 flex items-center justify-center flex-shrink-0">
                                <FileCheck className="w-4 h-4 text-sigma-green" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-xs truncate">{doc.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {formatFileSize(doc.file_size)} • {formatDate(doc.uploaded_at)}
                                </div>
                              </div>
                              <div className="flex items-center gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="rounded-lg h-7 w-7 text-primary hover:text-primary"
                                  onClick={() => handleViewDocument(doc)}
                                  title="Просмотреть"
                                >
                                  <Eye className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="rounded-lg h-7 w-7"
                                  onClick={() => handleDownloadDocument(doc)}
                                  title="Скачать"
                                >
                                  <Download className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="rounded-lg h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteDocument(doc)}
                                  disabled={isDeletingDocument === doc.id}
                                >
                                  {isDeletingDocument === doc.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <X className="w-3 h-3" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Stats Tab */}
              <TabsContent value="stats" className="m-0 space-y-4">
                <div className="bg-secondary/30 rounded-xl p-6 text-center">
                  <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="font-medium mb-2">Статистика обучения</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Детальная статистика по курсам и прогрессу учеников компании
                  </p>
                  <Button 
                    variant="outline" 
                    className="rounded-xl gap-2"
                    onClick={() => {
                      setShowCompanyDetail(false);
                      if (selectedCompanyForDetail) handleViewStudents(selectedCompanyForDetail);
                    }}
                  >
                    <Eye className="w-4 h-4" />
                    Посмотреть учеников
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-card border border-border rounded-xl p-4">
                    <div className="text-sm text-muted-foreground mb-2">Всего зачислений</div>
                    <div className="text-2xl font-bold">—</div>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4">
                    <div className="text-sm text-muted-foreground mb-2">Средний прогресс</div>
                    <div className="text-2xl font-bold">—%</div>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4">
                    <div className="text-sm text-muted-foreground mb-2">Завершённых курсов</div>
                    <div className="text-2xl font-bold">—</div>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4">
                    <div className="text-sm text-muted-foreground mb-2">Средний балл тестов</div>
                    <div className="text-2xl font-bold">—</div>
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Добавить компанию</DialogTitle>
            <DialogDescription>
              Создайте новую компанию-клиента
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Название компании *</Label>
              <Input
                placeholder='ООО "Название"'
                className="rounded-xl"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>ИНН (необязательно)</Label>
              <Input
                placeholder="1234567890"
                className="rounded-xl"
                value={newCompanyInn}
                onChange={(e) => setNewCompanyInn(e.target.value)}
              />
            </div>
            <Button
              className="w-full btn-gradient rounded-xl"
              onClick={handleCreate}
              disabled={isCreating}
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Создание...
                </>
              ) : (
                "Создать компанию"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">
              Редактировать компанию
            </DialogTitle>
            <DialogDescription>Измените данные компании</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Название компании *</Label>
              <Input
                placeholder='ООО "Название"'
                className="rounded-xl"
                value={editCompanyName}
                onChange={(e) => setEditCompanyName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>ИНН (необязательно)</Label>
              <Input
                placeholder="1234567890"
                className="rounded-xl"
                value={editCompanyInn}
                onChange={(e) => setEditCompanyInn(e.target.value)}
              />
            </div>
            <Button
              className="w-full btn-gradient rounded-xl"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Сохранение...
                </>
              ) : (
                "Сохранить"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Удалить компанию?</DialogTitle>
            <DialogDescription>
              Компания «{deletingCompany?.name}» будет удалена. Ученики
              останутся в системе, но будут отвязаны от компании.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Отмена
            </Button>
            <Button
              variant="destructive"
              className="flex-1 rounded-xl"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Удаление...
                </>
              ) : (
                "Удалить"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Students Dialog */}
      <Dialog open={showStudentsDialog} onOpenChange={setShowStudentsDialog}>
        <DialogContent className="rounded-2xl max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              {selectedCompanyForStudents?.name}
            </DialogTitle>
            <DialogDescription>
              Список учеников компании
              {selectedCompanyForStudents?.inn && ` (ИНН: ${selectedCompanyForStudents.inn})`}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Поиск по имени или email..."
                value={studentSearchQuery}
                onChange={(e) => setStudentSearchQuery(e.target.value)}
                className="pl-10 rounded-xl"
              />
            </div>

            {/* Stats */}
            <div className="flex gap-4">
              <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-lg">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">{companyStudents.length} учеников</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 bg-sigma-green/10 rounded-lg">
                <GraduationCap className="w-4 h-4 text-sigma-green" />
                <span className="text-sm font-medium">
                  {companyStudents.reduce((sum, s) => sum + s.enrollments.length, 0)} зачислений
                </span>
              </div>
            </div>

            {/* Students List */}
            <div className="flex-1 overflow-y-auto">
              {isLoadingStudents ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : filteredCompanyStudents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{studentSearchQuery ? "Ученики не найдены" : "Нет учеников в этой компании"}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredCompanyStudents.map((student) => (
                    <div
                      key={student.id}
                      className="bg-secondary/50 rounded-xl p-4 border border-border"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-medium">{student.full_name}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {student.email}
                          </div>
                        </div>
                        <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
                          {student.enrollments.length} курсов
                        </span>
                      </div>

                      {student.enrollments.length > 0 ? (
                        <div className="space-y-2">
                          {student.enrollments.map((enrollment, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between bg-background rounded-lg px-3 py-2"
                            >
                              <div className="flex-1 min-w-0 mr-4">
                                <div className="text-sm font-medium truncate">
                                  {enrollment.course_title}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 w-32">
                                  <Progress value={enrollment.progress} className="h-2 flex-1" />
                                  <span className="text-xs font-medium w-10 text-right">
                                    {enrollment.progress}%
                                  </span>
                                </div>
                                <span
                                  className={`text-xs px-2 py-0.5 rounded-full ${
                                    enrollment.status === "completed"
                                      ? "bg-sigma-green/10 text-sigma-green"
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {enrollment.status === "completed" ? "Завершён" : "Активный"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground italic">
                          Не зачислен на курсы
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-border">
            <Button
              variant="outline"
              className="rounded-xl gap-2"
              onClick={() => {
                if (companyStudents.length === 0) return;
                
                const exportData: any[] = [];
                companyStudents.forEach((student) => {
                  if (student.enrollments.length === 0) {
                    exportData.push({
                      "ФИО": student.full_name,
                      "Email": student.email,
                      "Курс": "Не зачислен",
                      "Прогресс": "",
                      "Статус": "",
                    });
                  } else {
                    student.enrollments.forEach((enrollment) => {
                      exportData.push({
                        "ФИО": student.full_name,
                        "Email": student.email,
                        "Курс": enrollment.course_title,
                        "Прогресс": `${enrollment.progress}%`,
                        "Статус": enrollment.status === "completed" ? "Завершён" : "Активный",
                      });
                    });
                  }
                });

                const ws = XLSX.utils.json_to_sheet(exportData);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Ученики");
                XLSX.writeFile(wb, `${selectedCompanyForStudents?.name || "company"}_students.xlsx`);
                toast.success("Список учеников экспортирован");
              }}
              disabled={companyStudents.length === 0}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Экспорт в Excel
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setShowStudentsDialog(false)}
            >
              Закрыть
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Assign Students Dialog */}
      <Dialog open={showBulkAssignDialog} onOpenChange={setShowBulkAssignDialog}>
        <DialogContent className="rounded-2xl max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-sigma-green" />
              Назначить учеников в компанию
            </DialogTitle>
            <DialogDescription>
              Выберите учеников для назначения в «{selectedCompanyForAssign?.name}»
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Search & Filter */}
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Поиск по имени или email..."
                  value={assignSearchQuery}
                  onChange={(e) => setAssignSearchQuery(e.target.value)}
                  className="pl-10 rounded-xl"
                />
              </div>
              <Button
                variant={showOnlyUnassigned ? "default" : "outline"}
                className="rounded-xl gap-2"
                onClick={() => setShowOnlyUnassigned(!showOnlyUnassigned)}
              >
                {showOnlyUnassigned && <Check className="w-4 h-4" />}
                Без компании
              </Button>
            </div>

            {/* Stats */}
            <div className="flex items-center justify-between">
              <div className="flex gap-4">
                <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-lg">
                  <Users className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">{filteredAvailableStudents.length} учеников</span>
                </div>
                {selectedStudentIds.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-sigma-green/10 rounded-lg">
                    <Check className="w-4 h-4 text-sigma-green" />
                    <span className="text-sm font-medium">{selectedStudentIds.length} выбрано</span>
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-sm"
                onClick={toggleSelectAll}
                disabled={filteredAvailableStudents.length === 0}
              >
                {selectedStudentIds.length === filteredAvailableStudents.length && filteredAvailableStudents.length > 0
                  ? "Снять выделение"
                  : "Выбрать всех"}
              </Button>
            </div>

            {/* Students List */}
            <div className="flex-1 overflow-y-auto border border-border rounded-xl">
              {isLoadingAvailableStudents ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : filteredAvailableStudents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{assignSearchQuery || showOnlyUnassigned ? "Ученики не найдены" : "Нет учеников в организации"}</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredAvailableStudents.map((student) => {
                    const isSelected = selectedStudentIds.includes(student.id);
                    const isAlreadyInCompany = student.company_id === selectedCompanyForAssign?.id;
                    
                    return (
                      <div
                        key={student.id}
                        className={`flex items-center gap-4 p-4 hover:bg-secondary/50 transition-colors cursor-pointer ${
                          isSelected ? "bg-primary/5" : ""
                        } ${isAlreadyInCompany ? "opacity-50" : ""}`}
                        onClick={() => !isAlreadyInCompany && toggleStudentSelection(student.id)}
                      >
                        <Checkbox
                          checked={isSelected}
                          disabled={isAlreadyInCompany}
                          onCheckedChange={() => !isAlreadyInCompany && toggleStudentSelection(student.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{student.full_name}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {student.email}
                          </div>
                        </div>
                        {student.company_name ? (
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            isAlreadyInCompany 
                              ? "bg-sigma-green/10 text-sigma-green" 
                              : "bg-muted text-muted-foreground"
                          }`}>
                            {isAlreadyInCompany ? "Уже в этой компании" : student.company_name}
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-1 rounded-full bg-orange-500/10 text-orange-500">
                            Без компании
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-border">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setShowBulkAssignDialog(false)}
            >
              Отмена
            </Button>
            <Button
              className="btn-gradient rounded-xl gap-2"
              onClick={handleBulkAssign}
              disabled={selectedStudentIds.length === 0 || isAssigning}
            >
              {isAssigning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Назначение...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Назначить ({selectedStudentIds.length})
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Registration Links Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="rounded-2xl max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Link2 className="w-5 h-5 text-blue-500" />
              Ссылки для регистрации
            </DialogTitle>
            <DialogDescription>
              Создайте ссылку для регистрации учеников в компанию «{selectedCompanyForLink?.name}»
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Create new link */}
            <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
              <div className="text-sm font-medium">Создать новую ссылку</div>
              <div className="flex gap-3">
                <Input
                  placeholder="Название (например: Группа 2024)"
                  value={newLinkName}
                  onChange={(e) => setNewLinkName(e.target.value)}
                  className="flex-1 rounded-xl"
                />
                <Input
                  type="number"
                  placeholder="Дней"
                  value={newLinkExpiresDays}
                  onChange={(e) => setNewLinkExpiresDays(e.target.value)}
                  className="w-24 rounded-xl"
                />
                <Button
                  className="btn-gradient rounded-xl gap-2"
                  onClick={handleCreateCompanyLink}
                  disabled={isCreatingLink}
                >
                  {isCreatingLink ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Создать
                    </>
                  )}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                Оставьте поле "Дней" пустым для бессрочной ссылки
              </div>
            </div>

            {/* Links list */}
            <div className="flex-1 overflow-y-auto">
              {isLoadingLinks ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : companyLinks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Link2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Нет ссылок для этой компании</p>
                  <p className="text-sm">Создайте первую ссылку выше</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {companyLinks.map((link) => {
                    const expired = isLinkExpired(link.expires_at);
                    return (
                      <div
                        key={link.id}
                        className={`flex items-center justify-between p-4 rounded-xl border ${
                          expired
                            ? "bg-muted/50 border-muted opacity-60"
                            : "bg-card border-border"
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                              expired
                                ? "bg-muted text-muted-foreground"
                                : "bg-blue-500/10 text-blue-500"
                            }`}
                          >
                            <Link2 className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-medium">
                              {link.name || "Без названия"}
                              {expired && (
                                <span className="ml-2 text-xs text-destructive">(истекла)</span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {link.used_count} регистраций
                              </span>
                              {link.expires_at && (
                                <span>
                                  до {new Date(link.expires_at).toLocaleDateString("ru-RU")}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyLink(link.token)}
                            disabled={expired}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteLink(link.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-border">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setShowLinkDialog(false)}
            >
              Закрыть
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Enroll to Courses Dialog */}
      <Dialog open={showBulkEnrollDialog} onOpenChange={setShowBulkEnrollDialog}>
        <DialogContent className="rounded-2xl max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-purple-500" />
              Назначить на курсы
            </DialogTitle>
            <DialogDescription>
              Зачислите всех учеников компании «{selectedCompanyForEnroll?.name}» на выбранные курсы
              {selectedCompanyForEnroll && (
                <span className="block mt-1">
                  ({selectedCompanyForEnroll.studentsCount || 0} учеников в компании)
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Stats */}
            <div className="flex gap-4">
              <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-lg">
                <BookOpen className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">{availableCourses.length} курсов</span>
              </div>
              {selectedCourseIds.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-purple-500/10 rounded-lg">
                  <Check className="w-4 h-4 text-purple-500" />
                  <span className="text-sm font-medium">{selectedCourseIds.length} выбрано</span>
                </div>
              )}
            </div>

            {/* Courses List */}
            <div className="flex-1 overflow-y-auto border border-border rounded-xl">
              {isLoadingCourses ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : availableCourses.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Нет доступных курсов</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {availableCourses.map((course) => {
                    const isSelected = selectedCourseIds.includes(course.id);
                    return (
                      <div
                        key={course.id}
                        className={`flex items-center gap-4 p-4 hover:bg-secondary/50 transition-colors cursor-pointer ${
                          isSelected ? "bg-purple-500/5" : ""
                        }`}
                        onClick={() => toggleCourseSelection(course.id)}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleCourseSelection(course.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{course.title}</div>
                        </div>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            course.is_published
                              ? "bg-sigma-green/10 text-sigma-green"
                              : "bg-orange-500/10 text-orange-500"
                          }`}
                        >
                          {course.is_published ? "Опубликован" : "Черновик"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-border">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setShowBulkEnrollDialog(false)}
            >
              Отмена
            </Button>
            <Button
              className="btn-gradient rounded-xl gap-2"
              onClick={handleBulkEnroll}
              disabled={selectedCourseIds.length === 0 || isEnrolling || !selectedCompanyForEnroll?.studentsCount}
            >
              {isEnrolling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Зачисление...
                </>
              ) : (
                <>
                  <GraduationCap className="w-4 h-4" />
                  Зачислить всех ({selectedCourseIds.length} курсов)
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
