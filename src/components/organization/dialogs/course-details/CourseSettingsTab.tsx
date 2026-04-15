import React from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Video, Lock, FastForward, ShieldCheck, Droplets, ExternalLink, FileSpreadsheet } from "lucide-react";
import {
  FRDO_PROGRAM_TYPES,
  FRDO_DOCUMENT_TYPES,
  FRDO_PROFESSIONAL_AREAS,
  FRDO_SPECIALTY_GROUPS,
  FRDO_TRAINING_FORMS,
  type CourseFRDOSettings,
} from "@/constants/frdo";

interface CourseSettingsTabProps {
  skipVideoId: boolean;
  onToggleSkipVideoId: (v: boolean) => void;
  sequentialLessons: boolean;
  onToggleSequentialLessons: (v: boolean) => void;
  allowVideoSeek: boolean;
  onToggleAllowVideoSeek: (v: boolean) => void;
  copyProtection: boolean;
  onToggleCopyProtection: (v: boolean) => void;
  videoWatermark: boolean;
  onToggleVideoWatermark: (v: boolean) => void;
  externalCardUrl: string;
  onUpdateExternalCardUrl: (v: string) => void;
  isSavingSettings: boolean;
  // FRDO
  isFrdoEnabled: boolean;
  trainingForm: string;
  onUpdateTrainingForm: (v: string) => void;
  frdoSettings: CourseFRDOSettings;
  onUpdateFrdoSettings: (field: string, value: string | number | null) => void;
}

