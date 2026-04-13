import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, X, Loader2, ClipboardCheck } from "lucide-react";

interface EnrollmentRequest {
  id: string;
  course_id: string;
  user_id: string;
  status: string;
  created_at: string;
  user_name: string;
  user_email: string;
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

  useEffect(() => {
    loadRequests();
  }, [courseId]);

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
            user_email: profile?.email || "",
          };
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
      // Create enrollment
      const { error: enrollError } = await supabase.from("enrollments").insert({
        user_id: request.user_id,
        course_id: request.course_id,
        status: "active",
        progress: 0,
        ...(defaultAccessDays ? { access_days: defaultAccessDays } : {}),
      });
      if (enrollError) throw enrollError;

      // Update request status
      const { error: updateError } = await supabase
        .from("enrollment_requests")
        .update({ status: "approved", resolved_at: new Date().toISOString() } as any)
        .eq("id", request.id);
      if (updateError) throw updateError;

      toast.success(`Заявка одобрена: ${request.user_name}`);
      loadRequests();
      onRefreshStudents?.();
    } catch (e: any) {
      toast.error("Ошибка одобрения заявки", { description: e.message });
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

      toast.success(`Заявка отклонена: ${request.user_name}`);
      loadRequests();
    } catch (e: any) {
      toast.error("Ошибка отклонения заявки", { description: e.message });
    } finally {
      setProcessingId(null);
    }
  };

  const pendingRequests = requests.filter(r => r.status === "pending");
  const resolvedRequests = requests.filter(r => r.status !== "pending");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
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
              <div key={request.id} className="flex items-center justify-between p-4 bg-secondary/50 rounded-xl">
                <div>
                  <div className="font-medium">{request.user_name}</div>
                  <div className="text-sm text-muted-foreground">{request.user_email}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(request.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => handleApprove(request)}
                    disabled={processingId === request.id}
                  >
                    {processingId === request.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
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
