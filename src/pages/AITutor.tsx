import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Sparkles, Mic, Clock, Brain, Zap } from "lucide-react";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

const AITutor = () => {
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const [starting, setStarting] = useState(false);

  const handleStart = async () => {
    setStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke("livekit-ai-tutor-start", {
        body: { topic: topic.trim() || null },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok || !data?.sessionId) throw new Error(data?.error || "Ошибка");

      toast.success(
        `Сессия запущена. Осталось в этом месяце: ${data.remainingMinutesThisMonth} мин.`,
      );
      navigate(`/webinar/ai-tutor/live?sessionId=${data.sessionId}`);
    } catch (e) {
      toast.error((e as Error).message || "Не удалось начать сессию");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Назад
        </Button>

        <Card className="overflow-hidden border-0 shadow-lg">
          <div className="bg-gradient-to-br from-primary/90 via-primary to-accent p-8 text-primary-foreground">
            <div className="flex items-center gap-4 mb-3">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                <Sparkles className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">ИИ-преподаватель</h1>
                <p className="text-primary-foreground/80 text-sm mt-1">
                  Голосовая беседа с ИИ-наставником — задайте тему и получите ответы вживую
                </p>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-xs font-medium">
              <Zap className="w-3 h-3" /> Бета — голосовой ИИ скоро. Сейчас доступен пустой кабинет для теста.
            </div>
          </div>

          <div className="p-8 space-y-6">
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { icon: Mic, title: "Голосом", desc: "Говорите естественно, как с человеком" },
                { icon: Clock, title: "25 минут", desc: "Одна сессия — один вопрос или тема" },
                { icon: Brain, title: "По теме", desc: "ИИ помнит контекст всей сессии" },
              ].map((f, i) => (
                <div key={i} className="p-4 rounded-xl bg-muted/40 border">
                  <f.icon className="w-5 h-5 text-primary mb-2" />
                  <div className="font-medium text-sm">{f.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{f.desc}</div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="topic">О чём поговорим? (необязательно)</Label>
              <Textarea
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Например: «Помоги разобраться с правилами охраны труда при работе на высоте»"
                rows={3}
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">{topic.length}/200</p>
            </div>

            <Button
              size="lg"
              className="w-full"
              onClick={handleStart}
              disabled={starting}
            >
              {starting ? (
                <SigmaSpinner size="sm" className="mr-2" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Начать 25-минутную сессию
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Бесплатный лимит: 1000 минут на организацию в месяц.
              По окончании сессии вы вернётесь сюда.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AITutor;
