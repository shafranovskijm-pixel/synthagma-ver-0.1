import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, ExternalLink, Sparkles } from "lucide-react";
import { LandingHeroSection } from "@/components/course-landing/LandingHeroSection";
import { LandingAIGenerateDialog } from "@/components/course-landing/LandingAIGenerateDialog";
import { LandingAudienceSection } from "@/components/course-landing/LandingAudienceSection";
import { LandingProgramSection } from "@/components/course-landing/LandingProgramSection";
import { LandingBenefitsSection } from "@/components/course-landing/LandingBenefitsSection";
import { LandingCtaSection } from "@/components/course-landing/LandingCtaSection";
import { LandingLearnSection } from "@/components/course-landing/LandingLearnSection";
import { LandingProcessSection } from "@/components/course-landing/LandingProcessSection";
import { LandingTeachersSection } from "@/components/course-landing/LandingTeachersSection";
import { LandingReviewsSection } from "@/components/course-landing/LandingReviewsSection";
import { LandingPricingSection } from "@/components/course-landing/LandingPricingSection";
import { LandingFaqSection } from "@/components/course-landing/LandingFaqSection";
import { SectionToolbar } from "@/components/course-landing/SectionToolbar";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useLandingEditor, SECTION_LABELS } from "@/hooks/useLandingEditor";

interface CourseLandingEditorContentProps { courseId: string; embedded?: boolean; }

