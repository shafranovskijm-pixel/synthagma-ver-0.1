import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, BookOpen, Trash2, Search, FileText } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface KnowledgeBankEntry {
  id: string;
  title: string;
  content: string | null;
  source_filename: string | null;
  tags: string[] | null;
  created_at: string;
}

export function KnowledgeBankTab() {
  const [entries, setEntries] = useState<KnowledgeBankEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadProgress, setUploadProgress] = useState("");

  const fetchEntries = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("knowledge_bank")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setEntries((data as KnowledgeBankEntry[]) || []);
    } catch (err: any) {
      toast.error(`Ошибка загрузки: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    let uploaded = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(`${i + 1}/${files.length}: ${file.name}`);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const { data, error } = await supabase.functions.invoke("import-course", {
          body: formData });

        if (error) throw error;

        const content = data?.text || data?.content || "";
        const title = file.name.replace(/\.(docx?|pdf|txt)$/i, "").trim();

        // Extract tags from filename and content
        const tags = extractTags(title, content);

        // Save to knowledge_bank
        const { error: insertErr } = await supabase.from("knowledge_bank").insert({
          title,
          content,
          source_filename: file.name,
          tags });

        if (insertErr) throw insertErr;
        uploaded++;
      } catch (err: any) {
        console.error(`Failed to upload ${file.name}:`, err);
        failed++;
      }
    }

    setIsUploading(false);
    setUploadProgress("");
    toast.success(`Загружено ${uploaded} файлов${failed > 0 ? `, ошибок: ${failed}` : ""}`);
    fetchEntries();

    // Reset input
    e.target.value = "";
  };

  const extractTags = (title: string, content: string): string[] => {
    const tags: string[] = [];
    const lower = (title + " " + content.slice(0, 500)).toLowerCase();

    const keywords = [
      "охрана труда", "пожарная безопасность", "экология", "высота",
      "электробезопасность", "первая помощь", "СИЗ", "стропальщик",
      "грузоподъемные", "газовоздушная", "отходы", "ОЗП", "замкнутые пространства",
    ];

    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) tags.push(kw);
    }

    return tags;
  };

  const handleDelete = async (id: string) => {
    try {
      await supabase.from("knowledge_bank").delete().eq("id", id);
      setEntries(prev => prev.filter(e => e.id !== id));
      toast.success("Удалено");
    } catch (err: any) {
      toast.error(`Ошибка: ${err.message}`);
    }
  };

  const filtered = entries.filter(e =>
    !searchQuery || e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.source_filename?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Банк знаний
          </CardTitle>
          <CardDescription>
            Загрузите DOC/DOCX файлы с лекциями. Конвейер будет искать подходящий контент по тематике перед обращением к ИИ.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Upload area */}
          <div className="border-2 border-dashed rounded-xl p-6 text-center hover:border-primary/50 transition-colors relative">
            <input
              type="file"
              accept=".doc,.docx,.pdf,.txt"
              multiple
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={handleFileUpload}
              disabled={isUploading}
            />
            {isUploading ? (
              <div className="flex flex-col items-center gap-2">
                <SigmaSpinner size="lg" />
                <p className="text-sm text-muted-foreground">{uploadProgress}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Перетащите файлы или нажмите для загрузки
                </p>
                <p className="text-xs text-muted-foreground/70">
                  DOC, DOCX, PDF, TXT — до 20 МБ каждый
                </p>
              </div>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по названию или тегам..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-xl"
            />
          </div>

          {/* List */}
          {isLoading ? (
            <div className="flex justify-center py-8">
              <SigmaSpinner />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {entries.length === 0 ? "Банк знаний пуст. Загрузите лекции." : "Ничего не найдено"}
              </p>
            </div>
          ) : (
            <div className="border rounded-xl overflow-hidden max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Название</TableHead>
                    <TableHead className="w-24">Размер</TableHead>
                    <TableHead className="w-40">Теги</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{entry.title}</p>
                          {entry.source_filename && (
                            <p className="text-xs text-muted-foreground">{entry.source_filename}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {entry.content ? `${Math.round(entry.content.length / 1024)} КБ` : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {entry.tags?.slice(0, 3).map((tag, i) => (
                            <Badge key={i} variant="outline" className="text-[9px]">{tag}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(entry.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>{entries.length} материалов в банке знаний</span>
            <Button variant="ghost" size="sm" onClick={fetchEntries} disabled={isLoading}>
              Обновить
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
