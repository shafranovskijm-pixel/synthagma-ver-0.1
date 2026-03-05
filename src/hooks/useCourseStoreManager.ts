import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";

interface Course {
  id: string;
  title: string;
  description?: string | null;
  duration?: string | null;
}

interface MarketplaceCourse {
  id: string;
  course_id: string;
  organization_id: string;
  price_student: number;
  price_organization: number;
  is_active: boolean;
  description_short: string | null;
  preview_image_url: string | null;
  created_at: string;
  course?: {
    id: string;
    title: string;
    description?: string | null;
    duration?: string | null;
  };
  organization?: { name: string };
}

interface MarketplaceOrder {
  id: string;
  marketplace_course_id: string;
  buyer_user_id: string | null;
  buyer_organization_id: string | null;
  buyer_type: string;
  status: string;
  price: number;
  students_count: number;
  notes: string | null;
  payment_method: string | null;
  created_at: string;
  marketplace_course?: {
    id: string;
    course_id: string;
    organization_id: string;
    price_student: number;
    price_organization: number;
    is_active: boolean;
    description_short: string | null;
    preview_image_url: string | null;
    created_at: string;
    course?: { id: string; title: string };
    organization?: { name: string };
  };
}

interface CourseRequest {
  id: string;
  organization_id: string | null;
  user_id: string;
  title: string;
  description: string | null;
  budget_min: number | null;
  budget_max: number | null;
  students_count: number | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  created_at: string;
}

export type { Course, MarketplaceCourse, MarketplaceOrder, CourseRequest };

interface UseCourseStoreManagerProps {
  organizationId: string;
  userRole?: 'organization' | 'student';
  userId?: string;
  orgBalance?: number;
  deductBalance?: (amount: number, description: string, orderId?: string) => Promise<boolean>;
}