export function CourseLandingEditorContent({ courseId, embedded = false }: CourseLandingEditorContentProps) {
  const h = useLandingEditor(courseId);

  if (h.loading) return <div className="min-h-screen flex items-center justify-center"><SigmaSpinner size="lg" /></div>;
  if (!h.course) return null;

  const renderSection = (sectionId: string, index: number) => {
    const isHidden = h.landing.sections_hidden.includes(sectionId);
    const order = h.landing.sections_order;
    const toolbar = <SectionToolbar sectionId={sectionId} isHidden={isHidden} canMoveUp={index > 0} canMoveDown={index < order.length - 1} onMoveUp={() => h.moveSection(sectionId, -1)} onMoveDown={() => h.moveSection(sectionId, 1)} onToggleVisibility={() => h.toggleSection(sectionId)} onAIGenerate={sectionId !== "program" ? () => h.openAIDialog(sectionId) : undefined} label={SECTION_LABELS[sectionId] || sectionId} />;

    if (isHidden) return (<div key={sectionId} className="relative group/section opacity-50">{toolbar}<div className="py-6 px-6 bg-muted/20 border border-dashed border-border rounded-lg mx-4"><p className="text-center text-sm text-muted-foreground">Секция «{SECTION_LABELS[sectionId] || sectionId}» скрыта на странице курса</p></div></div>);

    const w = "relative group/section";
    switch (sectionId) {
      case "hero": return <div key={sectionId} className={w}>{toolbar}<LandingHeroSection title={h.course.title} subtitle={h.landing.hero.subtitle} orgName={h.orgName} backgroundUrl={h.landing.hero.background_url} coverImageUrl={h.course.cover_image_url} accentColor={h.course.accent_color} price={h.course.price || 0} showPrice={h.landing.hero.show_price} lessonsCount={h.lessons.length} duration={h.course.duration} isEditing onSubtitleChange={v => h.setLanding(l => ({ ...l, hero: { ...l.hero, subtitle: v } }))} onBackgroundChange={() => h.fileInputRef.current?.click()} onShowPriceChange={v => h.setLanding(l => ({ ...l, hero: { ...l.hero, show_price: v } }))} /></div>;
      case "audience": return <div key={sectionId} className={w}>{toolbar}<LandingAudienceSection title={h.landing.audience.title} description={h.landing.audience.description} items={h.landing.audience.items} isEditing onTitleChange={v => h.setLanding(l => ({ ...l, audience: { ...l.audience, title: v } }))} onDescriptionChange={v => h.setLanding(l => ({ ...l, audience: { ...l.audience, description: v } }))} onItemChange={(i, f, v) => h.updateArrayItem("audience", i, f, v)} onAddItem={() => h.addArrayItem("audience", { icon: "user", title: "Новый пункт", description: "Описание" })} onRemoveItem={i => h.removeArrayItem("audience", i)} /></div>;
      case "learn": return <div key={sectionId} className={w}>{toolbar}<LandingLearnSection title={h.landing.learn.title} description={h.landing.learn.description} items={h.landing.learn.items} isEditing onTitleChange={v => h.setLanding(l => ({ ...l, learn: { ...l.learn, title: v } }))} onDescriptionChange={v => h.setLanding(l => ({ ...l, learn: { ...l.learn, description: v } }))} onItemChange={(i, f, v) => h.updateArrayItem("learn", i, f, v)} onAddItem={() => h.addArrayItem("learn", { icon: "star", title: "Новый пункт", description: "Описание" })} onRemoveItem={i => h.removeArrayItem("learn", i)} /></div>;
      case "program": return <div key={sectionId} className={w}>{toolbar}<LandingProgramSection lessons={h.lessons} accentColor={h.course.accent_color} /></div>;
      case "process": return <div key={sectionId} className={w}>{toolbar}<LandingProcessSection title={h.landing.process.title} content={h.landing.process.content} isEditing onTitleChange={v => h.setLanding(l => ({ ...l, process: { ...l.process, title: v } }))} onContentChange={v => h.setLanding(l => ({ ...l, process: { ...l.process, content: v } }))} /></div>;
      case "benefits": return <div key={sectionId} className={w}>{toolbar}<LandingBenefitsSection benefits={h.landing.benefits} isEditing onBenefitChange={h.updateBenefit} onAddBenefit={h.addBenefit} onRemoveBenefit={h.removeBenefit} /></div>;
      case "teachers": return <div key={sectionId} className={w}>{toolbar}<LandingTeachersSection title={h.landing.teachers.title} description={h.landing.teachers.description} teachers={h.landing.teachers.items} courseId={courseId} isEditing onTitleChange={v => h.setLanding(l => ({ ...l, teachers: { ...l.teachers, title: v } }))} onDescriptionChange={v => h.setLanding(l => ({ ...l, teachers: { ...l.teachers, description: v } }))} onTeacherChange={h.updateTeacher} onAddTeacher={h.addTeacher} onRemoveTeacher={h.removeTeacher} /></div>;
      case "reviews": return <div key={sectionId} className={w}>{toolbar}<LandingReviewsSection title={h.landing.reviews.title} reviews={h.landing.reviews.items} isEditing onTitleChange={v => h.setLanding(l => ({ ...l, reviews: { ...l.reviews, title: v } }))} onReviewChange={h.updateReview} onAddReview={h.addReview} onRemoveReview={h.removeReview} /></div>;
      case "pricing": return <div key={sectionId} className={w}>{toolbar}<LandingPricingSection title={h.landing.pricing.title} tiers={h.landing.pricing.tiers} isEditing onTitleChange={v => h.setLanding(l => ({ ...l, pricing: { ...l.pricing, title: v } }))} onTierChange={h.updateTier} onTierFeatureChange={h.updateTierFeature} onAddTierFeature={h.addTierFeature} onRemoveTierFeature={h.removeTierFeature} onAddTier={h.addTier} onRemoveTier={h.removeTier} /></div>;
      case "faq": return <div key={sectionId} className={w}>{toolbar}<LandingFaqSection title={h.landing.faq.title} items={h.landing.faq.items} isEditing onTitleChange={v => h.setLanding(l => ({ ...l, faq: { ...l.faq, title: v } }))} onItemChange={h.updateFaqItem} onAddItem={h.addFaqItem} onRemoveItem={h.removeFaqItem} /></div>;
      case "cta": return <div key={sectionId} className={w}>{toolbar}<LandingCtaSection title={h.landing.cta.title} subtitle={h.landing.cta.subtitle} accentColor={h.course.accent_color} isEditing onTitleChange={v => h.setLanding(l => ({ ...l, cta: { ...l.cta, title: v } }))} onSubtitleChange={v => h.setLanding(l => ({ ...l, cta: { ...l.cta, subtitle: v } }))} /></div>;
      default: return null;
    }
  };

  const aiDialog = <LandingAIGenerateDialog open={h.aiDialogOpen} onOpenChange={h.setAiDialogOpen} sectionId={h.aiDialogSection} courseTitle={h.course.title} courseDescription={h.course.description} courseId={courseId} onTextGenerated={h.handleAITextGenerated} onImageGenerated={h.handleAIImageGenerated} />;

  if (embedded) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Редактор страницы курса</h3>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => h.openAIDialog(null)} className="gap-1.5"><Sparkles className="w-4 h-4" />ИИ</Button>
            <Button variant="outline" size="sm" onClick={() => window.open(h.publicUrl, "_blank")} className="gap-1.5"><ExternalLink className="w-4 h-4" />Просмотр</Button>
            <Button size="sm" onClick={h.handleSave} disabled={h.saving} className="gap-1.5">{h.saving ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4" />}Сохранить</Button>
          </div>
        </div>
        <input ref={h.fileInputRef} type="file" accept="image/*" className="hidden" onChange={h.handleBackgroundUpload} />
        {h.landing.sections_order.map((sectionId, index) => renderSection(sectionId, index))}
        {aiDialog}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => h.navigate(`/course/${courseId}/edit`)} className="gap-1.5"><ArrowLeft className="w-4 h-4" />Редактор курса</Button>
            <span className="text-sm font-medium text-muted-foreground hidden sm:block">{h.course.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => h.openAIDialog(null)} className="gap-1.5"><Sparkles className="w-4 h-4" /><span className="hidden sm:inline">Сгенерировать с ИИ</span></Button>
            <Button variant="outline" size="sm" onClick={() => window.open(h.publicUrl, "_blank")} className="gap-1.5"><ExternalLink className="w-4 h-4" /><span className="hidden sm:inline">Просмотр</span></Button>
            <Button size="sm" onClick={h.handleSave} disabled={h.saving} className="gap-1.5">{h.saving ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4" />}Сохранить</Button>
          </div>
        </div>
      </div>
      <input ref={h.fileInputRef} type="file" accept="image/*" className="hidden" onChange={h.handleBackgroundUpload} />
      {h.landing.sections_order.map((sectionId, index) => renderSection(sectionId, index))}
      {aiDialog}
    </div>
  );
}

export default function CourseLandingEditor() {
  const { courseId } = useParams<{ courseId: string }>();
  if (!courseId) return null;
  return <CourseLandingEditorContent courseId={courseId} />;
}
