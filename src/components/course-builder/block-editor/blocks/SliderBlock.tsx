import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Presentation, Upload, ChevronLeft, ChevronRight, Trash2,
  Image as ImageIcon } from "lucide-react";
import type { ContentBlock, SliderSlide } from "../types";

export function SliderBlock({ block, onUpdate }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slides = block.sliderSlides || [];
  const currentIndex = block.sliderCurrentIndex || 0;

  const parsePptxFile = async (file: File): Promise<SliderSlide[]> => {
    const JSZip = (await import('jszip')).default;
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const slidesArray: SliderSlide[] = [];
    const mediaFiles: Record<string, string> = {};
    const mediaEntries = Object.keys(zip.files).filter(name => name.startsWith('ppt/media/'));
    for (const mediaPath of mediaEntries) {
      try {
        const mediaFile = zip.files[mediaPath];
        if (mediaFile && !mediaFile.dir) {
          const blob = await mediaFile.async('blob');
          const fileName = mediaPath.split('/').pop() || '';
          const ext2 = fileName.split('.').pop()?.toLowerCase();
          let mimeType = 'image/png';
          if (ext2 === 'jpg' || ext2 === 'jpeg') mimeType = 'image/jpeg';
          else if (ext2 === 'gif') mimeType = 'image/gif';
          else if (ext2 === 'svg') mimeType = 'image/svg+xml';
          else if (ext2 === 'webp') mimeType = 'image/webp';
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(new Blob([blob], { type: mimeType }));
          });
          mediaFiles[fileName] = dataUrl;
        }
      } catch (err) { console.warn('Failed to extract media:', mediaPath, err); }
    }
    const slideFiles = Object.keys(zip.files).filter(name => name.match(/ppt\/slides\/slide\d+\.xml$/)).sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml$/)?.[1] || '0');
      const numB = parseInt(b.match(/slide(\d+)\.xml$/)?.[1] || '0');
      return numA - numB;
    });
    for (const slideFile of slideFiles) {
      const slideNum = slideFile.match(/slide(\d+)\.xml$/)?.[1] || '1';
      const content = await zip.files[slideFile].async('string');
      const parser2 = new DOMParser();
      const doc = parser2.parseFromString(content, 'application/xml');
      const textNodes = doc.querySelectorAll('a\\:t, t');
      const texts: string[] = [];
      textNodes.forEach(node => { const text = node.textContent?.trim(); if (text) texts.push(text); });
      let slideImageUrl: string | undefined;
      const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
      if (zip.files[relsPath]) {
        try {
          const relsContent = await zip.files[relsPath].async('string');
          const relsDoc = parser2.parseFromString(relsContent, 'application/xml');
          const relationships = relsDoc.querySelectorAll('Relationship');
          for (const rel of Array.from(relationships)) {
            const target = rel.getAttribute('Target');
            const type = rel.getAttribute('Type');
            if (type?.includes('/image') && target) {
              const imageName = target.replace('../media/', '');
              if (mediaFiles[imageName]) { slideImageUrl = mediaFiles[imageName]; break; }
            }
          }
        } catch (err) { console.warn('Failed to parse rels for slide:', slideNum, err); }
      }
      if (texts.length > 0 || slideImageUrl) {
        slidesArray.push({ id: crypto.randomUUID(), title: texts[0] || `Слайд ${slideNum}`, content: texts.slice(1).join('\n'), imageUrl: slideImageUrl });
      }
    }
    return slidesArray;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.name.toLowerCase().split('.').pop() !== 'pptx') { setError('Поддерживается только формат PPTX'); return; }
    setIsLoading(true); setError(null);
    try {
      const parsedSlides = await parsePptxFile(file);
      if (parsedSlides.length === 0) { setError('Не удалось извлечь слайды из презентации'); return; }
      onUpdate({ sliderSlides: parsedSlides, sliderCurrentIndex: 0, content: file.name });
    } catch (err) { console.error('Error parsing PPTX:', err); setError('Ошибка при обработке файла'); }
    finally { setIsLoading(false); }
  };

  const goToSlide = (index: number) => { if (index >= 0 && index < slides.length) onUpdate({ sliderCurrentIndex: index }); };
  const removeSlider = () => onUpdate({ sliderSlides: [], sliderCurrentIndex: 0, content: '' });

  if (slides.length === 0) {
    return (
      <div className="py-2">
        <div className="bg-muted rounded-xl p-6 space-y-4">
          <div className="text-center">
            <Presentation className="w-8 h-8 mx-auto mb-2 text-orange-500" />
            <p className="text-sm text-muted-foreground mb-2">Загрузите презентацию PPTX</p>
            <p className="text-xs text-muted-foreground/70">Слайды будут отображаться как интерактивный слайдер</p>
          </div>
          {error && <div className="text-sm text-destructive text-center">{error}</div>}
          <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
            {isLoading ? <SigmaSpinner /> : <Upload className="w-5 h-5 text-muted-foreground" />}
            <span className="text-sm text-muted-foreground">{isLoading ? 'Обработка...' : 'Выбрать файл PPTX'}</span>
            <input type="file" accept=".pptx" onChange={handleFileUpload} className="hidden" disabled={isLoading} />
          </label>
        </div>
      </div>
    );
  }

  const currentSlide = slides[currentIndex];
  return (
    <div className="py-2">
      <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-orange-500/20">
          <div className="flex items-center gap-2 text-orange-500"><Presentation className="w-5 h-5" /><span className="font-medium text-sm">{block.content || 'Презентация'}</span></div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{currentIndex + 1} / {slides.length}</span>
            <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive" onClick={removeSlider}><Trash2 className="w-4 h-4" /></Button>
          </div>
        </div>
        <div className="p-6 min-h-[250px]">
          {currentSlide && (
            <div className="space-y-4">
              {currentSlide.imageUrl ? (
                <div className="relative group rounded-lg overflow-hidden border border-border bg-secondary/20">
                  <img src={currentSlide.imageUrl} alt={currentSlide.title || 'Слайд'} className="w-full max-h-[400px] object-contain" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <label className="cursor-pointer px-3 py-2 bg-background/90 rounded-lg text-xs font-medium hover:bg-background transition-colors flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5" />Заменить
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { const ns = [...slides]; ns[currentIndex] = { ...ns[currentIndex], imageUrl: reader.result as string }; onUpdate({ sliderSlides: ns }); }; reader.readAsDataURL(file); }} />
                    </label>
                    <Button variant="destructive" size="sm" className="h-8 text-xs gap-1.5" onClick={() => { const ns = [...slides]; ns[currentIndex] = { ...ns[currentIndex], imageUrl: undefined }; onUpdate({ sliderSlides: ns }); }}>
                      <Trash2 className="w-3.5 h-3.5" />Удалить
                    </Button>
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 p-8 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-orange-500/50 hover:bg-orange-500/5 transition-colors">
                  <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
                  <span className="text-sm text-muted-foreground">Загрузить изображение для слайда</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { const ns = [...slides]; ns[currentIndex] = { ...ns[currentIndex], imageUrl: reader.result as string }; onUpdate({ sliderSlides: ns }); }; reader.readAsDataURL(file); }} />
                </label>
              )}
              <h3 className="text-lg font-semibold">{currentSlide.title}</h3>
              {currentSlide.content && <div className="text-sm text-muted-foreground whitespace-pre-wrap">{currentSlide.content}</div>}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between p-3 border-t border-orange-500/20 bg-orange-500/5">
          <Button variant="ghost" size="sm" onClick={() => goToSlide(currentIndex - 1)} disabled={currentIndex === 0} className="gap-1"><ChevronLeft className="w-4 h-4" />Назад</Button>
          <div className="flex gap-1">
            {slides.map((_, i) => <button key={i} onClick={() => goToSlide(i)} className={cn("w-2 h-2 rounded-full transition-colors", i === currentIndex ? "bg-orange-500" : "bg-orange-500/30 hover:bg-orange-500/50")} />)}
          </div>
          <Button variant="ghost" size="sm" onClick={() => goToSlide(currentIndex + 1)} disabled={currentIndex === slides.length - 1} className="gap-1">Далее<ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  );
}
