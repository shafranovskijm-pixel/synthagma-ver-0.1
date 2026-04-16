import { BookOpen, Clock, Lock, CheckCircle2, ShoppingCart, Play, ClipboardCheck, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CourseCardNewProps {
  id: string;
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  categoryName?: string | null;
  categoryColor?: string | null;
  duration?: string | null;
  price?: number;
  progress?: number;
  totalLessons?: number;
  completedLessons?: number;
  status?: "in_progress" | "completed" | "not_enrolled" | "locked" | "pending";
  needsVideoId?: boolean;
  onClick: () => void;
  onBuy?: () => void;
  onEnroll?: () => void;
}

export function CourseCardNew({
  title, description, coverImageUrl, categoryName, categoryColor,
  duration, price, progress, totalLessons, completedLessons,
  status = "not_enrolled", needsVideoId, onClick, onBuy, onEnroll,
}: CourseCardNewProps) {
  const isEnrolled = status === "in_progress" || status === "completed";
  const isPaid = price != null && price > 0;

  return (
    <div
      onClick={onClick}
      className="group bg-card rounded-2xl border border-border overflow-hidden hover:shadow-lg transition-all cursor-pointer flex flex-col"
    >
      {/* Cover */}
      <div className="relative h-40 bg-muted overflow-hidden">
        {coverImageUrl ? (
          <img src={coverImageUrl} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <BookOpen className="w-10 h-10 text-primary/40" />
          </div>
        )}
        {categoryName && (
          <Badge
            className="absolute top-3 left-3 text-[11px] font-medium"
            style={categoryColor ? { backgroundColor: categoryColor, color: "#fff" } : undefined}
          >
            {categoryName}
          </Badge>
        )}
        {status === "completed" && (
          <div className="absolute top-3 right-3 bg-green-500 text-white rounded-full p-1">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        )}
        {needsVideoId && (
          <div className="absolute top-3 right-3 bg-amber-500 text-white rounded-full p-1">
            <Lock className="w-4 h-4" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-semibold text-sm line-clamp-2 mb-1">{title}</h3>
        {description && <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{description}</p>}
        
        <div className="mt-auto space-y-3">
          {/* Progress bar for enrolled */}
          {isEnrolled && typeof progress === "number" && (
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{completedLessons}/{totalLessons} уроков</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", status === "completed" ? "bg-green-500" : "bg-primary")}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Footer info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {duration && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{duration}</span>}
              {totalLessons != null && !isEnrolled && <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{totalLessons}</span>}
            </div>
            {!isEnrolled && isPaid && (
              <span className="text-sm font-bold text-primary">{price!.toLocaleString("ru-RU")} ₽</span>
            )}
            {!isEnrolled && !isPaid && (
              <span className="text-xs font-medium text-green-600">Бесплатно</span>
            )}
          </div>

          {/* Action buttons */}
          {status === "pending" ? (
            <Button size="sm" className="w-full gap-1.5" variant="outline" disabled>
              <ClipboardCheck className="w-3.5 h-3.5" />
              Заявка отправлена
            </Button>
          ) : isEnrolled ? (
            <Button size="sm" className="w-full gap-1.5" variant={status === "completed" ? "outline" : "default"}>
              <Play className="w-3.5 h-3.5" />
              {status === "completed" ? "Пройти заново" : "Продолжить"}
            </Button>
          ) : isPaid && onBuy && onEnroll ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 gap-1.5"
                onClick={(e) => { e.stopPropagation(); onBuy(); }}
              >
                <CreditCard className="w-3.5 h-3.5" />
                Купить
              </Button>
              <Button
                size="sm"
                className="flex-1 gap-1.5"
                variant="outline"
                onClick={(e) => { e.stopPropagation(); onEnroll(); }}
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
                Оставить заявку
              </Button>
            </div>
          ) : (
            <Button size="sm" className="w-full gap-1.5" variant="outline">
              <ShoppingCart className="w-3.5 h-3.5" />
              Оставить заявку
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
