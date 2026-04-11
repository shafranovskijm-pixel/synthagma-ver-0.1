import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileCheck, Shield, Loader2, Check, AlertCircle, Download, History } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface StudentConsentFormProps {
  userId: string;
  userName: string;
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
}

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

СОГЛАСИЕ НА ИСПОЛЬЗОВАНИЕ ПРОСТОЙ ЭЛЕКТРОННОЙ ПОДПИСИ

В соответствии с Федеральным законом от 06.04.2011 № 63-ФЗ «Об электронной подписи», я даю согласие на использование простой (неквалифицированной) электронной подписи (ЭП) при работе на платформе дистанционного обучения.

Ключом простой ЭП является комбинация логина (адреса электронной почты) и пароля моей учётной записи. Факт входа в учётную запись подтверждает использование ЭП.

Я признаю, что документы, подписанные простой ЭП через Платформу, имеют юридическую силу, равнозначную документам, подписанным собственноручной подписью, за исключением случаев, когда законодательством РФ требуется квалифицированная электронная подпись.

Простая ЭП может использоваться для подписания: согласий на обработку персональных данных, договоров на оказание образовательных услуг, актов, заявлений и иных документов, связанных с обучением.

Я обязуюсь обеспечить конфиденциальность ключа ЭП. Все действия, совершённые с использованием моей учётной записи, считаются совершёнными лично мной.`;

export function StudentConsentForm({
  userId,
  userName,
  organizationId,
  enrollmentId,
  isOpen = false,
  onOpenChange,
  onConsent,
}: StudentConsentFormProps) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [hasAgreed, setHasAgreed] = useState(false);
  const [consentHistory, setConsentHistory] = useState<ConsentRecord[]>([]);
  const [currentConsent, setCurrentConsent] = useState<ConsentRecord | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (isOpen && organizationId) {
      loadOrganization();
      loadConsentHistory();
    }
  }, [isOpen, organizationId, userId]);

  const loadOrganization = async () => {
    try {
      const { data } = await supabase
        .from("organizations")
        .select("name, inn, ogrn, legal_address")
        .eq("id", organizationId)
        .single();

      if (data) {
        setOrganization(data);
      }
    } catch (error) {
      console.error("Error loading organization:", error);
    }
  };

  const loadConsentHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from("student_consents")
        .select("*")
        .eq("user_id", userId)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        setConsentHistory(data as ConsentRecord[]);
        const latest = data[0] as ConsentRecord;
        setCurrentConsent(latest);
      }
    } catch (error) {
      console.error("Error loading consent history:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSubmitConsent = async () => {
    if (!hasAgreed) {
      toast.error("Необходимо согласиться с условиями");
      return;
    }

    setIsLoading(true);
    try {
      const now = new Date();
      const expiresAt = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

      const { data, error } = await supabase
        .from("student_consents")
        .insert({
          user_id: userId,
          organization_id: organizationId,
          enrollment_id: enrollmentId || null,
          consent_type: "individual",
          status: "signed",
          full_name: userName,
          signed_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          ip_address: "", // Would need a service to get real IP
          user_agent: navigator.userAgent,
        })
        .select()
        .single();

      if (error) throw error;

      setCurrentConsent(data as ConsentRecord);
      setConsentHistory(prev => [data as ConsentRecord, ...prev]);
      
      toast.success("Согласие на обработку персональных данных принято");
      onConsent?.();
    } catch (error) {
      console.error("Error saving consent:", error);
      toast.error("Ошибка сохранения согласия");
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "signed":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Подписано</Badge>;
      case "rejected":
        return <Badge variant="destructive">Отклонено</Badge>;
      case "expired":
        return <Badge variant="secondary">Истекло</Badge>;
      default:
        return <Badge variant="outline">Ожидает подписания</Badge>;
    }
  };

  const handleDownload = () => {
    const fullText = `СОГЛАСИЕ НА ОБРАБОТКУ ПЕРСОНАЛЬНЫХ ДАННЫХ

