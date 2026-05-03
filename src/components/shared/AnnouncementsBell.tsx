/**
 * Колокольчик с бейджем «N новых» для платформенных объявлений.
 * Показывает количество объявлений, опубликованных после
 * profiles.last_seen_announcement_at. По клику открывает popover
 * со списком и обновляет timestamp.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Megaphone, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { qk } from "@/lib/queryKeys";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Announcement {
  id: string;
  title: string | null;
  content: string;
  created_at: string;
}

export function AnnouncementsBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: announcements = [] } = useQuery({
    queryKey: qk.platform.announcements(),
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_announcements")
        .select("id, title, content, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      return (data || []) as Announcement[];
    },
    staleTime: 5 * 60 * 1000, // справочное — раз в 5 мин достаточно
  });

  const { data: lastSeen } = useQuery({
    queryKey: user?.id ? qk.user.announcements(user.id) : ["__noop__"],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("last_seen_announcement_at")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data?.last_seen_announcement_at as string | null;
    },
    staleTime: 60 * 1000,
  });

  // Realtime: при появлении нового объявления — инвалидируем список
  useEffect(() => {
    const channel = supabase
      .channel(`platform-announcements-bell-${Date.now()}-${Math.random().toString(36).slice(2,8)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "platform_announcements" },
        () => {
          qc.invalidateQueries({ queryKey: qk.platform.announcements() });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  const unseenCount = announcements.filter(
    (a) => !lastSeen || new Date(a.created_at) > new Date(lastSeen),
  ).length;

  // На открытие popover — отмечаем как просмотренные
  useEffect(() => {
    if (!open || !user?.id || announcements.length === 0) return;
    const newest = announcements[0]?.created_at;
    if (!newest) return;
    if (lastSeen && new Date(lastSeen) >= new Date(newest)) return;
    void supabase
      .from("profiles")
      .update({ last_seen_announcement_at: newest })
      .eq("user_id", user.id)
      .then(() => {
        qc.invalidateQueries({ queryKey: qk.user.announcements(user.id) });
      });
  }, [open, user?.id, announcements, lastSeen, qc]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="Что нового"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <Bell className="w-5 h-5" />
          {unseenCount > 0 && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1",
                "rounded-full bg-primary text-primary-foreground",
                "text-[10px] font-bold flex items-center justify-center",
                "ring-2 ring-card",
              )}
            >
              {unseenCount > 9 ? "9+" : unseenCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0 rounded-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Что нового</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 rounded-lg"
            onClick={() => {
              setOpen(false);
              navigate("/whats-new");
            }}
          >
            Все
          </Button>
        </div>
        <ScrollArea className="max-h-[400px]">
          {announcements.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Пока нет объявлений
            </div>
          ) : (
            <div className="divide-y divide-border">
              {announcements.slice(0, 6).map((a) => {
                const isUnseen =
                  !lastSeen || new Date(a.created_at) > new Date(lastSeen);
                return (
                  <div
                    key={a.id}
                    className={cn(
                      "px-4 py-3 hover:bg-muted/40 transition-colors",
                      isUnseen && "bg-primary/5",
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <Megaphone
                        className={cn(
                          "w-4 h-4 shrink-0 mt-0.5",
                          isUnseen ? "text-primary" : "text-muted-foreground",
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        {a.title && (
                          <p className="text-sm font-medium text-foreground line-clamp-1">
                            {a.title}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 whitespace-pre-wrap">
                          {a.content}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 mt-1">
                          {format(new Date(a.created_at), "d MMM, HH:mm", {
                            locale: ru,
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
