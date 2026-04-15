import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Bell, Calendar, AlertCircle, CheckCircle2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Reminder {
  id: string;
  course_id: string;
  user_id: string;
  reminder_date: string;
  reminder_text: string | null;
  is_sent: boolean;
  is_dismissed: boolean;
  completed_at: string;
  course_title?: string;
  employee_name?: string;
}

interface Props {
  companyId: string;
  employees: { user_id: string; full_name: string }[];
}

export function CompanyRemindersTab({ companyId, employees }: Props) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("upcoming");

  const loadReminders = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("course_reminders")
      .select("id, course_id, user_id, reminder_date, reminder_text, is_sent, is_dismissed, completed_at, courses(title)")
      .eq("company_id", companyId)
      .order("reminder_date", { ascending: true });

    const mapped = (data || []).map((r) => {
      const emp = employees.find((e) => e.user_id === r.user_id);
      return {
        ...r,
        course_title: (r.courses as any)?.title || "Курс",
        employee_name: emp?.full_name || "—" };
    });

    setReminders(mapped);
    setLoading(false);
  }, [companyId, employees]);

  useEffect(() => { loadReminders(); }, [loadReminders]);

  const now = new Date();
  const filtered = reminders.filter((r) => {
    if (filter === "upcoming") return new Date(r.reminder_date) >= now && !r.is_dismissed;
    if (filter === "overdue") return new Date(r.reminder_date) < now && !r.is_sent && !r.is_dismissed;
    return true;
  });

  if (loading) {
    return <div className="flex items-center justify-center py-12"><SigmaSpinner size="lg" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Напоминания о переобучении
        </h2>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="upcoming">Предстоящие</SelectItem>
            <SelectItem value="overdue">Просроченные</SelectItem>
            <SelectItem value="all">Все</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Нет напоминаний</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Сотрудник</TableHead>
                <TableHead>Курс</TableHead>
                <TableHead>Дата напоминания</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const isOverdue = new Date(r.reminder_date) < now && !r.is_sent;
                return (
                  <TableRow key={r.id} className={isOverdue ? "bg-destructive/5" : ""}>
                    <TableCell className="font-medium">{r.employee_name}</TableCell>
                    <TableCell>{r.course_title}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-muted-foreground" />
                        {format(new Date(r.reminder_date), "dd.MM.yyyy")}
                      </span>
                    </TableCell>
                    <TableCell>
                      {r.is_sent ? (
                        <Badge className="bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle2 className="w-3 h-3 mr-1" />Отправлено</Badge>
                      ) : isOverdue ? (
                        <Badge className="bg-destructive/10 text-destructive border-destructive/20"><AlertCircle className="w-3 h-3 mr-1" />Просрочено</Badge>
                      ) : (
                        <Badge variant="secondary">Ожидание</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
