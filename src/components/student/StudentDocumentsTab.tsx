import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Shield,
  FileCheck,
  FileText,
  Inbox,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Video,
  Download,
  ExternalLink,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VideoIdentification } from "@/components/student/VideoIdentification";
import { StudentConsentForm } from "@/components/student/StudentConsentForm";
import { StudentDocumentsUpload } from "@/components/student/StudentDocumentsUpload";
import { StudentDataSubjectRequests } from "@/components/student/StudentDataSubjectRequests";
import { useStudentSignatureInbox, type InboxSignature } from "@/hooks/useStudentSignatureInbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface StudentDocumentsTabProps {
  userId: string;
  userName: string;
  organizationId: string;
  isAdminView?: boolean;
  userEmail?: string;
}

type Status = "pending" | "done";

interface ActionItem {
  key: string;
  status: Status;
  icon: any;
  title: string;
  subtitle?: string;
  cta: string;
  onAction: () => void;
  doneAt?: string | null;
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function StudentDocumentsTab({
  userId,
  userName,
  organizationId,
  isAdminView = false,
  userEmail,
}: StudentDocumentsTabProps) {
  const navigate = useNavigate();
  const inbox = useStudentSignatureInbox(userId);

  // Status state for one-time tasks
  const [videoIdStatus, setVideoIdStatus] = useState<{ verified: boolean; date?: string }>({ verified: false });
  const [consentStatus, setConsentStatus] = useState<{ signed: boolean; date?: string }>({ signed: false });
  const [docsCounts, setDocsCounts] = useState<{ uploaded: number; required: number }>({
    uploaded: 0,
    required: 3,
  });
  const [statusLoading, setStatusLoading] = useState(true);

  // Dialog open states
  const [showVideoId, setShowVideoId] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [showDocs, setShowDocs] = useState(false);

  // Collapsible state
  const [doneOpen, setDoneOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setStatusLoading(true);
      try {
        const [vi, consent, docs] = await Promise.all([
          supabase
            .from("video_identifications")
            .select("status, verified_at, created_at")
            .eq("user_id", userId)
            .in("status", ["verified", "approved"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("student_consents")
            .select("status, signed_at, created_at, expires_at")
            .eq("user_id", userId)
            .eq("status", "signed")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("student_identity_documents")
            .select("type")
            .eq("user_id", userId),
        ]);

        if (cancelled) return;

        if (vi.data) {
          setVideoIdStatus({ verified: true, date: (vi.data as any).verified_at || (vi.data as any).created_at });
        } else {
          setVideoIdStatus({ verified: false });
        }

        if (consent.data) {
          const exp = (consent.data as any).expires_at;
          const stillValid = !exp || new Date(exp) > new Date();
          setConsentStatus({ signed: stillValid, date: (consent.data as any).signed_at });
        } else {
          setConsentStatus({ signed: false });
        }

        const types = new Set((docs.data || []).map((d: any) => d.type));
        const hasPassport = types.has("passport") || types.has("birth_certificate");
        const hasSnils = types.has("snils");
        const hasEdu =
          types.has("education_document") || types.has("diploma") || types.has("attestat");
        setDocsCounts({
          uploaded: [hasPassport, hasSnils, hasEdu].filter(Boolean).length,
          required: 3,
        });
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    };
    if (userId) load();
    return () => {
      cancelled = true;
    };
  }, [userId, showVideoId, showConsent, showDocs]);

  const handleOpenSignature = (sig: InboxSignature) => {
    // Open the public signing page in a new tab — student is already authenticated
    // but the page works with the token directly.
    window.open(`/sign/${sig.signature_token}`, "_blank", "noopener");
  };

  const handleDownloadSigned = async (sig: InboxSignature) => {
    try {
      let path = sig.signed_document_path;
      if (!path) {
        const { data, error } = await supabase.functions.invoke("generate-signature-certificate", {
          body: { signature_id: sig.id },
        });
        if (error) throw error;
        path = data?.path;
      }
      if (!path) {
        toast.error("Документ ещё не сформирован");
        return;
      }
      const { data: signed, error } = await supabase.storage
        .from("signed-documents")
        .createSignedUrl(path, 600);
      if (error || !signed?.signedUrl) throw error || new Error("URL не получен");
      window.open(signed.signedUrl, "_blank", "noopener");
    } catch (e: any) {
      toast.error("Не удалось скачать", { description: e?.message || String(e) });
    }
  };

  // Build action items
  const docsDone = docsCounts.uploaded >= docsCounts.required;

  const actionItems: ActionItem[] = [];

  // Consent
  if (!consentStatus.signed) {
    actionItems.push({
      key: "consent",
      status: "pending",
      icon: Shield,
      title: "Согласие на обработку персональных данных",
      subtitle: "Внутри откроются и соглашение ПЭП, и согласие на ПД",
      cta: "Открыть",
      onAction: () => setShowConsent(true),
    });
  }

  // Documents upload
  if (!docsDone) {
    actionItems.push({
      key: "docs",
      status: "pending",
      icon: FileText,
      title: `Загрузить документы (${docsCounts.uploaded} из ${docsCounts.required})`,
      subtitle: "Паспорт, СНИЛС, документ об образовании",
      cta: "Загрузить",
      onAction: () => setShowDocs(true),
    });
  }

  // Video identification
  if (!videoIdStatus.verified) {
    actionItems.push({
      key: "videoid",
      status: "pending",
      icon: Video,
      title: "Видеоидентификация",
      subtitle: "Подтвердите личность через камеру",
      cta: "Пройти",
      onAction: () => setShowVideoId(true),
    });
  }

  // Pending inbox documents
  inbox.pending.forEach((sig) => {
    actionItems.push({
      key: `inbox-${sig.id}`,
      status: "pending",
      icon: Inbox,
      title: sig.document_title,
      subtitle: sig.sender_name
        ? `От: ${sig.sender_name}`
        : "Документ от организации",
      cta: "Открыть",
      onAction: () => handleOpenSignature(sig),
    });
  });

  // Done items (one-time tasks completed)
  const doneItems: ActionItem[] = [];
  if (consentStatus.signed) {
    doneItems.push({
      key: "consent-done",
      status: "done",
      icon: Shield,
      title: "Согласие на обработку ПД",
      cta: "Открыть",
      onAction: () => setShowConsent(true),
      doneAt: consentStatus.date,
    });
  }
  if (videoIdStatus.verified) {
    doneItems.push({
      key: "videoid-done",
      status: "done",
      icon: ShieldCheck,
      title: "Видеоидентификация",
      cta: "История",
      onAction: () => setShowVideoId(true),
      doneAt: videoIdStatus.date,
    });
  }
  if (docsDone) {
    doneItems.push({
      key: "docs-done",
      status: "done",
      icon: FileCheck,
      title: `Документы загружены (${docsCounts.uploaded} из ${docsCounts.required})`,
      cta: "Управлять",
      onAction: () => setShowDocs(true),
    });
  }

  const allClear = actionItems.length === 0;

  if (statusLoading && inbox.loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-2xl bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* All clear banner */}
      {allClear && (
        <Card className="rounded-2xl border-green-500/30 bg-green-500/5 shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="w-10 h-10 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-sm">Все документы в порядке</p>
              <p className="text-xs text-muted-foreground">
                Видеоидентификация пройдена, согласие подписано, документы загружены
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action required */}
      {actionItems.length > 0 && (
        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
                {actionItems.length}
              </span>
              <h3 className="font-semibold text-base">Требуют действия</h3>
            </div>
            <div className="space-y-2">
              {actionItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.key}
                    className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      {item.subtitle && (
                        <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={item.onAction}
                      className="rounded-lg shrink-0"
                    >
                      {item.cta}
                      <ChevronRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Done — collapsible */}
      {doneItems.length > 0 && (
        <Card className="rounded-2xl border-border/60 shadow-sm">
          <Collapsible open={allClear || doneOpen} onOpenChange={setDoneOpen}>
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <h3 className="font-semibold text-base">Готово</h3>
                  <Badge variant="secondary" className="rounded-full">
                    {doneItems.length}
                  </Badge>
                </div>
                <ChevronDown
                  className={cn(
                    "w-4 h-4 text-muted-foreground transition-transform",
                    (allClear || doneOpen) && "rotate-180"
                  )}
                />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4 sm:px-5 sm:pb-5 space-y-2">
                {doneItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.key}
                      className="flex items-center gap-3 p-3 rounded-xl bg-muted/30"
                    >
                      <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                        {item.doneAt && (
                          <p className="text-xs text-muted-foreground">
                            Завершено {formatDate(item.doneAt)}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={item.onAction}
                        className="rounded-lg shrink-0"
                      >
                        {item.cta}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      {/* Archive — collapsible */}
      {inbox.archive.length > 0 && (
        <Card className="rounded-2xl border-border/60 shadow-sm">
          <Collapsible open={archiveOpen} onOpenChange={setArchiveOpen}>
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-muted-foreground" />
                  <h3 className="font-semibold text-base">Архив документов</h3>
                  <Badge variant="secondary" className="rounded-full">
                    {inbox.archive.length}
                  </Badge>
                </div>
                <ChevronDown
                  className={cn(
                    "w-4 h-4 text-muted-foreground transition-transform",
                    archiveOpen && "rotate-180"
                  )}
                />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4 sm:px-5 sm:pb-5 space-y-2">
                {inbox.archive.map((sig) => {
                  const isSigned = sig.status === "signed";
                  return (
                    <div
                      key={sig.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-muted/30"
                    >
                      <div
                        className={cn(
                          "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                          isSigned ? "bg-green-500/10" : "bg-muted"
                        )}
                      >
                        <FileText
                          className={cn(
                            "w-4 h-4",
                            isSigned ? "text-green-600" : "text-muted-foreground"
                          )}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{sig.document_title}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          {isSigned ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-green-600" />
                              Подписан {formatDate(sig.signed_at)}
                            </>
                          ) : sig.status === "rejected" ? (
                            <>Отклонён {formatDate(sig.created_at)}</>
                          ) : (
                            <>
                              <Clock className="w-3 h-3" /> Истёк {formatDate(sig.expires_at)}
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {isSigned && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDownloadSigned(sig)}
                            className="rounded-lg"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenSignature(sig)}
                          className="rounded-lg"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      {/* Data subject requests (right to access PII) */}
      {!isAdminView && (
        <StudentDataSubjectRequests
          userId={userId}
          organizationId={organizationId}
          userEmail={userEmail}
        />
      )}

      {/* Dialogs for full flows */}
      <Dialog open={showVideoId} onOpenChange={setShowVideoId}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>Видеоидентификация</DialogTitle>
          </DialogHeader>
          <VideoIdentification
            userId={userId}
            userName={userName}
            organizationId={organizationId || undefined}
            embedded={true}
            onVerified={() => setShowVideoId(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showConsent} onOpenChange={setShowConsent}>
        <DialogContent className="max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Согласие на обработку персональных данных</DialogTitle>
          </DialogHeader>
          <StudentConsentForm
            userId={userId}
            userName={userName}
            userEmail={userEmail}
            organizationId={organizationId || ""}
            enrollmentId={undefined}
            embedded={true}
            onConsent={() => setShowConsent(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showDocs} onOpenChange={setShowDocs}>
        <DialogContent className="max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Документы для обучения</DialogTitle>
          </DialogHeader>
          <StudentDocumentsUpload
            userId={userId}
            organizationId={organizationId || ""}
            isOpen={false}
            onOpenChange={() => {}}
            embedded={true}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
