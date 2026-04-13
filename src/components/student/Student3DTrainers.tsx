import { Box, Rotate3d, Cpu, FlaskConical } from "lucide-react";

export function Student3DTrainers() {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-card via-card to-primary/5 p-8 md:p-12">
      {/* Decorative blurs */}
      <div className="absolute top-8 right-10 w-40 h-40 rounded-full bg-primary/5 blur-3xl" />
      <div className="absolute bottom-6 left-6 w-28 h-28 rounded-full bg-primary/10 blur-2xl" />

      <div className="relative flex flex-col md:flex-row items-center gap-8">
        {/* 3D Cube illustration */}
        <div className="flex-shrink-0">
          <div className="relative w-40 h-40 flex items-center justify-center" style={{ perspective: "400px" }}>
            <div
              className="w-24 h-24 border-2 border-primary/30 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 backdrop-blur-sm flex items-center justify-center"
              style={{
                transform: "rotateX(-15deg) rotateY(25deg)",
                boxShadow: "8px 12px 24px hsl(var(--primary) / 0.1)",
              }}
            >
              <Box className="w-10 h-10 text-primary" />
            </div>
            {/* Orbiting dots */}
            <div className="absolute inset-0 animate-[spin_12s_linear_infinite]">
              <div className="absolute top-2 left-1/2 w-2 h-2 rounded-full bg-primary/40" />
            </div>
            <div className="absolute inset-0 animate-[spin_18s_linear_infinite_reverse]">
              <div className="absolute bottom-4 right-4 w-1.5 h-1.5 rounded-full bg-primary/30" />
            </div>
          </div>
        </div>

        {/* Text content */}
        <div className="text-center md:text-left space-y-3 max-w-md">
          <h3 className="text-xl font-semibold text-foreground">3D-тренажёры в разработке</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Скоро здесь появятся интерактивные 3D-симуляции и виртуальные лаборатории
            для практического обучения. Погружайтесь в материал через реалистичные тренажёры.
          </p>

          <div className="grid grid-cols-3 gap-3 pt-2">
            {[
              { icon: Rotate3d, label: "Симуляции" },
              { icon: FlaskConical, label: "Лаборатории" },
              { icon: Cpu, label: "Практика" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-primary/5">
                <Icon className="w-5 h-5 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
