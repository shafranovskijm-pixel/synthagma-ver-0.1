import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, ExternalLink, RefreshCw, ChevronDown, ChevronUp, Clock, User, Globe, AlertTriangle } from "lucide-react";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";

interface SupportRequest {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  user_role: string | null;
  organization_id: string | null;
  description: string;
  screenshot_url: string | null;
  browser_info: string | null;
  page_url: string | null;
  error_logs: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
}

const statusColors: Record<string, string> = {
  new: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  resolved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  closed: "bg-muted text-muted-foreground",
};

const statusLabels: Record<string, string> = {
  new: "Новое",
  in_progress: "В работе",
  resolved: "Решено",
  closed: "Закрыто",
};

const roleLabels: Record<string, string> = {
  student: "Ученик",
  organization: "Организация",
  admin: "Админ",
};

export function SupportRequestsManager() {
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});

  const fetchRequests = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("support_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (filterStatus !== "all") {
        query = query.eq("status", filterStatus);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRequests((data as SupportRequest[]) || []);
    } catch (err) {
      console.error("Failed to fetch support requests:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [filterStatus]);

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("support_requests")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
      toast.success("Статус обновлён");
    } catch {
      toast.error("Ошибка обновления");
    }
  };

  const saveNotes = async (id: string) => {
    try {
      const { error } = await supabase
        .from("support_requests")
        .update({ admin_notes: editingNotes[id] || "", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      setRequests(prev => prev.map(r => r.id === id ? { ...r, admin_notes: editingNotes[id] || "" } : r));
      toast.success("Заметка сохранена");
    } catch {
      toast.error("Ошибка сохранения");
    }
  };

  const newCount = requests.filter(r => r.status === "new").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold font-display">Обращения в поддержку</h2>
          <p className="text-sm text-muted-foreground">
            {requests.length} обращений{newCount > 0 && `, ${newCount} новых`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="new">Новые</SelectItem>
              <SelectItem value="in_progress">В работе</SelectItem>
              <SelectItem value="resolved">Решённые</SelectItem>
              <SelectItem value="closed">Закрытые</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchRequests} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading && requests.length === 0 && (
        <TableSkeleton rows={4} cols={4} withHeader={false} />
      )}

      {requests.length === 0 && !loading && (
        <EmptyState
          icon={MessageSquare}
          title="Нет обращений"
          description="Здесь появятся заявки и сообщения от пользователей платформы."
        />
      )}

      <div className="space-y-3">
        {requests.map(req => {
          const isExpanded = expandedId === req.id;
          return (
            <Card key={req.id} className="overflow-hidden">
              <div
                className="flex items-center gap-3 p-4 cursor-pointer hover:bg-secondary/30 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : req.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{req.user_name || "—"}</span>
                    <Badge variant="outline" className="text-xs">
                      {roleLabels[req.user_role || ""] || req.user_role}
                    </Badge>
                    <Badge className={`text-xs ${statusColors[req.status]}`}>
                      {statusLabels[req.status] || req.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-1">
                    {req.description.slice(0, 100)}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
                  <Clock className="w-3 h-3" />
                  {format(new Date(req.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-border p-4 space-y-4 bg-secondary/10">
                  {/* Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Email:</span>
                      <span>{req.user_email || "—"}</span>
                    </div>
                    {req.organization_id && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Орг ID:</span>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{req.organization_id}</code>
                      </div>
                    )}
                    {req.page_url && (
                      <div className="flex items-center gap-2 col-span-full">
                        <Globe className="w-4 h-4 text-muted-foreground" />
                        <a href={req.page_url} target="_blank" rel="noopener" className="text-primary hover:underline truncate">
                          {req.page_url}
                        </a>
                        <ExternalLink className="w-3 h-3" />
                      </div>
                    )}
                    {req.browser_info && (
                      <div className="col-span-full text-xs text-muted-foreground">
                        🌐 {req.browser_info}
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <h4 className="text-sm font-medium mb-1">Описание проблемы</h4>
                    <p className="text-sm whitespace-pre-wrap bg-background rounded-lg p-3 border">{req.description}</p>
                  </div>

                  {/* Errors */}
                  {req.error_logs && req.error_logs !== "Нет" && (
                    <div>
                      <h4 className="text-sm font-medium mb-1 flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                        Ошибки клиента
                      </h4>
                      <pre className="text-xs bg-background rounded-lg p-3 border overflow-x-auto">{req.error_logs}</pre>
                    </div>
                  )}

                  {/* Screenshot */}
                  {req.screenshot_url && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">Скриншот</h4>
                      <a href={req.screenshot_url} target="_blank" rel="noopener">
                        <img src={req.screenshot_url} alt="Скриншот" className="max-h-48 rounded-lg border" />
                      </a>
                    </div>
                  )}

                  {/* Admin actions */}
                  <div className="flex items-center gap-3 pt-2 border-t">
                    <Select value={req.status} onValueChange={(v) => updateStatus(req.id, v)}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">Новое</SelectItem>
                        <SelectItem value="in_progress">В работе</SelectItem>
                        <SelectItem value="resolved">Решено</SelectItem>
                        <SelectItem value="closed">Закрыто</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Admin notes */}
                  <div>
                    <h4 className="text-sm font-medium mb-1">Заметка администратора</h4>
                    <Textarea
                      value={editingNotes[req.id] ?? req.admin_notes ?? ""}
                      onChange={(e) => setEditingNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                      placeholder="Внутренняя заметка..."
                      className="text-sm min-h-[60px]"
                    />
                    <Button size="sm" className="mt-2" onClick={() => saveNotes(req.id)}>
                      Сохранить заметку
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
