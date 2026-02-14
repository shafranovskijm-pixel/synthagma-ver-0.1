import { useState } from "react";
import {
  Store, Plus, Search, Edit, Trash2, Eye, Loader2,
  Package, ShoppingCart, Building2, Users, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useAdminMarketplace } from "@/hooks/useAdminMarketplace";

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "Ожидает", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  approved: { label: "Одобрена", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  paid: { label: "Оплачена", color: "bg-green-500/10 text-green-600 border-green-500/20" },
  completed: { label: "Завершена", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  cancelled: { label: "Отменена", color: "bg-red-500/10 text-red-600 border-red-500/20" },
};

export function AdminMarketplaceManager() {
  const h = useAdminMarketplace();

  if (h.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={h.activeTab} onValueChange={(v) => h.setActiveTab(v as any)} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="catalog" className="flex items-center gap-2">
            <Package className="w-4 h-4" />Каталог
          </TabsTrigger>
          <TabsTrigger value="create" className="flex items-center gap-2">
            <Plus className="w-4 h-4" />Создать курс
          </TabsTrigger>
          <TabsTrigger value="orders" className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />Заявки
          </TabsTrigger>
        </TabsList>

        {/* Catalog */}
        <TabsContent value="catalog" className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Поиск курсов..."
                value={h.searchQuery}
                onChange={(e) => h.setSearchQuery(e.target.value)}
                className="pl-10 rounded-xl"
              />
            </div>
            <Badge variant="secondary">{h.courses.length} курсов</Badge>
          </div>

          {h.filteredCourses.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Package className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground">Курсы не найдены</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {h.filteredCourses.map((item) => (
                <Card key={item.id} className={`overflow-hidden ${!item.is_active ? "opacity-60" : ""}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-tight flex-1">{item.course?.title}</CardTitle>
                      <Badge variant={item.is_active ? "default" : "secondary"} className="shrink-0">
                        {item.is_active ? "Активен" : "Скрыт"}
                      </Badge>
                    </div>
                    <CardDescription className="flex items-center gap-1 text-xs">
                      <Building2 className="w-3 h-3" />
                      {item.organization?.name || "Платформа"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {item.description_short && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{item.description_short}</p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-center p-2 bg-secondary/50 rounded-lg">
                        <div className="text-[10px] text-muted-foreground">Студенты</div>
                        <div className="font-semibold text-sm">{item.price_student.toLocaleString()} ₽</div>
                      </div>
                      <div className="text-center p-2 bg-secondary/50 rounded-lg">
                        <div className="text-[10px] text-muted-foreground">Организации</div>
                        <div className="font-semibold text-sm">{item.price_organization.toLocaleString()} ₽</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2">
                        <Switch checked={item.is_active} onCheckedChange={() => h.handleToggleActive(item)} />
                        <span className="text-xs text-muted-foreground">{item.is_active ? "Виден" : "Скрыт"}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { h.setEditingCourse(item); h.setShowEditDialog(true); }}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => h.handleDeleteCourse(item.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Create Course */}
        <TabsContent value="create" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Создать курс для маркетплейса</CardTitle>
              <CardDescription>Курс будет создан от имени платформы</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Название курса *</Label>
                <Input value={h.newTitle} onChange={(e) => h.setNewTitle(e.target.value)} placeholder="Название курса" className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>Описание</Label>
                <Textarea value={h.newDescription} onChange={(e) => h.setNewDescription(e.target.value)} placeholder="Подробное описание курса..." className="rounded-xl" rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Длительность</Label>
                <Input value={h.newDuration} onChange={(e) => h.setNewDuration(e.target.value)} placeholder="40 часов" className="rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Цена для студентов (₽) *</Label>
                  <Input type="number" value={h.newPriceStudent} onChange={(e) => h.setNewPriceStudent(e.target.value)} placeholder="5000" className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Цена для организаций (₽) *</Label>
                  <Input type="number" value={h.newPriceOrg} onChange={(e) => h.setNewPriceOrg(e.target.value)} placeholder="3000" className="rounded-xl" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Краткое описание для каталога</Label>
                <Textarea value={h.newShortDesc} onChange={(e) => h.setNewShortDesc(e.target.value)} placeholder="Краткое описание..." className="rounded-xl" rows={2} />
              </div>
              <Button
                className="w-full btn-gradient rounded-xl"
                onClick={h.handleCreateCourse}
                disabled={h.isCreating || !h.newTitle.trim() || !h.newPriceStudent || !h.newPriceOrg}
              >
                {h.isCreating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Создание...</> : <><Plus className="w-4 h-4 mr-2" />Создать и опубликовать</>}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Orders */}
        <TabsContent value="orders" className="space-y-6">
          {h.orders.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <ShoppingCart className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground">Заявок пока нет</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Курс</TableHead>
                    <TableHead>Продавец</TableHead>
                    <TableHead>Покупатель</TableHead>
                    <TableHead>Сумма</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Дата</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {h.orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.marketplace_course?.course?.title || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{order.marketplace_course?.organization?.name || "Платформа"}</TableCell>
                      <TableCell>
                        {order.buyer_organization ? order.buyer_organization.name : order.buyer_type === "student" ? "Студент" : "—"}
                      </TableCell>
                      <TableCell className="font-semibold">{order.price.toLocaleString()} ₽</TableCell>
                      <TableCell>
                        <Badge className={statusLabels[order.status]?.color || ""}>
                          {statusLabels[order.status]?.label || order.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(order.created_at), "dd.MM.yyyy", { locale: ru })}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => { h.setSelectedOrder(order); h.setShowOrderDialog(true); }}>
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
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={h.showEditDialog} onOpenChange={h.setShowEditDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>Редактировать курс</DialogTitle>
          </DialogHeader>
          {h.editingCourse && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Цена для студентов (₽)</Label>
                  <Input
                    type="number"
                    value={h.editingCourse.price_student}
                    onChange={(e) => h.setEditingCourse({ ...h.editingCourse!, price_student: parseFloat(e.target.value) || 0 })}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Цена для организаций (₽)</Label>
                  <Input
                    type="number"
                    value={h.editingCourse.price_organization}
                    onChange={(e) => h.setEditingCourse({ ...h.editingCourse!, price_organization: parseFloat(e.target.value) || 0 })}
                    className="rounded-xl"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Краткое описание</Label>
                <Textarea
                  value={h.editingCourse.description_short || ""}
                  onChange={(e) => h.setEditingCourse({ ...h.editingCourse!, description_short: e.target.value })}
                  className="rounded-xl"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button className="w-full btn-gradient rounded-xl" onClick={h.handleEditCourse}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      <Dialog open={h.showOrderDialog} onOpenChange={h.setShowOrderDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>Детали заявки</DialogTitle>
          </DialogHeader>
          {h.selectedOrder && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Курс</p>
                <p className="font-medium">{h.selectedOrder.marketplace_course?.course?.title}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Сумма</p>
                  <p className="font-semibold">{h.selectedOrder.price.toLocaleString()} ₽</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Статус</p>
                  <Badge className={statusLabels[h.selectedOrder.status]?.color}>
                    {statusLabels[h.selectedOrder.status]?.label}
                  </Badge>
                </div>
              </div>
              {h.selectedOrder.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Комментарий</p>
                  <p className="text-sm">{h.selectedOrder.notes}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label>Изменить статус</Label>
                <Select onValueChange={(v) => h.handleUpdateOrderStatus(h.selectedOrder!.id, v)}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите статус" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">Одобрить</SelectItem>
                    <SelectItem value="paid">Оплачена</SelectItem>
                    <SelectItem value="completed">Завершена</SelectItem>
                    <SelectItem value="cancelled">Отменить</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
