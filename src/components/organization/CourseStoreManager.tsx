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
import { MarketplaceHeroCards } from "@/components/admin/marketplace/MarketplaceHeroCards";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "Ожидает", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  approved: { label: "Одобрена", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  paid: { label: "Оплачена", color: "bg-green-500/10 text-green-600 border-green-500/20" },
  completed: { label: "Завершена", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  cancelled: { label: "Отменена", color: "bg-red-500/10 text-red-600 border-red-500/20" } };

interface CourseStoreManagerProps {
  organizationId: string;
  userRole?: 'organization' | 'student';
  userId?: string;
}

const programTypeMeta: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  "Повышение квалификации": { icon: GraduationCap, color: "text-blue-600", bgColor: "bg-blue-500/10" },
  "Профессиональная переподготовка": { icon: Award, color: "text-violet-600", bgColor: "bg-violet-500/10" },
  "Охрана труда / Пожарная безопасность": { icon: ShieldCheck, color: "text-amber-600", bgColor: "bg-amber-500/10" },
  "Рабочие профессии": { icon: Store, color: "text-emerald-600", bgColor: "bg-emerald-500/10" } };

const subCategoryMeta: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  "Промышленная безопасность": { icon: Factory, color: "text-orange-500", bgColor: "bg-orange-500/10" },
  "Электробезопасность": { icon: Zap, color: "text-yellow-500", bgColor: "bg-yellow-500/10" },
  "Энергетика": { icon: Flame, color: "text-red-500", bgColor: "bg-red-500/10" },
  "Экологическая безопасность": { icon: Leaf, color: "text-green-500", bgColor: "bg-green-500/10" },
  "Гидротехнические сооружения": { icon: Droplets, color: "text-blue-500", bgColor: "bg-blue-500/10" },
  "Строительный контроль": { icon: HardHat, color: "text-accent", bgColor: "bg-accent/10" } };

const getProgramTypeMeta = (category: string) =>
  programTypeMeta[category] || { icon: BookOpen, color: "text-primary", bgColor: "bg-primary/10" };

