import React, { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Video,
  Lock,
  FastForward,
  ShieldCheck,
  Droplets,
  ExternalLink,
  Clock,
  FileSpreadsheet,
  Settings,
  KeyRound,
  ClipboardCheck,
} from "lucide-react";
import {
  FRDO_PROGRAM_TYPES,
  FRDO_DOCUMENT_TYPES,
  FRDO_PROFESSIONAL_AREAS,
  FRDO_SPECIALTY_GROUPS,
  FRDO_TRAINING_FORMS,
  type CourseFRDOSettings,
} from "@/constants/frdo";
import { ModuleAccessSchedule } from "./ModuleAccessSchedule";

type SettingsSubTab = "general" | "access" | "frdo";

interface CourseSettingsTabbedProps {
  course: { id: string };
  isFrdoEnabled: boolean;
  isSavingSettings: boolean;
  courseStudents?: Array<{ id?: string; user_id?: string; name?: string; full_name?: string; email?: string }>;
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
  setExternalCardUrl: (v: string) => void;
  onUpdateExternalCardUrl: (v: string) => void;
  defaultAccessDays: number | null;
  setDefaultAccessDays: (v: number | null) => void;
  onUpdateDefaultAccessDays: (v: string) => void;
  requireEnrollmentApproval: boolean;
  onToggleRequireEnrollmentApproval: (v: boolean) => void;
  trainingForm: string;
  onUpdateTrainingForm: (v: string) => void;
  frdoSettings: CourseFRDOSettings;
  onUpdateFrdoSettings: (field: string, value: string | number | null) => void;
}

const tabs: { value: SettingsSubTab; label: string; icon: React.ElementType }[] = [
  { value: "general", label: "Основные", icon: Settings },
  { value: "access", label: "Доступ", icon: KeyRound },
  { value: "frdo", label: "ФИС ФРДО", icon: FileSpreadsheet },
];

