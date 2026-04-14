import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Star, Check, Trash2, Clock } from "lucide-react";
import { format, differenceInMonths } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";

interface Testimonial {
  id: string;
  content: string;
  highlight: string | null;
  rating: number;
  author_name: string;
  author_role: string | null;
  is_approved: boolean;
  created_at: string;
  organization_id: string;
  organizations?: { name: string; created_at: string } | null;
}

export function TestimonialsManager() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTestimonials = async () => {
    setLoading(true);
    const { data, error } = await (supabase.from("testimonials") as any)
      .select("*, organizations(name, created_at)")
      .order("created_at", { ascending: false });

    if (!error && data) setTestimonials(data);
    setLoading(false);
  };

  useEffect(() => { fetchTestimonials(); }, []);

  const handleApprove = async (id: string) => {
    const { error } = await (supabase.from("testimonials") as any)
      .update({ is_approved: true })
      .eq("id", id);
    if (error) {
      toast.error("Ошибка", { description: "error.message" });
    } else {
      toast.success("Отзыв одобрен");
      fetchTestimonials();
    }
  };

  const handleReject = async (id: string) => {
    const { error } = await (supabase.from("testimonials") as any)
      .update({ is_approved: false })
      .eq("id", id);
    if (error) {
      toast.error("Ошибка", { description: "error.message" });
    } else {
      toast.success("Отзыв скрыт");
      fetchTestimonials();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить отзыв?")) return;
    const { error } = await (supabase.from("testimonials") as any)
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Ошибка", { description: "error.message" });
    } else {
      toast.success("Отзыв удалён");
      fetchTestimonials();
    }
  };

  const getUsageDuration = (orgCreatedAt: string) => {
    const months = differenceInMonths(new Date(), new Date(orgCreatedAt));
    if (months < 1) return "менее месяца";
    if (months === 1) return "1 месяц";
    if (months < 5) return `${months} месяца`;
    return `${months} месяцев`;
  };

  if (loading) return <div className="text-center py-8 text-muted-foreground">Загрузка...</div>;

  if (testimonials.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">Нет отзывов</div>;
  }

  return (
    <div className="space-y-4">
      {testimonials.map((t) => (
        <Card key={t.id} className={`${!t.is_approved ? "border-dashed opacity-80" : ""}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{t.author_name}</span>
                  {t.author_role && <span className="text-xs text-muted-foreground">· {t.author_role}</span>}
                  {t.organizations && (
                    <Badge variant="secondary" className="text-xs">
                      {t.organizations.name}
                    </Badge>
                  )}
                  {t.organizations && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {getUsageDuration(t.organizations.created_at)}
                    </span>
                  )}
                  <Badge variant={t.is_approved ? "default" : "outline"} className="text-xs">
                    {t.is_approved ? "Одобрен" : "На модерации"}
                  </Badge>
                </div>
                <div className="flex gap-0.5">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 text-accent fill-accent" />
                  ))}
                </div>
                {t.highlight && <div className="text-xs font-medium text-accent">{t.highlight}</div>}
                <p className="text-sm">{t.content}</p>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(t.created_at), "d MMM yyyy", { locale: ru })}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                {!t.is_approved ? (
                  <Button size="sm" variant="outline" onClick={() => handleApprove(t.id)}>
                    <Check className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => handleReject(t.id)}>
                    Скрыть
                  </Button>
                )}
                <Button size="sm" variant="destructive" onClick={() => handleDelete(t.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
