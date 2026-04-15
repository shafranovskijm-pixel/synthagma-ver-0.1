import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Search, UserCheck, UserX, Clock, Camera, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface IdentificationRecord {
  id: string;
  user_id: string;
  status: string;
  photo_url: string | null;
  created_at: string;
  full_name: string;
  email: string;
}

interface IdentificationJournalProps {
  organizationId: string;
  onClose: () => void;
}

export function IdentificationJournal({ organizationId, onClose }: IdentificationJournalProps) {
  const [records, setRecords] = useState<IdentificationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    loadRecords();
  }, [organizationId]);

  const loadRecords = async () => {
    setIsLoading(true);
    try {
      // Get org students
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .eq("organization_id", organizationId);

      if (!profiles || profiles.length === 0) {
        setRecords([]);
        setIsLoading(false);
        return;
      }

      const userIds = profiles.map((p) => p.user_id);

      // Get video identifications for these users scoped to org
      const { data: identifications } = await supabase
        .from("video_identifications")
        .select("*")
        .in("user_id", userIds)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      const profileMap = new Map(profiles.map((p) => [p.user_id, p]));
      const idMap = new Map<string, any>();
      // Keep latest per user
      (identifications || []).forEach((id: any) => {
        if (!idMap.has(id.user_id)) idMap.set(id.user_id, id);
      });

      const result: IdentificationRecord[] = profiles.map((p) => {
        const vid = idMap.get(p.user_id);
        return {
          id: vid?.id || p.user_id,
          user_id: p.user_id,
          status: vid?.status || "none",
          photo_url: vid?.photo_url || null,
          created_at: vid?.created_at || "",
          full_name: p.full_name || "Без имени",
          email: p.email || "" };
      });

      setRecords(result);
    } catch (error) {
      console.error("Error loading identifications:", error);
      toast.error("Ошибка загрузки данных");
    } finally {
      setIsLoading(false);
    }
  };

  const updateStatus = async (userId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("video_identifications")
        .update({ status: newStatus })
        .eq("user_id", userId)
        .eq("organization_id", organizationId);

      if (error) throw error;
      toast.success(newStatus === "verified" ? "Идентификация подтверждена" : "Идентификация отклонена");
      loadRecords();
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Ошибка обновления статуса");
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle2 className="w-3 h-3 mr-1" />Подтверждено</Badge>;
      case "pending":
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20"><Clock className="w-3 h-3 mr-1" />Ожидает</Badge>;
      case "rejected":
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20"><XCircle className="w-3 h-3 mr-1" />Отклонено</Badge>;
      default:
        return <Badge variant="outline"><AlertCircle className="w-3 h-3 mr-1" />Не пройдено</Badge>;
    }
  };

  const filtered = records.filter((r) => {
    const matchesSearch =
      r.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const counts = {
    all: records.length,
    pending: records.filter((r) => r.status === "pending").length,
    verified: records.filter((r) => r.status === "verified").length,
    rejected: records.filter((r) => r.status === "rejected").length,
    none: records.filter((r) => r.status === "none").length };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <SigmaSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Camera className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Журнал видеоидентификации</h2>
            <p className="text-sm text-muted-foreground">
              Сводная таблица статусов идентификации студентов
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Всего", count: counts.all, color: "text-foreground" },
          { label: "Ожидает", count: counts.pending, color: "text-amber-500" },
          { label: "Подтверждено", count: counts.verified, color: "text-green-500" },
          { label: "Отклонено", count: counts.rejected, color: "text-red-500" },
          { label: "Не пройдено", count: counts.none, color: "text-muted-foreground" },
        ].map((s) => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-3 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.count}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по имени или email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 rounded-xl"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px] rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="pending">Ожидает</SelectItem>
            <SelectItem value="verified">Подтверждено</SelectItem>
            <SelectItem value="rejected">Отклонено</SelectItem>
            <SelectItem value="none">Не пройдено</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Студент</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Фото</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Нет записей
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{record.full_name}</div>
                      <div className="text-xs text-muted-foreground">{record.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>{statusBadge(record.status)}</TableCell>
                  <TableCell>
                    {record.photo_url ? (
                      <img
                        src={record.photo_url}
                        alt="ID Photo"
                        className="w-10 h-10 rounded-lg object-cover border border-border"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {record.created_at ? (
                      <span className="text-sm">
                        {format(new Date(record.created_at), "d MMM yyyy", { locale: ru })}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {record.status === "pending" && (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          className="rounded-lg"
                          onClick={() => updateStatus(record.user_id, "verified")}
                        >
                          <UserCheck className="w-4 h-4 mr-1" />
                          Подтвердить
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg text-destructive"
                          onClick={() => updateStatus(record.user_id, "rejected")}
                        >
                          <UserX className="w-4 h-4 mr-1" />
                          Отклонить
                        </Button>
                      </div>
                    )}
                    {record.status === "verified" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg text-destructive"
                        onClick={() => updateStatus(record.user_id, "rejected")}
                      >
                        <UserX className="w-4 h-4 mr-1" />
                        Отклонить
                      </Button>
                    )}
                    {record.status === "rejected" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg"
                        onClick={() => updateStatus(record.user_id, "verified")}
                      >
                        <UserCheck className="w-4 h-4 mr-1" />
                        Подтвердить
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
