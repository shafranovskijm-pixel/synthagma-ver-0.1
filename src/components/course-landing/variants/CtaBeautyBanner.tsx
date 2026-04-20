import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useTemplateStyle } from "../LandingThemeProvider";
import beautyInline from "@/assets/landing-templates/decor/beauty-inline.png";

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
 * CTA «Beauty Banner» — широкая розовая панель с декоративными цветочными элементами,
 * округлой кнопкой и серифным заголовком. Для Beauty.
 */
export function CtaBeautyBanner({
  title, subtitle, accentColor, isEditing, onTitleChange, onSubtitleChange, onSubmit, isEnrolled,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const accent = accentColor || "#e879a6";
  const skin = useTemplateStyle();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSubmit) return;
    setSubmitting(true);
    try { await onSubmit({ name, email, phone }); } finally { setSubmitting(false); }
  };

  return (
    <section className="py-20 px-6 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${accent}15, #fce7f3 50%, ${accent}25)` }}>
      <img src={beautyInline} alt="" aria-hidden loading="lazy" width={768} height={512}
        className="absolute -top-10 -left-10 w-[280px] opacity-40 pointer-events-none -rotate-12" />
      <img src={beautyInline} alt="" aria-hidden loading="lazy" width={768} height={512}
        className="absolute -bottom-10 -right-10 w-[280px] opacity-40 pointer-events-none rotate-12 scale-x-[-1]" />

      <div className="max-w-2xl mx-auto relative">
        <div className="bg-white/80 backdrop-blur rounded-[40px] p-8 md:p-10 shadow-[0_30px_60px_-20px_rgba(232,121,166,.5)]"
          style={{ border: `2px solid ${accent}33` }}>
          <div className="flex items-center justify-center gap-2 mb-3">
            <Sparkles className="w-4 h-4" style={{ color: accent }} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: accent }}>Записаться</span>
            <Sparkles className="w-4 h-4" style={{ color: accent }} />
          </div>
          {isEditing ? (
            <h2 contentEditable suppressContentEditableWarning
              className={`landing-heading text-3xl md:text-4xl font-bold mb-3 text-center outline-none italic ${skin.sectionTitle}`}
              onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
          ) : (
            <h2 className={`landing-heading text-3xl md:text-4xl font-bold mb-3 text-center italic ${skin.sectionTitle}`}>{title}</h2>
          )}
          {isEditing ? (
            <p contentEditable suppressContentEditableWarning
              className="text-muted-foreground mb-7 text-center outline-none"
              onBlur={(e) => onSubtitleChange?.(e.currentTarget.textContent || "")}>{subtitle}</p>
          ) : (
            subtitle && <p className="text-muted-foreground mb-7 text-center">{subtitle}</p>
          )}

          {!isEditing && !isEnrolled && (
            <form onSubmit={handleSubmit} className="space-y-3 max-w-sm mx-auto">
              <Input className="rounded-full bg-white/90 border-pink-200 focus-visible:ring-pink-300"
                placeholder="Ваше имя" value={name} onChange={(e) => setName(e.target.value)} required />
              <Input type="email" className="rounded-full bg-white/90 border-pink-200 focus-visible:ring-pink-300"
                placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Input className="rounded-full bg-white/90 border-pink-200 focus-visible:ring-pink-300"
                placeholder="Телефон" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <Button type="submit" size="lg"
                className="w-full rounded-full text-white font-bold hover:scale-[1.02] transition shadow-lg"
                style={{ background: `linear-gradient(135deg, ${accent}, #be185d)`, boxShadow: `0 12px 30px -10px ${accent}99` }}
                disabled={submitting}>
                {submitting ? <SigmaSpinner /> : "Записаться 💖"}
              </Button>
            </form>
          )}

          {isEditing && (
            <div className="space-y-3 max-w-sm mx-auto opacity-50 pointer-events-none">
              <Input className="rounded-full" placeholder="Ваше имя" disabled />
              <Input className="rounded-full" placeholder="Email" disabled />
              <Input className="rounded-full" placeholder="Телефон" disabled />
              <Button size="lg" className="w-full rounded-full" disabled>Записаться</Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
