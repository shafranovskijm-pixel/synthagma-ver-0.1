import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stamp, FileSignature } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useTemplateStyle } from "../LandingThemeProvider";

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
 * CTA «Stamped Form» — заявка как корпоративная анкета с реквизитами, штампом
 * «УТВЕРДИТЬ» и жёсткой синей рамкой. Для Safety.
 */
export function CtaStampedForm({
  title, subtitle, accentColor, isEditing, onTitleChange, onSubtitleChange, onSubmit, isEnrolled,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const accent = accentColor || "#1e3a8a";
  const skin = useTemplateStyle();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSubmit) return;
    setSubmitting(true);
    try { await onSubmit({ name, email, phone }); } finally { setSubmitting(false); }
  };

  return (
    <section className="py-20 px-6" style={{ background: "linear-gradient(180deg, #f1f5f9 0%, #e0e7ff 100%)" }}>
      <div className="max-w-2xl mx-auto bg-white border-2" style={{ borderColor: accent, boxShadow: `0 25px 50px -15px ${accent}55` }}>
        {/* Шапка-бланк */}
        <div className="px-8 py-3 border-b-2 flex items-center justify-between text-xs font-mono uppercase tracking-widest" style={{ borderColor: accent, background: `${accent}10`, color: accent }}>
          <span><FileSignature className="w-3.5 h-3.5 inline mr-1" />Форма ОТ-04 / 2025</span>
          <span>Заявка на обучение</span>
        </div>

        <div className="p-8 relative">
          {/* Печать */}
          <div className="absolute top-6 right-6 w-24 h-24 rounded-full border-[3px] border-dashed flex flex-col items-center justify-center text-center rotate-[-10deg] opacity-70"
            style={{ borderColor: accent, color: accent }}>
            <Stamp className="w-5 h-5 mb-0.5" />
            <div className="text-[9px] font-bold leading-tight">УТВЕРДИТЬ<br/>{new Date().getFullYear()}</div>
          </div>

          {isEditing ? (
            <h2 contentEditable suppressContentEditableWarning
              className={`landing-heading text-2xl md:text-3xl font-bold mb-3 outline-none uppercase tracking-wide pr-28 ${skin.sectionTitle}`}
              onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
          ) : (
            <h2 className={`landing-heading text-2xl md:text-3xl font-bold mb-3 uppercase tracking-wide pr-28 ${skin.sectionTitle}`}>{title}</h2>
          )}
          {isEditing ? (
            <p contentEditable suppressContentEditableWarning
              className="text-muted-foreground mb-8 outline-none text-sm"
              onBlur={(e) => onSubtitleChange?.(e.currentTarget.textContent || "")}>{subtitle}</p>
          ) : (
            subtitle && <p className="text-muted-foreground mb-8 text-sm">{subtitle}</p>
          )}

          {!isEditing && !isEnrolled && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest mb-1 block" style={{ color: accent }}>1. ФИО заявителя</label>
                <Input className="rounded-none border-2 focus-visible:ring-blue-300"
                  style={{ borderColor: `${accent}55` }}
                  placeholder="Иванов Иван Иванович" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest mb-1 block" style={{ color: accent }}>2. Email</label>
                <Input type="email" className="rounded-none border-2 focus-visible:ring-blue-300"
                  style={{ borderColor: `${accent}55` }}
                  placeholder="email@company.ru" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest mb-1 block" style={{ color: accent }}>3. Контактный телефон</label>
                <Input className="rounded-none border-2 focus-visible:ring-blue-300"
                  style={{ borderColor: `${accent}55` }}
                  placeholder="+7 (___) ___-__-__" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <Button type="submit" size="lg"
                className="w-full rounded-none font-bold uppercase tracking-wider hover:opacity-90 transition"
                style={{ background: accent, color: "white" }}
                disabled={submitting}>
                {submitting ? <SigmaSpinner /> : "Подать заявку →"}
              </Button>
              <p className="text-[10px] font-mono uppercase tracking-widest text-center" style={{ color: `${accent}99` }}>
                Подпись · М.П. · {new Date().toLocaleDateString("ru-RU")}
              </p>
            </form>
          )}

          {isEditing && (
            <div className="space-y-3 opacity-50 pointer-events-none">
              <Input className="rounded-none border-2" placeholder="ФИО" disabled />
              <Input className="rounded-none border-2" placeholder="Email" disabled />
              <Input className="rounded-none border-2" placeholder="Телефон" disabled />
              <Button size="lg" className="w-full rounded-none" disabled>Подать заявку</Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
