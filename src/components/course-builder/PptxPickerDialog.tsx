import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Presentation, FolderOpen, Search } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface PptxFile {
  name: string;
  url: string;
  size: number;
  created_at: string;
}

interface SliderLessonEntry {
  lessonId: string;
  lessonTitle: string;
  courseTitle: string;
  slidesCount: number;
  content: string;
  created_at: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

interface PptxPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  onSelectSliderContent?: (content: string, title: string) => void;
  currentLessonId?: string;
}

export function PptxPickerDialog({ open, onClose, onSelect, onSelectSliderContent, currentLessonId }: PptxPickerDialogProps) {
  const [files, setFiles] = useState<PptxFile[]>([]);
  const [sliderLessons, setSliderLessons] = useState<SliderLessonEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<'pptx' | 'sliders'>('pptx');

  useEffect(() => {
    if (open) {
      setSearch("");
      loadPptxFiles();
      loadSliderLessons();
    }
  }, [open]);

  const loadPptxFiles = async () => {
    setLoading(true);
    const allFiles: PptxFile[] = [];
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    try {
      const { data, error } = await supabase.rpc("get_user_storage_files", { bucket_name: "presentations" });
      if (!error && data) {
        for (const f of data as any[]) {
          const filePath = f.file_path || f.file_name;
          const fileName = filePath.split("/").pop() || filePath;
          if (!fileName.toLowerCase().endsWith('.pptx')) continue;
          allFiles.push({
            name: fileName,
            url: `${baseUrl}/storage/v1/object/public/presentations/${filePath}`,
            size: f.file_size || 0,
            created_at: f.created_at || "" });
        }
      }
    } catch (err) {
      console.error("Error loading presentations:", err);
    }
    setFiles(allFiles);
    setLoading(false);
  };

  const loadSliderLessons = async () => {
    try {
      const { data, error } = await supabase
        .from('lessons')
        .select('id, title, content, created_at, course_id, courses(title)')
        .eq('type', 'slider')
        .not('content', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);
      if (!error && data) {
        const entries: SliderLessonEntry[] = [];
        for (const l of data) {
          if (l.id === currentLessonId) continue;
          try {
            const parsed = JSON.parse(l.content || '[]');
            const slides = Array.isArray(parsed) ? parsed : (parsed.slides || []);
            if (slides.length === 0) continue;
            entries.push({
              lessonId: l.id,
              lessonTitle: l.title,
              courseTitle: (l.courses as any)?.title || '',
              slidesCount: slides.length,
              content: l.content!,
              created_at: l.created_at });
          } catch { continue; }
        }
        setSliderLessons(entries);
      }
    } catch (err) {
      console.error("Error loading slider lessons:", err);
    }
  };

  const filteredFiles = files.filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()));
  const filteredLessons = sliderLessons.filter(l => !search || l.lessonTitle.toLowerCase().includes(search.toLowerCase()) || l.courseTitle.toLowerCase().includes(search.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Выбрать презентацию
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          <button onClick={() => setTab('pptx')}
            className={`flex-1 text-sm py-1.5 px-3 rounded-md transition-colors ${tab === 'pptx' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
            PPTX файлы
          </button>
          <button onClick={() => setTab('sliders')}
            className={`flex-1 text-sm py-1.5 px-3 rounded-md transition-colors ${tab === 'sliders' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
            Из уроков ({sliderLessons.length})
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск..." className="pl-9" />
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <SigmaSpinner />
            <span className="ml-2 text-sm text-muted-foreground">Загрузка...</span>
          </div>
        ) : tab === 'pptx' ? (
          filteredFiles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Presentation className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">{files.length === 0 ? "Нет загруженных PPTX" : "Ничего не найдено"}</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-1">
                {filteredFiles.map((file, i) => (
                  <button key={i} onClick={() => onSelect(file.url)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg text-left hover:bg-muted/70 transition-colors">
                    <Presentation className="w-5 h-5 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.size > 0 && formatFileSize(file.size)}
                        {file.created_at && ` · ${new Date(file.created_at).toLocaleDateString("ru-RU")}`}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )
        ) : (
          filteredLessons.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Presentation className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">{sliderLessons.length === 0 ? "Нет слайдеров в других уроках" : "Ничего не найдено"}</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-1">
                {filteredLessons.map((entry) => (
                  <button key={entry.lessonId} onClick={() => onSelectSliderContent?.(entry.content, entry.lessonTitle)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg text-left hover:bg-muted/70 transition-colors">
                    <Presentation className="w-5 h-5 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{entry.lessonTitle}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.slidesCount} сл. · {entry.courseTitle}
                        {entry.created_at && ` · ${new Date(entry.created_at).toLocaleDateString("ru-RU")}`}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
