import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Store, ShoppingCart, GraduationCap, Loader2, CheckCircle,
  Eye, Edit, Trash2, Plus, Users, Building2, Search,
  DollarSign, Tag, Package, MessageSquarePlus, Megaphone, Send,
  Clock, Wallet, ChevronDown, ArrowLeft, Info, CreditCard, PlusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useCourseStoreManager } from "@/hooks/useCourseStoreManager";

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "Ожидает", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  approved: { label: "Одобрена", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  paid: { label: "Оплачена", color: "bg-green-500/10 text-green-600 border-green-500/20" },
  completed: { label: "Завершена", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  cancelled: { label: "Отменена", color: "bg-red-500/10 text-red-600 border-red-500/20" },
};

interface CourseStoreManagerProps {
  organizationId: string;
  userRole?: 'organization' | 'student';
  userId?: string;
  orgBalance?: number;
  deductBalance?: (amount: number, description: string, orderId?: string) => Promise<boolean>;
  topUpBalance?: (amount: number, description: string) => Promise<boolean>;
  refreshBalance?: () => Promise<void>;
}

export function CourseStoreManager({ organizationId, userRole = 'organization', userId, orgBalance, deductBalance, topUpBalance, refreshBalance }: CourseStoreManagerProps) {
  const navigate = useNavigate();
  const h = useCourseStoreManager({ organizationId, userRole, userId, orgBalance, deductBalance });
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [selectedCourseDetail, setSelectedCourseDetail] = useState<any>(null);
  const [showTopUpDialog, setShowTopUpDialog] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpComment, setTopUpComment] = useState("");
  const [isTopingUp, setIsTopingUp] = useState(false);

  const handleTopUp = async () => {
    const amount = parseFloat(topUpAmount);
    if (!amount || amount <= 0) return;
    setIsTopingUp(true);
    try {
      if (topUpBalance) {
        const ok = await topUpBalance(amount, topUpComment || "Пополнение баланса");
        if (ok) {
          setShowTopUpDialog(false);
          setTopUpAmount("");
          setTopUpComment("");
          refreshBalance?.();
        }
      }
    } finally {
      setIsTopingUp(false);
    }
  };

  if (h.isLoading) {
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
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Store className="w-6 h-6 text-primary" />
              <h2 className="font-display text-xl font-semibold">Магазин курсов</h2>
            </div>
            <p className="text-muted-foreground">Покупайте и продавайте учебные курсы другим организациям и студентам</p>
          </div>
          {userRole === 'organization' && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-background/80 rounded-xl px-4 py-2 border border-border">
                <Wallet className="w-4 h-4 text-primary" />
                <span className="text-sm text-muted-foreground">Баланс:</span>
                <span className="font-bold text-primary">{(orgBalance ?? 0).toLocaleString()} ₽</span>
              </div>
              <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={() => setShowTopUpDialog(true)}>
                <PlusCircle className="w-4 h-4" />Пополнить
              </Button>
            </div>
          )}
        </div>
      </div>

      <Tabs value={h.activeTab} onValueChange={(v) => h.setActiveTab(v as any)} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="catalog" className="flex items-center gap-2"><Package className="w-4 h-4" /><span className="hidden sm:inline">Каталог</span></TabsTrigger>
          <TabsTrigger value="my-courses" className="flex items-center gap-2"><GraduationCap className="w-4 h-4" /><span className="hidden sm:inline">Мои курсы</span></TabsTrigger>
          <TabsTrigger value="orders" className="flex items-center gap-2"><ShoppingCart className="w-4 h-4" /><span className="hidden sm:inline">Заявки</span></TabsTrigger>
          <TabsTrigger value="my-orders" className="flex items-center gap-2"><Tag className="w-4 h-4" /><span className="hidden sm:inline">Мои покупки</span></TabsTrigger>
        </TabsList>

        {/* Catalog Tab */}
        <TabsContent value="catalog" className="space-y-6">
          {selectedCourseDetail ? (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-6">
              <Button variant="ghost" className="gap-2 -ml-2" onClick={() => setSelectedCourseDetail(null)}>
                <ArrowLeft className="w-4 h-4" />Назад к каталогу
              </Button>

              <div>
                <h2 className="text-2xl font-display font-bold">{selectedCourseDetail.course?.title}</h2>
                <p className="text-muted-foreground flex items-center gap-1.5 mt-1">
                  <Building2 className="w-4 h-4" />{selectedCourseDetail.organization?.name}
                </p>
              </div>

              {selectedCourseDetail.course?.duration && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>Длительность: {selectedCourseDetail.course.duration}</span>
                </div>
              )}

              {(selectedCourseDetail.description_short || selectedCourseDetail.course?.description) && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Описание курса</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {selectedCourseDetail.description_short && (
                      <p className="text-muted-foreground leading-relaxed">{selectedCourseDetail.description_short}</p>
                    )}
                    {selectedCourseDetail.course?.description && (
                      <p className="leading-relaxed">{selectedCourseDetail.course.description}</p>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card className="text-center">
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1">
                    {h.userRole === 'student' ? <><Users className="w-4 h-4" />Цена</> : <><Building2 className="w-4 h-4" />Цена для организаций</>}
                  </div>
                  <div className="text-2xl font-bold text-primary">
                    {h.userRole === 'student' ? selectedCourseDetail.price_student.toLocaleString() : selectedCourseDetail.price_organization.toLocaleString()} ₽
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button variant="outline" className="flex-1 rounded-xl gap-2" onClick={() => { const id = selectedCourseDetail.course_id; setSelectedCourseDetail(null); navigate(`/course-preview/${id}?from=store`); }}>
                  <Eye className="w-4 h-4" />Просмотр
                </Button>
                <Button className="flex-1 rounded-xl gap-2 bg-green-600 hover:bg-green-700 text-white" onClick={() => { const item = selectedCourseDetail; setSelectedCourseDetail(null); h.setSelectedCourseForOrder(item); h.setPayFromBalance(true); h.setShowOrderDialog(true); }}>
                  <CreditCard className="w-4 h-4" />Купить
                </Button>
                <Button variant="secondary" className="flex-1 rounded-xl gap-2" onClick={() => { const item = selectedCourseDetail; setSelectedCourseDetail(null); h.setSelectedCourseForOrder(item); h.setPayFromBalance(false); h.setShowOrderDialog(true); }}>
                  <ShoppingCart className="w-4 h-4" />Оставить заявку
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Поиск курсов..." value={h.searchQuery} onChange={(e) => h.setSearchQuery(e.target.value)} className="pl-10 rounded-xl" />
                </div>
                <Button variant="outline" className="rounded-xl gap-2" onClick={() => h.setShowRequestDialog(true)}>
                  <MessageSquarePlus className="w-4 h-4" /><span className="hidden sm:inline">Разместить объявление</span>
                </Button>
              </div>

              {/* Course Requests */}
              {h.courseRequests.length > 0 && (
                <Card className="border-amber-500/30 bg-amber-500/5 overflow-hidden">
                  <button
                    onClick={() => setRequestsOpen(!requestsOpen)}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-amber-500/5 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Megaphone className="w-5 h-5 text-amber-500" />
                      <span className="font-semibold">Ищут курсы</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-amber-500/10 text-amber-600">{h.courseRequests.length} объявлений</Badge>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${requestsOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {requestsOpen && (
                    <CardContent className="space-y-3 pt-0">
                      {h.courseRequests.slice(0, 5).map((request) => (
                        <div key={request.id} className="p-4 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium line-clamp-1">{request.title}</h4>
                              {request.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{request.description}</p>}
                              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                                {(request.budget_min || request.budget_max) && (
                                  <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />
                                    {request.budget_min && request.budget_max ? `${request.budget_min.toLocaleString()} - ${request.budget_max.toLocaleString()} ₽` : request.budget_max ? `до ${request.budget_max.toLocaleString()} ₽` : `от ${request.budget_min?.toLocaleString()} ₽`}
                                  </span>
                                )}
                                {request.students_count && request.students_count > 1 && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{request.students_count} чел.</span>}
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{format(new Date(request.created_at), 'd MMM', { locale: ru })}</span>
                              </div>
                            </div>
                            <Button size="sm" variant="outline" className="rounded-lg shrink-0" onClick={() => { h.setSelectedRequest(request); h.setShowProposeDialog(true); }}>
                              <Send className="w-3 h-3 mr-1" />Предложить
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  )}
                </Card>
              )}

              {h.filteredCatalog.length === 0 ? (
                <Card className="border-dashed"><CardContent className="py-12 text-center"><Package className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" /><p className="text-muted-foreground">{h.searchQuery ? 'Курсы не найдены' : 'В каталоге пока нет курсов'}</p></CardContent></Card>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {h.filteredCatalog.map((item) => (
                    <Card key={item.id} className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setSelectedCourseDetail(item)}>
                      <CardHeader>
                        <CardTitle className="font-display text-lg leading-tight">{item.course?.title}</CardTitle>
                        <CardDescription className="mt-1 flex items-center gap-1"><Building2 className="w-3 h-3" />{item.organization?.name}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {item.description_short && <p className="text-sm text-muted-foreground line-clamp-2">{item.description_short}</p>}
                        {item.course?.duration && <Badge variant="outline" className="text-xs">{item.course.duration}</Badge>}
                        <div className="pt-2">
                          <div className="text-center p-3 bg-secondary/50 rounded-xl">
                            <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                              {h.userRole === 'student' ? <><Users className="w-3 h-3" />Цена</> : <><Building2 className="w-3 h-3" />Цена для организаций</>}
                            </div>
                            <div className="font-bold text-primary">{h.userRole === 'student' ? item.price_student.toLocaleString() : item.price_organization.toLocaleString()} ₽</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* My Courses Tab */}
        <TabsContent value="my-courses" className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Курсы вашей организации в магазине</p>
            <Button onClick={() => h.setShowAddDialog(true)} className="rounded-xl btn-gradient" disabled={h.availableCourses.length === 0}><Plus className="w-4 h-4 mr-2" />Добавить курс</Button>
          </div>
          {h.myCourses.length === 0 ? (
            <Card className="border-dashed"><CardContent className="py-12 text-center"><GraduationCap className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" /><p className="text-muted-foreground mb-4">Вы пока не добавили курсы</p><Button onClick={() => h.setShowAddDialog(true)} variant="outline" className="rounded-xl" disabled={h.availableCourses.length === 0}><Plus className="w-4 h-4 mr-2" />Добавить первый курс</Button></CardContent></Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {h.myCourses.map((item) => (
                <Card key={item.id} className={`overflow-hidden ${!item.is_active ? 'opacity-60' : ''}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between"><CardTitle className="font-display text-lg leading-tight flex-1">{item.course?.title}</CardTitle><Badge variant={item.is_active ? "default" : "secondary"}>{item.is_active ? 'Активен' : 'Скрыт'}</Badge></div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="text-center p-2 bg-secondary/50 rounded-lg"><div className="text-xs text-muted-foreground">Для студентов</div><div className="font-semibold">{item.price_student.toLocaleString()} ₽</div></div>
                      <div className="text-center p-2 bg-secondary/50 rounded-lg"><div className="text-xs text-muted-foreground">Для организаций</div><div className="font-semibold">{item.price_organization.toLocaleString()} ₽</div></div>
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-2"><Switch checked={item.is_active} onCheckedChange={() => h.handleToggleActive(item)} /><span className="text-sm text-muted-foreground">{item.is_active ? 'Виден' : 'Скрыт'}</span></div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { h.setEditingCourse(item); h.setShowEditDialog(true); }}><Edit className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => h.handleDeleteFromMarketplace(item.id)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Received Orders */}
        <TabsContent value="orders" className="space-y-6">
          <p className="text-sm text-muted-foreground">Заявки на покупку ваших курсов</p>
          {h.receivedOrders.length === 0 ? (
            <Card className="border-dashed"><CardContent className="py-12 text-center"><ShoppingCart className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" /><p className="text-muted-foreground">Пока нет заявок</p></CardContent></Card>
          ) : (
            <Card><Table><TableHeader><TableRow><TableHead>Курс</TableHead><TableHead>Покупатель</TableHead><TableHead>Тип</TableHead><TableHead>Сумма</TableHead><TableHead>Статус</TableHead><TableHead>Дата</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>
              {h.receivedOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.marketplace_course?.course?.title}</TableCell>
                  <TableCell>{order.buyer_type === 'organization' ? 'Организация' : 'Студент'}</TableCell>
                  <TableCell><Badge variant="outline">{order.buyer_type === 'organization' ? `${order.students_count} студ.` : '1 студент'}</Badge></TableCell>
                  <TableCell className="font-semibold">{order.price.toLocaleString()} ₽</TableCell>
                  <TableCell><Badge className={statusLabels[order.status]?.color}>{statusLabels[order.status]?.label}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(order.created_at), 'dd.MM.yyyy', { locale: ru })}</TableCell>
                  <TableCell><Button variant="ghost" size="sm" onClick={() => { h.setSelectedOrder(order); h.setShowOrderDetailsDialog(true); }}><Eye className="w-4 h-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody></Table></Card>
          )}
        </TabsContent>

        {/* My Orders */}
        <TabsContent value="my-orders" className="space-y-6">
          <p className="text-sm text-muted-foreground">Ваши заявки на покупку курсов</p>
          {h.myOrders.length === 0 ? (
            <Card className="border-dashed"><CardContent className="py-12 text-center"><Tag className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" /><p className="text-muted-foreground">Вы пока не оформляли заявки</p></CardContent></Card>
          ) : (
            <Card><Table><TableHeader><TableRow><TableHead>Курс</TableHead><TableHead>Продавец</TableHead><TableHead>Сумма</TableHead><TableHead>Статус</TableHead><TableHead>Дата</TableHead></TableRow></TableHeader><TableBody>
              {h.myOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.marketplace_course?.course?.title}</TableCell>
                  <TableCell>{order.marketplace_course?.organization?.name}</TableCell>
                  <TableCell className="font-semibold">{order.price.toLocaleString()} ₽</TableCell>
                  <TableCell><Badge className={statusLabels[order.status]?.color}>{statusLabels[order.status]?.label}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(order.created_at), 'dd.MM.yyyy', { locale: ru })}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table></Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Course Dialog */}
      <Dialog open={h.showAddDialog} onOpenChange={h.setShowAddDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader><DialogTitle className="font-display">Добавить курс в магазин</DialogTitle><DialogDescription>Выберите курс и установите цены</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Курс</Label><Select value={h.selectedCourseToAdd} onValueChange={h.setSelectedCourseToAdd}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите курс" /></SelectTrigger><SelectContent>{h.availableCourses.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Цена для студентов (₽)</Label><Input type="number" value={h.priceStudent} onChange={(e) => h.setPriceStudent(e.target.value)} placeholder="5000" className="rounded-xl" /></div>
              <div className="space-y-2"><Label>Цена для организаций (₽)</Label><Input type="number" value={h.priceOrg} onChange={(e) => h.setPriceOrg(e.target.value)} placeholder="3000" className="rounded-xl" /></div>
            </div>
            <div className="space-y-2"><Label>Краткое описание</Label><Textarea value={h.shortDescription} onChange={(e) => h.setShortDescription(e.target.value)} placeholder="Расскажите о курсе..." className="rounded-xl" /></div>
          </div>
          <DialogFooter><Button className="w-full btn-gradient rounded-xl" onClick={h.handleAddToMarketplace} disabled={h.isAdding || !h.selectedCourseToAdd || !h.priceStudent || !h.priceOrg}>{h.isAdding ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Добавление...</> : 'Добавить в магазин'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Dialog */}
      <Dialog open={h.showOrderDialog} onOpenChange={h.setShowOrderDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader><DialogTitle className="font-display">Оформление заявки</DialogTitle><DialogDescription>{h.selectedCourseForOrder?.course?.title}</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            {/* Resale rights notice */}
            {h.userRole === 'organization' && (
              <div className="flex gap-3 p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
                <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">После покупки курс становится вашей собственностью. Вы можете использовать его для обучения своих студентов, перепродавать или использовать по своему усмотрению.</p>
              </div>
            )}
            <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center"><span className="text-muted-foreground">Продавец:</span><span className="font-medium">{h.selectedCourseForOrder?.organization?.name || "Платформа Синтагма"}</span></div>
            </div>
            {h.userRole === 'organization' && (orgBalance ?? 0) > 0 && (
              <div className="flex items-center justify-between p-3 bg-primary/5 rounded-xl border border-primary/20">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-primary" />
                  <span className="text-sm">Оплатить с баланса</span>
                  <span className="text-xs text-muted-foreground">({(orgBalance ?? 0).toLocaleString()} ₽)</span>
                </div>
                <Switch checked={h.payFromBalance} onCheckedChange={h.setPayFromBalance} />
              </div>
            )}
            <div className="space-y-2"><Label>Комментарий</Label><Textarea value={h.orderNotes} onChange={(e) => h.setOrderNotes(e.target.value)} placeholder="Дополнительная информация..." className="rounded-xl" /></div>
          </div>
          <DialogFooter><Button className="w-full btn-gradient rounded-xl" onClick={h.handleOrder} disabled={h.isOrdering}>{h.isOrdering ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Отправка...</> : h.payFromBalance ? 'Оплатить с баланса' : 'Отправить заявку'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={h.showSuccessDialog} onOpenChange={h.setShowSuccessDialog}>
        <DialogContent className="rounded-2xl text-center max-w-sm">
          <div className="py-6">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-8 h-8 text-green-500" /></div>
            <DialogTitle className="font-display text-xl mb-2">Заявка отправлена!</DialogTitle>
            <DialogDescription className="text-base">Продавец получит уведомление и свяжется с вами.</DialogDescription>
            <Button className="mt-6 btn-gradient rounded-xl" onClick={() => h.setShowSuccessDialog(false)}>Отлично</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Course Dialog */}
      <Dialog open={h.showEditDialog} onOpenChange={h.setShowEditDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader><DialogTitle className="font-display">Редактировать курс</DialogTitle></DialogHeader>
          {h.editingCourse && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Цена для студентов (₽)</Label><Input type="number" value={h.editingCourse.price_student} onChange={(e) => h.setEditingCourse({ ...h.editingCourse!, price_student: parseFloat(e.target.value) || 0 })} className="rounded-xl" /></div>
                <div className="space-y-2"><Label>Цена для организаций (₽)</Label><Input type="number" value={h.editingCourse.price_organization} onChange={(e) => h.setEditingCourse({ ...h.editingCourse!, price_organization: parseFloat(e.target.value) || 0 })} className="rounded-xl" /></div>
              </div>
              <div className="space-y-2"><Label>Краткое описание</Label><Textarea value={h.editingCourse.description_short || ''} onChange={(e) => h.setEditingCourse({ ...h.editingCourse!, description_short: e.target.value })} className="rounded-xl" /></div>
            </div>
          )}
          <DialogFooter><Button className="w-full btn-gradient rounded-xl" onClick={h.handleEditCourse}>Сохранить</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      <Dialog open={h.showOrderDetailsDialog} onOpenChange={h.setShowOrderDetailsDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader><DialogTitle className="font-display">Детали заявки</DialogTitle></DialogHeader>
          {h.selectedOrder && (
            <div className="space-y-4 py-4">
              <div className="space-y-3">
                <div className="flex justify-between"><span className="text-muted-foreground">Курс:</span><span className="font-medium">{h.selectedOrder.marketplace_course?.course?.title}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Тип:</span><span>{h.selectedOrder.buyer_type === 'organization' ? 'Организация' : 'Студент'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Количество:</span><span>{h.selectedOrder.students_count} студ.</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Сумма:</span><span className="font-bold text-primary">{h.selectedOrder.price.toLocaleString()} ₽</span></div>
                {h.selectedOrder.notes && <div className="pt-2 border-t"><span className="text-sm text-muted-foreground">Комментарий:</span><p className="mt-1">{h.selectedOrder.notes}</p></div>}
              </div>
              <div className="space-y-2">
                <Label>Изменить статус</Label>
                <Select value={h.selectedOrder.status} onValueChange={(value) => h.handleUpdateOrderStatus(h.selectedOrder!.id, value)}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Ожидает</SelectItem><SelectItem value="approved">Одобрена</SelectItem>
                    <SelectItem value="paid">Оплачена</SelectItem><SelectItem value="completed">Завершена</SelectItem>
                    <SelectItem value="cancelled">Отменена</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Request Dialog */}
      <Dialog open={h.showRequestDialog} onOpenChange={h.setShowRequestDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader><DialogTitle className="font-display">Новое объявление</DialogTitle><DialogDescription>Расскажите, какой курс ищете</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Заголовок *</Label><Input value={h.requestTitle} onChange={(e) => h.setRequestTitle(e.target.value)} placeholder="Какой курс вы ищете?" className="rounded-xl" /></div>
            <div className="space-y-2"><Label>Описание</Label><Textarea value={h.requestDescription} onChange={(e) => h.setRequestDescription(e.target.value)} placeholder="Подробности..." className="rounded-xl" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Бюджет от (₽)</Label><Input type="number" value={h.requestBudgetMin} onChange={(e) => h.setRequestBudgetMin(e.target.value)} className="rounded-xl" /></div>
              <div className="space-y-2"><Label>Бюджет до (₽)</Label><Input type="number" value={h.requestBudgetMax} onChange={(e) => h.setRequestBudgetMax(e.target.value)} className="rounded-xl" /></div>
            </div>
            <div className="space-y-2"><Label>Количество учеников</Label><Input type="number" min={1} value={h.requestStudentsCount} onChange={(e) => h.setRequestStudentsCount(e.target.value)} className="rounded-xl" /></div>
          </div>
          <DialogFooter><Button className="w-full btn-gradient rounded-xl" onClick={h.handleSubmitRequest} disabled={h.isSubmittingRequest || !h.requestTitle.trim()}>{h.isSubmittingRequest ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Публикация...</> : 'Опубликовать'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Propose Course Dialog */}
      <Dialog open={h.showProposeDialog} onOpenChange={h.setShowProposeDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader><DialogTitle className="font-display">Предложить курс</DialogTitle><DialogDescription>Объявление: {h.selectedRequest?.title}</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Выберите курс</Label>
              <Select value={h.selectedCourseToPropose} onValueChange={h.setSelectedCourseToPropose}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите курс" /></SelectTrigger>
                <SelectContent>{h.myCourses.map((c) => <SelectItem key={c.id} value={c.id}>{c.course?.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Сообщение</Label><Textarea value={h.proposeMessage} onChange={(e) => h.setProposeMessage(e.target.value)} placeholder="Дополнительная информация..." className="rounded-xl" /></div>
          </div>
          <DialogFooter><Button className="w-full btn-gradient rounded-xl" onClick={h.handleProposeCourse} disabled={h.isProposing || !h.selectedCourseToPropose}>{h.isProposing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Отправка...</> : 'Отправить предложение'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Top Up Balance Dialog */}
      <Dialog open={showTopUpDialog} onOpenChange={setShowTopUpDialog}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Пополнить баланс</DialogTitle>
            <DialogDescription>Укажите сумму для пополнения</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Сумма (₽)</Label>
              <Input type="number" min={1} value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} placeholder="10000" className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label>Комментарий</Label>
              <Input value={topUpComment} onChange={(e) => setTopUpComment(e.target.value)} placeholder="Пополнение баланса" className="rounded-xl" />
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full btn-gradient rounded-xl" onClick={handleTopUp} disabled={isTopingUp || !topUpAmount || parseFloat(topUpAmount) <= 0}>
              {isTopingUp ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Пополнение...</> : 'Пополнить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
