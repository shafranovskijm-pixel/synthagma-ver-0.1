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
} from "lucide-react";
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
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCompanies.map((company) => (
                <tr
                  key={company.id}
                  className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-medium">{company.name}</span>
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
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-lg"
                        onClick={() => handleViewStudents(company)}
                        title="Просмотр учеников"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-lg text-sigma-green hover:text-sigma-green"
                        onClick={() => handleOpenBulkAssign(company)}
                        title="Назначить учеников"
                      >
                        <UserPlus className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-lg"
                        onClick={() => handleEdit(company)}
                        title="Редактировать"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-lg text-destructive hover:text-destructive"
                        onClick={() => handleDeleteClick(company)}
                        title="Удалить"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
    </div>
  );
}
