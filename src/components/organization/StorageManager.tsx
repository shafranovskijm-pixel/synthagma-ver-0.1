import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Search, Trash2, Upload, Video, FileText, Image as ImageIcon, Music, HardDrive, FolderOpen, RefreshCw, File, ChevronDown, ChevronRight, Presentation, Stamp, Receipt, Building2, BookOpen, UserCheck, ExternalLink, Download, Eye, Shield } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useStorageManager, BUCKET_LABELS, TYPE_LABELS, formatSize, formatDate, getPreviewType, type StorageFile } from "@/hooks/useStorageManager";

interface StorageManagerProps { organizationId: string; }

const BUCKET_ICONS: Record<string, React.ReactNode> = {
  "presentations": <Presentation className="w-4 h-4" />, "course-files": <BookOpen className="w-4 h-4" />,
  "course-videos": <Video className="w-4 h-4" />, "org-documents": <FileText className="w-4 h-4" />,
  "company-documents": <Building2 className="w-4 h-4" />, "org-branding": <Stamp className="w-4 h-4" />,
  "library-files": <HardDrive className="w-4 h-4" />, "billing-documents": <Receipt className="w-4 h-4" />,
  "student-documents": <UserCheck className="w-4 h-4" />,
};

function getTypeIcon(type: StorageFile["type"]) {
  switch (type) {
    case "video": return <Video className="w-5 h-5 text-destructive" />;
    case "image": return <ImageIcon className="w-5 h-5 text-primary" />;
    case "audio": return <Music className="w-5 h-5 text-accent-foreground" />;
    case "presentation": return <Presentation className="w-5 h-5 text-primary" />;
    case "document": return <FileText className="w-5 h-5 text-primary" />;
    default: return <File className="w-5 h-5 text-muted-foreground" />;
  }
}

