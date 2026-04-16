import { useState, useRef, useCallback, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { Upload, FileText, Download, Trash2, ChevronLeft, ChevronRight, Move, Stamp, PenTool } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import stampUrl from '@/assets/stamp-shafranovskiy.png';
import signatureUrl from '@/assets/signature-shafranovskiy.png';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

interface PdfFile {
  name: string;
  data: ArrayBuffer;
  pageCount: number;
}

interface Overlay {
  id: string;
  type: 'stamp' | 'signature';
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}

const BASE_STAMP = { w: 120, h: 120 };
const BASE_SIG = { w: 150, h: 60 };

function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

function defaultOverlays(): Overlay[] {
  return [
    { id: makeId(), type: 'stamp', x: 0.75, y: 0.85, scaleX: 1, scaleY: 1 },
    { id: makeId(), type: 'signature', x: 0.72, y: 0.88, scaleX: 1, scaleY: 1 },
  ];
}

function overlaySize(o: Overlay) {
  const base = o.type === 'stamp' ? BASE_STAMP : BASE_SIG;
  return { w: base.w * o.scaleX, h: base.h * o.scaleY };
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  rx: number;
  ry: number;
}

export function DocumentSigning() {
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [activeFileIdx, setActiveFileIdx] = useState(0);
  const [activePage, setActivePage] = useState(0);
  const [overlays, setOverlays] = useState<Overlay[]>(defaultOverlays());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [stampImg, setStampImg] = useState<HTMLImageElement | null>(null);
  const [sigImg, setSigImg] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, rx: 0, ry: 0 });

  useEffect(() => {
    const s = new Image(); s.src = stampUrl; s.onload = () => setStampImg(s);
    const g = new Image(); g.src = signatureUrl; g.onload = () => setSigImg(g);
  }, []);

  // Close context menu on any click
  useEffect(() => {
    if (!ctxMenu.visible) return;
    const close = () => setCtxMenu(prev => ({ ...prev, visible: false }));
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [ctxMenu.visible]);

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

  // Render current page + overlays
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

      for (const o of overlays) {
        const img = o.type === 'stamp' ? stampImg : sigImg;
        if (!img) continue;
        const { w, h } = overlaySize(o);
        ctx.globalAlpha = o.type === 'stamp' ? 0.85 : 0.9;
        ctx.drawImage(img, o.x * vp.width - w / 2, o.y * vp.height - h / 2, w, h);
        if (o.id === selectedId) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = '#0ea5e9';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 3]);
          ctx.strokeRect(o.x * vp.width - w / 2 - 2, o.y * vp.height - h / 2 - 2, w + 4, h + 4);
          ctx.setLineDash([]);
        }
        ctx.globalAlpha = 1;
      }
    })();
    return () => { cancelled = true; };
  }, [files, activeFileIdx, activePage, overlays, selectedId, stampImg, sigImg]);

  const getRelCoords = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      rx: (e.clientX - rect.left) / rect.width,
      ry: (e.clientY - rect.top) / rect.height,
    };
  };

  const findClosestOverlay = (rx: number, ry: number) => {
    let best: Overlay | null = null;
    let bestD = 0.08;
    for (const o of overlays) {
      const d = Math.hypot(rx - o.x, ry - o.y);
      if (d < bestD) { best = o; bestD = d; }
    }
    return best;
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const c = getRelCoords(e);
    if (!c) return;
    const hit = findClosestOverlay(c.rx, c.ry);
    if (hit) {
      setSelectedId(hit.id);
      setDragging(hit.id);
    } else {
      setSelectedId(null);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const rx = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
    const ry = Math.max(0.05, Math.min(0.95, (e.clientY - rect.top) / rect.height));
    setOverlays(prev => prev.map(o => o.id === dragging ? { ...o, x: rx, y: ry } : o));
  };

  const handleCanvasMouseUp = () => setDragging(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const c = getRelCoords(e);
    if (!c) return;
    setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, rx: c.rx, ry: c.ry });
  };

  const addOverlayFromMenu = (type: 'stamp' | 'signature') => {
    const newO: Overlay = { id: makeId(), type, x: ctxMenu.rx, y: ctxMenu.ry, scaleX: 1, scaleY: 1 };
    setOverlays(prev => [...prev, newO]);
    setSelectedId(newO.id);
    setCtxMenu(prev => ({ ...prev, visible: false }));
    toast.success(type === 'stamp' ? 'Печать добавлена' : 'Подпись добавлена');
  };

  const removeOverlay = (id: string) => {
    setOverlays(prev => prev.filter(o => o.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const updateScaleX = (id: string, v: number) => {
    setOverlays(prev => prev.map(o => o.id === id ? { ...o, scaleX: v } : o));
  };
  const updateScaleY = (id: string, v: number) => {
    setOverlays(prev => prev.map(o => o.id === id ? { ...o, scaleY: v } : o));
  };

  const handleSign = async () => {
    if (!files.length || !overlays.length) return;
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

        for (const o of overlays) {
          const img = o.type === 'stamp' ? stImg : sgImg;
          const { w, h } = overlaySize(o);
          lastPage.drawImage(img, {
            x: o.x * width - w / 2,
            y: (1 - o.y) * height - h / 2,
            width: w, height: h,
            opacity: o.type === 'stamp' ? 0.85 : 0.9,
          });
        }

        const signed = await pdfDoc.save();
        const blob = new Blob([signed.buffer as ArrayBuffer], { type: 'application/pdf' });
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
  const selectedOverlay = overlays.find(o => o.id === selectedId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Подписание документов</h2>
        {files.length > 0 && (
          <Button onClick={handleSign} disabled={signing || !overlays.length}>
            <Download className="w-4 h-4 mr-1" />
            {signing ? 'Подписание...' : `Подписать (${files.length})`}
          </Button>
        )}
      </div>

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
              <Move className="w-3 h-3" /> ЛКМ — перетащить, ПКМ — добавить печать или подпись
            </p>

            {/* Overlay controls */}
            <div className="flex items-center gap-3 min-h-[36px] flex-wrap">
              {selectedOverlay ? (
                <>
                  <span className="text-xs font-medium">
                    {selectedOverlay.type === 'stamp' ? '🔴 Печать' : '✍️ Подпись'}
                  </span>
                  <div className="flex items-center gap-2 flex-1 max-w-[180px]">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Шир.</span>
                    <Slider
                      value={[selectedOverlay.scaleX]}
                      min={0.3}
                      max={3}
                      step={0.05}
                      onValueChange={([v]) => updateScaleX(selectedOverlay.id, v)}
                    />
                    <span className="text-xs text-muted-foreground w-8">{selectedOverlay.scaleX.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-1 max-w-[180px]">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Выс.</span>
                    <Slider
                      value={[selectedOverlay.scaleY]}
                      min={0.3}
                      max={3}
                      step={0.05}
                      onValueChange={([v]) => updateScaleY(selectedOverlay.id, v)}
                    />
                    <span className="text-xs text-muted-foreground w-8">{selectedOverlay.scaleY.toFixed(1)}</span>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeOverlay(selectedOverlay.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">Нажмите на элемент для настройки</span>
              )}
            </div>

            <div className="overflow-auto max-h-[70vh] border rounded-lg bg-muted/30 flex justify-center relative">
              <canvas
                ref={canvasRef}
                className="max-w-full cursor-grab"
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
                onContextMenu={handleContextMenu}
              />
            </div>

            {/* Custom context menu */}
            {ctxMenu.visible && (
              <div
                className="fixed z-50 bg-popover border rounded-lg shadow-lg py-1 min-w-[180px]"
                style={{ left: ctxMenu.x, top: ctxMenu.y }}
                onClick={e => e.stopPropagation()}
              >
                <button
                  className="w-full px-3 py-2 text-sm text-left hover:bg-accent flex items-center gap-2"
                  onClick={() => addOverlayFromMenu('stamp')}
                >
                  <Stamp className="w-4 h-4" /> Добавить печать
                </button>
                <button
                  className="w-full px-3 py-2 text-sm text-left hover:bg-accent flex items-center gap-2"
                  onClick={() => addOverlayFromMenu('signature')}
                >
                  <PenTool className="w-4 h-4" /> Добавить подпись
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
