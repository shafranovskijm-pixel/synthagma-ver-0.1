import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MARKETPLACE_ORG_ID } from "@/constants/marketplace";

interface MarketplaceCourseWithDetails {
  id: string;
  course_id: string;
  organization_id: string | null;
  price_student: number;
  price_organization: number;
  is_active: boolean;
  description_short: string | null;
  preview_image_url: string | null;
  created_at: string;
  course?: { id: string; title: string; description: string | null; duration: string | null; category_id?: string | null };
  organization?: { name: string } | null;
}

interface MarketplaceOrder {
  id: string;
  marketplace_course_id: string;
  buyer_user_id: string | null;
  buyer_organization_id: string | null;
  buyer_type: string;
  status: string;
  price: number;
  students_count: number | null;
  notes: string | null;
  payment_method: string | null;
  created_at: string;
  marketplace_course?: {
    id: string;
    course?: { id: string; title: string };
    organization?: { name: string } | null;
  };
  buyer_organization?: { name: string } | null;
  buyer_profile?: { full_name: string | null; email: string | null } | null;
}

export interface DbCategory {
  id: string;
  name: string;
  color: string | null;
  order_index: number;
  parent_type: string | null;
  icon: string | null;
}

export function useAdminMarketplace() {
  const [activeTab, setActiveTab] = useState<"catalog" | "create" | "import" | "orders" | "programs" | "knowledge" | "generator">("catalog");
  const [isLoading, setIsLoading] = useState(true);
  const [courses, setCourses] = useState<MarketplaceCourseWithDetails[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  // Create course form
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newDuration, setNewDuration] = useState("");
  const [newPriceStudent, setNewPriceStudent] = useState("");
  const [newPriceOrg, setNewPriceOrg] = useState("");
  const [newShortDesc, setNewShortDesc] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // DB categories for marketplace org
  const [dbCategories, setDbCategories] = useState<DbCategory[]>([]);

  // Edit dialog
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingCourse, setEditingCourse] = useState<MarketplaceCourseWithDetails | null>(null);

  // Order details
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<MarketplaceOrder | null>(null);

  // Category management
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [showMoveCategoryDialog, setShowMoveCategoryDialog] = useState(false);
  const [movingCourse, setMovingCourse] = useState<MarketplaceCourseWithDetails | null>(null);
  const [targetCategory, setTargetCategory] = useState("");
  const [newMoveCategoryInput, setNewMoveCategoryInput] = useState("");

  useEffect(() => {
    fetchData();
    fetchDbCategories();
  }, []);

  const fetchDbCategories = async () => {
    const { data } = await supabase
      .from("course_categories")
      .select("id, name, color, order_index, parent_type, icon")
      .eq("organization_id", MARKETPLACE_ORG_ID)
      .order("order_index");
    setDbCategories((data || []).map(d => ({
      ...d,
      order_index: (d as any).order_index ?? 0,
      parent_type: (d as any).parent_type ?? "Повышение квалификации",
      icon: (d as any).icon ?? null,
    })));
  };

  const fetchData = async () => {
    setIsLoading(true);
    await Promise.all([fetchCourses(), fetchOrders()]);
    setIsLoading(false);
  };

  const fetchCourses = async () => {
    const { data, error } = await supabase
      .from("marketplace_courses")
      .select("*, course:courses(id, title, description, duration, category_id), organization:organizations(name)")
      .order("created_at", { ascending: false });
    if (error) { console.error("Error fetching marketplace courses:", error); return; }
    setCourses(data || []);
  };

  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from("marketplace_orders")
      .select("*, marketplace_course:marketplace_courses(id, course:courses(id, title), organization:organizations(name)), buyer_organization:organizations!marketplace_orders_buyer_organization_id_fkey(name)")
      .order("created_at", { ascending: false });
    if (error) { console.error("Error fetching orders:", error); return; }
    
    const studentUserIds = (data || [])
      .filter((o) => o.buyer_type === "student" && o.buyer_user_id)
      .map((o) => o.buyer_user_id!);
    
    let profilesMap: Record<string, { full_name: string | null; email: string | null }> = {};
    if (studentUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", studentUserIds);
      if (profiles) {
        for (const p of profiles) {
          profilesMap[p.user_id] = { full_name: p.full_name, email: p.email };
        }
      }
    }
    
    const ordersWithProfiles = (data || []).map((o) => ({
      ...o,
      buyer_profile: o.buyer_user_id ? profilesMap[o.buyer_user_id] || null : null,
    }));
    setOrders(ordersWithProfiles as MarketplaceOrder[]);
  };

  const handleCreateCourse = async (): Promise<string | null> => {
    if (!newTitle.trim() || !newPriceStudent || !newPriceOrg) {
      toast.error("Заполните все обязательные поля");
      return null;
    }
    setIsCreating(true);
    try {
      let platformOrgId: string;
      const { data: existingOrg } = await supabase
        .from("organizations")
        .select("id")
        .eq("name", "Платформа Синтагма")
        .maybeSingle();
      
      if (existingOrg) {
        platformOrgId = existingOrg.id;
      } else {
        const { data: newOrg, error: orgError } = await supabase
          .from("organizations")
          .insert({ name: "Платформа Синтагма", email: "platform@synthagma.ru" })
          .select("id")
          .single();
        if (orgError) throw orgError;
        platformOrgId = newOrg.id;
      }

      const { data: courseData, error: courseError } = await supabase
        .from("courses")
        .insert({
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          duration: newDuration.trim() || null,
          organization_id: platformOrgId,
          category_id: newCategoryId || null,
          is_published: true,
        })
        .select("id")
        .single();
      if (courseError) throw courseError;

      const { error: mpError } = await supabase
        .from("marketplace_courses")
        .insert({
          course_id: courseData.id,
          organization_id: platformOrgId,
          price_student: parseFloat(newPriceStudent),
          price_organization: parseFloat(newPriceOrg),
          description_short: newShortDesc.trim() || null,
          is_active: true,
        });
      if (mpError) throw mpError;

      toast.success("Курс создан! Перенаправление в редактор...");
      resetCreateForm();
      fetchCourses();
      return courseData.id;
    } catch (error: unknown) {
      console.error("Error creating course:", error);
      toast.error("Ошибка при создании курса");
      return null;
    } finally {
      setIsCreating(false);
    }
  };

  const resetCreateForm = () => {
    setNewTitle(""); setNewDescription(""); setNewDuration("");
    setNewPriceStudent(""); setNewPriceOrg(""); setNewShortDesc("");
    setNewCategoryId("");
  };

  const handleToggleActive = async (course: MarketplaceCourseWithDetails) => {
    try {
      const { error } = await supabase
        .from("marketplace_courses")
        .update({ is_active: !course.is_active })
        .eq("id", course.id);
      if (error) throw error;
      toast.success(course.is_active ? "Курс скрыт" : "Курс активирован");
      fetchCourses();
    } catch (error) {
      toast.error("Ошибка при изменении статуса");
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    try {
      const { data: orders } = await supabase
        .from("marketplace_orders")
        .select("id")
        .eq("marketplace_course_id", courseId);
      
      const orderIds = (orders || []).map(o => o.id);
      
      if (orderIds.length > 0) {
        for (const oid of orderIds) {
          await supabase.from("balance_transactions").update({ related_order_id: null }).eq("related_order_id", oid);
        }
        for (const oid of orderIds) {
          await supabase.from("courses").update({ source_order_id: null }).eq("source_order_id", oid);
        }
      }

      const { error } = await supabase.from("marketplace_courses").delete().eq("id", courseId);
      if (error) throw error;
      toast.success("Курс удалён из маркетплейса");
      fetchCourses();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Ошибка при удалении");
    }
  };

  const handleEditCourse = async () => {
    if (!editingCourse) return;
    try {
      const { error } = await supabase
        .from("marketplace_courses")
        .update({
          price_student: editingCourse.price_student,
          price_organization: editingCourse.price_organization,
          description_short: editingCourse.description_short,
        })
        .eq("id", editingCourse.id);
      if (error) throw error;

      if (editingCourse.course?.id) {
        await supabase
          .from("courses")
          .update({ duration: editingCourse.course.duration || null })
          .eq("id", editingCourse.course.id);
      }

      toast.success("Курс обновлён");
      setShowEditDialog(false);
      fetchCourses();
    } catch (error) {
      toast.error("Ошибка при обновлении");
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const updateData: Record<string, any> = { status: newStatus };
      if (newStatus === "paid") updateData.paid_at = new Date().toISOString();
      const { error } = await supabase.from("marketplace_orders").update(updateData).eq("id", orderId);
      if (error) throw error;
      toast.success("Статус обновлён");
      setShowOrderDialog(false);
      fetchOrders();
    } catch (error) {
      toast.error("Ошибка при обновлении статуса");
    }
  };

  // Extract short title (strip category prefix "Category — Title")
  const extractShortTitle = (title: string | undefined): string => {
    if (!title) return "";
    const dashIndex = title.indexOf(" — ");
    return dashIndex > 0 ? title.substring(dashIndex + 3) : title;
  };

  // Get category name for a course (DB-based via category_id)
  const getCourseCategory = (course: MarketplaceCourseWithDetails): DbCategory | null => {
    const catId = course.course?.category_id;
    if (!catId) return null;
    return dbCategories.find(c => c.id === catId) || null;
  };

  const getCategoryName = (course: MarketplaceCourseWithDetails): string => {
    return getCourseCategory(course)?.name || "Без категории";
  };

  // Legacy extractCategory for backward compat
  const extractCategory = (title: string | undefined): string => {
    if (!title) return "Без категории";
    const dashIndex = title.indexOf(" — ");
    return dashIndex > 0 ? title.substring(0, dashIndex) : "Без категории";
  };

  // Categories list (DB-based)
  const categories = [
    ...dbCategories.map(c => c.name),
    ...customCategories.filter(c => !dbCategories.some(d => d.name === c)),
  ];

  const filteredCourses = courses.filter(c => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!c.course?.title.toLowerCase().includes(q) && !c.organization?.name?.toLowerCase().includes(q)) return false;
    }
    if (selectedCategory !== "all") {
      const catName = getCategoryName(c);
      if (catName !== selectedCategory) return false;
    }
    return true;
  });

  // Group courses by DB category_id, ordered by dbCategories order_index
  const groupedCourses = (() => {
    const byCatId = new Map<string, MarketplaceCourseWithDetails[]>();
    const uncategorized: MarketplaceCourseWithDetails[] = [];

    for (const c of filteredCourses) {
      const catId = c.course?.category_id;
      if (catId) {
        if (!byCatId.has(catId)) byCatId.set(catId, []);
        byCatId.get(catId)!.push(c);
      } else {
        uncategorized.push(c);
      }
    }

    return PROGRAM_TYPE_GROUPS.map(pt => {
      const subGroups = dbCategories
        .filter(cat => (cat.parent_type || "Повышение квалификации") === pt.category)
        .map(cat => ({
          category: cat.name,
          categoryId: cat.id,
          icon: cat.icon,
          courses: byCatId.get(cat.id) || [],
        }));

      const subCourses = subGroups.flatMap(g => g.courses);
      const groupUncategorized = pt.category === "Повышение квалификации" ? uncategorized : [];
      const courses = [...subCourses, ...groupUncategorized];

      return { category: pt.category, badge: pt.badge, courses, uncategorized: groupUncategorized, subGroups };
    });
  })();

  // State for new category parent_type & icon
  const [newCategoryParentType, setNewCategoryParentType] = useState("Повышение квалификации");
  const [newCategoryIcon, setNewCategoryIcon] = useState<string | null>(null);

  const handleCreateCategory = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (dbCategories.some(c => c.name === trimmed && (c.parent_type || "Повышение квалификации") === newCategoryParentType)) {
      toast.error("Такая категория уже существует");
      return;
    }
    try {
      const maxOrder = dbCategories
        .filter(c => (c.parent_type || "Повышение квалификации") === newCategoryParentType)
        .reduce((max, c) => Math.max(max, c.order_index), -1);

      const { error } = await supabase.from("course_categories").insert({
        name: trimmed,
        organization_id: MARKETPLACE_ORG_ID,
        order_index: maxOrder + 1,
        parent_type: newCategoryParentType,
        icon: newCategoryIcon,
      } as any);
      if (error) throw error;
      setNewCategoryName("");
      setNewCategoryIcon(null);
      setShowCategoryDialog(false);
      toast.success(`Категория "${trimmed}" создана`);
      fetchDbCategories();
    } catch (err) {
      console.error("Error creating category:", err);
      toast.error("Ошибка при создании категории");
    }
  };

  // Move course to a DB category via category_id
  const handleMoveToCategory = async (course: MarketplaceCourseWithDetails, newCategoryIdOrName: string) => {
    if (!course.course?.id) return;
    try {
      // Check if it's a DB category id or name
      let catId: string | null = null;
      if (newCategoryIdOrName === "__none__") {
        catId = null;
      } else {
        const dbCat = dbCategories.find(c => c.id === newCategoryIdOrName || c.name === newCategoryIdOrName);
        catId = dbCat?.id || null;
      }
      
      const { error } = await supabase
        .from("courses")
        .update({ category_id: catId })
        .eq("id", course.course.id);
      if (error) throw error;
      toast.success("Курс перемещён");
      setShowMoveCategoryDialog(false);
      setMovingCourse(null);
      setNewMoveCategoryInput("");
      fetchCourses();
    } catch {
      toast.error("Ошибка перемещения");
    }
  };

  // Bulk move courses to a category
  const handleBulkMoveToCategory = async (courseIds: string[], categoryIdOrName: string) => {
    try {
      let catId: string | null = null;
      if (categoryIdOrName === "__none__") {
        catId = null;
      } else {
        const dbCat = dbCategories.find(c => c.id === categoryIdOrName || c.name === categoryIdOrName);
        catId = dbCat?.id || null;
      }
      
      const { error } = await supabase
        .from("courses")
        .update({ category_id: catId })
        .in("id", courseIds);
      if (error) throw error;
      toast.success(`Перемещено ${courseIds.length} курсов`);
      setShowMoveCategoryDialog(false);
      setMovingCourse(null);
      fetchCourses();
    } catch {
      toast.error("Ошибка перемещения");
    }
  };

  // Reorder categories via order_index
  const handleReorderCategories = async (reorderedCategories: DbCategory[]) => {
    // Optimistic update
    setDbCategories(reorderedCategories);
    
    // Persist order_index changes
    try {
      for (let i = 0; i < reorderedCategories.length; i++) {
        const cat = reorderedCategories[i];
        if (cat.order_index !== i) {
          await supabase
            .from("course_categories")
            .update({ order_index: i } as any)
            .eq("id", cat.id);
        }
      }
    } catch (error) {
      console.error("Error reordering categories:", error);
      toast.error("Ошибка при сортировке категорий");
      fetchDbCategories(); // Revert
    }
  };

  // Auto-categorize courses by keyword matching
  const handleAutoCategorize = async () => {
    const keywordMappings: { keywords: string[]; categoryName: string; parentType: string; icon: string }[] = [
      { keywords: ["первая помощь", "медицин", "оказание помощи", "оказание первой помощи", "мероприятия по оказанию", "санитарн"], categoryName: "Медицина", parentType: "Охрана труда / Пожарная безопасность", icon: "Lightbulb" },
      { keywords: ["охрана труда", "безопасные условия", "правила по охране труда", "техники безопасности", "правила техники безопасности"], categoryName: "Охрана труда", parentType: "Охрана труда / Пожарная безопасность", icon: "ShieldCheck" },
      { keywords: ["пожарная безопасность", "пожарно-технический", "пожарн", "противопожарн"], categoryName: "Пожарная безопасность", parentType: "Охрана труда / Пожарная безопасность", icon: "Flame" },
      { keywords: ["промышленная безопасность", "ростехнадзор"], categoryName: "Промышленная безопасность", parentType: "Повышение квалификации", icon: "Factory" },
      { keywords: ["электробезопасность", "электроустановк", "электроустановок", "электроустановки", "эксплуатации электроуст"], categoryName: "Электробезопасность", parentType: "Повышение квалификации", icon: "Zap" },
      { keywords: ["энергетик", "теплоснабж", "котельн", "электрических станций", "электростанций", "электроэнергетич", "тепломеханич", "тепловых энерго"], categoryName: "Энергетика", parentType: "Повышение квалификации", icon: "Flame" },
      { keywords: ["экологич", "отходы"], categoryName: "Экологическая безопасность", parentType: "Повышение квалификации", icon: "Leaf" },
      { keywords: ["гидротехнич", "ГТС"], categoryName: "Гидротехнические сооружения", parentType: "Повышение квалификации", icon: "Droplets" },
      { keywords: ["строительный контроль", "строительн"], categoryName: "Строительный контроль", parentType: "Повышение квалификации", icon: "HardHat" },
    ];

    try {
      // 1. Ensure all target categories exist
      const catMap = new Map<string, string>(); // name -> id
      for (const cat of dbCategories) {
        catMap.set(cat.name, cat.id);
      }

      for (const mapping of keywordMappings) {
        if (!catMap.has(mapping.categoryName)) {
          const maxOrder = dbCategories
            .filter(c => (c.parent_type || "Повышение квалификации") === mapping.parentType)
            .reduce((max, c) => Math.max(max, c.order_index), -1);

          const { data, error } = await supabase.from("course_categories").insert({
            name: mapping.categoryName,
            organization_id: MARKETPLACE_ORG_ID,
            order_index: maxOrder + 1,
            parent_type: mapping.parentType,
            icon: mapping.icon,
          } as any).select("id").single();
          if (error) { console.error("Error creating category:", error); continue; }
          catMap.set(mapping.categoryName, data.id);
        }
      }

      // 2. Find uncategorized courses and match by keywords
      const uncategorized = courses.filter(c => !c.course?.category_id);
      let matched = 0;

      for (const course of uncategorized) {
        const title = (course.course?.title || "").toLowerCase();
        let targetCatId: string | null = null;

        for (const mapping of keywordMappings) {
          if (mapping.keywords.some(kw => title.includes(kw.toLowerCase()))) {
            targetCatId = catMap.get(mapping.categoryName) || null;
            break;
          }
        }

        if (targetCatId && course.course?.id) {
          const { error } = await supabase
            .from("courses")
            .update({ category_id: targetCatId })
            .eq("id", course.course.id);
          if (!error) matched++;
        }
      }

      toast.success(`Распределено ${matched} из ${uncategorized.length} курсов`);
      await fetchDbCategories();
      await fetchCourses();
    } catch (error) {
      console.error("Auto-categorize error:", error);
      toast.error("Ошибка авто-распределения");
    }
  };

  return {
    activeTab, setActiveTab, isLoading, searchQuery, setSearchQuery,
    selectedCategory, setSelectedCategory, viewMode, setViewMode,
    courses, filteredCourses, groupedCourses, orders, categories, extractCategory, extractShortTitle,
    getCategoryName,
    // Create
    newTitle, setNewTitle, newDescription, setNewDescription,
    newDuration, setNewDuration, newPriceStudent, setNewPriceStudent,
    newPriceOrg, setNewPriceOrg, newShortDesc, setNewShortDesc,
    newCategoryId, setNewCategoryId, dbCategories,
    isCreating, handleCreateCourse,
    // Edit
    showEditDialog, setShowEditDialog, editingCourse, setEditingCourse, handleEditCourse,
    // Toggle/delete
    handleToggleActive, handleDeleteCourse,
    // Orders
    showOrderDialog, setShowOrderDialog, selectedOrder, setSelectedOrder,
    handleUpdateOrderStatus,
    fetchData,
    // Categories
    showCategoryDialog, setShowCategoryDialog, newCategoryName, setNewCategoryName,
    newCategoryParentType, setNewCategoryParentType,
    newCategoryIcon, setNewCategoryIcon,
    handleCreateCategory,
    showMoveCategoryDialog, setShowMoveCategoryDialog,
    movingCourse, setMovingCourse, targetCategory, setTargetCategory,
    newMoveCategoryInput, setNewMoveCategoryInput,
    handleMoveToCategory,
    handleBulkMoveToCategory,
    handleReorderCategories,
    fetchDbCategories,
    handleAutoCategorize,
  };
}
