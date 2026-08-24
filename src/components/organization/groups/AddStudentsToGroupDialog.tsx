import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, UserPlus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { fetchOrganizationStudentsPage } from "@/api/students";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AvailableStudent {
  user_id: string;
  full_name: string | null;
  email: string | null;
  login: string | null;
}

interface AddStudentsToGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  groupId: string;
  groupName: string;
  onStudentsChanged: (change: "grouping" | "population") => void | Promise<void>;
}

export function AddStudentsToGroupDialog({
  open,
  onOpenChange,
  organizationId,
  groupId,
  groupName,
  onStudentsChanged,
}: AddStudentsToGroupDialogProps) {
  const [availableStudents, setAvailableStudents] = useState<AvailableStudent[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");
  const [creating, setCreating] = useState(false);

  const loadAvailableStudents = useCallback(async () => {
    setLoading(true);
    try {
      const rows: AvailableStudent[] = [];
      let offset = 0;
      let nextOffset: number | null = 0;
      while (nextOffset !== null) {
        const page = await fetchOrganizationStudentsPage({
          organizationId,
          groupFilter: "no_group",
          archiveMode: "active",
          limit: 100,
          offset,
        });
        rows.push(...page.rows.map((student) => ({
          user_id: student.user_id,
          full_name: student.name,
          email: student.email || null,
          login: student.login || null,
        })));
        nextOffset = page.nextOffset;
        if (nextOffset !== null) offset = nextOffset;
      }
      setAvailableStudents(rows);
    } catch (error) {
      console.error("Failed to load students available for group", error);
      toast.error("Не удалось загрузить учеников без группы");
      setAvailableStudents([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set());
    setSearch("");
    setShowCreateForm(false);
    setNewStudentName("");
    setNewStudentEmail("");
    void loadAvailableStudents();
  }, [open, loadAvailableStudents]);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    if (!query) return availableStudents;
    return availableStudents.filter((student) =>
      [student.full_name, student.email, student.login]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase("ru").includes(query)),
    );
  }, [availableStudents, search]);

  const toggleStudent = (userId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleAddSelected = async () => {
    if (selectedIds.size === 0) return;
    setAdding(true);
    try {
      const userIds = Array.from(selectedIds);
      const { data, error } = await supabase
        .from("profiles")
        .update({ student_group_id: groupId } as never)
        .eq("organization_id", organizationId)
        .is("student_group_id", null)
        .in("user_id", userIds)
        .select("user_id");
      if (error) throw error;

      const updatedCount = (data as Array<{ user_id: string }> | null)?.length ?? 0;
      if (updatedCount !== userIds.length) {
        throw new Error(`Updated ${updatedCount} of ${userIds.length} student profiles`);
      }

      toast.success(`${updatedCount} ${updatedCount === 1 ? "ученик добавлен" : "ученика добавлено"} в группу`);
      await onStudentsChanged("grouping");
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to add students to group", error);
      toast.error("Не удалось добавить учеников в группу");
    } finally {
      setAdding(false);
    }
  };

  const handleCreateStudent = async () => {
    const fullName = newStudentName.trim();
    if (!fullName) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("register-student", {
        body: {
          full_name: fullName,
          email: newStudentEmail.trim() || undefined,
          organization_id: organizationId,
          student_group_id: groupId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(data?.message || "Ученик создан и добавлен в группу");
      await onStudentsChanged("population");
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to create student in group", error);
      toast.error("Не удалось создать ученика в группе");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[82vh] max-w-xl flex-col rounded-2xl">
        <DialogHeader>
          <DialogTitle>Добавить учеников в «{groupName}»</DialogTitle>
          <DialogDescription>
            Выберите учеников без группы или создайте нового — он сразу появится в этой группе. Зачисление на курс выполняется отдельно на этапе «Обучение».
          </DialogDescription>
        </DialogHeader>

        {showCreateForm ? (
          <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-2 font-medium">
              <Plus className="h-4 w-4 text-primary" />
              Новый ученик
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-new-student-name">ФИО *</Label>
              <Input
                id="group-new-student-name"
                value={newStudentName}
                onChange={(event) => setNewStudentName(event.target.value)}
                placeholder="Иванов Иван Иванович"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-new-student-email">Email (необязательно)</Label>
              <Input
                id="group-new-student-email"
                type="email"
                value={newStudentEmail}
                onChange={(event) => setNewStudentEmail(event.target.value)}
                placeholder="student@example.ru"
                className="rounded-xl"
              />
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 rounded-xl gap-2"
                onClick={handleCreateStudent}
                disabled={!newStudentName.trim() || creating}
              >
                {creating ? <SigmaSpinner size="sm" /> : <UserPlus className="h-4 w-4" />}
                Создать и добавить
              </Button>
              <Button variant="outline" className="rounded-xl" onClick={() => setShowCreateForm(false)} disabled={creating}>
                Отмена
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Найти ученика без группы..."
                  className="rounded-xl pl-9"
                />
              </div>
              <Button variant="outline" className="rounded-xl gap-2" onClick={() => setShowCreateForm(true)}>
                <Plus className="h-4 w-4" /> Создать нового
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <SigmaSpinner size="sm" /> Загрузка учеников…
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-10 text-center">
                  <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
                    <Users className="h-5 w-5 text-muted-foreground" />
                  </span>
                  <div className="font-medium">
                    {availableStudents.length === 0 ? "Нет учеников без группы" : "Ничего не найдено"}
                  </div>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    {availableStudents.length === 0
                      ? "Создайте нового ученика — он сразу будет добавлен в эту группу."
                      : "Измените запрос или очистите строку поиска."}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredStudents.map((student) => {
                    const name = student.full_name || "Без имени";
                    return (
                      <label key={student.user_id} className="flex cursor-pointer items-center gap-3 px-3 py-3 hover:bg-muted/50">
                        <Checkbox
                          checked={selectedIds.has(student.user_id)}
                          onCheckedChange={() => toggleStudent(student.user_id)}
                          aria-label={`Выбрать ${name}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {student.email || student.login || "Контакт не указан"}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <Button
              className="w-full rounded-xl gap-2"
              onClick={handleAddSelected}
              disabled={selectedIds.size === 0 || adding}
            >
              {adding ? <SigmaSpinner size="sm" /> : <UserPlus className="h-4 w-4" />}
              Добавить выбранных{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
