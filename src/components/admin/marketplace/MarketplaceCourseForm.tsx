import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import type { DbCategory } from "@/hooks/useAdminMarketplace";

interface MarketplaceCourseFormProps {
  h: {
    newTitle: string;
    setNewTitle: (v: string) => void;
    newDescription: string;
    setNewDescription: (v: string) => void;
    newShortDesc: string;
    setNewShortDesc: (v: string) => void;
    newCategoryId: string;
    setNewCategoryId: (v: string) => void;
    newDuration: string;
    setNewDuration: (v: string) => void;
    newPriceStudent: string;
    setNewPriceStudent: (v: string) => void;
    newPriceOrg: string;
    setNewPriceOrg: (v: string) => void;
    isCreating: boolean;
    handleCreateCourse: () => Promise<string | null>;
    dbCategories: DbCategory[];
  };
}

export function MarketplaceCourseForm({ h }: MarketplaceCourseFormProps) {
  const navigate = useNavigate();
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [isGeneratingShortDesc, setIsGeneratingShortDesc] = useState(false);

  const handleGenerateDescription = async () => {
    if (!h.newTitle.trim()) { toast.error("Сначала введите название курса"); return; }
    setIsGeneratingDesc(true);
    try {
      const { data, error } = await safeInvoke<any>("generate-course-content", {
        body: { contentType: "description", courseTitle: h.newTitle },
      });
      if (error) throw error;
      if (data?.content) h.setNewDescription(data.content);
    } catch (e: any) {
      console.error(e);
      toast.error("Ошибка генерации описания");
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  const handleGenerateShortDesc = async () => {
    if (!h.newTitle.trim()) { toast.error("Сначала введите название курса"); return; }
    setIsGeneratingShortDesc(true);
    try {
      const { data, error } = await safeInvoke<any>("generate-course-content", {
        body: { contentType: "short_description", courseTitle: h.newTitle, courseDescription: h.newDescription },
      });
      if (error) throw error;
      if (data?.content) h.setNewShortDesc(data.content);
    } catch (e: any) {
      console.error(e);
      toast.error("Ошибка генерации описания");
    } finally {
      setIsGeneratingShortDesc(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display">Создать курс для маркетплейса</CardTitle>
        <CardDescription>Курс будет создан от имени платформы</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Название курса *</Label>
          <Input value={h.newTitle} onChange={(e) => h.setNewTitle(e.target.value)} placeholder="Название курса" className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Описание</Label>
            <Button variant="ghost" size="sm" onClick={handleGenerateDescription} disabled={isGeneratingDesc || !h.newTitle.trim()}>
              {isGeneratingDesc ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
              Сгенерировать с ИИ
            </Button>
          </div>
          <Textarea value={h.newDescription} onChange={(e) => h.setNewDescription(e.target.value)} placeholder="Подробное описание курса..." className="rounded-xl" rows={3} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Категория</Label>
            <Select value={h.newCategoryId} onValueChange={h.setNewCategoryId}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Выберите категорию" />
              </SelectTrigger>
              <SelectContent>
                {h.dbCategories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color || '#888' }} />
                      {cat.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Длительность</Label>
            <Input value={h.newDuration} onChange={(e) => h.setNewDuration(e.target.value)} placeholder="40 часов" className="rounded-xl" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Цена для студентов (₽) *</Label>
            <Input type="number" value={h.newPriceStudent} onChange={(e) => h.setNewPriceStudent(e.target.value)} placeholder="5000" className="rounded-xl" />
          </div>
          <div className="space-y-2">
            <Label>Цена для организаций (₽) *</Label>
            <Input type="number" value={h.newPriceOrg} onChange={(e) => h.setNewPriceOrg(e.target.value)} placeholder="3000" className="rounded-xl" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Краткое описание для каталога</Label>
            <Button variant="ghost" size="sm" onClick={handleGenerateShortDesc} disabled={isGeneratingShortDesc || !h.newTitle.trim()}>
              {isGeneratingShortDesc ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
              Сгенерировать с ИИ
            </Button>
          </div>
          <Textarea value={h.newShortDesc} onChange={(e) => h.setNewShortDesc(e.target.value)} placeholder="Краткое описание..." className="rounded-xl" rows={2} />
        </div>
        <Button
          className="w-full btn-gradient rounded-xl"
          onClick={async () => {
            const courseId = await h.handleCreateCourse();
            if (courseId) navigate(`/course-builder/${courseId}`);
          }}
          disabled={h.isCreating || !h.newTitle.trim() || !h.newPriceStudent || !h.newPriceOrg}
        >
          {h.isCreating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Создание...</> : <><Plus className="w-4 h-4 mr-2" />Создать и перейти к редактированию</>}
        </Button>
      </CardContent>
    </Card>
  );
}
