import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
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
}

interface OrgNotificationsProps {
  organizationId: string;
}

type TabKey = "all" | "tasks" | "payments";

const TASK_TYPES = ["video_identification", "consent_signed", "document_issued", "assignment", "task"];
const PAYMENT_TYPES = ["payment", "course_payment", "subscription", "subscription_expiry", "order"];

function getFilteredNotifications(notifications: Notification[], tab: TabKey) {
  if (tab === "all") return notifications;
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
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [soundEnabled, setSoundEnabled] = useState(false);

  // Load sound preference
  useEffect(() => {
    const loadSoundPref = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("notification_preferences")
        .select("enabled")
        .eq("user_id", user.id)
        .eq("notification_type", "sound")
        .eq("channel", "platform")
        .maybeSingle();
      if (data) setSoundEnabled(data.enabled ?? false);
    };
    loadSoundPref();
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
    if (organizationId) {
      loadNotifications();
      const channel = supabase
        .channel('org_notifications')
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'org_notifications',
          filter: `organization_id=eq.${organizationId}` }, (payload) => {
          setNotifications(prev => [payload.new as Notification, ...prev]);
          playNotificationSound();
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [organizationId, soundEnabled]);

  const loadNotifications = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("org_notifications")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error("Error loading notifications:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await supabase.from("org_notifications").update({ is_read: true }).eq("id", id);
      setNotifications(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)));
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;
    try {
      await supabase.from("org_notifications").update({ is_read: true }).in("id", unreadIds);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const filtered = useMemo(() => getFilteredNotifications(notifications, activeTab), [notifications, activeTab]);

  const tabCounts = useMemo(() => ({
    all: notifications.filter(n => !n.is_read).length,
    tasks: getFilteredNotifications(notifications, "tasks").filter(n => !n.is_read).length,
    payments: getFilteredNotifications(notifications, "payments").filter(n => !n.is_read).length }), [notifications]);

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "all", label: "Все", icon: <Bell className="w-3.5 h-3.5" /> },
    { key: "tasks", label: "Задания", icon: <ClipboardList className="w-3.5 h-3.5" /> },
    { key: "payments", label: "Оплаты", icon: <CreditCard className="w-3.5 h-3.5" /> },
  ];

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full h-10 w-10">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0 rounded-2xl" align="end" sideOffset={8}>
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-2">
          <h3 className="font-bold text-lg">Уведомления</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1.5"
              onClick={markAllAsRead}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Отметить все
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 px-5 pb-3">
          {tabs.map(tab => {
            const count = tabCounts[tab.key];
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
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
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <SigmaSpinner />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Нет уведомлений</p>
          </div>
        ) : (
          <ScrollArea className="h-80">
            <div className="divide-y divide-border">
              {filtered.map((n) => (
                <div
                  key={n.id}
                  className={`px-5 py-3.5 hover:bg-muted/50 transition-colors cursor-pointer ${!n.is_read ? "bg-primary/5" : ""}`}
                  onClick={() => {
                    markAsRead(n.id);
                    if (n.type === "subscription_expiry" && n.related_id) {
                      setIsOpen(false);
                      navigate(`/invoice/${n.related_id}`);
                    } else if (n.type === "signature" && n.related_id) {
                      setIsOpen(false);
                      // CounterpartiesSection reads this on mount to expand the right contract
                      sessionStorage.setItem("openSignatureId", n.related_id);
                      navigate(`/organization?tab=org-documents`);
                    }
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
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        {format(new Date(n.created_at), "d MMM, HH:mm", { locale: ru })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Footer */}
        {unreadCount > 0 && (
          <>
            <div className="border-t border-border" />
            <div className="px-5 py-3 flex justify-center">
              <button
                onClick={markAllAsRead}
                className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1.5 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Отметить все как прочитанные
              </button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
