import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MARKETPLACE_ORG_ID } from "@/constants/marketplace";

interface CourseWithDetails {
  id: string;
  course_id: string;
  course?: { id: string; title: string; description: string | null; duration: string | null; category_id?: string | null };
  price_student: number;
  price_organization: number;
  description_short: string | null;
  is_active: boolean;
  organization_id: string | null;
}

interface DbCategory {
  id: string;
  name: string;
  color: string | null;
  order_index: number;
  parent_type: string | null;
  icon: string | null;
}

export async function fetchMarketplaceCourses() {
  const { data, error } = await supabase
    .from("marketplace_courses")
    .select("*, course:courses(id, title, description, duration, category_id), organization:organizations(name)")
    .order("created_at", { ascending: false });
  if (error) { console.error("Error fetching marketplace courses:", error); return []; }
  return data || [];
}

export async function fetchMarketplaceOrders() {
  const { data, error } = await supabase
    .from("marketplace_orders")
    .select("*, marketplace_course:marketplace_courses(id, course:courses(id, title), organization:organizations(name)), buyer_organization:organizations!marketplace_orders_buyer_organization_id_fkey(name)")
    .order("created_at", { ascending: false });
  if (error) { console.error("Error fetching orders:", error); return []; }

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

  return (data || []).map((o) => ({
    ...o,
    buyer_profile: o.buyer_user_id ? profilesMap[o.buyer_user_id] || null : null,
  }));
}

export async function fetchDbCategoriesData() {
  const { data } = await supabase
    .from("course_categories")
    .select("id, name, color, order_index, parent_type, icon")
    .eq("organization_id", MARKETPLACE_ORG_ID)
    .order("order_index");
  return (data || []).map(d => ({
    ...d,
    order_index: (d as any).order_index ?? 0,
    parent_type: (d as any).parent_type ?? "Повышение квалификации",
    icon: (d as any).icon ?? null,
  }));
}

export async function toggleCourseActive(course: CourseWithDetails) {
  const { error } = await supabase
    .from("marketplace_courses")
    .update({ is_active: !course.is_active })
    .eq("id", course.id);
  if (error) throw error;
  toast.success(course.is_active ? "Курс скрыт" : "Курс активирован");
}

export async function deleteCourse(courseId: string) {
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
}

export async function editCourse(editingCourse: CourseWithDetails) {
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
}

export async function createCategory(
  name: string,
  parentType: string,
  icon: string | null,
  dbCategories: DbCategory[]
) {
  const trimmed = name.trim();
  if (!trimmed) return;
  if (dbCategories.some(c => c.name === trimmed && (c.parent_type || "Повышение квалификации") === parentType)) {
    toast.error("Такая категория уже существует");
    return;
  }
  const maxOrder = dbCategories
    .filter(c => (c.parent_type || "Повышение квалификации") === parentType)
    .reduce((max, c) => Math.max(max, c.order_index), -1);

  const { error } = await supabase.from("course_categories").insert({
    name: trimmed,
    organization_id: MARKETPLACE_ORG_ID,
    order_index: maxOrder + 1,
    parent_type: parentType,
    icon,
  } as any);
  if (error) throw error;
  toast.success(`Категория "${trimmed}" создана`);
}

export async function moveCourseToCategory(
  courseId: string,
  newCategoryIdOrName: string,
  dbCategories: DbCategory[]
) {
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
    .eq("id", courseId);
  if (error) throw error;
  toast.success("Курс перемещён");
}

export async function reorderCategories(reorderedCategories: DbCategory[]) {
  for (let i = 0; i < reorderedCategories.length; i++) {
    const cat = reorderedCategories[i];
    if (cat.order_index !== i) {
      await supabase
        .from("course_categories")
        .update({ order_index: i } as any)
        .eq("id", cat.id);
    }
  }
}
