import { Badge } from "@/components/ui/badge";

const ROLE_LABEL: Record<string, string> = {
  admin: "Админ",
  organization: "Владелец организации",
  company: "Компания",
  sales_manager: "Менеджер продаж",
  student: "Ученик",
};

const ROLE_STYLE: Record<string, string> = {
  admin: "bg-primary/15 text-primary border-primary/30",
  organization: "bg-sigma-teal/15 text-sigma-teal border-sigma-teal/30",
  company: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  sales_manager: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  student: "bg-muted text-muted-foreground border-border",
};

export function RoleBadge({ role }: { role: string | null | undefined }) {
  if (!role) return <span className="text-xs text-muted-foreground">—</span>;
  const label = ROLE_LABEL[role] || role;
  const style = ROLE_STYLE[role] || "bg-muted text-muted-foreground border-border";
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 font-medium ${style}`}>
      {label}
    </Badge>
  );
}
