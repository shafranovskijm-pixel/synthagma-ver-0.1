import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Volume2, VolumeX, Heading1, AlignLeft, AlertTriangle, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { FloatingParticles } from "./FloatingParticles";

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
  { 
    id: "1", 
    type: "heading1", 
    content: "Охрана труда на производстве" 
  },
  { 
    id: "2", 
    type: "paragraph", 
    content: "Согласно Трудовому кодексу Российской Федерации, работодатель обязан обеспечить безопасные условия труда для всех сотрудников предприятия." 
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
  isNew: true };

const blockIcons = {
  heading1: Heading1,
  paragraph: AlignLeft,
  callout: AlertTriangle };

const blockColors = {
  heading1: "text-primary",
  paragraph: "text-muted-foreground",
  callout: "text-amber-500" };

const blockBgColors = {
  heading1: "bg-primary/5",
  paragraph: "bg-muted/30",
  callout: "bg-amber-500/10 border-l-2 border-amber-500" };

export function EditorDemo() {
  const [blocks, setBlocks] = useState<DemoBlock[]>(initialBlocks);
  const [isGenerating, setIsGenerating] = useState(false);
  const [displayedText, setDisplayedText] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
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

  const handleSpeak = () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      return;
    }

    const audioUrl = blocks.length > 3 ? DEMO_AUDIO_4 : DEMO_AUDIO_3;

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.onended = () => setIsPlaying(false);
    audio.onerror = () => setIsPlaying(false);

    audio.play();
    setIsPlaying(true);
  };

  return (
    <section className="py-16 md:py-20 px-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background" />
      
      {/* Pattern overlay */}
      <div className="absolute inset-0 opacity-[0.01]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
        backgroundSize: '36px 36px'
      }} />

      {/* Decor: blur spots */}
      <div className="absolute top-[5%] right-[3%] w-80 h-80 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[5%] left-[5%] w-64 h-64 bg-accent/4 rounded-full blur-3xl pointer-events-none" />

      {/* Floating particles */}
      <FloatingParticles count={12} mode="dots" />
      
      {/* Decorative vertical lines */}
      <motion.div 
        className="absolute top-[10%] left-[8%] w-px h-32 bg-gradient-to-b from-transparent via-accent/25 to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5 }}
      />
      <motion.div 
        className="absolute top-[20%] right-[6%] w-px h-40 bg-gradient-to-b from-transparent via-accent/20 to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.2 }}
      />
      <motion.div 
        className="absolute bottom-[15%] left-[12%] w-px h-28 bg-gradient-to-b from-transparent via-border to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.3 }}
      />
      
      {/* Decorative horizontal lines */}
      <motion.div 
        className="absolute top-[30%] left-[5%] w-16 h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.4 }}
      />
      <motion.div 
        className="absolute bottom-[35%] right-[10%] w-20 h-px bg-gradient-to-r from-transparent via-accent/15 to-transparent"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.5 }}
      />
      
      {/* Decorative circles */}
      <motion.div
        className="absolute top-[25%] right-[15%] w-2 h-2 rounded-full border border-accent/25"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.6 }}
      />
      <motion.div
        className="absolute bottom-[20%] left-[18%] w-1.5 h-1.5 rounded-full bg-accent/30"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.7 }}
      />
      <motion.div
        className="absolute top-[60%] left-[5%] w-2.5 h-2.5 rounded-full border border-border"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.8 }}
      />
      
      {/* Corner decorations */}
      <motion.div
        className="absolute top-16 left-6 w-10 h-10 border-l border-t border-accent/15 rounded-tl-xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.9 }}
      />
      <motion.div
        className="absolute bottom-16 right-6 w-10 h-10 border-r border-b border-accent/15 rounded-br-xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 1 }}
      />
      
      {/* Floating diamond */}
      <motion.div
        className="absolute top-[45%] right-[8%] w-3 h-3 rotate-45 border border-accent/20"
        initial={{ opacity: 0, rotate: 0 }}
        whileInView={{ opacity: 1, rotate: 45 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 1.1 }}
      />
      
      <div className="container mx-auto max-w-5xl relative z-10">
        <ScrollReveal>
          <div className="text-center mb-12">
            <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              Интерактивный редактор
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Создавайте курсы за минуты</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Блоковый редактор с AI-генерацией и профессиональной озвучкой</p>
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
                      <SigmaSpinner size="sm" />
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
                  variant="outline"
                  className="gap-2"
                >
                  {isPlaying ? (
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
            </motion.div>

            {/* Decorative glow */}
            <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-transparent to-primary/20 blur-3xl -z-10 opacity-50" />
          </div>

          <p className="text-center text-sm text-muted-foreground mt-6">
            В настоящей демонстрации представлен алгоритм вместо реального ИИ. Полноценный ИИ будет доступен после регистрации.
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}
