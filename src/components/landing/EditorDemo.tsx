import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Volume2, VolumeX, Heading1, AlignLeft, AlertTriangle, Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

interface DemoBlock {
  id: string;
  type: "heading1" | "paragraph" | "callout";
  content: string;
  isNew?: boolean;
}

const initialBlocks: DemoBlock[] = [
  { 
    id: "1", 
    type: "heading1", 
    content: "Охрана труда на производстве" 
  },
  { 
    id: "2", 
    type: "paragraph", 
    content: "Согласно Трудовому кодексу РФ, работодатель обязан обеспечить безопасные условия труда для всех сотрудников предприятия." 
  },
  { 
    id: "3", 
    type: "callout", 
    content: "Нарушение требований охраны труда влечёт за собой дисциплинарную, административную и уголовную ответственность." 
  },
];

const generatedContent: DemoBlock = {
  id: "4",
  type: "paragraph",
  content: "Каждый работник имеет право на рабочее место, соответствующее требованиям охраны труда, обязательное социальное страхование и получение достоверной информации об условиях труда.",
  isNew: true,
};

const blockIcons = {
  heading1: Heading1,
  paragraph: AlignLeft,
  callout: AlertTriangle,
};

const blockColors = {
  heading1: "text-primary",
  paragraph: "text-muted-foreground",
  callout: "text-amber-500",
};

const blockBgColors = {
  heading1: "bg-primary/5",
  paragraph: "bg-muted/30",
  callout: "bg-amber-500/10 border-l-2 border-amber-500",
};

export function EditorDemo() {
  const [blocks, setBlocks] = useState<DemoBlock[]>(initialBlocks);
  const [isGenerating, setIsGenerating] = useState(false);
  const [displayedText, setDisplayedText] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleGenerate = async () => {
    if (isGenerating) return;
    
    // Reset if already generated
    if (blocks.length > 3) {
      setBlocks(initialBlocks);
      setDisplayedText("");
      return;
    }

    setIsGenerating(true);
    setDisplayedText("");
    
    // Add empty block first
    const newBlock = { ...generatedContent, content: "" };
    setBlocks([...blocks, newBlock]);

    // Typewriter effect
    const text = generatedContent.content;
    for (let i = 0; i <= text.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 20));
      setDisplayedText(text.slice(0, i));
    }

    // Update block with full content
    setBlocks(prev => prev.map(b => 
      b.id === "4" ? { ...b, content: text } : b
    ));
    
    setIsGenerating(false);
  };

  const handleSpeak = async () => {
    setTtsError(null);

    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      return;
    }

    setIsLoading(true);

    try {
      const textToSpeak = blocks.map(b => b.content).join(". ");
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ 
            text: textToSpeak, 
            voiceId: "JBFqnCBsd6RMkjVDRZzb" 
          }),
        }
      );

      if (!response.ok) {
        // Edge function may return JSON error for non-2xx statuses
        const contentType = response.headers.get("Content-Type") || "";
        const isJson = contentType.includes("application/json");
        const errorPayload = isJson ? await response.json().catch(() => null) : null;
        const message =
          (errorPayload && typeof errorPayload.error === "string" && errorPayload.error) ||
          `Озвучка недоступна (HTTP ${response.status})`;

        setTtsError(message);
        return;
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      if (audioRef.current) {
        audioRef.current.pause();
      }
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };
      
      audio.onerror = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
      setIsPlaying(true);
    } catch (error) {
      console.error("TTS error:", error);
      setTtsError("Не удалось запустить озвучку. Попробуйте ещё раз.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="py-24 px-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background" />
      
      <div className="container mx-auto max-w-5xl relative z-10">
        <ScrollReveal>
          <div className="text-center mb-12">
            <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              Интерактивный редактор
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Создавайте курсы за минуты
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Блоковый редактор с AI-генерацией и профессиональной озвучкой
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.2}>
          <div className="relative">
            {/* Editor card */}
            <motion.div
              className="relative rounded-2xl border border-border/50 bg-card/80 backdrop-blur-xl shadow-2xl overflow-hidden"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {/* Editor header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-muted/30">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <span className="text-sm text-muted-foreground ml-2">
                  lesson-01.md
                </span>
              </div>

              {/* Editor content */}
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
                        transition={{ 
                          duration: 0.3,
                          delay: block.isNew ? 0 : index * 0.1 
                        }}
                        className={`
                          flex items-start gap-3 p-4 rounded-lg transition-all
                          ${blockBgColors[block.type]}
                          ${block.isNew ? "ring-2 ring-primary/50" : ""}
                        `}
                      >
                        <div className={`mt-0.5 ${blockColors[block.type]}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          {block.type === "heading1" ? (
                            <h3 className="text-xl font-semibold">
                              {block.content}
                            </h3>
                          ) : (
                            <p className={`${block.type === "callout" ? "text-amber-700 dark:text-amber-300" : "text-foreground/80"}`}>
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

              {/* Editor footer with actions */}
              <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-t border-border/50 bg-muted/20">
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  variant={blocks.length > 3 ? "outline" : "default"}
                  className="gap-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Генерация...
                    </>
                  ) : blocks.length > 3 ? (
                    <>
                      <Square className="w-4 h-4" />
                      Сбросить
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Сгенерировать абзац
                    </>
                  )}
                </Button>

                <Button
                  onClick={handleSpeak}
                  disabled={isLoading}
                  variant="outline"
                  className="gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Загрузка...
                    </>
                  ) : isPlaying ? (
                    <>
                      <VolumeX className="w-4 h-4" />
                      Остановить
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4" />
                      Озвучить урок
                    </>
                  )}
                </Button>

                <span className="text-xs text-muted-foreground ml-auto hidden sm:inline">
                  Нажмите на кнопки для демонстрации
                </span>
              </div>

              {ttsError && (
                <div className="px-6 pb-6">
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                    {ttsError}
                  </div>
                </div>
              )}
            </motion.div>

            {/* Decorative glow */}
            <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-transparent to-primary/20 blur-3xl -z-10 opacity-50" />
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
