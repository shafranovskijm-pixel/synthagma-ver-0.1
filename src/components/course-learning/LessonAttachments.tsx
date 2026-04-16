import { FileText, FileSpreadsheet, Presentation, File, Eye } from "lucide-react";

interface Attachment {
  id: string;
  name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  category: string;
}

interface LessonAttachmentsProps {
  attachments: Attachment[];
  onPreview: (file: { url: string; name: string; type: string | null }) => void;
}

function getIcon(ft: string | null) {
  if (!ft) return File;
  const t = ft.toLowerCase();
  if (t === 'pdf') return FileText;
  if (['doc', 'docx', 'txt', 'rtf'].includes(t)) return FileText;
  if (['xls', 'xlsx'].includes(t)) return FileSpreadsheet;
  if (['ppt', 'pptx'].includes(t)) return Presentation;
  return File;
}

function getColor(ft: string | null) {
  if (!ft) return 'text-muted-foreground bg-muted';
  const t = ft.toLowerCase();
  if (t === 'pdf') return 'text-red-500 bg-red-500/10';
  if (['doc', 'docx'].includes(t)) return 'text-blue-500 bg-blue-500/10';
  if (['xls', 'xlsx'].includes(t)) return 'text-green-500 bg-green-500/10';
  if (['ppt', 'pptx'].includes(t)) return 'text-orange-500 bg-orange-500/10';
  return 'text-muted-foreground bg-muted';
}

function formatSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function FileGrid({ files, onPreview }: { files: Attachment[]; onPreview: LessonAttachmentsProps['onPreview'] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {files.map(att => {
        const Icon = getIcon(att.file_type);
        const color = getColor(att.file_type);
        return (
          <button key={att.id} onClick={() => onPreview({ url: att.file_url, name: att.name, type: att.file_type })}
            className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-secondary/50 transition-colors group text-left">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{att.name}</p>
              <p className="text-xs text-muted-foreground">
                {att.file_type?.toUpperCase()} {att.file_size ? `• ${formatSize(att.file_size)}` : ''}
              </p>
            </div>
            <Eye className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
          </button>
        );
      })}
    </div>
  );
}

export function LessonAttachments({ attachments, onPreview }: LessonAttachmentsProps) {
  const lectures = attachments.filter(a => a.category === 'lecture');
  const materials = attachments.filter(a => a.category === 'material');
  const others = attachments.filter(a => a.category !== 'lecture' && a.category !== 'material');

  return (
    <div className="mt-8 space-y-6 animate-fade-in">
      {lectures.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">📄 Лекции</h3>
          <FileGrid files={lectures} onPreview={onPreview} />
        </div>
      )}
      {materials.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">📚 Методические материалы</h3>
          <FileGrid files={materials} onPreview={onPreview} />
        </div>
      )}
      {others.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">📎 Дополнительные файлы</h3>
          <FileGrid files={others} onPreview={onPreview} />
        </div>
      )}
    </div>
  );
}
