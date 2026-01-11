import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, UserPlus, UserMinus, History } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface EnrollmentHistoryItem {
  id: string;
  user_id: string;
  course_id: string;
  action: string;
  created_at: string;
  user_name?: string;
  user_email?: string;
  performed_by_name?: string;
}

interface EnrollmentHistoryProps {
  courseId: string;
  organizationId: string;
}

export function EnrollmentHistory({ courseId, organizationId }: EnrollmentHistoryProps) {
  const [history, setHistory] = useState<EnrollmentHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, [courseId]);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      // Fetch history
      const { data: historyData, error } = await supabase
        .from("enrollment_history")
        .select("*")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      // Fetch profiles for user names
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .eq("organization_id", organizationId);

      const profilesMap = new Map(
        (profiles || []).map(p => [p.user_id, { name: p.full_name, email: p.email }])
      );

      const enrichedHistory = (historyData || []).map(h => ({
        ...h,
        user_name: profilesMap.get(h.user_id)?.name || "Неизвестный",
        user_email: profilesMap.get(h.user_id)?.email || "",
        performed_by_name: h.performed_by ? (profilesMap.get(h.performed_by)?.name || "Система") : "Система"
      }));

      setHistory(enrichedHistory);
    } catch (error) {
      console.error("Error fetching enrollment history:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>История зачислений пуста</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-60 overflow-auto">
      {history.map(item => (
        <div
          key={item.id}
          className={`flex items-start gap-3 p-3 rounded-xl ${
            item.action === "enrolled" ? "bg-sigma-green/10" : "bg-destructive/10"
          }`}
        >
          <div className={`p-2 rounded-lg ${
            item.action === "enrolled" ? "bg-sigma-green/20 text-sigma-green" : "bg-destructive/20 text-destructive"
          }`}>
            {item.action === "enrolled" ? (
              <UserPlus className="w-4 h-4" />
            ) : (
              <UserMinus className="w-4 h-4" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium truncate">{item.user_name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                item.action === "enrolled" 
                  ? "bg-sigma-green/20 text-sigma-green" 
                  : "bg-destructive/20 text-destructive"
              }`}>
                {item.action === "enrolled" ? "Зачислен" : "Отчислен"}
              </span>
            </div>
            {item.user_email && (
              <p className="text-sm text-muted-foreground truncate">{item.user_email}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {format(new Date(item.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
              {item.performed_by_name && ` • ${item.performed_by_name}`}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
