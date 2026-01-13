import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
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
  Search,
  File,
  Folder,
  FolderPlus,
  ChevronRight,
  Home,
  MoreVertical,
  Edit,
  CalendarIcon,
  Tag,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useProgramsManager, type ProgramDocument, type ProgramFolder, type ProgramCategory, MAX_FILE_SIZE } from "@/hooks/useProgramsManager";
import { cn } from "@/lib/utils";

const FOLDER_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6"
];

interface ProgramsManagerProps {
  organizationId: string;
}

export function ProgramsManager({ organizationId }: ProgramsManagerProps) {
  const programs = useProgramsManager(organizationId);

  // UI state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  // Form state
  const [docName, setDocName] = useState("");
  const [docDescription, setDocDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(programs.currentFolderId);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Folder form state
  const [folderName, setFolderName] = useState("");
  const [folderColor, setFolderColor] = useState("#6366f1");
  const [folderCategoryId, setFolderCategoryId] = useState<string | null>(null);
  const [editingFolder, setEditingFolder] = useState<ProgramFolder | null>(null);

  // Category form state
  const [categoryName, setCategoryName] = useState("");
  const [categoryColor, setCategoryColor] = useState("#6366f1");

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
    const success = await programs.uploadDocument(
      selectedFile,
      docName,
      docDescription,
      selectedFolderId,
      selectedCategoryId
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
      await programs.updateFolder(editingFolder.id, folderName, folderColor, folderCategoryId);
    } else {
      await programs.createFolder(folderName, folderColor, programs.currentFolderId, folderCategoryId);
    }

    setShowFolderDialog(false);
    setFolderName("");
    setFolderColor("#6366f1");
    setFolderCategoryId(null);
    setEditingFolder(null);
    setIsCreatingFolder(false);
  };

  const handleCreateCategory = async () => {
    if (!categoryName.trim()) return;

    setIsCreatingCategory(true);
    await programs.createCategory(categoryName, categoryColor);
    setShowCategoryDialog(false);
    setCategoryName("");
    setCategoryColor("#6366f1");
    setIsCreatingCategory(false);
  };

  const handleDeleteFolder = async (folderId: string) => {
    const stats = programs.getFolderStats(folderId);
    
    if (stats.docsInFolder > 0 || stats.subfoldersCount > 0) {
      if (!confirm(`В папке ${stats.docsInFolder} файлов и ${stats.subfoldersCount} подпапок. Удалить всё?`)) {
        return;
      }
    } else if (!confirm("Удалить папку?")) {
      return;
    }

    await programs.deleteFolder(folderId);
  };

  const handleDeleteDocument = async (docId: string, fileUrl: string | null) => {
    if (!confirm("Удалить файл?")) return;
    await programs.deleteDocument(docId, fileUrl);
  };

  const resetForm = () => {
    setDocName("");
    setDocDescription("");
    setSelectedFile(null);
    setSelectedFolderId(programs.currentFolderId);
    setSelectedCategoryId(null);
  };

  const openEditFolder = (folder: ProgramFolder) => {
    setEditingFolder(folder);
    setFolderName(folder.name);
    setFolderColor(folder.color);
    setFolderCategoryId(folder.category_id);
    setShowFolderDialog(true);
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getCategoryById = (id: string | null) => {
    return programs.categories.find(c => c.id === id);
  };

  const clearFilters = () => {
    programs.setSearchQuery("");
    programs.setCategoryFilter("all");
    programs.setDateFromFilter(undefined);
    programs.setDateToFilter(undefined);
  };

  const hasActiveFilters = programs.searchQuery || programs.categoryFilter !== "all" || programs.dateFromFilter || programs.dateToFilter;

  if (programs.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Поиск..."
                value={programs.searchQuery}
                onChange={(e) => programs.setSearchQuery(e.target.value)}
                className="pl-10 w-48 rounded-xl"
              />
            </div>
            
            {/* Category filter */}
            <Select value={programs.categoryFilter} onValueChange={programs.setCategoryFilter}>
              <SelectTrigger className="w-44 rounded-xl">
                <SelectValue placeholder="Все категории" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все категории</SelectItem>
                {programs.categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                      {cat.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Date from filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-36 justify-start text-left font-normal rounded-xl",
                    !programs.dateFromFilter && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {programs.dateFromFilter ? format(programs.dateFromFilter, "dd.MM.yyyy") : "От даты"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={programs.dateFromFilter}
                  onSelect={programs.setDateFromFilter}
                  locale={ru}
                />
              </PopoverContent>
            </Popover>

            {/* Date to filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-36 justify-start text-left font-normal rounded-xl",
                    !programs.dateToFilter && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {programs.dateToFilter ? format(programs.dateToFilter, "dd.MM.yyyy") : "До даты"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={programs.dateToFilter}
                  onSelect={programs.setDateToFilter}
                  locale={ru}
                />
              </PopoverContent>
            </Popover>

            {/* Clear filters */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="rounded-xl">
                <X className="w-4 h-4 mr-1" />
                Сбросить
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="rounded-xl gap-2"
              onClick={() => setShowCategoryDialog(true)}
            >
              <Tag className="w-4 h-4" />
              <span className="hidden sm:inline">Категория</span>
            </Button>
            <Button
              variant="outline"
              className="rounded-xl gap-2"
              onClick={() => {
                setEditingFolder(null);
                setFolderName("");
                setFolderColor("#6366f1");
                setFolderCategoryId(null);
                setShowFolderDialog(true);
              }}
            >
              <FolderPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Папка</span>
            </Button>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button className="btn-gradient rounded-xl gap-2">
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Добавить файл</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-2xl">
                <DialogHeader>
                  <DialogTitle>Добавить программу</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Название *</Label>
                    <Input
                      placeholder="Введите название"
                      value={docName}
                      onChange={(e) => setDocName(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
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
                          {programs.folders.map((folder) => (
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
                      <Label>Категория</Label>
                      <Select 
                        value={selectedCategoryId || "none"} 
                        onValueChange={(v) => setSelectedCategoryId(v === "none" ? null : v)}
                      >
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="Без категории" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Без категории</SelectItem>
                          {programs.categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                                {cat.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Описание</Label>
                    <Textarea
                      placeholder="Описание программы"
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
                        id="program-upload"
                        className="hidden"
                        accept=".doc,.docx,.pdf,.rtf,.xls,.xlsx,.ppt,.pptx"
                        onChange={handleFileSelect}
                      />
                      <label htmlFor="program-upload" className="cursor-pointer">
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
                              DOC, PDF, RTF, XLS, PPT • Макс. 100 МБ
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
                      "Добавить"
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Breadcrumb navigation */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => programs.navigateToFolder(null)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
            programs.currentFolderId === null 
              ? 'bg-primary/10 text-primary font-medium' 
              : 'hover:bg-secondary text-muted-foreground'
          }`}
        >
          <Home className="w-4 h-4" />
          Программы
        </button>
        {programs.folderPath.map((folder, index) => (
          <div key={folder.id} className="flex items-center gap-2">
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
            <button
              onClick={() => programs.navigateToFolder(folder.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                index === programs.folderPath.length - 1
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Folder className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <div className="text-xl font-bold">{programs.folders.length}</div>
              <div className="text-xs text-muted-foreground">Папок</div>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <div className="text-xl font-bold">{programs.documents.length}</div>
              <div className="text-xs text-muted-foreground">Файлов</div>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Tag className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <div className="text-xl font-bold">{programs.categories.length}</div>
              <div className="text-xs text-muted-foreground">Категорий</div>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <File className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <div className="text-xl font-bold">
                {formatFileSize(programs.documents.reduce((sum, d) => sum + (d.file_size || 0), 0))}
              </div>
              <div className="text-xs text-muted-foreground">Размер</div>
            </div>
          </div>
        </div>
      </div>

      {/* Folders */}
      {programs.filteredFolders.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {programs.filteredFolders.map((folder) => {
            const stats = programs.getFolderStats(folder.id);
            const category = getCategoryById(folder.category_id);
            return (
              <div
                key={folder.id}
                className="group relative bg-card rounded-xl border border-border p-4 hover:border-primary/30 transition-all cursor-pointer"
                onClick={() => programs.navigateToFolder(folder.id)}
              >
                <div className="flex flex-col items-center text-center">
                  <Folder className="w-12 h-12 mb-2" style={{ color: folder.color }} />
                  <span className="font-medium text-sm line-clamp-2">{folder.name}</span>
                  <span className="text-xs text-muted-foreground mt-1">
                    {stats.docsInFolder} файлов
                  </span>
                  {category && (
                    <span 
                      className="text-xs mt-1 px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${category.color}20`, color: category.color }}
                    >
                      {category.name}
                    </span>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 h-7 w-7"
                      onClick={(e) => e.stopPropagation()}
                    >
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
            );
          })
        }
        </div>
      )}

      {/* Documents */}
      {programs.filteredDocuments.length > 0 ? (
        <div className="grid gap-3">
          {programs.filteredDocuments.map((doc) => {
            const category = getCategoryById(doc.category_id);
            return (
              <div
                key={doc.id}
                className="group flex items-center gap-4 bg-card rounded-xl border border-border p-4 hover:border-primary/30 transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{doc.name}</span>
                    {category && (
                      <span 
                        className="text-xs px-2 py-0.5 rounded-full shrink-0"
                        style={{ backgroundColor: `${category.color}20`, color: category.color }}
                      >
                        {category.name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span>{formatFileSize(doc.file_size)}</span>
                    <span>{format(new Date(doc.created_at), "dd.MM.yyyy", { locale: ru })}</span>
                    {doc.description && <span className="truncate">{doc.description}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {doc.file_url && (
                    <Button variant="ghost" size="icon" asChild>
                      <a href={doc.file_url} download>
                        <Download className="w-4 h-4" />
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDeleteDocument(doc.id, doc.file_url)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        programs.filteredFolders.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Folder className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Нет файлов в этой папке</p>
            <p className="text-sm mt-1">Добавьте файлы или создайте папку</p>
          </div>
        )
      )}

      {/* Folder Dialog */}
      <Dialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingFolder ? "Редактировать папку" : "Новая папка"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Название</Label>
              <Input
                placeholder="Название папки"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Категория</Label>
              <Select 
                value={folderCategoryId || "none"} 
                onValueChange={(v) => setFolderCategoryId(v === "none" ? null : v)}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Без категории" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без категории</SelectItem>
                  {programs.categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Цвет</Label>
              <div className="flex gap-2 flex-wrap">
                {FOLDER_COLORS.map((color) => (
                  <button
                    key={color}
                    className={`w-8 h-8 rounded-full transition-transform ${
                      folderColor === color ? 'ring-2 ring-offset-2 ring-primary scale-110' : ''
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setFolderColor(color)}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleCreateOrUpdateFolder}
              disabled={isCreatingFolder || !folderName.trim()}
              className="btn-gradient rounded-xl"
            >
              {isCreatingFolder ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : editingFolder ? (
                "Сохранить"
              ) : (
                "Создать"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Управление категориями</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Existing categories */}
            {programs.categories.length > 0 && (
              <div className="space-y-2">
                <Label>Существующие категории</Label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {programs.categories.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/50">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: cat.color }} />
                        <span>{cat.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm("Удалить категорию?")) {
                            programs.deleteCategory(cat.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="border-t pt-4 space-y-4">
              <Label>Новая категория</Label>
              <Input
                placeholder="Название категории"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                className="rounded-xl"
              />
              <div className="space-y-2">
                <Label>Цвет</Label>
                <div className="flex gap-2 flex-wrap">
                  {FOLDER_COLORS.map((color) => (
                    <button
                      key={color}
                      className={`w-8 h-8 rounded-full transition-transform ${
                        categoryColor === color ? 'ring-2 ring-offset-2 ring-primary scale-110' : ''
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setCategoryColor(color)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleCreateCategory}
              disabled={isCreatingCategory || !categoryName.trim()}
              className="btn-gradient rounded-xl"
            >
              {isCreatingCategory ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Добавить категорию"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
