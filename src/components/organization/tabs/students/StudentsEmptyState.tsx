import { Button } from "@/components/ui/button";
import { GraduationCap, Key, Mail, BookOpen, CheckCircle2, FileCheck, FolderOpen, FileSpreadsheet, FileText, MessageCircle, Plus, Eye } from "lucide-react";

interface StudentsEmptyStateProps {
  onAddStudent?: () => void;
  onImportStudents?: () => void;
  onNavigateToFRDO?: () => void;
}

export function StudentsEmptyState({ onAddStudent, onImportStudents, onNavigateToFRDO }: StudentsEmptyStateProps) {
  return (
    <div className="py-8">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
          <GraduationCap className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Управляйте обучением эффективно</h2>
        <p className="text-muted-foreground mt-2 max-w-lg mx-auto">Добавьте учеников и начните отслеживать их прогресс, документы и результаты</p>
        <Button variant="outline" className="rounded-xl gap-2 mt-4" onClick={() => { localStorage.setItem('previewStudentDashboard', 'true'); window.open('/student', '_blank'); }}>
          <Eye className="w-4 h-4" />Посмотрите, как выглядит кабинет ученика
        </Button>
      </div>
      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        <EmptyCard title="Добавить ученика" description="Создайте профиль ученика с автоматической генерацией логина и пароля для входа в систему." icon={Plus} color="primary" items={[{ icon: Key, text: "Автогенерация учётных данных" }, { icon: Mail, text: "Отправка доступа на почту" }, { icon: GraduationCap, text: "Зачисление на курсы" }]} action={onAddStudent && <Button onClick={onAddStudent} className="w-full rounded-xl gap-2 btn-gradient mt-2"><Plus className="w-4 h-4" />Добавить ученика</Button>} />
        <EmptyCard title="Контроль обучения" description="Отслеживайте прогресс, результаты тестов и время обучения каждого ученика в реальном времени." icon={BookOpen} color="accent" items={[{ icon: CheckCircle2, text: "Прогресс по каждому уроку" }, { icon: FileCheck, text: "Результаты тестирования" }, { icon: FolderOpen, text: "Группировка по группам" }]} action={onImportStudents && <Button onClick={onImportStudents} variant="outline" className="w-full rounded-xl gap-2 mt-2"><FileSpreadsheet className="w-4 h-4" />Импорт учеников</Button>} />
        <EmptyCard title="Документооборот" description="Собирайте документы учеников, формируйте приказы, протоколы и выгружайте данные в ФРДО." icon={FileText} color="muted" items={[{ icon: FileSpreadsheet, text: "Экспорт в Excel и ФРДО" }, { icon: FileText, text: "Приказы и протоколы" }, { icon: MessageCircle, text: "Напоминания о документах" }]} action={onNavigateToFRDO && <Button onClick={onNavigateToFRDO} variant="outline" className="w-full rounded-xl gap-2 mt-2"><FileText className="w-4 h-4" />Перейти в ФИС ФРДО</Button>} />
      </div>
    </div>
  );
}

function EmptyCard({ title, description, icon: Icon, color, items, action }: { title: string; description: string; icon: any; color: string; items: { icon: any; text: string }[]; action?: React.ReactNode }) {
  const borderColor = color === "primary" ? "border-primary/30 hover:border-primary/60" : color === "accent" ? "border-accent/30 hover:border-accent/60" : "border-muted-foreground/20 hover:border-muted-foreground/40";
  const bgColor = color === "primary" ? "bg-primary/10" : color === "accent" ? "bg-accent/20" : "bg-muted";
  return (
    <div className={`relative overflow-hidden rounded-xl border-2 border-dashed ${borderColor} transition-all group`}>
      <div className="relative p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${bgColor} flex items-center justify-center`}><Icon className="w-5 h-5" /></div>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        <ul className="space-y-2.5">
          {items.map((item, i) => <li key={i} className="flex items-center gap-2.5 text-sm text-muted-foreground"><item.icon className="w-4 h-4 text-primary/70 shrink-0" /><span>{item.text}</span></li>)}
        </ul>
        {action}
      </div>
    </div>
  );
}
