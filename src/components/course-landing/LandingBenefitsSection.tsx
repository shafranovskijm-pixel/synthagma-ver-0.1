import { Trash2 } from "lucide-react";
import { icons } from "lucide-react";
import React, { useState } from "react";
import { IconPickerDialog } from "./IconPickerDialog";

export interface BenefitItem {
  icon: string;
  title: string;
  description: string;
}

function toIconComponentName(kebab: string): string {
  return kebab.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}

interface Props {
  benefits: BenefitItem[];
  isEditing?: boolean;
  onBenefitChange?: (index: number, field: "title" | "description" | "icon", value: string) => void;
  onAddBenefit?: () => void;
  onRemoveBenefit?: (index: number) => void;
}

export function LandingBenefitsSection({ benefits, isEditing, onBenefitChange, onAddBenefit, onRemoveBenefit }: Props) {
  const [iconPicker, setIconPicker] = useState<number | null>(null);

  if (benefits.length === 0 && !isEditing) return null;

  return (
    <section className="py-16 px-6">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold mb-8">Преимущества</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map((b, i) => {
            const compName = toIconComponentName(b.icon);
            const IconComp = (icons as any)[compName];
            return (
              <div key={i} className="relative p-6 rounded-2xl bg-card border border-border text-center group">
                {isEditing && (
                  <button
                    onClick={() => onRemoveBenefit?.(i)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-destructive transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}

                <div
                  className={`flex justify-center mb-4 ${isEditing ? "cursor-pointer" : ""}`}
                  onClick={() => isEditing && setIconPicker(i)}
                >
                  <div className={`w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center ${isEditing ? "hover:bg-primary/20 transition" : ""}`}>
                    {IconComp ? React.createElement(IconComp, { className: "w-6 h-6 text-primary" }) : <span className="text-primary">•</span>}
                  </div>
                </div>

                {isEditing ? (
                  <h3
                    contentEditable suppressContentEditableWarning
                    className="font-semibold mb-2 outline-none border-b border-dashed border-transparent focus:border-primary/40"
                    onBlur={(e) => onBenefitChange?.(i, "title", e.currentTarget.textContent || "")}
                  >{b.title}</h3>
                ) : (
                  <h3 className="font-semibold mb-2">{b.title}</h3>
                )}

                {isEditing ? (
                  <p
                    contentEditable suppressContentEditableWarning
                    className="text-sm text-muted-foreground outline-none border-b border-dashed border-transparent focus:border-primary/40"
                    onBlur={(e) => onBenefitChange?.(i, "description", e.currentTarget.textContent || "")}
                  >{b.description}</p>
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

        {iconPicker !== null && (
          <IconPickerDialog
            open
            onClose={() => setIconPicker(null)}
            onSelect={(name) => {
              onBenefitChange?.(iconPicker, "icon", name);
              setIconPicker(null);
            }}
          />
        )}
      </div>
    </section>
  );
}
