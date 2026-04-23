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
    try {
      const groupId = selectedGroupId[request.id];

      // Create enrollment
      const { error: enrollError } = await supabase.from("enrollments").insert({
        user_id: request.user_id,
        course_id: request.course_id,
        status: "active",
        progress: 0,
        ...(defaultAccessDays ? { access_days: defaultAccessDays } : {}) });
      if (enrollError) throw enrollError;

      // If a group was selected, assign student to group
      if (groupId) {
        await supabase
          .from("profiles")
          .update({ student_group_id: groupId } as any)
          .eq("user_id", request.user_id);

        // Send chat notification about group assignment
        const group = groups.find(g => g.id === groupId);
        if (group) {
          const startInfo = group.start_date
            ? `, старт: ${format(new Date(group.start_date), "d MMMM yyyy", { locale: ru })}`
            : "";
          
          await supabase.from("chat_messages").insert({
            user_id: request.user_id,
            course_id: request.course_id,
            role: "system",
            content: `Вы зачислены в группу «${group.name}»${startInfo}. Добро пожаловать!` });
        }
      }

      // Update request status
      const { error: updateError } = await supabase
        .from("enrollment_requests")
        .update({ status: "approved", resolved_at: new Date().toISOString() } as any)
        .eq("id", request.id);
      if (updateError) throw updateError;

      // Get course info for chat message
      const { data: courseInfo } = await supabase
        .from("courses")
        .select("title, organization_id")
        .eq("id", request.course_id)
        .maybeSingle();

      // Send approval message to org general chat
      if (courseInfo?.organization_id) {
        await supabase.from("org_general_messages").insert({
          organization_id: courseInfo.organization_id,
          sender_user_id: (await supabase.auth.getUser()).data.user?.id || "",
          content: `✅ Заявка одобрена: ${request.user_name} зачислен(а) на курс «${courseInfo.title}»`,
        });
      }

      toast.success(`Заявка одобрена: ${request.user_name}`);
      loadRequests();
      onRefreshStudents?.();
    } catch (e) {
      toast.error("Ошибка одобрения заявки", { description: getErrorMessage(e) });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (request: EnrollmentRequest) => {
    setProcessingId(request.id);
    try {
      const { error } = await supabase
        .from("enrollment_requests")
        .update({ status: "rejected", resolved_at: new Date().toISOString() } as any)
        .eq("id", request.id);
      if (error) throw error;

      // Get course info for chat message
      const { data: courseInfo } = await supabase
        .from("courses")
        .select("title, organization_id")
        .eq("id", request.course_id)
        .maybeSingle();

      // Send rejection message to org general chat
      if (courseInfo?.organization_id) {
        await supabase.from("org_general_messages").insert({
          organization_id: courseInfo.organization_id,
          sender_user_id: (await supabase.auth.getUser()).data.user?.id || "",
          content: `❌ Заявка отклонена: ${request.user_name} — курс «${courseInfo.title}»`,
        });
      }

      toast.success(`Заявка отклонена: ${request.user_name}`);
      loadRequests();
    } catch (e) {
      toast.error("Ошибка отклонения заявки", { description: getErrorMessage(e) });
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
