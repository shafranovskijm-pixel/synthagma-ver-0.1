import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ProgramDocument {
  id: string;
  organization_id: string;
  folder_id: string | null;
  category_id: string | null;
  name: string;
  description: string | null;
  file_url: string | null;
  file_size: number | null;
  file_type: string;
  created_at: string;
  updated_at: string;
}

interface ProgramFolder {
  id: string;
  organization_id: string;
  name: string;
  parent_id: string | null;
  category_id: string | null;
  color: string;
  created_at: string;
}

interface ProgramCategory {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  created_at: string;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

export function useProgramsManager(organizationId: string) {
  const [documents, setDocuments] = useState<ProgramDocument[]>([]);
  const [folders, setFolders] = useState<ProgramFolder[]>([]);
  const [categories, setCategories] = useState<ProgramCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [dateFromFilter, setDateFromFilter] = useState<Date | undefined>(undefined);
  const [dateToFilter, setDateToFilter] = useState<Date | undefined>(undefined);
  
  // Current folder navigation
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<ProgramFolder[]>([]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [docsResult, foldersResult, catsResult] = await Promise.all([
        supabase
          .from("program_documents")
          .select("*")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false }),
        supabase
          .from("program_folders")
          .select("*")
          .eq("organization_id", organizationId)
          .order("name", { ascending: true }),
        supabase
          .from("program_categories")
          .select("*")
          .eq("organization_id", organizationId)
          .order("name", { ascending: true })
      ]);

      if (docsResult.error) throw docsResult.error;
      if (foldersResult.error) throw foldersResult.error;
      if (catsResult.error) throw catsResult.error;

