import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Plus } from "lucide-react";
import type { Course, CourseCategory } from "@/types";

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingCategory: CourseCategory | null;
  name: string;
  setName: (v: string) => void;
  color: string;
  setColor: (v: string) => void;
  isCreating: boolean;
  onSubmit: () => void;
}

export function CategoryDialog({ open, onOpenChange, editingCategory, name, setName, color, setColor, isCreating, onSubmit }: CategoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>{editingCategory ? 'Редактировать категорию' : 'Новая категория'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Название</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Название категории" className="rounded-xl" />
          </div>
          <div className="space-y-2">
            <Label>Цвет</Label>
            <div className="flex items-center gap-3">
              <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-12 h-10 rounded-lg cursor-pointer border-0" />
              <Input value={color} onChange={e => setColor(e.target.value)} className="rounded-xl flex-1" />
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Отмена</Button>
          <Button onClick={onSubmit} disabled={isCreating || !name.trim()} className="rounded-xl">
            {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editingCategory ? 'Сохранить' : 'Создать'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface CreateCourseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  categoryId: string;
  setCategoryId: (v: string) => void;
  categories: CourseCategory[];
  showInlineNewCategory: boolean;
  setShowInlineNewCategory: (v: boolean) => void;
  inlineNewCategoryName: string;
  setInlineNewCategoryName: (v: string) => void;
  inlineNewCategoryColor: string;
  setInlineNewCategoryColor: (v: string) => void;
  isCreating: boolean;
  onSubmit: () => void;
}

export function CreateCourseDialog({
  open, onOpenChange, title, setTitle, description, setDescription,
  categoryId, setCategoryId, categories,
  showInlineNewCategory, setShowInlineNewCategory,
  inlineNewCategoryName, setInlineNewCategoryName,
  inlineNewCategoryColor, setInlineNewCategoryColor,
  isCreating, onSubmit,
}: CreateCourseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader><DialogTitle>Создать курс</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Название курса *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Введите название" className="rounded-xl" />
          </div>
          <div className="space-y-2">
            <Label>Описание</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Краткое описание курса" className="rounded-xl resize-none" rows={3} />
          </div>
          <div className="space-y-2">
            <Label>Категория</Label>
            {!showInlineNewCategory ? (
              <div className="flex gap-2">
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="rounded-xl flex-1"><SelectValue placeholder="Без категории" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Без категории</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                          {cat.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={() => setShowInlineNewCategory(true)} className="rounded-xl shrink-0">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-2 p-3 bg-secondary/50 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Новая категория</span>
                  <Button variant="ghost" size="sm" onClick={() => setShowInlineNewCategory(false)}>Отмена</Button>
                </div>
                <Input value={inlineNewCategoryName} onChange={e => setInlineNewCategoryName(e.target.value)} placeholder="Название категории" className="rounded-lg" />
                <div className="flex items-center gap-2">
                  <input type="color" value={inlineNewCategoryColor} onChange={e => setInlineNewCategoryColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                  <span className="text-xs text-muted-foreground">Выберите цвет</span>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Отмена</Button>
          <Button onClick={onSubmit} disabled={isCreating || !title.trim()} className="rounded-xl">
            {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Создать и редактировать
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface MoveCourseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movingCourse: Course | null;
  targetCategoryId: string;
  setTargetCategoryId: (v: string) => void;
  categories: CourseCategory[];
  isMoving: boolean;
  onSubmit: () => void;
}

export function MoveCourseDialog({ open, onOpenChange, movingCourse, targetCategoryId, setTargetCategoryId, categories, isMoving, onSubmit }: MoveCourseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader><DialogTitle>Переместить курс</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Курс: <span className="font-medium text-foreground">{movingCourse?.title}</span>
          </p>
          <div className="space-y-2">
            <Label>Выберите категорию</Label>
            <Select value={targetCategoryId} onValueChange={setTargetCategoryId}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите категорию" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Без категории</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                      {cat.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Отмена</Button>
          <Button onClick={onSubmit} disabled={isMoving} className="rounded-xl">
            {isMoving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Переместить
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface BulkDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  isDeleting: boolean;
  onConfirm: () => void;
}

export function BulkDeleteDialog({ open, onOpenChange, count, isDeleting, onConfirm }: BulkDeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить выбранные курсы?</AlertDialogTitle>
          <AlertDialogDescription>
            Будет удалено {count} курсов со всеми уроками, записями учеников и документами. Это действие нельзя отменить.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl">Отмена</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
          >
            {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
