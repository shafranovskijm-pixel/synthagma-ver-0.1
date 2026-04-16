import { useState, useEffect, useCallback } from "react";
import {
  Plus, Sparkles, BookOpen, Upload, ShoppingCart, Library, Settings, History
} from "lucide-react";
import { BulkCourseImporter } from "./BulkCourseImporter";
import { BulkContentGenerator } from "./BulkContentGenerator";
import { ContentGeneratorTab } from "./ContentGeneratorTab";
import { GenerationHistoryTab } from "./GenerationHistoryTab";
import { ProgramListImporter } from "./ProgramListImporter";
import { KnowledgeBankTab } from "./KnowledgeBankTab";
import { MarketplaceSettingsTab, type ValidationRules, type AiPrompts } from "./MarketplaceSettingsTab";
import { ProgramsTab } from "./ProgramsTab";
import { MarketplaceOrdersList } from "./MarketplaceOrdersList";
import { supabase } from "@/integrations/supabase/client";
import { Package } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminMarketplace } from "@/hooks/useAdminMarketplace";

import { useMarketplaceValidation } from "./marketplace/useMarketplaceValidation";
import { MarketplaceCourseForm } from "./marketplace/MarketplaceCourseForm";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import {
  MarketplaceEditDialog,
  MarketplaceOrderDialog,
  MarketplaceCategoryDialog,
  MarketplaceMoveCategoryDialog,
  MarketplaceBulkMoveDialog } from "./marketplace/MarketplaceDialogs";

import { ICON_OPTIONS } from "./marketplace/marketplaceConstants";
import { AdminMarketplaceCatalogTab } from "./marketplace/AdminMarketplaceCatalogTab";