      setDocuments(docsResult.data || []);
      setFolders(foldersResult.data || []);
      setCategories(catsResult.data || []);
    } catch (error) {
      console.error("Error fetching programs data:", error);
      toast.error("Ошибка загрузки программ");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const navigateToFolder = useCallback((folderId: string | null) => {
    setCurrentFolderId(folderId);
    
    if (folderId === null) {
      setFolderPath([]);
    } else {
      const path: ProgramFolder[] = [];
      let currentId: string | null = folderId;
      
      while (currentId) {
        const folder = folders.find(f => f.id === currentId);
        if (folder) {
          path.unshift(folder);
          currentId = folder.parent_id;
        } else {
          break;
        }
      }
      
      setFolderPath(path);
    }
  }, [folders]);

  const uploadDocument = async (
    file: File,
    name: string,
    description: string,
    folderId: string | null,
    categoryId: string | null
  ) => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Файл слишком большой. Максимальный размер: 100 МБ");
      return false;
    }

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `programs/${organizationId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("program-files")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("program-files")
        .getPublicUrl(fileName);

      const { error } = await supabase
        .from("program_documents")
        .insert({
          organization_id: organizationId,
          name: name.trim(),
          description: description.trim() || null,
          file_url: urlData.publicUrl,
          file_size: file.size,
          file_type: fileExt || 'document',
          folder_id: folderId,
          category_id: categoryId,
        });

      if (error) throw error;

      toast.success("Файл загружен");
      await fetchData();
      return true;
    } catch (error) {
      console.error("Error uploading document:", error);
      toast.error("Ошибка загрузки файла");
      return false;
    }
  };

  const createFolder = async (name: string, color: string, parentId: string | null, categoryId: string | null) => {
    try {
      const { error } = await supabase
        .from("program_folders")
        .insert({
          organization_id: organizationId,
          name: name.trim(),
          parent_id: parentId,
          category_id: categoryId,
          color,
        });

      if (error) throw error;

      toast.success("Папка создана");
      await fetchData();
      return true;
    } catch (error) {
      console.error("Error creating folder:", error);
      toast.error("Ошибка создания папки");
      return false;
    }
  };

  const updateFolder = async (folderId: string, name: string, color: string, categoryId: string | null) => {
    try {
      const { error } = await supabase
        .from("program_folders")
        .update({
          name: name.trim(),
          color,
          category_id: categoryId,
        })
        .eq("id", folderId);

      if (error) throw error;

      toast.success("Папка обновлена");
      await fetchData();
      return true;
    } catch (error) {
      console.error("Error updating folder:", error);
      toast.error("Ошибка обновления папки");
      return false;
    }
  };

  const deleteFolder = async (folderId: string) => {
    try {
      const { error } = await supabase
        .from("program_folders")
        .delete()
        .eq("id", folderId);

      if (error) throw error;

      toast.success("Папка удалена");
      
      if (currentFolderId === folderId) {
        navigateToFolder(null);
      }
      
      await fetchData();
      return true;
    } catch (error) {
      console.error("Error deleting folder:", error);
      toast.error("Ошибка удаления папки");
      return false;
    }
  };

  const deleteDocument = async (docId: string, fileUrl: string | null) => {
    try {
      if (fileUrl) {
        const path = fileUrl.split("/program-files/")[1];
        if (path) {
          await supabase.storage.from("program-files").remove([path]);
        }
      }

      const { error } = await supabase
        .from("program_documents")
        .delete()
        .eq("id", docId);

      if (error) throw error;

      setDocuments(prev => prev.filter(d => d.id !== docId));
      toast.success("Файл удалён");
      return true;
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Ошибка удаления");
      return false;
    }
  };

  const createCategory = async (name: string, color: string) => {
    try {
      const { error } = await supabase
        .from("program_categories")
        .insert({
          organization_id: organizationId,
          name: name.trim(),
          color,
        });

      if (error) throw error;

      toast.success("Категория создана");
      await fetchData();
      return true;
    } catch (error) {
      console.error("Error creating category:", error);
      toast.error("Ошибка создания категории");
      return false;
    }
  };

  const deleteCategory = async (categoryId: string) => {
    try {
      const { error } = await supabase
        .from("program_categories")
        .delete()
        .eq("id", categoryId);

      if (error) throw error;

      toast.success("Категория удалена");
      await fetchData();
      return true;
    } catch (error) {
      console.error("Error deleting category:", error);
      toast.error("Ошибка удаления категории");
      return false;
    }
  };

  // Get folders and documents for current view
  const currentFolders = folders.filter(f => f.parent_id === currentFolderId);
  const currentDocuments = documents.filter(d => d.folder_id === currentFolderId);

  const filteredDocuments = currentDocuments.filter((doc) => {
    const matchesSearch = searchQuery === "" || 
      doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.description && doc.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = categoryFilter === "all" || doc.category_id === categoryFilter;
    
    const docDate = new Date(doc.created_at);
    const matchesDateFrom = !dateFromFilter || docDate >= dateFromFilter;
    const matchesDateTo = !dateToFilter || docDate <= new Date(dateToFilter.getTime() + 24 * 60 * 60 * 1000);
    
    return matchesSearch && matchesCategory && matchesDateFrom && matchesDateTo;
  });

  const filteredFolders = currentFolders.filter(folder => {
    const matchesSearch = searchQuery === "" || folder.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || folder.category_id === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const getFolderStats = (folderId: string) => {
    const docsInFolder = documents.filter(d => d.folder_id === folderId).length;
    const subfoldersCount = folders.filter(f => f.parent_id === folderId).length;
    return { docsInFolder, subfoldersCount };
  };

  return {
    documents,
    folders,
    categories,
    isLoading,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    dateFromFilter,
    setDateFromFilter,
    dateToFilter,
    setDateToFilter,
    
    currentFolderId,
    folderPath,
    navigateToFolder,
    currentFolders,
    currentDocuments,
    filteredDocuments,
    filteredFolders,
    
    uploadDocument,
    createFolder,
    updateFolder,
    deleteFolder,
    deleteDocument,
    createCategory,
    deleteCategory,
    getFolderStats,
    refreshData: fetchData,
  };
}

export type { ProgramDocument, ProgramFolder, ProgramCategory };
export { MAX_FILE_SIZE };
