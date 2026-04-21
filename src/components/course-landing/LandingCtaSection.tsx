import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2 } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useLandingTheme, useTemplateStyle } from "./LandingThemeProvider";
import { CtaTerminalPanel } from "./variants/CtaTerminalPanel";
import { CtaBeautyBanner } from "./variants/CtaBeautyBanner";
import { CtaEditorialTravel } from "./variants/CtaEditorialTravel";
import { CtaStampedForm } from "./variants/CtaStampedForm";
import { CtaShimmerPanel } from "./variants/CtaShimmerPanel";
import { DynamicEnrollmentForm } from "./DynamicEnrollmentForm";
import type { EnrollmentConfig } from "@/lib/landing-enrollment";

interface Props {
  title: string;
  subtitle: string;
  accentColor: string | null;
  isEditing?: boolean;
  onTitleChange?: (v: string) => void;
  onSubtitleChange?: (v: string) => void;
  onSubmit?: (data: { name: string; email: string; phone: string; extra?: Record<string, string> }) => Promise<void>;
  isEnrolled?: boolean;
  price?: number;
  /** Конфиг самоонбординга (поля, режим, сообщение). */
  enrollmentConfig?: EnrollmentConfig;
  /** Сабмит уже произведён — показывать «Спасибо». */
  submitted?: boolean;
}

/**
 * Диспетчер CTA — выбирает variant по `theme.cta_layout`.
 * Если задан кастомный `enrollmentConfig.fields` (≠ default 3 поля) —
 * рендерим единый `DynamicEnrollmentForm` поверх обычного CTA.
 * Иначе используем родной 3-полевый шаблон выбранного варианта.
 */
export function LandingCtaSection(props: Props) {
  const { theme } = useLandingTheme();

  // Success state — общий для всех вариантов
  if (props.submitted) {
    return <CtaSuccess message={props.enrollmentConfig?.success_message} accentColor={props.accentColor} />;
  }

  // Если есть кастомные поля (отличающиеся от стандартных) — используем DynamicForm в общей рамке
  const hasCustomFields = props.enrollmentConfig &&
    (props.enrollmentConfig.fields.length !== 3 ||
      props.enrollmentConfig.fields.some((f, i) =>
        !["name", "email", "phone"].includes(f.key) ||
        (i === 0 && f.key !== "name") || (i === 1 && f.key !== "email") || (i === 2 && f.key !== "phone")));

  if (hasCustomFields && !props.isEditing && !props.isEnrolled) {
    return <CtaDynamicWrapper {...props} />;
  }

  switch (theme.cta_layout) {
    case "terminal": return <CtaTerminalPanel {...props} />;
    case "beauty-banner": return <CtaBeautyBanner {...props} />;
    case "editorial-travel": return <CtaEditorialTravel {...props} />;
    case "stamped-form": return <CtaStampedForm {...props} />;
    case "shimmer-panel": return <CtaShimmerPanel {...props} />;
    default: return <CtaDefault {...props} />;
  }
}

function CtaSuccess({ message, accentColor }: { message?: string; accentColor: string | null }) {
  const accent = accentColor || undefined;
  return (
    <section className="py-20 px-6 landing-bg-cta" style={{ backgroundColor: accent ? `${accent}10` : undefined }}>
      <div className="max-w-md mx-auto text-center bg-card border border-border rounded-2xl p-10 shadow-lg">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
          style={{ backgroundColor: accent ? `${accent}20` : "hsl(var(--primary)/.1)" }}>
          <CheckCircle2 className="w-8 h-8" style={{ color: accent || "hsl(var(--primary))" }} />
        </div>
        <h3 className="text-xl font-bold mb-2">Заявка принята!</h3>
        <p className="text-muted-foreground">{message || "Спасибо! Мы свяжемся с вами в ближайшее время."}</p>
      </div>
    </section>
  );
}

function CtaDynamicWrapper(props: Props) {
  const { title, subtitle, accentColor, enrollmentConfig, onSubmit } = props;
  const accent = accentColor || undefined;
  const skin = useTemplateStyle();

  return (
    <section className="py-20 px-6 landing-bg-cta" style={{ backgroundColor: accent ? `${accent}10` : undefined }}>
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <h2 className={`text-2xl md:text-3xl font-bold mb-3 ${skin.sectionTitle}`}>{title}</h2>
          {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-sm max-w-md mx-auto">
          <DynamicEnrollmentForm
            fields={enrollmentConfig?.fields || []}
            consentRequired={enrollmentConfig?.consent_required ?? true}
            consentUrl={enrollmentConfig?.consent_url}
            submitLabel={enrollmentConfig?.mode === "instant" ? "Записаться на курс" : "Оставить заявку"}
            onSubmit={async (values) => {
              await onSubmit?.({
                name: values.name || values.full_name || "",
                email: values.email || "",
                phone: values.phone || "",
                extra: values,
              });
            }}
            buttonStyle={accent ? { backgroundColor: accent } : undefined}
          />
        </div>
      </div>
    </section>
  );
}

function CtaDefault({
  title, subtitle, accentColor, isEditing, onTitleChange, onSubtitleChange, onSubmit, isEnrolled, price = 0,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const accent = accentColor || undefined;
  const skin = useTemplateStyle();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSubmit) return;
    setSubmitting(true);
    try { await onSubmit({ name, email, phone }); } finally { setSubmitting(false); }
  };

  return (
    <section className="py-20 px-6 landing-bg-cta" style={{ backgroundColor: accent ? `${accent}10` : undefined }}>
      <div className="max-w-xl mx-auto text-center">
        {isEditing ? (
          <h2 contentEditable suppressContentEditableWarning
            className={`text-2xl md:text-3xl font-bold mb-3 outline-none border-b-2 border-dashed border-muted-foreground/20 focus:border-primary/40 ${skin.sectionTitle}`}
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
        ) : (
          <h2 className={`text-2xl md:text-3xl font-bold mb-3 ${skin.sectionTitle}`}>{title}</h2>
        )}

        {isEditing ? (
          <p contentEditable suppressContentEditableWarning
            className="text-muted-foreground mb-8 outline-none border-b border-dashed border-muted-foreground/10 focus:border-primary/30"
            onBlur={(e) => onSubtitleChange?.(e.currentTarget.textContent || "")}>{subtitle}</p>
        ) : (
          subtitle && <p className="text-muted-foreground mb-8">{subtitle}</p>
        )}

        {!isEditing && !isEnrolled && (
          <form onSubmit={handleSubmit} className="space-y-3 max-w-sm mx-auto">
            <Input placeholder="Ваше имя" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input placeholder="Телефон" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Button type="submit" size="lg" className={`w-full ${skin.button}`} disabled={submitting}
              style={accent && !skin.button ? { backgroundColor: accent } : undefined}>
              {submitting ? <SigmaSpinner /> : "Оставить заявку"}
            </Button>
          </form>
        )}

        {isEditing && (
          <div className="space-y-3 max-w-sm mx-auto opacity-50 pointer-events-none">
            <Input placeholder="Ваше имя" disabled />
            <Input placeholder="Email" disabled />
            <Input placeholder="Телефон" disabled />
            <Button size="lg" className="w-full" disabled>Записаться</Button>
          </div>
        )}
      </div>
    </section>
  );
}
