import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { History } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface RoleAuditEntry {
  id: string;
  action: string;
  performed_by: string | null;
  performed_by_name: string | null;
  target_user_id: string | null;
  target_email: string | null;
  target_name: string | null;
  scope: string;
  organization_id: string | null;
  company_id: string | null;
  old_role: string | null;
  new_role: string | null;
  details: any;
  created_at: string;
}

interface RoleAuditLogProps {
  scope: "admin" | "organization";
  organizationId?: string;
  limit?: number;
}

const ACTION_LABELS: Record<string, { label: string; tone: string }> = {
  granted: { label: "Назначен", tone: "bg-emerald-500/10 text-emerald-600" },
  changed: { label: "Изменена роль", tone: "bg-blue-500/10 text-blue-600" },
  revoked: { label: "Удалён", tone: "bg-destructive/10 text-destructive" },
  invited: { label: "Приглашён", tone: "bg-amber-500/10 text-amber-600" },
  accepted: { label: "Принято", tone: "bg-primary/10 text-primary" },
};

export function RoleAuditLog({ scope, organizationId, limit = 50 }: RoleAuditLogProps) {
  const [entries, setEntries] = useState<RoleAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      let q = supabase
        .from("role_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      q = q.eq("scope", scope);
      if (scope === "organization" && organizationId) {
        q = q.eq("organization_id", organizationId);
      }
      const { data } = await q;
      setEntries((data as any[]) || []);
      setLoading(false);
    };
    load();
  }, [scope, organizationId, limit]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <History className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-semibold">Журнал изменений ролей</h3>
      </div>
      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Действие</TableHead>
              <TableHead>Сотрудник</TableHead>
              <TableHead>Роль</TableHead>
              <TableHead>Кем</TableHead>
              <TableHead>Когда</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6">
                  <SigmaSpinner size="sm" />
                </TableCell>
              </TableRow>
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Записей нет
                </TableCell>
              </TableRow>
            ) : entries.map(e => {
              const cfg = ACTION_LABELS[e.action] || { label: e.action, tone: "bg-muted text-muted-foreground" };
              return (
                <TableRow key={e.id}>
                  <TableCell>
                    <Badge variant="outline" className={cfg.tone}>{cfg.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{e.target_name || e.target_email || "—"}</div>
                    {e.target_email && e.target_name && (
                      <div className="text-xs text-muted-foreground">{e.target_email}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {e.old_role && e.new_role && e.old_role !== e.new_role ? (
                      <span className="text-muted-foreground">
                        <span className="line-through">{e.old_role}</span> → <strong className="text-foreground">{e.new_role}</strong>
                      </span>
                    ) : (
                      <span>{e.new_role || e.old_role || "—"}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.performed_by_name || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(e.created_at), { addSuffix: true, locale: ru })}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
