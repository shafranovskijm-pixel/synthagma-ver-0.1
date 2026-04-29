import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileCheck, Shield, Check, AlertCircle, Download, History, ShieldCheck } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { getErrorMessage } from "@/utils/handleSupabaseError";
import { PEP_AGREEMENT_VERSION } from "@/constants/pepAgreementTemplate";
import { PepSignatureStamp } from "@/components/signing/PepSignatureStamp";
import { buildConsentPdfHtml } from "@/lib/consentPdf";
import { printHtmlContent } from "@/utils/printHtmlToPdf";

interface StudentConsentFormProps {
  userId: string;
  userName: string;
  userEmail?: string;
  organizationId: string;
  enrollmentId?: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onConsent?: () => void;
  embedded?: boolean;
}

interface Organization {
  name: string;
  inn: string | null;
  ogrn: string | null;
  legal_address: string | null;
}

interface ConsentRecord {
  id: string;
  consent_type: "individual" | "organization";
  status: "pending" | "signed" | "rejected" | "expired";
  full_name: string | null;
  signed_at: string | null;
  created_at: string;
  expires_at: string | null;
  policy_version?: string | null;
  ip_address?: string | null;
}

interface PepRecord {
  id: string;
  agreement_version: string;
  accepted_at: string;
}

export const CONSENT_VERSION = "СПД-v1.0";
const CONSENT_PURPOSES = [
  "Заключение и исполнение договора об оказании образовательных услуг",
  "Организация образовательного процесса",
  "Ведение учёта обучающихся",
  "Обеспечение доступа к ЭИОС",
  "Проведение текущего контроля и итоговой аттестации",
  "Оформление, учёт и выдача документов об обучении и квалификации",
  "Исполнение требований законодательства РФ",
];

const CONSENT_TEXT = `Настоящим, в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных», я даю согласие на обработку моих персональных данных.

Цель обработки персональных данных:
• заключение и исполнение договора об оказании платных образовательных услуг;
• организация образовательного процесса;
• ведение учета обучающихся;
• обеспечение доступа к электронной информационно-образовательной среде (ЭИОС);
• проведение текущего контроля и итоговой аттестации;
• оформление, учет и выдача документов об обучении и (или) о квалификации;
• исполнение требований законодательства РФ.

Перечень персональных данных, на обработку которых дается согласие:
• фамилия, имя, отчество;
• дата и место рождения;
• паспортные данные или данные иного документа, удостоверяющего личность;
• адрес регистрации и (или) проживания;
• контактные данные (телефон, адрес электронной почты);
• сведения об образовании, квалификации, месте работы (при необходимости);
• данные об успеваемости, результатах текущего контроля и итоговой аттестации;
• идентификаторы в ЭИОС, данные об активности в ЭИОС;
• изображение (фото/видео) при использовании ЭО/ДОТ и прокторинга (при применимости).

С персональными данными могут совершаться следующие действия:
сбор, запись, систематизация, накопление, хранение, уточнение (обновление, изменение), использование, передача (в случаях, предусмотренных законодательством РФ), обезличивание, блокирование, удаление, уничтожение.

Настоящее согласие действует с даты его подписания и до достижения целей обработки персональных данных либо до отзыва согласия, если иное не предусмотрено законодательством РФ.

Согласие может быть отозвано мной в любое время путем направления письменного уведомления Оператору. Отзыв согласия не влияет на законность обработки персональных данных, осуществленной до момента отзыва.

Подтверждение согласия осуществляется посредством простой электронной подписи (ПЭП) в соответствии с Федеральным законом от 06.04.2011 № 63-ФЗ и Соглашением об использовании ПЭП, ранее заключённым между Сторонами.`;

async function fetchClientIp(): Promise<string | null> {
  try {
    const { data } = await supabase.functions.invoke("get-client-ip", { body: {} });
    return (data as any)?.ip || null;
  } catch {
    return null;
  }
}

