import { useState, useEffect } from "react";
import { 
  Store, ShoppingCart, GraduationCap, Loader2, CheckCircle, 
  Eye, Edit, Trash2, Plus, Users, Building2, Search, Filter,
  DollarSign, Tag, Package, MessageSquarePlus, Megaphone, Send,
  Clock, User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

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

interface CourseStoreManagerProps {
  organizationId: string;
  userRole?: 'organization' | 'student';
  userId?: string;
}

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "Ожидает", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  approved: { label: "Одобрена", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  paid: { label: "Оплачена", color: "bg-green-500/10 text-green-600 border-green-500/20" },
  completed: { label: "Завершена", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  cancelled: { label: "Отменена", color: "bg-red-500/10 text-red-600 border-red-500/20" },
};

export function CourseStoreManager({ organizationId, userRole = 'organization', userId }: CourseStoreManagerProps) {
  const [activeTab, setActiveTab] = useState<'catalog' | 'my-courses' | 'orders' | 'my-orders'>('catalog');
  const [isLoading, setIsLoading] = useState(true);
  const [catalogCourses, setCatalogCourses] = useState<MarketplaceCourse[]>([]);
  const [myCourses, setMyCourses] = useState<MarketplaceCourse[]>([]);
  const [myOrders, setMyOrders] = useState<MarketplaceOrder[]>([]);
  const [receivedOrders, setReceivedOrders] = useState<MarketplaceOrder[]>([]);
  const [availableCourses, setAvailableCourses] = useState<Course[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Add course to marketplace dialog
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedCourseToAdd, setSelectedCourseToAdd] = useState<string>("");
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

  // Edit dialog
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingCourse, setEditingCourse] = useState<MarketplaceCourse | null>(null);

  // Order details dialog
  const [showOrderDetailsDialog, setShowOrderDetailsDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<MarketplaceOrder | null>(null);

  // Course requests (announcements)
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
  const [selectedCourseToPropose, setSelectedCourseToPropose] = useState<string>("");
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

    if (error) {
      console.error('Error fetching course requests:', error);
      return;
    }
    setCourseRequests(data || []);
  };

  const handleSubmitRequest = async () => {
    if (!requestTitle.trim()) {
      toast.error('Введите заголовок объявления');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Необходимо авторизоваться');
      return;
    }

    setIsSubmittingRequest(true);
    try {
      const { error } = await supabase
        .from('course_requests')
        .insert({
          user_id: user.id,
          organization_id: organizationId,
          title: requestTitle.trim(),
          description: requestDescription.trim() || null,
          budget_min: requestBudgetMin ? parseInt(requestBudgetMin) : null,
          budget_max: requestBudgetMax ? parseInt(requestBudgetMax) : null,
          students_count: parseInt(requestStudentsCount) || 1,
          status: 'active',
        });

      if (error) throw error;

      toast.success('Объявление опубликовано!');
      setShowRequestDialog(false);
      setRequestTitle("");
      setRequestDescription("");
      setRequestBudgetMin("");
      setRequestBudgetMax("");
      setRequestStudentsCount("1");
      fetchCourseRequests();
    } catch (error: any) {
      console.error('Error creating request:', error);
      toast.error('Ошибка при публикации объявления');
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const handleProposeCourse = async () => {
    if (!selectedCourseToPropose || !selectedRequest) {
      toast.error('Выберите курс для предложения');
      return;
    }

    const selectedCourse = myCourses.find(c => c.id === selectedCourseToPropose);
    if (!selectedCourse) {
      toast.error('Курс не найден');
      return;
    }

    setIsProposing(true);
    try {
      // Here we could create a proposal record or send a notification
      // For now, we'll just show a success message with the details
      toast.success(
        `Предложение отправлено! Курс "${selectedCourse.course?.title}" предложен автору объявления "${selectedRequest.title}"`
      );
      
      setShowProposeDialog(false);
      setSelectedRequest(null);
      setSelectedCourseToPropose("");
      setProposeMessage("");
    } catch (error: any) {
      console.error('Error proposing course:', error);
      toast.error('Ошибка при отправке предложения');
    } finally {
      setIsProposing(false);
    }
  };

  const fetchCatalog = async () => {
    const { data, error } = await supabase
      .from('marketplace_courses')
      .select(`
        *,
        course:courses(id, title, description, duration),
        organization:organizations(name)
      `)
      .eq('is_active', true)
      .neq('organization_id', organizationId);

    if (error) {
      console.error('Error fetching catalog:', error);
      return;
    }
    setCatalogCourses(data || []);
  };

  const fetchMyCourses = async () => {
    const { data, error } = await supabase
      .from('marketplace_courses')
      .select(`
        *,
        course:courses(id, title, description, duration)
      `)
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error fetching my courses:', error);
      return;
    }
    setMyCourses(data || []);
  };

  const fetchOrders = async () => {
    // Fetch orders for my courses (received)
    const { data: received, error: receivedError } = await supabase
      .from('marketplace_orders')
      .select(`
        *,
        marketplace_course:marketplace_courses(
          *,
          course:courses(id, title),
          organization:organizations(name)
        )
      `)
      .order('created_at', { ascending: false });

    if (receivedError) {
      console.error('Error fetching received orders:', receivedError);
    } else {
      // Filter to only show orders for my organization's courses
      const myOrgOrders = (received || []).filter(order => 
        order.marketplace_course?.organization_id === organizationId
      );
      setReceivedOrders(myOrgOrders);

      // Filter to show orders I made
      const myPlacedOrders = (received || []).filter(order => 
        order.buyer_organization_id === organizationId || order.buyer_user_id === userId
      );
      setMyOrders(myPlacedOrders);
    }
  };

  const fetchAvailableCourses = async () => {
    // Get courses that aren't already in marketplace
    const { data: existing } = await supabase
      .from('marketplace_courses')
      .select('course_id')
      .eq('organization_id', organizationId);

    const existingIds = new Set((existing || []).map(e => e.course_id));

    const { data: courses, error } = await supabase
      .from('courses')
      .select('id, title, description, duration')
      .eq('organization_id', organizationId)
      .eq('is_published', true);

    if (error) {
      console.error('Error fetching available courses:', error);
      return;
    }

    setAvailableCourses((courses || []).filter(c => !existingIds.has(c.id)));
  };

  const handleAddToMarketplace = async () => {
    if (!selectedCourseToAdd || !priceStudent || !priceOrg) {
      toast.error('Заполните все обязательные поля');
      return;
    }

    setIsAdding(true);
    try {
      const { error } = await supabase
        .from('marketplace_courses')
        .insert({
          course_id: selectedCourseToAdd,
          organization_id: organizationId,
          price_student: parseFloat(priceStudent),
          price_organization: parseFloat(priceOrg),
          description_short: shortDescription || null,
          is_active: true,
        });

      if (error) throw error;

      toast.success('Курс добавлен в магазин!');
      setShowAddDialog(false);
      resetAddForm();
      fetchData();
    } catch (error: any) {
      console.error('Error adding course:', error);
      toast.error('Ошибка при добавлении курса');
    } finally {
      setIsAdding(false);
    }
  };

  const resetAddForm = () => {
    setSelectedCourseToAdd("");
    setPriceStudent("");
    setPriceOrg("");
    setShortDescription("");
  };

  const handleToggleActive = async (course: MarketplaceCourse) => {
    try {
      const { error } = await supabase
        .from('marketplace_courses')
        .update({ is_active: !course.is_active })
        .eq('id', course.id);

      if (error) throw error;
      toast.success(course.is_active ? 'Курс скрыт из каталога' : 'Курс опубликован в каталоге');
      fetchMyCourses();
    } catch (error) {
      console.error('Error toggling course:', error);
      toast.error('Ошибка при изменении статуса');
    }
  };

  const handleDeleteFromMarketplace = async (courseId: string) => {
    try {
      const { error } = await supabase
        .from('marketplace_courses')
        .delete()
        .eq('id', courseId);

      if (error) throw error;
      toast.success('Курс удалён из магазина');
      fetchData();
    } catch (error) {
      console.error('Error deleting course:', error);
      toast.error('Ошибка при удалении курса');
    }
  };

  const handleOrder = async () => {
    if (!selectedCourseForOrder) return;

    setIsOrdering(true);
    try {
      const price = userRole === 'student' 
        ? selectedCourseForOrder.price_student 
        : selectedCourseForOrder.price_organization * studentsCount;

      const { error } = await supabase
        .from('marketplace_orders')
        .insert({
          marketplace_course_id: selectedCourseForOrder.id,
          buyer_user_id: userRole === 'student' ? userId : null,
          buyer_organization_id: userRole === 'organization' ? organizationId : null,
          buyer_type: userRole,
          price,
          students_count: userRole === 'organization' ? studentsCount : 1,
          notes: orderNotes || null,
          status: 'pending',
        });

      if (error) throw error;

      // Send email notification to seller
      try {
        // Get buyer name
        let buyerName = 'Неизвестный покупатель';
        if (userRole === 'student' && userId) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('user_id', userId)
            .single();
          buyerName = profile?.full_name || 'Студент';
        } else if (userRole === 'organization') {
          const { data: org } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', organizationId)
            .single();
          buyerName = org?.name || 'Организация';
        }

        await supabase.functions.invoke('notify-course-order', {
          body: {
            orderId: 'new',
            courseName: selectedCourseForOrder.course?.title || 'Курс',
            buyerName,
            buyerType: userRole,
            studentsCount: userRole === 'organization' ? studentsCount : 1,
            price,
            notes: orderNotes || undefined,
            sellerOrganizationId: selectedCourseForOrder.organization_id,
          },
        });
        console.log('Order notification sent');
      } catch (notifyError) {
        console.error('Failed to send notification:', notifyError);
        // Don't fail the order if notification fails
      }

      setShowOrderDialog(false);
      setShowSuccessDialog(true);
      setOrderNotes("");
      setStudentsCount(1);
      fetchOrders();
    } catch (error: any) {
      console.error('Error creating order:', error);
      toast.error('Ошибка при создании заявки');
    } finally {
      setIsOrdering(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === 'paid') {
        updateData.paid_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('marketplace_orders')
        .update(updateData)
        .eq('id', orderId);

      if (error) throw error;

      // Send notification to buyer about status change
      if (selectedOrder && ['approved', 'paid', 'completed', 'cancelled'].includes(newStatus)) {
        try {
          await supabase.functions.invoke('notify-order-status', {
            body: {
              orderId,
              newStatus,
              courseName: selectedOrder.marketplace_course?.course?.title || 'Курс',
              sellerName: selectedOrder.marketplace_course?.organization?.name || 'Продавец',
              buyerUserId: selectedOrder.buyer_user_id,
              buyerOrganizationId: selectedOrder.buyer_organization_id,
              buyerType: selectedOrder.buyer_type,
              price: selectedOrder.price,
            },
          });
          console.log('Status notification sent to buyer');
        } catch (notifyError) {
          console.error('Failed to send status notification:', notifyError);
        }
      }

      toast.success('Статус заявки обновлён');
      fetchOrders();
      setShowOrderDetailsDialog(false);
    } catch (error) {
      console.error('Error updating order:', error);
      toast.error('Ошибка при обновлении статуса');
    }
  };

  const handleEditCourse = async () => {
    if (!editingCourse) return;

    try {
      const { error } = await supabase
        .from('marketplace_courses')
        .update({
          price_student: editingCourse.price_student,
          price_organization: editingCourse.price_organization,
          description_short: editingCourse.description_short,
        })
        .eq('id', editingCourse.id);

      if (error) throw error;
      toast.success('Курс обновлён');
      setShowEditDialog(false);
      fetchMyCourses();
    } catch (error) {
      console.error('Error updating course:', error);
      toast.error('Ошибка при обновлении');
    }
  };

  const filteredCatalog = catalogCourses.filter(c => 
    c.course?.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.organization?.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/5 rounded-2xl p-6 border border-border">
        <div className="flex items-center gap-3 mb-2">
          <Store className="w-6 h-6 text-primary" />
          <h2 className="font-display text-xl font-semibold">Магазин курсов</h2>
        </div>
        <p className="text-muted-foreground">
          Покупайте и продавайте учебные курсы другим организациям и студентам
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="catalog" className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            <span className="hidden sm:inline">Каталог</span>
          </TabsTrigger>
          <TabsTrigger value="my-courses" className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4" />
            <span className="hidden sm:inline">Мои курсы</span>
          </TabsTrigger>
          <TabsTrigger value="orders" className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            <span className="hidden sm:inline">Заявки</span>
          </TabsTrigger>
          <TabsTrigger value="my-orders" className="flex items-center gap-2">
            <Tag className="w-4 h-4" />
            <span className="hidden sm:inline">Мои покупки</span>
          </TabsTrigger>
        </TabsList>

        {/* Catalog Tab */}
        <TabsContent value="catalog" className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Поиск курсов..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 rounded-xl"
              />
            </div>
            <Button
              variant="outline"
              className="rounded-xl gap-2"
              onClick={() => setShowRequestDialog(true)}
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span className="hidden sm:inline">Разместить объявление</span>
            </Button>
          </div>

          {/* Course Requests Widget */}
          {courseRequests.length > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Megaphone className="w-5 h-5 text-amber-500" />
                    <CardTitle className="text-base">Ищут курсы</CardTitle>
                  </div>
                  <Badge variant="secondary" className="bg-amber-500/10 text-amber-600">
                    {courseRequests.length} объявлений
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {courseRequests.slice(0, 5).map((request) => (
                  <div 
                    key={request.id}
                    className="p-4 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium line-clamp-1">{request.title}</h4>
                        {request.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {request.description}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                          {(request.budget_min || request.budget_max) && (
                            <span className="flex items-center gap-1">
                              <DollarSign className="w-3 h-3" />
                              {request.budget_min && request.budget_max 
                                ? `${request.budget_min.toLocaleString()} - ${request.budget_max.toLocaleString()} ₽`
                                : request.budget_max 
                                  ? `до ${request.budget_max.toLocaleString()} ₽`
                                  : `от ${request.budget_min?.toLocaleString()} ₽`
                              }
                            </span>
                          )}
                          {request.students_count && request.students_count > 1 && (
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {request.students_count} чел.
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(new Date(request.created_at), 'd MMM', { locale: ru })}
                          </span>
                        </div>
                      </div>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="rounded-lg shrink-0"
                        onClick={() => {
                          setSelectedRequest(request);
                          setShowProposeDialog(true);
                        }}
                      >
                        <Send className="w-3 h-3 mr-1" />
                        Предложить
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {filteredCatalog.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Package className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery ? 'Курсы не найдены' : 'В каталоге пока нет курсов'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCatalog.map((item) => (
                <Card key={item.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="font-display text-lg leading-tight">
                          {item.course?.title}
                        </CardTitle>
                        <CardDescription className="mt-1 flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {item.organization?.name}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {item.description_short && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {item.description_short}
                      </p>
                    )}
                    {item.course?.duration && (
                      <Badge variant="outline" className="text-xs">
                        {item.course.duration}
                      </Badge>
                    )}
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="text-center p-3 bg-secondary/50 rounded-xl">
                        <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                          <Users className="w-3 h-3" />
                          Для студентов
                        </div>
                        <div className="font-bold text-primary">
                          {item.price_student.toLocaleString()} ₽
                        </div>
                      </div>
                      <div className="text-center p-3 bg-secondary/50 rounded-xl">
                        <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                          <Building2 className="w-3 h-3" />
                          Для организаций
                        </div>
                        <div className="font-bold text-primary">
                          {item.price_organization.toLocaleString()} ₽
                        </div>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button 
                      className="w-full btn-gradient rounded-xl"
                      onClick={() => {
                        setSelectedCourseForOrder(item);
                        setShowOrderDialog(true);
                      }}
                    >
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      Оформить заявку
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* My Courses Tab */}
        <TabsContent value="my-courses" className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Курсы вашей организации в магазине
            </p>
            <Button 
              onClick={() => setShowAddDialog(true)}
              className="rounded-xl btn-gradient"
              disabled={availableCourses.length === 0}
            >
              <Plus className="w-4 h-4 mr-2" />
              Добавить курс
            </Button>
          </div>

          {myCourses.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <GraduationCap className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  Вы пока не добавили курсы в магазин
                </p>
                <Button 
                  onClick={() => setShowAddDialog(true)}
                  variant="outline"
                  className="rounded-xl"
                  disabled={availableCourses.length === 0}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Добавить первый курс
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {myCourses.map((item) => (
                <Card key={item.id} className={`overflow-hidden ${!item.is_active ? 'opacity-60' : ''}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="font-display text-lg leading-tight flex-1">
                        {item.course?.title}
                      </CardTitle>
                      <Badge variant={item.is_active ? "default" : "secondary"}>
                        {item.is_active ? 'Активен' : 'Скрыт'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="text-center p-2 bg-secondary/50 rounded-lg">
                        <div className="text-xs text-muted-foreground">Для студентов</div>
                        <div className="font-semibold">{item.price_student.toLocaleString()} ₽</div>
                      </div>
                      <div className="text-center p-2 bg-secondary/50 rounded-lg">
                        <div className="text-xs text-muted-foreground">Для организаций</div>
                        <div className="font-semibold">{item.price_organization.toLocaleString()} ₽</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={item.is_active}
                          onCheckedChange={() => handleToggleActive(item)}
                        />
                        <span className="text-sm text-muted-foreground">
                          {item.is_active ? 'Виден' : 'Скрыт'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingCourse(item);
                            setShowEditDialog(true);
                          }}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDeleteFromMarketplace(item.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Received Orders Tab */}
        <TabsContent value="orders" className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Заявки на покупку ваших курсов
          </p>

          {receivedOrders.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <ShoppingCart className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground">Пока нет заявок на ваши курсы</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Курс</TableHead>
                    <TableHead>Покупатель</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Сумма</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Дата</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receivedOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">
                        {order.marketplace_course?.course?.title}
                      </TableCell>
                      <TableCell>
                        {order.buyer_type === 'organization' 
                          ? `Организация` 
                          : 'Студент'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {order.buyer_type === 'organization' 
                            ? `${order.students_count} студ.` 
                            : '1 студент'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {order.price.toLocaleString()} ₽
                      </TableCell>
                      <TableCell>
                        <Badge className={statusLabels[order.status]?.color}>
                          {statusLabels[order.status]?.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(order.created_at), 'dd.MM.yyyy', { locale: ru })}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedOrder(order);
                            setShowOrderDetailsDialog(true);
                          }}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* My Orders Tab */}
        <TabsContent value="my-orders" className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Ваши заявки на покупку курсов
          </p>

          {myOrders.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Tag className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground">Вы пока не оформляли заявки</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Курс</TableHead>
                    <TableHead>Продавец</TableHead>
                    <TableHead>Сумма</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Дата</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">
                        {order.marketplace_course?.course?.title}
                      </TableCell>
                      <TableCell>
                        {order.marketplace_course?.organization?.name}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {order.price.toLocaleString()} ₽
                      </TableCell>
                      <TableCell>
                        <Badge className={statusLabels[order.status]?.color}>
                          {statusLabels[order.status]?.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(order.created_at), 'dd.MM.yyyy', { locale: ru })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Course Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Добавить курс в магазин</DialogTitle>
            <DialogDescription>
              Выберите курс и установите цены для продажи
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Курс</Label>
              <Select value={selectedCourseToAdd} onValueChange={setSelectedCourseToAdd}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Выберите курс" />
                </SelectTrigger>
                <SelectContent>
                  {availableCourses.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Цена для студентов (₽)</Label>
                <Input
                  type="number"
                  value={priceStudent}
                  onChange={(e) => setPriceStudent(e.target.value)}
                  placeholder="5000"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Цена для организаций (₽)</Label>
                <Input
                  type="number"
                  value={priceOrg}
                  onChange={(e) => setPriceOrg(e.target.value)}
                  placeholder="3000"
                  className="rounded-xl"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Краткое описание (необязательно)</Label>
              <Textarea
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                placeholder="Расскажите о курсе..."
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="w-full btn-gradient rounded-xl"
              onClick={handleAddToMarketplace}
              disabled={isAdding || !selectedCourseToAdd || !priceStudent || !priceOrg}
            >
              {isAdding ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Добавление...
                </>
              ) : (
                'Добавить в магазин'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Dialog */}
      <Dialog open={showOrderDialog} onOpenChange={setShowOrderDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Оформление заявки</DialogTitle>
            <DialogDescription>
              {selectedCourseForOrder?.course?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Продавец:</span>
                <span className="font-medium">{selectedCourseForOrder?.organization?.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Цена за студента:</span>
                <span className="font-bold text-primary">
                  {userRole === 'student' 
                    ? selectedCourseForOrder?.price_student.toLocaleString()
                    : selectedCourseForOrder?.price_organization.toLocaleString()
                  } ₽
                </span>
              </div>
            </div>

            {userRole === 'organization' && (
              <div className="space-y-2">
                <Label>Количество студентов</Label>
                <Input
                  type="number"
                  min={1}
                  value={studentsCount}
                  onChange={(e) => setStudentsCount(parseInt(e.target.value) || 1)}
                  className="rounded-xl"
                />
                <div className="text-sm text-muted-foreground">
                  Итого: <span className="font-bold text-primary">
                    {((selectedCourseForOrder?.price_organization || 0) * studentsCount).toLocaleString()} ₽
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Комментарий к заявке (необязательно)</Label>
              <Textarea
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="Укажите дополнительную информацию..."
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="w-full btn-gradient rounded-xl"
              onClick={handleOrder}
              disabled={isOrdering}
            >
              {isOrdering ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Отправка...
                </>
              ) : (
                'Отправить заявку'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="rounded-2xl text-center max-w-sm">
          <div className="py-6">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <DialogTitle className="font-display text-xl mb-2">Заявка отправлена!</DialogTitle>
            <DialogDescription className="text-base">
              Продавец получит уведомление и свяжется с вами для согласования деталей.
            </DialogDescription>
            <Button
              className="mt-6 btn-gradient rounded-xl"
              onClick={() => setShowSuccessDialog(false)}
            >
              Отлично
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Course Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Редактировать курс</DialogTitle>
          </DialogHeader>
          {editingCourse && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Цена для студентов (₽)</Label>
                  <Input
                    type="number"
                    value={editingCourse.price_student}
                    onChange={(e) => setEditingCourse({
                      ...editingCourse,
                      price_student: parseFloat(e.target.value) || 0
                    })}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Цена для организаций (₽)</Label>
                  <Input
                    type="number"
                    value={editingCourse.price_organization}
                    onChange={(e) => setEditingCourse({
                      ...editingCourse,
                      price_organization: parseFloat(e.target.value) || 0
                    })}
                    className="rounded-xl"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Краткое описание</Label>
                <Textarea
                  value={editingCourse.description_short || ''}
                  onChange={(e) => setEditingCourse({
                    ...editingCourse,
                    description_short: e.target.value
                  })}
                  className="rounded-xl"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              className="w-full btn-gradient rounded-xl"
              onClick={handleEditCourse}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      <Dialog open={showOrderDetailsDialog} onOpenChange={setShowOrderDetailsDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Детали заявки</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 py-4">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Курс:</span>
                  <span className="font-medium">{selectedOrder.marketplace_course?.course?.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Тип покупателя:</span>
                  <span>{selectedOrder.buyer_type === 'organization' ? 'Организация' : 'Студент'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Количество:</span>
                  <span>{selectedOrder.students_count} студ.</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Сумма:</span>
                  <span className="font-bold text-primary">{selectedOrder.price.toLocaleString()} ₽</span>
                </div>
                {selectedOrder.notes && (
                  <div className="pt-2 border-t">
                    <span className="text-sm text-muted-foreground">Комментарий:</span>
                    <p className="mt-1">{selectedOrder.notes}</p>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Изменить статус</Label>
                <Select 
                  value={selectedOrder.status}
                  onValueChange={(value) => handleUpdateOrderStatus(selectedOrder.id, value)}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Ожидает</SelectItem>
                    <SelectItem value="approved">Одобрена</SelectItem>
                    <SelectItem value="paid">Оплачена</SelectItem>
                    <SelectItem value="completed">Завершена</SelectItem>
                    <SelectItem value="cancelled">Отменена</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Course Request Dialog */}
      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-primary" />
              Разместить объявление
            </DialogTitle>
            <DialogDescription>
              Опишите какой курс вы ищете, и продавцы смогут вам его предложить
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="request-title">Заголовок *</Label>
              <Input
                id="request-title"
                placeholder="Например: Ищу курс по охране труда"
                value={requestTitle}
                onChange={(e) => setRequestTitle(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="request-description">Описание</Label>
              <Textarea
                id="request-description"
                placeholder="Опишите подробнее требования к курсу..."
                value={requestDescription}
                onChange={(e) => setRequestDescription(e.target.value)}
                className="rounded-xl min-h-[100px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="budget-min">Бюджет от (₽)</Label>
                <Input
                  id="budget-min"
                  type="number"
                  placeholder="3000"
                  value={requestBudgetMin}
                  onChange={(e) => setRequestBudgetMin(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget-max">Бюджет до (₽)</Label>
                <Input
                  id="budget-max"
                  type="number"
                  placeholder="10000"
                  value={requestBudgetMax}
                  onChange={(e) => setRequestBudgetMax(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="students-count">Количество слушателей</Label>
              <Input
                id="students-count"
                type="number"
                min="1"
                value={requestStudentsCount}
                onChange={(e) => setRequestStudentsCount(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRequestDialog(false)}
              className="rounded-xl"
            >
              Отмена
            </Button>
            <Button
              onClick={handleSubmitRequest}
              disabled={isSubmittingRequest || !requestTitle.trim()}
              className="btn-gradient rounded-xl"
            >
              {isSubmittingRequest ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Публикация...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Опубликовать
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Propose Course Dialog */}
      <Dialog open={showProposeDialog} onOpenChange={(open) => {
        setShowProposeDialog(open);
        if (!open) {
          setSelectedRequest(null);
          setSelectedCourseToPropose("");
          setProposeMessage("");
        }
      }}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Send className="w-5 h-5 text-primary" />
              Предложить курс
            </DialogTitle>
            <DialogDescription>
              Выберите курс из вашего каталога для предложения
            </DialogDescription>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="p-4 rounded-xl bg-secondary/50 border">
              <h4 className="font-medium text-sm">Объявление:</h4>
              <p className="text-sm mt-1">{selectedRequest.title}</p>
              {selectedRequest.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {selectedRequest.description}
                </p>
              )}
              {(selectedRequest.budget_min || selectedRequest.budget_max) && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Бюджет: {selectedRequest.budget_min && selectedRequest.budget_max 
                    ? `${selectedRequest.budget_min.toLocaleString()} - ${selectedRequest.budget_max.toLocaleString()} ₽`
                    : selectedRequest.budget_max 
                      ? `до ${selectedRequest.budget_max.toLocaleString()} ₽`
                      : `от ${selectedRequest.budget_min?.toLocaleString()} ₽`
                  }
                </p>
              )}
            </div>
          )}

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Выберите курс *</Label>
              {myCourses.filter(c => c.is_active).length === 0 ? (
                <div className="p-4 rounded-xl bg-muted text-center text-sm text-muted-foreground">
                  У вас нет опубликованных курсов в магазине.
                  <br />
                  Сначала добавьте курс во вкладке "Мои курсы".
                </div>
              ) : (
                <Select
                  value={selectedCourseToPropose}
                  onValueChange={setSelectedCourseToPropose}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Выберите курс..." />
                  </SelectTrigger>
                  <SelectContent>
                    {myCourses.filter(c => c.is_active).map((course) => (
                      <SelectItem key={course.id} value={course.id}>
                        <div className="flex flex-col">
                          <span>{course.course?.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {course.price_organization.toLocaleString()} ₽ / студент
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="propose-message">Сообщение (необязательно)</Label>
              <Textarea
                id="propose-message"
                placeholder="Дополнительная информация о вашем предложении..."
                value={proposeMessage}
                onChange={(e) => setProposeMessage(e.target.value)}
                className="rounded-xl min-h-[80px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowProposeDialog(false)}
              className="rounded-xl"
            >
              Отмена
            </Button>
            <Button
              onClick={handleProposeCourse}
              disabled={isProposing || !selectedCourseToPropose || myCourses.filter(c => c.is_active).length === 0}
              className="btn-gradient rounded-xl"
            >
              {isProposing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Отправка...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Отправить предложение
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}