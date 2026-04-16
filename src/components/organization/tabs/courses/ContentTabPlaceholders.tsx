import React, { Suspense, lazy } from "react";
import { Radio, Video, BookOpen, Calendar, Users, Play, Box, Crown, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WebinarsManager } from "@/components/organization/WebinarsManager";

const Student3DTrainers = lazy(() => import("@/components/student/Student3DTrainers").then(m => ({ default: m.Student3DTrainers })));

interface WebinarsPlaceholderProps {
  organizationId: string;
  isEnabled: boolean;
  onNavigateToTariffs: () => void;
}

export const WebinarsContent = React.memo(function WebinarsContent({ organizationId, isEnabled, onNavigateToTariffs }: WebinarsPlaceholderProps) {
  if (isEnabled) return <WebinarsManager organizationId={organizationId} />;

  return (
    <div className="py-8">
      <Card className="max-w-4xl mx-auto overflow-hidden border-0 shadow-lg">
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-8 text-white">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center"><Radio className="w-7 h-7" /></div>
            <div><h2 className="text-2xl font-bold">Вебинары и онлайн-трансляции</h2><p className="text-white/80 mt-1">Проводите живые занятия и сохраняйте записи для повторного просмотра</p></div>
          </div>
        </div>
        <div className="p-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {[
              { icon: Radio, title: "Онлайн-трансляции", desc: "Проводите занятия в реальном времени с неограниченным числом зрителей" },
              { icon: Video, title: "Запись вебинаров", desc: "Автоматическое сохранение записей для повторного просмотра студентами" },
              { icon: BookOpen, title: "Привязка к курсам", desc: "Студенты курса автоматически получают доступ к трансляциям" },
              { icon: Calendar, title: "Планирование", desc: "Назначайте дату и время вебинара заранее и рассылайте приглашения" },
              { icon: Users, title: "Управление участниками", desc: "Полный контроль доступа к трансляциям и записям" },
              { icon: Play, title: "Встроенный плеер", desc: "Просмотр прямо на платформе без переходов на сторонние сервисы" },
            ].map((f, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0"><f.icon className="w-5 h-5 text-purple-600 dark:text-purple-400" /></div>
                <div><h4 className="font-semibold text-foreground text-sm">{f.title}</h4><p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{f.desc}</p></div>
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800/30">
            <div className="flex items-center gap-2"><Crown className="w-5 h-5 text-purple-600" /><span className="text-sm font-medium text-foreground">Доступно с тарифа <span className="text-purple-600 font-bold">Профессиональный</span></span></div>
            <Button className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl gap-2" onClick={onNavigateToTariffs}>Перейти к тарифам<ArrowRight className="w-4 h-4" /></Button>
          </div>
        </div>
      </Card>
    </div>
  );
});

export const ThreeDContent = React.memo(function ThreeDContent() {
  return (
    <div className="max-w-3xl mx-auto">
      <Suspense fallback={<div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>}>
        <Student3DTrainers />
      </Suspense>
    </div>
  );
});