Я, ${userName}, даю согласие ${organization?.name || "образовательной организации"}, ИНН ${organization?.inn || "___"}, ОГРН ${organization?.ogrn || "___"}, адрес: ${organization?.legal_address || "___"} (далее — Оператор), на обработку моих персональных данных.

${CONSENT_TEXT}

Дата подписания: ${currentConsent?.signed_at ? formatDate(currentConsent.signed_at) : formatDate(new Date().toISOString())}
Действует до: ${currentConsent?.expires_at ? formatDate(currentConsent.expires_at) : "___"}

_________________________ / ${userName} /
        (подпись)`;

    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `consent_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isLoadingHistory) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl rounded-2xl">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const isConsentValid = currentConsent?.status === "signed" && 
    (!currentConsent.expires_at || new Date(currentConsent.expires_at) > new Date());

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Согласие на обработку персональных данных
          </DialogTitle>
          <DialogDescription>
            В соответствии с требованиями Федерального закона № 152-ФЗ
          </DialogDescription>
        </DialogHeader>

        {/* History button */}
        {consentHistory.length > 0 && !showHistory && (
          <Button
            variant="ghost"
            size="sm"
            className="w-fit gap-2"
            onClick={() => setShowHistory(true)}
          >
            <History className="w-4 h-4" />
            История согласий ({consentHistory.length})
          </Button>
        )}

        {showHistory ? (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>
              ← Назад
            </Button>
            <ScrollArea className="h-80">
              <div className="space-y-3">
                {consentHistory.map((record) => (
                  <div key={record.id} className="p-4 rounded-xl bg-muted/50">
                    <div className="flex items-center justify-between mb-2">
                      {getStatusBadge(record.status)}
                      <span className="text-xs text-muted-foreground">
                        {record.consent_type === "individual" ? "Физ. лицо" : "Юр. лицо"}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{record.full_name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Создано: {formatDate(record.created_at)}
                    </p>
                    {record.signed_at && (
                      <p className="text-xs text-muted-foreground">
                        Подписано: {formatDate(record.signed_at)}
                      </p>
                    )}
                    {record.expires_at && (
                      <p className="text-xs text-muted-foreground">
                        Действует до: {formatDate(record.expires_at)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        ) : isConsentValid ? (
          <div className="py-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-green-500" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-green-500">Согласие действительно</h3>
              {currentConsent?.signed_at && (
                <p className="text-sm text-muted-foreground mt-1">
                  Подписано: {formatDate(currentConsent.signed_at)}
                </p>
              )}
              {currentConsent?.expires_at && (
                <p className="text-sm text-muted-foreground">
                  Действует до: {formatDate(currentConsent.expires_at)}
                </p>
              )}
            </div>
            <Button variant="outline" onClick={handleDownload} className="rounded-xl gap-2">
              <Download className="w-4 h-4" />
              Скачать согласие
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Expired consent warning */}
            {currentConsent?.status === "expired" && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-600">Срок действия согласия истёк</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Необходимо подписать новое согласие для продолжения обучения.
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
              <div className="text-sm whitespace-pre-line">
                {CONSENT_TEXT}
              </div>
            </ScrollArea>

            <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-xl">
              <Checkbox
                id="consent-checkbox"
                checked={hasAgreed}
                onCheckedChange={(checked) => setHasAgreed(checked === true)}
              />
              <Label htmlFor="consent-checkbox" className="text-sm cursor-pointer leading-relaxed">
                Я, <strong>{userName}</strong>, ознакомлен(а) с условиями обработки персональных данных и даю своё согласие на их обработку
              </Label>
            </div>

            <Button
              className="w-full btn-gradient rounded-xl gap-2"
              onClick={handleSubmitConsent}
              disabled={!hasAgreed || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Сохранение...
                </>
              ) : (
                <>
                  <FileCheck className="w-4 h-4" />
                  Подтвердить согласие
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
