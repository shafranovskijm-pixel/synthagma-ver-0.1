import { Badge } from "@/components/ui/badge";

export function getStatusBadge(status: string) {
  switch (status) {
    case "verified": case "signed": return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Подтверждено</Badge>;
    case "rejected": return <Badge variant="destructive">Отклонено</Badge>;
    case "expired": return <Badge variant="secondary">Истекло</Badge>;
    case "pending": return <Badge variant="outline">На проверке</Badge>;
    case "completed": return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Завершён</Badge>;
    case "active": return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Активен</Badge>;
    default: return <Badge variant="secondary">{status}</Badge>;
  }
}
