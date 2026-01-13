import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LibraryDocument {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  description: string | null;
  file_url: string | null;
  file_size: number | null;
  folder_id: string | null;
  created_at: string;
}

interface LibraryFolder {
  id: string;
  organization_id: string;
  name: string;
  parent_id: string | null;
  color: string;
  created_at: string;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

export function useLibraryManager(organizationId: string) {
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  
  // Current folder navigation
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<LibraryFolder[]>([]);
  
  // Storage
  const [storageLimit, setStorageLimit] = useState<number>(0);
  const [totalStorageUsed, setTotalStorageUsed] = useState<number>(0);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [docsResult, foldersResult] = await Promise.all([
        supabase
          .from("library_documents")
          .select("*")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false }),
        supabase
          .from("library_folders")
          .select("*")
          .eq("organization_id", organizationId)
          .order("name", { ascending: true })
      ]);

      if (docsResult.error) throw docsResult.error;
      if (foldersResult.error) throw foldersResult.error;

      const docs = docsResult.data || [];
      setDocuments(docs);
      setFolders(foldersResult.data || []);
      
      // Calculate total storage used
      const totalBytes = docs.reduce((sum, doc) => sum + (doc.file_size || 0), 0);
      setTotalStorageUsed(totalBytes);
    } catch (error) {
      console.error("Error fetching library data:", error);
      toast.error("Ошибка загрузки библиотеки");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  const fetchStorageLimit = useCallback(async () => {
    const { data } = await supabase
      .from("organizations")
      .select("storage_limit_bytes")
      .eq("id", organizationId)
      .single();
    if (data) {
      setStorageLimit(data.storage_limit_bytes || 0);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchData();
    fetchStorageLimit();
  }, [fetchData, fetchStorageLimit]);

  const navigateToFolder = useCallback((folderId: string | null) => {
    setCurrentFolderId(folderId);
    
    if (folderId === null) {
      setFolderPath([]);
    } else {
      // Build folder path
      const path: LibraryFolder[] = [];
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
    type: string,
    description: string,
    folderId: string | null
  ) => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Файл слишком большой. Максимальный размер: 100 МБ");
      return false;
    }

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `library/${organizationId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("library-files")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("library-files")
        .getPublicUrl(fileName);

      const { error } = await supabase
        .from("library_documents")
        .insert({
          organization_id: organizationId,
          name: name.trim(),
          type,
          description: description.trim() || null,
          file_url: urlData.publicUrl,
          file_size: file.size,
          folder_id: folderId,
        });

      if (error) throw error;

      toast.success("Материал добавлен в библиотеку");
      await fetchData();
      return true;
    } catch (error) {
      console.error("Error adding document:", error);
      toast.error("Ошибка добавления материала");
      return false;
    }
  };

  const createFolder = async (name: string, color: string, parentId: string | null) => {
    try {
      const { error } = await supabase
        .from("library_folders")
        .insert({
          organization_id: organizationId,
          name: name.trim(),
          parent_id: parentId,
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

  const updateFolder = async (folderId: string, name: string, color: string) => {
    try {
      const { error } = await supabase
        .from("library_folders")
        .update({
          name: name.trim(),
          color,
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
        .from("library_folders")
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
        const path = fileUrl.split("/library-files/")[1];
        if (path) {
          await supabase.storage.from("library-files").remove([path]);
        }
      }

      const { error } = await supabase
        .from("library_documents")
        .delete()
        .eq("id", docId);

      if (error) throw error;

      setDocuments(prev => prev.filter(d => d.id !== docId));
      toast.success("Материал удалён");
      return true;
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Ошибка удаления");
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
    const matchesType = typeFilter === "all" || doc.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const filteredFolders = currentFolders.filter(folder => 
    searchQuery === "" || folder.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getFolderStats = (folderId: string) => {
    const docsInFolder = documents.filter(d => d.folder_id === folderId).length;
    const subfoldersCount = folders.filter(f => f.parent_id === folderId).length;
    return { docsInFolder, subfoldersCount };
  };

  return {
    // Data
    documents,
    folders,
    isLoading,
    searchQuery,
    setSearchQuery,
    typeFilter,
    setTypeFilter,
    
    // Navigation
    currentFolderId,
    folderPath,
    navigateToFolder,
    currentFolders,
    currentDocuments,
    filteredDocuments,
    filteredFolders,
    
    // Storage
    storageLimit,
    totalStorageUsed,
    
    // Actions
    uploadDocument,
    createFolder,
    updateFolder,
    deleteFolder,
    deleteDocument,
    getFolderStats,
    refreshData: fetchData,
  };
}

export type { LibraryDocument, LibraryFolder };
export { MAX_FILE_SIZE };
