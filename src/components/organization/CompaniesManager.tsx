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
} from "lucide-react";
import * as XLSX from "xlsx";

interface Company {
  id: string;
  name: string;
  inn: string | null;
  created_at: string;
  studentsCount?: number;
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
                        onClick={() => handleEdit(company)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-lg text-destructive hover:text-destructive"
                        onClick={() => handleDeleteClick(company)}
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
    </div>
  );
}
