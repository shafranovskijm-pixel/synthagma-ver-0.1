import { useState, useRef } from "react";
import { 
  Upload, Download, Package, Check, X, Clock, 
  FileJson, AlertTriangle, Play, Trash2, Eye,
  RefreshCw, Code, Database, Settings as SettingsIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface PatchData {
  files?: {
    path: string;
    content: string;
    action: 'create' | 'update' | 'delete';
  }[];
  migrations?: string[];
  config?: Record<string, unknown>;
  metadata?: {
    createdAt: string;
    sourceProject?: string;
    author?: string;
  };
}

interface SystemPatch {
  id: string;
  version: string;
  name: string;
  description: string | null;
  patch_type: string;
  patch_data: PatchData;
  migrations: string[] | null;
  applied_at: string | null;
  applied_by: string | null;
  created_at: string;
  is_applied: boolean;
  source_project_url: string | null;
}

export function PatchUpdatesManager() {
  const [isUploading, setIsUploading] = useState(false);
  const [selectedPatch, setSelectedPatch] = useState<SystemPatch | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [patchToDelete, setPatchToDelete] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: patches = [], isLoading } = useQuery({
    queryKey: ['system-patches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_patches')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as SystemPatch[];
    }
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      toast.error('Поддерживаются только JSON файлы');
      return;
    }

    setIsUploading(true);
    try {
      const content = await file.text();
      const patchData = JSON.parse(content);

      // Validate patch structure
      if (!patchData.version || !patchData.name) {
        throw new Error('Некорректный формат патча. Требуются поля: version, name');
      }

      // Check if version already exists
      const { data: existing } = await supabase
        .from('system_patches')
        .select('id')
        .eq('version', patchData.version)
        .maybeSingle();

      if (existing) {
        toast.error(`Патч версии ${patchData.version} уже существует`);
        return;
      }

      const { error } = await supabase
        .from('system_patches')
        .insert({
          version: patchData.version,
          name: patchData.name,
          description: patchData.description || null,
          patch_type: patchData.patch_type || 'full',
          patch_data: patchData.data || {},
          migrations: patchData.migrations || null,
          source_project_url: patchData.source_project_url || null,
        });

      if (error) throw error;

      toast.success('Патч успешно загружен');
      queryClient.invalidateQueries({ queryKey: ['system-patches'] });
    } catch (error) {
      console.error('Error uploading patch:', error);
      toast.error(error instanceof Error ? error.message : 'Ошибка загрузки патча');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleApplyPatch = async (patch: SystemPatch) => {
    setIsApplying(true);
    try {
      // Here you would implement the actual patch application logic
      // For now, we'll just mark it as applied
      
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('system_patches')
        .update({
          is_applied: true,
          applied_at: new Date().toISOString(),
          applied_by: user?.id || null,
        })
        .eq('id', patch.id);

      if (error) throw error;

      toast.success(`Патч ${patch.version} успешно применён`);
      queryClient.invalidateQueries({ queryKey: ['system-patches'] });
      setShowPreview(false);
    } catch (error) {
      console.error('Error applying patch:', error);
      toast.error('Ошибка применения патча');
    } finally {
      setIsApplying(false);
    }
  };

  const handleDeletePatch = async () => {
    if (!patchToDelete) return;

    try {
      const { error } = await supabase
        .from('system_patches')
        .delete()
        .eq('id', patchToDelete);

      if (error) throw error;

      toast.success('Патч удалён');
      queryClient.invalidateQueries({ queryKey: ['system-patches'] });
    } catch (error) {
      console.error('Error deleting patch:', error);
      toast.error('Ошибка удаления патча');
    } finally {
      setShowDeleteConfirm(false);
      setPatchToDelete(null);
    }
  };

  const exportPatchTemplate = async () => {
    try {
      const response = await fetch('/templates/sintagma-patch-v2-full.json');
      if (!response.ok) {
        throw new Error('Не удалось загрузить шаблон');
      }
      const template = await response.json();
      
      const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sintagma-patch-v2-template.json';
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success('Расширенный шаблон патча v2 скачан');
    } catch (error) {
      console.error('Error downloading template:', error);
      toast.error('Ошибка загрузки шаблона');
    }
  };

  const getStatusBadge = (patch: SystemPatch) => {
    if (patch.is_applied) {
      return <Badge variant="default" className="bg-green-500/20 text-green-600 border-green-500/30"><Check className="w-3 h-3 mr-1" /> Применён</Badge>;
    }
    return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30"><Clock className="w-3 h-3 mr-1" /> Ожидает</Badge>;
  };

  const getPatchTypeIcon = (type: string) => {
    switch (type) {
      case 'code': return <Code className="w-4 h-4" />;
      case 'database': return <Database className="w-4 h-4" />;
      case 'config': return <SettingsIcon className="w-4 h-4" />;
      default: return <Package className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Package className="w-5 h-5" />
            Управление обновлениями
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Загружайте и применяйте патчи из других проектов
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportPatchTemplate} className="gap-2">
            <Download className="w-4 h-4" />
            Скачать шаблон
          </Button>
          <Button 
            onClick={() => fileInputRef.current?.click()} 
            className="gap-2"
            disabled={isUploading}
          >
            {isUploading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Загрузить патч
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Info Card */}
      <Card className="bg-blue-500/10 border-blue-500/20">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-600 dark:text-blue-400">Как использовать систему обновлений</p>
              <ol className="mt-2 space-y-1 text-muted-foreground list-decimal list-inside">
                <li>Создайте ремикс проекта для разработки</li>
                <li>Внесите изменения в ремикс-проект</li>
                <li>Экспортируйте изменения в JSON-патч</li>
                <li>Загрузите патч в основной проект</li>
                <li>Просмотрите и примените обновления</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Patches List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileJson className="w-4 h-4" />
            Загруженные патчи
            {patches.length > 0 && (
              <Badge variant="secondary" className="ml-2">{patches.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : patches.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Нет загруженных патчей</p>
              <p className="text-sm mt-1">Загрузите JSON-патч для начала работы</p>
            </div>
          ) : (
            <div className="space-y-3">
              {patches.map((patch) => (
                <div
                  key={patch.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      {getPatchTypeIcon(patch.patch_type)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{patch.name}</span>
                        <Badge variant="outline" className="text-xs">{patch.version}</Badge>
                        {getStatusBadge(patch)}
                      </div>
                      {patch.description && (
                        <p className="text-sm text-muted-foreground mt-0.5">{patch.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Загружен: {new Date(patch.created_at).toLocaleDateString('ru-RU')}
                        {patch.applied_at && ` • Применён: ${new Date(patch.applied_at).toLocaleDateString('ru-RU')}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedPatch(patch);
                        setShowPreview(true);
                      }}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    {!patch.is_applied && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                        onClick={() => {
                          setPatchToDelete(patch.id);
                          setShowDeleteConfirm(true);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              {selectedPatch?.name}
              <Badge variant="outline">{selectedPatch?.version}</Badge>
            </DialogTitle>
            <DialogDescription>
              {selectedPatch?.description || 'Без описания'}
            </DialogDescription>
          </DialogHeader>

          {selectedPatch && (
            <Tabs defaultValue="files" className="mt-4">
              <TabsList>
                <TabsTrigger value="files" className="gap-2">
                  <Code className="w-4 h-4" />
                  Файлы
                </TabsTrigger>
                <TabsTrigger value="migrations" className="gap-2">
                  <Database className="w-4 h-4" />
                  Миграции
                </TabsTrigger>
                <TabsTrigger value="config" className="gap-2">
                  <SettingsIcon className="w-4 h-4" />
                  Конфиг
                </TabsTrigger>
              </TabsList>

              <TabsContent value="files">
                <ScrollArea className="h-[400px] border rounded-lg p-4">
                  {selectedPatch.patch_data.files?.length ? (
                    <div className="space-y-3">
                      {selectedPatch.patch_data.files.map((file, index) => (
                        <div key={index} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <code className="text-sm font-mono">{file.path}</code>
                            <Badge variant={
                              file.action === 'create' ? 'default' :
                              file.action === 'delete' ? 'destructive' : 'secondary'
                            }>
                              {file.action === 'create' ? 'Создать' :
                               file.action === 'delete' ? 'Удалить' : 'Обновить'}
                            </Badge>
                          </div>
                          {file.content && (
                            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-32">
                              {file.content.slice(0, 500)}
                              {file.content.length > 500 && '...'}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">Нет файлов в патче</p>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="migrations">
                <ScrollArea className="h-[400px] border rounded-lg p-4">
                  {selectedPatch.migrations?.length ? (
                    <div className="space-y-3">
                      {selectedPatch.migrations.map((sql, index) => (
                        <pre key={index} className="text-xs bg-muted p-3 rounded overflow-x-auto">
                          {sql}
                        </pre>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">Нет SQL миграций</p>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="config">
                <ScrollArea className="h-[400px] border rounded-lg p-4">
                  <pre className="text-xs overflow-x-auto">
                    {JSON.stringify(selectedPatch.patch_data.config || {}, null, 2)}
                  </pre>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Закрыть
            </Button>
            {selectedPatch && !selectedPatch.is_applied && (
              <Button 
                onClick={() => handleApplyPatch(selectedPatch)}
                disabled={isApplying}
                className="gap-2"
              >
                {isApplying ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Применить патч
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить патч?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Патч будет удалён из системы.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePatch} className="bg-red-500 hover:bg-red-600">
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
