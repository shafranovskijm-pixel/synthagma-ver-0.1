import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  FileText,
  Download,
  Trash2,
  Loader2,
  Upload,
  BookOpen,
  Presentation,
  FileSpreadsheet,
  Eye,
  Search,
  File,
  Folder,
  FolderPlus,
  ChevronRight,
  Home,
  MoreVertical,
  Edit,
  FolderOpen,
  ArrowLeft,
  HardDrive,
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useLibraryManager, type LibraryDocument, type LibraryFolder, MAX_FILE_SIZE } from "@/hooks/useLibraryManager";

const LIBRARY_TYPES = [
  { value: "document", label: "Документ (DOC, PDF, RTF)", icon: FileText, accept: ".doc,.docx,.pdf,.rtf" },
  { value: "presentation", label: "Презентация (PPTX)", icon: Presentation, accept: ".ppt,.pptx" },
  { value: "spreadsheet", label: "Таблица (XLSX)", icon: FileSpreadsheet, accept: ".xls,.xlsx" },
  { value: "other", label: "Прочее", icon: File, accept: "*" },
];

const FOLDER_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316", 
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6"
];

interface LibraryManagerProps {
  organizationId: string;
}

export function LibraryManager({ organizationId }: LibraryManagerProps) {
  const library = useLibraryManager(organizationId);

  // UI state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<LibraryDocument | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Form state
  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState("document");
  const [docDescription, setDocDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(library.currentFolderId);

  // Folder form state
  const [folderName, setFolderName] = useState("");
  const [folderColor, setFolderColor] = useState("#6366f1");
  const [editingFolder, setEditingFolder] = useState<LibraryFolder | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        return;
      }
      setSelectedFile(file);
      if (!docName) {
        setDocName(file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleAdd = async () => {
    if (!docName.trim() || !selectedFile) return;

    setIsUploading(true);
    const success = await library.uploadDocument(
      selectedFile,
      docName,
      docType,
      docDescription,
      selectedFolderId
    );
    
    if (success) {
      setShowAddDialog(false);
      resetForm();
    }
    setIsUploading(false);
  };

  const handleCreateOrUpdateFolder = async () => {
    if (!folderName.trim()) return;

    setIsCreatingFolder(true);
    
    if (editingFolder) {
      await library.updateFolder(editingFolder.id, folderName, folderColor);
    } else {
      await library.createFolder(folderName, folderColor, library.currentFolderId);
    }

    setShowFolderDialog(false);
    setFolderName("");
    setFolderColor("#6366f1");
    setEditingFolder(null);
    setIsCreatingFolder(false);
  };

  const handleDeleteFolder = async (folderId: string) => {
    const stats = library.getFolderStats(folderId);
    
    if (stats.docsInFolder > 0 || stats.subfoldersCount > 0) {
      if (!confirm(`В папке ${stats.docsInFolder} файлов и ${stats.subfoldersCount} подпапок. Удалить всё?`)) {
        return;
      }
    } else if (!confirm("Удалить папку?")) {
      return;
    }

    await library.deleteFolder(folderId);
  };

  const handleDeleteDocument = async (docId: string, fileUrl: string | null) => {
    if (!confirm("Удалить материал из библиотеки?")) return;
    await library.deleteDocument(docId, fileUrl);
  };

  const resetForm = () => {
    setDocName("");
    setDocType("document");
    setDocDescription("");
    setSelectedFile(null);
    setSelectedFolderId(library.currentFolderId);
  };

  const openEditFolder = (folder: LibraryFolder) => {
    setEditingFolder(folder);
    setFolderName(folder.name);
    setFolderColor(folder.color);
    setShowFolderDialog(true);
  };

  const getDocTypeInfo = (type: string) => {
    return LIBRARY_TYPES.find((t) => t.value === type) || LIBRARY_TYPES[3];
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const getPreviewUrl = (fileUrl: string) => {
    const ext = fileUrl.split('.').pop()?.toLowerCase();
    if (ext === 'rtf') {
      return `https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`;
    }
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
  };

  const handlePreview = (doc: LibraryDocument) => {
    if (!doc.file_url) return;
    
    const ext = doc.file_url.split('.').pop()?.toLowerCase();
    
    if (ext === 'pdf') {
      window.open(doc.file_url, '_blank');
      return;
    }
    
    if (['pptx', 'ppt', 'docx', 'doc', 'xlsx', 'xls', 'rtf'].includes(ext || '')) {
      setPreviewDoc(doc);
      setShowPreviewDialog(true);
      return;
    }
    
    window.open(doc.file_url, '_blank');
  };

  const currentTypeConfig = LIBRARY_TYPES.find(t => t.value === docType);
  const usagePercent = library.storageLimit > 0 ? Math.min((library.totalStorageUsed / library.storageLimit) * 100, 100) : 0;
  const isWarning = usagePercent >= 80;
  const isCritical = usagePercent >= 95;

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск материалов..."
              value={library.searchQuery}
              onChange={(e) => library.setSearchQuery(e.target.value)}
              className="pl-10 w-64 rounded-xl"
            />
          </div>
          <Select value={library.typeFilter} onValueChange={library.setTypeFilter}>
            <SelectTrigger className="w-48 rounded-xl">
              <SelectValue placeholder="Все типы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              {LIBRARY_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  <div className="flex items-center gap-2">
                    <type.icon className="w-4 h-4" />
                    {type.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="rounded-xl gap-2"
            onClick={() => {
              setEditingFolder(null);
              setFolderName("");
              setFolderColor("#6366f1");
              setShowFolderDialog(true);
            }}
          >
            <FolderPlus className="w-4 h-4" />
            Новая папка
          </Button>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button className="btn-gradient rounded-xl gap-2">
                <Plus className="w-4 h-4" />
                Добавить материал
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl">
              <DialogHeader>
                <DialogTitle>Добавить учебный материал</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Название *</Label>
                  <Input
                    placeholder="Введите название материала"
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Папка</Label>
                  <Select 
                    value={selectedFolderId || "root"} 
                    onValueChange={(v) => setSelectedFolderId(v === "root" ? null : v)}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Корневая папка" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="root">
                        <div className="flex items-center gap-2">
                          <Home className="w-4 h-4" />
                          Корневая папка
                        </div>
                      </SelectItem>
                      {library.folders.map((folder) => (
                        <SelectItem key={folder.id} value={folder.id}>
                          <div className="flex items-center gap-2">
                            <Folder className="w-4 h-4" style={{ color: folder.color }} />
                            {folder.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Тип материала</Label>
                  <Select value={docType} onValueChange={setDocType}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LIBRARY_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            <type.icon className="w-4 h-4" />
                            {type.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Описание</Label>
                  <Textarea
                    placeholder="Краткое описание материала"
                    value={docDescription}
                    onChange={(e) => setDocDescription(e.target.value)}
                    className="rounded-xl"
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Файл *</Label>
                  <div className="border-2 border-dashed border-border rounded-xl p-4 text-center hover:border-primary/50 transition-colors">
                    <input
                      type="file"
                      id="library-upload"
                      className="hidden"
                      accept={currentTypeConfig?.accept || "*"}
                      onChange={handleFileSelect}
                    />
                    <label htmlFor="library-upload" className="cursor-pointer">
                      {selectedFile ? (
                        <div className="flex items-center justify-center gap-2 text-primary">
                          <FileText className="w-5 h-5" />
                          <span className="font-medium">{selectedFile.name}</span>
                          <span className="text-sm text-muted-foreground">
                            ({formatFileSize(selectedFile.size)})
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Upload className="w-6 h-6 mx-auto text-muted-foreground" />
                          <div className="text-sm text-muted-foreground">
                            Нажмите для выбора файла
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {currentTypeConfig?.accept || "Любой формат"} • Макс. 100 МБ
                          </div>
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                <Button
                  className="w-full btn-gradient rounded-xl"
                  onClick={handleAdd}
                  disabled={isUploading || !docName.trim() || !selectedFile}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Загрузка...
                    </>
                  ) : (
                    "Добавить в библиотеку"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Breadcrumb navigation */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => library.navigateToFolder(null)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
            library.currentFolderId === null 
              ? 'bg-primary/10 text-primary font-medium' 
              : 'hover:bg-secondary text-muted-foreground'
          }`}
        >
          <Home className="w-4 h-4" />
          Библиотека
        </button>
        {library.folderPath.map((folder, index) => (
          <div key={folder.id} className="flex items-center gap-2">
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
            <button
              onClick={() => library.navigateToFolder(folder.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                index === library.folderPath.length - 1
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'hover:bg-secondary text-muted-foreground'
              }`}
            >
              <Folder className="w-4 h-4" style={{ color: folder.color }} />
              {folder.name}
            </button>
          </div>
        ))}
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <div className="text-xl font-bold">
                {library.documents.filter(d => d.type === 'document' || d.type === 'presentation').length}
              </div>
              <div className="text-xs text-muted-foreground">Учебников</div>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <div className="text-xl font-bold">{library.folders.length}</div>
              <div className="text-xs text-muted-foreground">Папок</div>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <div className="text-xl font-bold">
                {library.documents.filter(d => d.type === 'spreadsheet').length}
              </div>
              <div className="text-xs text-muted-foreground">Таблиц</div>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <File className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <div className="text-xl font-bold">{library.documents.length}</div>
              <div className="text-xs text-muted-foreground">Всего файлов</div>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 col-span-2 md:col-span-1">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                isCritical ? 'bg-destructive/10' : isWarning ? 'bg-yellow-500/10' : 'bg-cyan-500/10'
              }`}>
                <HardDrive className={`w-5 h-5 ${
                  isCritical ? 'text-destructive' : isWarning ? 'text-yellow-500' : 'text-cyan-500'
                }`} />
              </div>
              <div className="flex-1">
                <div className="flex items-baseline justify-between">
                  <div className="text-xl font-bold">{formatBytes(library.totalStorageUsed)}</div>
                  <div className="text-xs text-muted-foreground">
                    из {formatBytes(library.storageLimit)}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">Хранилище</div>
              </div>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 rounded-full ${
                  isCritical ? 'bg-destructive' : isWarning ? 'bg-yellow-500' : 'bg-cyan-500'
                }`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {library.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Back button for subfolders */}
          {library.currentFolderId && (
            <Button
              variant="ghost"
              className="gap-2 text-muted-foreground"
              onClick={() => {
                const currentFolder = library.folders.find(f => f.id === library.currentFolderId);
                library.navigateToFolder(currentFolder?.parent_id || null);
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              Назад
            </Button>
          )}

          {/* Folders grid */}
          {library.filteredFolders.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {library.filteredFolders.map((folder) => {
                const stats = library.getFolderStats(folder.id);
                
                return (
                  <div
                    key={folder.id}
                    className="group bg-card rounded-xl border border-border p-4 hover:border-primary/50 transition-all cursor-pointer"
                    onClick={() => library.navigateToFolder(folder.id)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div 
                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: folder.color + '20' }}
                      >
                        <FolderOpen className="w-6 h-6" style={{ color: folder.color }} />
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditFolder(folder); }}>
                            <Edit className="w-4 h-4 mr-2" />
                            Редактировать
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Удалить
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <h3 className="font-medium truncate">{folder.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {stats.docsInFolder} файлов{stats.subfoldersCount > 0 ? `, ${stats.subfoldersCount} папок` : ''}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Documents table */}
          {library.filteredDocuments.length === 0 && library.filteredFolders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground bg-card rounded-2xl border border-border">
              <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">
                {library.currentFolderId ? 'Папка пуста' : 'Библиотека пуста'}
              </p>
              <p className="text-sm mt-1">Добавьте учебные материалы для ваших учеников</p>
            </div>
          ) : library.filteredDocuments.length > 0 && (
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Материал</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Тип</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Размер</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Добавлен</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {library.filteredDocuments.map((doc) => {
                    const typeInfo = getDocTypeInfo(doc.type);
                    const TypeIcon = typeInfo.icon;
                    return (
                      <tr key={doc.id} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <TypeIcon className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <div className="font-medium">{doc.name}</div>
                              {doc.description && (
                                <div className="text-sm text-muted-foreground line-clamp-1">{doc.description}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                            {typeInfo.label.split(" ")[0]}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">
                          {formatFileSize(doc.file_size)}
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">
                          {format(new Date(doc.created_at), "d MMM yyyy", { locale: ru })}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            {doc.file_url && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-lg"
                                  onClick={() => handlePreview(doc)}
                                  title="Просмотр"
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-lg"
                                  onClick={() => {
                                    const link = document.createElement("a");
                                    link.href = doc.file_url!;
                                    link.download = doc.name;
                                    link.click();
                                  }}
                                  title="Скачать"
                                >
                                  <Download className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-lg text-destructive hover:text-destructive"
                              onClick={() => handleDeleteDocument(doc.id, doc.file_url)}
                              title="Удалить"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-5xl h-[85vh] rounded-2xl p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b border-border">
            <DialogTitle className="font-display flex items-center gap-2">
              <Presentation className="w-5 h-5 text-primary" />
              {previewDoc?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 h-full min-h-0">
            {previewDoc?.file_url && (
              <iframe
                src={getPreviewUrl(previewDoc.file_url)}
                className="w-full h-[calc(85vh-80px)] border-0"
                title={previewDoc.name}
                allowFullScreen
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Folder Dialog */}
      <Dialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingFolder ? 'Редактировать папку' : 'Создать папку'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Название папки</Label>
              <Input
                placeholder="Введите название"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Цвет папки</Label>
              <div className="flex gap-2 flex-wrap">
                {FOLDER_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-8 h-8 rounded-lg transition-all ${
                      folderColor === color ? 'ring-2 ring-offset-2 ring-primary scale-110' : ''
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setFolderColor(color)}
                  />
                ))}
              </div>
            </div>
            <Button
              className="w-full btn-gradient rounded-xl"
              onClick={handleCreateOrUpdateFolder}
              disabled={isCreatingFolder || !folderName.trim()}
            >
              {isCreatingFolder ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Сохранение...
                </>
              ) : editingFolder ? (
                'Сохранить изменения'
              ) : (
                'Создать папку'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
