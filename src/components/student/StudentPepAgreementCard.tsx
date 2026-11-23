import { useEffect, useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, CheckCircle2, Download, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PepAgreementDialog } from "@/components/signing/PepAgreementDialog";
import { getPepAgreementText, PEP_AGREEMENT_VERSION } from "@/constants/pepAgreementTemplate";
import { buildPepAgreementPdfHtml } from "@/lib/consentPdf";
import { printHtmlContent } from "@/utils/printHtmlToPdf";
import { getErrorMessage } from "@/utils/handleSupabaseError";

export interface StudentPepAgreement {
  id: string;
  agreement_text: string;
  agreement_version: string;
  accepted_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

interface Props {
  userId: string;
  userName: string;
  userEmail?: string | null;
  organizationId: string | null;
  organizationName?: string | null;
  organizationInn?: string | null;
  /** Сообщать наверх о статусе ПЭП-соглашения */
  onStatusChange?: (current: StudentPepAgreement | null) => void;
  embedded?: boolean;
}

async function fetchClientIp(): Promise<string | null> {
  try {
    const { data } = await supabase.functions.invoke("get-client-ip", { body: {} });
    return (data as any)?.ip || null;
  } catch {
    return null;
  }
}

export function StudentPepAgreementCard({
  userId,
  userName,
  userEmail,
  organizationId,
  organizationName,
  organizationInn,
  onStatusChange,
  embedded = false,
}: Props) {
  const scopeKey = JSON.stringify([userId, organizationId]);
  const scope = useRef({ key: scopeKey });
  if (scope.current.key !== scopeKey) scope.current = { key: scopeKey };
  const owner = scope.current;
  const mounted = useRef(false);
  const statusCallback = useRef(onStatusChange);
  statusCallback.current = onStatusChange;
  const pending = useRef<object | null>(null);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({ owner, key: scopeKey, current: null as StudentPepAgreement | null, loading: true, dialogOpen: false, submitting: false, loadError: false });
  const value = state.owner === owner ? state : { owner, key: scopeKey, current: null, loading: true, dialogOpen: false, submitting: false, loadError: false };
  const { current, loading, dialogOpen, submitting, loadError } = value;
  const isCurrent = () => mounted.current && scope.current === owner;
  const update = (patch: Partial<typeof state>) => {
    if (isCurrent()) setState(old => old.owner === owner ? { ...old, ...patch } : old);
  };
  const setDialogOpen = (open: boolean) => update({ dialogOpen: open });

  const today = new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
  const agreementText = getPepAgreementText({
    org_name: organizationName || "Образовательная организация",
    org_inn: organizationInn || undefined,
    user_name: userName,
    user_email: userEmail,
    current_date: today,
  });

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    const stillCurrent = () => !cancelled && scope.current === owner;
    pending.current = null;
    setState({ owner, key: scopeKey, current: null, loading: !!organizationId && !!userId, dialogOpen: false, submitting: false, loadError: false });
    statusCallback.current?.(null);
    if (organizationId && userId) {
      void (async () => {
        try {
          const { data, error } = await supabase
            .from("pep_agreements")
            .select("*")
            .eq("user_id", userId)
            .eq("organization_id", organizationId)
            .eq("agreement_version", PEP_AGREEMENT_VERSION)
            .order("accepted_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!stillCurrent()) return;
          if (error) throw error;
          const record = (data as StudentPepAgreement) || null;
          setState(old => old.owner === owner ? { ...old, current: record, loading: false, loadError: false } : old);
          statusCallback.current?.(record);
        } catch (error) {
          if (!stillCurrent()) return;
          console.error("Load pep_agreement error", error);
          setState(old => old.owner === owner ? { ...old, current: null, loading: false, loadError: true } : old);
          statusCallback.current?.(null);
        }
      })();
    }
    return () => { cancelled = true; mounted.current = false; };
  }, [scopeKey, userId, organizationId, owner, retry]);

