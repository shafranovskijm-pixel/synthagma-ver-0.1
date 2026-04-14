import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Upload, Eye, Clock, CheckCircle2, XCircle } from "lucide-react";
import type { Student } from "@/hooks/useOrgDetailsView";

interface OrgStudentsPanelProps {
  students: Student[];
  filteredStudents: Student[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  pendingEnrollmentsCount: number;
  organizationName: string;
  onShowBulkImport: () => void;
}

export function OrgStudentsPanel({
  filteredStudents, searchQuery, setSearchQuery,
  pendingEnrollmentsCount, organizationName, onShowBulkImport, students,
}: OrgStudentsPanelProps) {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Поиск учеников..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
        </div>
        <Badge variant="outline" className="text-sm">Всего: {students.length}</Badge>
        {pendingEnrollmentsCount > 0 && (
          <Badge variant="secondary" className="text-sm gap-1"><Clock className="w-3 h-3" />Ожидают зачисления: {pendingEnrollmentsCount}</Badge>
        )}
        <Button variant="outline" size="sm" className="gap-2" onClick={onShowBulkImport}><Upload className="w-4 h-4" />Импорт из Excel</Button>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => { localStorage.setItem('previewStudentDashboard', 'true'); window.open('/student', '_blank'); }}>
          <Eye className="w-4 h-4" />Кабинет ученика
        </Button>
      </div>

      <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ученик</TableHead>
                  <TableHead>Логин</TableHead>
                  <TableHead>Курсы</TableHead>
                  <TableHead>Прогресс</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.map((student) => (
                  <TableRow key={student.id} className="hover:bg-muted/40">
                    <TableCell>
                      <div>
                        <p className="font-medium">{student.full_name || "Без имени"}</p>
                        <p className="text-sm text-muted-foreground">{student.email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{student.login || "—"}</TableCell>
                    <TableCell>
                      {student.enrollments.length > 0 ? (
                        <div className="space-y-1">
                          {student.enrollments.slice(0, 2).map((e, i) => (
                            <Badge key={i} variant="secondary" className="text-xs mr-1">{e.course_title}</Badge>
                          ))}
                          {student.enrollments.length > 2 && <Badge variant="outline" className="text-xs">+{student.enrollments.length - 2}</Badge>}
                        </div>
                      ) : <span className="text-muted-foreground">Не записан</span>}
                    </TableCell>
                    <TableCell>
                      {student.enrollments.length > 0 ? (
                        <div className="space-y-1">
                          {student.enrollments.slice(0, 2).map((e, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <Progress value={Math.min(e.progress, 100)} className="h-1.5 w-16" />
                              <span className="text-xs text-muted-foreground">{Math.min(e.progress, 100)}%</span>
                            </div>
                          ))}
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {student.enrollments.length > 0 ? (
                        <div className="space-y-1">
                          {student.enrollments.slice(0, 2).map((e, i) => (
                            <Badge key={i} variant={e.status === "completed" ? "default" : e.status === "in_progress" ? "secondary" : "outline"} className="text-xs">
                              {e.status === "completed" && <CheckCircle2 className="w-3 h-3 mr-1" />}
                              {(e.status === "in_progress" || e.status === "active") && <Clock className="w-3 h-3 mr-1" />}
                              {e.status === "not_started" && <XCircle className="w-3 h-3 mr-1" />}
                              {e.status === "completed" ? "Завершён" : e.status === "in_progress" || e.status === "active" ? "В процессе" : "Не начат"}
                            </Badge>
                          ))}
                        </div>
                      ) : <Badge variant="outline" className="text-xs">Не записан</Badge>}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => {
                        localStorage.setItem('adminViewAsStudent', JSON.stringify({ userId: student.user_id, name: student.full_name || student.email, orgName: organizationName }));
                        navigate('/student');
                      }} title="Войти в кабинет ученика"><Eye className="w-4 h-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredStudents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {searchQuery ? "Ничего не найдено" : "Нет учеников в этой организации"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
