import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, CheckCircle, Info } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface AddCourseDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  availableCourses: { id: string; title: string }[];
  selectedCourseToAdd: string;
  setSelectedCourseToAdd: (v: string) => void;
  shortDescription: string;
  setShortDescription: (v: string) => void;
  priceStudent: number;
  setPriceStudent: (v: number) => void;
  priceOrganization: number;
  setPriceOrganization: (v: number) => void;
  isAdding: boolean;
  onAdd: () => void;
}

export function AddCourseDialog({ open, onOpenChange, availableCourses, selectedCourseToAdd, setSelectedCourseToAdd, shortDescription, setShortDescription, priceStudent, setPriceStudent, priceOrganization, setPriceOrganization, isAdding, onAdd }: AddCourseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-md">
        <DialogHeader><DialogTitle>Добавить курс в магазин</DialogTitle><DialogDescription>Выберите курс для публикации</DialogDescription></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2"><Label>Курс</Label><Select value={selectedCourseToAdd} onValueChange={setSelectedCourseToAdd}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите курс" /></SelectTrigger><SelectContent>{availableCourses.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Краткое описание</Label><Textarea value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} placeholder="Расскажите о курсе..." className="rounded-xl" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Цена для студента (₽)</Label><Input type="number" min={0} value={priceStudent} onChange={(e) => setPriceStudent(Number(e.target.value) || 0)} className="rounded-xl" /></div>
            <div className="space-y-2"><Label>Цена для организации (₽)</Label><Input type="number" min={0} value={priceOrganization} onChange={(e) => setPriceOrganization(Number(e.target.value) || 0)} className="rounded-xl" /></div>
          </div>
          <p className="text-xs text-muted-foreground">Оставьте 0 для бесплатного доступа</p>
        </div>
        <DialogFooter><Button className="w-full btn-gradient rounded-xl" onClick={onAdd} disabled={isAdding || !selectedCourseToAdd}>{isAdding ? <><SigmaSpinner size="sm" className="mr-2" />Добавление...</> : 'Добавить в магазин'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface OrderDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  course: any;
  userRole: string;
  studentsCount: number;
  setStudentsCount: (v: number) => void;
  orderNotes: string;
  setOrderNotes: (v: string) => void;
  isOrdering: boolean;
  onOrder: () => void;
}

export function OrderDialog({ open, onOpenChange, course, userRole, studentsCount, setStudentsCount, orderNotes, setOrderNotes, isOrdering, onOrder }: OrderDialogProps) {
  const orderPrice = course ? (userRole === 'organization' ? course.price_organization : course.price_student) : 0;
  const totalPrice = userRole === 'organization' ? orderPrice * studentsCount : orderPrice;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-md">
        <DialogHeader><DialogTitle>Получить курс</DialogTitle><DialogDescription>{course?.course?.title}</DialogDescription></DialogHeader>
        <div className="space-y-4 py-4">
          {userRole === 'organization' && (
            <div className="flex gap-3 p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
              <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">Курс будет скопирован в вашу организацию.</p>
            </div>
          )}
          <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center"><span className="text-muted-foreground">Источник:</span><span className="font-medium">{course?.organization?.name || "Платформа Синтагма"}</span></div>
            {orderPrice > 0 && (
              <>
                <div className="flex justify-between items-center"><span className="text-muted-foreground">Цена:</span><span className="font-medium">{orderPrice.toLocaleString()} ₽</span></div>
                {userRole === 'organization' && studentsCount > 1 && (
                  <div className="flex justify-between items-center border-t pt-2"><span className="text-muted-foreground font-medium">Итого:</span><span className="font-bold text-primary">{totalPrice.toLocaleString()} ₽</span></div>
                )}
              </>
            )}
          </div>
          {userRole === 'organization' && (
            <div className="space-y-2"><Label>Количество студентов</Label><Input type="number" min={1} value={studentsCount} onChange={(e) => setStudentsCount(Number(e.target.value) || 1)} className="rounded-xl" /></div>
          )}
          <div className="space-y-2"><Label>Комментарий</Label><Textarea value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} placeholder="Дополнительная информация..." className="rounded-xl" /></div>
        </div>
        <DialogFooter><Button className="w-full rounded-xl gap-2 bg-green-600 hover:bg-green-700 text-white" onClick={onOrder} disabled={isOrdering}>{isOrdering ? <><SigmaSpinner size="sm" className="mr-2" />Оформление...</> : <><Plus className="w-4 h-4" />Получить курс</>}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface SuccessDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function SuccessDialog({ open, onOpenChange }: SuccessDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl text-center max-w-sm">
        <div className="py-6">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-8 h-8 text-green-500" /></div>
          <DialogTitle className="text-xl mb-2">Курс добавлен!</DialogTitle>
          <DialogDescription className="text-base">Курс скопирован в вашу организацию и доступен в разделе «Курсы».</DialogDescription>
          <Button className="mt-6 btn-gradient rounded-xl" onClick={() => onOpenChange(false)}>Отлично</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface EditCourseDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingCourse: any;
  setEditingCourse: (v: any) => void;
  onSave: () => void;
}

export function EditCourseStoreDialog({ open, onOpenChange, editingCourse, setEditingCourse, onSave }: EditCourseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-md">
        <DialogHeader><DialogTitle>Редактировать курс</DialogTitle></DialogHeader>
        {editingCourse && (
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Краткое описание</Label><Textarea value={editingCourse.description_short || ''} onChange={(e) => setEditingCourse({ ...editingCourse, description_short: e.target.value })} className="rounded-xl" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Цена для студента (₽)</Label><Input type="number" min={0} value={editingCourse.price_student} onChange={(e) => setEditingCourse({ ...editingCourse, price_student: Number(e.target.value) || 0 })} className="rounded-xl" /></div>
              <div className="space-y-2"><Label>Цена для организации (₽)</Label><Input type="number" min={0} value={editingCourse.price_organization} onChange={(e) => setEditingCourse({ ...editingCourse, price_organization: Number(e.target.value) || 0 })} className="rounded-xl" /></div>
            </div>
            <p className="text-xs text-muted-foreground">Оставьте 0 для бесплатного доступа</p>
          </div>
        )}
        <DialogFooter><Button className="w-full btn-gradient rounded-xl" onClick={onSave}>Сохранить</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RequestDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  requestTitle: string;
  setRequestTitle: (v: string) => void;
  requestDescription: string;
  setRequestDescription: (v: string) => void;
  requestStudentsCount: string;
  setRequestStudentsCount: (v: string) => void;
  isSubmitting: boolean;
  onSubmit: () => void;
}

export function RequestDialog({ open, onOpenChange, requestTitle, setRequestTitle, requestDescription, setRequestDescription, requestStudentsCount, setRequestStudentsCount, isSubmitting, onSubmit }: RequestDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-md">
        <DialogHeader><DialogTitle>Новое объявление</DialogTitle><DialogDescription>Расскажите, какой курс ищете</DialogDescription></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2"><Label>Заголовок *</Label><Input value={requestTitle} onChange={(e) => setRequestTitle(e.target.value)} placeholder="Какой курс вы ищете?" className="rounded-xl" /></div>
          <div className="space-y-2"><Label>Описание</Label><Textarea value={requestDescription} onChange={(e) => setRequestDescription(e.target.value)} placeholder="Подробности..." className="rounded-xl" /></div>
          <div className="space-y-2"><Label>Количество учеников</Label><Input type="number" min={1} value={requestStudentsCount} onChange={(e) => setRequestStudentsCount(e.target.value)} className="rounded-xl" /></div>
        </div>
        <DialogFooter><Button className="w-full btn-gradient rounded-xl" onClick={onSubmit} disabled={isSubmitting || !requestTitle.trim()}>{isSubmitting ? <><SigmaSpinner size="sm" className="mr-2" />Публикация...</> : 'Опубликовать'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ProposeDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedRequest: any;
  myCourses: any[];
  selectedCourseToPropose: string;
  setSelectedCourseToPropose: (v: string) => void;
  proposeMessage: string;
  setProposeMessage: (v: string) => void;
  isProposing: boolean;
  onPropose: () => void;
}

export function ProposeDialog({ open, onOpenChange, selectedRequest, myCourses, selectedCourseToPropose, setSelectedCourseToPropose, proposeMessage, setProposeMessage, isProposing, onPropose }: ProposeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-md">
        <DialogHeader><DialogTitle className="font-display">Предложить курс</DialogTitle><DialogDescription>Объявление: {selectedRequest?.title}</DialogDescription></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Выберите курс</Label>
            <Select value={selectedCourseToPropose} onValueChange={setSelectedCourseToPropose}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите курс" /></SelectTrigger>
              <SelectContent>{myCourses.map((c) => <SelectItem key={c.id} value={c.id}>{c.course?.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Сообщение</Label><Textarea value={proposeMessage} onChange={(e) => setProposeMessage(e.target.value)} placeholder="Дополнительная информация..." className="rounded-xl" /></div>
        </div>
        <DialogFooter><Button className="w-full btn-gradient rounded-xl" onClick={onPropose} disabled={isProposing || !selectedCourseToPropose}>{isProposing ? <><SigmaSpinner size="sm" className="mr-2" />Отправка...</> : 'Предложить курс'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface OrderDetailsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: any;
  onUpdateStatus: (orderId: string, status: string) => void;
}

export function OrderDetailsDialog({ open, onOpenChange, order, onUpdateStatus }: OrderDetailsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-md">
        <DialogHeader><DialogTitle>Детали заявки</DialogTitle></DialogHeader>
        {order && (
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <div className="flex justify-between"><span className="text-muted-foreground">Курс:</span><span className="font-medium">{order.marketplace_course?.course?.title}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Тип:</span><span>{order.buyer_type === 'organization' ? 'Организация' : 'Студент'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Количество:</span><span>{order.students_count} студ.</span></div>
              {order.notes && <div className="pt-2 border-t"><span className="text-sm text-muted-foreground">Комментарий:</span><p className="mt-1">{order.notes}</p></div>}
            </div>
            <div className="space-y-2">
              <Label>Изменить статус</Label>
              <Select value={order.status} onValueChange={(value) => onUpdateStatus(order.id, value)}>
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
  );
}
