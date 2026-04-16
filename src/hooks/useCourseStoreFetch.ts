import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { MARKETPLACE_ORG_ID } from "@/constants/marketplace";
import type { MarketplaceCourse, MarketplaceOrder, Course, CourseRequest } from "./useCourseStoreManager";

interface FetchCallbacks {
  setCatalogCourses: (v: MarketplaceCourse[]) => void;
  setMyCourses: (v: MarketplaceCourse[]) => void;
  setReceivedOrders: (v: MarketplaceOrder[]) => void;
  setMyOrders: (v: MarketplaceOrder[]) => void;
  setAvailableCourses: (v: Course[]) => void;
  setCourseRequests: (v: CourseRequest[]) => void;
  setDbCategories: (v: { id: string; name: string; order_index: number | null; parent_type: string | null }[]) => void;
  organizationId: string;
  userId?: string;
}

export async function fetchCatalog(organizationId: string, setCatalogCourses: (v: MarketplaceCourse[]) => void) {
  const { data, error } = await supabase
    .from('marketplace_courses')
    .select(`*, course:courses(id, title, description, duration, category_id, cover_image_url), organization:organizations(name)`)
    .eq('is_active', true).neq('organization_id', organizationId);
  if (error) { console.error('Error fetching catalog:', error); return; }
  setCatalogCourses(data || []);
}

export async function fetchMyCourses(organizationId: string, setMyCourses: (v: MarketplaceCourse[]) => void) {
  const { data, error } = await supabase
    .from('marketplace_courses')
    .select(`*, course:courses(id, title, description, duration, cover_image_url)`)
    .eq('organization_id', organizationId);
  if (error) { console.error('Error fetching my courses:', error); return; }
  setMyCourses(data || []);
}

export async function fetchOrders(
  organizationId: string, userId: string | undefined,
  setReceivedOrders: (v: MarketplaceOrder[]) => void,
  setMyOrders: (v: MarketplaceOrder[]) => void
) {
  const { data: received, error } = await supabase
    .from('marketplace_orders')
    .select(`*, marketplace_course:marketplace_courses(*, course:courses(id, title), organization:organizations(name))`)
    .order('created_at', { ascending: false });
  if (error) { console.error('Error fetching orders:', error); } else {
    setReceivedOrders((received || []).filter(order => order.marketplace_course?.organization_id === organizationId));
    setMyOrders((received || []).filter(order => order.buyer_organization_id === organizationId || order.buyer_user_id === userId));
  }
}

export async function fetchAvailableCourses(organizationId: string, setAvailableCourses: (v: Course[]) => void) {
  const { data: existing } = await supabase.from('marketplace_courses').select('course_id').eq('organization_id', organizationId);
  const existingIds = new Set((existing || []).map(e => e.course_id));
  const { data: courses, error } = await supabase.from('courses').select('id, title, description, duration').eq('organization_id', organizationId).eq('is_published', true);
  if (error) { console.error('Error fetching available courses:', error); return; }
  setAvailableCourses((courses || []).filter(c => !existingIds.has(c.id)));
}

export async function fetchCourseRequests(setCourseRequests: (v: CourseRequest[]) => void) {
  const { data, error } = await supabase
    .from('course_requests').select('*').eq('status', 'active').order('created_at', { ascending: false }).limit(10);
  if (error) { console.error('Error fetching course requests:', error); return; }
  setCourseRequests(data || []);
}

export async function fetchDbCategories(setDbCategories: (v: { id: string; name: string; order_index: number | null; parent_type: string | null }[]) => void) {
  const { data, error } = await supabase
    .from('course_categories').select('id, name, order_index, parent_type')
    .eq('organization_id', MARKETPLACE_ORG_ID).order('order_index', { ascending: true });
  if (error) { console.error('Error fetching categories:', error); return; }
  setDbCategories(data || []);
}

export async function handleAddToMarketplace(
  selectedCourseToAdd: string, organizationId: string,
  priceStudent: number, priceOrganization: number, shortDescription: string,
  callbacks: { setIsAdding: (v: boolean) => void; onSuccess: () => void }
) {
  if (!selectedCourseToAdd) { toast.error('Выберите курс'); return; }
  callbacks.setIsAdding(true);
  try {
    const { error } = await supabase.from('marketplace_courses').insert({
      course_id: selectedCourseToAdd, organization_id: organizationId,
      price_student: priceStudent, price_organization: priceOrganization,
      description_short: shortDescription || null, is_active: true,
    });
    if (error) throw error;
    toast.success('Курс добавлен в магазин!');
    callbacks.onSuccess();
  } catch (error: any) {
    console.error('Error adding course:', error); toast.error('Ошибка при добавлении курса');
  } finally { callbacks.setIsAdding(false); }
}

export async function handleToggleActive(course: MarketplaceCourse, onRefresh: () => void) {
  try {
    const { error } = await supabase.from('marketplace_courses').update({ is_active: !course.is_active }).eq('id', course.id);
    if (error) throw error;
    toast.success(course.is_active ? 'Курс скрыт из каталога' : 'Курс опубликован в каталоге');
    onRefresh();
  } catch (error) { console.error('Error toggling course:', error); toast.error('Ошибка при изменении статуса'); }
}

export async function handleDeleteFromMarketplace(courseId: string, onRefresh: () => void) {
  try {
    const { error } = await supabase.from('marketplace_courses').delete().eq('id', courseId);
    if (error) throw error;
    toast.success('Курс удалён из магазина'); onRefresh();
  } catch (error) { console.error('Error deleting course:', error); toast.error('Ошибка при удалении курса'); }
}

export async function handleEditCourse(editingCourse: MarketplaceCourse | null, callbacks: { onSuccess: () => void }) {
  if (!editingCourse) return;
  try {
    const { error } = await supabase.from('marketplace_courses').update({
      price_student: editingCourse.price_student,
      price_organization: editingCourse.price_organization,
      description_short: editingCourse.description_short,
    }).eq('id', editingCourse.id);
    if (error) throw error;
    toast.success('Курс обновлён'); callbacks.onSuccess();
  } catch (error) { console.error('Error updating course:', error); toast.error('Ошибка при обновлении'); }
}
