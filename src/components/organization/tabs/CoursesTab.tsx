import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { 
  Search, Filter, Tag, Plus, LayoutGrid, List, Loader2, 
  BookOpen, Users, Edit, Eye 
} from "lucide-react";
import { useCourses } from "@/hooks/useCourses";
import type { Course, CourseCategory, CourseFilter, CourseViewMode } from "@/types";

interface CoursesTabProps {
  organizationId: string;
  onCourseClick?: (course: Course) => void;
  onOpenCourseDetails?: (course: Course) => void;
}

export function CoursesTab({ organizationId, onCourseClick, onOpenCourseDetails }: CoursesTabProps) {
  const navigate = useNavigate();
  
  const {
    courses,
    categories,
    isLoading,
    filter,
    setFilter,
    categoryFilter,
    setCategoryFilter,
    searchQuery,
    setSearchQuery,
    viewMode,
    setViewMode,
    filteredCourses,
    createCat,
  } = useCourses(organizationId);

  // Category dialog state
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#6366f1");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  const getCategoryById = (categoryId: string | null | undefined): CourseCategory | undefined => {
    if (!categoryId) return undefined;
    return categories.find(c => c.id === categoryId);
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    setIsCreatingCategory(true);
    await createCat(newCategoryName.trim(), newCategoryColor);
    setNewCategoryName("");
    setNewCategoryColor("#6366f1");
    setShowCategoryDialog(false);
    setIsCreatingCategory(false);
  };

  const handleCourseClick = (course: Course) => {
    if (onOpenCourseDetails) {
      onOpenCourseDetails(course);
    } else if (onCourseClick) {
      onCourseClick(course);
    }
  };

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Filters */}
      <div className="bg-card rounded-xl lg:rounded-2xl border border-border p-3 lg:p-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 lg:gap-3">
            <div className="relative flex-1 sm:flex-none">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input 
                placeholder="Поиск курсов..." 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
                className="pl-10 w-full sm:w-48 lg:w-64 rounded-xl text-sm" 
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
              <Select value={filter} onValueChange={v => setFilter(v as CourseFilter)}>
                <SelectTrigger className="w-32 lg:w-40 rounded-xl text-xs lg:text-sm shrink-0">
                  <Filter className="w-4 h-4 mr-1 lg:mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все курсы</SelectItem>
                  <SelectItem value="published">Опубликованные</SelectItem>
                  <SelectItem value="draft">Черновики</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-36 lg:w-48 rounded-xl text-xs lg:text-sm shrink-0">
                  <Tag className="w-4 h-4 mr-1 lg:mr-2" />
                  <SelectValue placeholder="Категория" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все категории</SelectItem>
                  <SelectItem value="none">Без категории</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-lg gap-1 text-xs shrink-0" 
                onClick={() => setShowCategoryDialog(true)}
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Категория</span>
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end lg:self-auto">
            <Button 
              variant={viewMode === "grid" ? "secondary" : "ghost"} 
              size="icon" 
              className="h-8 w-8" 
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button 
              variant={viewMode === "list" ? "secondary" : "ghost"} 
              size="icon" 
              className="h-8 w-8" 
              onClick={() => setViewMode("list")}
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Course List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Нет курсов</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
          {filteredCourses.map(course => (
            <div 
              key={course.id} 
              className="bg-card rounded-2xl border border-border overflow-hidden hover:shadow-lg transition-shadow cursor-pointer" 
              onClick={() => handleCourseClick(course)}
            >
              <div className="h-32 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                <BookOpen className="w-12 h-12 text-primary/50" />
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-lg line-clamp-1">{course.title}</h3>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    course.is_published ? 'bg-sigma-green/10 text-sigma-green' : 'bg-muted text-muted-foreground'
                  }`}>
                    {course.is_published ? 'Опубликован' : 'Черновик'}
                  </span>
                </div>
                {course.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{course.description}</p>
                )}
                {getCategoryById(course.category_id) && (
                  <span 
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white mb-3" 
                    style={{ backgroundColor: getCategoryById(course.category_id)?.color }}
                  >
                    {getCategoryById(course.category_id)?.name}
                  </span>
                )}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {course.studentsCount || 0} учеников
                  </div>
                  <div className="flex items-center gap-1">
                    <BookOpen className="w-4 h-4" />
                    {course.lessonsCount || 0} уроков
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Курс</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Категория</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Статус</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Ученики</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Уроки</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredCourses.map(course => (
                <tr 
                  key={course.id} 
                  className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors cursor-pointer" 
                  onClick={() => handleCourseClick(course)}
                >
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium">{course.title}</div>
                      {course.description && (
                        <div className="text-sm text-muted-foreground line-clamp-1">{course.description}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {getCategoryById(course.category_id) ? (
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: getCategoryById(course.category_id)?.color }} 
                        />
                        <span className="text-sm">{getCategoryById(course.category_id)?.name}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      course.is_published ? 'bg-sigma-green/10 text-sigma-green' : 'bg-muted text-muted-foreground'
                    }`}>
                      {course.is_published ? 'Опубликован' : 'Черновик'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                      <Users className="w-3 h-3" />
                      {course.studentsCount || 0}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-accent/10 text-accent">
                      <BookOpen className="w-3 h-3" />
                      {course.lessonsCount || 0}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="rounded-lg" 
                        onClick={e => {
                          e.stopPropagation();
                          navigate(`/course-builder/${course.id}`);
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="rounded-lg" 
                        onClick={e => {
                          e.stopPropagation();
                          navigate(`/course-preview/${course.id}`);
                        }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Новая категория</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Название</Label>
              <Input 
                value={newCategoryName} 
                onChange={e => setNewCategoryName(e.target.value)} 
                placeholder="Название категории"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label>Цвет</Label>
              <div className="flex items-center gap-3 mt-2">
                <input 
                  type="color" 
                  value={newCategoryColor} 
                  onChange={e => setNewCategoryColor(e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer border-0"
                />
                <Input 
                  value={newCategoryColor} 
                  onChange={e => setNewCategoryColor(e.target.value)}
                  className="rounded-xl flex-1"
                />
              </div>
            </div>
            <Button 
              className="w-full btn-gradient rounded-xl" 
              onClick={handleCreateCategory}
              disabled={isCreatingCategory || !newCategoryName.trim()}
            >
              {isCreatingCategory ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Создание...
                </>
              ) : (
                "Создать категорию"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
