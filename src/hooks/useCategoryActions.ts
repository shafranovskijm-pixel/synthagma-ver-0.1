import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CourseCategory {
  id: string;
  name: string;
  color: string;
}

export function useCategoryActions(organizationId: string | null) {
  const [categories, setCategories] = useState<CourseCategory[]>([]);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  const fetchCategories = useCallback(async () => {
    if (!organizationId) return;
    try {
      const { data } = await supabase
        .from("course_categories")
        .select("*")
        .eq("organization_id", organizationId)
        .order("name");
      setCategories(data || []);
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  }, [organizationId]);

  const createCategory = useCallback(async (name: string, color: string) => {
    if (!organizationId || !name.trim()) {
      toast.error("Введите название категории");
      return null;
    }

    setIsCreatingCategory(true);
    try {
      const { data, error } = await supabase
        .from("course_categories")
        .insert({
          organization_id: organizationId,
          name: name.trim(),
          color
        })
        .select()
        .single();

      if (error) throw error;
      setCategories(prev => [...prev, data]);
      toast.success("Категория создана");
      return data;
    } catch (error) {
      console.error("Error creating category:", error);
      toast.error("Ошибка создания категории");
      return null;
    } finally {
      setIsCreatingCategory(false);
    }
  }, [organizationId]);

  const setCourseCategory = useCallback(async (courseId: string, categoryId: string | null) => {
    try {
      const { error } = await supabase
        .from("courses")
        .update({ category_id: categoryId })
        .eq("id", courseId);

      if (error) throw error;
      toast.success("Категория назначена");
      return true;
    } catch (error) {
      console.error("Error setting category:", error);
      toast.error("Ошибка назначения категории");
      return false;
    }
  }, []);

  const getCategoryById = useCallback((categoryId: string | null | undefined): CourseCategory | undefined => {
    if (!categoryId) return undefined;
    return categories.find(c => c.id === categoryId);
  }, [categories]);

  return {
    categories,
    setCategories,
    isCreatingCategory,
    fetchCategories,
    createCategory,
    setCourseCategory,
    getCategoryById,
  };
}
