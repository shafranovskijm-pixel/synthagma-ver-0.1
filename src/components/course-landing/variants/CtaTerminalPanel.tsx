import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
 * CTA «Terminal Panel» — заявка как форма терминала с полями `--name`, `--email`,
 * кнопкой `> ./apply.sh`. Тёмный фон, моноширинный шрифт, неон. Для Lab.
 */
export function CtaTerminalPanel({
  title, subtitle, accentColor, isEditing, onTitleChange, onSubtitleChange, onSubmit, isEnrolled,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const accent = accentColor || "#22d3ee";
  const skin = useTemplateStyle();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSubmit) return;
    setSubmitting(true);
    try { await onSubmit({ name, email, phone }); } finally { setSubmitting(false); }
  };

  return (
    <section className="py-20 px-6 landing-bg-cta" style={{ backgroundColor: "#0a0a0a" }}>
      <div className="max-w-2xl mx-auto bg-zinc-950 border border-cyan-500/30 font-mono"
        style={{ boxShadow: `0 0 0 1px ${accent}22, 0 30px 60px -20px ${accent}55` }}>
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-cyan-500/20 bg-black/60">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
          <span className="ml-2 text-xs text-cyan-300/70 truncate">~/apply.sh — bash</span>
        </div>

        <div className="p-8">
          <div className="text-xs text-zinc-500 mb-2">$ ./signup --course=advanced</div>
          {isEditing ? (
            <h2 contentEditable suppressContentEditableWarning
              className={`landing-heading text-2xl md:text-3xl font-bold mb-3 outline-none text-cyan-100 ${skin.sectionTitle}`}
              onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}>{title}</h2>
          ) : (
            <h2 className={`landing-heading text-2xl md:text-3xl font-bold mb-3 text-cyan-100 ${skin.sectionTitle}`}>
              <span style={{ color: accent }}>&gt; </span>{title}
            </h2>
          )}
          {isEditing ? (
            <p contentEditable suppressContentEditableWarning
              className="text-zinc-400 mb-6 outline-none text-sm"
              onBlur={(e) => onSubtitleChange?.(e.currentTarget.textContent || "")}>{subtitle}</p>
          ) : (
            subtitle && <p className="text-zinc-400 mb-6 text-sm"><span className="text-zinc-600"># </span>{subtitle}</p>
          )}

          {!isEditing && !isEnrolled && (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-cyan-400 mb-1 block">--name</label>
                <Input className="bg-black/50 border-cyan-500/30 text-cyan-100 font-mono placeholder:text-zinc-600 rounded-none focus-visible:ring-cyan-500/40"
                  placeholder='"Иван Иванов"' value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs text-cyan-400 mb-1 block">--email</label>
                <Input type="email" className="bg-black/50 border-cyan-500/30 text-cyan-100 font-mono placeholder:text-zinc-600 rounded-none focus-visible:ring-cyan-500/40"
                  placeholder='"user@dev.io"' value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs text-cyan-400 mb-1 block">--phone</label>
                <Input className="bg-black/50 border-cyan-500/30 text-cyan-100 font-mono placeholder:text-zinc-600 rounded-none focus-visible:ring-cyan-500/40"
                  placeholder='"+7..."' value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <Button type="submit" size="lg"
                className="w-full font-mono font-bold rounded-none border-2 hover:scale-[1.02] transition"
                style={{ background: accent, color: "#0a0a0a", borderColor: accent, boxShadow: `0 0 20px ${accent}77` }}
                disabled={submitting}>
                {submitting ? <SigmaSpinner /> : "$ ./apply.sh --confirm"}
              </Button>
            </form>
          )}

          {isEditing && (
            <div className="space-y-3 opacity-50 pointer-events-none">
              <Input placeholder='"name"' className="bg-black/50 border-cyan-500/30 font-mono rounded-none" disabled />
              <Input placeholder='"email"' className="bg-black/50 border-cyan-500/30 font-mono rounded-none" disabled />
              <Input placeholder='"phone"' className="bg-black/50 border-cyan-500/30 font-mono rounded-none" disabled />
              <Button size="lg" className="w-full font-mono rounded-none" disabled>$ ./apply.sh</Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
