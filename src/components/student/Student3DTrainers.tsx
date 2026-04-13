import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { ArrowUp, ArrowDown, RotateCcw, RotateCw, ChevronsUp, RefreshCw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";

const MazeGame = lazy(() => import("./MazeGame"));

export function Student3DTrainers() {
  const [won, setWon] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const onForward = useRef<(() => void) | null>(null);
  const onBackward = useRef<(() => void) | null>(null);
  const onRotLeft = useRef<(() => void) | null>(null);
  const onRotRight = useRef<(() => void) | null>(null);
  const onJump = useRef<(() => void) | null>(null);
  const onForwardEnd = useRef<(() => void) | null>(null);
  const onBackwardEnd = useRef<(() => void) | null>(null);
  const onRotLeftEnd = useRef<(() => void) | null>(null);
  const onRotRightEnd = useRef<(() => void) | null>(null);
  const onJumpEnd = useRef<(() => void) | null>(null);

  const handleWin = useCallback(() => setWon(true), []);
  const handleReset = useCallback(() => {
    setWon(false);
    setResetKey((k) => k + 1);
  }, []);

  const btnClass =
    "w-12 h-12 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20 flex items-center justify-center select-none touch-none";

  const onDown = (ref: React.MutableRefObject<(() => void) | null>) => () => ref.current?.();
  const onUp = (ref: React.MutableRefObject<(() => void) | null>) => () => ref.current?.();

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div>
          <h3 className="text-sm font-semibold text-foreground">🎮 3D-Лабиринт</h3>
          <p className="text-xs text-muted-foreground">
            3D-тренажёры скоро — а пока попробуйте пройти лабиринт!
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1.5 text-xs">
          <RefreshCw className="w-3.5 h-3.5" />
          Заново
        </Button>
      </div>

      {/* Game canvas */}
      <div className="relative w-full" style={{ height: "400px" }}>
        <Suspense
          fallback={
            <div className="w-full h-full flex items-center justify-center bg-muted/50 text-muted-foreground text-sm">
              Загрузка 3D…
            </div>
          }
        >
          <MazeGame
            onForward={onForward}
            onBackward={onBackward}
            onRotLeft={onRotLeft}
            onRotRight={onRotRight}
            onJump={onJump}
            onForwardEnd={onForwardEnd}
            onBackwardEnd={onBackwardEnd}
            onRotLeftEnd={onRotLeftEnd}
            onRotRightEnd={onRotRightEnd}
            onJumpEnd={onJumpEnd}
            onWin={handleWin}
            resetKey={resetKey}
          />
        </Suspense>

        {/* Win overlay */}
        {won && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-10 gap-4">
            <Trophy className="w-14 h-14 text-yellow-400" />
            <h3 className="text-xl font-bold text-foreground">Поздравляем! 🎉</h3>
            <p className="text-sm text-muted-foreground">Вы прошли лабиринт!</p>
            <Button onClick={handleReset} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Начать заново
            </Button>
          </div>
        )}
      </div>

      {/* On-screen controls */}
      <div className="flex items-center justify-center gap-6 px-4 py-3 border-t bg-muted/20">
        {/* Rotation left */}
        <button
          className={btnClass}
          onPointerDown={onDown(onRotLeft)}
          onPointerUp={onUp(onRotLeftEnd)}
          onPointerLeave={onUp(onRotLeftEnd)}
          aria-label="Повернуть влево"
        >
          <RotateCcw className="w-5 h-5" />
        </button>

        {/* Forward / Backward column */}
        <div className="flex flex-col items-center gap-1.5">
          <button
            className={btnClass}
            onPointerDown={onDown(onForward)}
            onPointerUp={onUp(onForwardEnd)}
            onPointerLeave={onUp(onForwardEnd)}
            aria-label="Вперёд"
          >
            <ArrowUp className="w-5 h-5" />
          </button>
          <button
            className={btnClass}
            onPointerDown={onDown(onBackward)}
            onPointerUp={onUp(onBackwardEnd)}
            onPointerLeave={onUp(onBackwardEnd)}
            aria-label="Назад"
          >
            <ArrowDown className="w-5 h-5" />
          </button>
        </div>

        {/* Rotation right */}
        <button
          className={btnClass}
          onPointerDown={onDown(onRotRight)}
          onPointerUp={onUp(onRotRightEnd)}
          onPointerLeave={onUp(onRotRightEnd)}
          aria-label="Повернуть вправо"
        >
          <RotateCw className="w-5 h-5" />
        </button>

        {/* Jump */}
        <button
          className={btnClass}
          onPointerDown={onDown(onJump)}
          onPointerUp={onUp(onJumpEnd)}
          onPointerLeave={onUp(onJumpEnd)}
          aria-label="Прыжок"
        >
          <ChevronsUp className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 py-2 text-center text-[11px] text-muted-foreground border-t">
        Управление: WASD / стрелки • мышь для обзора • пробел — прыжок
      </div>
    </div>
  );
}
