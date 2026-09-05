import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, UserPlus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { fetchOrganizationStudentsPage } from "@/api/students";
import { EnrollmentAccessExpiredError, isEnrollmentAccessExpired } from "@/api/enrollments";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";

interface AvailableStudent {
  user_id: string;
  full_name: string | null;
  email: string | null;
  login: string | null;
}

interface RegistrationResult {
  user_id?: string;
  success?: boolean;
  partial_success?: boolean;
  message?: string;
  error?: string;
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
  const [creationWarning, setCreationWarning] = useState<string | null>(null);
  const creatingRef = useRef(false);
  const scopeKey = JSON.stringify([organizationId, groupId]);
  const dialogContextRef = useRef<{ open: boolean; scopeKey: string } | null>(null);
  // Keep uncertain attempts across close/reopen in this mounted dialog only.
  // No learner details or operation state are written to browser storage.
  const creationWarningsRef = useRef(new Map<string, string>());

  useLayoutEffect(() => {
    dialogContextRef.current = { open, scopeKey };
    return () => { dialogContextRef.current = null; };
  }, [open, scopeKey]);

  const loadAvailableStudents = useCallback(async () => {
    const context = dialogContextRef.current;
    const isCurrent = () => context?.open && dialogContextRef.current === context;
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
        if (!isCurrent()) return;
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
      if (!isCurrent()) return;
      console.error("Failed to load students available for group", error);
      toast.error("Не удалось загрузить учеников без группы");
      setAvailableStudents([]);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set());
    setSearch("");
    const warning = creationWarningsRef.current.get(scopeKey) ?? null;
    setShowCreateForm(Boolean(warning));
    setNewStudentName("");
    setNewStudentEmail("");
    setCreationWarning(warning);
    void loadAvailableStudents();
  }, [open, scopeKey, loadAvailableStudents]);

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

      toast.success(`${updatedCount} ${updatedCount === 1 ? "ученик добавлен" : "ученика добавлено"} только в группу`, {
        description: "На курс ещё не зачислены. Следующий шаг — «Зачислить на курс».",
      });
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
    const context = dialogContextRef.current;
    const isCurrentOperation = () => context?.open && dialogContextRef.current === context;
    if (!fullName || !isCurrentOperation() || creatingRef.current || creationWarning || creationWarningsRef.current.has(scopeKey)) return;
    creatingRef.current = true;
    setCreating(true);
    // If the view changes before verification, returning to this group must
    // not offer a blind retry. This is not server-side idempotency.
    creationWarningsRef.current.set(scopeKey,
      `Результат регистрации в группе «${groupName}» не подтверждён. Запрос мог сохранить ученика. ` +
      "Проверьте список учеников и обратитесь к администратору перед повторным созданием.");
    let confirmedRejection = false;
    let registeredUserId: string | null = null;

    const refreshPopulation = async () => {
      if (!isCurrentOperation()) return false;
      try {
        await onStudentsChanged("population");
        return true;
      } catch (refreshError) {
        console.error("Failed to refresh students after registration", refreshError);
        return false;
      }
    };

    try {
      // A lost response can leave a created account. Never retry this write.
      const { data, error, httpStatus, errorCode } = await safeInvoke<RegistrationResult>("register-student", {
        retry: false,
        body: {
          full_name: fullName,
          email: newStudentEmail.trim() || undefined,
          organization_id: organizationId,
          student_group_id: groupId,
        },
      });
      if (!isCurrentOperation()) return;
      if (error) {
        // Some 409 responses follow a confirmed backend compensation rather
        // than a pre-write rejection; neither is an ambiguous partial result.
        confirmedRejection = (httpStatus !== undefined && [400, 401, 403, 404, 409].includes(httpStatus))
          || (httpStatus === 500 && ["GROUP_PREFLIGHT_FAILED", "GROUP_COURSE_PREFLIGHT_FAILED"].includes(errorCode ?? ""));
        throw error;
      }
      if (typeof data?.user_id === "string" && data.user_id.trim()) registeredUserId = data.user_id;
      if (data?.partial_success || data?.error || data?.success === false) {
        throw new Error(data?.error || data?.message || "Сервер сообщил о частичном завершении операции");
      }
      if (!registeredUserId) throw new Error("Сервер не вернул подтверждённый идентификатор ученика");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, organization_id, student_group_id")
        .eq("user_id", registeredUserId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (!isCurrentOperation()) return;
      if (profileError) throw profileError;
      if (profile?.user_id !== registeredUserId || profile.organization_id !== organizationId || profile.student_group_id !== groupId) {
        throw new Error("База не подтвердила добавление ученика в выбранную группу");
      }

      // register-student also enrolls in the group's course when one is set.
      // Read the current group instead of trusting stale dialog/server flags.
      const { data: group, error: groupError } = await supabase
        .from("student_groups")
        .select("id, organization_id, course_id")
        .eq("id", groupId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (!isCurrentOperation()) return;
      if (groupError) throw groupError;
      if (group?.id !== groupId || group.organization_id !== organizationId
        || (group.course_id !== null && (typeof group.course_id !== "string" || !group.course_id.trim()))) {
        throw new Error("База не подтвердила настройки выбранной группы");
      }

      if (group.course_id) {
        const { data: course, error: courseError } = await supabase
          .from("courses")
          .select("id, organization_id")
          .eq("id", group.course_id)
          .eq("organization_id", organizationId)
          .maybeSingle();
        if (!isCurrentOperation()) return;
        if (courseError) throw courseError;
        if (course?.id !== group.course_id || course.organization_id !== organizationId) {
          throw new Error("База не подтвердила принадлежность курса группы организации");
        }
        const { data: enrollment, error: enrollmentError } = await supabase
          .from("enrollments")
          .select("id, user_id, course_id, status, expires_at")
          .eq("user_id", registeredUserId)
          .eq("course_id", group.course_id)
          .maybeSingle();
        if (!isCurrentOperation()) return;
        if (enrollmentError) throw enrollmentError;
        if (!enrollment?.id || enrollment.user_id !== registeredUserId || enrollment.course_id !== group.course_id) {
          throw new Error("База не подтвердила зачисление на курс группы");
        }
        if (isEnrollmentAccessExpired(enrollment)) throw new EnrollmentAccessExpiredError([group.course_id]);
      }

      const refreshed = await refreshPopulation();
      if (!isCurrentOperation()) return;
      creationWarningsRef.current.delete(scopeKey);
      const resultMessage = group.course_id
        ? "Ученик добавлен в группу и зачислен на её курс"
        : "Ученик добавлен в группу";
      toast.success(resultMessage, {
        description: group.course_id
          ? `Группа «${groupName}» и зачисление подтверждены в базе.`
          : `У группы «${groupName}» нет курса. Зачисление можно выполнить отдельно на этапе «Обучение».`,
      });
      if (!refreshed) toast.warning("Данные сохранены, но список не обновился. Обновите страницу, чтобы увидеть ученика.");
      onOpenChange(false);
    } catch (error) {
      if (!isCurrentOperation()) return;
      console.error("Failed to create student in group", error);
      const reason = error instanceof Error ? error.message : "Не удалось подтвердить результат операции";
      if (confirmedRejection) {
        creationWarningsRef.current.delete(scopeKey);
        toast.error(reason);
      } else {
        const warning = registeredUserId
          ? `Сервер вернул ученика, но завершение операции не подтверждено: ${reason}. Проверьте его карточку и группу. Не создавайте ученика повторно.`
          : "Результат создания ученика не подтверждён. Запрос мог сохранить ученика, даже если ответ не получен. " +
            "Проверьте список учеников и обратитесь к администратору перед повторным созданием. Отсутствие в списке не доказывает, что запрос завершился.";
        creationWarningsRef.current.set(scopeKey, warning);
        setCreationWarning(warning);
        toast.warning(warning, { duration: 30000 });
        await refreshPopulation();
      }
    } finally {
      creatingRef.current = false;
      if (dialogContextRef.current) setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen && creatingRef.current) return;
      onOpenChange(nextOpen);
    }}>
      <DialogContent className="flex max-h-[82vh] max-w-xl flex-col rounded-2xl">
        <DialogHeader>
          <DialogTitle>Добавить учеников в «{groupName}»</DialogTitle>
          <DialogDescription>
            Выбранные из списка ученики добавляются только в группу. При создании нового ученика учитывается курс группы: если он задан, зачисление проверяется сразу.
          </DialogDescription>
        </DialogHeader>

        {showCreateForm ? (
          <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-2 font-medium">
              <Plus className="h-4 w-4 text-primary" />
              Новый ученик
            </div>
            {creationWarning && (
              <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                {creationWarning}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="group-new-student-name">ФИО *</Label>
              <Input
                id="group-new-student-name"
                value={newStudentName}
                disabled={creating}
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
                disabled={creating}
                onChange={(event) => setNewStudentEmail(event.target.value)}
                placeholder="student@example.ru"
                className="rounded-xl"
              />
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 rounded-xl gap-2"
                onClick={handleCreateStudent}
                disabled={!newStudentName.trim() || creating || Boolean(creationWarning)}
              >
                {creating ? <SigmaSpinner size="sm" /> : <UserPlus className="h-4 w-4" />}
                Создать и добавить в группу
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
              Добавить только в группу{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Следующий шаг после добавления — «Зачислить на курс» в разделе «Обучение».
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