export function StorageManager({ organizationId }: StorageManagerProps) {
  const h = useStorageManager(organizationId);
  const previewType = h.previewFile ? getPreviewType(h.previewFile.name) : "none";

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-card rounded-xl border border-border p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><HardDrive className="w-5 h-5 text-primary" /></div><div><div className="text-xl font-bold">{formatSize(h.totalSize)}</div><div className="text-xs text-muted-foreground">Всего</div></div></div></div>
        {(["video", "image", "presentation", "audio", "document"] as const).map(type => (
          <div key={type} className="bg-card rounded-xl border border-border p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">{getTypeIcon(type)}</div><div><div className="text-xl font-bold">{h.typeCounts[type] || 0}</div><div className="text-xs text-muted-foreground">{TYPE_LABELS[type]}</div></div></div></div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Поиск файлов..." value={h.search} onChange={e => h.setSearch(e.target.value)} className="pl-10 w-64 rounded-xl" /></div>
          <Select value={h.bucketFilter} onValueChange={h.setBucketFilter}><SelectTrigger className="w-52 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(BUCKET_LABELS).map(([v, label]) => (<SelectItem key={v} value={v}><span className="flex items-center gap-2">{v !== "all" && BUCKET_ICONS[v]}{label}{v !== "all" && h.bucketCounts[v] ? ` (${h.bucketCounts[v]})` : ""}</span></SelectItem>))}</SelectContent></Select>
          <Select value={h.typeFilter} onValueChange={h.setTypeFilter}><SelectTrigger className="w-44 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TYPE_LABELS).map(([v, label]) => (<SelectItem key={v} value={v}>{label}</SelectItem>))}</SelectContent></Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-xl gap-2" onClick={h.loadFiles} disabled={h.loading}><RefreshCw className={`w-4 h-4 ${h.loading ? "animate-spin" : ""}`} />Обновить</Button>
          <Button className="btn-gradient rounded-xl gap-2" disabled={h.uploading} asChild><label><input type="file" className="hidden" onChange={h.handleUpload} />{h.uploading ? <SigmaSpinner size="sm" /> : <Upload className="w-4 h-4" />}Загрузить файл</label></Button>
        </div>
      </div>

      {/* File list */}
      {h.loading ? (
        <div className="flex items-center justify-center py-16"><SigmaSpinner /><span className="ml-2 text-muted-foreground">Загрузка файлов...</span></div>
      ) : h.filtered.length === 0 ? (
        h.files.length === 0 ? (
          <Card className="overflow-hidden border-0 shadow-lg">
            <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-8"><div className="flex items-center gap-3 mb-2"><div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center"><HardDrive className="w-6 h-6 text-primary" /></div><div><h2 className="text-2xl font-bold">Ваше облачное хранилище готово к работе</h2><p className="text-muted-foreground">Все файлы организации — в одном месте</p></div></div></div>
            <CardContent className="p-8 pt-6">
              <div className="grid sm:grid-cols-2 gap-4 mb-8">
                {[
                  { icon: FolderOpen, title: "Все файлы из курсов", desc: "Автоматический сбор видео, изображений и документов из всех курсов в единый каталог" },
                  { icon: Eye, title: "Инлайн-предпросмотр", desc: "Смотрите видео, PDF, изображения и аудио прямо в браузере без скачивания" },
                  { icon: Search, title: "Умная группировка", desc: "Файлы сгруппированы по разделам с поиском и фильтрацией по типу" },
                  { icon: Shield, title: "Безопасный доступ", desc: "Приватные документы студентов доступны через подписанные URL с ограниченным сроком" },
                  { icon: Upload, title: "Загрузка в один клик", desc: "Загружайте файлы через интерфейс хранилища или напрямую из конструктора курсов" },
                  { icon: HardDrive, title: "Внешнее хранилище", desc: "Подключите внешнее S3-совместимое хранилище для масштабирования объёмов" },
                ].map((feature, i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"><div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><feature.icon className="w-4 h-4 text-primary" /></div><div><p className="font-medium text-sm">{feature.title}</p><p className="text-xs text-muted-foreground mt-0.5">{feature.desc}</p></div></div>
                ))}
              </div>
              <Button size="lg" className="w-full sm:w-auto" asChild><label><input type="file" className="hidden" onChange={h.handleUpload} /><Upload className="w-4 h-4 mr-2" />Загрузить первый файл</label></Button>
            </CardContent>
          </Card>
        ) : (
          <div className="text-center py-16 text-muted-foreground"><Search className="w-12 h-12 mx-auto mb-3 opacity-40" /><p className="font-medium">Нет файлов по фильтру</p><p className="text-sm mt-1">Попробуйте изменить параметры поиска</p></div>
        )
      ) : (
        <ScrollArea className="h-[calc(100vh-460px)] min-h-[300px]">
          <div className="space-y-2">
            {h.groupedByBucket.map(([bucket, bucketFiles]) => (
              <div key={bucket} className="border border-border rounded-xl overflow-hidden">
                <button onClick={() => h.toggleBucket(bucket)} className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left">
                  {h.expandedBuckets[bucket] ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <span className="shrink-0">{BUCKET_ICONS[bucket] || <FolderOpen className="w-4 h-4" />}</span>
                  <span className="font-medium text-sm">{BUCKET_LABELS[bucket] || bucket}</span>
                  <Badge variant="secondary" className="ml-auto text-xs">{bucketFiles.length}</Badge>
                </button>
                {h.expandedBuckets[bucket] && (
                  <div className="divide-y divide-border">
                    {bucketFiles.map((file, i) => (
                      <div key={`${file.bucket}-${file.folder}-${file.name}-${i}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group">
                        <div className="shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                          {file.type === "image" && !file.isPrivate ? <img src={file.url} alt={file.name} className="w-full h-full object-cover" loading="lazy" /> : getTypeIcon(file.type)}
                        </div>
                        <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{file.name}</p><div className="flex items-center gap-2 text-xs text-muted-foreground"><span>{formatSize(file.size)}</span>{file.created_at && <span>{formatDate(file.created_at)}</span>}</div></div>
                        <div className="shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Предпросмотр" onClick={() => h.openPreview(file)}><Eye className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Открыть в новой вкладке" onClick={() => h.openInNewTab(file)}><ExternalLink className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => h.setDeleteFile(file)}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* File Preview Dialog */}
      <Dialog open={!!h.previewFile} onOpenChange={open => { if (!open) { h.setPreviewFile(null); h.setPreviewUrl(null); } }}>
        <DialogContent className={`${previewType === "pdf" || previewType === "image" ? "max-w-4xl" : "max-w-lg"}`}>
          <DialogHeader><DialogTitle className="truncate pr-8">{h.previewFile?.name}</DialogTitle><DialogDescription>{h.previewFile && `${formatSize(h.previewFile.size)} • ${BUCKET_LABELS[h.previewFile.bucket] || h.previewFile.bucket}`}</DialogDescription></DialogHeader>
          <div className="min-h-[200px] flex items-center justify-center">
            {h.previewLoading ? <SigmaSpinner size="lg" />
              : h.previewUrl && previewType === "image" ? <img src={h.previewUrl} alt={h.previewFile?.name} className="max-w-full max-h-[60vh] rounded-lg object-contain" />
              : h.previewUrl && previewType === "pdf" ? <iframe src={h.previewUrl} className="w-full h-[60vh] rounded-lg border border-border" title={h.previewFile?.name} />
              : h.previewUrl && previewType === "video" ? <video src={h.previewUrl} controls className="max-w-full max-h-[60vh] rounded-lg" />
              : h.previewUrl && previewType === "audio" ? <div className="w-full flex flex-col items-center gap-4 py-8"><Music className="w-16 h-16 text-muted-foreground" /><audio src={h.previewUrl} controls className="w-full max-w-md" /></div>
              : <div className="text-center py-8 text-muted-foreground"><File className="w-16 h-16 mx-auto mb-3 opacity-40" /><p className="font-medium">Предпросмотр недоступен</p><p className="text-sm mt-1">Скачайте файл для просмотра</p></div>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" className="gap-2 rounded-xl" onClick={() => h.previewFile && h.openInNewTab(h.previewFile)}><ExternalLink className="w-4 h-4" />Открыть в новой вкладке</Button>
            <Button className="gap-2 rounded-xl" onClick={() => h.previewFile && h.downloadFile(h.previewFile)}><Download className="w-4 h-4" />Скачать</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!h.deleteFile} onOpenChange={() => h.setDeleteFile(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить файл?</AlertDialogTitle><AlertDialogDescription>Файл «{h.deleteFile?.name}» будет удалён из хранилища. Это действие нельзя отменить.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={h.handleDelete} disabled={h.deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{h.deleting ? <SigmaSpinner size="sm" className="mr-2" /> : null}Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
