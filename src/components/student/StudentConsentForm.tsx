import { useState, useEffect, useRef } from "react";
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
import { getPepAgreementText } from "@/constants/pepAgreementTemplate";
import { useSignatureReadScope } from "@/hooks/useSignatureReadScope";

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
  agreement_text: string | null;
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

export function StudentConsentForm(props: StudentConsentFormProps) {
  const scope = useSignatureReadScope([
    props.userId, props.organizationId, props.enrollmentId ?? null,
    props.userName, props.userEmail ?? null,
  ], !!(props.isOpen || props.embedded));
  return <StudentConsentFormOwned key={scope.key} {...props} actorId={scope.actorId} assertOwner={scope.capture()} />;
}

function StudentConsentFormOwned({
  userId, userName, userEmail, organizationId, enrollmentId,
  isOpen = false, onOpenChange, onConsent, embedded = false, actorId, assertOwner,
}: StudentConsentFormProps & { actorId: string | null; assertOwner: () => void }) {
  const owner = useRef(assertOwner);
  const lifetime = useRef({ mounted: true, busy: false });
  const onConsentRef = useRef(onConsent);
  onConsentRef.current = onConsent;
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [emailFromAuth, setEmailFromAuth] = useState<string | null>(userEmail || null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [hasAgreed, setHasAgreed] = useState(false);
  const [consentHistory, setConsentHistory] = useState<ConsentRecord[]>([]);
  const [currentConsent, setCurrentConsent] = useState<ConsentRecord | null>(null);
  const [pepAgreement, setPepAgreement] = useState<PepRecord | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [effectiveOrganizationId, setEffectiveOrganizationId] = useState<string | null>(null);
  const isSelf = actorId === userId;
  const assertCurrent = () => {
    owner.current();
    if (!lifetime.current.mounted) throw new Error('Контекст изменился. Откройте согласие заново.');
  };
  const isCurrent = () => { try { assertCurrent(); return true; } catch { return false; } };
  useEffect(() => {
    lifetime.current.mounted = true;
    return () => { lifetime.current.mounted = false; };
  }, []);

  // Only the selected enrollment may resolve an organization. An unrelated
  // latest enrollment or the preview actor's profile is not consent evidence.
  const resolveOrganizationId = async (): Promise<string> => {
    assertCurrent();
    const explicit = organizationId.trim();
    if (enrollmentId) {
      const { data, error } = await supabase.from('enrollments')
        .select('course:courses(organization_id)').eq('id', enrollmentId).eq('user_id', userId).maybeSingle();
      assertCurrent();
      if (error) throw error;
      const course = (data as unknown as { course?: { organization_id?: string } | null } | null)?.course;
      const bound = course?.organization_id;
      if (!bound || (explicit && explicit !== bound)) {
        throw new Error('Не удалось подтвердить организацию выбранного обучения.');
      }
      return bound;
    }
    if (!explicit) throw new Error('Не выбрана образовательная организация.');
    return explicit;
  };

  useEffect(() => {
    if (!isOpen && !embedded) return;
    let active = true;
    const clear = () => {
      setOrganization(null); setConsentHistory([]); setCurrentConsent(null);
      setPepAgreement(null); setEffectiveOrganizationId(null); setHasAgreed(false);
      setEmailFromAuth(userEmail || null);
    };
    clear(); setLoadError(null); setIsLoadingHistory(true);
    void (async () => {
      try {
        const orgId = await resolveOrganizationId();
        const [org, history, agreement, auth] = await Promise.all([
          supabase.from('organizations').select('name, inn, ogrn, legal_address').eq('id', orgId).single(),
          supabase.from('student_consents').select('*').eq('user_id', userId)
            .eq('organization_id', orgId).order('created_at', { ascending: false }),
          supabase.from('pep_agreements').select('id, agreement_version, accepted_at, agreement_text')
            .eq('user_id', userId).eq('organization_id', orgId).eq('agreement_version', PEP_AGREEMENT_VERSION)
            .order('accepted_at', { ascending: false }).limit(1).maybeSingle(),
          isSelf ? supabase.auth.getUser() : Promise.resolve(null),
        ]);
        assertCurrent(); if (!active) return;
        if (org.error) throw org.error;
        if (!org.data) throw new Error('Организация недоступна.');
        if (history.error) throw history.error;
        if (agreement.error) throw agreement.error;
        if (auth?.error) throw auth.error;
        if (isSelf && auth?.data.user?.id !== userId) throw new Error('Сеанс изменился. Откройте согласие заново.');
        const records = (history.data || []) as ConsentRecord[];
        setOrganization(org.data); setEffectiveOrganizationId(orgId);
        setConsentHistory(records); setCurrentConsent(records[0] || null);
        setPepAgreement((agreement.data as PepRecord | null) || null);
        // A preview actor's email must never become the learner's email.
        setEmailFromAuth(userEmail || (isSelf && auth?.data.user?.id === userId ? auth.data.user.email || null : null));
      } catch (error) {
        if (active && isCurrent()) {
          clear(); setLoadError(getErrorMessage(error, 'Не удалось проверить согласия этой организации.'));
        }
      } finally { if (active && isCurrent()) setIsLoadingHistory(false); }
    })();
    return () => { active = false; };
    // Identity and actor changes remount this owner; callbacks do not restart reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const validateWriteOwner = async () => {
    assertCurrent();
    if (!isSelf || loadError || !effectiveOrganizationId || !organization) {
      throw new Error('Согласие может подтвердить только сам ученик в своём кабинете после проверки организации.');
    }
    const { data, error } = await supabase.auth.getUser();
    assertCurrent();
    if (error) throw error;
    if (data.user?.id !== userId) throw new Error('Сеанс изменился. Откройте согласие заново.');
    const resolved = await resolveOrganizationId();
    assertCurrent();
    if (resolved !== effectiveOrganizationId) throw new Error('Организация обучения изменилась. Откройте согласие заново.');
    return resolved;
  };

  const handleSubmitConsent = async () => {
    if (!hasAgreed || !pepAgreement || lifetime.current.busy) return;
    lifetime.current.busy = true; setIsLoading(true);
    try {
      const orgIdToUse = await validateWriteOwner();
      const ip = await fetchClientIp(); assertCurrent();
      const now = new Date();
      const expiresAt = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
      const { data, error } = await supabase.from('student_consents').insert({
        user_id: userId, organization_id: orgIdToUse, enrollment_id: enrollmentId || null,
        consent_type: 'individual', status: 'signed', full_name: userName,
        email: emailFromAuth, signed_at: now.toISOString(), expires_at: expiresAt.toISOString(),
        ip_address: ip, user_agent: navigator.userAgent, policy_version: CONSENT_VERSION, purposes: CONSENT_PURPOSES,
      } as any).select().single();
      assertCurrent();
      if (error) throw error;
      setCurrentConsent(data as ConsentRecord);
      setConsentHistory(prev => [data as ConsentRecord, ...prev]);
      toast.success('Согласие сохранено'); onConsentRef.current?.();
    } catch (error) {
      if (isCurrent()) toast.error(getErrorMessage(error, 'Ошибка сохранения согласия'));
    } finally { if (isCurrent()) { lifetime.current.busy = false; setIsLoading(false); } }
  };

  const handleAcceptPepAgreement = async () => {
    if (lifetime.current.busy) return;
    lifetime.current.busy = true; setIsLoading(true);
    try {
      const orgIdToUse = await validateWriteOwner();
      const ip = await fetchClientIp(); assertCurrent();
      const agreementText = getPepAgreementText({
        org_name: organization!.name, org_inn: organization!.inn || undefined,
        user_name: userName, user_email: emailFromAuth,
        current_date: new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }),
      });
      const { data, error } = await supabase.from('pep_agreements').insert({
        organization_id: orgIdToUse, user_id: userId, email: emailFromAuth, full_name: userName,
        agreement_text: agreementText, agreement_version: PEP_AGREEMENT_VERSION,
        accepted_at: new Date().toISOString(), ip_address: ip, user_agent: navigator.userAgent,
      }).select('id, agreement_version, accepted_at, agreement_text').single();
      assertCurrent();
      if (error) throw error;
      setPepAgreement(data as PepRecord); toast.success('Соглашение об использовании ПЭП принято');
    } catch (error) {
      if (isCurrent()) toast.error(getErrorMessage(error, 'Не удалось сохранить соглашение ПЭП'));
    } finally { if (isCurrent()) { lifetime.current.busy = false; setIsLoading(false); } }
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

  // Legacy rows do not store an accepted consent body. Do not manufacture an
  // alleged signed original from today's template and a historical timestamp.
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
          Записи о согласии на обработку персональных данных для выбранной образовательной организации.
        </p>
      </div>

      {loadError && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 space-y-2" role="alert">
          <p className="text-sm">{loadError}</p>
          <Button variant="outline" size="sm" onClick={() => setReload(value => value + 1)}>Повторить проверку</Button>
        </div>
      )}
      {!isSelf && !loadError && (
        <p className="text-sm text-muted-foreground">Режим просмотра. Подтвердить согласие может только сам ученик в своём кабинете.</p>
      )}
      {pepAgreement && (
        <details className="rounded-xl border border-border/60 bg-card p-4">
          <summary className="cursor-pointer text-sm">Сохранённое соглашение об использовании ПЭП</summary>
          <p className="mt-3 whitespace-pre-wrap text-sm">{pepAgreement.agreement_text || 'Текст принятого соглашения не сохранён. Текущий шаблон не подставляется вместо него.'}</p>
        </details>
      )}

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
              <h3 className="font-semibold text-lg text-green-600">Сохранена запись о согласии</h3>
              {currentConsent?.signed_at && (
                <p className="text-sm text-muted-foreground mt-1">Подписано: {formatDate(currentConsent.signed_at)}</p>
              )}
              {currentConsent?.expires_at && (
                <p className="text-sm text-muted-foreground">Действует до: {formatDate(currentConsent.expires_at)}</p>
              )}
            </div>
          </div>

          <p className="text-sm text-muted-foreground text-center">
            В этой записи не сохранён точный текст согласия. PDF подписанного оригинала недоступен; запись и её история сохранены.
          </p>
          <div className="flex justify-center">
            <Button variant="outline" disabled className="rounded-xl gap-2">
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

          <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg bg-primary/10 p-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">Соглашение об использовании ПЭП</p>
                  {pepAgreement ? (
                    <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Принято</Badge>
                  ) : (
                    <Badge variant="secondary">Не принято</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Сначала принимается соглашение об использовании простой электронной подписи, затем подписывается согласие на обработку персональных данных.
                </p>
                {pepAgreement?.accepted_at && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Принято: {formatDate(pepAgreement.accepted_at)}
                  </p>
                )}
              </div>
            </div>

            {!pepAgreement && (
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-xl gap-2"
                onClick={handleAcceptPepAgreement}
                disabled={isLoading || !effectiveOrganizationId || !!loadError || !isSelf}
              >
                <ShieldCheck className="w-4 h-4" />
                Принять соглашение ПЭП
              </Button>
            )}
          </div>

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
              disabled={isLoading || !!loadError || !isSelf || !effectiveOrganizationId}
              onCheckedChange={(checked) => setHasAgreed(checked === true)}
            />
            <Label htmlFor="consent-checkbox" className="text-sm cursor-pointer leading-relaxed">
              Я, <strong>{userName}</strong>, ознакомлен(а) с условиями обработки персональных данных и подписываю настоящее согласие простой электронной подписью.
            </Label>
          </div>

          <Button
            className="w-full btn-gradient rounded-xl gap-2"
            onClick={handleSubmitConsent}
            disabled={!hasAgreed || isLoading || !effectiveOrganizationId || !pepAgreement || !!loadError || !isSelf}
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
