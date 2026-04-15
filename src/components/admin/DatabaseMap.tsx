import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, GraduationCap, Briefcase, FileText, BookOpen, Library, HardHat, ShoppingCart, Settings, MoreHorizontal, ArrowRight, RefreshCw, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface TableGroup {
  name: string;
  icon: React.ReactNode;
  color: string;
  tables: string[];
  connections: string[]; // connected group names
}

const TABLE_GROUPS: TableGroup[] = [
  {
    name: "Организации",
    icon: <Building2 className="w-4 h-4" />,
    color: "hsl(var(--primary))",
    tables: [
      "organizations", "organization_credentials", "organization_comments",
      "organization_features", "organization_feature_categories",
      "organization_feature_usage", "organization_offer_acceptances",
      "organization_reminders", "org_notifications", "org_documents"
    ],
    connections: ["Пользователи", "Курсы", "Компании", "Документы"]
  },
  {
    name: "Пользователи",
    icon: <Users className="w-4 h-4" />,
    color: "#8b5cf6",
    tables: ["profiles", "user_roles", "user_achievements", "achievements"],
    connections: ["Организации", "Курсы"]
  },
  {
    name: "Курсы",
    icon: <GraduationCap className="w-4 h-4" />,
    color: "#0ea5e9",
    tables: [
      "courses", "lessons", "test_questions", "course_categories",
      "enrollments", "enrollment_history", "lesson_progress",
      "test_attempts", "course_reminders", "course_documents"
    ],
    connections: ["Организации", "Пользователи", "Документы"]
  },
  {
    name: "Компании",
    icon: <Briefcase className="w-4 h-4" />,
    color: "#f59e0b",
    tables: ["companies", "company_documents", "registration_links"],
    connections: ["Организации"]
  },
  {
    name: "Документы",
    icon: <FileText className="w-4 h-4" />,
    color: "#ef4444",
    tables: [
      "student_documents", "consent_documents",
      "student_identity_documents", "student_frdo_data",
      "document_issuance_log", "education_document_records", "student_consents"
    ],
    connections: ["Курсы", "Организации"]
  },
  {
    name: "Журналы",
    icon: <BookOpen className="w-4 h-4" />,
    color: "#14b8a6",
    tables: ["journal_instances", "journal_entries", "audit_logs"],
    connections: ["Организации", "Курсы"]
  },
  {
    name: "Библиотека",
    icon: <Library className="w-4 h-4" />,
    color: "#6366f1",
    tables: ["library_folders", "library_documents"],
    connections: ["Организации"]
  },
  {
    name: "Охрана труда",
    icon: <HardHat className="w-4 h-4" />,
    color: "#f97316",
    tables: ["labor_safety_groups", "labor_safety_records", "labor_safety_profiles"],
    connections: ["Организации"]
  },
  {
    name: "Маркетплейс",
    icon: <ShoppingCart className="w-4 h-4" />,
    color: "#ec4899",
    tables: ["marketplace_courses", "marketplace_orders", "course_requests", "service_orders"],
    connections: ["Организации", "Курсы"]
  },
  {
    name: "Система",
    icon: <Settings className="w-4 h-4" />,
    color: "#64748b",
    tables: [
      "system_settings", "system_features", "system_feature_categories",
      "system_patches", "system_diagnostics", "promo_codes", "landing_content",
      "blog_posts"
    ],
    connections: []
  },
  {
    name: "Прочее",
    icon: <MoreHorizontal className="w-4 h-4" />,
    color: "#a1a1aa",
    tables: [
      "newsletter_subscribers", "testimonials", "chat_messages",
      "video_identifications", "program_categories", "program_documents",
      "program_folders", "student_groups", "organization_usage", "plan_requests"
    ],
    connections: ["Организации"]
  }
];

