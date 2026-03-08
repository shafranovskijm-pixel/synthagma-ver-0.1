import { GraduationCap, Award, ShieldCheck, Wrench, Plus, Clock, FileText, Users, Construction } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const programTypes = [
  {
    title: "Повышение квалификации",
    category: "ДПО",
    document: "Удостоверение",
    icon: GraduationCap,
    hours: "от 16 часов",
    color: "text-blue-600",
    bgColor: "bg-blue-500/10 border-blue-500/20",
    count: 0,
  },
  {
    title: "Профессиональная переподготовка",
    category: "ДПО",
    document: "Диплом",
    icon: Award,
    hours: "от 250 часов",
    color: "text-violet-600",
    bgColor: "bg-violet-500/10 border-violet-500/20",
    count: 0,
  },
  {
    title: "Охрана труда / Пожарная безопасность",
    category: "ОТ / ПБ",
    document: "Протокол",
    icon: ShieldCheck,
    hours: "от 8 часов",
    color: "text-amber-600",
    bgColor: "bg-amber-500/10 border-amber-500/20",
    count: 0,
  },
  {
    title: "Рабочие профессии",
    category: "ПО",
    document: "Свидетельство",
    icon: Wrench,
    hours: "от 72 часов",
    color: "text-emerald-600",
    bgColor: "bg-emerald-500/10 border-emerald-500/20",
    count: 0,
  },
];

const upcomingFeatures = [
  { icon: FileText, text: "Учебный план с тематическим планированием" },
  { icon: Users, text: "Категории слушателей и требования к зачислению" },
  { icon: Clock, text: "Расписание и календарный учебный график" },
  { icon: Award, text: "Шаблоны документов об образовании" },
];

export function ProgramsTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <GraduationCap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Программы ДПО / ПО</CardTitle>
              <CardDescription>
                Конструктор образовательных программ дополнительного и профессионального образования
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Program type cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {programTypes.map((pt) => {
              const Icon = pt.icon;
              return (
                <div
                  key={pt.title}
                  className={`relative border rounded-xl p-4 space-y-3 transition-colors hover:shadow-md ${pt.bgColor}`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-5 h-5 ${pt.color}`} />
                    <Badge variant="outline" className="text-[10px] font-medium">
                      {pt.category}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight">{pt.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{pt.hours}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      <FileText className="w-3 h-3 inline mr-1" />{pt.document}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">{pt.count} программ</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Create button */}
          <Button className="rounded-xl" disabled>
            <Plus className="w-4 h-4 mr-2" />
            Создать программу
            <Badge variant="secondary" className="ml-2 text-[10px]">Скоро</Badge>
          </Button>

          {/* Upcoming features */}
          <div className="rounded-xl border border-dashed p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Construction className="w-4 h-4" />
              В разработке
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {upcomingFeatures.map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.text} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{f.text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
