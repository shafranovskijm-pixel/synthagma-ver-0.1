import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useTemplateStyle } from "../LandingThemeProvider";
import languageInline from "@/assets/landing-templates/decor/language-inline.webp";

interface Props {
  title: string;
  subtitle: string;
  accentColor: string | null;
  isEditing?: boolean;
  onTitleChange?: (v: string) => void;
  onSubtitleChange?: (v: string) => void;
  onSubmit?: (data: { name: string; email: string; phone: string }) => Promise<void>;
  isEnrolled?: boolean;
  price?: number;
}

/**
 * CTA «Editorial Travel» — баннер в travel-эстетике: бумажный фон с картой,
 * штампы, серифный заголовок, outline-кнопка. Для Language.
 */
export function CtaEditorialTravel({
  title, subtitle, accentColor, isEditing, onTitleChange, onSubtitleChange, onSubmit, isEnrolled,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const accent = accentColor || "#b45309";
  const skin = useTemplateStyle();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSubmit) return;
    setSubmitting(true);
    try { await onSubmit({ name, email, phone }); } finally { setSubmitting(false); }
  };

  return (
    <section className="py-20 px-6 relative overflow-hidden" style={{ background: "#fffaf0" }}>
      <img src={languageInline} alt="" aria-hidden loading="lazy" width={768} height={512}
        className="absolute inset-0 w-full h-full object-cover opacity-15 pointer-events-none" />
      <div className="max-w-3xl mx-auto relative">
        <div className="bg-[#fffdf7]/95 backdrop-blur border-2 p-8 md:p-12 shadow-[0_30px_60px_-20px_rgba(120,80,40,.4)]"
          style={{
            borderColor: accent,
            backgroundImage: "repeating-linear-gradient(0deg, transparent 0 32px, rgba(180,120,80,.06) 32px 33px)",
          }}>
          {/* Уголок */}
          <div className="absolute top-0 right-0 w-12 h-12" style={{ background: `linear-gradient(225deg, ${accent} 0 50%, transparent 50%)` }} />

          {/* Штамп */}
          <div className="absolute top-6 left-6 w-20 h-20 rounded-full border-[3px] border-dashed flex flex-col items-center justify-center text-center rotate-[-12deg] opacity-70"
            style={{ borderColor: accent, color: accent }}>
            <div className="text-[8px] font-bold leading-tight uppercase tracking-wider">visa<br/>welcome</div>
          </div>

          <div className="text-center pt-12">
            <div className="text-xs font-mono uppercase tracking-[0.3em] mb-3" style={{ color: accent }}>— bon voyage —</div>
            {isEditing ? (
              <h2 contentEditable suppressContentEditableWarning
                className={`landing-heading text-3xl md:text-4xl font-bold mb-3 outline-none italic ${skin.sectionTitle}`}
                style={{ color: "#3a2614" }}
                onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
            ) : (
              <h2 className={`landing-heading text-3xl md:text-4xl font-bold mb-3 italic ${skin.sectionTitle}`} style={{ color: "#3a2614" }}>{title}</h2>
            )}
            {isEditing ? (
              <p contentEditable suppressContentEditableWarning
                className="mb-8 outline-none italic text-base"
                style={{ color: "#5a3a20" }}
                onBlur={(e) => onSubtitleChange?.(e.currentTarget.textContent || "")}>{subtitle}</p>
            ) : (
              subtitle && <p className="mb-8 italic text-base" style={{ color: "#5a3a20" }}>{subtitle}</p>
            )}

            {!isEditing && !isEnrolled && (
              <form onSubmit={handleSubmit} className="space-y-3 max-w-sm mx-auto">
                <Input className="bg-white/80 border-2 rounded-none focus-visible:ring-amber-300"
                  style={{ borderColor: `${accent}66` }}
                  placeholder="Имя" value={name} onChange={(e) => setName(e.target.value)} required />
                <Input type="email" className="bg-white/80 border-2 rounded-none focus-visible:ring-amber-300"
                  style={{ borderColor: `${accent}66` }}
                  placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <Input className="bg-white/80 border-2 rounded-none focus-visible:ring-amber-300"
                  style={{ borderColor: `${accent}66` }}
                  placeholder="Телефон" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <Button type="submit" size="lg"
                  className="w-full bg-transparent border-2 font-bold italic hover:bg-amber-50/40 hover:scale-[1.01] transition rounded-none"
                  style={{ borderColor: accent, color: accent }}
                  disabled={submitting}>
                  {submitting ? <SigmaSpinner /> : "→ Начать путешествие"}
                </Button>
              </form>
            )}

            {isEditing && (
              <div className="space-y-3 max-w-sm mx-auto opacity-50 pointer-events-none">
                <Input className="rounded-none" placeholder="Имя" disabled />
                <Input className="rounded-none" placeholder="Email" disabled />
                <Input className="rounded-none" placeholder="Телефон" disabled />
                <Button size="lg" className="w-full rounded-none border-2" disabled>Начать путешествие</Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
