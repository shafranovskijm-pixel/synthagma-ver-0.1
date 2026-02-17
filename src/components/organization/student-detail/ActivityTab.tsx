import { useEffect, useState } from "react";
import { Clock, Monitor, BookOpen, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface LoginRecord {
  id: string;
  logged_in_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

interface CourseAccessRecord {
  id: string;
  course_id: string;
  accessed_at: string;
  user_agent: string | null;
  course_title?: string;
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
  const [courseAccess, setCourseAccess] = useState<CourseAccessRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    setIsLoading(true);
    const [loginRes, accessRes] = await Promise.all([
      supabase
        .from("student_login_history")
        .select("*")
        .eq("user_id", userId)
        .eq("organization_id", organizationId)
        .order("logged_in_at", { ascending: false })
        .limit(50),
      supabase
        .from("course_access_log")
        .select("id, course_id, accessed_at, user_agent")
        .eq("user_id", userId)
        .eq("organization_id", organizationId)
        .order("accessed_at", { ascending: false })
        .limit(50),
    ]);

    setHistory((loginRes.data as LoginRecord[]) || []);

    // Enrich course access with titles
    const accessData = (accessRes.data || []) as CourseAccessRecord[];
    if (accessData.length > 0) {
      const courseIds = [...new Set(accessData.map((a) => a.course_id))];
      const { data: courses } = await supabase
        .from("courses")
        .select("id, title")
        .in("id", courseIds);
      const courseMap = new Map((courses || []).map((c: any) => [c.id, c.title]));
      accessData.forEach((a) => {
        a.course_title = courseMap.get(a.course_id) || "Неизвестный курс";
      });
    }
    setCourseAccess(accessData);
    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Tabs defaultValue="courses" className="space-y-4">
      <TabsList>
        <TabsTrigger value="courses">
          <BookOpen className="w-4 h-4 mr-1.5" />
          Заходы на курсы ({courseAccess.length})
        </TabsTrigger>
        <TabsTrigger value="logins">
          <Monitor className="w-4 h-4 mr-1.5" />
          Входы на платформу ({history.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="courses">
        {courseAccess.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>Нет записей о заходах на курсы</p>
          </div>
        ) : (
          <div className="space-y-2">
            {courseAccess.map((record) => (
              <div
                key={record.id}
                className="flex items-center gap-4 p-3 rounded-xl bg-muted/50 border border-border"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {record.course_title}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3">
                    <span>
                      {format(new Date(record.accessed_at), "d MMMM yyyy, HH:mm", { locale: ru })}
                    </span>
                    <span>{parseUserAgent(record.user_agent)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="logins">
        {history.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>Нет записей о входах</p>
          </div>
        ) : (
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
                    {record.ip_address && (
                      <span className="font-mono">{record.ip_address}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
