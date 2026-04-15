import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ArrowRight, Calculator, HelpCircle, GitBranch, Route } from "lucide-react";
import { cn } from "@/lib/utils";

export function PartnerHowItWorks() {
  const [calcAmount, setCalcAmount] = useState(50000);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const l1 = Math.round(calcAmount * 0.20);
  const l2 = Math.round(calcAmount * 0.10);
  const l3 = Math.round(calcAmount * 0.05);
  const turnover = Math.round(calcAmount * 0.05);
  const leader = Math.round(calcAmount * 0.03);

  const faqs = [
    { q: "Как быстро начисляются комиссионные?", a: "Комиссия начисляется автоматически после каждого успешного платежа от привлечённой организации. Средства поступают на ваш партнёрский баланс мгновенно." },
    { q: "Какая минимальная сумма для вывода?", a: "Минимальная сумма для вывода — 1 000 ₽. Выплаты производятся ежемесячно на указанные вами реквизиты." },
    { q: "Как долго действует привязка клиента?", a: "Привязка организации к партнёру действует 2 года с момента регистрации. В течение этого времени вы получаете комиссию с каждого платежа." },
    { q: "Как работают бонусы за оборот?", a: "Если суммарный оборот вашей сети превышает 100 000 ₽/мес, вы получаете дополнительные +5% с каждого платежа. Бонус пересчитывается ежемесячно." },
    { q: "Как стать топ-партнёром?", a: "Топ-10 партнёров определяются по обороту сети за календарный месяц. Партнёры из топ-10 получают дополнительные +3% со всей сети." },
    { q: "Можно ли привлекать не только организации, но и партнёров?", a: "Да! У вас есть две ссылки: одна для привлечения организаций (клиентов), другая — для привлечения новых партнёров. С партнёров 2-го и 3-го уровня вы тоже получаете комиссию." },
  ];

  return (
    <div className="space-y-6">
      {/* Commission scheme */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-primary" /> Схема комиссий — 3 уровня
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-2">
            {/* Level visualization */}
            <div className="w-full max-w-md space-y-3">
              {/* You */}
              <div className="flex items-center justify-center">
                <div className="px-5 py-3 rounded-2xl bg-primary/10 border-2 border-primary text-center">
                  <p className="font-bold text-sm">Вы (Партнёр)</p>
                  <p className="text-xs text-muted-foreground">Получаете со всех 3 уровней</p>
                </div>
              </div>
              
              <div className="flex justify-center">
                <div className="w-0.5 h-6 bg-primary/30" />
              </div>

              {/* Level 1 */}
              <div className="flex items-center gap-3">
                <div className="flex-1 p-3 rounded-xl bg-teal-500/10 border border-teal-500/30 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Badge className="bg-teal-500/20 text-teal-600 border-teal-500/30 text-xs">Уровень 1</Badge>
                    <span className="text-lg font-bold text-teal-600">20%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Организации, пришедшие по вашей ссылке</p>
                </div>
              </div>

              <div className="flex justify-center">
                <div className="w-0.5 h-4 bg-cyan-500/30" />
              </div>

              {/* Level 2 */}
              <div className="flex items-center gap-3 ml-8">
                <div className="flex-1 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Badge className="bg-cyan-500/20 text-cyan-600 border-cyan-500/30 text-xs">Уровень 2</Badge>
                    <span className="text-lg font-bold text-cyan-600">10%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Клиенты ваших партнёров</p>
                </div>
              </div>

              <div className="flex justify-center ml-8">
                <div className="w-0.5 h-4 bg-blue-500/30" />
              </div>

              {/* Level 3 */}
              <div className="flex items-center gap-3 ml-16">
                <div className="flex-1 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/30 text-xs">Уровень 3</Badge>
                    <span className="text-lg font-bold text-blue-600">5%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Клиенты партнёров ваших партнёров</p>
                </div>
              </div>
            </div>

            {/* Bonuses */}
            <div className="grid sm:grid-cols-2 gap-3 w-full mt-4">
              <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-center">
                <p className="text-lg font-bold text-emerald-600">+5%</p>
                <p className="text-xs text-muted-foreground">Бонус за оборот &gt; 100 000 ₽/мес</p>
              </div>
              <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-center">
                <p className="text-lg font-bold text-amber-600">+3%</p>
                <p className="text-xs text-muted-foreground">Лидерский бонус (Топ-10)</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customer journey */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Route className="w-5 h-5 text-primary" /> Путь клиента
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-stretch gap-2">
            {[
              { step: "1", title: "Переход по ссылке", desc: "Клиент кликает вашу реферальную ссылку", color: "bg-teal-500/10 border-teal-500/30" },
              { step: "2", title: "Регистрация", desc: "Создаёт организацию на платформе", color: "bg-cyan-500/10 border-cyan-500/30" },
              { step: "3", title: "Оплата тарифа", desc: "Выбирает тариф и оплачивает", color: "bg-blue-500/10 border-blue-500/30" },
              { step: "4", title: "Комиссия", desc: "Вам автоматически начисляется %", color: "bg-primary/10 border-primary/30" },
            ].map((s, i) => (
              <div key={i} className="flex-1 flex items-center gap-2">
                <div className={cn("flex-1 p-3 rounded-xl border text-center", s.color)}>
                  <div className="w-7 h-7 rounded-full bg-background border-2 border-current flex items-center justify-center mx-auto mb-1.5 text-xs font-bold">{s.step}</div>
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{s.desc}</p>
                </div>
                {i < 3 && <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 hidden sm:block" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Calculator */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="w-5 h-5 text-primary" /> Калькулятор дохода
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Сумма одного платежа клиента (₽)</Label>
            <Input
              type="number"
              value={calcAmount}
              onChange={e => setCalcAmount(Number(e.target.value) || 0)}
              className="max-w-xs rounded-xl"
            />
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/30 text-center">
              <p className="text-xs text-muted-foreground mb-1">Уровень 1 (20%)</p>
              <p className="text-xl font-bold text-teal-600">{l1.toLocaleString("ru-RU")} ₽</p>
            </div>
            <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-center">
              <p className="text-xs text-muted-foreground mb-1">Уровень 2 (10%)</p>
              <p className="text-xl font-bold text-cyan-600">{l2.toLocaleString("ru-RU")} ₽</p>
            </div>
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 text-center">
              <p className="text-xs text-muted-foreground mb-1">Уровень 3 (5%)</p>
              <p className="text-xl font-bold text-blue-600">{l3.toLocaleString("ru-RU")} ₽</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-center">
              <p className="text-xs text-muted-foreground mb-1">+ Бонус оборота</p>
              <p className="text-lg font-bold text-emerald-600">{turnover.toLocaleString("ru-RU")} ₽</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-center">
              <p className="text-xs text-muted-foreground mb-1">+ Лидерский бонус</p>
              <p className="text-lg font-bold text-amber-600">{leader.toLocaleString("ru-RU")} ₽</p>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-primary/10 border border-primary/30 text-center">
            <p className="text-xs text-muted-foreground mb-1">Максимальный доход с одного платежа (все бонусы)</p>
            <p className="text-2xl font-bold text-primary">{(l1 + l2 + l3 + turnover + leader).toLocaleString("ru-RU")} ₽</p>
            <p className="text-xs text-muted-foreground mt-1">= {((l1 + l2 + l3 + turnover + leader) / calcAmount * 100).toFixed(0)}% от платежа</p>
          </div>
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-primary" /> Частые вопросы
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {faqs.map((faq, i) => (
            <Collapsible key={i} open={openFaq === i} onOpenChange={(open) => setOpenFaq(open ? i : null)}>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left">
                  <span className="text-sm font-medium pr-4">{faq.q}</span>
                  <ChevronDown className={cn("w-4 h-4 shrink-0 text-muted-foreground transition-transform", openFaq === i && "rotate-180")} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-3 pb-3 pt-1 text-sm text-muted-foreground leading-relaxed">
                  {faq.a}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
