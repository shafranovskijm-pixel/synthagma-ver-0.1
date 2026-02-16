import { useEffect, useState } from "react";
import { Clock, Monitor, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface LoginRecord {
  id: string;
  logged_in_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

interface ActivityTabProps {
  userId: string;
  organizationId: string;
}

function parseUserAgent(ua: string | null): string {
  if (!ua) return "Неизвестно";
  if (ua.includes("Mobile")) return "📱 Мобильный";
  if (ua.includes("Chrome")) return "🌐 Chrome";
  if (ua.includes("Firefox")) return "🦊 Firefox";
  if (ua.includes("Safari")) return "🍎 Safari";
  if (ua.includes("Edge")) return "🌐 Edge";
  return "🖥 Браузер";
}

export function ActivityTab({ userId, organizationId }: ActivityTabProps) {
  const [history, setHistory] = useState<LoginRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [userId]);

  const loadHistory = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("student_login_history")
      .select("*")
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .order("logged_in_at", { ascending: false })
      .limit(50);
    setHistory((data as LoginRecord[]) || []);
    setIsLoading(false);
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
        <p>Нет записей о входах</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-medium text-sm text-muted-foreground mb-4">
        Последние {history.length} входов на платформу
      </h3>
      <div className="space-y-2">
        {history.map((record) => (
          <div
            key={record.id}
            className="flex items-center gap-4 p-3 rounded-xl bg-muted/50 border border-border"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Monitor className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">
                {format(new Date(record.logged_in_at), "d MMMM yyyy, HH:mm", { locale: ru })}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-3">
                <span>{parseUserAgent(record.user_agent)}</span>
                {record.ip_address && <span className="font-mono">{record.ip_address}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
