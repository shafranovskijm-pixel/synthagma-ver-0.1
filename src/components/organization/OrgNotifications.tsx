import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { getCourseDetailsPath } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { isCurrentOrganizationAccess } from "@/hooks/useDocumentActionPermissions";
import { useRtnPersonalNotifications } from "@/hooks/useRtnPersonalNotifications";
import { RtnPersonalBellItems } from "./rtn/RtnPersonalBellItems";

import { handleNotificationClick } from "@/lib/notifications/orgNotificationClick";
import {
  Bell,
  Video,
  Shield,
  FileText,
  CheckCheck,
  CheckCircle2,
  CreditCard,
  ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger } from "@/components/ui/popover";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  related_id: string | null;
  /** Ученик, к которому относится уведомление (для course_completed — завершивший курс). */
  user_id?: string | null;
}

interface OrgNotificationsProps {
  organizationId: string;
}

type TabKey = "all" | "tasks" | "payments" | "rtn";

const TASK_TYPES = ["video_identification", "consent_signed", "document_issued", "assignment", "task", "course_completed"];
const PAYMENT_TYPES = ["payment", "course_payment", "subscription", "subscription_expiry", "order"];

function getFilteredNotifications(notifications: Notification[], tab: TabKey) {
  if (tab === "all") return notifications;
  if (tab === "rtn") return [];
  if (tab === "tasks") return notifications.filter(n => TASK_TYPES.some(t => n.type.includes(t)));
  return notifications.filter(n => PAYMENT_TYPES.some(t => n.type.includes(t)));
}


function getInitials(title: string) {
  const words = title.split(" ").filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0]?.[0] || "?").toUpperCase();
}

const AVATAR_COLORS = [
  "bg-primary/20 text-primary",
  "bg-blue-500/20 text-blue-600",
  "bg-orange-500/20 text-orange-600",
  "bg-green-500/20 text-green-600",
  "bg-purple-500/20 text-purple-600",
  "bg-rose-500/20 text-rose-600",
];

function getAvatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function OrgNotifications({ organizationId }: OrgNotificationsProps) {
  const auth = useAuth(), permissions = useStaffPermissions();
  const actorId = !auth.loading ? auth.user?.id ?? null : null;
  const personalEnabled = !!actorId && isCurrentOrganizationAccess(permissions, organizationId) && permissions.canSeeOrgTab("courses") && permissions.can("courses.read");
  return <OrgNotificationsContent key={`${actorId}:${organizationId}:${personalEnabled}`} organizationId={organizationId} actorId={actorId} personalEnabled={personalEnabled} />;
}

