import { useState, useEffect } from "react";
import { ClipboardList, Search, Clock, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { ChatAvatar } from "./ChatAvatar";

interface RequestItem {
  id: string;
  type: "enrollment" | "company";
  title: string;
  description?: string;
  status: string;
  createdAt: string;
  userName?: string;
  courseName?: string;
}

interface ChatRequestsPanelProps {
  role: "admin" | "organization" | "student";
  organizationId?: string;
  userId?: string;
}

export function ChatRequestsPanel({ role, organizationId, userId }: ChatRequestsPanelProps) {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  useEffect(() => {
    loadRequests();
  }, [role, organizationId, userId]);

  const loadRequests = async () => {
    setLoading(true);
    const items: RequestItem[] = [];

    // Load enrollment requests
    try {
      let enrollQuery = supabase
        .from("enrollment_requests")
        .select("id, course_id, status, created_at, user_id")
        .order("created_at", { ascending: false })
        .limit(100);

      const { data: enrollments } = await enrollQuery;

      for (const er of enrollments || []) {
        // Get user name
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", er.user_id)
          .maybeSingle();

        // Get course name
        const { data: course } = await supabase
          .from("courses")
          .select("title")
          .eq("id", er.course_id)
          .maybeSingle();

        items.push({
          id: er.id,
          type: "enrollment",
          title: `Заявка на запись`,
          description: course?.title || "",
          status: er.status,
          createdAt: er.created_at,
          userName: profile?.full_name || "Без имени",
          courseName: course?.title,
        });
      }
    } catch (err) {
      console.error("Error loading enrollment requests:", err);
    }

    // Load company requests
    try {
      let companyQuery = supabase
        .from("company_requests")
        .select("id, title, description, status, created_at, company_id")
        .order("created_at", { ascending: false })
        .limit(100);

      if (organizationId) {
        companyQuery = companyQuery.eq("organization_id", organizationId);
      }

      const { data: companyReqs } = await companyQuery;

      for (const cr of companyReqs || []) {
        items.push({
          id: cr.id,
          type: "company",
          title: cr.title,
          description: cr.description || "",
          status: cr.status,
          createdAt: cr.created_at,
        });
      }
    } catch (err) {
      console.error("Error loading company requests:", err);
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setRequests(items);
    setLoading(false);
  };

  const filtered = requests.filter(r => {
    if (filter !== "all" && r.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        r.userName?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const statusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Clock className="w-3.5 h-3.5 text-amber-500" />;
      case "approved": return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
      case "rejected": return <XCircle className="w-3.5 h-3.5 text-destructive" />;
      default: return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "pending": return "Ожидает";
      case "approved": return "Одобрена";
      case "rejected": return "Отклонена";
      default: return status;
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><SigmaSpinner /></div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск заявок..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "pending", "approved", "rejected"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary/50"
              }`}
            >
              {f === "all" ? "Все" : statusLabel(f)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Нет заявок</p>
          </div>
        ) : (
          filtered.map(req => (
            <div
              key={req.id}
              className="px-4 py-3 border-b border-border/50 hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-start gap-3">
                <ChatAvatar name={req.userName || req.title} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{req.userName || req.title}</span>
                    <Badge variant={req.type === "enrollment" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 shrink-0">
                      {req.type === "enrollment" ? "Запись" : "Компания"}
                    </Badge>
                  </div>
                  {req.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{req.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {statusIcon(req.status)}
                    <span className="text-[11px] text-muted-foreground">{statusLabel(req.status)}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {format(new Date(req.createdAt), "dd.MM.yy HH:mm", { locale: ru })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
