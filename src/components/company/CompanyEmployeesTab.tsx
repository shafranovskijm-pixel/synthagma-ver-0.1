import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Users, UserPlus, Search, CheckCircle2, Clock, Upload } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmployeeImportDialog } from "./EmployeeImportDialog";

interface Enrollment {
  course_id: string;
  course_title: string;
  progress: number;
  status: string;
  completed_at: string | null;
}

interface Employee {
  user_id: string;
  full_name: string;
  email: string | null;
  login: string | null;
  enrollments: Enrollment[];
  avg_progress: number;
}

interface Props {
  employees: Employee[];
  addingEmployee: boolean;
  addEmployee: (name: string, email?: string) => Promise<any>;
  companyId: string;
  organizationId: string;
  onRefresh: () => void;
}

export function CompanyEmployeesTab({ employees, addingEmployee, addEmployee, companyId, organizationId, onRefresh }: Props) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Users className="w-5 h-5" />
          Сотрудники ({employees.length})
        </h2>
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
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowImportDialog(true)}>
            <Upload className="w-4 h-4" />
            Импорт
          </Button>
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
                      <SigmaSpinner size="sm" className="mr-2" />
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
                  <TableCell className="font-medium">{emp.full_name || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{emp.email || emp.login || "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {emp.enrollments.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Нет курсов</span>
                      ) : (
                        emp.enrollments.map((enr) => (
                          <Badge key={enr.course_id} variant={enr.status === "completed" ? "default" : "secondary"} className="text-xs">
                            {enr.course_title}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <Progress value={emp.avg_progress} className="h-2 flex-1" />
                      <span className="text-xs text-muted-foreground w-8">{emp.avg_progress}%</span>
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

      <EmployeeImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        companyId={companyId}
        organizationId={organizationId}
        onImportComplete={onRefresh}
      />
    </div>
  );
}