const SettingRow = ({ icon, iconBg, label, description, children }: { icon: React.ReactNode; iconBg: string; label: string; description: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between">
    <div className="flex items-start gap-3">
      <div className={`p-2 rounded-lg ${iconBg} mt-0.5`}>{icon}</div>
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
    </div>
    {children}
  </div>
);

export function CourseSettingsTab(props: CourseSettingsTabProps) {
  return (
    <div className="space-y-6">
      <h3 className="font-semibold">Настройки курса</h3>
      <div className="bg-secondary/30 rounded-xl p-4 space-y-6">
        <SettingRow icon={<Video className="w-5 h-5 text-primary" />} iconBg="bg-primary/10" label="Отключить видеоидентификацию" description="Если включено, слушатели этого курса смогут начать обучение без прохождения видеоидентификации">
          <Switch checked={props.skipVideoId} onCheckedChange={props.onToggleSkipVideoId} disabled={props.isSavingSettings} />
        </SettingRow>
        <SettingRow icon={<Lock className="w-5 h-5 text-amber-500" />} iconBg="bg-amber-500/10" label="Последовательное прохождение уроков" description="Если включено, ученики смогут открывать следующий урок только после завершения предыдущего">
          <Switch checked={props.sequentialLessons} onCheckedChange={props.onToggleSequentialLessons} disabled={props.isSavingSettings} />
        </SettingRow>
        <SettingRow icon={<FastForward className="w-5 h-5 text-destructive" />} iconBg="bg-destructive/10" label="Разрешить перемотку видео" description="Если выключено, ученики не смогут перематывать видео вперёд (только назад)">
          <Switch checked={props.allowVideoSeek} onCheckedChange={props.onToggleAllowVideoSeek} disabled={props.isSavingSettings} />
        </SettingRow>
        <SettingRow icon={<ShieldCheck className="w-5 h-5 text-emerald-500" />} iconBg="bg-emerald-500/10" label="Включить защиту от копирования текста" description="Запрет выделения и копирования текста уроков для учеников">
          <Switch checked={props.copyProtection} onCheckedChange={props.onToggleCopyProtection} disabled={props.isSavingSettings} />
        </SettingRow>
        <SettingRow icon={<Droplets className="w-5 h-5 text-blue-500" />} iconBg="bg-blue-500/10" label="Включить водяные знаки на видео" description="Полупрозрачный водяной знак с email ученика поверх видео">
          <Switch checked={props.videoWatermark} onCheckedChange={props.onToggleVideoWatermark} disabled={props.isSavingSettings} />
        </SettingRow>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10 mt-0.5"><ExternalLink className="w-5 h-5 text-purple-500" /></div>
            <div className="flex-1">
              <Label className="text-sm font-medium">Переход по внешней ссылке при клике на карточку</Label>
              <p className="text-xs text-muted-foreground mt-1">Если указано, клик по карточке курса в каталоге откроет эту ссылку</p>
              <Input value={props.externalCardUrl} onChange={(e) => props.onUpdateExternalCardUrl(e.target.value)} onBlur={(e) => props.onUpdateExternalCardUrl(e.target.value)} placeholder="https://example.com/course-page" className="mt-2 rounded-lg" disabled={props.isSavingSettings} />
            </div>
          </div>
        </div>
      </div>

      {props.isFrdoEnabled && (
        <div className="space-y-4 mt-6">
          <div className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-primary" /><h3 className="font-semibold">Настройки ФИС ФРДО</h3></div>
          <p className="text-sm text-muted-foreground">Эти настройки будут автоматически применяться при экспорте данных курса в ФИС ФРДО</p>
          <div className="bg-secondary/30 rounded-xl p-4 space-y-4">
            <div className="space-y-2">
              <Label>Форма обучения</Label>
              <Select value={props.trainingForm} onValueChange={props.onUpdateTrainingForm} disabled={props.isSavingSettings}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите форму обучения" /></SelectTrigger>
                <SelectContent>{FRDO_TRAINING_FORMS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Тип программы</Label>
              <Select value={props.frdoSettings.frdo_program_type || ""} onValueChange={(v) => props.onUpdateFrdoSettings("frdo_program_type", v || null)} disabled={props.isSavingSettings}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите тип программы" /></SelectTrigger>
                <SelectContent>{FRDO_PROGRAM_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {props.frdoSettings.frdo_program_type && (
              <div className="space-y-2">
                <Label>Вид документа</Label>
                <Input value={props.frdoSettings.frdo_document_type || ""} className="rounded-xl bg-muted" disabled />
                <p className="text-xs text-muted-foreground">Определяется автоматически на основе типа программы</p>
              </div>
            )}
            {(props.frdoSettings.frdo_program_type === "qualification_upgrade" || props.frdoSettings.frdo_program_type === "professional_retraining") && (
              <>
                <div className="space-y-2">
                  <Label>Область профессиональной деятельности</Label>
                  <Select value={props.frdoSettings.frdo_professional_area || ""} onValueChange={(v) => props.onUpdateFrdoSettings("frdo_professional_area", v || null)} disabled={props.isSavingSettings}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите область деятельности" /></SelectTrigger>
                    <SelectContent className="max-h-60">{FRDO_PROFESSIONAL_AREAS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Укрупненная группа специальностей</Label>
                  <Select value={props.frdoSettings.frdo_specialty_group || ""} onValueChange={(v) => props.onUpdateFrdoSettings("frdo_specialty_group", v || null)} disabled={props.isSavingSettings}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите группу специальностей" /></SelectTrigger>
                    <SelectContent className="max-h-60">{FRDO_SPECIALTY_GROUPS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Наименование квалификации/специальности</Label>
                  <Input defaultValue={props.frdoSettings.frdo_qualification_name || ""} onBlur={(e) => props.onUpdateFrdoSettings("frdo_qualification_name", e.target.value || null)} placeholder="Например: специалист по охране труда" className="rounded-xl" disabled={props.isSavingSettings} />
                </div>
              </>
            )}
            {props.frdoSettings.frdo_program_type === "professional_training" && (
              <>
                <div className="space-y-2">
                  <Label>Наименование профессии</Label>
                  <Input defaultValue={props.frdoSettings.frdo_profession_name || ""} onBlur={(e) => props.onUpdateFrdoSettings("frdo_profession_name", e.target.value || null)} placeholder="Например: машинист крана" className="rounded-xl" disabled={props.isSavingSettings} />
                </div>
                <div className="space-y-2">
                  <Label>Квалификационный разряд</Label>
                  <Input defaultValue={props.frdoSettings.frdo_qualification_rank || ""} onBlur={(e) => props.onUpdateFrdoSettings("frdo_qualification_rank", e.target.value || null)} placeholder="Например: 4 разряд" className="rounded-xl" disabled={props.isSavingSettings} />
                </div>
              </>
            )}
            {!props.frdoSettings.frdo_program_type && <p className="text-sm text-muted-foreground italic">Выберите тип программы для отображения дополнительных полей</p>}
            <div className="space-y-2">
              <Label>Срок обучения, часов (для документа о квалификации)</Label>
              <Input type="number" defaultValue={props.frdoSettings.frdo_duration_hours ?? ""} onBlur={(e) => props.onUpdateFrdoSettings("frdo_duration_hours", e.target.value ? parseInt(e.target.value) : null)} placeholder="Например: 72" className="rounded-xl" disabled={props.isSavingSettings} />
            </div>
            <div className="space-y-2">
              <Label>Источник финансирования обучения</Label>
              <Select value={props.frdoSettings.frdo_financing_source || ""} onValueChange={(v) => props.onUpdateFrdoSettings("frdo_financing_source", v || null)} disabled={props.isSavingSettings}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите источник финансирования" /></SelectTrigger>
                <SelectContent><SelectItem value="Платное обучение">Платное обучение</SelectItem><SelectItem value="Бюджетное обучение">Бюджетное обучение</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Форма получения образования на момент прекращения образовательных отношений</Label>
              <Select value={props.frdoSettings.frdo_education_form || ""} onValueChange={(v) => props.onUpdateFrdoSettings("frdo_education_form", v || null)} disabled={props.isSavingSettings}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите форму получения образования" /></SelectTrigger>
                <SelectContent><SelectItem value="в образовательной организации">в образовательной организации</SelectItem><SelectItem value="вне образовательной организации">вне образовательной организации</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
