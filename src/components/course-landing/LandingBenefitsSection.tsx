import { Shield, Award, Clock, Users } from "lucide-react";

export interface BenefitItem {
  icon: string;
  title: string;
  description: string;
}

const iconMap: Record<string, React.ComponentType<any>> = {
  shield: Shield,
  award: Award,
  clock: Clock,
  users: Users,
};

const iconKeys = Object.keys(iconMap);

interface Props {
  benefits: BenefitItem[];
  isEditing?: boolean;
  onBenefitChange?: (index: number, field: "title" | "description" | "icon", value: string) => void;
  onAddBenefit?: () => void;
  onRemoveBenefit?: (index: number) => void;
}

export function LandingBenefitsSection({ benefits, isEditing, onBenefitChange, onAddBenefit, onRemoveBenefit }: Props) {
  if (benefits.length === 0 && !isEditing) return null;

  return (
    <section className="py-16 px-6">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold mb-8">Преимущества</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map((b, i) => {
            const Icon = iconMap[b.icon] || Shield;
            return (
              <div key={i} className="relative p-6 rounded-2xl bg-card border border-border text-center group">
                {isEditing && (
                  <button
                    onClick={() => onRemoveBenefit?.(i)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-destructive text-xs transition"
                  >
                    ✕
                  </button>
                )}

                {isEditing ? (
                  <div className="flex justify-center gap-1 mb-4">
                    {iconKeys.map((key) => {
                      const I = iconMap[key];
                      return (
                        <button
                          key={key}
                          onClick={() => onBenefitChange?.(i, "icon", key)}
                          className={`p-1.5 rounded ${b.icon === key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                        >
                          <I className="w-5 h-5" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex justify-center mb-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                  </div>
                )}

                {isEditing ? (
                  <h3
                    contentEditable
                    suppressContentEditableWarning
                    className="font-semibold mb-2 outline-none border-b border-dashed border-transparent focus:border-primary/40"
                    onBlur={(e) => onBenefitChange?.(i, "title", e.currentTarget.textContent || "")}
                  >
                    {b.title}
                  </h3>
                ) : (
                  <h3 className="font-semibold mb-2">{b.title}</h3>
                )}

                {isEditing ? (
                  <p
                    contentEditable
                    suppressContentEditableWarning
                    className="text-sm text-muted-foreground outline-none border-b border-dashed border-transparent focus:border-primary/40"
                    onBlur={(e) => onBenefitChange?.(i, "description", e.currentTarget.textContent || "")}
                  >
                    {b.description}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">{b.description}</p>
                )}
              </div>
            );
          })}
        </div>

        {isEditing && benefits.length < 8 && (
          <button onClick={onAddBenefit} className="mt-4 text-sm text-primary hover:underline">
            + Добавить преимущество
          </button>
        )}
      </div>
    </section>
  );
}
