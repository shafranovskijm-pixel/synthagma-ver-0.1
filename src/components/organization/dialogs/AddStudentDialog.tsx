import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Key } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface Company {
  id: string;
  name: string;
  inn: string | null;
}

interface Course {
  id: string;
  title: string;
  is_published: boolean;
}

interface StudentGroup {
  id: string;
  name: string;
  course_id?: string | null;
}

export interface AddStudentInput {
  name: string;
  email: string;
  courseIds: string[];
  companyId: string;
  groupId: string;
  login: string;
  password: string;
}

interface AddStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: Course[];
  companies: Company[];
  groups: StudentGroup[];
  groupsLoading?: boolean;
  groupsError?: boolean;
  onSubmit: (input: AddStudentInput) => void;
  isCreating: boolean;
  creationWarning?: string | null;
}

const NO_GROUP_VALUE = "__no_group__";

export function AddStudentDialog({
  open,
  onOpenChange,
  courses,
  companies,
  groups,
  groupsLoading = false,
  groupsError = false,
  onSubmit,
  isCreating,
  creationWarning = null,
}: AddStudentDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
  const [manualRetryConfirmed, setManualRetryConfirmed] = useState(false);
  const wasOpenRef = useRef(false);

  useEffect(() => { setManualRetryConfirmed(false); }, [creationWarning, open]);

  useEffect(() => {
    const opening = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    // A warning may clear during a manual submission. Only a fresh normal open
    // resets the form; checking the list must not erase an uncertain draft.
    if (opening && !creationWarning) {
      setName(""); setEmail(""); setCourseIds([]); setCompanyId(""); setGroupId("");
      setLogin(""); setPassword(""); setCourseSearch("");
    }
  }, [open, creationWarning]);

  const publishedCourses = courses.filter(c => c.is_published);
  const selectedGroup = groups.find(group => group.id === groupId);
  const groupCourseId = selectedGroup?.course_id || null;
  const groupCourseTitle = courses.find(course => course.id === groupCourseId)?.title;
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
    if (isCreating || (creationWarning && !manualRetryConfirmed)) return;
    if (login && !/^[a-zA-Z0-9._-]+$/.test(login)) {
      alert("Логин может содержать только латинские буквы, цифры и знаки . _ -");
      return;
    }
    if (password && password.length < 6) {
      alert("Пароль должен быть не короче 6 символов");
      return;
    }
    setManualRetryConfirmed(false);
    onSubmit({ name, email, courseIds, companyId, groupId, login, password });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v && !creationWarning) {
        setName(""); setEmail(""); setCourseIds([]); setCompanyId(""); setGroupId("");
        setLogin(""); setPassword(""); setCourseSearch("");
      }
      onOpenChange(v);
    }}>
      <DialogContent className="rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Добавить ученика</DialogTitle>
          <DialogDescription>
            Создайте нового ученика, при необходимости сразу добавьте его в группу и назначьте курсы
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {creationWarning && (
            <div role="alert" className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
              <p>{creationWarning}</p>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={manualRetryConfirmed} disabled={isCreating} onChange={(event) => setManualRetryConfirmed(event.target.checked)} />
                <span>Результат регистрации проверен: подтверждено, что ученика можно создать заново без дубликата.</span>
              </label>
            </div>
          )}
          <div className="space-y-2">
            <Label>ФИО *</Label>
            <Input placeholder="Иванов Иван Иванович" className="rounded-xl" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email (необязательно)</Label>
            <Input type="email" placeholder="ivan@example.com" className="rounded-xl" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Логин (необязательно)</Label>
            <div className="flex gap-2">
              <Input placeholder="student_12345" className="rounded-xl flex-1" value={login} onChange={e => setLogin(e.target.value)} />
              <Button type="button" variant="outline" size="icon" className="rounded-xl shrink-0" onClick={generateRandomLogin} title="Сгенерировать">
                <Key className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Если не указан — создастся автоматически</p>
          </div>
          <div className="space-y-2">
            <Label>Пароль (необязательно)</Label>
            <div className="flex gap-2">
              <Input placeholder="••••••••" className="rounded-xl flex-1" value={password} onChange={e => setPassword(e.target.value)} />
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
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите компанию" /></SelectTrigger>
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
            <Label>Группа (необязательно)</Label>
            {groupsLoading ? (
              <div className="flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm text-muted-foreground">
                <SigmaSpinner size="sm" /> Загружаем группы…
              </div>
            ) : groupsError ? (
              <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Не удалось загрузить группы. Ученика всё равно можно создать без группы.
              </p>
            ) : groups.length > 0 ? (
              <Select
                value={groupId || NO_GROUP_VALUE}
                onValueChange={(value) => setGroupId(value === NO_GROUP_VALUE ? "" : value)}
              >
                <SelectTrigger className="rounded-xl" aria-label="Группа ученика">
                  <SelectValue placeholder="Выберите группу" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_GROUP_VALUE}>Без группы</SelectItem>
                  {groups.map(group => (
                    <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="rounded-xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                Групп пока нет. Ученик будет создан без группы — добавить его можно будет позже.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {groupCourseId
                ? `Курс группы${groupCourseTitle ? ` «${groupCourseTitle}»` : ""} будет назначен вместе с группой. Дополнительные курсы можно выбрать ниже.`
                : groupId && selectedGroup?.course_id === null
                  ? "К группе пока не привязан курс. Выберите курсы ниже или настройте курс группы позже."
                  : "Группа помогает вести поток и документы. Связанный с группой курс назначается вместе с ней; дополнительные курсы можно выбрать ниже."}
            </p>
          </div>
          <div className="space-y-2">
            <Label>{groupCourseId ? "Дополнительные курсы" : "Курсы"} (необязательно) {courseIds.length > 0 && <span className="text-primary ml-1">({courseIds.length})</span>}</Label>
            {publishedCourses.length > 5 && (
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Поиск курса..." value={courseSearch} onChange={e => setCourseSearch(e.target.value)} className="pl-10 rounded-xl" />
              </div>
            )}
            <div className="border border-border rounded-xl p-2 space-y-1 max-h-[200px] overflow-y-auto">
              {filteredCourses.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3">Курсы не найдены</p>
              ) : (
                filteredCourses.map(course => {
                  const includedByGroup = course.id === groupCourseId;
                  const checked = includedByGroup || courseIds.includes(course.id);
                  return (
                    <label key={course.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-primary/10' : 'hover:bg-secondary/50'}`}>
                      <input type="checkbox" checked={checked} disabled={includedByGroup} onChange={() => toggleCourse(course.id)} className="h-4 w-4 rounded border-primary text-primary focus:ring-primary" />
                      <span className="text-sm">{course.title}</span>
                      {includedByGroup && <span className="ml-auto text-xs text-muted-foreground">Курс группы</span>}
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <Button className="w-full btn-gradient rounded-xl" onClick={handleSubmit} disabled={isCreating || Boolean(creationWarning && !manualRetryConfirmed)}>
            {isCreating ? (<><SigmaSpinner size="sm" className="mr-2" />Добавление...</>) : creationWarning ? "Создать после ручной проверки" : "Добавить ученика"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
