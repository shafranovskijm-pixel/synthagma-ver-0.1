import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileCheck, Shield, Loader2, Check, AlertCircle, Download } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface StudentConsentFormProps {
  userId: string;
  userName: string;
  organizationId: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onConsent?: () => void;
}

interface Organization {
  name: string;
  inn: string | null;
  ogrn: string | null;
  legal_address: string | null;
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

Согласие может быть отозвано мной в любое время путем направления письменного уведомления Оператору. Отзыв согласия не влияет на законность обработки персональных данных, осуществленной до момента отзыва.`;

export function StudentConsentForm({
  userId,
  userName,
  organizationId,
  isOpen = false,
  onOpenChange,
  onConsent,
}: StudentConsentFormProps) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasAgreed, setHasAgreed] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [consentDate, setConsentDate] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && organizationId) {
      loadOrganization();
      checkConsentStatus();
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

  const checkConsentStatus = async () => {
    // Check if consent was already given (stored in profile metadata or separate table)
    // For now, we'll use localStorage as a simple solution
    const storedConsent = localStorage.getItem(`consent_${userId}`);
    if (storedConsent) {
      const parsed = JSON.parse(storedConsent);
      setConsentGiven(true);
      setConsentDate(parsed.date);
    }
  };

  const handleSubmitConsent = async () => {
    if (!hasAgreed) {
      toast.error("Необходимо согласиться с условиями");
      return;
    }

    setIsLoading(true);
    try {
      // Store consent (in a real app, this would be in the database)
      const consentData = {
        userId,
        organizationId,
        date: new Date().toISOString(),
        agreed: true,
      };
      
      localStorage.setItem(`consent_${userId}`, JSON.stringify(consentData));
      
      setConsentGiven(true);
      setConsentDate(consentData.date);
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

  const handleDownload = () => {
    const fullText = `СОГЛАСИЕ НА ОБРАБОТКУ ПЕРСОНАЛЬНЫХ ДАННЫХ

Я, ${userName}, даю согласие ${organization?.name || "образовательной организации"}, ИНН ${organization?.inn || "___"}, ОГРН ${organization?.ogrn || "___"}, адрес: ${organization?.legal_address || "___"} (далее — Оператор), на обработку моих персональных данных.

${CONSENT_TEXT}

Дата: ${formatDate(new Date().toISOString())}

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

        {consentGiven ? (
          <div className="py-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-sigma-green/10 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-sigma-green" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-sigma-green">Согласие получено</h3>
              {consentDate && (
                <p className="text-sm text-muted-foreground mt-1">
                  Дата: {formatDate(consentDate)}
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
