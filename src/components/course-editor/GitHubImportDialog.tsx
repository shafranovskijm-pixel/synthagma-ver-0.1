import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from "@/components/ui/select";
import { Github, FolderTree, FileText, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface GitHubFile {
  name: string;
  path: string;
  type: "file" | "dir";
  content?: string;
}

interface GitHubImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: {
    title: string;
    description: string;
    lessons: { title: string; content: string; type: string }[];
  }) => void;
}

export const GitHubImportDialog = ({
  isOpen,
  onClose,
  onImport }: GitHubImportDialogProps) => {
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<GitHubFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [step, setStep] = useState<"url" | "select" | "preview">("url");

  const parseRepoUrl = (url: string) => {
    // Support formats:
    // https://github.com/owner/repo
    // github.com/owner/repo
    // owner/repo
    const match = url.match(/(?:github\.com\/)?([^\/]+)\/([^\/\s]+)/);
    if (match) {
      return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
    }
    return null;
  };

  const fetchRepoContents = async () => {
    setError(null);
    setIsLoading(true);

    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) {
      setError("Неверный формат URL репозитория. Используйте формат: owner/repo");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents?ref=${branch}`
      );

      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "Репозиторий не найден. Проверьте URL и убедитесь, что репозиторий публичный."
            : "Не удалось загрузить содержимое репозитория"
        );
      }

      const data = await response.json();
      
      // Filter to only show markdown files and directories
      const filteredFiles = data
        .filter(
          (item: any) =>
            item.type === "dir" ||
            item.name.endsWith(".md") ||
            item.name.endsWith(".json")
        )
        .map((item: any) => ({
          name: item.name,
          path: item.path,
          type: item.type === "dir" ? "dir" : "file" }));

      setFiles(filteredFiles);
      setStep("select");
    } catch (err: any) {
      setError(err.message || "Произошла ошибка при загрузке");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFileContent = async (path: string) => {
    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) return "";

    try {
      const response = await fetch(
        `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents/${path}?ref=${branch}`
      );
      const data = await response.json();
      return atob(data.content);
    } catch {
      return "";
    }
  };

  const handleImport = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const parsed = parseRepoUrl(repoUrl);
      if (!parsed) throw new Error("Invalid URL");

      // Fetch README for course description
      let description = "";
      const readmeFile = files.find(
        (f) => f.name.toLowerCase() === "readme.md"
      );
      if (readmeFile) {
        description = await fetchFileContent(readmeFile.path);
      }

      // Fetch selected markdown files as lessons
      const lessons = [];
      for (const path of selectedFiles) {
        const content = await fetchFileContent(path);
        const fileName = path.split("/").pop() || path;
        lessons.push({
          title: fileName.replace(/\.md$/, "").replace(/[-_]/g, " "),
          content,
          type: "text" });
      }

      onImport({
        title: parsed.repo.replace(/[-_]/g, " "),
        description: description.slice(0, 500),
        lessons });

      // Reset state
      setStep("url");
      setRepoUrl("");
      setFiles([]);
      setSelectedFiles([]);
    } catch (err: any) {
      setError(err.message || "Ошибка при импорте");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleFileSelection = (path: string) => {
    setSelectedFiles((prev) =>
      prev.includes(path)
        ? prev.filter((p) => p !== path)
        : [...prev, path]
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Github className="w-5 h-5" />
            Импорт курса с GitHub
          </DialogTitle>
          <DialogDescription>
            Импортируйте курс из публичного GitHub репозитория. Поддерживаются
            Markdown файлы.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === "url" && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>URL репозитория</Label>
              <Input
                placeholder="owner/repo или https://github.com/owner/repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Ветка</Label>
              <Select value={branch} onValueChange={setBranch}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="main">main</SelectItem>
                  <SelectItem value="master">master</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={onClose} className="flex-1">
                Отмена
              </Button>
              <Button
                onClick={fetchRepoContents}
                disabled={!repoUrl || isLoading}
                className="flex-1 btn-gradient"
              >
                {isLoading ? (
                  <SigmaSpinner size="sm" className="mr-2" />
                ) : (
                  <FolderTree className="w-4 h-4 mr-2" />
                )}
                Загрузить
              </Button>
            </div>
          </div>
        )}

        {step === "select" && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Выберите файлы для импорта как уроки</Label>
              <div className="max-h-[300px] overflow-y-auto border border-border rounded-lg divide-y divide-border">
                {files.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    Markdown файлы не найдены
                  </div>
                ) : (
                  files
                    .filter((f) => f.type === "file" && f.name.endsWith(".md"))
                    .map((file) => (
                      <label
                        key={file.path}
                        className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedFiles.includes(file.path)}
                          onChange={() => toggleFileSelection(file.path)}
                          className="w-4 h-4 accent-primary"
                        />
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{file.name}</span>
                      </label>
                    ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Выбрано: {selectedFiles.length} файлов
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setStep("url")}
                className="flex-1"
              >
                Назад
              </Button>
              <Button
                onClick={handleImport}
                disabled={selectedFiles.length === 0 || isLoading}
                className="flex-1 btn-gradient"
              >
                {isLoading ? (
                  <SigmaSpinner size="sm" className="mr-2" />
                ) : null}
                Импортировать ({selectedFiles.length})
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