  const handleAccept = async () => {
    if (!isCurrent() || !userId || loading || loadError || submitting || current || pending.current) return;
    if (!organizationId) {
      toast.error("Не удалось определить образовательную организацию");
      return;
    }
    const operation = {};
    pending.current = operation;
    update({ submitting: true });
    try {
      const ip = await fetchClientIp();
      if (!isCurrent() || pending.current !== operation) return;
      const { data, error } = await supabase
        .from("pep_agreements")
        .insert({
          organization_id: organizationId,
          user_id: userId,
          email: userEmail,
          full_name: userName,
          agreement_text: agreementText,
          agreement_version: PEP_AGREEMENT_VERSION,
          accepted_at: new Date().toISOString(),
          ip_address: ip,
          user_agent: navigator.userAgent,
        })
        .select()
        .single();
      if (!isCurrent() || pending.current !== operation) return;
      if (error) throw error;
      const record = data as StudentPepAgreement;
      update({ current: record });
      statusCallback.current?.(record);
      toast.success("Соглашение об использовании ПЭП принято");
    } catch (error) {
      if (!isCurrent() || pending.current !== operation) return;
      console.error("Accept pep_agreement error", error);
      toast.error(getErrorMessage(error, "Не удалось сохранить принятие соглашения"));
    } finally {
      if (isCurrent() && pending.current === operation) {
        pending.current = null;
        update({ submitting: false });
      }
    }
  };

  const handleDownload = async () => {
    try {
    if (!isCurrent() || !current) return;
    const orgLine = `${organizationName || ""}${organizationInn ? ` · ИНН ${organizationInn}` : ""}`.trim();
    const html = buildPepAgreementPdfHtml({
      title: "Соглашение об использовании простой электронной подписи",
      organizationLine: orgLine || undefined,
      bodyText: current.agreement_text,
      stamp: {
        fullName: userName,
        email: userEmail,
        signedAt: current.accepted_at,
        ip: current.ip_address,
        policyVersion: current.agreement_version,
        agreementId: current.id,
        agreementAcceptedAt: current.accepted_at,
        agreementVersion: current.agreement_version,
      },
    });
    await printHtmlContent(html, "Соглашение об использовании ПЭП");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Не удалось подготовить документ для печати"); }
  };

  const isAccepted = !!current;

  return (
    <>
      <Card className={`rounded-2xl border ${isAccepted ? "border-green-500/30 bg-green-500/5" : "border-border/60"} shadow-sm`}>
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isAccepted ? "bg-green-500/15" : "bg-primary/10"}`}>
              {isAccepted ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <ShieldCheck className="w-5 h-5 text-primary" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm sm:text-base">Соглашение об использовании простой электронной подписи</h3>
                {isAccepted && <Badge className="bg-green-500/10 text-green-700 border-green-500/20">Принято</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {isAccepted
                  ? `Принято ${new Date(current!.accepted_at).toLocaleString("ru-RU", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })} · версия ${current!.agreement_version}`
                  : loading ? "Проверяем сохранённое соглашение…"
                  : loadError ? "Не удалось проверить соглашение. Повторите проверку."
                  : !organizationId ? "Не удалось определить образовательную организацию"
                  : "Сохранённого соглашения для этой организации пока нет"}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {loadError && <Button size="sm" variant="outline" onClick={() => setRetry(value => value + 1)}>Повторить проверку</Button>}
                {!isAccepted ? (
                  <Button size="sm" onClick={() => setDialogOpen(true)} disabled={loading || submitting || loadError || !organizationId || !userId} className="rounded-lg gap-2">
                    <FileText className="w-4 h-4" />
                    Открыть и подписать
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)} className="rounded-lg gap-2">
                      <FileText className="w-4 h-4" />
                      Просмотреть
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleDownload} className="rounded-lg gap-2">
                      <Download className="w-4 h-4" />
                      Скачать (PDF)
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <PepAgreementDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        agreementText={current?.agreement_text ?? agreementText}
        onAccept={isAccepted ? undefined : handleAccept}
      />
    </>
  );
}
