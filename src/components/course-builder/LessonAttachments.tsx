import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileUp, Trash2, FileText, FileSpreadsheet, Presentation, File, Download, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { uploadToStorage } from "@/utils/courseBuilderHelpers";
import { supabase } from "@/integrations/supabase/client";

export interface LessonAttachment {
  id: string;
  lesson_id: string;
  name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  category: string;
  order_index: number;
  created_at?: string;
  isNew?: boolean;
  isDeleted?: boolean;
}

interface LessonAttachmentsProps {
  lessonId: string;
  courseId: string | undefined;
  attachments: LessonAttachment[];
  onAttachmentsChange: (attachments: LessonAttachment[]) => void;
}

const ACCEPTED_TYPES = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

function getFileIcon(fileType: string | null) {
  if (!fileType) return File;
  const t = fileType.toLowerCase();
  if (t === "pdf") return FileText;
  if (["doc", "docx", "txt", "rtf"].includes(t)) return FileText;
  if (["xls", "xlsx"].includes(t)) return FileSpreadsheet;
  if (["ppt", "pptx"].includes(t)) return Presentation;
  return File;
}

function getFileColor(fileType: string | null) {
  if (!fileType) return "text-muted-foreground bg-muted";
  const t = fileType.toLowerCase();
  if (t === "pdf") return "text-red-500 bg-red-500/10";
  if (["doc", "docx"].includes(t)) return "text-blue-500 bg-blue-500/10";
  if (["xls", "xlsx"].includes(t)) return "text-green-500 bg-green-500/10";
  if (["ppt", "pptx"].includes(t)) return "text-orange-500 bg-orange-500/10";
  return "text-muted-foreground bg-muted";
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function LessonAttachments({ lessonId, courseId, attachments, onAttachmentsChange }: LessonAttachmentsProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<string>("material");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const lectureInputRef = useRef<HTMLInputElement>(null);
  const materialInputRef = useRef<HTMLInputElement>(null);

  const activeAttachments = attachments.filter(a => !a.isDeleted);
  const lectures = activeAttachments.filter(a => a.category === "lecture");
  const materials = activeAttachments.filter(a => a.category === "material");

  const handleUpload = async (files: FileList | null, category: string) => {
    if (!files || files.length === 0 || !courseId) return;
    setIsUploading(true);
    const newAttachments = [...attachments];

    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`Файл "${file.name}" слишком большой (макс. 50 МБ)`);
        continue;
      }
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const sanitized = sanitizeFileName(file.name);
      const path = `${courseId}/attachments/${lessonId}/${Date.now()}_${sanitized}`;

      try {
        const result = await uploadToStorage(file, "course-files", path);
        if (!result) throw new Error("Ошибка загрузки");

        newAttachments.push({
          id: crypto.randomUUID(),
          lesson_id: lessonId,
          name: file.name,
          file_url: result.url,
          file_type: ext,
          file_size: file.size,
          category,
          order_index: activeAttachments.length,
          isNew: true });
      } catch (err: any) {
        toast.error(`Ошибка загрузки "${file.name}": ${err.message}`);
      }
    }

    onAttachmentsChange(newAttachments);
    setIsUploading(false);
    toast.success("Файлы прикреплены");
  };

  const handleDelete = (id: string) => {
    onAttachmentsChange(
      attachments.map(a => a.id === id ? { ...a, isDeleted: true } : a)
    );
  };

  const startRename = (att: LessonAttachment) => {
    setEditingId(att.id);
    // Strip extension for editing
    const ext = att.name.includes('.') ? '.' + att.name.split('.').pop() : '';
    setEditingName(att.name.replace(ext, ''));
  };

  const confirmRename = (att: LessonAttachment) => {
    if (!editingName.trim()) {
      setEditingId(null);
      return;
    }
    const ext = att.name.includes('.') ? '.' + att.name.split('.').pop() : '';
    const newName = editingName.trim() + ext;
    onAttachmentsChange(
      attachments.map(a => a.id === att.id ? { ...a, name: newName } : a)
    );
    setEditingId(null);
  };

  const cancelRename = () => {
    setEditingId(null);
  };

  const renderFileList = (items: LessonAttachment[]) => (
    <div className="space-y-2">
      {items.map(att => {
        const Icon = getFileIcon(att.file_type);
        const color = getFileColor(att.file_type);
        const isEditing = editingId === att.id;
        return (
          <div key={att.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-secondary/30 group">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') confirmRename(att);
                      if (e.key === 'Escape') cancelRename();
                    }}
                    className="h-7 text-sm"
                    autoFocus
                  />
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-primary" onClick={() => confirmRename(att)}>
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={cancelRename}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-sm font-medium truncate cursor-pointer hover:text-primary transition-colors" onClick={() => startRename(att)} title="Нажмите, чтобы переименовать">
                    {att.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {att.file_type?.toUpperCase()} {att.file_size ? `• ${formatFileSize(att.file_size)}` : ""}
                  </p>
                </>
              )}
            </div>
            {!isEditing && (
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={() => startRename(att)} title="Переименовать">
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            )}
            <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><Download className="w-4 h-4" /></Button>
            </a>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={() => handleDelete(att.id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="mt-4 pt-4 border-t border-border space-y-4">
      <h4 className="font-medium text-sm flex items-center gap-2">
        <FileUp className="w-4 h-4 text-primary" />
        Прикрепленные файлы
      </h4>

      {/* Лекции */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Лекции (PDF, DOC)</Label>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => lectureInputRef.current?.click()} disabled={isUploading || !courseId}>
            {isUploading ? <SigmaSpinner size="xs" /> : <FileUp className="w-3 h-3" />}
            Загрузить
          </Button>
          <input ref={lectureInputRef} type="file" accept={ACCEPTED_TYPES} multiple className="hidden" onChange={(e) => { handleUpload(e.target.files, "lecture"); e.target.value = ""; }} />
        </div>
        {lectures.length > 0 ? renderFileList(lectures) : (
          <p className="text-xs text-muted-foreground py-2">Нет прикрепленных лекций</p>
        )}
      </div>

      {/* Методические материалы */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Методические материалы</Label>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => materialInputRef.current?.click()} disabled={isUploading || !courseId}>
            {isUploading ? <SigmaSpinner size="xs" /> : <FileUp className="w-3 h-3" />}
            Загрузить
          </Button>
          <input ref={materialInputRef} type="file" accept={ACCEPTED_TYPES} multiple className="hidden" onChange={(e) => { handleUpload(e.target.files, "material"); e.target.value = ""; }} />
        </div>
        {materials.length > 0 ? renderFileList(materials) : (
          <p className="text-xs text-muted-foreground py-2">Нет методических материалов</p>
        )}
      </div>

      {!courseId && (
        <p className="text-xs text-amber-500">Сохраните курс перед загрузкой файлов</p>
      )}
    </div>
  );
}
