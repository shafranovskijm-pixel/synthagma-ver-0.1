import { useState } from "react";
import { LazyMediaPreview } from "@/components/course-builder/LazyMediaPreview";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload, BookOpen, Trash2 } from "lucide-react";
import type { ContentBlock } from "../../types";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

export function DocumentBlock({ block, onUpdate }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void }) {
  const [isUploading, setIsUploading] = useState(false);
  const documentUrl = block.documentUrl || "";
  const documentName = block.documentName || "";

  const handleFileUpload = async (file: File) => {
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!allowedTypes.includes(file.type) && !['pdf', 'doc', 'docx'].includes(ext || '')) {
      const { toast } = await import("sonner"); toast.error("Поддерживаются только PDF и Word файлы"); return;
    }
    if (file.size > 50 * 1024 * 1024) { const { toast } = await import("sonner"); toast.error("Максимальный размер файла — 50 МБ"); return; }
    setIsUploading(true);
    try {
      const fileName = `doc_${crypto.randomUUID()}.${ext || 'pdf'}`;
      const supabaseClient = (await import("@/integrations/supabase/client")).supabase;
      const { error } = await supabaseClient.storage.from('course-files').upload(fileName, file, { upsert: true });
      if (error) throw error;
      const publicUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/course-files/${fileName}`;
      onUpdate({ documentUrl: publicUrl, documentName: file.name });
    } catch (e) {
      console.error("Document upload error:", e);
      const { toast } = await import("sonner"); toast.error("Ошибка загрузки документа");
    } finally { setIsUploading(false); }
  };

  const docExt = documentName.split('.').pop()?.toLowerCase();
  const isPdf = docExt === 'pdf';

  return (
    <div className="py-2">
      {documentUrl ? (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 overflow-hidden">
          <div className="flex items-center gap-3 p-3 border-b border-indigo-500/20">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center"><BookOpen className="w-4 h-4 text-indigo-500" /></div>
            <span className="font-medium text-sm truncate flex-1">{documentName || 'Документ'}</span>
            <div className="flex gap-1">
              <a href={documentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-500 hover:underline px-2 py-1">Скачать</a>
              <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => onUpdate({ documentUrl: "", documentName: "" })}><Trash2 className="w-4 h-4" /></Button>
            </div>
          </div>
          <LazyMediaPreview type="document" className="aspect-[4/3]">
            <div className="aspect-[4/3]">
              <iframe src={isPdf ? `https://docs.google.com/gview?url=${encodeURIComponent(documentUrl)}&embedded=true` : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(documentUrl)}`} className="w-full h-full border-0" />
            </div>
          </LazyMediaPreview>
        </div>
      ) : (
        <div className="bg-muted rounded-xl p-6 space-y-4">
          <div className="text-center">
            <BookOpen className="w-8 h-8 mx-auto mb-2 text-indigo-500" />
            <p className="text-sm text-muted-foreground mb-2">Загрузите документ PDF или Word</p>
            <p className="text-xs text-muted-foreground/70">Поддерживаются форматы: .pdf, .doc, .docx (до 50 МБ)</p>
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="outline" size="sm" className="mx-auto" onClick={() => document.getElementById(`doc-upload-${block.id}`)?.click()} disabled={isUploading}>
              {isUploading ? <SigmaSpinner size="sm" className="mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
              {isUploading ? "Загрузка..." : "Загрузить файл"}
            </Button>
            <input id={`doc-upload-${block.id}`} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }} />
            <div className="text-center text-xs text-muted-foreground">или вставьте ссылку</div>
            <div className="flex gap-2">
              <Input value={documentUrl} onChange={(e) => onUpdate({ documentUrl: e.target.value })} placeholder="https://example.com/document.pdf" className="text-sm flex-1" />
              {!documentName && documentUrl && <Button size="sm" variant="outline" onClick={() => onUpdate({ documentName: documentUrl.split('/').pop() || 'document' })}>OK</Button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
