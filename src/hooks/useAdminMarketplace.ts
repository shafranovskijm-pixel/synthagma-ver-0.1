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
}

export function useAdminMarketplace() {
  const [activeTab, setActiveTab] = useState<"catalog" | "create" | "orders">("catalog");
  const [isLoading, setIsLoading] = useState(true);
  const [courses, setCourses] = useState<MarketplaceCourseWithDetails[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Create course form
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newDuration, setNewDuration] = useState("");
  const [newPriceStudent, setNewPriceStudent] = useState("");
  const [newPriceOrg, setNewPriceOrg] = useState("");
  const [newShortDesc, setNewShortDesc] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Edit dialog
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingCourse, setEditingCourse] = useState<MarketplaceCourseWithDetails | null>(null);

  // Order details
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<MarketplaceOrder | null>(null);

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
    setOrders(data || []);
  };

  const handleCreateCourse = async () => {
    if (!newTitle.trim() || !newPriceStudent || !newPriceOrg) {
      toast.error("Заполните все обязательные поля");
      return;
    }
    setIsCreating(true);
    try {
      // 1. Create a course record without organization_id — use a special approach
      // Since courses.organization_id is NOT NULL, we need a platform org or workaround.
      // For admin courses, we'll create a course with a null-safe approach using raw insert
      // Actually courses table requires organization_id. Let's check if we can use RPC or direct SQL.
      // Workaround: create a "platform" pseudo-entry. For now, use the first available org or skip.
      
      // Better approach: create the course via the courses table with a dummy org,
      // then the marketplace_courses entry with organization_id = NULL
      // But courses.organization_id is NOT NULL... 
      // The plan says marketplace_courses.organization_id is nullable, but courses still needs one.
      // We need to handle this. Let's create a simple approach:
      // Admin creates the course entry AND marketplace listing in one go.
      // For the underlying course, we'll need a platform org.

      // Check if platform org exists, create if not
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

      // 2. Create the course
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

      // 3. Create marketplace listing (no organization_id = platform course)
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

      toast.success("Курс создан и добавлен в маркетплейс!");
      resetCreateForm();
      setActiveTab("catalog");
      fetchCourses();
    } catch (error: any) {
      console.error("Error creating course:", error);
      toast.error("Ошибка при создании курса");
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
      const { error } = await supabase.from("marketplace_courses").delete().eq("id", courseId);
      if (error) throw error;
      toast.success("Курс удалён из маркетплейса");
      fetchCourses();
    } catch (error) {
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

  const filteredCourses = courses.filter(c =>
    c.course?.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.organization?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return {
    activeTab, setActiveTab, isLoading, searchQuery, setSearchQuery,
    courses, filteredCourses, orders,
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
  };
}
