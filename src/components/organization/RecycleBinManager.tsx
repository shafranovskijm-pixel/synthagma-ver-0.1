import { useState } from "react";
import { useRecycleBin, type RecycleBinItem } from "@/hooks/useRecycleBin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Trash2, RotateCcw, Search, AlertTriangle, Clock, ChevronDown } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { LoadMoreControls } from "@/components/ui/LoadMoreControls";

interface Props {
  organizationId: string;
}

export function RecycleBinManager({ organizationId }: Props) {
  const { items, total, loading, search, setSearch, hasMore, restore, restoreMany, purgeOne, loadMore } = useRecycleBin(organizationId);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const key = (it: RecycleBinItem) => `${it.source_table}:${it.id}`;
  const filtered = items;

  const toggle = (it: RecycleBinItem) => {
    setSelected(prev => {
      const next = new Set(prev);
      const k = key(it);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };

  const allChecked = filtered.length > 0 && filtered.every(it => selected.has(key(it)));
  const toggleAll = () => {
    setSelected(prev => {
      if (allChecked) return new Set();
      const next = new Set(prev);
      filtered.forEach(it => next.add(key(it)));
      return next;
    });
  };

  const selectedItems = filtered.filter(it => selected.has(key(it)));

  const daysLeft = (deletedAt: string) => {
    const ms = new Date(deletedAt).getTime() + 30 * 24 * 60 * 60 * 1000 - Date.now();
    return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trash2 className="w-4 h-4 text-muted-foreground" />
            Корзина документов
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Удалённые документы хранятся 30 дней, затем удаляются окончательно. Восстановление возвращает документ в исходный раздел.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Поиск по названию или типу..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {selectedItems.length > 0 && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { restoreMany(selectedItems); setSelected(new Set()); }}>
                <RotateCcw className="w-3.5 h-3.5" />
                Восстановить ({selectedItems.length})
              </Button>
            )}
          </div>

          {filtered.length === 0 ? (
            items.length === 0 ? (
              <div className="text-center py-16 px-6 space-y-3">
                <div className="mx-auto w-20 h-20 rounded-full bg-muted/40 flex items-center justify-center">
                  <Trash2 className="w-10 h-10 text-muted-foreground/30" />
                </div>
                <div>
                  <p className="text-base font-semibold">Корзина пуста</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                    Удалённые документы появляются здесь и хранятся 30 дней. После этого срока они удаляются окончательно.
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-sm text-muted-foreground">
                Ничего не найдено по запросу
              </div>
            )
          ) : (
            <>
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground border-b">
                <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
                <span>Выбрать все ({filtered.length})</span>
              </div>
              <div className="space-y-1.5">
                {filtered.map(it => {
                  const k = key(it);
                  const left = daysLeft(it.deleted_at);
                  const isUrgent = left <= 7;
                  return (
                    <div key={k} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/30 transition-colors">
                      <Checkbox checked={selected.has(k)} onCheckedChange={() => toggle(it)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{it.display_name}</p>
                          <Badge variant="outline" className="text-xs shrink-0">{it.type_label}</Badge>
                          {isUrgent && (
                            <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30 gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Удалится через {left} дн.
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          Удалено {formatDistanceToNow(new Date(it.deleted_at), { addSuffix: true, locale: ru })}
                          {" · "}
                          {format(new Date(it.deleted_at), "d MMM yyyy HH:mm", { locale: ru })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="sm" variant="ghost" className="gap-1 text-accent hover:text-accent hover:bg-accent/10"
                          onClick={() => restore(it)}>
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Восстановить</span>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Удалить окончательно?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Документ <strong>«{it.display_name}»</strong> будет удалён без возможности восстановления. Это действие необратимо.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Отмена</AlertDialogCancel>
                              <AlertDialogAction onClick={() => purgeOne(it)} className="bg-destructive hover:bg-destructive/90">
                                Удалить навсегда
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  );
                })}
              </div>
              {hasMore && (
                <LoadMoreControls
                  visibleCount={items.length}
                  totalCount={total}
                  onLoadMore={() => loadMore()}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
