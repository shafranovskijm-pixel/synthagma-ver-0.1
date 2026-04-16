import { TableRow, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trash2, Shield, Building2, GraduationCap, Copy, Eye, EyeOff, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface UserWithRole {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  organization_id: string | null;
  organization_name?: string | null;
  role: string | null;
  created_at: string;
  login: string | null;
  generated_password: string | null;
}

interface UserTableRowProps {
  user: UserWithRole;
  organizations: { id: string; name: string }[];
  isPasswordVisible: boolean;
  onTogglePassword: (userId: string) => void;
  onCopyCredentials: (login: string, password: string) => void;
  onRoleChange: (userId: string, role: "admin" | "organization" | "student") => void;
  onOrgChange: (userId: string, orgId: string | null) => void;
  onViewAsStudent: (user: UserWithRole) => void;
  onDelete: (user: UserWithRole) => void;
  onNavigate: (userId: string) => void;
}

export function UserTableRow({
  user, organizations, isPasswordVisible, onTogglePassword, onCopyCredentials,
  onRoleChange, onOrgChange, onViewAsStudent, onDelete, onNavigate
}: UserTableRowProps) {
  return (
    <TableRow className="cursor-pointer hover:bg-secondary/50" onClick={() => onNavigate(user.user_id)}>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={user.avatar_url || undefined} />
            <AvatarFallback>{user.full_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "?"}</AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">{user.full_name || "Без имени"}</div>
            <div className="text-sm text-muted-foreground">{user.email}</div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        {user.role === 'student' && user.login ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Логин:</span>
              <span className="text-sm font-mono">{user.login}</span>
            </div>
            {user.generated_password && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Пароль:</span>
                <span className="text-sm font-mono">{isPasswordVisible ? user.generated_password : '••••••••'}</span>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); onTogglePassword(user.user_id); }}>
                  {isPasswordVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); onCopyCredentials(user.login!, user.generated_password!); }}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <Select value={user.role || "student"} onValueChange={(value) => onRoleChange(user.user_id, value as "admin" | "organization" | "student")}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="admin"><div className="flex items-center gap-2"><Shield className="w-4 h-4" />Админ</div></SelectItem>
            <SelectItem value="organization"><div className="flex items-center gap-2"><Building2 className="w-4 h-4" />Организация</div></SelectItem>
            <SelectItem value="student"><div className="flex items-center gap-2"><GraduationCap className="w-4 h-4" />Слушатель</div></SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select value={user.organization_id || "none"} onValueChange={(value) => onOrgChange(user.user_id, value === "none" ? null : value)}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Не назначена" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Не назначена</SelectItem>
            {organizations.map((org) => <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {format(new Date(user.created_at), "d MMM yyyy", { locale: ru })}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          {user.role === 'student' && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={(e) => { e.stopPropagation(); onViewAsStudent(user); }}>
              <ExternalLink className="w-3.5 h-3.5" />Войти как ученик
            </Button>
          )}
          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(user); }}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export type { UserWithRole };
