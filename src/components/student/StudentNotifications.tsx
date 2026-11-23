import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, GraduationCap, CalendarClock, BookCheck, Handshake, Video, Sparkles, FileCheck } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { supabase } from "@/integrations/supabase/client";
import {useStudentSignatureInbox} from '@/hooks/useStudentSignatureInbox';
import {studentDocumentsPath} from '@/lib/studentDocumentInbox';

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

export function StudentNotifications({ userId,organizationId }: { userId: string;organizationId?:string|null }) {
  return <StudentNotificationsView key={`${userId}:${organizationId??''}`} userId={userId} organizationId={organizationId}/>;
}
function StudentNotificationsView({userId,organizationId}:{userId:string;organizationId?:string|null}) {
  const navigate = useNavigate();
  const [items, setItems] = useState<StudentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [feedError,setFeedError]=useState(false);
  const [feedRevision,setFeedRevision]=useState(0);
  const inbox=useStudentSignatureInbox(userId,organizationId);

  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    setItems([]);
    (async () => {
      setLoading(true);
      setFeedError(false);
      const { data,error } = await supabase
        .from("student_notifications" as any)
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (mounted) {
        setFeedError(!!error);
        if(!error)setItems((data as unknown as StudentNotification[]) ?? []);
        setLoading(false);
      }
    })().catch(()=>{if(mounted){setFeedError(true);setLoading(false);}});

    const channel = supabase
      .channel(`student-notifications-${userId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "student_notifications",
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        if(mounted)setItems(prev => [payload.new as StudentNotification, ...prev.filter(row=>row.id!==payload.new.id)].slice(0,50));
      })
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(channel); };
  }, [userId,feedRevision]);

  const unreadCount = useMemo(() => items.filter(i => !i.is_read).length, [items]);

  const markRead = async (id: string) => {
    setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    await supabase.from("student_notifications" as any).update({ is_read: true }).eq("id", id).eq('user_id',userId);
  };

  const markAllRead = async () => {
    const ids = items.filter(i => !i.is_read).map(i => i.id);
    if (!ids.length) return;
    setItems(prev => prev.map(n => ({ ...n, is_read: true })));
    await supabase.from("student_notifications" as any).update({ is_read: true }).in("id", ids).eq('user_id',userId);
  };

  const handleClick = (n: StudentNotification) => {
    markRead(n.id);
    if (n.type === "course_completed" && n.related_id) {
      setOpen(false);
      navigate(`/course/${n.related_id}/learn`);
    } else if (n.type === "webinar_reminder" && n.related_id) {
      setOpen(false);
      navigate(`/webinar/${n.related_id}/live`);
    } else if (n.type === "homework" && n.related_id) {
      setOpen(false);
      navigate(`/course/${n.related_id}/learn`);
    } else if (n.type === "partner_changes") {
      setOpen(false);
      navigate(`/student/profile?section=partner`);
    } else if (['document_signature','document_ready','education_document'].includes(n.type)) {
      setOpen(false);
      navigate(studentDocumentsPath());
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label={`Уведомления: ${unreadCount}; документов требуют подтверждения: ${inbox.pendingCount}`} variant="ghost" size="icon" className="rounded-xl w-10 h-10 relative hover:scale-105 transition-transform">
              <Bell className="w-6 h-6" />
              {unreadCount + inbox.pendingCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                  {unreadCount + inbox.pendingCount > 9 ? "9+" : unreadCount + inbox.pendingCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Уведомления</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-[380px] max-w-[calc(100vw-24px)] p-0 rounded-2xl" align="end" sideOffset={8}>
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
        {inbox.error && <div role="alert" className="p-4 text-sm"><p>{inbox.error}</p><Button variant="outline" size="sm" onClick={()=>void inbox.reload()}>Повторить проверку документов</Button></div>}
        {inbox.pendingCount>0 && <div className="border-b border-border p-3 space-y-2">
          <p className="px-2 text-sm font-semibold">Документы: требуется подтверждение ({inbox.pendingCount})</p>
          {inbox.pending.slice(0,5).map(item=><button key={item.id} type="button" className="flex w-full items-start gap-3 rounded-xl bg-primary/5 p-3 text-left hover:bg-primary/10 focus-visible:outline focus-visible:outline-2" onClick={()=>{setOpen(false);navigate(studentDocumentsPath(item.id));}}>
            <FileCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary"/><span className="min-w-0"><span className="block break-words text-sm font-medium">{item.document_title}</span><span className="block text-xs text-muted-foreground">Открыть документ и проверить условия подтверждения</span></span>
          </button>)}
          <Button variant="ghost" size="sm" className="h-auto min-h-10 whitespace-normal" onClick={()=>{setOpen(false);navigate(studentDocumentsPath());}}>Все документы ученика</Button>
        </div>}
        {feedError?<div role="alert" className="p-4 text-sm"><p>Не удалось загрузить уведомления.</p><Button variant="outline" size="sm" onClick={()=>setFeedRevision(value=>value+1)}>Повторить загрузку уведомлений</Button></div>:loading ? (
          <div className="flex items-center justify-center py-12"><SigmaSpinner /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{inbox.pendingCount>0||inbox.error?'Других уведомлений нет':'Нет уведомлений'}</p>
            <p className="text-xs mt-1 opacity-70">Здесь появятся напоминания, оценки и документы на подтверждение</p>
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
