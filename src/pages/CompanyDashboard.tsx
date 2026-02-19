import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import {
  Building2,
  Users,
  GraduationCap,
  TrendingUp,
  BookOpen,
  UserPlus,
  LogOut,
  Loader2,
  CheckCircle2,
  Clock,
  Search,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCompanyDashboard } from "@/hooks/useCompanyDashboard";
import { useAuth } from "@/hooks/useAuth";

const CompanyDashboard = () => {
  const { company, employees, stats, loading, addingEmployee, addEmployee } =
    useCompanyDashboard();
  const { signOut } = useAuth();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const handleAddEmployee = async () => {
    if (!newName.trim()) return;
    const result = await addEmployee(newName.trim(), newEmail.trim() || undefined);
    if (result) {
      setNewName("");
      setNewEmail("");
      setShowAddDialog(false);
    }
  };

  const filteredEmployees = employees.filter(
    (e) =>
      e.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.email && e.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <p className="text-muted-foreground">Загрузка кабинета...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SigmaLogo size="sm" />
            <div className="hidden sm:block">
              <h1 className="font-display text-lg font-bold">{company?.name}</h1>
              <p className="text-xs text-muted-foreground">Кабинет компании</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="gap-2">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Выйти</span>
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Welcome */}
        {employees.length === 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold mb-1">Добро пожаловать!</h2>
                  <p className="text-muted-foreground text-sm mb-3">
                    Здесь вы можете управлять обучением своих сотрудников. Начните с добавления сотрудников.
                  </p>
                  <Button onClick={() => setShowAddDialog(true)} className="gap-2">
                    <UserPlus className="w-4 h-4" />
                    Добавить сотрудника
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalEmployees}</p>
                  <p className="text-xs text-muted-foreground">Сотрудников</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.avgProgress}%</p>
                  <p className="text-xs text-muted-foreground">Средний прогресс</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.completedCourses}</p>
                  <p className="text-xs text-muted-foreground">Завершено</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.activeCourses}</p>
                  <p className="text-xs text-muted-foreground">В процессе</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Employees Table */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Сотрудники
              </CardTitle>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск..."
                    className="pl-9 w-48"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                  <DialogTrigger asChild>
                    <Button className="gap-2" size="sm">
                      <UserPlus className="w-4 h-4" />
                      Добавить
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Добавить сотрудника</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label>ФИО *</Label>
                        <Input
                          placeholder="Иванов Иван Иванович"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Email (необязательно)</Label>
                        <Input
                          type="email"
                          placeholder="ivan@company.com"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                        />
                      </div>
                      <Button
                        className="w-full"
                        onClick={handleAddEmployee}
                        disabled={!newName.trim() || addingEmployee}
                      >
                        {addingEmployee ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Регистрация...
                          </>
                        ) : (
                          "Зарегистрировать сотрудника"
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredEmployees.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>{employees.length === 0 ? "Нет сотрудников" : "Не найдено"}</p>
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ФИО</TableHead>
                      <TableHead>Контакт</TableHead>
                      <TableHead>Курсы</TableHead>
                      <TableHead>Прогресс</TableHead>
                      <TableHead>Статус</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmployees.map((emp) => (
                      <TableRow key={emp.user_id}>
                        <TableCell className="font-medium">
                          {emp.full_name || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {emp.email || emp.login || "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {emp.enrollments.length === 0 ? (
                              <span className="text-xs text-muted-foreground">Нет курсов</span>
                            ) : (
                              emp.enrollments.map((enr) => (
                                <Badge
                                  key={enr.course_id}
                                  variant={enr.status === "completed" ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {enr.course_title}
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <Progress value={emp.avg_progress} className="h-2 flex-1" />
                            <span className="text-xs text-muted-foreground w-8">
                              {emp.avg_progress}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {emp.enrollments.some((e) => e.status === "completed") ? (
                            <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Завершено
                            </Badge>
                          ) : emp.enrollments.length > 0 ? (
                            <Badge variant="secondary">
                              <Clock className="w-3 h-3 mr-1" />
                              В процессе
                            </Badge>
                          ) : (
                            <Badge variant="outline">Новый</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default CompanyDashboard;
