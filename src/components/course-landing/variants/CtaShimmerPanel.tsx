import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useTemplateStyle } from "../LandingThemeProvider";
import auroraCtaBanner from "@/assets/landing-templates/decor/aurora-cta-banner.jpg";

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
 * CTA «Shimmer Panel» — широкая премиальная панель с градиентом, движущимся
 * shimmer-блеском, glass-эффектом. Для Aurora.
 */
export function CtaShimmerPanel({
  title, subtitle, accentColor, isEditing, onTitleChange, onSubtitleChange, onSubmit, isEnrolled,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const accent = accentColor || "#22b8a6";
  const skin = useTemplateStyle();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSubmit) return;
    setSubmitting(true);
    try { await onSubmit({ name, email, phone }); } finally { setSubmitting(false); }
  };

  return (
    <section className="py-20 px-6 relative overflow-hidden" style={{ background: `radial-gradient(ellipse at top, ${accent}20, transparent 60%), #0f172a` }}>
      {/* Aurora glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full opacity-40 blur-3xl pointer-events-none"
        style={{ background: `radial-gradient(ellipse, ${accent}, transparent 70%)` }} />

      {/* Aurora premium banner accent */}
      <img src={auroraCtaBanner} alt="" aria-hidden
        className="hidden md:block absolute right-0 top-1/2 -translate-y-1/2 w-[420px] h-[420px] object-cover opacity-40 mix-blend-screen pointer-events-none rounded-full blur-sm"
        style={{ animation: "aurora-float 9s ease-in-out infinite" }} />

      <div className="max-w-3xl mx-auto relative">
        <div className="relative rounded-3xl p-8 md:p-12 backdrop-blur-xl border border-white/10 overflow-hidden"
          style={{
            background: `linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))`,
            boxShadow: `0 40px 80px -20px ${accent}55, inset 0 1px 0 rgba(255,255,255,0.1)`,
          }}>
          {/* Shimmer overlay */}
          <div className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              background: `linear-gradient(110deg, transparent 30%, ${accent}33 50%, transparent 70%)`,
              backgroundSize: "200% 100%",
              animation: "shimmer 4s linear infinite",
            }} />
          <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>

          <div className="relative text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4 text-xs font-bold uppercase tracking-wider"
              style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}55` }}>
              <Sparkles className="w-3 h-3" /> Старт нового потока
            </div>
            {isEditing ? (
              <h2 contentEditable suppressContentEditableWarning
                className={`landing-heading text-3xl md:text-4xl font-bold mb-3 text-white outline-none ${skin.sectionTitle}`}
                onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
            ) : (
              <h2 className={`landing-heading text-3xl md:text-4xl font-bold mb-3 text-white ${skin.sectionTitle}`}>{title}</h2>
            )}
            {isEditing ? (
              <p contentEditable suppressContentEditableWarning
                className="text-white/70 mb-8 outline-none"
                onBlur={(e) => onSubtitleChange?.(e.currentTarget.textContent || "")}>{subtitle}</p>
            ) : (
              subtitle && <p className="text-white/70 mb-8">{subtitle}</p>
            )}

            {!isEditing && !isEnrolled && (
              <form onSubmit={handleSubmit} className="space-y-3 max-w-sm mx-auto">
                <Input className="bg-white/10 border-white/20 text-white placeholder:text-white/50 backdrop-blur"
                  placeholder="Ваше имя" value={name} onChange={(e) => setName(e.target.value)} required />
                <Input type="email" className="bg-white/10 border-white/20 text-white placeholder:text-white/50 backdrop-blur"
                  placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <Input className="bg-white/10 border-white/20 text-white placeholder:text-white/50 backdrop-blur"
                  placeholder="Телефон" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <Button type="submit" size="lg"
                  className="w-full text-white font-bold hover:scale-[1.02] transition border-0"
                  style={{
                    background: `linear-gradient(135deg, ${accent}, #0ea5e9)`,
                    boxShadow: `0 15px 40px -10px ${accent}99`,
                  }}
                  disabled={submitting}>
                  {submitting ? <SigmaSpinner /> : "✨ Оставить заявку"}
                </Button>
              </form>
            )}

            {isEditing && (
              <div className="space-y-3 max-w-sm mx-auto opacity-50 pointer-events-none">
                <Input className="bg-white/10 border-white/20" placeholder="Имя" disabled />
                <Input className="bg-white/10 border-white/20" placeholder="Email" disabled />
                <Input className="bg-white/10 border-white/20" placeholder="Телефон" disabled />
                <Button size="lg" className="w-full" disabled>Оставить заявку</Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
