import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Eye, Plus, Zap, BookOpen, Award, Building2, Clock,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { CourseComments } from "./CourseComments";

interface CourseStoreDetailViewProps {
  course: any;
  userRole: string;
  userId?: string;
  onBack: () => void;
  onOrder: (item: any) => void;
}

export function CourseStoreDetailView({ course, userRole, userId, onBack, onOrder }: CourseStoreDetailViewProps) {
  const navigate = useNavigate();
  const price = userRole === 'organization' ? course.price_organization : course.price_student;

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-6">
      <Button variant="ghost" className="gap-2 -ml-2" onClick={onBack}>
        <ArrowLeft className="w-4 h-4" />Назад к каталогу
      </Button>

      <div>
        <h2 className="text-2xl font-bold">{course.course?.title}</h2>
        <p className="text-muted-foreground flex items-center gap-1.5 mt-1">
          <Building2 className="w-4 h-4" />{course.organization?.name}
        </p>
      </div>

      {course.course?.duration && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>Длительность: {course.course.duration}</span>
        </div>
      )}

      {(course.description_short || course.course?.description) && (
        <Card>
          <CardHeader><CardTitle className="text-base">Описание курса</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {course.description_short && <p className="text-muted-foreground leading-relaxed">{course.description_short}</p>}
            {course.course?.description && <p className="leading-relaxed">{course.course.description}</p>}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: Zap, text: "Доступ сразу после получения" },
          { icon: BookOpen, text: "Все материалы и тесты включены" },
          { icon: Award, text: "Удостоверение по завершении" },
        ].map((b, i) => (
          <div key={i} className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/50 border border-border">
            <b.icon className="w-4 h-4 text-green-600 shrink-0" />
            <span className="text-sm">{b.text}</span>
          </div>
        ))}
      </div>

      <Card className={`text-center ${price > 0 ? 'border-primary/20 bg-primary/5' : 'border-green-500/20 bg-green-500/5'}`}>
        <CardContent className="pt-6 pb-4 space-y-1">
          <div className={`text-2xl font-bold ${price > 0 ? 'text-primary' : 'text-green-600'}`}>
            {price > 0 ? `${price.toLocaleString()} ₽` : 'БЕСПЛАТНО'}
          </div>
          <p className="text-xs text-muted-foreground">{price > 0 ? 'Ограниченное предложение' : 'Доступно всем организациям'}</p>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <Button variant="outline" className="flex-1 rounded-xl gap-2" onClick={() => { onBack(); navigate(`/course-preview/${course.course_id}?from=store`); }}>
          <Eye className="w-4 h-4" />Просмотр
        </Button>
        <Button className="flex-1 rounded-xl gap-2 text-base py-5 bg-green-600 hover:bg-green-700 text-white" onClick={() => onOrder(course)}>
          <Plus className="w-4 h-4" />Получить курс
        </Button>
      </div>

      <CourseComments marketplaceCourseId={course.id} userId={userId} />
    </div>
  );
}
