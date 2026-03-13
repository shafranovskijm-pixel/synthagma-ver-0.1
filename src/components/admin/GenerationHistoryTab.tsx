import { useState, useEffect } from "react";
import { History, Trash2, Loader2, Layers, FileText, HelpCircle, CheckCircle2, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface HistoryRecord {
  id: string;
  course_id: string | null;
  course_title: string;
  action: string;
  details: string | null;
  items_count: number;
  created_at: string;
}

const ACTION_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  structure: { label: "Структура", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Layers },
  content: { label: "Контент", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: FileText },
  questions: { label: "Вопросы", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: HelpCircle },
  answers: { label: "Ответы", color: "bg-violet-500/10 text-violet-600 border-violet-500/20", icon: CheckCircle2 },
};

export function GenerationHistoryTab() {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [clearing, setClearing] = useState(false);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("generation_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (filter !== "all") {
        query = query.eq("action", filter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRecords((data as HistoryRecord[]) || []);
    } catch (e: any) {
      toast.error("Ошибка загрузки истории");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [filter]);

  const handleClear = async () => {
    if (!confirm("Очистить всю историю генерации?")) return;
    setClearing(true);
    try {
      const { error } = await supabase.from("generation_history").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
      setRecords([]);
      toast.success("История очищена");
    } catch (e: any) {
      toast.error("Ошибка очистки");
    } finally {
      setClearing(false);
    }
  };

  // Group by date
  const grouped = records.reduce<Record<string, HistoryRecord[]>>((acc, r) => {
    const dateKey = format(new Date(r.created_at), "d MMMM yyyy", { locale: ru });
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              История генерации
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <Filter className="w-3 h-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все действия</SelectItem>
                  <SelectItem value="structure">Структура</SelectItem>
                  <SelectItem value="content">Контент</SelectItem>
                  <SelectItem value="questions">Вопросы</SelectItem>
                  <SelectItem value="answers">Ответы</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                disabled={clearing || records.length === 0}
                className="text-xs"
              >
                {clearing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Trash2 className="w-3 h-3 mr-1" />}
                Очистить
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Загрузка...
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              История генерации пуста
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([date, items]) => (
                <div key={date}>
                  <div className="text-xs font-medium text-muted-foreground mb-2 sticky top-0 bg-background py-1">
                    {date}
                  </div>
                  <div className="space-y-1.5">
                    {items.map(item => {
                      const meta = ACTION_META[item.action] || ACTION_META.content;
                      const Icon = meta.icon;
                      return (
                        <div
                          key={item.id}
                          className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-muted/40 transition-colors text-sm"
                        >
                          <div className="shrink-0 mt-0.5">
                            <Icon className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${meta.color}`}>
                                {meta.label}
                              </Badge>
                              <span className="font-medium truncate">{item.course_title}</span>
                              {item.items_count > 0 && (
                                <span className="text-muted-foreground text-xs">({item.items_count} эл.)</span>
                              )}
                            </div>
                            {item.details && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.details}</p>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                            {format(new Date(item.created_at), "HH:mm")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
