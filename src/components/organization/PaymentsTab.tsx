import { Card, CardContent } from "@/components/ui/card";
import { CreditCard, TrendingUp, Wallet, ShieldCheck, BarChart3, ArrowRightLeft } from "lucide-react";

export function PaymentsTab() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          Финансы
        </h2>
      </div>

      <Card className="overflow-hidden border-0 shadow-lg">
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Финансовый модуль скоро появится</h2>
              <p className="text-muted-foreground">Полный контроль над доходами от обучения в одном месте</p>
            </div>
          </div>
        </div>
        <CardContent className="p-8 pt-6">
          <div className="grid sm:grid-cols-2 gap-4 mb-8">
            {[
              { icon: CreditCard, title: "Приём оплат за курсы", desc: "Слушатели смогут оплачивать курсы онлайн — деньги поступают на ваш счёт" },
              { icon: BarChart3, title: "Аналитика доходов", desc: "Наглядные графики и отчёты по выручке, курсам и периодам" },
              { icon: ArrowRightLeft, title: "Вывод средств", desc: "Удобный вывод заработанных средств на расчётный счёт организации" },
              { icon: ShieldCheck, title: "Безопасные платежи", desc: "Интеграция с проверенными платёжными системами для надёжных транзакций" },
              { icon: TrendingUp, title: "Отслеживание задолженностей", desc: "Контроль неоплаченных счетов и автоматические напоминания" },
              { icon: Wallet, title: "История транзакций", desc: "Полная история всех платежей с фильтрацией и экспортом" },
            ].map((feature, i) => (
              <div key={i} className="flex gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <feature.icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">{feature.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-muted/50 rounded-xl p-4 text-center">
            <p className="text-sm text-muted-foreground">
              🚀 Мы активно работаем над этим разделом. Совсем скоро вы сможете продавать курсы и получать оплату прямо через платформу.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
