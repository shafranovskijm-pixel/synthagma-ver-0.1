import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { BookOpen, Users, GraduationCap, CheckCircle2, XCircle, Search, Send, Copy, Building2, Save, Key, Mail, Trash2 } from "lucide-react";
import ImportStudentsForm from "@/components/ImportStudentsForm";
import { CourseGroupedList } from "./CourseGroupedList";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

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
      <DialogContent className="max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Импорт учеников</DialogTitle>
          <DialogDescription>
            Загрузите файл Excel или CSV со списком учеников
          </DialogDescription>
        </DialogHeader>
        <ImportStudentsForm 
          organizationId={organizationId} 
          courses={courses.filter(c => c.is_published)} 
          companies={companies} 
          onSuccess={() => {
            onOpenChange(false);
            window.location.reload();
          }} 
        />
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
                <SigmaSpinner size="sm" className="mr-2" />
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
  onSubmit: (name: string, email: string, courseIds: string[], companyId: string, login: string, password: string) => void;
  isCreating: boolean;
}

export function AddStudentDialog({ open, onOpenChange, courses, companies, onSubmit, isCreating }: AddStudentDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [courseSearch, setCourseSearch] = useState("");

  const publishedCourses = courses.filter(c => c.is_published);
  const filteredCourses = publishedCourses.filter(c => 
    c.title.toLowerCase().includes(courseSearch.toLowerCase())
  );

  const toggleCourse = (id: string) => {
    setCourseIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const generateRandomLogin = () => {
    const num = Math.floor(10000 + Math.random() * 90000);
    setLogin(`student_${num}`);
  };

  const generateRandomPassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let pwd = '';
    for (let i = 0; i < 10; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    setPassword(pwd);
  };

  const handleSubmit = () => {
    onSubmit(name, email, courseIds, companyId, login, password);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) {
        setName(""); setEmail(""); setCourseIds([]); setCompanyId("");
        setLogin(""); setPassword(""); setCourseSearch("");
      }
      onOpenChange(v);
    }}>
      <DialogContent className="rounded-2xl max-h-[90vh] overflow-y-auto">
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
            <Label>Email (необязательно)</Label>
            <Input 
              type="email" 
              placeholder="ivan@example.com" 
              className="rounded-xl" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
            />
          </div>
          <div className="space-y-2">
            <Label>Логин (необязательно)</Label>
            <div className="flex gap-2">
              <Input 
                placeholder="student_12345" 
                className="rounded-xl flex-1" 
                value={login} 
                onChange={e => setLogin(e.target.value)} 
              />
              <Button type="button" variant="outline" size="icon" className="rounded-xl shrink-0" onClick={generateRandomLogin} title="Сгенерировать">
                <Key className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Если не указан — создастся автоматически</p>
          </div>
          <div className="space-y-2">
            <Label>Пароль (необязательно)</Label>
            <div className="flex gap-2">
              <Input 
                placeholder="••••••••" 
                className="rounded-xl flex-1" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
              />
              <Button type="button" variant="outline" size="icon" className="rounded-xl shrink-0" onClick={generateRandomPassword} title="Сгенерировать">
                <Key className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Если не указан — создастся автоматически</p>
          </div>
          {companies.length > 0 && (
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
          )}
          <div className="space-y-2">
            <Label>Курсы (необязательно) {courseIds.length > 0 && <span className="text-primary ml-1">({courseIds.length})</span>}</Label>
            {publishedCourses.length > 5 && (
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input 
                  placeholder="Поиск курса..." 
                  value={courseSearch} 
                  onChange={e => setCourseSearch(e.target.value)} 
                  className="pl-10 rounded-xl" 
                />
              </div>
            )}
            <div className="border border-border rounded-xl p-2 space-y-1 max-h-[200px] overflow-y-auto">
              {filteredCourses.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3">Курсы не найдены</p>
              ) : (
                filteredCourses.map(course => {
                  const checked = courseIds.includes(course.id);
                  return (
                    <label key={course.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-primary/10' : 'hover:bg-secondary/50'}`}>
                      <input 
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCourse(course.id)}
                        className="h-4 w-4 rounded border-primary text-primary focus:ring-primary"
                      />
                      <span className="text-sm">{course.title}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <Button className="w-full btn-gradient rounded-xl" onClick={handleSubmit} disabled={isCreating}>
            {isCreating ? (
              <>
                <SigmaSpinner size="sm" className="mr-2" />
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
          <div className="flex-1 overflow-auto border border-border rounded-xl p-2 space-y-1 min-h-[200px] max-h-[300px]">
            <CourseGroupedList
              courses={filteredCourses}
              getCategoryById={getCategoryById}
              emptyMessage="Курсы не найдены"
              renderCourse={(course) => {
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
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 className="w-5 h-5 text-primary" />}
                    </div>
                  </div>
                );
              }}
            />
          </div>
          <Button 
            className="w-full btn-gradient rounded-xl" 
            onClick={() => onEnroll(selectedCourseId)} 
            disabled={isEnrolling || !selectedCourseId}
          >
            {isEnrolling ? (
              <>
                <SigmaSpinner size="sm" className="mr-2" />
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
                <SigmaSpinner size="sm" className="mr-2" />
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
                <SigmaSpinner size="sm" className="mr-2" />
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