const getSubCategoryMeta = (category: string) =>
  subCategoryMeta[category] || { icon: BookOpen, color: "text-primary", bgColor: "bg-primary/10" };

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
            <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-6">
              <Button variant="ghost" className="gap-2 -ml-2" onClick={() => setSelectedCourseDetail(null)}>
                <ArrowLeft className="w-4 h-4" />Назад к каталогу
              </Button>

              <div>
                <h2 className="text-2xl font-bold">{selectedCourseDetail.course?.title}</h2>
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

              {/* Benefits block */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { icon: Zap, text: "Доступ сразу после получения" },
                  { icon: BookOpen, text: "Все материалы и тесты включены" },
                  { icon: Award, text: "Удостоверение по завершении" },
                ].map((b, i) => (
                  <div key={i} className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/50 border border-border">
                    <b.icon className="w-4 h-4 text-green-600 shrink-0" />
                    <span className="text-sm">{b.text}</span>
                  </div>
                ))}
              </div>

              {/* Price block */}
              {(() => {
                const price = h.userRole === 'organization' ? selectedCourseDetail.price_organization : selectedCourseDetail.price_student;
                return (
                  <Card className={`text-center ${price > 0 ? 'border-primary/20 bg-primary/5' : 'border-green-500/20 bg-green-500/5'}`}>
                    <CardContent className="pt-6 pb-4 space-y-1">
                      <div className={`text-2xl font-bold ${price > 0 ? 'text-primary' : 'text-green-600'}`}>
                        {price > 0 ? `${price.toLocaleString()} ₽` : 'БЕСПЛАТНО'}
                      </div>
                      <p className="text-xs text-muted-foreground">{price > 0 ? 'Ограниченное предложение' : 'Доступно всем организациям'}</p>
                    </CardContent>
                  </Card>
                );
              })()}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button variant="outline" className="flex-1 rounded-xl gap-2" onClick={() => { const id = selectedCourseDetail.course_id; setSelectedCourseDetail(null); navigate(`/course-preview/${id}?from=store`); }}>
                  <Eye className="w-4 h-4" />Просмотр
                </Button>
                {(() => {
                  const price = h.userRole === 'organization' ? selectedCourseDetail.price_organization : selectedCourseDetail.price_student;
                  return (
                    <Button className="flex-1 rounded-xl gap-2 text-base py-5 bg-green-600 hover:bg-green-700 text-white" onClick={() => { const item = selectedCourseDetail; setSelectedCourseDetail(null); h.setSelectedCourseForOrder(item); h.setShowOrderDialog(true); }}>
                      <Plus className="w-4 h-4" />Получить курс
                    </Button>
                  );
                })()}
              </div>

              {/* Comments */}
              <CourseComments marketplaceCourseId={selectedCourseDetail.id} userId={userId} />
            </div>
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

      {/* Add Course Dialog */}
      <Dialog open={h.showAddDialog} onOpenChange={h.setShowAddDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader><DialogTitle>Добавить курс в магазин</DialogTitle><DialogDescription>Выберите курс для публикации</DialogDescription></DialogHeader>
           <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Курс</Label><Select value={h.selectedCourseToAdd} onValueChange={h.setSelectedCourseToAdd}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите курс" /></SelectTrigger><SelectContent>{h.availableCourses.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Краткое описание</Label><Textarea value={h.shortDescription} onChange={(e) => h.setShortDescription(e.target.value)} placeholder="Расскажите о курсе..." className="rounded-xl" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Цена для студента (₽)</Label><Input type="number" min={0} value={h.priceStudent} onChange={(e) => h.setPriceStudent(Number(e.target.value) || 0)} className="rounded-xl" /></div>
              <div className="space-y-2"><Label>Цена для организации (₽)</Label><Input type="number" min={0} value={h.priceOrganization} onChange={(e) => h.setPriceOrganization(Number(e.target.value) || 0)} className="rounded-xl" /></div>
            </div>
            <p className="text-xs text-muted-foreground">Оставьте 0 для бесплатного доступа</p>
          </div>
          <DialogFooter><Button className="w-full btn-gradient rounded-xl" onClick={h.handleAddToMarketplace} disabled={h.isAdding || !h.selectedCourseToAdd}>{h.isAdding ? <><SigmaSpinner size="sm" className="mr-2" />Добавление...</> : 'Добавить в магазин'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Dialog — simplified to direct clone */}
      <Dialog open={h.showOrderDialog} onOpenChange={h.setShowOrderDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          {(() => {
            const orderPrice = h.selectedCourseForOrder ? (h.userRole === 'organization' ? h.selectedCourseForOrder.price_organization : h.selectedCourseForOrder.price_student) : 0;
            const totalPrice = h.userRole === 'organization' ? orderPrice * h.studentsCount : orderPrice;
            return (
              <>
                <DialogHeader><DialogTitle>Получить курс</DialogTitle><DialogDescription>{h.selectedCourseForOrder?.course?.title}</DialogDescription></DialogHeader>
                <div className="space-y-4 py-4">
                  {h.userRole === 'organization' && (
                    <div className="flex gap-3 p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
                      <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-muted-foreground">Курс будет скопирован в вашу организацию.</p>
                    </div>
                  )}
                  <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-center"><span className="text-muted-foreground">Источник:</span><span className="font-medium">{h.selectedCourseForOrder?.organization?.name || "Платформа Синтагма"}</span></div>
                    {orderPrice > 0 && (
                      <>
                        <div className="flex justify-between items-center"><span className="text-muted-foreground">Цена:</span><span className="font-medium">{orderPrice.toLocaleString()} ₽</span></div>
                        {h.userRole === 'organization' && h.studentsCount > 1 && (
                          <div className="flex justify-between items-center border-t pt-2"><span className="text-muted-foreground font-medium">Итого:</span><span className="font-bold text-primary">{totalPrice.toLocaleString()} ₽</span></div>
                        )}
                      </>
                    )}
                  </div>
                  {h.userRole === 'organization' && (
                    <div className="space-y-2"><Label>Количество студентов</Label><Input type="number" min={1} value={h.studentsCount} onChange={(e) => h.setStudentsCount(Number(e.target.value) || 1)} className="rounded-xl" /></div>
                  )}
                  <div className="space-y-2"><Label>Комментарий</Label><Textarea value={h.orderNotes} onChange={(e) => h.setOrderNotes(e.target.value)} placeholder="Дополнительная информация..." className="rounded-xl" /></div>
                </div>
                <DialogFooter><Button className="w-full rounded-xl gap-2 bg-green-600 hover:bg-green-700 text-white" onClick={h.handleOrder} disabled={h.isOrdering}>{h.isOrdering ? <><SigmaSpinner size="sm" className="mr-2" />Оформление...</> : <><Plus className="w-4 h-4" />Получить курс</>}</Button></DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={h.showSuccessDialog} onOpenChange={h.setShowSuccessDialog}>
        <DialogContent className="rounded-2xl text-center max-w-sm">
          <div className="py-6">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-8 h-8 text-green-500" /></div>
            <DialogTitle className="text-xl mb-2">Курс добавлен!</DialogTitle>
            <DialogDescription className="text-base">Курс скопирован в вашу организацию и доступен в разделе «Курсы».</DialogDescription>
            <Button className="mt-6 btn-gradient rounded-xl" onClick={() => h.setShowSuccessDialog(false)}>Отлично</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Course Dialog */}
      <Dialog open={h.showEditDialog} onOpenChange={h.setShowEditDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader><DialogTitle>Редактировать курс</DialogTitle></DialogHeader>
          {h.editingCourse && (
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Краткое описание</Label><Textarea value={h.editingCourse.description_short || ''} onChange={(e) => h.setEditingCourse({ ...h.editingCourse!, description_short: e.target.value })} className="rounded-xl" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Цена для студента (₽)</Label><Input type="number" min={0} value={h.editingCourse.price_student} onChange={(e) => h.setEditingCourse({ ...h.editingCourse!, price_student: Number(e.target.value) || 0 })} className="rounded-xl" /></div>
                <div className="space-y-2"><Label>Цена для организации (₽)</Label><Input type="number" min={0} value={h.editingCourse.price_organization} onChange={(e) => h.setEditingCourse({ ...h.editingCourse!, price_organization: Number(e.target.value) || 0 })} className="rounded-xl" /></div>
              </div>
              <p className="text-xs text-muted-foreground">Оставьте 0 для бесплатного доступа</p>
            </div>
          )}
          <DialogFooter><Button className="w-full btn-gradient rounded-xl" onClick={h.handleEditCourse}>Сохранить</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      <Dialog open={h.showOrderDetailsDialog} onOpenChange={h.setShowOrderDetailsDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader><DialogTitle>Детали заявки</DialogTitle></DialogHeader>
          {h.selectedOrder && (
            <div className="space-y-4 py-4">
              <div className="space-y-3">
                <div className="flex justify-between"><span className="text-muted-foreground">Курс:</span><span className="font-medium">{h.selectedOrder.marketplace_course?.course?.title}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Тип:</span><span>{h.selectedOrder.buyer_type === 'organization' ? 'Организация' : 'Студент'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Количество:</span><span>{h.selectedOrder.students_count} студ.</span></div>
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
          <DialogHeader><DialogTitle>Новое объявление</DialogTitle><DialogDescription>Расскажите, какой курс ищете</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Заголовок *</Label><Input value={h.requestTitle} onChange={(e) => h.setRequestTitle(e.target.value)} placeholder="Какой курс вы ищете?" className="rounded-xl" /></div>
            <div className="space-y-2"><Label>Описание</Label><Textarea value={h.requestDescription} onChange={(e) => h.setRequestDescription(e.target.value)} placeholder="Подробности..." className="rounded-xl" /></div>
            <div className="space-y-2"><Label>Количество учеников</Label><Input type="number" min={1} value={h.requestStudentsCount} onChange={(e) => h.setRequestStudentsCount(e.target.value)} className="rounded-xl" /></div>
          </div>
          <DialogFooter><Button className="w-full btn-gradient rounded-xl" onClick={h.handleSubmitRequest} disabled={h.isSubmittingRequest || !h.requestTitle.trim()}>{h.isSubmittingRequest ? <><SigmaSpinner size="sm" className="mr-2" />Публикация...</> : 'Опубликовать'}</Button></DialogFooter>
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
          <DialogFooter><Button className="w-full btn-gradient rounded-xl" onClick={h.handleProposeCourse} disabled={h.isProposing || !h.selectedCourseToPropose}>{h.isProposing ? <><SigmaSpinner size="sm" className="mr-2" />Отправка...</> : 'Отправить предложение'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
