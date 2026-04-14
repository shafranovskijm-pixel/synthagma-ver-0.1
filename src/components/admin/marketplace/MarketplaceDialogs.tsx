import { useState } from "react";
import {
  Edit, Sparkles, Loader2, FolderPlus, FolderInput,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import type { DbCategory } from "@/hooks/useAdminMarketplace";

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "Ожидает", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  approved: { label: "Одобрена", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  paid: { label: "Оплачена", color: "bg-green-500/10 text-green-600 border-green-500/20" },
  completed: { label: "Завершена", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  cancelled: { label: "Отменена", color: "bg-red-500/10 text-red-600 border-red-500/20" },
};

interface EditDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingCourse: any;
  setEditingCourse: (c: any) => void;
  onSave: () => void;
}

export function MarketplaceEditDialog({ open, onOpenChange, editingCourse, setEditingCourse, onSave }: EditDialogProps) {
  const [isGeneratingShortDesc, setIsGeneratingShortDesc] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-md">
        <DialogHeader>
          <DialogTitle>Редактировать курс</DialogTitle>
        </DialogHeader>
        {editingCourse && (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Цена для студентов (₽)</Label>
                <Input
                  type="number"
                  value={editingCourse.price_student}
                  onChange={(e) => setEditingCourse({ ...editingCourse, price_student: parseFloat(e.target.value) || 0 })}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Цена для организаций (₽)</Label>
                <Input
                  type="number"
                  value={editingCourse.price_organization}
                  onChange={(e) => setEditingCourse({ ...editingCourse, price_organization: parseFloat(e.target.value) || 0 })}
                  className="rounded-xl"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Длительность</Label>
              <Input
                value={editingCourse.course?.duration || ""}
                onChange={(e) => setEditingCourse({ ...editingCourse, course: { ...editingCourse.course!, duration: e.target.value } })}
                placeholder="40 часов"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Краткое описание</Label>
                <Button variant="ghost" size="sm" onClick={async () => {
                  if (!editingCourse?.course?.title) { toast.error("Нет названия курса"); return; }
                  setIsGeneratingShortDesc(true);
                  try {
                    const { data, error } = await safeInvoke<any>("generate-course-content", {
                      body: { contentType: "short_description", courseTitle: editingCourse.course.title, courseDescription: editingCourse.course.description },
                    });
                    if (error) throw error;
                    if (data?.content) setEditingCourse({ ...editingCourse, description_short: data.content });
                  } catch { toast.error("Ошибка генерации"); } finally { setIsGeneratingShortDesc(false); }
                }} disabled={isGeneratingShortDesc}>
                  {isGeneratingShortDesc ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                  Сгенерировать с ИИ
                </Button>
              </div>
              <Textarea
                value={editingCourse.description_short || ""}
                onChange={(e) => setEditingCourse({ ...editingCourse, description_short: e.target.value })}
                className="rounded-xl"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button className="w-full btn-gradient rounded-xl" onClick={onSave}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface OrderDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: any;
  onUpdateStatus: (id: string, status: string) => void;
}

export function MarketplaceOrderDialog({ open, onOpenChange, order, onUpdateStatus }: OrderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-md">
        <DialogHeader>
          <DialogTitle>Детали заявки</DialogTitle>
        </DialogHeader>
        {order && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Курс</p>
              <p className="font-medium">{order.marketplace_course?.course?.title}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Сумма</p>
                <p className="font-semibold">{order.price.toLocaleString()} ₽</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Статус</p>
                <Badge className={statusLabels[order.status]?.color}>
                  {statusLabels[order.status]?.label}
                </Badge>
              </div>
            </div>
            {order.notes && (
              <div>
                <p className="text-sm text-muted-foreground">Комментарий</p>
                <p className="text-sm">{order.notes}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Изменить статус</Label>
              <Select onValueChange={(v) => onUpdateStatus(order.id, v)}>
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
  );
}

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  h: any;
  iconOptions: { name: string; icon: React.ElementType; label: string }[];
}

export function MarketplaceCategoryDialog({ open, onOpenChange, h, iconOptions }: CategoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-md">
        <DialogHeader>
          <DialogTitle>Создать категорию</DialogTitle>
          <DialogDescription>Выберите тип программы, введите название и иконку</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Тип программы</Label>
            <Select value={h.newCategoryParentType} onValueChange={h.setNewCategoryParentType}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Повышение квалификации">Повышение квалификации</SelectItem>
                <SelectItem value="Профессиональная переподготовка">Профессиональная переподготовка</SelectItem>
                <SelectItem value="Охрана труда / Пожарная безопасность">Охрана труда / Пожарная безопасность</SelectItem>
                <SelectItem value="Рабочие профессии">Рабочие профессии</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Название категории</Label>
            <Input
              value={h.newCategoryName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => h.setNewCategoryName(e.target.value)}
              placeholder="Например: Охрана труда"
              className="rounded-xl"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Иконка</Label>
            <div className="grid grid-cols-6 gap-2">
              {iconOptions.map(opt => {
                const IconComp = opt.icon;
                const selected = h.newCategoryIcon === opt.name;
                return (
                  <button
                    key={opt.name}
                    type="button"
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary/50'}`}
                    onClick={() => h.setNewCategoryIcon(selected ? null : opt.name)}
                    title={opt.label}
                  >
                    <IconComp className="w-5 h-5" />
                    <span className="text-[9px] text-muted-foreground leading-tight">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            className="w-full btn-gradient rounded-xl"
            disabled={!h.newCategoryName.trim()}
            onClick={() => h.handleCreateCategory(h.newCategoryName)}
          >
            <FolderPlus className="w-4 h-4 mr-2" />Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface MoveCategoryDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  courseName?: string;
  targetCategory: string;
  setTargetCategory: (v: string) => void;
  dbCategories: DbCategory[];
  onMove: () => void;
}

export function MarketplaceMoveCategoryDialog({ open, onOpenChange, courseName, targetCategory, setTargetCategory, dbCategories, onMove }: MoveCategoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-sm">
        <DialogHeader>
          <DialogTitle>Переместить в категорию</DialogTitle>
          <DialogDescription className="truncate">{courseName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Категория</Label>
            <Select value={targetCategory} onValueChange={setTargetCategory}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите категорию" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Без категории</SelectItem>
                {dbCategories.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color || '#888' }} />
                      {cat.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button className="w-full btn-gradient rounded-xl" disabled={!targetCategory} onClick={onMove}>
            <FolderInput className="w-4 h-4 mr-2" />Переместить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface BulkMoveDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  count: number;
  targetCategory: string;
  setTargetCategory: (v: string) => void;
  dbCategories: DbCategory[];
  onMove: () => void;
}

export function MarketplaceBulkMoveDialog({ open, onOpenChange, count, targetCategory, setTargetCategory, dbCategories, onMove }: BulkMoveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-sm">
        <DialogHeader>
          <DialogTitle>Переместить {count} {count === 1 ? 'курс' : count < 5 ? 'курса' : 'курсов'}</DialogTitle>
          <DialogDescription>Выберите категорию для перемещения выбранных курсов</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Категория</Label>
            <Select value={targetCategory} onValueChange={setTargetCategory}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите категорию" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Без категории</SelectItem>
                {dbCategories.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color || '#888' }} />
                      {cat.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button className="w-full btn-gradient rounded-xl" disabled={!targetCategory} onClick={onMove}>
            <FolderInput className="w-4 h-4 mr-2" />Переместить ({count})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
