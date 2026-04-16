import { useState, useRef, useCallback, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { Upload, FileText, Download, Trash2, ChevronLeft, ChevronRight, Move } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import stampUrl from '@/assets/stamp-shafranovskiy.png';
import signatureUrl from '@/assets/signature-shafranovskiy.png';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

interface PdfFile {
  name: string;
  data: ArrayBuffer;
  pageCount: number;
}

interface OverlayPos {
  x: number;
  y: number;
}

export function DocumentSigning() {
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [activeFileIdx, setActiveFileIdx] = useState(0);
  const [activePage, setActivePage] = useState(0);
  const [stampPos, setStampPos] = useState<OverlayPos>({ x: 0.75, y: 0.85 });
  const [sigPos, setSigPos] = useState<OverlayPos>({ x: 0.72, y: 0.88 });
  const [dragging, setDragging] = useState<'stamp' | 'sig' | null>(null);
  const [signing, setSigning] = useState(false);
  const [stampImg, setStampImg] = useState<HTMLImageElement | null>(null);
  const [sigImg, setSigImg] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Preload images
  useEffect(() => {
    const s = new Image(); s.src = stampUrl; s.onload = () => setStampImg(s);
    const g = new Image(); g.src = signatureUrl; g.onload = () => setSigImg(g);
  }, []);

  const loadPdf = useCallback(async (file: File) => {
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
    return { name: file.name, data: buf, pageCount: doc.numPages } as PdfFile;
  }, []);

  const handleFiles = useCallback(async (fileList: FileList) => {
    const pdfs = Array.from(fileList).filter(f => f.type === 'application/pdf');
    if (!pdfs.length) { toast.error('Выберите PDF файлы'); return; }
    try {
      const loaded = await Promise.all(pdfs.map(loadPdf));
      setFiles(prev => [...prev, ...loaded]);
      setActiveFileIdx(files.length);
      setActivePage(0);
      toast.success(`Загружено ${loaded.length} файл(ов)`);
    } catch { toast.error('Ошибка загрузки PDF'); }
  }, [files.length, loadPdf]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  // Render current page
  useEffect(() => {
    const f = files[activeFileIdx];
    if (!f || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      const doc = await pdfjsLib.getDocument({ data: f.data.slice(0) }).promise;
      const page = await doc.getPage(activePage + 1);
      const vp = page.getViewport({ scale: 1.2 });
      const canvas = canvasRef.current!;
      canvas.width = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext('2d')!;
      if (cancelled) return;
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      // Draw overlays
      if (stampImg) {
        const sw = 120, sh = 120;
        ctx.globalAlpha = 0.85;
        ctx.drawImage(stampImg, stampPos.x * vp.width - sw / 2, stampPos.y * vp.height - sh / 2, sw, sh);
        ctx.globalAlpha = 1;
      }
      if (sigImg) {
        const sw = 150, sh = 60;
        ctx.globalAlpha = 0.9;
        ctx.drawImage(sigImg, sigPos.x * vp.width - sw / 2, sigPos.y * vp.height - sh / 2, sw, sh);
        ctx.globalAlpha = 1;
      }
    })();
    return () => { cancelled = true; };
  }, [files, activeFileIdx, activePage, stampPos, sigPos, stampImg, sigImg]);

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top) / rect.height;
    const dStamp = Math.hypot(rx - stampPos.x, ry - stampPos.y);
    const dSig = Math.hypot(rx - sigPos.x, ry - sigPos.y);
    if (dStamp < 0.08) setDragging('stamp');
    else if (dSig < 0.08) setDragging('sig');
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const rx = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
    const ry = Math.max(0.05, Math.min(0.95, (e.clientY - rect.top) / rect.height));
    if (dragging === 'stamp') setStampPos({ x: rx, y: ry });
    else setSigPos({ x: rx, y: ry });
  };

  const handleCanvasMouseUp = () => setDragging(null);

  const handleSign = async () => {
    if (!files.length) return;
    setSigning(true);
    try {
      const [stampBytes, sigBytes] = await Promise.all([
        fetch(stampUrl).then(r => r.arrayBuffer()),
        fetch(signatureUrl).then(r => r.arrayBuffer()),
      ]);

      for (const f of files) {
        const pdfDoc = await PDFDocument.load(f.data.slice(0));
        const stImg = await pdfDoc.embedPng(stampBytes);
        const sgImg = await pdfDoc.embedPng(sigBytes);
        const pages = pdfDoc.getPages();
        const lastPage = pages[pages.length - 1];
        const { width, height } = lastPage.getSize();
        const stW = 120, stH = 120, sgW = 150, sgH = 60;
        // Position from normalized coords — pdf-lib origin is bottom-left
        lastPage.drawImage(stImg, {
          x: stampPos.x * width - stW / 2,
          y: (1 - stampPos.y) * height - stH / 2,
          width: stW, height: stH, opacity: 0.85,
        });
        lastPage.drawImage(sgImg, {
          x: sigPos.x * width - sgW / 2,
          y: (1 - sigPos.y) * height - sgH / 2,
          width: sgW, height: sgH, opacity: 0.9,
        });
        const signed = await pdfDoc.save();
        const blob = new Blob([signed], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = f.name.replace('.pdf', '_signed.pdf');
        a.click();
        URL.revokeObjectURL(url);
      }
      toast.success('Документы подписаны и скачаны');
    } catch (err) {
      console.error(err);
      toast.error('Ошибка подписания');
    } finally {
      setSigning(false);
    }
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
    if (activeFileIdx >= files.length - 1) setActiveFileIdx(Math.max(0, files.length - 2));
    setActivePage(0);
  };

  const activeFile = files[activeFileIdx];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Подписание документов</h2>
        {files.length > 0 && (
          <Button onClick={handleSign} disabled={signing}>
            <Download className="w-4 h-4 mr-1" />
            {signing ? 'Подписание...' : `Подписать (${files.length})`}
          </Button>
        )}
      </div>

      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
      >
        <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Перетащите PDF или нажмите для выбора</p>
        <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden" onChange={e => e.target.files && handleFiles(e.target.files)} />
      </div>

      {/* File chips */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <Badge
              key={i}
              variant={i === activeFileIdx ? 'default' : 'secondary'}
              className="cursor-pointer gap-1 pr-1"
              onClick={() => { setActiveFileIdx(i); setActivePage(0); }}
            >
              <FileText className="w-3 h-3" />
              <span className="max-w-[200px] truncate">{f.name}</span>
              <button onClick={e => { e.stopPropagation(); removeFile(i); }} className="ml-1 hover:text-destructive">
                <Trash2 className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Preview */}
      {activeFile && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Стр. {activePage + 1} / {activeFile.pageCount}</span>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" disabled={activePage === 0} onClick={() => setActivePage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" disabled={activePage >= activeFile.pageCount - 1} onClick={() => setActivePage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Move className="w-3 h-3" /> Перетаскивайте печать и подпись мышкой
            </p>
            <div
              ref={containerRef}
              className="overflow-auto max-h-[70vh] border rounded-lg bg-muted/30 flex justify-center"
            >
              <canvas
                ref={canvasRef}
                className="max-w-full cursor-grab"
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
