import { CheckCircle } from "lucide-react";

interface Props {
  title: string;
  description: string;
  items: string[];
  isEditing?: boolean;
  onTitleChange?: (v: string) => void;
  onDescriptionChange?: (v: string) => void;
  onItemChange?: (index: number, v: string) => void;
  onAddItem?: () => void;
  onRemoveItem?: (index: number) => void;
}

export function LandingAudienceSection({
  title,
  description,
  items,
  isEditing,
  onTitleChange,
  onDescriptionChange,
  onItemChange,
  onAddItem,
  onRemoveItem,
}: Props) {
  return (
    <section className="py-16 px-6">
      <div className="max-w-5xl mx-auto">
        {isEditing ? (
          <h2
            contentEditable
            suppressContentEditableWarning
            className="text-2xl md:text-3xl font-bold mb-4 outline-none border-b-2 border-dashed border-muted-foreground/20 focus:border-primary/40"
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}
          >
            {title}
          </h2>
        ) : (
          <h2 className="text-2xl md:text-3xl font-bold mb-4">{title}</h2>
        )}

        {isEditing ? (
          <p
            contentEditable
            suppressContentEditableWarning
            className="text-muted-foreground text-lg mb-8 max-w-2xl outline-none border-b border-dashed border-muted-foreground/10 focus:border-primary/30"
            onBlur={(e) => onDescriptionChange?.(e.currentTarget.textContent || "")}
          >
            {description}
          </p>
        ) : (
          description && <p className="text-muted-foreground text-lg mb-8 max-w-2xl">{description}</p>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border group">
              <CheckCircle className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              {isEditing ? (
                <div className="flex-1 flex items-center gap-2">
                  <span
                    contentEditable
                    suppressContentEditableWarning
                    className="flex-1 outline-none border-b border-dashed border-transparent focus:border-primary/40"
                    onBlur={(e) => onItemChange?.(i, e.currentTarget.textContent || "")}
                  >
                    {item}
                  </span>
                  <button
                    onClick={() => onRemoveItem?.(i)}
                    className="opacity-0 group-hover:opacity-100 text-destructive text-xs transition"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <span className="text-sm">{item}</span>
              )}
            </div>
          ))}
        </div>

        {isEditing && (
          <button
            onClick={onAddItem}
            className="mt-4 text-sm text-primary hover:underline"
          >
            + Добавить пункт
          </button>
        )}
      </div>
    </section>
  );
}
