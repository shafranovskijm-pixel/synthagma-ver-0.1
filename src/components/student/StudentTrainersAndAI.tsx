import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Mic, Clock, ArrowRight, Zap } from "lucide-react";
import { Student3DTrainers } from "./Student3DTrainers";

export function StudentTrainersAndAI() {
  const navigate = useNavigate();

  return (
    <div className="space-y-8">
      {/* AI Tutor promo card */}
      <Card className="overflow-hidden border-0 shadow-lg">
        <div className="bg-gradient-to-br from-primary/90 via-primary to-accent p-6 md:p-8 text-primary-foreground">
          <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
              <Sparkles className="w-7 h-7" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <h2 className="text-xl md:text-2xl font-bold">ИИ-преподаватель</h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-medium uppercase tracking-wide">
                  <Zap className="w-3 h-3" /> Бета
                </span>
              </div>
              <p className="text-primary-foreground/85 text-sm leading-relaxed">
                Голосовая беседа с ИИ-наставником. Задайте тему — и получите ответы вживую,
                как с настоящим преподавателем.
              </p>
              <div className="flex flex-wrap gap-3 mt-3 text-xs text-primary-foreground/80">
                <span className="inline-flex items-center gap-1"><Mic className="w-3.5 h-3.5" /> Голосом</span>
                <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> 25 минут на сессию</span>
              </div>
            </div>
            <Button
              size="lg"
              variant="secondary"
              className="shrink-0 bg-white text-primary hover:bg-white/90"
              onClick={() => navigate("/ai-tutor")}
            >
              Попробовать
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Existing 3D trainers */}
      <Student3DTrainers />
    </div>
  );
}
