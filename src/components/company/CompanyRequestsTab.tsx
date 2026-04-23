import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow } from "@/components/ui/table";
import {
  Send,
  Plus,
  CalendarDays,
  MessageSquare,
  Inbox } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface Employee {
  user_id: string;
  full_name: string;
}

interface CompanyRequest {
  id: string;
  request_type: string;
  title: string;
  description: string | null;
  employees: any;
  course_name: string | null;
  desired_date: string | null;
  status: string;
  org_response: string | null;
  created_at: string;
}

interface CompanyRequestsTabProps {
  companyId: string;
  organizationId: string;
  employees: Employee[];
}

const REQUEST_TYPES: Record<string, string> = {
  training: "Обучение",
  documents: "Документы",
  consultation: "Консультация",
  other: "Другое" };

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Ожидает", variant: "secondary" },
  reviewed: { label: "Рассмотрена", variant: "outline" },
  approved: { label: "Одобрена", variant: "default" },
  rejected: { label: "Отклонена", variant: "destructive" },
  completed: { label: "Выполнена", variant: "outline" } };

export function CompanyRequestsTab({ companyId, organizationId, employees }: CompanyRequestsTabProps) {
  const [requests, setRequests] = useState<CompanyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formType, setFormType] = useState("training");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCourseName, setFormCourseName] = useState("");
  const [formDate, setFormDate] = useState("");
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);

  useEffect(() => {
    loadRequests();

    const channel = supabase
      .channel("company_requests_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "company_requests", filter: `company_id=eq.${companyId}` },
        () => loadRequests()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [companyId]);

  const loadRequests = async () => {
    try {
      const { data, error } = await supabase
        .from("company_requests")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRequests((data as any) || []);
    } catch (e) {
      console.error("Error loading requests:", e);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormType("training");
    setFormTitle("");
    setFormDescription("");
    setFormCourseName("");
    setFormDate("");
    setSelectedEmployees([]);
  };

  const handleSubmit = async () => {
    if (!formTitle.trim()) {
      toast.error("Укажите тему заявки");
      return;
    }
    setSubmitting(true);
    try {
      const emps = employees
        .filter((e) => selectedEmployees.includes(e.user_id))
        .map((e) => ({ user_id: e.user_id, full_name: e.full_name }));

      const { error } = await supabase.from("company_requests").insert({
        company_id: companyId,
        organization_id: organizationId,
        request_type: formType,
        title: formTitle.trim(),
        description: formDescription.trim() || null,
        employees: emps,
        course_name: formCourseName.trim() || null,
        desired_date: formDate || null,
        status: "pending" } as any);
      if (error) throw error;

      // Send notification to organization
      await supabase.from("org_notifications").insert({
        organization_id: organizationId,
        user_id: (await supabase.auth.getUser()).data.user?.id || "",
        type: "company_request",
        title: "Новая заявка от компании",
        message: `Тип: ${REQUEST_TYPES[formType]}. Тема: ${formTitle.trim()}` } as any);

      toast.success("Заявка отправлена");
      setShowDialog(false);
      resetForm();
      loadRequests();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEmployee = (userId: string) => {
    setSelectedEmployees((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <SigmaSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Заявки</h2>
          <p className="text-sm text-muted-foreground">Заявки в учебную организацию</p>
        </div>
        <Button onClick={() => setShowDialog(true)} className="gap-2 rounded-xl">
          <Plus className="w-4 h-4" />
          Новая заявка
        </Button>
      </div>

      {requests.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Inbox className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground font-medium">Заявок пока нет</p>
            <p className="text-sm text-muted-foreground mt-1">
              Создайте заявку на обучение, документы или консультацию
            </p>
            <Button onClick={() => setShowDialog(true)} className="gap-2 mt-4 rounded-xl">
              <Send className="w-4 h-4" />
              Создать заявку
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Тип</TableHead>
                <TableHead>Тема</TableHead>
                <TableHead>Дата</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Ответ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((req) => {
                const statusCfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
                return (
                  <TableRow key={req.id}>
                    <TableCell>
                      <Badge variant="outline" className="rounded-lg">
                        {REQUEST_TYPES[req.request_type] || req.request_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{req.title}</div>
                      {req.course_name && (
                        <div className="text-xs text-muted-foreground">Курс: {req.course_name}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(req.created_at), "d MMM yyyy", { locale: ru })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusCfg.variant} className="rounded-lg">
                        {statusCfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      {req.org_response ? (
                        <div className="flex items-start gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                          <span className="text-sm line-clamp-2">{req.org_response}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create request dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle>Новая заявка</DialogTitle>
            <DialogDescription>Заявка будет отправлена в учебную организацию</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Тип заявки</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REQUEST_TYPES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Тема *</Label>
              <Input
                className="rounded-xl"
                placeholder="Например: Обучение по охране труда"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Описание</Label>
              <Textarea
                className="rounded-xl resize-none"
                rows={3}
                placeholder="Подробности заявки..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>

            {formType === "training" && (
              <div className="space-y-2">
                <Label>Название курса</Label>
                <Input
                  className="rounded-xl"
                  placeholder="Курс или программа обучения"
                  value={formCourseName}
                  onChange={(e) => setFormCourseName(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Желаемая дата</Label>
              <Input
                type="date"
                className="rounded-xl"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>

            {employees.length > 0 && (
              <div className="space-y-2">
                <Label>Сотрудники ({selectedEmployees.length})</Label>
                <div className="max-h-40 overflow-y-auto border rounded-xl p-2 space-y-1">
                  {employees.map((emp) => (
                    <label
                      key={emp.user_id}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedEmployees.includes(emp.user_id)}
                        onCheckedChange={() => toggleEmployee(emp.user_id)}
                      />
                      <span className="text-sm">{emp.full_name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} className="rounded-xl">
              Отмена
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || !formTitle.trim()} className="gap-2 rounded-xl">
              {submitting ? <SigmaSpinner size="sm" /> : <Send className="w-4 h-4" />}
              Отправить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
