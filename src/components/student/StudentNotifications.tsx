import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, GraduationCap, CalendarClock, BookCheck, Handshake, Video, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { supabase } from "@/integrations/supabase/client";

interface StudentNotification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  related_id: string | null;
  is_read: boolean;
  created_at: string;
}

const ICON_BY_TYPE: Record<string, typeof Bell> = {
  course_completed: GraduationCap,
  webinar_reminder: Video,
  homework: BookCheck,
  deadline_reminder: CalendarClock,
  partner_changes: Handshake,
  course_updates: Sparkles,
};

const COLOR_BY_TYPE: Record<string, string> = {
  course_completed: "bg-emerald-500/15 text-emerald-600",
  webinar_reminder: "bg-blue-500/15 text-blue-600",
  homework: "bg-indigo-500/15 text-indigo-600",
  deadline_reminder: "bg-amber-500/15 text-amber-600",
  partner_changes: "bg-fuchsia-500/15 text-fuchsia-600",
  course_updates: "bg-primary/15 text-primary",
};

export function StudentNotifications({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<StudentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("student_notifications" as any)
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (mounted) {
        setItems((data as unknown as StudentNotification[]) ?? []);
        setLoading(false);
      }
    })();

    const channel = supabase
      .channel(`student-notifications-${userId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "student_notifications",
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        setItems(prev => [payload.new as StudentNotification, ...prev]);
      })
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(channel); };
  }, [userId]);

  const unreadCount = useMemo(() => items.filter(i => !i.is_read).length, [items]);

  const markRead = async (id: string) => {
    setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    await supabase.from("student_notifications" as any).update({ is_read: true }).eq("id", id);
  };

  const markAllRead = async () => {
    const ids = items.filter(i => !i.is_read).map(i => i.id);
    if (!ids.length) return;
    setItems(prev => prev.map(n => ({ ...n, is_read: true })));
    await supabase.from("student_notifications" as any).update({ is_read: true }).in("id", ids);
  };

  const handleClick = (n: StudentNotification) => {
    markRead(n.id);
    if (n.type === "course_completed" && n.related_id) {
      setOpen(false);
      navigate(`/student/courses/${n.related_id}`);
    } else if (n.type === "webinar_reminder" && n.related_id) {
      setOpen(false);
      navigate(`/webinar/${n.related_id}/live`);
    } else if (n.type === "homework" && n.related_id) {
      setOpen(false);
      navigate(`/student/courses/${n.related_id}`);
    } else if (n.type === "partner_changes") {
      setOpen(false);
      navigate(`/student/profile?section=partner`);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-xl w-10 h-10 relative hover:scale-105 transition-transform">
              <Bell className="w-6 h-6" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Уведомления</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-[380px] p-0 rounded-2xl" align="end" sideOffset={8}>
        <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-2">
          <h3 className="font-bold text-lg">Уведомления</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1.5" onClick={markAllRead}>
              <CheckCheck className="w-3.5 h-3.5" />
              Отметить все
            </Button>
          )}
        </div>
        <div className="border-t border-border" />
        {loading ? (
          <div className="flex items-center justify-center py-12"><SigmaSpinner /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Нет уведомлений</p>
            <p className="text-xs mt-1 opacity-70">Здесь появятся напоминания о вебинарах, дедлайнах и оценках</p>
          </div>
        ) : (
          <ScrollArea className="h-80">
            <div className="divide-y divide-border">
              {items.map((n) => {
                const Icon = ICON_BY_TYPE[n.type] || Bell;
                const color = COLOR_BY_TYPE[n.type] || "bg-primary/15 text-primary";
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`w-full text-left px-5 py-3.5 hover:bg-muted/50 transition-colors ${!n.is_read ? "bg-primary/5" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{n.title}</span>
                          {!n.is_read && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                        </div>
                        {n.message && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                        )}
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          {format(new Date(n.created_at), "d MMM, HH:mm", { locale: ru })}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
