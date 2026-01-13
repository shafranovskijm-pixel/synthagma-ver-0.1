import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CustomJournal {
  id: string;
  title: string;
  description: string;
  fields: string[];
  createdAt: string;
}

interface JournalItem {
  id: string;
  title: string;
  description: string;
  required: boolean;
}

interface JournalCategory {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  journals: JournalItem[];
}

export function useJournalsManager(organizationId: string, categories: JournalCategory[]) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<string[]>(
    categories.map((c) => c.id)
  );
  const [journalCounts, setJournalCounts] = useState<Record<string, number>>({});
  
  // Active journal states
  const [activeJournalType, setActiveJournalType] = useState<string | null>(null);
  const [activeJournalTitle, setActiveJournalTitle] = useState<string>("");
  
  // Custom journals state
  const [customJournals, setCustomJournals] = useState<CustomJournal[]>([]);

  // Load custom journals from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`custom_journals_${organizationId}`);
    if (saved) {
      try {
        setCustomJournals(JSON.parse(saved));
      } catch {
        setCustomJournals([]);
      }
    }
  }, [organizationId]);

  // Save custom journals to localStorage
  const saveCustomJournals = useCallback((journals: CustomJournal[]) => {
    localStorage.setItem(`custom_journals_${organizationId}`, JSON.stringify(journals));
    setCustomJournals(journals);
  }, [organizationId]);

  // Create custom journal
  const createCustomJournal = useCallback((data: { title: string; description: string; fields: string[] }) => {
    const newJournal: CustomJournal = {
      id: `custom_${Date.now()}`,
      title: data.title,
      description: data.description,
      fields: data.fields,
      createdAt: new Date().toISOString(),
    };
    saveCustomJournals([...customJournals, newJournal]);
    toast.success("Журнал создан");
    return newJournal;
  }, [customJournals, saveCustomJournals]);

  // Update custom journal
  const updateCustomJournal = useCallback((id: string, data: { title: string; description: string; fields: string[] }) => {
    const updated = customJournals.map((j) =>
      j.id === id
        ? { ...j, title: data.title, description: data.description, fields: data.fields }
        : j
    );
    saveCustomJournals(updated);
    toast.success("Журнал обновлён");
  }, [customJournals, saveCustomJournals]);

  // Delete custom journal
  const deleteCustomJournal = useCallback((journalId: string) => {
    const updated = customJournals.filter((j) => j.id !== journalId);
    saveCustomJournals(updated);
    localStorage.removeItem(`journal_${journalId}_${organizationId}`);
    toast.success("Журнал удалён");
  }, [customJournals, saveCustomJournals, organizationId]);

  // Fetch journal counts for each type
  useEffect(() => {
    const fetchJournalCounts = async () => {
      try {
        const { data } = await supabase
          .from("journal_instances")
          .select("journal_type")
          .eq("organization_id", organizationId);
        
        if (data) {
          const counts: Record<string, number> = {};
          data.forEach((j) => {
            counts[j.journal_type] = (counts[j.journal_type] || 0) + 1;
          });
          setJournalCounts(counts);
        }
      } catch (error) {
        console.error("Error fetching journal counts:", error);
      }
    };

    fetchJournalCounts();
  }, [organizationId]);

  // Delete all journals of a type
  const deleteJournalsByType = useCallback(async (type: string) => {
    try {
      // For copies_duplicates, clear localStorage
      if (type === "copies_duplicates") {
        localStorage.removeItem(`copies_duplicates_${organizationId}`);
        toast.success("Журнал очищен");
        return true;
      }

      // Delete from database
      const { error } = await supabase
        .from("journal_instances")
        .delete()
        .eq("organization_id", organizationId)
        .eq("journal_type", type);

      if (error) throw error;

      setJournalCounts((prev) => ({
        ...prev,
        [type]: 0,
      }));
      
      toast.success("Все журналы удалены");
      return true;
    } catch (error) {
      console.error("Error deleting journals:", error);
      toast.error("Ошибка при удалении");
      return false;
    }
  }, [organizationId]);

  const toggleCategory = useCallback((categoryId: string) => {
    setExpandedCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  }, []);

  // Filter categories based on search
  const filteredCategories = categories.map((cat) => ({
    ...cat,
    journals: cat.journals.filter(
      (journal) =>
        journal.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        journal.description.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter((cat) => cat.journals.length > 0);

  // Filter custom journals based on search
  const filteredCustomJournals = customJournals.filter(
    (j) =>
      j.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openJournal = useCallback((type: string, title: string) => {
    setActiveJournalType(type);
    setActiveJournalTitle(title);
  }, []);

  const closeJournal = useCallback(() => {
    setActiveJournalType(null);
    setActiveJournalTitle("");
  }, []);

  return {
    // Search & filter
    searchQuery,
    setSearchQuery,
    filteredCategories,
    filteredCustomJournals,
    
    // Categories
    expandedCategories,
    toggleCategory,
    
    // Journal counts
    journalCounts,
    
    // Active journal
    activeJournalType,
    activeJournalTitle,
    openJournal,
    closeJournal,
    
    // Custom journals
    customJournals,
    createCustomJournal,
    updateCustomJournal,
    deleteCustomJournal,
    
    // Delete journals
    deleteJournalsByType,
  };
}

export type { CustomJournal, JournalItem, JournalCategory };