export function useCourseStoreManager({ organizationId, userRole = 'organization', userId, orgBalance, deductBalance }: UseCourseStoreManagerProps) {
  const { checkLimit, refetch: refetchLimits } = useSubscriptionLimits(organizationId);
  const [activeTab, setActiveTab] = useState<'catalog' | 'my-courses' | 'orders' | 'my-orders'>('catalog');
  const [isLoading, setIsLoading] = useState(true);
  const [catalogCourses, setCatalogCourses] = useState<MarketplaceCourse[]>([]);
  const [myCourses, setMyCourses] = useState<MarketplaceCourse[]>([]);
  const [myOrders, setMyOrders] = useState<MarketplaceOrder[]>([]);
  const [receivedOrders, setReceivedOrders] = useState<MarketplaceOrder[]>([]);
  const [availableCourses, setAvailableCourses] = useState<Course[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Add course to marketplace
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedCourseToAdd, setSelectedCourseToAdd] = useState("");
  const [priceStudent, setPriceStudent] = useState("");
  const [priceOrg, setPriceOrg] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Order dialog
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [selectedCourseForOrder, setSelectedCourseForOrder] = useState<MarketplaceCourse | null>(null);
  const [orderNotes, setOrderNotes] = useState("");
  const [studentsCount, setStudentsCount] = useState(1);
  const [isOrdering, setIsOrdering] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [payFromBalance, setPayFromBalance] = useState(false);
  const [purchasedFromBalance, setPurchasedFromBalance] = useState(false);
  // Edit dialog
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingCourse, setEditingCourse] = useState<MarketplaceCourse | null>(null);

  // Order details dialog
  const [showOrderDetailsDialog, setShowOrderDetailsDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<MarketplaceOrder | null>(null);

  // Course requests
  const [courseRequests, setCourseRequests] = useState<CourseRequest[]>([]);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [requestTitle, setRequestTitle] = useState("");
  const [requestDescription, setRequestDescription] = useState("");
  const [requestBudgetMin, setRequestBudgetMin] = useState("");
  const [requestBudgetMax, setRequestBudgetMax] = useState("");
  const [requestStudentsCount, setRequestStudentsCount] = useState("1");
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  // Propose course dialog
  const [showProposeDialog, setShowProposeDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<CourseRequest | null>(null);
  const [selectedCourseToPropose, setSelectedCourseToPropose] = useState("");
  const [proposeMessage, setProposeMessage] = useState("");
  const [isProposing, setIsProposing] = useState(false);

  useEffect(() => {
    fetchData();
  }, [organizationId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        fetchCatalog(),
        fetchMyCourses(),
        fetchOrders(),
        fetchAvailableCourses(),
        fetchCourseRequests(),
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCourseRequests = async () => {
    const { data, error } = await supabase
      .from('course_requests')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) { console.error('Error fetching course requests:', error); return; }
    setCourseRequests(data || []);
  };

  const handleSubmitRequest = async () => {
    if (!requestTitle.trim()) { toast.error('Введите заголовок объявления'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Необходимо авторизоваться'); return; }
    setIsSubmittingRequest(true);
    try {
      const { error } = await supabase.from('course_requests').insert({
        user_id: user.id, organization_id: organizationId,
        title: requestTitle.trim(), description: requestDescription.trim() || null,
        budget_min: requestBudgetMin ? parseInt(requestBudgetMin) : null,
        budget_max: requestBudgetMax ? parseInt(requestBudgetMax) : null,
        students_count: parseInt(requestStudentsCount) || 1, status: 'active',
      });
      if (error) throw error;
      toast.success('Объявление опубликовано!');
      setShowRequestDialog(false);
      setRequestTitle(""); setRequestDescription(""); setRequestBudgetMin(""); setRequestBudgetMax(""); setRequestStudentsCount("1");
      fetchCourseRequests();
    } catch (error: any) {
      console.error('Error creating request:', error);
      toast.error('Ошибка при публикации объявления');
    } finally { setIsSubmittingRequest(false); }
  };

  const handleProposeCourse = async () => {
    if (!selectedCourseToPropose || !selectedRequest) { toast.error('Выберите курс для предложения'); return; }
    const selectedCourse = myCourses.find(c => c.id === selectedCourseToPropose);
    if (!selectedCourse) { toast.error('Курс не найден'); return; }
    setIsProposing(true);
    try {
      toast.success(`Предложение отправлено! Курс "${selectedCourse.course?.title}" предложен автору объявления "${selectedRequest.title}"`);
      setShowProposeDialog(false); setSelectedRequest(null); setSelectedCourseToPropose(""); setProposeMessage("");
    } catch (error: any) {
      console.error('Error proposing course:', error);
      toast.error('Ошибка при отправке предложения');
    } finally { setIsProposing(false); }
  };

  const fetchCatalog = async () => {
    const { data, error } = await supabase
      .from('marketplace_courses')
      .select(`*, course:courses(id, title, description, duration), organization:organizations(name)`)
      .eq('is_active', true).neq('organization_id', organizationId);
    if (error) { console.error('Error fetching catalog:', error); return; }
    setCatalogCourses(data || []);
  };

  const fetchMyCourses = async () => {
    const { data, error } = await supabase
      .from('marketplace_courses')
      .select(`*, course:courses(id, title, description, duration)`)
      .eq('organization_id', organizationId);
    if (error) { console.error('Error fetching my courses:', error); return; }
    setMyCourses(data || []);
  };

  const fetchOrders = async () => {
    const { data: received, error: receivedError } = await supabase
      .from('marketplace_orders')
      .select(`*, marketplace_course:marketplace_courses(*, course:courses(id, title), organization:organizations(name))`)
      .order('created_at', { ascending: false });
    if (receivedError) { console.error('Error fetching received orders:', receivedError); } else {
      setReceivedOrders((received || []).filter(order => order.marketplace_course?.organization_id === organizationId));
      setMyOrders((received || []).filter(order => order.buyer_organization_id === organizationId || order.buyer_user_id === userId));
    }
  };

  const fetchAvailableCourses = async () => {
    const { data: existing } = await supabase.from('marketplace_courses').select('course_id').eq('organization_id', organizationId);
    const existingIds = new Set((existing || []).map(e => e.course_id));
    const { data: courses, error } = await supabase.from('courses').select('id, title, description, duration').eq('organization_id', organizationId).eq('is_published', true);
    if (error) { console.error('Error fetching available courses:', error); return; }
    setAvailableCourses((courses || []).filter(c => !existingIds.has(c.id)));
  };

  const resetAddForm = () => { setSelectedCourseToAdd(""); setPriceStudent(""); setPriceOrg(""); setShortDescription(""); };

  const handleAddToMarketplace = async () => {
    if (!selectedCourseToAdd || !priceStudent || !priceOrg) { toast.error('Заполните все обязательные поля'); return; }
    setIsAdding(true);
    try {
      const { error } = await supabase.from('marketplace_courses').insert({
        course_id: selectedCourseToAdd, organization_id: organizationId,
        price_student: parseFloat(priceStudent), price_organization: parseFloat(priceOrg),
        description_short: shortDescription || null, is_active: true,
      });
      if (error) throw error;
      toast.success('Курс добавлен в магазин!');
      setShowAddDialog(false); resetAddForm(); fetchData();
    } catch (error: any) {
      console.error('Error adding course:', error); toast.error('Ошибка при добавлении курса');
    } finally { setIsAdding(false); }
  };

  const handleToggleActive = async (course: MarketplaceCourse) => {
    try {
      const { error } = await supabase.from('marketplace_courses').update({ is_active: !course.is_active }).eq('id', course.id);
      if (error) throw error;
      toast.success(course.is_active ? 'Курс скрыт из каталога' : 'Курс опубликован в каталоге');
      fetchMyCourses();
    } catch (error) { console.error('Error toggling course:', error); toast.error('Ошибка при изменении статуса'); }
  };

  const handleDeleteFromMarketplace = async (courseId: string) => {
    try {
      const { error } = await supabase.from('marketplace_courses').delete().eq('id', courseId);
      if (error) throw error;
      toast.success('Курс удалён из магазина'); fetchData();
    } catch (error) { console.error('Error deleting course:', error); toast.error('Ошибка при удалении курса'); }
  };

  const handleOrder = async () => {
    if (!selectedCourseForOrder) return;
    
    // Check subscription course limit
    const limitResult = checkLimit('course');
    if (!limitResult.allowed) {
      toast.error(limitResult.message);
      return;
    }
    
    setIsOrdering(true);
    try {
      const price = userRole === 'student' ? selectedCourseForOrder.price_student : selectedCourseForOrder.price_organization * studentsCount;
      
      // If paying from balance, check and deduct
      let orderStatus = 'pending';
      if (payFromBalance && userRole === 'organization' && deductBalance) {
        if ((orgBalance ?? 0) < price) {
          toast.error('Недостаточно средств на балансе');
          setIsOrdering(false);
          return;
        }
      }

      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const { data: orderData, error } = await supabase.from('marketplace_orders').insert({
        marketplace_course_id: selectedCourseForOrder.id,
        buyer_user_id: currentUser?.id || userId || null,
        buyer_organization_id: userRole === 'organization' ? organizationId : null,
        buyer_type: userRole, price,
        students_count: userRole === 'organization' ? studentsCount : 1,
        notes: orderNotes || null, 
        status: payFromBalance ? 'paid' : 'pending',
        payment_method: payFromBalance ? 'balance' : null,
        paid_at: payFromBalance ? new Date().toISOString() : null,
      }).select('id').single();
      if (error) throw error;

      // Deduct balance after order created
      if (payFromBalance && deductBalance && orderData) {
        const courseName = selectedCourseForOrder.course?.title || 'Курс';
        await deductBalance(price, `Покупка курса "${courseName}"`, orderData.id);

        // Clone course to buyer's organization
        try {
          const originalCourseId = selectedCourseForOrder.course_id;
          const { data: origCourse } = await supabase
            .from('courses').select('*').eq('id', originalCourseId).single();
          
          if (origCourse) {
            const { id: _id, created_at: _ca, updated_at: _ua, ...courseData } = origCourse;
            const { data: newCourse } = await supabase.from('courses').insert({
              ...courseData,
              organization_id: organizationId,
              source_order_id: orderData.id,
              source_course_id: originalCourseId,
            }).select('id').single();

            if (newCourse) {
              const { data: lessons } = await supabase
                .from('lessons').select('*').eq('course_id', originalCourseId).order('order_index');
              
              if (lessons) {
                for (const lesson of lessons) {
                  const { id: _lid, created_at: _lca, updated_at: _lua, ...lessonData } = lesson;
                  const { data: newLesson } = await supabase.from('lessons').insert({
                    ...lessonData,
                    course_id: newCourse.id,
                  }).select('id').single();

                  if (newLesson) {
                    const { data: questions } = await supabase
                      .from('test_questions').select('*').eq('lesson_id', lesson.id);
                    if (questions?.length) {
                      await supabase.from('test_questions').insert(
                        questions.map(q => {
                          const { id: _qid, ...qData } = q;
                          return { ...qData, lesson_id: newLesson.id };
                        })
                      );
                    }
                  }
                }
              }
            }
          }
        } catch (cloneError) {
          console.error('Error cloning course:', cloneError);
        }
        refetchLimits();
      }

      try {
        let buyerName = 'Неизвестный покупатель';
        if (userRole === 'student' && userId) {
          const { data: profile } = await supabase.from('profiles').select('full_name').eq('user_id', userId).single();
          buyerName = profile?.full_name || 'Студент';
        } else if (userRole === 'organization') {
          const { data: org } = await supabase.from('organizations').select('name').eq('id', organizationId).single();
          buyerName = org?.name || 'Организация';
        }
        await supabase.functions.invoke('notify-course-order', {
          body: {
            orderId: orderData?.id || 'new', courseName: selectedCourseForOrder.course?.title || 'Курс',
            buyerName, buyerType: userRole,
            studentsCount: userRole === 'organization' ? studentsCount : 1,
            price, notes: orderNotes || undefined,
            sellerOrganizationId: selectedCourseForOrder.organization_id,
          },
        });
      } catch (notifyError) { console.error('Failed to send notification:', notifyError); }

      setPurchasedFromBalance(payFromBalance);
      setShowOrderDialog(false); setShowSuccessDialog(true); setOrderNotes(""); setStudentsCount(1); setPayFromBalance(false); fetchOrders();
    } catch (error: any) {
      console.error('Error creating order:', error); toast.error('Ошибка при создании заявки');
    } finally { setIsOrdering(false); }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === 'paid') updateData.paid_at = new Date().toISOString();
      const { error } = await supabase.from('marketplace_orders').update(updateData).eq('id', orderId);
      if (error) throw error;

      if (selectedOrder && ['approved', 'paid', 'completed', 'cancelled'].includes(newStatus)) {
        try {
          await supabase.functions.invoke('notify-order-status', {
            body: {
              orderId, newStatus,
              courseName: selectedOrder.marketplace_course?.course?.title || 'Курс',
              sellerName: selectedOrder.marketplace_course?.organization?.name || 'Продавец',
              buyerUserId: selectedOrder.buyer_user_id,
              buyerOrganizationId: selectedOrder.buyer_organization_id,
              buyerType: selectedOrder.buyer_type, price: selectedOrder.price,
            },
          });
        } catch (notifyError) { console.error('Failed to send status notification:', notifyError); }
      }

      toast.success('Статус заявки обновлён'); fetchOrders(); setShowOrderDetailsDialog(false);
    } catch (error) { console.error('Error updating order:', error); toast.error('Ошибка при обновлении статуса'); }
  };

  const handleEditCourse = async () => {
    if (!editingCourse) return;
    try {
      const { error } = await supabase.from('marketplace_courses').update({
        price_student: editingCourse.price_student, price_organization: editingCourse.price_organization,
        description_short: editingCourse.description_short,
      }).eq('id', editingCourse.id);
      if (error) throw error;
      toast.success('Курс обновлён'); setShowEditDialog(false); fetchMyCourses();
    } catch (error) { console.error('Error updating course:', error); toast.error('Ошибка при обновлении'); }
  };

  const filteredCatalog = catalogCourses.filter(c =>
    c.course?.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.organization?.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Category grouping logic (same as admin marketplace)
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

  const EXCLUDED_FROM_RTN = ["Охрана труда при работах на высоте"];

  const groupedCatalog: { category: string; courses: MarketplaceCourse[]; subGroups?: { category: string; courses: MarketplaceCourse[] }[] }[] = (() => {
    const map = new Map<string, MarketplaceCourse[]>();
    for (const c of filteredCatalog) {
      const cat = extractCategory(c.course?.title);
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(c);
    }

    const rtnSubGroups: { category: string; courses: MarketplaceCourse[] }[] = [];
    const standalone: { category: string; courses: MarketplaceCourse[] }[] = [];

    for (const [category, courses] of Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))) {
      if (EXCLUDED_FROM_RTN.includes(category)) {
        standalone.push({ category, courses });
      } else {
        rtnSubGroups.push({ category, courses });
      }
    }

    const result: { category: string; courses: MarketplaceCourse[]; subGroups?: { category: string; courses: MarketplaceCourse[] }[] }[] = [];
    if (rtnSubGroups.length > 0) {
      const allRtnCourses = rtnSubGroups.flatMap(g => g.courses);
      result.push({ category: "Курсы Ростехнадзора", courses: allRtnCourses, subGroups: rtnSubGroups });
    }
    result.push(...standalone);
    return result;
  })();

  return {
    activeTab, setActiveTab,
    isLoading, searchQuery, setSearchQuery,
    catalogCourses, filteredCatalog, groupedCatalog, extractShortTitle, myCourses, myOrders, receivedOrders, availableCourses, courseRequests,
    // Add dialog
    showAddDialog, setShowAddDialog, selectedCourseToAdd, setSelectedCourseToAdd,
    priceStudent, setPriceStudent, priceOrg, setPriceOrg, shortDescription, setShortDescription,
    isAdding, handleAddToMarketplace,
    // Order dialog
    showOrderDialog, setShowOrderDialog, selectedCourseForOrder, setSelectedCourseForOrder,
    orderNotes, setOrderNotes, studentsCount, setStudentsCount, isOrdering, handleOrder,
    showSuccessDialog, setShowSuccessDialog,
    payFromBalance, setPayFromBalance, orgBalance, purchasedFromBalance,
    // Edit dialog
    showEditDialog, setShowEditDialog, editingCourse, setEditingCourse, handleEditCourse,
    // Order details
    showOrderDetailsDialog, setShowOrderDetailsDialog, selectedOrder, setSelectedOrder, handleUpdateOrderStatus,
    // Toggle/delete
    handleToggleActive, handleDeleteFromMarketplace,
    // Requests
    showRequestDialog, setShowRequestDialog, requestTitle, setRequestTitle,
    requestDescription, setRequestDescription, requestBudgetMin, setRequestBudgetMin,
    requestBudgetMax, setRequestBudgetMax, requestStudentsCount, setRequestStudentsCount,
    isSubmittingRequest, handleSubmitRequest,
    // Propose
    showProposeDialog, setShowProposeDialog, selectedRequest, setSelectedRequest,
    selectedCourseToPropose, setSelectedCourseToPropose, proposeMessage, setProposeMessage,
    isProposing, handleProposeCourse,
    userRole,
  };
}
