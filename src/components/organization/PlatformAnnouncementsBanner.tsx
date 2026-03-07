import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, X } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface Announcement {
  id: string;
  title: string | null;
  content: string;
  created_at: string;
}

export function PlatformAnnouncementsBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const stored = localStorage.getItem("dismissed_announcements");
    if (stored) {
      try { setDismissed(new Set(JSON.parse(stored))); } catch {}
    }

    const fetchAnnouncements = async () => {
      const { data } = await supabase
        .from("platform_announcements")
        .select("id, title, content, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      if (data) setAnnouncements(data);
    };
    fetchAnnouncements();
  }, []);

  const handleDismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    localStorage.setItem("dismissed_announcements", JSON.stringify([...next]));
  };

  const visible = announcements.filter(a => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {visible.map(a => (
        <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
          <Megaphone className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            {a.title && <p className="text-sm font-medium text-foreground">{a.title}</p>}
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.content}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {format(new Date(a.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
            </p>
          </div>
          <button onClick={() => handleDismiss(a.id)} className="p-1 rounded hover:bg-secondary shrink-0">
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      ))}
    </div>
  );
}
