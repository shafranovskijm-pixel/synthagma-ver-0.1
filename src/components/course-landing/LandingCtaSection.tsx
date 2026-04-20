import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {} from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

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

export function LandingCtaSection({
  title,
  subtitle,
  accentColor,
  isEditing,
  onTitleChange,
  onSubtitleChange,
  onSubmit,
  isEnrolled,
  price = 0 }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const accent = accentColor || undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({ name, email, phone });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      className="py-20 px-6 landing-bg-cta"
      style={{ backgroundColor: accent ? `${accent}10` : undefined }}
    >
      <div className="max-w-xl mx-auto text-center">
        {isEditing ? (
          <h2
            contentEditable
            suppressContentEditableWarning
            className="text-2xl md:text-3xl font-bold mb-3 outline-none border-b-2 border-dashed border-muted-foreground/20 focus:border-primary/40"
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}
          >
            {title}
          </h2>
        ) : (
          <h2 className="text-2xl md:text-3xl font-bold mb-3">{title}</h2>
        )}

        {isEditing ? (
          <p
            contentEditable
            suppressContentEditableWarning
            className="text-muted-foreground mb-8 outline-none border-b border-dashed border-muted-foreground/10 focus:border-primary/30"
            onBlur={(e) => onSubtitleChange?.(e.currentTarget.textContent || "")}
          >
            {subtitle}
          </p>
        ) : (
          subtitle && <p className="text-muted-foreground mb-8">{subtitle}</p>
        )}

        {!isEditing && !isEnrolled && (
          <form onSubmit={handleSubmit} className="space-y-3 max-w-sm mx-auto">
            <Input placeholder="Ваше имя" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input placeholder="Телефон" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={submitting}
              style={accent ? { backgroundColor: accent } : undefined}
            >
              {submitting ? <SigmaSpinner /> : (price > 0 ? "Оставить заявку" : "Оставить заявку")}
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
