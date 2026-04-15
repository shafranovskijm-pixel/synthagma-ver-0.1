import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Volume2, VolumeX, Heading1, AlignLeft, AlertTriangle, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

const DEMO_AUDIO_BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/demo-assets`;

interface DemoBlock {
  id: string;
  type: "heading1" | "paragraph" | "callout";
  content: string;
  isNew?: boolean;
}

interface CourseEditorDemoProps {
  title: string;
  fileName: string;
  initialBlocks: DemoBlock[];
  generatedBlock: DemoBlock;
  audioUrl?: string;
  accentColor?: string;
}

const blockIcons = {
  heading1: Heading1,
  paragraph: AlignLeft,
  callout: AlertTriangle };

const blockBgColors = {
  heading1: "bg-primary/5",
  paragraph: "bg-muted/30",
  callout: "bg-amber-500/10 border-l-2 border-amber-500" };

export function CourseEditorDemo({ title, fileName, initialBlocks, generatedBlock, audioUrl, accentColor = "text-primary" }: CourseEditorDemoProps) {
  const [blocks, setBlocks] = useState<DemoBlock[]>(initialBlocks);
  const [isGenerating, setIsGenerating] = useState(false);
  const [displayedText, setDisplayedText] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleGenerate = async () => {
    if (isGenerating) return;

    if (blocks.length > initialBlocks.length) {
      setBlocks(initialBlocks);
      setDisplayedText("");
      return;
    }

    setIsGenerating(true);
    setDisplayedText("");

    const newBlock = { ...generatedBlock, content: "" };
    setBlocks([...initialBlocks, newBlock]);

    const text = generatedBlock.content;
    for (let i = 0; i <= text.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 18));
      setDisplayedText(text.slice(0, i));
    }

    setBlocks(prev => prev.map(b =>
      b.id === generatedBlock.id ? { ...b, content: text } : b
    ));

    setIsGenerating(false);
  };

  const handleSpeak = () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      return;
    }

    const url = audioUrl || `${DEMO_AUDIO_BASE}/editor-demo-3blocks.mp3`;

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setIsPlaying(false);
    audio.onerror = () => setIsPlaying(false);
    audio.play();
    setIsPlaying(true);
  };

  return (
    <motion.div
      className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-xl shadow-xl overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/50 bg-muted/30">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
        </div>
        <span className="text-xs text-muted-foreground ml-2">{fileName}</span>
      </div>

      {/* Content */}
      <div className="p-4 space-y-2 min-h-[220px]">
        <AnimatePresence mode="popLayout">
          {blocks.map((block, index) => {
            const Icon = blockIcons[block.type];
            const isTyping = block.id === generatedBlock.id && isGenerating;

            return (
              <motion.div
                key={block.id}
                layout
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 15 }}
                transition={{ duration: 0.25, delay: block.isNew ? 0 : index * 0.08 }}
                className={`flex items-start gap-2.5 p-3 rounded-lg transition-all text-sm ${blockBgColors[block.type]} ${block.isNew ? "ring-2 ring-primary/50" : ""}`}
              >
                <div className="mt-0.5 text-muted-foreground">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  {block.type === "heading1" ? (
                    <h3 className="text-base font-semibold">{block.content}</h3>
                  ) : (
                    <p className={`${block.type === "callout" ? "text-amber-700 dark:text-amber-300" : "text-foreground/80"}`}>
                      {isTyping ? displayedText : block.content}
                      {isTyping && (
                        <motion.span
                          animate={{ opacity: [1, 0] }}
                          transition={{ duration: 0.5, repeat: Infinity }}
                          className="inline-block w-0.5 h-4 bg-primary ml-0.5 align-middle"
                        />
                      )}
                    </p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-border/50 bg-muted/20">
        <Button
          onClick={handleGenerate}
          disabled={isGenerating}
          variant={blocks.length > initialBlocks.length ? "outline" : "default"}
          size="sm"
          className="gap-1.5 text-xs"
        >
          {isGenerating ? (
            <>
              <SigmaSpinner size="xs" className=".5 .5" />
              Генерация...
            </>
          ) : blocks.length > initialBlocks.length ? (
            <>
              <Square className="w-3.5 h-3.5" />
              Сбросить
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              Сгенерировать
            </>
          )}
        </Button>

        <Button
          onClick={handleSpeak}
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
        >
          {isPlaying ? (
            <>
              <VolumeX className="w-3.5 h-3.5" />
              Стоп
            </>
          ) : (
            <>
              <Volume2 className="w-3.5 h-3.5" />
              Озвучить
            </>
          )}
        </Button>

        <span className="text-[10px] text-muted-foreground ml-auto hidden sm:inline">
          Демонстрация
        </span>
      </div>
    </motion.div>
  );
}