export function StudentConsentForm({
  userId,
  userName,
  userEmail,
  organizationId,
  enrollmentId,
  isOpen = false,
  onOpenChange,
  onConsent,
  embedded = false,
}: StudentConsentFormProps) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [emailFromAuth, setEmailFromAuth] = useState<string | null>(userEmail || null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [hasAgreed, setHasAgreed] = useState(false);
  const [consentHistory, setConsentHistory] = useState<ConsentRecord[]>([]);
  const [currentConsent, setCurrentConsent] = useState<ConsentRecord | null>(null);
  const [pepAgreement, setPepAgreement] = useState<PepRecord | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [effectiveOrganizationId, setEffectiveOrganizationId] = useState<string | null>(
    organizationId && organizationId.trim() ? organizationId : null
  );

  const resolveOrganizationId = useCallback(async (): Promise<string | null> => {
    if (organizationId && organizationId.trim()) {
      setEffectiveOrganizationId(organizationId);
      return organizationId;
    }
    try {
      if (enrollmentId) {
        const { data: enr } = await supabase
          .from("enrollments")
          .select("course:courses(organization_id)")
          .eq("id", enrollmentId)
          .maybeSingle();
        const orgFromEnr = (enr as any)?.course?.organization_id as string | undefined;
        if (orgFromEnr) { setEffectiveOrganizationId(orgFromEnr); return orgFromEnr; }
      }
      const { data: anyEnr } = await supabase
        .from("enrollments")
        .select("course:courses(organization_id)")
        .eq("user_id", userId)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const orgFromAnyEnr = (anyEnr as any)?.course?.organization_id as string | undefined;
      if (orgFromAnyEnr) { setEffectiveOrganizationId(orgFromAnyEnr); return orgFromAnyEnr; }
      const { data: prof } = await supabase
        .from("profiles").select("organization_id").eq("user_id", userId).maybeSingle();
      if (prof?.organization_id) { setEffectiveOrganizationId(prof.organization_id); return prof.organization_id; }
    } catch (e) { console.error("Error resolving organization id:", e); }
    setEffectiveOrganizationId(null);
    return null;
  }, [organizationId, enrollmentId, userId]);

  const loadOrganization = useCallback(async (orgId: string) => {
    try {
      const { data } = await supabase
        .from("organizations")
        .select("name, inn, ogrn, legal_address")
        .eq("id", orgId)
        .single();
      if (data) setOrganization(data);
    } catch (error) { console.error("Error loading organization:", error); }
  }, []);

  const loadConsentHistory = useCallback(async (orgId?: string | null) => {
    setIsLoadingHistory(true);
    try {
      const query = supabase
        .from("student_consents")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (orgId) query.eq("organization_id", orgId);
      const { data, error } = await query;
      if (error) throw error;
      if (data && data.length > 0) {
        setConsentHistory(data as ConsentRecord[]);
        setCurrentConsent(data[0] as ConsentRecord);
      } else {
        setConsentHistory([]);
        setCurrentConsent(null);
      }
    } catch (error) {
      console.error("Error loading consent history:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [userId]);

  const loadPepAgreement = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("pep_agreements")
        .select("id, agreement_version, accepted_at")
        .eq("user_id", userId)
        .eq("agreement_version", PEP_AGREEMENT_VERSION)
        .order("accepted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setPepAgreement((data as PepRecord) || null);
    } catch (e) { console.error("Load pep_agreement error", e); }
  }, [userId]);

  const loadEmail = useCallback(async () => {
    if (emailFromAuth) return;
    const { data } = await supabase.auth.getUser();
    if (data.user?.email) setEmailFromAuth(data.user.email);
  }, [emailFromAuth]);

  useEffect(() => {
    if (isOpen || embedded) {
      resolveOrganizationId().then((resolvedId) => {
        if (resolvedId) loadOrganization(resolvedId);
        loadConsentHistory(resolvedId);
        loadPepAgreement();
        loadEmail();
      });
    }
  }, [isOpen, embedded, resolveOrganizationId, loadOrganization, loadConsentHistory, loadPepAgreement, loadEmail]);

  const handleSubmitConsent = async () => {
    if (!hasAgreed) { toast.error("Необходимо согласиться с условиями"); return; }
    if (!pepAgreement) {
      toast.error("Сначала примите Соглашение об использовании ПЭП");
      return;
    }

    let orgIdToUse = effectiveOrganizationId;
    if (!orgIdToUse) orgIdToUse = await resolveOrganizationId();
    if (!orgIdToUse) {
      toast.error("Не удалось определить образовательную организацию. Обратитесь к администратору.");
      return;
    }

    setIsLoading(true);
    try {
      const ip = await fetchClientIp();
      const now = new Date();
      const expiresAt = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

      const { data, error } = await supabase
        .from("student_consents")
        .insert({
          user_id: userId,
          organization_id: orgIdToUse,
          enrollment_id: enrollmentId || null,
          consent_type: "individual",
          status: "signed",
          full_name: userName,
          email: emailFromAuth,
          signed_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          ip_address: ip,
          user_agent: navigator.userAgent,
          policy_version: CONSENT_VERSION,
          purposes: CONSENT_PURPOSES,
        } as any)
        .select()
        .single();
      if (error) throw error;

      setCurrentConsent(data as ConsentRecord);
      setConsentHistory((prev) => [data as ConsentRecord, ...prev]);
      toast.success("Согласие подписано простой электронной подписью");
      onConsent?.();
    } catch (error) {
      console.error("Error saving consent:", error);
      toast.error(getErrorMessage(error, "Ошибка сохранения согласия"));
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("ru-RU", {
      day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "signed": return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Подписано</Badge>;
      case "rejected": return <Badge variant="destructive">Отклонено</Badge>;
      case "expired": return <Badge variant="secondary">Истекло</Badge>;
      default: return <Badge variant="outline">Ожидает подписания</Badge>;
    }
  };

  const handleDownload = () => {
    const orgLine = `${organization?.name || ""}${organization?.inn ? ` · ИНН ${organization.inn}` : ""}${organization?.ogrn ? ` · ОГРН ${organization.ogrn}` : ""}`.trim();
    const stampSrc = currentConsent;
    const html = buildConsentPdfHtml({
      title: "Согласие на обработку персональных данных",
      organizationLine: orgLine || undefined,
      bodyText: `Я, ${userName}, даю согласие${organization?.name ? ` ${organization.name}` : ""} на обработку моих персональных данных на условиях, изложенных ниже.\n\n${CONSENT_TEXT}`,
      stamp: {
        fullName: userName,
        email: emailFromAuth || "",
        signedAt: stampSrc?.signed_at || stampSrc?.created_at || new Date().toISOString(),
        ip: stampSrc?.ip_address || null,
        policyVersion: stampSrc?.policy_version || CONSENT_VERSION,
        consentId: stampSrc?.id || null,
        agreementId: pepAgreement?.id || null,
        agreementAcceptedAt: pepAgreement?.accepted_at || null,
        agreementVersion: pepAgreement?.agreement_version || null,
      },
    });
    printHtmlContent(html, "Согласие на обработку ПД");
  };

  if (isLoadingHistory) {
    const loadingEl = (
      <div className="flex items-center justify-center py-12"><SigmaSpinner size="lg" /></div>
    );
    if (embedded) return loadingEl;
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl rounded-2xl">{loadingEl}</DialogContent>
      </Dialog>
    );
  }

  const isConsentValid = currentConsent?.status === "signed" &&
    (!currentConsent.expires_at || new Date(currentConsent.expires_at) > new Date());

  const mainContent = (
    <div className="space-y-4">
      <div className="mb-4">
        <h3 className="font-display flex items-center gap-2 text-lg font-semibold">
          <Shield className="w-5 h-5 text-primary" />
          Согласие на обработку персональных данных
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          В соответствии с требованиями Федерального закона № 152-ФЗ. Подписывается простой электронной подписью (63-ФЗ).
        </p>
      </div>

      {consentHistory.length > 0 && !showHistory && (
        <Button variant="ghost" size="sm" className="w-fit gap-2" onClick={() => setShowHistory(true)}>
          <History className="w-4 h-4" />
          История согласий ({consentHistory.length})
        </Button>
      )}

      {showHistory ? (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>← Назад</Button>
          <ScrollArea className="h-80">
            <div className="space-y-3">
              {consentHistory.map((record) => (
                <div key={record.id} className="p-4 rounded-xl bg-muted/50">
                  <div className="flex items-center justify-between mb-2">
                    {getStatusBadge(record.status)}
                    <span className="text-xs text-muted-foreground">
                      {record.policy_version || "—"}
                    </span>
                  </div>
                  <p className="text-sm font-medium">{record.full_name}</p>
                  <p className="text-xs text-muted-foreground mt-1">Создано: {formatDate(record.created_at)}</p>
                  {record.signed_at && <p className="text-xs text-muted-foreground">Подписано: {formatDate(record.signed_at)}</p>}
                  {record.expires_at && <p className="text-xs text-muted-foreground">Действует до: {formatDate(record.expires_at)}</p>}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      ) : isConsentValid ? (
        <div className="space-y-4">
          <div className="py-4 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
              <Check className="w-7 h-7 text-green-500" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-green-600">Согласие подписано ПЭП</h3>
              {currentConsent?.signed_at && (
                <p className="text-sm text-muted-foreground mt-1">Подписано: {formatDate(currentConsent.signed_at)}</p>
              )}
              {currentConsent?.expires_at && (
                <p className="text-sm text-muted-foreground">Действует до: {formatDate(currentConsent.expires_at)}</p>
              )}
            </div>
          </div>

          <div className="flex justify-center">
            <PepSignatureStamp
              fullName={userName}
              email={emailFromAuth || ""}
              signedAt={currentConsent?.signed_at || currentConsent?.created_at || new Date().toISOString()}
              ip={currentConsent?.ip_address || undefined}
              agreementId={pepAgreement?.id || undefined}
            />
          </div>

          <div className="flex justify-center">
            <Button variant="outline" onClick={handleDownload} className="rounded-xl gap-2">
              <Download className="w-4 h-4" />
              Скачать согласие (PDF)
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {currentConsent?.status === "expired" && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-600">Срок действия согласия истёк</p>
                <p className="text-xs text-muted-foreground mt-1">Необходимо подписать новое согласие для продолжения обучения.</p>
              </div>
            </div>
          )}

          {!effectiveOrganizationId && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">Не удалось определить образовательную организацию</p>
                <p className="text-xs text-muted-foreground mt-1">Подписание согласия временно недоступно. Обратитесь к менеджеру вашей учебной организации.</p>
              </div>
            </div>
          )}

          {!pepAgreement && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-700">Сначала примите Соглашение об использовании ПЭП</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Без принятого Соглашения об использовании простой электронной подписи подписать согласие нельзя — это требование 63-ФЗ. Найдите карточку «Соглашение об использовании ПЭП» в разделе «Документы» и примите его.
                </p>
              </div>
            </div>
          )}

          <div className="bg-muted/50 rounded-xl p-4">
            <p className="text-sm">
              <strong>{organization?.name || "Образовательная организация"}</strong>
              {organization?.inn && <span className="text-muted-foreground"> • ИНН: {organization.inn}</span>}
              {organization?.ogrn && <span className="text-muted-foreground"> • ОГРН: {organization.ogrn}</span>}
            </p>
          </div>

          <ScrollArea className="h-64 border rounded-xl p-4 bg-card">
            <div className="text-sm whitespace-pre-line">{CONSENT_TEXT}</div>
          </ScrollArea>

          <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-xl">
            <Checkbox
              id="consent-checkbox"
              checked={hasAgreed}
              onCheckedChange={(checked) => setHasAgreed(checked === true)}
            />
            <Label htmlFor="consent-checkbox" className="text-sm cursor-pointer leading-relaxed">
              Я, <strong>{userName}</strong>, ознакомлен(а) с условиями обработки персональных данных и подписываю настоящее согласие простой электронной подписью.
            </Label>
          </div>

          <Button
            className="w-full btn-gradient rounded-xl gap-2"
            onClick={handleSubmitConsent}
            disabled={!hasAgreed || isLoading || !effectiveOrganizationId || !pepAgreement}
          >
            {isLoading ? (
              <><SigmaSpinner size="sm" /> Сохранение...</>
            ) : (
              <><FileCheck className="w-4 h-4" /> Подписать ПЭП</>
            )}
          </Button>
        </div>
      )}
    </div>
  );

  if (embedded) return mainContent;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] rounded-2xl overflow-y-auto">
        {mainContent}
      </DialogContent>
    </Dialog>
  );
}
