import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  GripVertical, CheckCircle, Play, Lock, Palette, Plus, Edit, Sparkles,
  BookOpen, Users, ShoppingCart,
} from "lucide-react";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";

interface CoursesEmptyStateProps {
  onCreateCourse: () => void;
}

export function CoursesEmptyState({ onCreateCourse }: CoursesEmptyStateProps) {
  let dashboard: ReturnType<typeof useOrgDashboard> | null = null;
  try { dashboard = useOrgDashboard(); } catch {}

  const features = [
    { icon: GripVertical, text: "Drag-and-drop конструктор уроков" },
    { icon: CheckCircle, text: "Тесты с автоматической проверкой" },
    { icon: Play, text: "Видеоуроки с контролем просмотра" },
    { icon: Lock, text: "Последовательное прохождение уроков" },
    { icon: Palette, text: "Брендирование и настройка внешнего вида" },
  ];

  return (
    <div className="py-8">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Начните обучение прямо сейчас</h2>
        <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
          Создайте свой первый курс или выберите из каталога готовых программ
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        <Card className="relative overflow-hidden border-2 border-dashed border-primary/30 hover:border-primary/60 transition-all group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Edit className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Создать свой курс</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Мощный и интуитивный конструктор курсов — создавайте профессиональные учебные программы за минуты, а не дни.
            </p>
            <ul className="space-y-2.5">
              {features.map((f, i) => (
                <li key={i} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <f.icon className="w-4 h-4 text-primary/70 shrink-0" />
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>
            <Button className="w-full rounded-xl gap-2 mt-2" onClick={onCreateCourse}>
              <Plus className="w-4 h-4" />
              Создать курс
            </Button>
          </div>
        </Card>

        <Card className="relative overflow-hidden border-2 border-dashed border-accent/30 hover:border-accent/60 transition-all group">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-accent/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-accent-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Магазин готовых курсов</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Более <span className="font-semibold text-foreground">200 готовых курсов</span> уже ждут вас — по охране труда, пожарной безопасности, экологии и другим направлениям.
            </p>
            <div className="rounded-xl bg-accent/10 p-4 space-y-1">
              <p className="text-sm font-medium text-foreground">🎁 Бесплатно для вашей организации</p>
              <p className="text-xs text-muted-foreground">
                Добавляйте курсы из каталога в один клик — без дополнительных затрат
              </p>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-primary/70" /> Программы от экспертов отрасли</li>
              <li className="flex items-center gap-2"><Users className="w-4 h-4 text-primary/70" /> Готовы к назначению слушателям</li>
            </ul>
            <Button
              variant="outline"
              className="w-full rounded-xl gap-2 mt-2"
              onClick={() => dashboard?.tabNavigation.setActiveTab("services" as any)}
            >
              <ShoppingCart className="w-4 h-4" />
              Перейти в магазин
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
