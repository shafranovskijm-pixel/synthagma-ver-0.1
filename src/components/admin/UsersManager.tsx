import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Users, Shield, Building2, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { UserTableRow, type UserWithRole } from "./users/UserTableRow";

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

const ROLE_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  admin: { label: "Админ", icon: <Shield className="w-3 h-3" />, color: "bg-purple-100 text-purple-700" },
  organization: { label: "Организация", icon: <Building2 className="w-3 h-3" />, color: "bg-blue-100 text-blue-700" },
  student: { label: "Слушатель", icon: <GraduationCap className="w-3 h-3" />, color: "bg-green-100 text-green-700" } };

export function UsersManager() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(10);
  const [deleteUser, setDeleteUser] = useState<UserWithRole | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const viewAsStudent = (user: UserWithRole) => {
    localStorage.setItem('adminViewAsStudent', JSON.stringify({
      userId: user.user_id,
      name: user.full_name || user.email || 'Ученик',
      orgName: user.organization_name || '' }));
    navigate('/student');
  };

  const togglePasswordVisibility = (userId: string) => {
    setVisiblePasswords(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const copyCredentials = (login: string, password: string) => {
    const text = `Логин: ${login}\nПароль: ${password}`;
    navigator.clipboard.writeText(text);
    toast.success("Скопировано", { description: "Логин и пароль скопированы в буфер обмена" });
  };


  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch profiles with roles (exclude generated_password - it's encrypted)
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email, avatar_url, organization_id, login, company_id, created_at")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch decrypted passwords via admin RPC
      const { data: decryptedPasswords } = await supabase.rpc("get_all_decrypted_passwords");
      const passwordMap = new Map<string, string>();
      (decryptedPasswords || []).forEach((row: any) => {
        if (row.decrypted_password) passwordMap.set(row.user_id, row.decrypted_password);
      });

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
          generated_password: passwordMap.get(profile.user_id) || null,
          role: userRole?.role || null,
          organization_name: org?.name || null };
      });

      setUsers(usersWithRoles);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Ошибка", { description: "Не удалось загрузить пользователей" });
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: "admin" | "organization" | "student") => {
    try {
      // Use secure RPC function for admin role management
      const { error } = await supabase.rpc('admin_update_user_role', {
        p_user_id: userId,
        p_new_role: newRole
      });

      if (error) throw error;

      setUsers((prev) =>
        prev.map((u) => (u.user_id === userId ? { ...u, role: newRole } : u))
      );

      toast.success("Успешно", { description: "Роль обновлена" });
    } catch (error: any) {
      console.error("Error updating role:", error);
      const errorMessage = error?.message?.includes("Cannot remove last admin") 
        ? "Нельзя удалить последнего администратора"
        : error?.message?.includes("Unauthorized") 
          ? "Недостаточно прав для изменения роли"
          : "Не удалось обновить роль";
      toast.error("Ошибка", { description: "errorMessage" });
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

      toast.success("Успешно", { description: "Организация обновлена" });
    } catch (error) {
      console.error("Error updating organization:", error);
      toast.error("Ошибка", { description: "Не удалось обновить организацию" });
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
      toast.success("Успешно", { description: "Профиль пользователя удален" });
      setDeleteUser(null);
    } catch (error) {
      console.error("Error deleting user:", error);
      toast.error("Ошибка", { description: "Не удалось удалить пользователя" });
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

  const displayedUsers = filteredUsers.slice(0, visibleCount);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(10);
  }, [searchQuery, roleFilter]);

  const stats = {
    total: users.length,
    admins: users.filter((u) => u.role === "admin").length,
    organizations: users.filter((u) => u.role === "organization").length,
    students: users.filter((u) => u.role === "student").length };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <SigmaSpinner size="lg" />
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
                <TableHead>Учётные данные</TableHead>
                <TableHead>Роль</TableHead>
                <TableHead>Организация</TableHead>
                <TableHead>Дата регистрации</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    Пользователи не найдены
                  </TableCell>
                </TableRow>
              ) : (
                displayedUsers.map((user) => (
                  <TableRow key={user.id} className="cursor-pointer hover:bg-secondary/50" onClick={() => navigate(`/admin/user/${user.user_id}`)}>
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
                      {user.role === 'student' && user.login ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Логин:</span>
                            <span className="text-sm font-mono">{user.login}</span>
                          </div>
                          {user.generated_password && (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">Пароль:</span>
                              <span className="text-sm font-mono">
                                {visiblePasswords.has(user.user_id) ? user.generated_password : '••••••••'}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => togglePasswordVisibility(user.user_id)}
                              >
                                {visiblePasswords.has(user.user_id) ? (
                                  <EyeOff className="w-3 h-3" />
                                ) : (
                                  <Eye className="w-3 h-3" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => copyCredentials(user.login!, user.generated_password!)}
                              >
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
                      <div className="flex items-center justify-end gap-2">
                        {user.role === 'student' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            onClick={(e) => { e.stopPropagation(); viewAsStudent(user); }}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Войти как ученик
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeleteUser(user); }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {filteredUsers.length > visibleCount && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Показано {Math.min(visibleCount, filteredUsers.length)} из {filteredUsers.length}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Показать ещё:</span>
            {[10, 25, 50, 100].map((n) => (
              <Button key={n} variant="outline" size="sm" onClick={() => setVisibleCount((prev) => prev + n)}>
                +{n}
              </Button>
            ))}
          </div>
        </div>
      )}
      {filteredUsers.length > 0 && filteredUsers.length <= visibleCount && (
        <div className="text-sm text-muted-foreground">
          Показано {filteredUsers.length} из {filteredUsers.length}
        </div>
      )}

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
