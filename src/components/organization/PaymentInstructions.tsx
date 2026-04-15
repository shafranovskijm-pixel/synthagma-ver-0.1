import { CheckCircle2, AlertTriangle, CreditCard, Copy, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function PaymentInstructions() {
  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Скопировано");
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Step 1 */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold">1</span>
            Получите реквизиты в Т-Банк Бизнес
          </h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground ml-9">
            <li>Войдите в <a href="https://business.tbank.ru" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Личный кабинет Т-Банк Бизнес <ExternalLink className="w-3 h-3" /></a></li>
            <li>Перейдите в раздел <strong className="text-foreground">Интернет-эквайринг → Магазины</strong></li>
            <li>Выберите ваш магазин (или создайте новый)</li>
            <li>Скопируйте <strong className="text-foreground">TerminalKey</strong> и <strong className="text-foreground">Пароль</strong></li>
            <li>Вставьте их во вкладку «Настройки кассы» на этой странице</li>
          </ol>
        </CardContent>
      </Card>

      {/* Step 2 */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold">2</span>
            Пройдите тестовые платежи
          </h3>
          <p className="text-sm text-muted-foreground ml-9">
            Т-Банк требует пройти <strong className="text-foreground">3 обязательных теста</strong> перед переключением на боевой режим:
          </p>

          <div className="ml-9 space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Тест 1. Успешная оплата</p>
                <p className="text-xs text-muted-foreground mt-1">Добавьте курс в корзину, оплатите тестовой картой. На экране должна появиться надпись «Оплачено».</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border">
              <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Тест 2. Неуспешная оплата</p>
                <p className="text-xs text-muted-foreground mt-1">Попробуйте оплатить с неправильными данными карты. Должна отобразиться ошибка.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border">
              <CheckCircle2 className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Тест 3. Возврат</p>
                <p className="text-xs text-muted-foreground mt-1">Выполните возврат тестового платежа через личный кабинет Т-Банк Бизнес.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test card */}
      <Card className="border-dashed border-amber-500/50 bg-amber-500/5">
        <CardContent className="pt-6">
          <h3 className="font-semibold flex items-center gap-2 mb-3">
            <CreditCard className="w-5 h-5 text-amber-500" />
            Данные тестовой карты
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Используйте эти данные для тестовых платежей. <strong className="text-foreground">Не используйте реальную карту!</strong>
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Номер карты</p>
              <button onClick={() => copy("4300000000000777")} className="flex items-center gap-1.5 font-mono text-sm hover:text-primary transition-colors">
                4300 0000 0000 0777
                <Copy className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Срок</p>
              <button onClick={() => copy("1225")} className="flex items-center gap-1.5 font-mono text-sm hover:text-primary transition-colors">
                12/25
                <Copy className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">CVC</p>
              <button onClick={() => copy("000")} className="flex items-center gap-1.5 font-mono text-sm hover:text-primary transition-colors">
                000
                <Copy className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 3 */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold">3</span>
            Переключитесь на боевой режим
          </h3>
          <p className="text-sm text-muted-foreground ml-9">
            После прохождения всех тестов отключите переключатель «Тестовый режим» на вкладке «Настройки кассы» и сохраните.
          </p>
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-3">Частые вопросы</h3>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="1">
              <AccordionTrigger className="text-sm">Что такое TerminalKey?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Уникальный идентификатор вашего магазина в системе Т-Банк. Выдаётся при подключении интернет-эквайринга.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="2">
              <AccordionTrigger className="text-sm">Какие статусы платежей бывают?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                <ul className="space-y-1">
                  <li><strong>Ожидание</strong> — платёж инициирован, ожидает подтверждения</li>
                  <li><strong>Оплачен</strong> — платёж успешно подтверждён банком</li>
                  <li><strong>Ошибка</strong> — платёж отклонён (недостаток средств, неверные данные и т.д.)</li>
                  <li><strong>Возврат</strong> — средства возвращены плательщику</li>
                </ul>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="3">
              <AccordionTrigger className="text-sm">Редирект или виджет — что выбрать?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                <strong>Редирект</strong> — перенаправляет слушателя на страницу Т-Банк для оплаты. Проще в настройке.
                <br /><strong>Виджет</strong> — открывает модальное окно оплаты прямо на вашем сайте, без перехода. Более удобный для пользователя опыт.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="4">
              <AccordionTrigger className="text-sm">Когда слушатель получает доступ к курсу?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Сразу после успешной оплаты. Система автоматически зачисляет слушателя на курс при получении подтверждения от Т-Банк.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
