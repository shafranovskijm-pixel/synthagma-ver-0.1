import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Search, Loader2, Users, Shield, Building2, GraduationCap } from "lucide-react";
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
}

const ROLE_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  admin: { label: "Админ", icon: <Shield className="w-3 h-3" />, color: "bg-purple-100 text-purple-700" },
  organization: { label: "Организация", icon: <Building2 className="w-3 h-3" />, color: "bg-blue-100 text-blue-700" },
  student: { label: "Слушатель", icon: <GraduationCap className="w-3 h-3" />, color: "bg-green-100 text-green-700" },
};

export function UsersManager() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [deleteUser, setDeleteUser] = useState<UserWithRole | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch profiles with roles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch user roles
      const { data: roles, error: rolesError } = await supabase.from("user_roles").select("*");

      if (rolesError) throw rolesError;

      // Fetch organizations
      const { data: orgs, error: orgsError } = await supabase
        .from("organizations")
        .select("id, name");

      if (orgsError) throw orgsError;

      setOrganizations(orgs || []);

      // Combine data
      const usersWithRoles = (profiles || []).map((profile) => {
        const userRole = roles?.find((r) => r.user_id === profile.user_id);
        const org = orgs?.find((o) => o.id === profile.organization_id);
        return {
          ...profile,
          role: userRole?.role || null,
          organization_name: org?.name || null,
        };
      });

      setUsers(usersWithRoles);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить пользователей",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: "admin" | "organization" | "student") => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .update({ role: newRole })
        .eq("user_id", userId);

      if (error) throw error;

      setUsers((prev) =>
        prev.map((u) => (u.user_id === userId ? { ...u, role: newRole } : u))
      );

      toast({ title: "Успешно", description: "Роль обновлена" });
    } catch (error) {
      console.error("Error updating role:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось обновить роль",
        variant: "destructive",
      });
    }
  };

  const handleOrgChange = async (userId: string, orgId: string | null) => {
    try {
      // Update profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ organization_id: orgId })
        .eq("user_id", userId);

      if (profileError) throw profileError;

      const org = organizations.find((o) => o.id === orgId);
      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === userId
            ? { ...u, organization_id: orgId, organization_name: org?.name || null }
            : u
        )
      );

      toast({ title: "Успешно", description: "Организация обновлена" });
    } catch (error) {
      console.error("Error updating organization:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось обновить организацию",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteUser) return;

    try {
      // Delete user roles
      await supabase.from("user_roles").delete().eq("user_id", deleteUser.user_id);

      // Delete profile
      await supabase.from("profiles").delete().eq("user_id", deleteUser.user_id);

      // Note: We can't delete from auth.users from client - that would require admin API

      setUsers((prev) => prev.filter((u) => u.id !== deleteUser.id));
      toast({ title: "Успешно", description: "Профиль пользователя удален" });
      setDeleteUser(null);
    } catch (error) {
      console.error("Error deleting user:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось удалить пользователя",
        variant: "destructive",
      });
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      !searchQuery ||
      user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole = roleFilter === "all" || user.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  const stats = {
    total: users.length,
    admins: users.filter((u) => u.role === "admin").length,
    organizations: users.filter((u) => u.role === "organization").length,
    students: users.filter((u) => u.role === "student").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold">Пользователи</h2>
        <p className="text-muted-foreground">Управление пользователями платформы</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Всего</CardDescription>
            <CardTitle className="text-3xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Shield className="w-3 h-3" /> Админы
            </CardDescription>
            <CardTitle className="text-3xl">{stats.admins}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Building2 className="w-3 h-3" /> Организации
            </CardDescription>
            <CardTitle className="text-3xl">{stats.organizations}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <GraduationCap className="w-3 h-3" /> Слушатели
            </CardDescription>
            <CardTitle className="text-3xl">{stats.students}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по имени или email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Все роли" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все роли</SelectItem>
            <SelectItem value="admin">Админы</SelectItem>
            <SelectItem value="organization">Организации</SelectItem>
            <SelectItem value="student">Слушатели</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Пользователь</TableHead>
                <TableHead>Роль</TableHead>
                <TableHead>Организация</TableHead>
                <TableHead>Дата регистрации</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    Пользователи не найдены
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={user.avatar_url || undefined} />
                          <AvatarFallback>
                            {user.full_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{user.full_name || "Без имени"}</div>
                          <div className="text-sm text-muted-foreground">{user.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={user.role || "student"}
                        onValueChange={(value) => handleRoleChange(user.user_id, value as "admin" | "organization" | "student")}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">
                            <div className="flex items-center gap-2">
                              <Shield className="w-4 h-4" />
                              Админ
                            </div>
                          </SelectItem>
                          <SelectItem value="organization">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4" />
                              Организация
                            </div>
                          </SelectItem>
                          <SelectItem value="student">
                            <div className="flex items-center gap-2">
                              <GraduationCap className="w-4 h-4" />
                              Слушатель
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={user.organization_id || "none"}
                        onValueChange={(value) =>
                          handleOrgChange(user.user_id, value === "none" ? null : value)
                        }
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Не назначена" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Не назначена</SelectItem>
                          {organizations.map((org) => (
                            <SelectItem key={org.id} value={org.id}>
                              {org.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(user.created_at), "d MMM yyyy", { locale: ru })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteUser(user)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteUser} onOpenChange={() => setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить пользователя?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить профиль пользователя "{deleteUser?.full_name || deleteUser?.email}"? 
              Это действие удалит профиль и роль пользователя.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
