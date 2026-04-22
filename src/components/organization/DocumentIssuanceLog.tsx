import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  Download,
  Search,
  Calendar,
  Send,
  Award,
  BookOpen,
  Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { getXLSX } from "@/utils/xlsxHelper";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface DocumentLog {
  id: string;
  user_name: string;
  document_type: string;
  document_name: string;
  reg_number: string | null;
  issued_at: string;
  send_method: string | null;
  send_number: string | null;
  file_url: string | null;
}

interface DocumentIssuanceLogProps {
  organizationId: string;
}

export function DocumentIssuanceLog({ organizationId }: DocumentIssuanceLogProps) {
  const [logs, setLogs] = useState<DocumentLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // New entry form
  const [newEntry, setNewEntry] = useState({
    user_name: "",
    document_type: "certificate",
    document_name: "",
    reg_number: "",
    send_method: "",
    send_number: "" });

  useEffect(() => {
    if (organizationId) {
      loadLogs();
    }
  }, [organizationId]);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("document_issuance_log")
        .select("*")
        .eq("organization_id", organizationId)
        .order("issued_at", { ascending: false });

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error("Error loading logs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddEntry = async () => {
    if (!newEntry.user_name || !newEntry.document_name) {
      toast.error("Заполните обязательные поля");
      return;
    }

    setIsAdding(true);
    try {
      const { error } = await supabase.from("document_issuance_log").insert({
        organization_id: organizationId,
        user_id: crypto.randomUUID(), // Placeholder, should be actual user_id
        user_name: newEntry.user_name,
        document_type: newEntry.document_type,
        document_name: newEntry.document_name,
        reg_number: newEntry.reg_number || null,
        send_method: newEntry.send_method || null,
        send_number: newEntry.send_number || null });

      if (error) throw error;

      toast.success("Запись добавлена");
      setShowAddDialog(false);
      setNewEntry({
        user_name: "",
        document_type: "certificate",
        document_name: "",
        reg_number: "",
        send_method: "",
        send_number: "" });
      loadLogs();
    } catch (error) {
      console.error("Error adding entry:", error);
      toast.error("Ошибка добавления записи");
    } finally {
      setIsAdding(false);
    }
  };

  const handleExport = async () => {
    const XLSX = await getXLSX();
    const exportData = filteredLogs.map((log, index) => ({
      "№": index + 1,
      "Дата": format(new Date(log.issued_at), "dd.MM.yyyy", { locale: ru }),
      "ФИО": log.user_name,
      "Вид документа": getDocumentTypeLabel(log.document_type),
      "Рег.номер": log.reg_number || "-",
      "Подпись/номер отправки": log.send_method 
        ? `${getSendMethodLabel(log.send_method)}${log.send_number ? `: ${log.send_number}` : ""}`
        : "-" }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Журнал выдачи документов");
    XLSX.writeFile(wb, `document_issuance_log_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast.success("Журнал выгружен");
  };

  const getDocumentTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      certificate: "Удостоверение",
      diploma: "Диплом",
      protocol: "Протокол",
      reference: "Справка",
      other: "Другое" };
    return types[type] || type;
  };

  const getSendMethodLabel = (method: string) => {
    const methods: Record<string, string> = {
      email: "Email",
      mail: "Почта",
      handed: "Вручен лично",
      courier: "Курьер" };
    return methods[method] || method;
  };

  const getDocumentIcon = (type: string) => {
    switch (type) {
      case "certificate":
        return <Award className="w-4 h-4" />;
      case "diploma":
        return <BookOpen className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const filteredLogs = logs.filter(log =>
    log.user_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.document_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (log.reg_number && log.reg_number.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Журнал выдачи документов</h2>
          <p className="text-sm text-muted-foreground">
            Учёт выданных документов после окончания обучения
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="rounded-xl gap-2"
            onClick={handleExport}
            disabled={filteredLogs.length === 0}
          >
            <Download className="w-4 h-4" />
            Выгрузить
          </Button>
          <Button
            className="btn-gradient rounded-xl gap-2"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="w-4 h-4" />
            Добавить запись
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Поиск по ФИО, документу или рег. номеру..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 rounded-xl"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <SigmaSpinner size="lg" />
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-card rounded-2xl border border-border">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Нет записей в журнале</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">№</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Дата</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">ФИО</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Вид документа</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Рег.номер</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Подпись/номер отправки</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredLogs.map((log, index) => (
                  <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm">{index + 1}</td>
                    <td className="px-4 py-3 text-sm">
                      {format(new Date(log.issued_at), "dd.MM.yyyy", { locale: ru })}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">{log.user_name}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                          {getDocumentIcon(log.document_type)}
                        </div>
                        <span className="text-sm">{log.document_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {log.reg_number || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {log.send_method ? (
                        <div className="flex items-center gap-1">
                          <Send className="w-3 h-3 text-muted-foreground" />
                          <span>{getSendMethodLabel(log.send_method)}</span>
                          {log.send_number && (
                            <span className="text-muted-foreground">: {log.send_number}</span>
                          )}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>Добавить запись в журнал</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>ФИО *</Label>
              <Input
                value={newEntry.user_name}
                onChange={(e) => setNewEntry(prev => ({ ...prev, user_name: e.target.value }))}
                placeholder="Иванов Иван Иванович"
                className="rounded-xl mt-1"
              />
            </div>

            <div>
              <Label>Вид документа</Label>
              <Select
                value={newEntry.document_type}
                onValueChange={(value) => setNewEntry(prev => ({ ...prev, document_type: value }))}
              >
                <SelectTrigger className="rounded-xl mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="certificate">Удостоверение</SelectItem>
                  <SelectItem value="diploma">Диплом</SelectItem>
                  <SelectItem value="protocol">Протокол</SelectItem>
                  <SelectItem value="reference">Справка</SelectItem>
                  <SelectItem value="other">Другое</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Название документа *</Label>
              <Input
                value={newEntry.document_name}
                onChange={(e) => setNewEntry(prev => ({ ...prev, document_name: e.target.value }))}
                placeholder="Удостоверение о повышении квалификации"
                className="rounded-xl mt-1"
              />
            </div>

            <div>
              <Label>Регистрационный номер</Label>
              <Input
                value={newEntry.reg_number}
                onChange={(e) => setNewEntry(prev => ({ ...prev, reg_number: e.target.value }))}
                placeholder="№ 123456"
                className="rounded-xl mt-1"
              />
            </div>

            <div>
              <Label>Способ отправки</Label>
              <Select
                value={newEntry.send_method}
                onValueChange={(value) => setNewEntry(prev => ({ ...prev, send_method: value }))}
              >
                <SelectTrigger className="rounded-xl mt-1">
                  <SelectValue placeholder="Выберите способ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="mail">Почта России</SelectItem>
                  <SelectItem value="courier">Курьер</SelectItem>
                  <SelectItem value="handed">Вручен лично</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newEntry.send_method && newEntry.send_method !== "handed" && (
              <div>
                <Label>
                  {newEntry.send_method === "email" ? "Email адрес" : "Трек-номер / подпись"}
                </Label>
                <Input
                  value={newEntry.send_number}
                  onChange={(e) => setNewEntry(prev => ({ ...prev, send_number: e.target.value }))}
                  placeholder={
                    newEntry.send_method === "email"
                      ? "example@email.com"
                      : "Трек-номер или подпись получателя"
                  }
                  className="rounded-xl mt-1"
                />
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setShowAddDialog(false)}
              >
                Отмена
              </Button>
              <Button
                className="flex-1 btn-gradient rounded-xl"
                onClick={handleAddEntry}
                disabled={isAdding}
              >
                {isAdding ? (
                  <>
                    <SigmaSpinner size="sm" className="mr-2" />
                    Сохранение...
                  </>
                ) : (
                  "Сохранить"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}