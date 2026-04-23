import { lazy, Suspense, useCallback, useRef, useState, useEffect } from "react";
import { ArrowUp, ArrowDown, RotateCcw, RotateCw, ChevronsUp, RefreshCw, Trophy, Maximize, Minimize, Skull, Crosshair, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MazeHUD } from "./MazeHUD";
import { setMuted, isMuted, playBGMusic, stopBGMusic } from "./MazeSounds";
import { resetGameState, gameState } from "./mazeGameConfig";

const MazeGame = lazy(() => import("./MazeGame"));

export function Student3DTrainers() {
  const [won, setWon] = useState(false);
  const [dead, setDead] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [health, setHealth] = useState(3);
  const [kills, setKills] = useState(0);
  const [weapon, setWeapon] = useState(1);
  const [muted, setMutedState] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Sync weapon to gameState
  useEffect(() => { gameState.weapon = weapon; }, [weapon]);

  // Start BG music when game starts
  useEffect(() => {
    if (gameStarted && !muted) playBGMusic();
    return () => stopBGMusic();
  }, [gameStarted, muted]);

  const handleWin = useCallback(() => { setWon(true); stopBGMusic(); }, []);
  const handleDamage = useCallback(() => setHealth(gameState.health), []);
  const handleKill = useCallback(() => setKills(gameState.kills), []);
  const handleGameOver = useCallback(() => { setDead(true); stopBGMusic(); }, []);
  const handleShootAnim = useCallback(() => {
    setShooting(true);
    setTimeout(() => setShooting(false), 150);
  }, []);

  const handleReset = useCallback(() => {
    resetGameState();
    setWon(false);
    setDead(false);
    setHealth(3);
    setKills(0);
    setResetKey((k) => k + 1);
    if (!isMuted()) playBGMusic();
  }, []);

  const toggleMute = useCallback(() => {
    const next = !isMuted();
    setMuted(next);
    setMutedState(next);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  const handleWeaponKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "1") setWeapon(0);
    if (e.key === "2") setWeapon(1);
    if (e.key === "3") setWeapon(2);
  }, []);

  const handleStartGame = useCallback(() => {
    setGameStarted(true);
  }, []);

  const btnClass =
    "w-12 h-12 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20 flex items-center justify-center select-none touch-none";

  const onDown = (ref: React.MutableRefObject<(() => void) | null>) => () => ref.current?.();
  const onUp = (ref: React.MutableRefObject<(() => void) | null>) => () => ref.current?.();

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-2xl border bg-card"
      onKeyDown={handleWeaponKey}
      tabIndex={0}
    >
      {/* Coming soon banner */}
      <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 border-b px-4 py-3 text-center">
        <p className="text-sm font-medium text-foreground">
          🚀 Скоро здесь будут 3D-тренажёры! А пока — сыграйте в <span className="font-bold text-primary">DOOM-лабиринт</span> 🎮
        </p>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div>
          <h3 className="text-sm font-semibold text-foreground">🎮 DOOM-Лабиринт</h3>
          <p className="text-xs text-muted-foreground">
            Убейте монстров и найдите выход!
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={toggleFullscreen} className="gap-1.5 text-xs">
            {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" />
            Заново
          </Button>
        </div>
      </div>

      {/* Game canvas + HUD */}
      <div className="relative w-full" style={{ height: isFullscreen ? "calc(100vh - 100px)" : "450px" }}>
        {!gameStarted ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-red-950 to-black gap-6">
            <Gamepad2 className="w-16 h-16 text-red-500 animate-pulse" />
            <h2 className="text-2xl font-bold text-red-400 tracking-wider">DOOM-ЛАБИРИНТ</h2>
            <p className="text-sm text-red-300/70 max-w-sm text-center">
              Пройдите лабиринт, уничтожьте всех монстров и найдите выход!
            </p>
            <Button onClick={handleStartGame} size="lg" className="gap-2 bg-red-600 hover:bg-red-700 text-white">
              <Gamepad2 className="w-5 h-5" />
              Начать игру
            </Button>
          </div>
        ) : (
          <>
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
                onDamage={handleDamage}
                onKill={handleKill}
                onGameOver={handleGameOver}
                onShootAnim={handleShootAnim}
                resetKey={resetKey}
              />
            </Suspense>

            <MazeHUD
              health={health}
              maxHealth={3}
              kills={kills}
              weapon={weapon}
              onWeaponChange={setWeapon}
              muted={muted}
              onToggleMute={toggleMute}
              shooting={shooting}
            />

            {won && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-20 gap-4">
                <Trophy className="w-14 h-14 text-yellow-400" />
                <h3 className="text-xl font-bold text-foreground">Поздравляем! 🎉</h3>
                <p className="text-sm text-muted-foreground">Вы прошли лабиринт! Убито монстров: {kills}</p>
                <Button onClick={handleReset} className="gap-2">
                  <RefreshCw className="w-4 h-4" /> Начать заново
                </Button>
              </div>
            )}

            {dead && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/80 backdrop-blur-sm z-20 gap-4">
                <Skull className="w-14 h-14 text-red-400" />
                <h3 className="text-xl font-bold text-red-200">Вы погибли! 💀</h3>
                <p className="text-sm text-red-300">Монстры оказались сильнее… Убито: {kills}</p>
                <Button onClick={handleReset} variant="destructive" className="gap-2">
                  <RefreshCw className="w-4 h-4" /> Попробовать снова
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* On-screen controls */}
      {!isFullscreen && gameStarted && (
        <div className="flex items-center justify-center gap-6 px-4 py-3 border-t bg-muted/20">
          <button className={btnClass} onPointerDown={onDown(onRotLeft)} onPointerUp={onUp(onRotLeftEnd)} onPointerLeave={onUp(onRotLeftEnd)} aria-label="Повернуть влево">
            <RotateCcw className="w-5 h-5" />
          </button>
          <div className="flex flex-col items-center gap-1.5">
            <button className={btnClass} onPointerDown={onDown(onForward)} onPointerUp={onUp(onForwardEnd)} onPointerLeave={onUp(onForwardEnd)} aria-label="Вперёд">
              <ArrowUp className="w-5 h-5" />
            </button>
            <button className={btnClass} onPointerDown={onDown(onBackward)} onPointerUp={onUp(onBackwardEnd)} onPointerLeave={onUp(onBackwardEnd)} aria-label="Назад">
              <ArrowDown className="w-5 h-5" />
            </button>
          </div>
          <button className={btnClass} onPointerDown={onDown(onRotRight)} onPointerUp={onUp(onRotRightEnd)} onPointerLeave={onUp(onRotRightEnd)} aria-label="Повернуть вправо">
            <RotateCw className="w-5 h-5" />
          </button>
          <button className={btnClass} onPointerDown={onDown(onJump)} onPointerUp={onUp(onJumpEnd)} onPointerLeave={onUp(onJumpEnd)} aria-label="Прыжок">
            <ChevronsUp className="w-5 h-5" />
          </button>
          <button className={`${btnClass} bg-destructive/20 hover:bg-destructive/30 text-destructive border-destructive/20`}
            onPointerDown={() => { gameState.shooting = true; import("./MazeSounds").then(s => s.playShoot(weapon)); handleShootAnim(); }}
            aria-label="Стрелять">
            <Crosshair className="w-5 h-5" />
          </button>
        </div>
      )}

      {gameStarted && (
        <div className="px-4 py-2 text-center text-[11px] text-muted-foreground border-t">
          WASD — движение • мышь — обзор + стрельба • F — стрельба • пробел — прыжок • 1-2-3 — оружие
        </div>
      )}
    </div>
  );
}
