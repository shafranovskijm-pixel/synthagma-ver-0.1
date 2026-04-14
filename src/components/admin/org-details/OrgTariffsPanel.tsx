import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Crown, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getPlanInfo, type SubscriptionPlan } from "@/constants/subscriptionPlans";

interface OrgTariffsPanelProps {
  organizationId: string;
  subscriptionPlan: string;
  planInfo: ReturnType<typeof getPlanInfo>;
  tariffCustomLabel: string;
  setTariffCustomLabel: (v: string) => void;
  tariffPaidUntil: string;
  setTariffPaidUntil: (v: string) => void;
  isSavingTariff: boolean;
  saveTariffSettings: () => Promise<void>;
  customLimits: {
    maxCourses: number | null;
    maxStudents: number | null;
    maxTrainedPerMonth: number | null;
    aiGenerationsLimit: number | null;
    storageLimitBytes: number | null;
  };
  setCustomLimits: React.Dispatch<React.SetStateAction<typeof customLimits>>;
  customCategories: string[];
  setCustomCategories: React.Dispatch<React.SetStateAction<string[]>>;
  customPrice: number | null;
  setCustomPrice: (v: number | null) => void;
  customDiscount: number | null;
  setCustomDiscount: (v: number | null) => void;
}

export function OrgTariffsPanel({
  organizationId, subscriptionPlan, planInfo,
  tariffCustomLabel, setTariffCustomLabel, tariffPaidUntil, setTariffPaidUntil,
  isSavingTariff, saveTariffSettings, customLimits, setCustomLimits,
  customCategories, setCustomCategories, customPrice, setCustomPrice, customDiscount, setCustomDiscount,
}: OrgTariffsPanelProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Crown className="w-5 h-5" />Тарифный план</CardTitle>
          <CardDescription>Управление тарифом и индивидуальными лимитами</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>Текущий тариф</Label>
            <Select value={subscriptionPlan || 'free'} onValueChange={async (val) => {
              const { error } = await supabase.from("organizations").update({ subscription_plan: val } as any).eq("id", organizationId);
              if (error) toast.error("Ошибка смены тарифа");
              else toast.success(`Тариф изменён на "${getPlanInfo(val as SubscriptionPlan).name}"`);
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Бесплатный</SelectItem>
                <SelectItem value="start">Старт — 3 490 ₽/мес</SelectItem>
                <SelectItem value="standard">Стандарт — 6 990 ₽/мес</SelectItem>
                <SelectItem value="professional">Профессиональный — 16 990 ₽/мес</SelectItem>
                <SelectItem value="maximum">Максимальный — 24 990 ₽/мес</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Кастомная метка тарифа</Label>
            <Input value={tariffCustomLabel} onChange={(e) => setTariffCustomLabel(e.target.value)} placeholder="Например: VIP, Партнёр, Тестовый" />
          </div>
          <div className="space-y-2">
            <Label>Оплачен до</Label>
            <Input type="date" value={tariffPaidUntil} onChange={(e) => setTariffPaidUntil(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Индивидуальные лимиты</CardTitle>
          <CardDescription>Переопределяют стандартные лимиты тарифа. Оставьте пустым для использования значений тарифа.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {([
            { key: 'maxCourses' as const, label: 'Макс. курсов' },
            { key: 'maxStudents' as const, label: 'Макс. учеников' },
            { key: 'maxTrainedPerMonth' as const, label: 'Обученных в месяц' },
            { key: 'aiGenerationsLimit' as const, label: 'ИИ-генераций' },
          ] as const).map(({ key, label }) => (
            <div key={key} className="flex items-center gap-4">
              <Label className="w-44 shrink-0">{label}</Label>
              <Input type="number" className="w-32"
                value={customLimits[key] === -1 ? '' : (customLimits[key] ?? '')}
                disabled={customLimits[key] === -1}
                onChange={(e) => setCustomLimits(prev => ({ ...prev, [key]: e.target.value ? Number(e.target.value) : null }))}
                placeholder="По тарифу" />
              <div className="flex items-center gap-2">
                <Switch checked={customLimits[key] === -1} onCheckedChange={(checked) => setCustomLimits(prev => ({ ...prev, [key]: checked ? -1 : null }))} />
                <span className="text-sm text-muted-foreground">Безлимит</span>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-4">
            <Label className="w-44 shrink-0">Хранилище (ГБ)</Label>
            <Input type="number" className="w-32"
              value={customLimits.storageLimitBytes === -1 ? '' : (customLimits.storageLimitBytes != null ? Math.round(customLimits.storageLimitBytes / 1073741824) : '')}
              disabled={customLimits.storageLimitBytes === -1}
              onChange={(e) => setCustomLimits(prev => ({ ...prev, storageLimitBytes: e.target.value ? Number(e.target.value) * 1073741824 : null }))}
              placeholder="По тарифу" />
            <div className="flex items-center gap-2">
              <Switch checked={customLimits.storageLimitBytes === -1} onCheckedChange={(checked) => setCustomLimits(prev => ({ ...prev, storageLimitBytes: checked ? -1 : null }))} />
              <span className="text-sm text-muted-foreground">Безлимит</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Индивидуальная цена</CardTitle>
          <CardDescription>Задайте индивидуальную стоимость и скидку.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Цена тарифа «{planInfo.name}»: <span className="font-medium text-foreground">{planInfo.price.toLocaleString()} ₽/мес</span></p>
          <div className="flex items-center gap-4">
            <Label className="w-44 shrink-0">Цена (₽/мес)</Label>
            <Input type="number" className="w-40" value={customPrice ?? ''} onChange={(e) => setCustomPrice(e.target.value ? Number(e.target.value) : null)} placeholder="По тарифу" />
          </div>
          <div className="flex items-center gap-4">
            <Label className="w-44 shrink-0">Скидка (₽)</Label>
            <Input type="number" className="w-40" min={0} value={customDiscount ?? ''} onChange={(e) => setCustomDiscount(e.target.value ? Number(e.target.value) : null)} placeholder="0" />
          </div>
          {(customPrice != null || customDiscount != null) && (
            <p className="text-sm text-muted-foreground">
              Итого к оплате: {Math.max(0, (customPrice ?? planInfo.price) - (customDiscount ?? 0)).toLocaleString()} ₽/мес
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Индивидуальные возможности</CardTitle>
          <CardDescription>Включите категории, которые будут доступны организации независимо от тарифа.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { key: 'journals', label: 'Журналы' }, { key: 'documents', label: 'Документооборот' },
              { key: 'labor_safety', label: 'Охрана труда' }, { key: 'services', label: 'Магазин курсов' },
              { key: 'frdo', label: 'ФИС ФРДО' }, { key: 'webinars', label: 'Вебинары' },
              { key: '3d_trainers', label: '3D-тренажёры' }, { key: 'branding', label: 'Брендирование' },
              { key: 'video_id', label: 'Видео-идентификация' }, { key: 'document_checklist', label: 'Чек-лист документов' },
              { key: 'ai_generation', label: 'ИИ-генерация' }, { key: 'unlimited', label: 'Без ограничений' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 p-2 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                <input type="checkbox" className="h-4 w-4 rounded border-primary accent-primary"
                  checked={customCategories.includes(key)}
                  onChange={(e) => {
                    if (e.target.checked) setCustomCategories(prev => [...prev, key]);
                    else setCustomCategories(prev => prev.filter(c => c !== key));
                  }} />
                <span className="text-sm font-medium">{label}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button onClick={saveTariffSettings} disabled={isSavingTariff}>
        {isSavingTariff ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        Сохранить тарифные настройки
      </Button>
    </div>
  );
}
