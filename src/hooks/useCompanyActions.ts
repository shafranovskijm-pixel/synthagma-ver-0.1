import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Organization {
  id: string;
  name: string;
  email: string;
  contact_name: string | null;
  phone: string | null;
  inn: string | null;
  ai_enabled: boolean;
  created_at: string;
  studentsCount?: number;
  coursesCount?: number;
}

interface Student {
  id: string;
  user_id: string;
  enrollment_id: string | null;
  name: string;
  email: string;
  login: string | null;
  generated_password: string | null;
  course: string | null;
  course_id: string | null;
  progress: number;
  lastActivity: string | null;
  status: string | null;
}

export function useCompanyActions() {
  // Dialog states
  const [showAddCompanyDialog, setShowAddCompanyDialog] = useState(false);
  const [showEditCompanyDialog, setShowEditCompanyDialog] = useState(false);
  const [showOrgDetails, setShowOrgDetails] = useState(false);

  // Add company form
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyEmail, setNewCompanyEmail] = useState("");
  const [newCompanyInn, setNewCompanyInn] = useState("");
  const [newCompanyContactName, setNewCompanyContactName] = useState("");
  const [newCompanyPhone, setNewCompanyPhone] = useState("");
  const [isCreatingCompany, setIsCreatingCompany] = useState(false);

  // Edit company form
  const [editingCompany, setEditingCompany] = useState<Organization | null>(null);
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editCompanyEmail, setEditCompanyEmail] = useState("");
  const [editCompanyInn, setEditCompanyInn] = useState("");
  const [editCompanyContactName, setEditCompanyContactName] = useState("");
  const [editCompanyPhone, setEditCompanyPhone] = useState("");
  const [isSavingCompany, setIsSavingCompany] = useState(false);

  // View org details
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [orgStudents, setOrgStudents] = useState<Student[]>([]);
  const [isLoadingOrgDetails, setIsLoadingOrgDetails] = useState(false);

  const resetAddForm = useCallback(() => {
    setNewCompanyName("");
    setNewCompanyEmail("");
    setNewCompanyInn("");
    setNewCompanyContactName("");
    setNewCompanyPhone("");
  }, []);

  const createCompany = useCallback(async () => {
    if (!newCompanyName.trim() || !newCompanyEmail.trim()) {
      toast.error("Заполните название и email");
      return false;
    }

    setIsCreatingCompany(true);
    try {
      const { error } = await supabase.from("organizations").insert({
        name: newCompanyName.trim(),
        email: newCompanyEmail.trim(),
        inn: newCompanyInn || null,
        contact_name: newCompanyContactName || null,
        phone: newCompanyPhone || null
      });

      if (error) throw error;
      toast.success("Компания создана");
      setShowAddCompanyDialog(false);
      resetAddForm();
      return true;
    } catch (error) {
      console.error("Error creating company:", error);
      toast.error("Ошибка создания компании");
      return false;
    } finally {
      setIsCreatingCompany(false);
    }
  }, [newCompanyName, newCompanyEmail, newCompanyInn, newCompanyContactName, newCompanyPhone, resetAddForm]);

  const openEditDialog = useCallback((org: Organization) => {
    setEditingCompany(org);
    setEditCompanyName(org.name);
    setEditCompanyEmail(org.email);
    setEditCompanyInn(org.inn || "");
    setEditCompanyContactName(org.contact_name || "");
    setEditCompanyPhone(org.phone || "");
    setShowEditCompanyDialog(true);
  }, []);

  const saveCompany = useCallback(async () => {
    if (!editingCompany) return false;

    setIsSavingCompany(true);
    try {
      const { error } = await supabase.from("organizations").update({
        name: editCompanyName.trim(),
        email: editCompanyEmail.trim(),
        inn: editCompanyInn || null,
        contact_name: editCompanyContactName || null,
        phone: editCompanyPhone || null
      }).eq("id", editingCompany.id);

      if (error) throw error;
      toast.success("Компания обновлена");
      setShowEditCompanyDialog(false);
      setEditingCompany(null);
      return true;
    } catch (error) {
      console.error("Error saving company:", error);
      toast.error("Ошибка сохранения");
      return false;
    } finally {
      setIsSavingCompany(false);
    }
  }, [editingCompany, editCompanyName, editCompanyEmail, editCompanyInn, editCompanyContactName, editCompanyPhone]);

  const viewOrgDetails = useCallback(async (org: Organization) => {
    setSelectedOrg(org);
    setShowOrgDetails(true);
    setIsLoadingOrgDetails(true);

    try {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email, login, generated_password")
        .eq("organization_id", org.id);

      const studentsList: Student[] = (profiles || []).map(p => ({
        id: p.id,
        user_id: p.user_id,
        enrollment_id: null,
        name: p.full_name || "Без имени",
        email: p.email || "",
        login: p.login || null,
        generated_password: p.generated_password || null,
        course: null,
        course_id: null,
        progress: 0,
        lastActivity: null,
        status: null
      }));

      setOrgStudents(studentsList);
    } catch (error) {
      console.error("Error fetching org details:", error);
      toast.error("Ошибка загрузки данных");
    } finally {
      setIsLoadingOrgDetails(false);
    }
  }, []);

  return {
    // Dialog states
    showAddCompanyDialog,
    setShowAddCompanyDialog,
    showEditCompanyDialog,
    setShowEditCompanyDialog,
    showOrgDetails,
    setShowOrgDetails,

    // Add form
    newCompanyName,
    setNewCompanyName,
    newCompanyEmail,
    setNewCompanyEmail,
    newCompanyInn,
    setNewCompanyInn,
    newCompanyContactName,
    setNewCompanyContactName,
    newCompanyPhone,
    setNewCompanyPhone,
    isCreatingCompany,
    createCompany,

    // Edit form
    editingCompany,
    editCompanyName,
    setEditCompanyName,
    editCompanyEmail,
    setEditCompanyEmail,
    editCompanyInn,
    setEditCompanyInn,
    editCompanyContactName,
    setEditCompanyContactName,
    editCompanyPhone,
    setEditCompanyPhone,
    isSavingCompany,
    openEditDialog,
    saveCompany,

    // View details
    selectedOrg,
    orgStudents,
    isLoadingOrgDetails,
    viewOrgDetails,
  };
}
