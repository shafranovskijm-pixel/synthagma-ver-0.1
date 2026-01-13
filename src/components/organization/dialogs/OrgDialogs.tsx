import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Loader2, BookOpen, Users, GraduationCap, CheckCircle2, XCircle, Search, Send, Copy, Building2, Save, Key, Mail, Trash2 } from "lucide-react";
import ImportStudentsForm from "@/components/ImportStudentsForm";

interface Company {
  id: string;
  name: string;
  inn: string | null;
}

interface Course {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
  created_at: string;
  lessonsCount?: number;
  studentsCount?: number;
  duration?: string;
  category_id?: string | null;
}

interface CourseCategory {
  id: string;
  name: string;
  color: string;
}

// Import Students Dialog
interface ImportStudentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | null;
  courses: Course[];
  companies: Company[];
}

export function ImportStudentsDialog({ open, onOpenChange, organizationId, courses, companies }: ImportStudentsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Импорт учеников</DialogTitle>
          <DialogDescription>
            Загрузите файл Excel или CSV со списком учеников
          </DialogDescription>
        </DialogHeader>
        {organizationId && (
          <ImportStudentsForm 
            organizationId={organizationId} 
            courses={courses.filter(c => c.is_published)} 
            companies={companies} 
            onSuccess={() => {
              onOpenChange(false);
              window.location.reload();
            }} 
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Unenroll Confirmation Dialog
interface UnenrollConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  isUnenrolling: boolean;
  onConfirm: () => void;
}

export function UnenrollConfirmDialog({ open, onOpenChange, selectedCount, isUnenrolling, onConfirm }: UnenrollConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-destructive">Подтвердите отчисление</DialogTitle>
          <DialogDescription>
            Вы действительно хотите отчислить {selectedCount} учеников с курсов? 
            Это действие нельзя отменить.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-3 justify-end pt-4">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={isUnenrolling}>
            Отмена
          </Button>
          <Button variant="destructive" className="rounded-xl" onClick={onConfirm} disabled={isUnenrolling}>
            {isUnenrolling ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Отчисление...
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 mr-2" />
                Отчислить
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Add Student Dialog
interface AddStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: Course[];
  companies: Company[];
  onSubmit: (name: string, email: string, courseId: string, companyId: string, noLogin: boolean) => void;
  isCreating: boolean;
}

export function AddStudentDialog({ open, onOpenChange, courses, companies, onSubmit, isCreating }: AddStudentDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [courseId, setCourseId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [noLogin, setNoLogin] = useState(false);

  const handleSubmit = () => {
    onSubmit(name, email, courseId, companyId, noLogin);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) {
        setName("");
        setEmail("");
        setCourseId("");
        setCompanyId("");
        setNoLogin(false);
      }
      onOpenChange(v);
    }}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Добавить ученика</DialogTitle>
          <DialogDescription>
            Создайте нового ученика или добавьте существующего на курс
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>ФИО *</Label>
            <Input 
              placeholder="Иванов Иван Иванович" 
              className="rounded-xl" 
              value={name} 
              onChange={e => setName(e.target.value)} 
            />
          </div>
          <div className="space-y-2">
            <Label>Email {!noLogin && "*"}</Label>
            <Input 
              type="email" 
              placeholder="ivan@example.com" 
              className="rounded-xl" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
            />
            {!noLogin && (
              <p className="text-xs text-muted-foreground">
                Если ученик с таким email уже существует — он будет зачислен на курс
              </p>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <input 
              type="checkbox" 
              id="noLogin" 
              checked={noLogin} 
              onChange={e => setNoLogin(e.target.checked)} 
              className="rounded" 
            />
            <Label htmlFor="noLogin" className="text-sm font-normal cursor-pointer">
              Без входа в систему (можно использовать одну почту для нескольких учеников)
            </Label>
          </div>
          <div className="space-y-2">
            <Label>Компания (необязательно)</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Выберите компанию" />
              </SelectTrigger>
              <SelectContent>
                {companies.map(company => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name} {company.inn ? `(ИНН: ${company.inn})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Курс (необязательно)</Label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Выберите курс" />
              </SelectTrigger>
              <SelectContent>
                {courses.filter(c => c.is_published).map(course => (
                  <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full btn-gradient rounded-xl" onClick={handleSubmit} disabled={isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Добавление...
              </>
            ) : "Добавить ученика"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Enroll Dialog
interface EnrollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  courses: Course[];
  categories: CourseCategory[];
  getCategoryById: (id: string | null | undefined) => CourseCategory | undefined;
  isEnrolling: boolean;
  onEnroll: (courseId: string) => void;
}

export function EnrollDialog({ 
  open, 
  onOpenChange, 
  selectedCount, 
  courses, 
  categories, 
  getCategoryById,
  isEnrolling, 
  onEnroll 
}: EnrollDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");

  const filteredCourses = courses.filter(
    c => c.is_published && c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) {
        setSearchQuery("");
        setSelectedCourseId("");
      }
      onOpenChange(v);
    }}>
      <DialogContent className="rounded-2xl max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display">Зачислить на курс</DialogTitle>
          <DialogDescription>
            Выберите курс для зачисления {selectedCount} учеников
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4 flex-1 overflow-hidden flex flex-col">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input 
              placeholder="Поиск курса..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              className="pl-10 rounded-xl" 
            />
          </div>
          <div className="flex-1 overflow-auto border border-border rounded-xl p-2 space-y-2 min-h-[200px] max-h-[300px]">
            {filteredCourses.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Курсы не найдены</p>
              </div>
            ) : (
              filteredCourses.map(course => {
                const category = getCategoryById(course.category_id);
                const isSelected = selectedCourseId === course.id;
                return (
                  <div 
                    key={course.id} 
                    onClick={() => setSelectedCourseId(course.id)} 
                    className={`p-3 rounded-xl cursor-pointer transition-colors ${
                      isSelected 
                        ? 'bg-primary/10 border-2 border-primary' 
                        : 'bg-secondary/30 hover:bg-secondary/50 border-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      }`}>
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{course.title}</div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{course.lessonsCount} уроков</span>
                          <span>•</span>
                          <span>{course.studentsCount} учеников</span>
                          {category && (
                            <>
                              <span>•</span>
                              <span 
                                className="px-1.5 py-0.5 rounded text-xs" 
                                style={{
                                  backgroundColor: category.color + '20',
                                  color: category.color
                                }}
                              >
                                {category.name}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 className="w-5 h-5 text-primary" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <Button 
            className="w-full btn-gradient rounded-xl" 
            onClick={() => onEnroll(selectedCourseId)} 
            disabled={isEnrolling || !selectedCourseId}
          >
            {isEnrolling ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Зачисление...
              </>
            ) : (
              <>
                <GraduationCap className="w-4 h-4 mr-2" />
                Зачислить на курс
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Category Dialog
interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isCreating: boolean;
  onCreate: (name: string, color: string) => void;
}

export function CategoryDialog({ open, onOpenChange, isCreating, onCreate }: CategoryDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) {
        setName("");
        setColor("#6366f1");
      }
      onOpenChange(v);
    }}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Создать категорию</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Название</Label>
            <Input 
              placeholder="Название категории" 
              className="rounded-xl" 
              value={name} 
              onChange={e => setName(e.target.value)} 
            />
          </div>
          <div className="space-y-2">
            <Label>Цвет</Label>
            <div className="flex items-center gap-3">
              <input 
                type="color" 
                value={color} 
                onChange={e => setColor(e.target.value)} 
                className="w-12 h-10 rounded-lg border border-border cursor-pointer" 
              />
              <Input 
                value={color} 
                onChange={e => setColor(e.target.value)} 
                className="flex-1 rounded-xl" 
              />
            </div>
          </div>
          <Button 
            className="w-full btn-gradient rounded-xl" 
            onClick={() => onCreate(name, color)} 
            disabled={isCreating}
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Создание...
              </>
            ) : "Создать"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Invite Email Dialog
interface InviteEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseTitle?: string;
  isSending: boolean;
  onSend: (email: string) => void;
}

export function InviteEmailDialog({ open, onOpenChange, courseTitle, isSending, onSend }: InviteEmailDialogProps) {
  const [email, setEmail] = useState("");

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) setEmail("");
      onOpenChange(v);
    }}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Отправить приглашение на курс</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Email получателя</Label>
            <Input 
              type="email" 
              placeholder="student@example.com" 
              className="rounded-xl" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
            />
          </div>
          <div className="bg-secondary/30 rounded-xl p-3 text-sm">
            <p className="text-muted-foreground">
              Курс: <span className="font-medium text-foreground">{courseTitle}</span>
            </p>
            <p className="text-muted-foreground mt-1">
              Получатель получит письмо со ссылкой на курс
            </p>
          </div>
          <Button 
            className="w-full btn-gradient rounded-xl" 
            onClick={() => onSend(email)} 
            disabled={isSending || !email.trim()}
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Отправка...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Отправить приглашение
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
