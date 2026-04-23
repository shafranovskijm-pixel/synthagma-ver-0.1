import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Volume2, VolumeX, Heading1, AlignLeft, AlertTriangle, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

const DEMO_AUDIO_BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/demo-assets`;
const DEMO_AUDIO_3 = `${DEMO_AUDIO_BASE}/editor-demo-3blocks.mp3`;
const DEMO_AUDIO_4 = `${DEMO_AUDIO_BASE}/editor-demo-4blocks.mp3`;

interface DemoBlock {
  id: string;
  type: "heading1" | "paragraph" | "callout";
  content: string;
  isNew?: boolean;
}

const initialBlocks: DemoBlock[] = [
  { id: "1", type: "heading1", content: "Охрана труда на производстве" },
  { id: "2", type: "paragraph", content: "Согласно Трудовому кодексу Российской Федерации, работодатель обязан обеспечить безопасные условия труда для всех сотрудников предприятия." },
  { id: "3", type: "callout", content: "Нарушение требований охраны труда влечёт за собой дисциплинарную, административную и уголовную ответственность." },
];

const generatedContent: DemoBlock = {
  id: "4",
  type: "paragraph",
  content: "Каждый работник имеет право на рабочее место, соответствующее требованиям охраны труда, обязательное социальное страхование и получение достоверной информации об условиях труда.",
  isNew: true,
};

const blockIcons = { heading1: Heading1, paragraph: AlignLeft, callout: AlertTriangle };
const blockColors = { heading1: "text-primary", paragraph: "text-muted-foreground", callout: "text-amber-500" };
const blockBgColors = {
  heading1: "bg-primary/5",
  paragraph: "bg-muted/30",
  callout: "bg-amber-500/10 border-l-2 border-amber-500",
};

/**
 * Pure interactive editor card — extracted from EditorDemo so it can
 * be reused both inside the landing slider and on standalone pages
 * without duplicating heading/section markup.
 */
export function EditorDemoCard() {
  const [blocks, setBlocks] = useState<DemoBlock[]>(initialBlocks);
  const [isGenerating, setIsGenerating] = useState(false);
  const [displayedText, setDisplayedText] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleGenerate = async () => {
    if (isGenerating) return;
    if (blocks.length > 3) {
      setBlocks(initialBlocks);
      setDisplayedText("");
      return;
    }
    setIsGenerating(true);
    setDisplayedText("");
    const newBlock = { ...generatedContent, content: "" };
    setBlocks([...blocks, newBlock]);
    const text = generatedContent.content;
    for (let i = 0; i <= text.length; i++) {
      await new Promise((r) => setTimeout(r, 20));
      setDisplayedText(text.slice(0, i));
    }
    setBlocks((prev) => prev.map((b) => (b.id === "4" ? { ...b, content: text } : b)));
    setIsGenerating(false);
  };

  const handleSpeak = () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      return;
    }
    const audioUrl = blocks.length > 3 ? DEMO_AUDIO_4 : DEMO_AUDIO_3;
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.onended = () => setIsPlaying(false);
    audio.onerror = () => setIsPlaying(false);
    audio.play();
    setIsPlaying(true);
  };

  return (
    <div className="relative max-w-4xl mx-auto">
      <motion.div
        className="relative rounded-2xl border border-border/50 bg-card/80 backdrop-blur-xl shadow-2xl overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-muted/30">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <span className="text-sm text-muted-foreground ml-2">lesson-01.md</span>
        </div>

        <div className="p-6 space-y-3 min-h-[320px]">
          <AnimatePresence mode="popLayout">
            {blocks.map((block, index) => {
              const Icon = blockIcons[block.type];
              const isTyping = block.id === "4" && isGenerating;
              return (
                <motion.div
                  key={block.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3, delay: block.isNew ? 0 : index * 0.1 }}
                  className={`flex items-start gap-3 p-4 rounded-lg transition-all ${blockBgColors[block.type]} ${block.isNew ? "ring-2 ring-primary/50" : ""}`}
                >
                  <div className={`mt-0.5 ${blockColors[block.type]}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    {block.type === "heading1" ? (
                      <h3 className="text-xl font-semibold">{block.content}</h3>
                    ) : (
                      <p className={block.type === "callout" ? "text-amber-700 dark:text-amber-300" : "text-foreground/80"}>
                        {isTyping ? displayedText : block.content}
                        {isTyping && (
                          <motion.span
                            animate={{ opacity: [1, 0] }}
                            transition={{ duration: 0.5, repeat: Infinity }}
                            className="inline-block w-0.5 h-5 bg-primary ml-0.5 align-middle"
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

        <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-t border-border/50 bg-muted/20">
          <Button onClick={handleGenerate} disabled={isGenerating} variant={blocks.length > 3 ? "outline" : "default"} className="gap-2">
            {isGenerating ? (
              <><SigmaSpinner size="sm" />Генерация...</>
            ) : blocks.length > 3 ? (
              <><Square className="w-4 h-4" />Сбросить</>
            ) : (
              <><Sparkles className="w-4 h-4" />Сгенерировать абзац</>
            )}
          </Button>
          <Button onClick={handleSpeak} variant="outline" className="gap-2">
            {isPlaying ? (<><VolumeX className="w-4 h-4" />Остановить</>) : (<><Volume2 className="w-4 h-4" />Озвучить урок</>)}
          </Button>
          <span className="text-xs text-muted-foreground ml-auto hidden sm:inline">
            Нажмите на кнопки для демонстрации
          </span>
        </div>
      </motion.div>

      <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-transparent to-primary/20 blur-3xl -z-10 opacity-50" />

      <p className="text-center text-sm text-muted-foreground mt-6">
        В настоящей демонстрации представлен алгоритм вместо реального ИИ. Полноценный ИИ будет доступен после регистрации.
      </p>
    </div>
  );
}
