import { Trash2, Upload } from "lucide-react";
import { useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface TeacherItem {
  name: string;
  role: string;
  description: string;
  photo_url: string | null;
}

interface Props {
  title: string;
  description: string;
  teachers: TeacherItem[];
  courseId?: string;
  isEditing?: boolean;
  onTitleChange?: (v: string) => void;
  onDescriptionChange?: (v: string) => void;
  onTeacherChange?: (index: number, field: keyof TeacherItem, value: string) => void;
  onAddTeacher?: () => void;
  onRemoveTeacher?: (index: number) => void;
}

export function LandingTeachersSection({
  title, description, teachers, courseId, isEditing,
  onTitleChange, onDescriptionChange, onTeacherChange, onAddTeacher, onRemoveTeacher,
}: Props) {
  if (teachers.length === 0 && !isEditing) return null;

  return (
    <section className="py-16 px-6">
      <div className="max-w-5xl mx-auto text-center">
        {isEditing ? (
          <h2
            contentEditable suppressContentEditableWarning
            className="text-2xl md:text-3xl font-bold mb-3 outline-none border-b-2 border-dashed border-muted-foreground/20 focus:border-primary/40"
            onBlur={(e) => onTitleChange?.(e.currentTarget.textContent || "")}
          >{title}</h2>
        ) : (
          <h2 className="text-2xl md:text-3xl font-bold mb-3">{title}</h2>
        )}

        {isEditing ? (
          <p
            contentEditable suppressContentEditableWarning
            className="text-muted-foreground mb-10 outline-none border-b border-dashed border-muted-foreground/10 focus:border-primary/30"
            onBlur={(e) => onDescriptionChange?.(e.currentTarget.textContent || "")}
          >{description || "Добавьте описание, если необходимо..."}</p>
        ) : (
          description && <p className="text-muted-foreground mb-10">{description}</p>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {teachers.map((t, i) => (
            <TeacherCard
              key={i}
              teacher={t}
              index={i}
              courseId={courseId}
              isEditing={isEditing}
              onChange={onTeacherChange}
              onRemove={onRemoveTeacher}
            />
          ))}
        </div>

        {isEditing && (
          <button onClick={onAddTeacher} className="mt-6 text-sm text-primary hover:underline">
            + Добавить преподавателя
          </button>
        )}
      </div>
    </section>
  );
}

function TeacherCard({
  teacher, index, courseId, isEditing, onChange, onRemove,
}: {
  teacher: TeacherItem;
  index: number;
  courseId?: string;
  isEditing?: boolean;
  onChange?: (index: number, field: keyof TeacherItem, value: string) => void;
  onRemove?: (index: number) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !courseId) return;
    const ext = file.name.split(".").pop();
    const path = `${courseId}/teacher-${index}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("course-files").upload(path, file, { upsert: true });
    if (error) { toast.error("Ошибка загрузки"); return; }
    const { data } = supabase.storage.from("course-files").getPublicUrl(path);
    onChange?.(index, "photo_url", data.publicUrl);
  };

  return (
    <div className="relative p-6 rounded-2xl bg-card border border-border group">
      {isEditing && (
        <button
          onClick={() => onRemove?.(index)}
          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-destructive transition z-10"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}

      {/* Photo */}
      <div className="flex justify-center mb-4">
        <div
          className={`w-32 h-32 rounded-full overflow-hidden bg-muted flex items-center justify-center ${isEditing ? "cursor-pointer hover:opacity-80 transition" : ""}`}
          onClick={() => isEditing && fileRef.current?.click()}
        >
          {teacher.photo_url ? (
            <img src={teacher.photo_url} alt={teacher.name} className="w-full h-full object-cover" />
          ) : (
            <Upload className="w-8 h-8 text-muted-foreground" />
          )}
        </div>
        {isEditing && <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />}
      </div>

      {/* Name */}
      {isEditing ? (
        <h3
          contentEditable suppressContentEditableWarning
          className="font-bold text-lg mb-1 outline-none border-b border-dashed border-transparent focus:border-primary/40"
          onBlur={(e) => onChange?.(index, "name", e.currentTarget.textContent || "")}
        >{teacher.name}</h3>
      ) : (
        <h3 className="font-bold text-lg mb-1">{teacher.name}</h3>
      )}

      {/* Role */}
      {isEditing ? (
        <p
          contentEditable suppressContentEditableWarning
          className="text-primary text-sm font-medium mb-3 outline-none border-b border-dashed border-transparent focus:border-primary/40"
          onBlur={(e) => onChange?.(index, "role", e.currentTarget.textContent || "")}
        >{teacher.role}</p>
      ) : (
        teacher.role && <p className="text-primary text-sm font-medium mb-3">{teacher.role}</p>
      )}

      {/* Description */}
      {isEditing ? (
        <p
          contentEditable suppressContentEditableWarning
          className="text-sm text-muted-foreground italic outline-none border-b border-dashed border-transparent focus:border-primary/40"
          onBlur={(e) => onChange?.(index, "description", e.currentTarget.textContent || "")}
        >{teacher.description}</p>
      ) : (
        teacher.description && <p className="text-sm text-muted-foreground italic">{teacher.description}</p>
      )}
    </div>
  );
}
