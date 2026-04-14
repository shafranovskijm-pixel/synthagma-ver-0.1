import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, Check } from "lucide-react";
import { Link } from "react-router-dom";

interface PublicOfferAcceptanceProps {
  organizationId: string;
  onAccepted: () => void;
}

export const PublicOfferAcceptance = ({ organizationId, onAccepted }: PublicOfferAcceptanceProps) => {
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    if (!accepted) {
      toast.error("Необходимо принять условия публичной оферты");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Пользователь не авторизован");

      const { error } = await supabase
        .from("organization_offer_acceptances")
        .insert({
          organization_id: organizationId,
          user_id: user.id,
          ip_address: null,
          user_agent: navigator.userAgent,
        });

      if (error) throw error;

      toast.success("Публичная оферта принята");
      onAccepted();
    } catch (error: any) {
      console.error("Error accepting offer:", error);
      toast.error("Ошибка при сохранении: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <FileText className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Публичная оферта</CardTitle>
          <CardDescription>
            Для продолжения работы с платформой необходимо принять условия публичной оферты
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ScrollArea className="h-[300px] rounded-md border p-4">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <h3 className="text-lg font-semibold mb-4">ПУБЛИЧНАЯ ОФЕРТА</h3>
              <p className="text-muted-foreground mb-4">
                о предоставлении доступа к платформе дистанционного обучения
              </p>
              
              <p className="mb-4">
                Настоящий документ является официальным предложением
                <strong> Индивидуального предпринимателя Шафрановского Максима Михайловича</strong>
                {" "}ИНН 253615392404, ОГРНИП 324253600042754 (далее — Исполнитель)
                заключить договор на изложенных ниже условиях.
              </p>

              <h4 className="font-semibold mt-4">1. ТЕРМИНЫ И ОПРЕДЕЛЕНИЯ</h4>
              <p><strong>Платформа</strong> — программная платформа дистанционного обучения «Синтагма».</p>
              <p><strong>Акцепт</strong> — полное и безоговорочное принятие условий оферты путем оплаты услуг.</p>

              <h4 className="font-semibold mt-4">2. ПРЕДМЕТ ОФЕРТЫ</h4>
              <p>2.1. Исполнитель предоставляет Заказчику доступ к Платформе дистанционного обучения.</p>
              <p>2.2. Исполнитель не оказывает образовательных услуг.</p>

              <h4 className="font-semibold mt-4">3. ПОРЯДОК АКЦЕПТА</h4>
              <p>3.1. Акцептом является оплата услуг либо начало использования Платформы.</p>

              <h4 className="font-semibold mt-4">5. СТОИМОСТЬ И ПОРЯДОК ОПЛАТЫ</h4>
              <p>5.1. Стоимость услуг указывается на сайте или согласуется индивидуально.</p>
              <p>5.2. Оплата производится ежемесячно, 100% предоплата.</p>
              <p>5.3. После предоставления доступа услуги не подлежат возврату.</p>

              <h4 className="font-semibold mt-4">6. ОНЛАЙН-КАССА И ПРИЁМ ПЛАТЕЖЕЙ</h4>
              <p>6.1. Платформа предоставляет интеграцию с сервисом онлайн-кассы для приёма оплат от слушателей.</p>
              <p>6.3. Исполнитель не является стороной расчётов между Заказчиком и Пользователями.</p>

              <h4 className="font-semibold mt-4">7. ЭЛЕКТРОННАЯ ПОДПИСЬ</h4>
              <p>7.1. На Платформе применяется простая (неквалифицированная) электронная подпись (ЭП).</p>
              <p>7.2. Ключом ЭП является логин и пароль учётной записи.</p>
              <p>7.3. Документы, подписанные ЭП, имеют юридическую силу наравне с собственноручной подписью.</p>

              <h4 className="font-semibold mt-4">11. ОГРАНИЧЕНИЕ ОТВЕТСТВЕННОСТИ</h4>
              <p>11.2. Ответственность Исполнителя ограничивается суммой оплаты за последний месяц.</p>

              <div className="mt-6 pt-4 border-t">
                <Link to="/public-offer" target="_blank" className="text-primary hover:underline">
                  Читать полную версию оферты →
                </Link>
              </div>
            </div>
          </ScrollArea>

          <div className="flex items-start space-x-3 p-4 bg-muted/50 rounded-lg">
            <Checkbox
              id="accept"
              checked={accepted}
              onCheckedChange={(checked) => setAccepted(checked === true)}
            />
            <label
              htmlFor="accept"
              className="text-sm leading-relaxed cursor-pointer"
            >
              Я ознакомился с условиями{" "}
              <Link to="/public-offer" target="_blank" className="text-primary hover:underline">
                публичной оферты
              </Link>{" "}
              и принимаю их в полном объёме
            </label>
          </div>

          <Button
            onClick={handleAccept}
            disabled={!accepted || loading}
            className="w-full"
            size="lg"
          >
            {loading ? (
              "Сохранение..."
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Принять и продолжить
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};