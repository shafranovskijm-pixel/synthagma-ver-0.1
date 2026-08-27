import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";
import { Check, X, ClipboardCheck, Users } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import {
  EnrollmentAccessExpiredError,
  EnrollmentPersistenceError,
  ensureEnrollmentVerified,
} from "@/api/enrollments";

interface EnrollmentRequest {
  id: string;
  course_id: string;
  user_id: string;
  status: string;
  created_at: string;
  user_name: string;
  user_email: string;
}

interface CourseGroup {
  id: string;
  name: string;
  start_date: string | null;
}

interface EnrollmentRequestsTabProps {
  courseId: string;
  defaultAccessDays?: number | null;
  onRefreshStudents?: () => void;
}

export function EnrollmentRequestsTab({ courseId, defaultAccessDays, onRefreshStudents }: EnrollmentRequestsTabProps) {
  const [requests, setRequests] = useState<EnrollmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [groups, setGroups] = useState<CourseGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<Record<string, string>>({});

  useEffect(() => {
    loadRequests();
    loadGroups();
  }, [courseId]);

  const loadGroups = async () => {
    try {
      // Find groups linked to this course via registration_links
      const { data: links } = await supabase
        .from("registration_links")
        .select("student_group_id")
        .eq("course_id", courseId)
        .not("student_group_id", "is", null);

      if (links && links.length > 0) {
        const groupIds = [...new Set(links.map(l => l.student_group_id).filter(Boolean))];
        if (groupIds.length > 0) {
          const { data: groupsData } = await supabase
            .from("student_groups")
            .select("id, name, start_date")
            .in("id", groupIds as string[])
            .order("name");
          setGroups((groupsData as any[] || []) as CourseGroup[]);
        }
      }
    } catch (e) {
      console.error("Failed to load groups", e);
    }
  };

  const loadRequests = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("enrollment_requests")
        .select("id, course_id, user_id, status, created_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });

      if (data && data.length > 0) {
        const userIds = data.map(r => r.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", userIds);
        
        const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
        
        setRequests(data.map(r => {
          const profile = profileMap.get(r.user_id);
          return {
            ...r,
            user_name: profile?.full_name || "Без имени",
            user_email: profile?.email || "" };
        }));
      } else {
        setRequests([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (request: EnrollmentRequest) => {
    setProcessingId(request.id);
    let enrollmentConfirmed = false;
    let requestApproved = false;
    let requestTransitioned = false;
    let approvalRecoveryRequired = false;

    try {
      const groupId = selectedGroupId[request.id];

      const { data: initialRequest, error: initialRequestError } = await supabase
        .from("enrollment_requests")
        .select("id, status, course_id, user_id")
        .eq("id", request.id)
        .eq("course_id", request.course_id)
        .eq("user_id", request.user_id)
        .maybeSingle();

      if (initialRequestError) throw initialRequestError;
      if (!initialRequest) {
        throw new Error("Заявка не найдена или недоступна.");
      }

      const requestInitiallyApproved = initialRequest.status === "approved";
      if (!requestInitiallyApproved && initialRequest.status !== "pending") {
        throw new Error("Заявка уже обработана и не может быть одобрена повторно.");
      }

      if (requestInitiallyApproved) {
        requestApproved = true;
      } else {
        // Claim the exact pending request before creating enrollment or changing
        // the group. Only one approve/reject action can win this transition.
        const { data: transitionedRequest, error: updateError } = await supabase
          .from("enrollment_requests")
          .update({
            status: "approved",
            resolved_at: new Date().toISOString(),
          } as any)
          .eq("id", request.id)
          .eq("course_id", request.course_id)
          .eq("user_id", request.user_id)
          .eq("status", "pending")
          .select("id, status, course_id, user_id")
          .maybeSingle();

        if (!updateError && transitionedRequest) {
          if (
            transitionedRequest.id !== request.id
            || transitionedRequest.course_id !== request.course_id
            || transitionedRequest.user_id !== request.user_id
            || transitionedRequest.status !== "approved"
          ) {
            throw new Error("База вернула другую заявку вместо подтверждённой.");
          }
          requestTransitioned = true;
          requestApproved = true;
        } else {
          // Reconcile a concurrent winner or a response lost after commit.
          const { data: approvedReadback, error: approvedReadbackError } = await supabase
            .from("enrollment_requests")
            .select("id, status, course_id, user_id")
            .eq("id", request.id)
            .eq("course_id", request.course_id)
            .eq("user_id", request.user_id)
            .maybeSingle();

          if (approvedReadbackError) {
            throw updateError || approvedReadbackError;
          }
          if (
            !approvedReadback
            || approvedReadback.id !== request.id
            || approvedReadback.course_id !== request.course_id
            || approvedReadback.user_id !== request.user_id
          ) {
            if (updateError) throw updateError;
            throw new Error("База не подтвердила обработку заявки.");
          }
          if (approvedReadback.status === "rejected") {
            throw new Error("Заявка уже отклонена другим пользователем.");
          }
          if (approvedReadback.status !== "approved") {
            if (updateError) throw updateError;
            throw new Error("База не подтвердила одобрение заявки.");
          }

          requestApproved = true;
        }
      }

      try {
        // Even an already-approved or concurrently-approved request must prove
        // the exact enrollment row before the UI may report success.
        await ensureEnrollmentVerified({
          user_id: request.user_id,
          course_id: request.course_id,
          status: "active",
          progress: 0,
          ...(defaultAccessDays ? { access_days: defaultAccessDays } : {}),
        });
        enrollmentConfirmed = true;
      } catch (enrollmentError) {
        if (requestTransitioned) {
          try {
            const { data: rolledBackRequest, error: rollbackError } = await supabase
              .from("enrollment_requests")
              .update({ status: "pending", resolved_at: null } as any)
              .eq("id", request.id)
              .eq("course_id", request.course_id)
              .eq("user_id", request.user_id)
              .eq("status", "approved")
              .select("id, status, course_id, user_id")
              .maybeSingle();

            if (
              rollbackError
              || !rolledBackRequest
              || rolledBackRequest.id !== request.id
              || rolledBackRequest.course_id !== request.course_id
              || rolledBackRequest.user_id !== request.user_id
              || rolledBackRequest.status !== "pending"
            ) {
              approvalRecoveryRequired = true;
            } else {
              requestApproved = false;
              requestTransitioned = false;
            }
          } catch {
            approvalRecoveryRequired = true;
          }
        }
        throw enrollmentError;
      }

      if (!requestTransitioned) {
        toast.success(`Заявка уже одобрена: ${request.user_name}`);
        loadRequests();
        onRefreshStudents?.();
        return;
      }

      let selectedGroup: CourseGroup | undefined;
      if (groupId) {
        const { data: updatedProfile, error: groupUpdateError } = await supabase
          .from("profiles")
          .update({ student_group_id: groupId } as any)
          .eq("user_id", request.user_id)
          .select("user_id, student_group_id")
          .maybeSingle();

        if (groupUpdateError) throw groupUpdateError;
        if (
          !updatedProfile
          || updatedProfile.user_id !== request.user_id
          || updatedProfile.student_group_id !== groupId
        ) {
          throw new Error("База не подтвердила назначение ученика в выбранную группу.");
        }

        selectedGroup = groups.find((group) => group.id === groupId);
      }

      // Notifications are best-effort and cannot roll back a confirmed approval.
      try {
        if (selectedGroup) {
          const startInfo = selectedGroup.start_date
            ? `, старт: ${format(
                new Date(selectedGroup.start_date),
                "d MMMM yyyy",
                { locale: ru },
              )}`
            : "";

          await supabase.from("chat_messages").insert({
            user_id: request.user_id,
            course_id: request.course_id,
            role: "system",
            content: `Вы зачислены в группу «${selectedGroup.name}»${startInfo}. Добро пожаловать!`,
          });
        }

        const { data: courseInfo } = await supabase
          .from("courses")
          .select("title, organization_id")
          .eq("id", request.course_id)
          .maybeSingle();

        if (courseInfo?.organization_id) {
          await supabase.from("org_general_messages").insert({
            organization_id: courseInfo.organization_id,
            sender_user_id: (await supabase.auth.getUser()).data.user?.id || "",
            content: `✅ Заявка одобрена: ${request.user_name} зачислен(а) на курс «${courseInfo.title}»`,
          });
        }
      } catch (notificationError) {
        console.warn("Approval notification was not sent", notificationError);
      }

      toast.success(`Заявка одобрена: ${request.user_name}`);
      loadRequests();
      onRefreshStudents?.();
    } catch (error) {
      loadRequests();

      if (
        enrollmentConfirmed
        || requestApproved
        || error instanceof EnrollmentPersistenceError
        || error instanceof EnrollmentAccessExpiredError
      ) {
        onRefreshStudents?.();
      }

      let description = getErrorMessage(error);
      if (approvalRecoveryRequired) {
        description =
          `Зачисление не подтверждено, а статус заявки не удалось безопасно вернуть: ${description} ` +
          "Обновите страницу и не создавайте дубль.";
      } else if (error instanceof EnrollmentPersistenceError) {
        description =
          "База не подтвердила зачисление. Обновите список учеников и повторите операцию.";
      } else if (requestApproved && enrollmentConfirmed) {
        description =
          `Зачисление и заявка уже подтверждены, но выбранная группа не назначена: ${description} ` +
          "Назначьте группу в карточке ученика.";
      }

      toast.error("Ошибка одобрения заявки", { description });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (request: EnrollmentRequest) => {
    setProcessingId(request.id);

    try {
      const { data: transitionedRequest, error: updateError } = await supabase
        .from("enrollment_requests")
        .update({
          status: "rejected",
          resolved_at: new Date().toISOString(),
        } as any)
        .eq("id", request.id)
        .eq("course_id", request.course_id)
        .eq("user_id", request.user_id)
        .eq("status", "pending")
        .select("id, status, course_id, user_id")
        .maybeSingle();

      let requestTransitioned = false;
      if (!updateError && transitionedRequest) {
        if (
          transitionedRequest.id !== request.id
          || transitionedRequest.course_id !== request.course_id
          || transitionedRequest.user_id !== request.user_id
          || transitionedRequest.status !== "rejected"
        ) {
          throw new Error("База вернула другую заявку вместо отклонённой.");
        }
        requestTransitioned = true;
      } else {
        const { data: requestReadback, error: readbackError } = await supabase
          .from("enrollment_requests")
          .select("id, status, course_id, user_id")
          .eq("id", request.id)
          .eq("course_id", request.course_id)
          .eq("user_id", request.user_id)
          .maybeSingle();

        if (readbackError) throw updateError || readbackError;
        if (
          !requestReadback
          || requestReadback.id !== request.id
          || requestReadback.course_id !== request.course_id
          || requestReadback.user_id !== request.user_id
        ) {
          if (updateError) throw updateError;
          throw new Error("База не подтвердила обработку заявки.");
        }
        if (requestReadback.status === "approved") {
          throw new Error("Заявка уже одобрена и не может быть отклонена.");
        }
        if (requestReadback.status !== "rejected") {
          if (updateError) throw updateError;
          throw new Error("База не подтвердила отклонение заявки.");
        }
      }

      if (requestTransitioned) {
        try {
          const { data: courseInfo } = await supabase
            .from("courses")
            .select("title, organization_id")
            .eq("id", request.course_id)
            .maybeSingle();

          if (courseInfo?.organization_id) {
            await supabase.from("org_general_messages").insert({
              organization_id: courseInfo.organization_id,
              sender_user_id: (await supabase.auth.getUser()).data.user?.id || "",
              content: `❌ Заявка отклонена: ${request.user_name} — курс «${courseInfo.title}»`,
            });
          }
        } catch (notificationError) {
          console.warn("Rejection notification was not sent", notificationError);
        }
      }

      toast.success(
        requestTransitioned
          ? `Заявка отклонена: ${request.user_name}`
          : `Заявка уже отклонена: ${request.user_name}`,
      );
      loadRequests();
    } catch (error) {
      loadRequests();
      toast.error("Ошибка отклонения заявки", { description: getErrorMessage(error) });
    } finally {
      setProcessingId(null);
    }
  };

  const pendingRequests = requests.filter(r => r.status === "pending");
  const resolvedRequests = requests.filter(r => r.status !== "pending");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <SigmaSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-3">Ожидают одобрения ({pendingRequests.length})</h3>
        {pendingRequests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Нет заявок на рассмотрении</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pendingRequests.map(request => (
              <div key={request.id} className="flex items-center justify-between p-4 bg-secondary/50 rounded-xl gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{request.user_name}</div>
                  <div className="text-sm text-muted-foreground">{request.user_email}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(request.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {groups.length > 0 && (
                    <Select
                      value={selectedGroupId[request.id] || ""}
                      onValueChange={(val) => setSelectedGroupId(prev => ({ ...prev, [request.id]: val }))}
                    >
                      <SelectTrigger className="w-[180px] h-9 text-xs">
                        <Users className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                        <SelectValue placeholder="Группа (опц.)" />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map(g => (
                          <SelectItem key={g.id} value={g.id} className="text-xs">
                            {g.name}
                            {g.start_date && (
                              <span className="ml-1 text-muted-foreground">
                                ({format(new Date(g.start_date), "dd.MM.yy")})
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => handleApprove(request)}
                    disabled={processingId === request.id}
                  >
                    {processingId === request.id ? <SigmaSpinner size="sm" /> : <Check className="w-4 h-4" />}
                    Одобрить
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => handleReject(request)}
                    disabled={processingId === request.id}
                  >
                    <X className="w-4 h-4" />
                    Отклонить
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {resolvedRequests.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3 text-muted-foreground">Обработанные заявки</h3>
          <div className="space-y-2">
            {resolvedRequests.map(request => (
              <div key={request.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl opacity-70">
                <div>
                  <div className="font-medium text-sm">{request.user_name}</div>
                  <div className="text-xs text-muted-foreground">{request.user_email}</div>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs ${
                  request.status === "approved" ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive"
                }`}>
                  {request.status === "approved" ? "Одобрена" : "Отклонена"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
