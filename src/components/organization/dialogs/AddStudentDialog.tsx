import { useState } from "react";
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
            <Label>Курсы (необязательно) {courseIds.length > 0 && <span className="text-primary ml-1">({courseIds.length})</span>}</Label>
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
                  const checked = courseIds.includes(course.id);
                  return (
                    <label key={course.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-primary/10' : 'hover:bg-secondary/50'}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleCourse(course.id)} className="h-4 w-4 rounded border-primary text-primary focus:ring-primary" />
                      <span className="text-sm">{course.title}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <Button className="w-full btn-gradient rounded-xl" onClick={handleSubmit} disabled={isCreating}>
            {isCreating ? (<><SigmaSpinner size="sm" className="mr-2" />Добавление...</>) : "Добавить ученика"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
