import { Trash2 } from "lucide-react";
import { icons } from "lucide-react";
import React, { useState } from "react";
import { IconPickerDialog } from "./IconPickerDialog";

export interface AudienceItem {
  icon: string;
  title: string;
  description: string;
}

function toIconComponentName(kebab: string): string {
  return kebab.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}

interface Props {
  title: string;
  description: string;
  items: AudienceItem[];
  isEditing?: boolean;
  onTitleChange?: (v: string) => void;
  onDescriptionChange?: (v: string) => void;
  onItemChange?: (index: number, field: keyof AudienceItem, value: string) => void;
  onAddItem?: () => void;
  onRemoveItem?: (index: number) => void;
}

export function LandingAudienceSection({
  title, description, items, isEditing,
  onTitleChange, onDescriptionChange, onItemChange, onAddItem, onRemoveItem,
}: Props) {
  const [iconPicker, setIconPicker] = useState<number | null>(null);

  return (
    <section className="py-16 px-6">
      <div className="max-w-5xl mx-auto">
        {isEditing ? (
          <h2
            contentEditable suppressContentEditableWarning
            className="text-2xl md:text-3xl font-bold mb-4 outline-none border-b-2 border-dashed border-muted-foreground/20 focus:border-primary/40"
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}
          >{title}</h2>
        ) : (
          <h2 className="text-2xl md:text-3xl font-bold mb-4">{title}</h2>
        )}

        {isEditing ? (
          <p
            contentEditable suppressContentEditableWarning
            className="text-muted-foreground text-lg mb-8 max-w-2xl outline-none border-b border-dashed border-muted-foreground/10 focus:border-primary/30"
            onBlur={(e) => onDescriptionChange?.(e.currentTarget.textContent || "")}
          >{description}</p>
        ) : (
          description && <p className="text-muted-foreground text-lg mb-8 max-w-2xl">{description}</p>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((item, i) => {
            const compName = toIconComponentName(item.icon || "user");
            const IconComp = (icons as any)[compName];
            return (
              <div key={i} className="relative p-5 rounded-2xl bg-card border border-border group">
                {/* Icon */}
                <div
                  className={`w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 ${isEditing ? "cursor-pointer hover:bg-primary/20 transition" : ""}`}
                  onClick={() => isEditing && setIconPicker(i)}
                >
                  {IconComp ? React.createElement(IconComp, { className: "w-6 h-6 text-primary" }) : <span className="text-primary text-lg">•</span>}
                </div>

                {isEditing ? (
                  <h3
                    contentEditable suppressContentEditableWarning
                    className="font-semibold mb-2 outline-none border-b border-dashed border-transparent focus:border-primary/40"
                    onBlur={(e) => onItemChange?.(i, "title", e.currentTarget.textContent || "")}
                  >{item.title}</h3>
                ) : (
                  <h3 className="font-semibold mb-2">{item.title}</h3>
                )}

                {isEditing ? (
                  <p
                    contentEditable suppressContentEditableWarning
                    className="text-sm text-muted-foreground outline-none border-b border-dashed border-transparent focus:border-primary/40"
                    onBlur={(e) => onItemChange?.(i, "description", e.currentTarget.textContent || "")}
                  >{item.description}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                )}

                {isEditing && (
                  <button
                    onClick={() => onRemoveItem?.(i)}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-destructive transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {isEditing && (
          <button onClick={onAddItem} className="mt-4 text-sm text-primary hover:underline">
            + Добавить пункт
          </button>
        )}

        {iconPicker !== null && (
          <IconPickerDialog
            open
            onClose={() => setIconPicker(null)}
            onSelect={(name) => {
              onItemChange?.(iconPicker, "icon", name);
              setIconPicker(null);
            }}
          />
        )}
      </div>
    </section>
  );
}
