import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Search, Filter, Tag, FolderPlus, LayoutGrid, List, Folder } from "lucide-react";
import type { CourseCategory, CourseFilter, CourseViewMode } from "@/types";

interface CoursesToolbarProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filter: CourseFilter;
  setFilter: (f: CourseFilter) => void;
  categoryFilter: string;
  setCategoryFilter: (c: string) => void;
  categories: CourseCategory[];
  viewMode: CourseViewMode;
  folderViewMode: "folders" | "flat";
  setViewAndFolder: (vm: CourseViewMode, fm: "folders" | "flat") => void;
  onNewCategory: () => void;
}

export const CoursesToolbar = React.memo(function CoursesToolbar({
  searchQuery, setSearchQuery, filter, setFilter,
  categoryFilter, setCategoryFilter, categories,
  viewMode, folderViewMode, setViewAndFolder, onNewCategory,
}: CoursesToolbarProps) {
  return (
    <div className="bg-card rounded-xl lg:rounded-2xl border border-border p-3 lg:p-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 lg:gap-3">
          <div className="relative flex-1 sm:flex-none">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Поиск..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 w-full sm:w-48 lg:w-64 rounded-xl text-sm" />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
            <Select value={filter} onValueChange={v => setFilter(v as CourseFilter)}>
              <SelectTrigger className="w-32 lg:w-40 rounded-xl text-xs lg:text-sm shrink-0"><Filter className="w-4 h-4 mr-1 lg:mr-2" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все курсы</SelectItem>
                <SelectItem value="published">Опубликованные</SelectItem>
                <SelectItem value="draft">Черновики</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-36 lg:w-48 rounded-xl text-xs lg:text-sm shrink-0"><Tag className="w-4 h-4 mr-1 lg:mr-2" /><SelectValue placeholder="Категория" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все категории</SelectItem>
                <SelectItem value="none">Без категории</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />{cat.name}</div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="rounded-lg gap-1 text-xs shrink-0" onClick={onNewCategory}>
                <FolderPlus className="w-4 h-4" /><span className="hidden sm:inline">Категория</span>
              </Button>
            </TooltipTrigger><TooltipContent>Создать новую категорию курсов</TooltipContent></Tooltip></TooltipProvider>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end lg:self-auto">
          <TooltipProvider delayDuration={300}>
            <Tooltip><TooltipTrigger asChild><Button variant={folderViewMode === "folders" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewAndFolder(viewMode, "folders")}><Folder className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>Вид папками</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button variant={folderViewMode === "flat" && viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewAndFolder("grid", "flat")}><LayoutGrid className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>Вид сеткой</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button variant={folderViewMode === "flat" && viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewAndFolder("list", "flat")}><List className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>Вид списком</TooltipContent></Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
});
