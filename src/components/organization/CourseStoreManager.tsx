import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Store, ShoppingCart, GraduationCap, CheckCircle,
  Eye, Edit, Trash2, Plus, Users, Building2, Search,
  Tag, Package, MessageSquarePlus, Megaphone, Send,
  Clock, ChevronDown, ArrowLeft, Info,
  List, LayoutGrid, Gift, Award, Zap, BookOpen, ShieldCheck, Lightbulb,
  Factory, Flame, Droplets, HardHat, Leaf,
  Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useCourseStoreManager } from "@/hooks/useCourseStoreManager";
import { CourseComments } from "./CourseComments";
import { CourseStoreDetailView } from "./CourseStoreDetailView";
import { MarketplaceHeroCards } from "@/components/admin/marketplace/MarketplaceHeroCards";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

import { statusLabels, getProgramTypeMeta, getSubCategoryMeta } from "@/components/admin/marketplace/marketplaceConstants";

interface CourseStoreManagerProps {
  organizationId: string;
  userRole?: 'organization' | 'student';
  userId?: string;
}

export function CourseStoreManager({ organizationId, userRole = 'organization', userId }: CourseStoreManagerProps) {
  const navigate = useNavigate();
  const h = useCourseStoreManager({ organizationId, userRole, userId });
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [catalogViewMode, setCatalogViewMode] = useState<'list' | 'grid'>('list');
  const [selectedCourseDetail, setSelectedCourseDetail] = useState<any>(null);

  if (h.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <SigmaSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={h.activeTab} onValueChange={(v) => h.setActiveTab(v as any)} className="space-y-0">
        <div className="flex gap-6">
          {/* Vertical sidebar nav */}
          <div className="w-[200px] shrink-0">
            <TabsList className="flex flex-col gap-1 sticky top-4 h-auto bg-transparent p-0 w-full">
              {[
                { value: "catalog", icon: Package, label: "Каталог" },
                { value: "my-courses", icon: GraduationCap, label: "Мои курсы" },
                { value: "requests", icon: Megaphone, label: "Ищут курсы" },
                { value: "orders", icon: ShoppingCart, label: "Заявки" },
                { value: "my-orders", icon: Tag, label: "Добавленные" },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = h.activeTab === item.value;
                return (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium justify-start w-full transition-colors
                      ${isActive ? "bg-primary/10 text-primary shadow-sm" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}
                    `}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {item.label}
                    {item.value === "requests" && h.courseRequests.length > 0 && (
                      <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600">{h.courseRequests.length}</Badge>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-6">

        {/* Catalog Tab */}
        <TabsContent value="catalog" className="space-y-6">
          {selectedCourseDetail ? (
            <CourseStoreDetailView
              course={selectedCourseDetail}
              userRole={h.userRole}
              userId={userId}
              onBack={() => setSelectedCourseDetail(null)}
              onOrder={(item) => { setSelectedCourseDetail(null); h.setSelectedCourseForOrder(item); h.setShowOrderDialog(true); }}
            />
          ) : (
             <>
               {/* Info banner */}
               <div className="bg-gradient-to-r from-primary/5 via-accent/5 to-primary/3 border border-border rounded-xl p-4">
                 <div className="flex gap-3 items-start">
                   <ShieldCheck className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                   <div>
                     <h4 className="font-semibold text-sm text-foreground mb-1">Курсы ДПО и профессионального обучения</h4>
                     <p className="text-xs text-muted-foreground leading-relaxed">
                       Повышение квалификации, профпереподготовка, охрана труда и рабочие профессии. Тесты соответствуют требованиям аттестации.
                     </p>
                     <div className="flex gap-2 mt-2">
                       <Badge variant="secondary" className="text-xs">ДПО</Badge>
                       <Badge variant="secondary" className="text-xs">ОТ / ПБ</Badge>
                       <Badge variant="secondary" className="text-xs">Бесплатно</Badge>
                     </div>
                   </div>
                 </div>
               </div>
               {/* Hero Cards */}
               <MarketplaceHeroCards onCardClick={(courseTitle) => {
                 const found = h.catalogCourses.find(c => c.course?.title?.includes(courseTitle.split('—')[0].trim()) || courseTitle.includes(c.course?.title || '___'));
                 if (found) {
                   setSelectedCourseDetail(found);
                 } else {
                   h.setSearchQuery(courseTitle);
                 }
               }} />

               <div className="flex items-center gap-4">
                 <div className="relative flex-1 max-w-md">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                   <Input placeholder="Поиск курсов..." value={h.searchQuery} onChange={(e) => h.setSearchQuery(e.target.value)} className="pl-10 rounded-xl" />
                 </div>
                 <div className="flex items-center gap-1 border rounded-lg p-0.5">
                   <Button variant={catalogViewMode === "list" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setCatalogViewMode("list")}>
                     <List className="w-4 h-4" />
                   </Button>
                   <Button variant={catalogViewMode === "grid" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setCatalogViewMode("grid")}>
                     <LayoutGrid className="w-4 h-4" />
                   </Button>
                 </div>
                 <Badge variant="secondary">{h.filteredCatalog.length} курсов</Badge>
               </div>

              {h.filteredCatalog.length === 0 ? (
                <Card className="border-dashed"><CardContent className="py-12 text-center"><Package className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" /><p className="text-muted-foreground">{h.searchQuery ? 'Курсы не найдены' : 'В каталоге пока нет курсов'}</p></CardContent></Card>
              ) : catalogViewMode === 'list' ? (
                /* Grouped list view — card per category */
                <div className="space-y-4">
                  <div className="grid gap-6">
                    {h.groupedCatalog.map((group) => {
                      const meta = getProgramTypeMeta(group.category);
                      const CatIcon = meta.icon;

                      if (group.subGroups) {
                        return (
                          <Collapsible key={group.category} defaultOpen={false}>
                            <CollapsibleTrigger className="flex items-center gap-3 w-full p-4 rounded-xl border border-border bg-card hover:bg-secondary/30 transition-colors">
                              <div className={`w-10 h-10 rounded-lg ${meta.bgColor} flex items-center justify-center shrink-0`}>
                                <CatIcon className={`w-5 h-5 ${meta.color}`} />
                              </div>
                              <div className="flex-1 text-left">
                                <h3 className="font-display text-lg font-medium">{group.category}</h3>
                              </div>
                              <Badge variant="outline" className="text-[10px]">{group.badge}</Badge>
                              <Badge variant="secondary">{group.courses.length} курсов</Badge>
                              <ChevronDown className="w-5 h-5 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="space-y-3 mt-3 pl-2">
                              {group.subGroups.map((sub) => {
                                const subMeta = getSubCategoryMeta(sub.category);
                                const SubIcon = subMeta.icon;
                                return (
                                  <Collapsible key={sub.category} defaultOpen={false}>
                                    <CollapsibleTrigger className="flex items-center gap-3 w-full p-3 rounded-lg border border-border/60 bg-card/80 hover:bg-secondary/20 transition-colors">
                                      <div className={`w-8 h-8 rounded-lg ${subMeta.bgColor} flex items-center justify-center shrink-0`}>
                                        <SubIcon className={`w-4 h-4 ${subMeta.color}`} />
                                      </div>
                                      <span className="flex-1 text-left font-medium text-sm">{sub.category}</span>
                                      <span className="text-xs text-muted-foreground">
                                        {sub.courses.length} {sub.courses.length === 1 ? 'курс' : sub.courses.length < 5 ? 'курса' : 'курсов'}
                                      </span>
                                      <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="pt-2 pl-11">
                                      {sub.courses.length === 0 ? (
                                        <p className="text-xs text-muted-foreground py-2 italic">Курсы ещё не добавлены</p>
                                      ) : (
                                        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
                                          {sub.courses.map((item) => (
                                            <button
                                              key={item.id}
                                              className="flex items-start gap-2 py-1 text-left hover:text-accent transition-colors group/item"
                                              onClick={() => setSelectedCourseDetail(item)}
                                            >
                                              <CheckCircle className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                                              <span className="text-sm text-foreground/75 group-hover/item:text-accent">{item.course?.title || ""}</span>
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </CollapsibleContent>
                                  </Collapsible>
                                );
                              })}
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      }

                      return (
                        <Collapsible key={group.category} defaultOpen={false}>
                          <CollapsibleTrigger className="flex items-center gap-3 w-full p-4 rounded-xl border border-border bg-card hover:bg-secondary/30 transition-colors">
                            <div className={`w-10 h-10 rounded-lg ${meta.bgColor} flex items-center justify-center shrink-0`}>
                              <CatIcon className={`w-5 h-5 ${meta.color}`} />
                            </div>
                            <span className="flex-1 text-left font-display text-lg font-medium">{group.category}</span>
                            <Badge variant="outline" className="text-[10px]">{group.badge}</Badge>
                            <Badge variant="secondary">
                              {group.courses.length} {group.courses.length === 1 ? 'курс' : group.courses.length < 5 ? 'курса' : 'курсов'}
                            </Badge>
                            <ChevronDown className="w-5 h-5 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                          </CollapsibleTrigger>
                          <CollapsibleContent className="pt-3 pl-13">
                            {group.courses.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-2 italic">Курсы ещё не добавлены</p>
                            ) : (
                              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
                                {group.courses.map((item) => (
                                  <button
                                    key={item.id}
                                    className="flex items-start gap-2 py-1 text-left hover:text-accent transition-colors group/item"
                                    onClick={() => setSelectedCourseDetail(item)}
                                  >
                                    <CheckCircle className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                                    <span className="text-sm text-foreground/75 group-hover/item:text-accent">{item.course?.title || ""}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Grid view - CourseCardNew style */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {h.filteredCatalog.map((item) => {
                    const price = h.userRole === 'organization' ? item.price_organization : item.price_student;
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedCourseDetail(item)}
                        className="group bg-card rounded-2xl border border-border overflow-hidden hover:shadow-lg transition-all cursor-pointer flex flex-col"
                      >
                        <div className="relative h-36 bg-muted overflow-hidden">
                          {item.course?.cover_image_url ? (
                            <img src={item.course.cover_image_url} alt={item.course?.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                              <BookOpen className="w-10 h-10 text-primary/40" />
                            </div>
                          )}
                          {item.course?.duration && (
                            <Badge variant="secondary" className="absolute top-2 left-2 text-[10px]">{item.course.duration}</Badge>
                          )}
                        </div>
                        <div className="p-3 flex flex-col flex-1">
                          <h3 className="font-semibold text-sm line-clamp-2 mb-1">{item.course?.title}</h3>
                          {item.description_short && <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{item.description_short}</p>}
                          <div className="mt-auto space-y-2">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{item.organization?.name}</span>
                              <span className={`font-bold ${price > 0 ? "text-primary" : "text-green-600"}`}>
                                {price > 0 ? `${price.toLocaleString()} ₽` : "Бесплатно"}
                              </span>
                            </div>
                            <Button size="sm" className="w-full gap-1.5" variant="outline">
                              <Gift className="w-3.5 h-3.5" />Получить курс
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Requests Tab - Ищут курсы */}
        <TabsContent value="requests" className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Объявления о поиске курсов</p>
            <Button variant="outline" className="rounded-xl gap-2" onClick={() => h.setShowRequestDialog(true)}>
              <MessageSquarePlus className="w-4 h-4" />Создать объявление
            </Button>
          </div>
          {h.courseRequests.length === 0 ? (
            <Card className="border-dashed"><CardContent className="py-12 text-center"><Megaphone className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" /><p className="text-muted-foreground">Пока нет объявлений о поиске курсов</p></CardContent></Card>
          ) : (
            <div className="space-y-3">
              {h.courseRequests.map((request) => (
                <Card key={request.id} className="hover:border-primary/30 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium line-clamp-1">{request.title}</h4>
                        {request.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{request.description}</p>}
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                          {request.students_count && request.students_count > 1 && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{request.students_count} чел.</span>}
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{format(new Date(request.created_at), 'd MMM', { locale: ru })}</span>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="rounded-lg shrink-0" onClick={() => { h.setSelectedRequest(request); h.setShowProposeDialog(true); }}>
                        <Send className="w-3 h-3 mr-1" />Предложить
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
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
                    <div className="flex items-start justify-between"><CardTitle className="text-lg leading-tight flex-1">{item.course?.title}</CardTitle><Badge variant={item.is_active ? "default" : "secondary"}>{item.is_active ? 'Активен' : 'Скрыт'}</Badge></div>
                  </CardHeader>
                  <CardContent className="space-y-4">
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
          <p className="text-sm text-muted-foreground">Заявки на получение ваших курсов</p>
          {h.receivedOrders.length === 0 ? (
            <Card className="border-dashed"><CardContent className="py-12 text-center"><ShoppingCart className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" /><p className="text-muted-foreground">Пока нет заявок</p></CardContent></Card>
          ) : (
            <Card><Table><TableHeader><TableRow><TableHead>Курс</TableHead><TableHead>Получатель</TableHead><TableHead>Тип</TableHead><TableHead>Статус</TableHead><TableHead>Дата</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>
              {h.receivedOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.marketplace_course?.course?.title}</TableCell>
                  <TableCell>{order.buyer_type === 'organization' ? 'Организация' : 'Студент'}</TableCell>
                  <TableCell><Badge variant="outline">{order.buyer_type === 'organization' ? `${order.students_count} студ.` : '1 студент'}</Badge></TableCell>
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
          <p className="text-sm text-muted-foreground">Курсы, которые вы добавили из магазина</p>
          {h.myOrders.length === 0 ? (
            <Card className="border-dashed"><CardContent className="py-12 text-center"><Tag className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" /><p className="text-muted-foreground">Вы пока не добавляли курсы</p></CardContent></Card>
          ) : (
            <Card><Table><TableHeader><TableRow><TableHead>Курс</TableHead><TableHead>Источник</TableHead><TableHead>Статус</TableHead><TableHead>Дата</TableHead></TableRow></TableHeader><TableBody>
              {h.myOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.marketplace_course?.course?.title}</TableCell>
                  <TableCell>{order.marketplace_course?.organization?.name}</TableCell>
                  <TableCell><Badge className={statusLabels[order.status]?.color}>{statusLabels[order.status]?.label}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(order.created_at), 'dd.MM.yyyy', { locale: ru })}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table></Card>
          )}
        </TabsContent>
          </div>{/* end main content */}
        </div>{/* end flex */}
      </Tabs>

      <AddCourseDialog
        open={h.showAddDialog} onOpenChange={h.setShowAddDialog}
        availableCourses={h.availableCourses} selectedCourseToAdd={h.selectedCourseToAdd} setSelectedCourseToAdd={h.setSelectedCourseToAdd}
        shortDescription={h.shortDescription} setShortDescription={h.setShortDescription}
        priceStudent={h.priceStudent} setPriceStudent={h.setPriceStudent}
        priceOrganization={h.priceOrganization} setPriceOrganization={h.setPriceOrganization}
        isAdding={h.isAdding} onAdd={h.handleAddToMarketplace}
      />
      <OrderDialog
        open={h.showOrderDialog} onOpenChange={h.setShowOrderDialog}
        course={h.selectedCourseForOrder} userRole={h.userRole}
        studentsCount={h.studentsCount} setStudentsCount={h.setStudentsCount}
        orderNotes={h.orderNotes} setOrderNotes={h.setOrderNotes}
        isOrdering={h.isOrdering} onOrder={h.handleOrder}
      />
      <SuccessDialog open={h.showSuccessDialog} onOpenChange={h.setShowSuccessDialog} />
      <EditCourseStoreDialog
        open={h.showEditDialog} onOpenChange={h.setShowEditDialog}
        editingCourse={h.editingCourse} setEditingCourse={h.setEditingCourse} onSave={h.handleEditCourse}
      />
      <OrderDetailsDialog
        open={h.showOrderDetailsDialog} onOpenChange={h.setShowOrderDetailsDialog}
        order={h.selectedOrder} onUpdateStatus={h.handleUpdateOrderStatus}
      />
      <RequestDialog
        open={h.showRequestDialog} onOpenChange={h.setShowRequestDialog}
        requestTitle={h.requestTitle} setRequestTitle={h.setRequestTitle}
        requestDescription={h.requestDescription} setRequestDescription={h.setRequestDescription}
        requestStudentsCount={h.requestStudentsCount} setRequestStudentsCount={h.setRequestStudentsCount}
        isSubmitting={h.isSubmittingRequest} onSubmit={h.handleSubmitRequest}
      />
      <ProposeDialog
        open={h.showProposeDialog} onOpenChange={h.setShowProposeDialog}
        selectedRequest={h.selectedRequest} myCourses={h.myCourses}
        selectedCourseToPropose={h.selectedCourseToPropose} setSelectedCourseToPropose={h.setSelectedCourseToPropose}
        proposeMessage={h.proposeMessage} setProposeMessage={h.setProposeMessage}
        isProposing={h.isProposing} onPropose={h.handleProposeCourse}
      />
    </div>
  );
}
