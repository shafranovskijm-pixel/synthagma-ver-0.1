import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  course?: { id: string; title: string; description: string | null; duration: string | null };
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

export function useAdminMarketplace() {
  const [activeTab, setActiveTab] = useState<"catalog" | "create" | "import" | "orders">("catalog");
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
  const [dbCategories, setDbCategories] = useState<{ id: string; name: string; color: string | null }[]>([]);

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
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    await Promise.all([fetchCourses(), fetchOrders()]);
    setIsLoading(false);
  };

  const fetchCourses = async () => {
    const { data, error } = await supabase
      .from("marketplace_courses")
      .select("*, course:courses(id, title, description, duration), organization:organizations(name)")
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
    
    // Fetch buyer profiles for student orders
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
    } catch (error: any) {
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
      // 1. Get all orders for this marketplace course
      const { data: orders } = await supabase
        .from("marketplace_orders")
        .select("id")
        .eq("marketplace_course_id", courseId);
      
      const orderIds = (orders || []).map(o => o.id);
      
      if (orderIds.length > 0) {
        // 2. Clear balance_transactions referencing these orders
        for (const oid of orderIds) {
          await supabase.from("balance_transactions").update({ related_order_id: null }).eq("related_order_id", oid);
        }
        // 3. Clear courses.source_order_id referencing these orders
        for (const oid of orderIds) {
          await supabase.from("courses").update({ source_order_id: null }).eq("source_order_id", oid);
        }
      }

      // 4. Delete marketplace course (cascades to orders and comments)
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

      // Update duration in courses table
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

  // Extract categories from course titles (prefix before " — ")
  const extractCategory = (title: string | undefined): string => {
    if (!title) return "Без категории";
    const dashIndex = title.indexOf(" — ");
    return dashIndex > 0 ? title.substring(0, dashIndex) : "Без категории";
  };

  const extractShortTitle = (title: string | undefined): string => {
    if (!title) return "";
    const dashIndex = title.indexOf(" — ");
    return dashIndex > 0 ? title.substring(dashIndex + 3) : title;
  };

  // Merge DB-derived categories with custom-created ones
  const categories = Array.from(new Set([
    ...courses.map(c => extractCategory(c.course?.title)),
    ...customCategories,
  ])).sort();

  const handleCreateCategory = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (categories.includes(trimmed)) {
      toast.error("Такая категория уже существует");
      return;
    }
    setCustomCategories(prev => [...prev, trimmed]);
    setNewCategoryName("");
    setShowCategoryDialog(false);
    toast.success(`Категория "${trimmed}" создана`);
  };

  const handleMoveToCategory = async (course: MarketplaceCourseWithDetails, newCategory: string) => {
    if (!course.course?.id) return;
    const shortTitle = extractShortTitle(course.course.title);
    const newTitle = newCategory === "__none__"
      ? shortTitle
      : `${newCategory} — ${shortTitle}`;
    try {
      const { error } = await supabase
        .from("courses")
        .update({ title: newTitle })
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

  const filteredCourses = courses.filter(c => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!c.course?.title.toLowerCase().includes(q) && !c.organization?.name?.toLowerCase().includes(q)) return false;
    }
    if (selectedCategory !== "all" && extractCategory(c.course?.title) !== selectedCategory) return false;
    return true;
  });

  // Group filtered courses by category, split into "ready" (is_validated) and "in progress"
  const EXCLUDED_FROM_RTN = ["Охрана труда при работах на высоте"];
  
  const groupedCourses: { category: string; courses: MarketplaceCourseWithDetails[]; status?: 'ready' | 'progress'; subGroups?: { category: string; courses: MarketplaceCourseWithDetails[] }[] }[] = (() => {
    const map = new Map<string, MarketplaceCourseWithDetails[]>();
    for (const c of filteredCourses) {
      const cat = extractCategory(c.course?.title);
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(c);
    }
    
    const rtnReadySubGroups: { category: string; courses: MarketplaceCourseWithDetails[] }[] = [];
    const rtnProgressSubGroups: { category: string; courses: MarketplaceCourseWithDetails[] }[] = [];
    const standalone: { category: string; courses: MarketplaceCourseWithDetails[]; status?: 'ready' | 'progress' }[] = [];
    
    for (const [category, courses] of Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))) {
      if (EXCLUDED_FROM_RTN.includes(category)) {
        standalone.push({ category, courses });
      } else {
        const ready = courses.filter(c => (c as any).is_validated === true);
        const progress = courses.filter(c => (c as any).is_validated !== true);
        if (ready.length > 0) rtnReadySubGroups.push({ category, courses: ready });
        if (progress.length > 0) rtnProgressSubGroups.push({ category, courses: progress });
      }
    }
    
    const result: { category: string; courses: MarketplaceCourseWithDetails[]; status?: 'ready' | 'progress'; subGroups?: { category: string; courses: MarketplaceCourseWithDetails[] }[] }[] = [];
    if (rtnReadySubGroups.length > 0) {
      const allReady = rtnReadySubGroups.flatMap(g => g.courses);
      result.push({ category: "Курсы Ростехнадзора", courses: allReady, status: 'ready', subGroups: rtnReadySubGroups });
    }
    if (rtnProgressSubGroups.length > 0) {
      const allProgress = rtnProgressSubGroups.flatMap(g => g.courses);
      result.push({ category: "В работе", courses: allProgress, status: 'progress', subGroups: rtnProgressSubGroups });
    }
    result.push(...standalone);
    return result;
  })();

  return {
    activeTab, setActiveTab, isLoading, searchQuery, setSearchQuery,
    selectedCategory, setSelectedCategory, viewMode, setViewMode,
    courses, filteredCourses, groupedCourses, orders, categories, extractCategory, extractShortTitle,
    // Create
    newTitle, setNewTitle, newDescription, setNewDescription,
    newDuration, setNewDuration, newPriceStudent, setNewPriceStudent,
    newPriceOrg, setNewPriceOrg, newShortDesc, setNewShortDesc,
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
    handleCreateCategory,
    showMoveCategoryDialog, setShowMoveCategoryDialog,
    movingCourse, setMovingCourse, targetCategory, setTargetCategory,
    newMoveCategoryInput, setNewMoveCategoryInput,
    handleMoveToCategory,
  };
}
