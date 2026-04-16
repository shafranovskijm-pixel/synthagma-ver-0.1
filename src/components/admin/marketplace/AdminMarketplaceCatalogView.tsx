import { useNavigate } from "react-router-dom";
import { Eye, BookOpen, Edit, Trash2, Building2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

interface AdminMarketplaceGridViewProps {
  courses: any[];
  dbCategories: any[];
  h: any;
  onBulkGenerate: (item: any) => void;
}

export function AdminMarketplaceGridView({ courses, dbCategories, h, onBulkGenerate }: AdminMarketplaceGridViewProps) {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
      {courses.map((item: any) => {
        const catName = dbCategories.find((c: any) => c.id === item.course?.category_id)?.name;
        return (
          <div key={item.id} className="group bg-card rounded-2xl border border-border overflow-hidden hover:shadow-lg transition-all flex flex-col">
            <div className="relative h-36 bg-muted overflow-hidden">
              {item.course?.cover_image_url ? (
                <img src={item.course.cover_image_url} alt={item.course?.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                  <BookOpen className="w-10 h-10 text-primary/40" />
                </div>
              )}
              {catName && <Badge className="absolute top-2 left-2 text-[10px]">{catName}</Badge>}
              <Badge variant={item.is_active ? "default" : "secondary"} className="absolute top-2 right-2 text-[10px]">
                {item.is_active ? "Активен" : "Скрыт"}
              </Badge>
            </div>
            <div className="p-3 flex flex-col flex-1">
              <h3 className="font-semibold text-sm line-clamp-2 mb-1">{item.course?.title || ""}</h3>
              {item.description_short && <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{item.description_short}</p>}
              <div className="mt-auto space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{item.organization?.name || "Платформа"}</span>
                  <span className="font-medium text-primary">
                    {item.price_student > 0 ? `${item.price_student.toLocaleString()} ₽` : "Бесплатно"}
                  </span>
                </div>
                <div className="flex items-center gap-1 pt-1 border-t border-border/50">
                  <Switch checked={item.is_active} onCheckedChange={() => h.handleToggleActive(item)} />
                  <span className="text-[10px] text-muted-foreground mr-auto">{item.is_active ? "Виден" : "Скрыт"}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="AI контент" onClick={() => onBulkGenerate(item)}>
                    <Sparkles className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Уроки" onClick={() => navigate(`/course-builder/${item.course_id}`)}>
                    <BookOpen className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Редактировать" onClick={() => { h.setEditingCourse(item); h.setShowEditDialog(true); }}>
                    <Edit className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => h.handleDeleteCourse(item.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
