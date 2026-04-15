import { useState, useEffect } from "react";
import { Settings, RotateCcw, Save} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DEFAULT_PROMPTS } from "./MarketplaceSettings";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

export interface ValidationRules {
  minLessons: number;
  minContentLength: number;
  requireTest: boolean;
  requireText: boolean;
  checkDuplicateTitles: boolean;
}

export interface AiPrompts {
  structure?: string;
  content?: string;
  answers?: string;
  questions?: string;
}

const DEFAULT_VALIDATION: ValidationRules = {
  minLessons: 3,
  minContentLength: 50,
  requireTest: true,
  requireText: true,
  checkDuplicateTitles: true };

interface Props {
  onSettingsLoaded?: (rules: ValidationRules, prompts: AiPrompts) => void;
}

export function MarketplaceSettingsTab({ onSettingsLoaded }: Props) {
  const [rules, setRules] = useState<ValidationRules>(DEFAULT_VALIDATION);
  const [prompts, setPrompts] = useState<AiPrompts>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("marketplace_settings")
        .select("setting_key, setting_value")
        .in("setting_key", ["validation_rules", "ai_prompts"]);

      let loadedRules = DEFAULT_VALIDATION;
      let loadedPrompts: AiPrompts = {};

      if (data) {
        for (const row of data) {
          if (row.setting_key === "validation_rules") {
            loadedRules = { ...DEFAULT_VALIDATION, ...(row.setting_value as any) };
          }
          if (row.setting_key === "ai_prompts") {
            loadedPrompts = (row.setting_value as any) || {};
          }
        }
      }

      setRules(loadedRules);
      setPrompts(loadedPrompts);
      onSettingsLoaded?.(loadedRules, loadedPrompts);
    } catch (e) {
      console.error("Failed to load settings:", e);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const { error: e1 } = await supabase
        .from("marketplace_settings")
        .update({ setting_value: rules as any, updated_at: new Date().toISOString() })
        .eq("setting_key", "validation_rules");

      const { error: e2 } = await supabase
        .from("marketplace_settings")
        .update({ setting_value: prompts as any, updated_at: new Date().toISOString() })
        .eq("setting_key", "ai_prompts");

      if (e1 || e2) throw e1 || e2;

      onSettingsLoaded?.(rules, prompts);
      toast.success("Настройки сохранены");
    } catch (e) {
      console.error(e);
      toast.error("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <SigmaSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Настройки проверки и генерации
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Параметры валидации курсов и системные промпты ИИ
          </p>
        </div>
        <Button onClick={saveSettings} disabled={saving} className="rounded-xl">
          {saving ? <SigmaSpinner size="sm" className="mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
          Сохранить
        </Button>
      </div>

      <Tabs defaultValue="validation" className="space-y-4">
        <TabsList>
          <TabsTrigger value="validation">Правила проверки</TabsTrigger>
          <TabsTrigger value="prompts">Промпты ИИ</TabsTrigger>
        </TabsList>

        <TabsContent value="validation">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Параметры валидации</CardTitle>
              <CardDescription>Настройте критерии, по которым проверяются курсы</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Минимум уроков</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={rules.minLessons}
                    onChange={(e) => setRules(r => ({ ...r, minLessons: parseInt(e.target.value) || 1 }))}
                    className="w-32"
                  />
                  <p className="text-xs text-muted-foreground">Минимальное количество уроков в курсе</p>
                </div>
                <div className="space-y-2">
                  <Label>Минимум длина контента (символы)</Label>
                  <Input
                    type="number"
                    min={10}
                    max={1000}
                    value={rules.minContentLength}
                    onChange={(e) => setRules(r => ({ ...r, minContentLength: parseInt(e.target.value) || 10 }))}
                    className="w-32"
                  />
                  <p className="text-xs text-muted-foreground">Уроки с контентом короче этого считаются пустыми</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Обязательность тестов</Label>
                    <p className="text-xs text-muted-foreground">Курс должен содержать хотя бы один тест</p>
                  </div>
                  <Switch checked={rules.requireTest} onCheckedChange={(v) => setRules(r => ({ ...r, requireTest: v }))} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Обязательность текстовых уроков</Label>
                    <p className="text-xs text-muted-foreground">Курс должен содержать хотя бы один текстовый/практический урок</p>
                  </div>
                  <Switch checked={rules.requireText} onCheckedChange={(v) => setRules(r => ({ ...r, requireText: v }))} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Проверка дубликатов заголовков</Label>
                    <p className="text-xs text-muted-foreground">Находить уроки с одинаковыми названиями</p>
                  </div>
                  <Switch checked={rules.checkDuplicateTitles} onCheckedChange={(v) => setRules(r => ({ ...r, checkDuplicateTitles: v }))} />
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setRules(DEFAULT_VALIDATION)}
                className="rounded-xl"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Сбросить по умолчанию
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prompts">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Системные промпты ИИ</CardTitle>
              <CardDescription>
                Настройте промпты, которые отправляются ИИ при генерации контента.
                Пустое поле = используется промпт по умолчанию.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <PromptField
                label="Генерация структуры курса"
                description="Промпт для создания списка уроков по названию курса"
                value={prompts.structure || ""}
                defaultValue={DEFAULT_PROMPTS.structure}
                onChange={(v) => setPrompts(p => ({ ...p, structure: v || undefined }))}
              />
              <PromptField
                label="Генерация контента уроков"
                description="Промпт для создания текстового материала урока"
                value={prompts.content || ""}
                defaultValue={DEFAULT_PROMPTS.content}
                onChange={(v) => setPrompts(p => ({ ...p, content: v || undefined }))}
              />
              <PromptField
                label="Решение тестовых вопросов"
                description="Промпт для определения правильных ответов в тестах"
                value={prompts.answers || ""}
                defaultValue={DEFAULT_PROMPTS.answers}
                onChange={(v) => setPrompts(p => ({ ...p, answers: v || undefined }))}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PromptField({
  label, description, value, defaultValue, onChange
}: {
  label: string; description: string; value: string; defaultValue: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">{label}</Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(defaultValue)}
          className="text-xs h-7"
        >
          <RotateCcw className="w-3 h-3 mr-1" />
          По умолчанию
        </Button>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={defaultValue.slice(0, 100) + "..."}
        rows={4}
        className="font-mono text-xs"
      />
    </div>
  );
}
