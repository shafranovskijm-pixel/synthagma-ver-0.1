import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Wifi, Clock, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { RoleBadge } from "./analytics/RoleBadge";

interface UserVisit {
  user_id: string;
  full_name: string | null;
  email: string | null;
  login: string | null;
  last_visit_at: string | null;
  organization_id: string | null;
  orgName: string | null;
  role: string | null;
}

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

export function OnlineUsersWidget() {
  const [users, setUsers] = useState<UserVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchUsers = async () => {
    setLoading(true);
    const [profilesRes, rolesRes, orgsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, full_name, email, login, last_visit_at, organization_id")
        .not("last_visit_at", "is", null)
        .order("last_visit_at", { ascending: false })
        .limit(200),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("organizations").select("id, name"),
    ]);

    const orgs = new Map<string, string>();
    (orgsRes.data || []).forEach((o: any) => orgs.set(o.id, o.name));

    const rolePriority: Record<string, number> = { admin: 5, organization: 4, company: 3, sales_manager: 2, student: 1 };
    const rolesByUser = new Map<string, string>();
    ((rolesRes.data || []) as { user_id: string; role: string }[]).forEach(r => {
      const cur = rolesByUser.get(r.user_id);
      if (!cur || (rolePriority[r.role] || 0) > (rolePriority[cur] || 0)) rolesByUser.set(r.user_id, r.role);
    });

    setUsers(((profilesRes.data || []) as any[]).map(p => ({
      user_id: p.user_id,
      full_name: p.full_name,
      email: p.email,
      login: p.login,
      last_visit_at: p.last_visit_at,
      organization_id: p.organization_id,
      orgName: p.organization_id ? orgs.get(p.organization_id) || null : null,
      role: rolesByUser.get(p.user_id) || null,
    })));
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchUsers();
    }, 60000);
    const onVisible = () => { if (document.visibilityState === 'visible') fetchUsers(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const now = new Date();
  const q = search.trim().toLowerCase();
  const match = (u: UserVisit) => !q
    || (u.full_name || "").toLowerCase().includes(q)
    || (u.email || "").toLowerCase().includes(q)
    || (u.login || "").toLowerCase().includes(q)
    || (u.orgName || "").toLowerCase().includes(q)
    || (u.role || "").toLowerCase().includes(q);

  const filtered = users.filter(match);
  const onlineUsers = filtered.filter(
    (u) => u.last_visit_at && now.getTime() - new Date(u.last_visit_at).getTime() < ONLINE_THRESHOLD_MS
  );
  const recentUsers = filtered.filter(
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
            <CardDescription>Кто на платформе прямо сейчас и последние заходы (порог онлайн — 5 мин)</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={fetchUsers} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Поиск: имя, email, организация, роль..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[420px] pr-2">
          {onlineUsers.length > 0 ? (
            <div className="space-y-1.5 mb-4">
              {onlineUsers.map((u) => <UserRow key={u.user_id} user={u} isOnline />)}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mb-4">Нет пользователей онлайн</p>
          )}

          {recentUsers.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Последние визиты · всего {recentUsers.length}
              </p>
              <div className="space-y-1.5">
                {recentUsers.map((u) => <UserRow key={u.user_id} user={u} isOnline={false} />)}
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
    <div className="flex items-start justify-between gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors">
      <div className="flex items-start gap-2 min-w-0 flex-1">
        <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${isOnline ? "bg-green-500 animate-pulse" : "bg-muted-foreground/30"}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium truncate">{user.full_name || user.email || user.login || "Без имени"}</p>
            <RoleBadge role={user.role} />
          </div>
          <p className="text-[11px] text-muted-foreground truncate">
            {user.orgName ? `${user.orgName} · ` : ""}{user.email || user.login || ""}
          </p>
        </div>
      </div>
      <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">{timeAgo}</span>
    </div>
  );
}