function OrgNotificationsContent({ organizationId, actorId, personalEnabled }: OrgNotificationsProps & { actorId: string | null; personalEnabled: boolean }) {
  const navigate = useNavigate();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const personal = useRtnPersonalNotifications({ organizationId, actorId: actorId || "" }, personalEnabled, isOpen);

  // Load sound preference
  useEffect(() => {
    let active = true;
    const loadSoundPref = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;
      const { data } = await supabase
        .from("notification_preferences")
        .select("enabled")
        .eq("user_id", user.id)
        .eq("notification_type", "sound")
        .eq("channel", "platform")
        .maybeSingle();
      if (data && active) setSoundEnabled(data.enabled ?? false);
    };
    loadSoundPref();
    return () => { active = false; };
  }, []);

  const playNotificationSound = () => {
    if (!soundEnabled) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.setValueAtTime(600, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch {
      // AudioContext may be blocked
    }
  };

  useEffect(() => {
    if (organizationId && actorId) {
      loadNotifications();
      const channel = supabase
        .channel(`org_notifications-${Date.now()}-${Math.random().toString(36).slice(2,8)}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'org_notifications',
          filter: `organization_id=eq.${organizationId}` }, (payload) => {
          const incoming = payload.new as Notification;
          if (!mounted.current) return;
          setNotifications(prev => {
            if (prev.some(n => n.id === incoming.id)) return prev;
            return [incoming, ...prev];
          });
          playNotificationSound();
        })
        .subscribe();
      return () => { try { supabase.removeChannel(channel); } catch { /* ignore */ } };
    }
  }, [organizationId, actorId, soundEnabled]);

  const loadNotifications = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("org_notifications")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      if (mounted.current) setNotifications(data || []);
    } catch (error) {
      console.error("Error loading notifications:", error);
      if (mounted.current) { setNotifications([]); setLoadError(error instanceof Error ? error.message : "Не удалось загрузить уведомления"); }
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    const { error } = await supabase.from("org_notifications").update({ is_read: true }).eq("id", id);
    if (error) {
      console.error("Error marking as read:", error);
      toast.error("Не удалось отметить как прочитанное");
      // Не маскируем локально как прочитанное и сообщаем вызывающему коду об ошибке.
      throw error;
    }
    if (mounted.current) setNotifications(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const markAllAsRead = async () => {
    const unreadIds = getFilteredNotifications(notifications, activeTab).filter(n => !n.is_read).map(n => n.id);
    const ownEventIds = (activeTab === "all" || activeTab === "rtn") ? personal.data?.items.filter(n => n.read_at === null).map(n => n.event.id) ?? [] : [];
    if (ownEventIds.length) { try { await personal.mark(ownEventIds); } catch { toast.error("Не удалось прочитать личные уведомления Ростехнадзора"); } }
    if (!mounted.current) return;
    if (unreadIds.length === 0) return;
    const { error } = await supabase.from("org_notifications").update({ is_read: true }).in("id", unreadIds);
    if (error) {
      console.error("Error marking all as read:", error);
      toast.error("Не удалось отметить все как прочитанные");
      return;
    }
    if (mounted.current) setNotifications(prev => prev.map(n => unreadIds.includes(n.id) ? { ...n, is_read: true } : n));
  };


  const orgUnreadCount = notifications.filter(n => !n.is_read).length;
  const unreadCount = orgUnreadCount + (personal.data?.unread_count ?? 0);
  const ownUnconfirmed = personalEnabled && (!personal.data || !!personal.error);
  const incomplete = ownUnconfirmed || personal.data?.materialization_pending === true;

  const filtered = useMemo(() => getFilteredNotifications(notifications, activeTab), [notifications, activeTab]);

  const tabCounts = useMemo(() => ({
    all: unreadCount,
    tasks: getFilteredNotifications(notifications, "tasks").filter(n => !n.is_read).length,
    payments: getFilteredNotifications(notifications, "payments").filter(n => !n.is_read).length,
    rtn: personal.data?.unread_count ?? 0 }), [notifications, unreadCount, personal.data]);
  const shownUnread = filtered.some(n => !n.is_read) || (activeTab === "all" || activeTab === "rtn") && personal.data?.items.some(n => n.read_at === null);

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "all", label: "Все", icon: <Bell className="w-3.5 h-3.5" /> },
    { key: "tasks", label: "Задания", icon: <ClipboardList className="w-3.5 h-3.5" /> },
    { key: "payments", label: "Оплаты", icon: <CreditCard className="w-3.5 h-3.5" /> },
    ...(personalEnabled ? [{ key: "rtn" as const, label: "Ростехнадзор", icon: <Shield className="w-3.5 h-3.5" /> }] : []),
  ];

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Уведомления об обучении${incomplete ? ", число личных уведомлений Ростехнадзора ещё не подтверждено полностью" : ""}`} className="relative rounded-full h-10 w-10">
          <Bell className="w-5 h-5" />
          {(unreadCount > 0 || incomplete) && (
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount > 0 ? `${unreadCount}${incomplete ? "+" : ""}` : "?"}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] max-w-[calc(100vw-1.5rem)] max-h-[calc(100dvh-4rem)] overflow-y-auto p-0 rounded-2xl" align="end" sideOffset={8}>
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-2">
          <h3 className="font-bold text-lg">Уведомления об обучении</h3>
          {shownUnread && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto min-h-10 px-2 text-xs gap-1.5 whitespace-normal"
              onClick={markAllAsRead}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Прочитать показанные
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div role="group" aria-label="Разделы уведомлений" className="flex min-w-0 gap-1.5 overflow-x-auto px-5 pb-3">
          {tabs.map(tab => {
            const count = tabCounts[tab.key];
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                aria-pressed={isActive}
                className={`flex min-h-10 shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {tab.icon}
                {tab.label}
                {count > 0 && (
                  <span className={`ml-0.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center ${
                    isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/15 text-primary"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="border-t border-border" />

        {/* Content */}
        {personalEnabled && activeTab === "all" && <p className="px-5 pt-3 text-xs font-semibold text-muted-foreground">Уведомления организации</p>}
        {activeTab !== "rtn" && (isLoading ? (
          <div className="flex items-center justify-center py-12">
            <SigmaSpinner />
          </div>
        ) : loadError ? (
          <div className="text-center py-12 text-muted-foreground">
            <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm mb-3">Не удалось загрузить уведомления</p>
            <Button variant="outline" size="sm" onClick={loadNotifications}>Повторить</Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{personalEnabled ? "Нет уведомлений организации в этом списке" : "Нет уведомлений"}</p>
          </div>
        ) : (
          <ScrollArea className="h-80">
            <div className="divide-y divide-border">
              {filtered.map((n) => (
                <button
                  type="button"
                  key={n.id}
                  className={`block min-h-10 w-full px-5 py-3.5 text-left hover:bg-muted/50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${!n.is_read ? "bg-primary/5" : ""}`}
                  onClick={() => {
                    // Навигация выполняется сразу; markAsRead — best-effort и не блокирует переход.
                    handleNotificationClick(n, {
                      navigate,
                      markAsRead,
                      close: () => setIsOpen(false),
                      courseFallbackPath: getCourseDetailsPath,
                      setSessionItem: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } },
                      onMarkError: () => { /* уже показан toast в markAsRead */ },
                    });
                  }}
                >

                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${getAvatarColor(n.id)}`}>
                      {getInitials(n.title)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{n.title}</span>
                        {!n.is_read && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                      {n.type === "course_completed" && (
                        <p className="text-xs text-primary font-medium mt-1">Открыть карточку ученика</p>
                      )}
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        {format(new Date(n.created_at), "d MMM, HH:mm", { locale: ru })}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        ))}

        {personalEnabled && (activeTab === "all" || activeTab === "rtn") && <RtnPersonalBellItems {...personal} openEvent={(eventId, href, unread) => {
          navigate(href); setIsOpen(false);
          if (unread) void personal.mark([eventId]).catch(() => toast.error("Не удалось прочитать личное уведомление Ростехнадзора"));
        }} />}

        {/* Footer */}
        {shownUnread && (
          <>
            <div className="border-t border-border" />
            <div className="px-5 py-3 flex justify-center">
              <button
                onClick={markAllAsRead}
                className="min-h-10 text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1.5 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Прочитать показанные уведомления
              </button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