export function CourseSettingsTabbed(props: CourseSettingsTabbedProps) {
  const [subTab, setSubTab] = useState<SettingsSubTab>("general");
  const {
    course, courseStudents = [],
    isFrdoEnabled, isSavingSettings,
    skipVideoId, onToggleSkipVideoId,
    sequentialLessons, onToggleSequentialLessons,
    allowVideoSeek, onToggleAllowVideoSeek,
    copyProtection, onToggleCopyProtection,
    videoWatermark, onToggleVideoWatermark,
    externalCardUrl, setExternalCardUrl, onUpdateExternalCardUrl,
    defaultAccessDays, setDefaultAccessDays, onUpdateDefaultAccessDays,
    requireEnrollmentApproval, onToggleRequireEnrollmentApproval,
    trainingForm, onUpdateTrainingForm,
    frdoSettings, onUpdateFrdoSettings,
  } = props;

  const visibleTabs = tabs.filter(t => t.value !== "frdo" || isFrdoEnabled);

  return (
    <div className="space-y-6">
      {/* Horizontal tab bar */}
      <div className="flex items-center gap-1 border-b border-border">
        {visibleTabs.map(tab => (
          <button
            key={tab.value}
            onClick={() => setSubTab(tab.value)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
              subTab === tab.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* General */}
      {subTab === "general" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            <Settings className="w-4 h-4 shrink-0" />
            Основные параметры обучения — идентификация, последовательность, защита контента.
          </div>
          <div className="bg-secondary/30 rounded-xl p-4 space-y-6">
            <SettingRow icon={Video} iconColor="bg-primary/10 text-primary" label="Отключить видеоидентификацию" desc="Если включено, слушатели этого курса смогут начать обучение без прохождения видеоидентификации">
              <Switch checked={skipVideoId} onCheckedChange={onToggleSkipVideoId} disabled={isSavingSettings} />
            </SettingRow>
            <SettingRow icon={Lock} iconColor="bg-amber-500/10 text-amber-500" label="Последовательное прохождение уроков" desc="Если включено, ученики смогут открывать следующий урок только после завершения предыдущего">
              <Switch checked={sequentialLessons} onCheckedChange={onToggleSequentialLessons} disabled={isSavingSettings} />
            </SettingRow>
            <SettingRow icon={FastForward} iconColor="bg-destructive/10 text-destructive" label="Разрешить перемотку видео" desc="Если выключено, ученики не смогут перематывать видео вперёд (только назад)">
              <Switch checked={allowVideoSeek} onCheckedChange={onToggleAllowVideoSeek} disabled={isSavingSettings} />
            </SettingRow>
            <SettingRow icon={ShieldCheck} iconColor="bg-emerald-500/10 text-emerald-500" label="Включить защиту от копирования текста" desc="Запрет выделения и копирования текста уроков для учеников">
              <Switch checked={copyProtection} onCheckedChange={onToggleCopyProtection} disabled={isSavingSettings} />
            </SettingRow>
            <SettingRow icon={Droplets} iconColor="bg-blue-500/10 text-blue-500" label="Включить водяные знаки на видео" desc="Полупрозрачный водяной знак с email ученика поверх видео">
              <Switch checked={videoWatermark} onCheckedChange={onToggleVideoWatermark} disabled={isSavingSettings} />
            </SettingRow>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10 mt-0.5"><ExternalLink className="w-5 h-5 text-purple-500" /></div>
                <div className="flex-1">
                  <Label className="text-sm font-medium">Переход по внешней ссылке при клике на карточку</Label>
                  <p className="text-xs text-muted-foreground mt-1">Если указано, клик по карточке курса в каталоге откроет эту ссылку</p>
                  <Input value={externalCardUrl} onChange={(e) => setExternalCardUrl(e.target.value)} onBlur={(e) => onUpdateExternalCardUrl(e.target.value)} placeholder="https://example.com/course-page" className="mt-2 rounded-lg" disabled={isSavingSettings} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Access */}
      {subTab === "access" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            <KeyRound className="w-4 h-4 shrink-0" />
            Настройте срок доступа к курсу. Блокировка отдельных уроков доступна в редакторе курса.
          </div>
          <div className="bg-secondary/30 rounded-xl p-4 space-y-6">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10 mt-0.5"><Clock className="w-5 h-5 text-cyan-500" /></div>
                <div className="flex-1">
                  <Label className="text-sm font-medium">Срок доступа к курсу (дней)</Label>
                  <p className="text-xs text-muted-foreground mt-1">Количество дней доступа после зачисления. Пустое значение — безлимитный доступ</p>
                  <Input
                    type="number"
                    min={1}
                    value={defaultAccessDays ?? ""}
                    onChange={(e) => setDefaultAccessDays(e.target.value ? parseInt(e.target.value) : null)}
                    onBlur={(e) => onUpdateDefaultAccessDays(e.target.value)}
                    placeholder="Безлимитный"
                    className="mt-2 rounded-lg w-48"
                    disabled={isSavingSettings}
                  />
                </div>
              </div>
            </div>
            <SettingRow icon={ClipboardCheck} iconColor="bg-orange-500/10 text-orange-500" label="Запись по заявке" desc="Студенты отправляют заявку вместо автоматической записи. Вы получите уведомление для подтверждения">
              <Switch checked={requireEnrollmentApproval} onCheckedChange={onToggleRequireEnrollmentApproval} disabled={isSavingSettings} />
            </SettingRow>
          </div>

          <div className="bg-secondary/30 rounded-xl p-4">
            <ModuleAccessSchedule courseId={course.id} courseStudents={courseStudents} />
          </div>
        </div>
      )}

      {/* FRDO */}
      {subTab === "frdo" && isFrdoEnabled && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            Эти настройки будут автоматически применяться при экспорте данных курса в ФИС ФРДО.
          </div>
          <div className="bg-secondary/30 rounded-xl p-4 space-y-4">
            <div className="space-y-2">
              <Label>Форма обучения</Label>
              <Select value={trainingForm} onValueChange={onUpdateTrainingForm} disabled={isSavingSettings}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите форму обучения" /></SelectTrigger>
                <SelectContent>{FRDO_TRAINING_FORMS.map((form) => (<SelectItem key={form} value={form}>{form}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Тип программы</Label>
              <Select value={frdoSettings.frdo_program_type || ""} onValueChange={(value) => onUpdateFrdoSettings("frdo_program_type", value || null)} disabled={isSavingSettings}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите тип программы" /></SelectTrigger>
                <SelectContent>{FRDO_PROGRAM_TYPES.map((type) => (<SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            {frdoSettings.frdo_program_type && (
              <div className="space-y-2">
                <Label>Вид документа</Label>
                <Input value={frdoSettings.frdo_document_type || ""} className="rounded-xl bg-muted" disabled />
                <p className="text-xs text-muted-foreground">Определяется автоматически на основе типа программы</p>
              </div>
            )}
            {(frdoSettings.frdo_program_type === "qualification_upgrade" || frdoSettings.frdo_program_type === "professional_retraining") && (
              <>
                <div className="space-y-2">
                  <Label>Область профессиональной деятельности</Label>
                  <Select value={frdoSettings.frdo_professional_area || ""} onValueChange={(value) => onUpdateFrdoSettings("frdo_professional_area", value || null)} disabled={isSavingSettings}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите область деятельности" /></SelectTrigger>
                    <SelectContent className="max-h-60">{FRDO_PROFESSIONAL_AREAS.map((area) => (<SelectItem key={area} value={area}>{area}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Укрупненная группа специальностей</Label>
                  <Select value={frdoSettings.frdo_specialty_group || ""} onValueChange={(value) => onUpdateFrdoSettings("frdo_specialty_group", value || null)} disabled={isSavingSettings}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите группу специальностей" /></SelectTrigger>
                    <SelectContent className="max-h-60">{FRDO_SPECIALTY_GROUPS.map((group) => (<SelectItem key={group} value={group}>{group}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Наименование квалификации/специальности</Label>
                  <Input defaultValue={frdoSettings.frdo_qualification_name || ""} onBlur={(e) => onUpdateFrdoSettings("frdo_qualification_name", e.target.value || null)} placeholder="Например: специалист по охране труда" className="rounded-xl" disabled={isSavingSettings} />
                </div>
              </>
            )}
            {frdoSettings.frdo_program_type === "professional_training" && (
              <>
                <div className="space-y-2">
                  <Label>Наименование профессии</Label>
                  <Input defaultValue={frdoSettings.frdo_profession_name || ""} onBlur={(e) => onUpdateFrdoSettings("frdo_profession_name", e.target.value || null)} placeholder="Например: машинист крана" className="rounded-xl" disabled={isSavingSettings} />
                </div>
                <div className="space-y-2">
                  <Label>Квалификационный разряд</Label>
                  <Input defaultValue={frdoSettings.frdo_qualification_rank || ""} onBlur={(e) => onUpdateFrdoSettings("frdo_qualification_rank", e.target.value || null)} placeholder="Например: 4 разряд" className="rounded-xl" disabled={isSavingSettings} />
                </div>
              </>
            )}
            {!frdoSettings.frdo_program_type && (<p className="text-sm text-muted-foreground italic">Выберите тип программы для отображения дополнительных полей</p>)}
            <div className="space-y-2">
              <Label>Срок обучения, часов (для документа о квалификации)</Label>
              <Input type="number" defaultValue={frdoSettings.frdo_duration_hours ?? ""} onBlur={(e) => { const val = e.target.value ? parseInt(e.target.value) : null; onUpdateFrdoSettings("frdo_duration_hours", val); }} placeholder="Например: 72" className="rounded-xl" disabled={isSavingSettings} />
            </div>
            <div className="space-y-2">
              <Label>Источник финансирования обучения</Label>
              <Select value={frdoSettings.frdo_financing_source || ""} onValueChange={(value) => onUpdateFrdoSettings("frdo_financing_source", value || null)} disabled={isSavingSettings}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите источник финансирования" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Платное обучение">Платное обучение</SelectItem>
                  <SelectItem value="Бюджетное обучение">Бюджетное обучение</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Форма получения образования на момент прекращения образовательных отношений</Label>
              <Select value={frdoSettings.frdo_education_form || ""} onValueChange={(value) => onUpdateFrdoSettings("frdo_education_form", value || null)} disabled={isSavingSettings}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите форму получения образования" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="в образовательной организации">в образовательной организации</SelectItem>
                  <SelectItem value="вне образовательной организации">вне образовательной организации</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Reusable setting row
function SettingRow({ icon: Icon, iconColor, label, desc, children }: {
  icon: React.ElementType;
  iconColor: string;
  label: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-start gap-3">
        <div className={cn("p-2 rounded-lg mt-0.5", iconColor.split(" ")[0])}>
          <Icon className={cn("w-5 h-5", iconColor.split(" ")[1])} />
        </div>
        <div>
          <Label className="text-sm font-medium">{label}</Label>
          <p className="text-xs text-muted-foreground mt-1">{desc}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