export function AdminMarketplaceManager() {
  const h = useAdminMarketplace();
  const [bulkGenCourse, setBulkGenCourse] = useState<{ id: string; title: string; description?: string } | null>(null);
  const [converting, setConverting] = useState(false);
  const [valRules, setValRules] = useState<ValidationRules>({ minLessons: 3, minContentLength: 50, requireTest: true, requireText: true, checkDuplicateTitles: true });
  const [aiPrompts, setAiPrompts] = useState<AiPrompts>({});
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [showBulkMoveDialog, setShowBulkMoveDialog] = useState(false);
  const [bulkMoveTargetCategory, setBulkMoveTargetCategory] = useState("");

  const toggleCourseSelect = useCallback((courseId: string) => {
    setSelectedCourses(prev => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId); else next.add(courseId);
      return next;
    });
  }, []);

  const handleBulkMove = async () => {
    if (selectedCourses.size === 0 || !bulkMoveTargetCategory) return;
    await h.handleBulkMoveToCategory(Array.from(selectedCourses), bulkMoveTargetCategory);
    setSelectedCourses(new Set());
    setShowBulkMoveDialog(false);
    setBulkMoveTargetCategory("");
  };

  const [aiProvider, setAiProvider] = useState("gigachat");
  const [gigachatModel, setGigachatModel] = useState<string | undefined>();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("ai_settings").select("provider, gigachat_model").eq("context", "pipeline").single();
        if (data) {
          setAiProvider(data.provider || "gigachat");
          setGigachatModel(data.gigachat_model || undefined);
        }
      } catch {}
    })();
  }, []);

  const handleSettingsLoaded = useCallback((rules: ValidationRules, prompts: AiPrompts) => {
    setValRules(rules);
    setAiPrompts(prompts);
  }, []);

  const validation = useMarketplaceValidation({
    courses: h.courses,
    dbCategories: h.dbCategories,
    fetchData: h.fetchData,
    aiProvider,
    gigachatModel,
    aiPrompts,
    valRules });

  const handleBulkGenerate = (item: any) => {
    setBulkGenCourse({ id: item.course_id, title: item.course?.title || "", description: item.course?.description || "" });
  };

  if (h.isLoading && h.courses.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <SigmaSpinner size="lg" />
      </div>
    );
  }

  const adminNavItems = [
    { value: "catalog", icon: Package, label: "Каталог" },
    { value: "programs", icon: BookOpen, label: "Программы" },
    { value: "create", icon: Plus, label: "Создать курс" },
    { value: "generator", icon: Sparkles, label: "Генератор" },
    { value: "import", icon: Upload, label: "Импорт" },
    { value: "knowledge", icon: Library, label: "Банк знаний" },
    { value: "orders", icon: ShoppingCart, label: "Заявки" },
    { value: "history", icon: History, label: "История" },
    { value: "settings", icon: Settings, label: "Настройки" },
  ];

  return (
    <div className="space-y-6">
      <Tabs value={h.activeTab} onValueChange={(v) => h.setActiveTab(v as any)} className="space-y-0">
        <div className="flex gap-6">
          {/* Vertical sidebar nav */}
          <div className="w-[200px] shrink-0">
            <TabsList className="flex flex-col gap-1 sticky top-4 h-auto bg-transparent p-0 w-full">
              {adminNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = h.activeTab === item.value;
                return (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium justify-start w-full transition-colors
                      ${isActive ? "bg-primary/10 text-primary shadow-sm" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}
                    `}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-6">

        <TabsContent value="history" className="space-y-4"><GenerationHistoryTab /></TabsContent>
        <TabsContent value="settings" className="space-y-4"><MarketplaceSettingsTab onSettingsLoaded={handleSettingsLoaded} /></TabsContent>
        <TabsContent value="generator" className="space-y-4">
          <ContentGeneratorTab courses={h.courses} dbCategories={h.dbCategories} onComplete={() => h.fetchData()} />
        </TabsContent>

        <TabsContent value="catalog" className="space-y-4">
          <AdminMarketplaceCatalogTab
            h={h}
            validation={validation}
            selectedCourses={selectedCourses}
            setSelectedCourses={setSelectedCourses}
            toggleCourseSelect={toggleCourseSelect}
            onBulkGenerate={handleBulkGenerate}
            converting={converting}
            setConverting={setConverting}
            onShowBulkMoveDialog={() => { setBulkMoveTargetCategory(""); setShowBulkMoveDialog(true); }}
          />
        </TabsContent>

        <TabsContent value="create" className="space-y-6">
          <MarketplaceCourseForm h={h} />
        </TabsContent>

        <TabsContent value="import" className="space-y-6">
          <ProgramListImporter onComplete={() => { h.fetchData(); h.setActiveTab("catalog"); }} />
          <BulkCourseImporter onComplete={() => { h.fetchData(); h.setActiveTab("catalog"); }} />
        </TabsContent>

        <TabsContent value="programs" className="space-y-6"><ProgramsTab /></TabsContent>
        <TabsContent value="knowledge" className="space-y-6"><KnowledgeBankTab /></TabsContent>
        <TabsContent value="orders" className="space-y-6">
          <MarketplaceOrdersList orders={h.orders as any} onViewOrder={(order) => { h.setSelectedOrder(order as any); h.setShowOrderDialog(true); }} />
        </TabsContent>
          </div>
        </div>
      </Tabs>

      {/* Dialogs */}
      <MarketplaceEditDialog
        open={h.showEditDialog}
        onOpenChange={h.setShowEditDialog}
        editingCourse={h.editingCourse}
        setEditingCourse={h.setEditingCourse}
        onSave={h.handleEditCourse}
      />
      <MarketplaceOrderDialog
        open={h.showOrderDialog}
        onOpenChange={h.setShowOrderDialog}
        order={h.selectedOrder}
        onUpdateStatus={h.handleUpdateOrderStatus}
      />
      <MarketplaceCategoryDialog
        open={h.showCategoryDialog}
        onOpenChange={h.setShowCategoryDialog}
        h={h}
        iconOptions={ICON_OPTIONS}
      />
      <MarketplaceMoveCategoryDialog
        open={h.showMoveCategoryDialog}
        onOpenChange={h.setShowMoveCategoryDialog}
        courseName={h.movingCourse?.course?.title}
        targetCategory={h.targetCategory}
        setTargetCategory={h.setTargetCategory}
        dbCategories={h.dbCategories}
        onMove={() => h.movingCourse && h.handleMoveToCategory(h.movingCourse, h.targetCategory)}
      />
      <MarketplaceBulkMoveDialog
        open={showBulkMoveDialog}
        onOpenChange={setShowBulkMoveDialog}
        count={selectedCourses.size}
        targetCategory={bulkMoveTargetCategory}
        setTargetCategory={setBulkMoveTargetCategory}
        dbCategories={h.dbCategories}
        onMove={handleBulkMove}
      />

      {bulkGenCourse && (
        <BulkContentGenerator
          open={!!bulkGenCourse}
          onOpenChange={(v) => { if (!v) setBulkGenCourse(null); }}
          courseId={bulkGenCourse.id}
          courseTitle={bulkGenCourse.title}
          courseDescription={bulkGenCourse.description || ""}
        />
      )}
    </div>
  );
}