export function DatabaseMap() {
  const [tableCounts, setTableCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);

  const getConnectedGroups = (groupName: string): Set<string> => {
    const connected = new Set<string>();
    TABLE_GROUPS.forEach(g => {
      if (g.name === groupName) {
        g.connections.forEach(c => connected.add(c));
      } else if (g.connections.includes(groupName)) {
        connected.add(g.name);
      }
    });
    return connected;
  };

  const isHighlighted = (groupName: string): boolean => {
    if (!hoveredGroup) return false;
    if (groupName === hoveredGroup) return true;
    return getConnectedGroups(hoveredGroup).has(groupName);
  };

  const isDimmed = (groupName: string): boolean => {
    if (!hoveredGroup) return false;
    return !isHighlighted(groupName);
  };

  const fetchCounts = async () => {
    setLoading(true);
    const allTables = TABLE_GROUPS.flatMap(g => g.tables);
    const counts: Record<string, number> = {};

    // Fetch counts in batches
    const promises = allTables.map(async (table) => {
      try {
        const { count, error } = await supabase
          .from(table as any)
          .select("*", { count: "exact", head: true });
        counts[table] = error ? -1 : (count || 0);
      } catch {
        counts[table] = -1;
      }
    });

    await Promise.all(promises);
    setTableCounts(counts);
    setLoading(false);
  };

  useEffect(() => {
    fetchCounts();
  }, []);

  const totalTables = TABLE_GROUPS.reduce((acc, g) => acc + g.tables.length, 0);

  const handleExportJSON = () => {
    const exportData = {
      exportDate: new Date().toISOString().split("T")[0],
      totalTables,
      totalGroups: TABLE_GROUPS.length,
      groups: TABLE_GROUPS.map(g => ({
        name: g.name,
        tables: g.tables,
        counts: Object.fromEntries(g.tables.map(t => [t, tableCounts[t] ?? null])),
        connections: g.connections })) };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `db-map-${exportData.exportDate}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Карта БД экспортирована");
  };

  const totalRecords = Object.values(tableCounts).reduce((a, c) => a + (c > 0 ? c : 0), 0);
  const largestGroup = TABLE_GROUPS.reduce((a, g) => {
    const cnt = g.tables.reduce((s, t) => s + (tableCounts[t] > 0 ? tableCounts[t] : 0), 0);
    return cnt > a.count ? { name: g.name, count: cnt } : a;
  }, { name: "", count: 0 });

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <div className="text-lg font-mono font-bold text-foreground">{totalTables}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Таблиц</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <div className="text-lg font-mono font-bold text-foreground">{TABLE_GROUPS.length}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Групп</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <div className="text-lg font-mono font-bold text-foreground">{loading ? "..." : totalRecords.toLocaleString()}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Записей</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <div className="text-lg font-mono font-bold text-primary truncate">{loading ? "..." : largestGroup.name || "—"}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Крупнейшая</div>
        </div>
      </div>

      {/* Size Distribution */}
      {!loading && totalRecords > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Распределение данных</h4>
          <div className="flex h-3 rounded-full overflow-hidden bg-secondary">
            {TABLE_GROUPS.map((group) => {
              const cnt = group.tables.reduce((s, t) => s + (tableCounts[t] > 0 ? tableCounts[t] : 0), 0);
              const pct = totalRecords > 0 ? (cnt / totalRecords) * 100 : 0;
              if (pct < 0.5) return null;
              return (
                <div
                  key={group.name}
                  className="h-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: group.color }}
                  title={`${group.name}: ${cnt.toLocaleString()} (${Math.round(pct)}%)`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {TABLE_GROUPS.map((group) => {
              const cnt = group.tables.reduce((s, t) => s + (tableCounts[t] > 0 ? tableCounts[t] : 0), 0);
              if (cnt === 0) return null;
              return (
                <div key={group.name} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color }} />
                  {group.name} ({cnt.toLocaleString()})
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {totalTables} таблиц в {TABLE_GROUPS.length} группах
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportJSON} disabled={loading} className="gap-2 rounded-xl">
            <Download className="w-3 h-3" />
            Скачать JSON
          </Button>
          <Button variant="outline" size="sm" onClick={fetchCounts} disabled={loading} className="gap-2 rounded-xl">
            {loading ? <SigmaSpinner size="xs" /> : <RefreshCw className="w-3 h-3" />}
            Обновить
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {TABLE_GROUPS.map((group) => {
          const isExpanded = expandedGroup === group.name;
          const groupTotal = group.tables.reduce((acc, t) => {
            const c = tableCounts[t];
            return acc + (c && c > 0 ? c : 0);
          }, 0);

          return (
            <div
              key={group.name}
              className={`bg-secondary/30 rounded-xl border p-3 cursor-pointer transition-all duration-200 ${
                isDimmed(group.name)
                  ? "opacity-30 border-border"
                  : hoveredGroup && isHighlighted(group.name) && group.name !== hoveredGroup
                  ? "opacity-100 border-primary/60 ring-1 ring-primary/40 bg-primary/5"
                  : "border-border hover:bg-secondary/50"
              }`}
              onClick={() => setExpandedGroup(isExpanded ? null : group.name)}
              onMouseEnter={() => setHoveredGroup(group.name)}
              onMouseLeave={() => setHoveredGroup(null)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
                    style={{ backgroundColor: group.color }}
                  >
                    {group.icon}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{group.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {group.tables.length} таблиц · {loading ? "..." : groupTotal} записей
                    </div>
                  </div>
                </div>
                {group.connections.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap justify-end">
                    <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    {group.connections.map(c => (
                      <span key={c} className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-border space-y-1">
                  {group.tables.map(table => (
                    <div key={table} className="flex items-center justify-between text-xs py-1 px-2 rounded-lg hover:bg-muted/50">
                      <span className="font-mono text-muted-foreground">{table}</span>
                      <Badge variant="outline" className="text-[10px] h-5">
                        {loading ? "..." : (tableCounts[table] === -1 ? "—" : (tableCounts[table] ?? "..."))}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
