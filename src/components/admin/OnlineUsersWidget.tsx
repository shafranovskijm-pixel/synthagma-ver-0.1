import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Wifi, WifiOff, Clock, Users, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface UserVisit {
  user_id: string;
  full_name: string | null;
  email: string | null;
  last_visit_at: string | null;
  organization_id: string | null;
}

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export function OnlineUsersWidget() {
  const [users, setUsers] = useState<UserVisit[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, last_visit_at, organization_id")
      .not("last_visit_at", "is", null)
      .order("last_visit_at", { ascending: false })
      .limit(50);
    setUsers(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
    // visibility-aware: не дёргаем сервер, когда вкладка в фоне
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchUsers();
    }, 60000); // refresh every 60s
    const onVisible = () => { if (document.visibilityState === 'visible') fetchUsers(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const now = new Date();
  const onlineUsers = users.filter(
    (u) => u.last_visit_at && now.getTime() - new Date(u.last_visit_at).getTime() < ONLINE_THRESHOLD_MS
  );
  const recentUsers = users.filter(
    (u) => u.last_visit_at && now.getTime() - new Date(u.last_visit_at).getTime() >= ONLINE_THRESHOLD_MS
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Wifi className="w-5 h-5 text-green-500" />
              Онлайн сейчас
              <Badge variant="secondary" className="ml-1 bg-green-500/10 text-green-600 border-green-500/30">
                {onlineUsers.length}
              </Badge>
            </CardTitle>
            <CardDescription>Активность пользователей (порог: 5 мин)</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={fetchUsers} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-80">
          {onlineUsers.length > 0 && (
            <div className="space-y-2 mb-4">
              {onlineUsers.map((u) => (
                <UserRow key={u.user_id} user={u} isOnline />
              ))}
            </div>
          )}
          {onlineUsers.length === 0 && (
            <p className="text-sm text-muted-foreground mb-4">Нет пользователей онлайн</p>
          )}

          {recentUsers.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Последние визиты
              </p>
              <div className="space-y-2">
                {recentUsers.slice(0, 20).map((u) => (
                  <UserRow key={u.user_id} user={u} isOnline={false} />
                ))}
              </div>
            </>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function UserRow({ user, isOnline }: { user: UserVisit; isOnline: boolean }) {
  const timeAgo = user.last_visit_at
    ? formatDistanceToNow(new Date(user.last_visit_at), { addSuffix: true, locale: ru })
    : "—";

  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <div className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? "bg-green-500 animate-pulse" : "bg-muted-foreground/30"}`} />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {user.full_name || user.email || "Без имени"}
          </p>
          {user.full_name && user.email && (
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          )}
        </div>
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">{timeAgo}</span>
    </div>
  );
}
