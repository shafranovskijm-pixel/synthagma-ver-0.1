import { useRef, useEffect, useCallback } from "react";

interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
  twinklePhase: number;
  twinkleSpeed: number;
}

interface ShootingStar {
  x: number;
  y: number;
  length: number;
  speed: number;
  angle: number;
  opacity: number;
  life: number;
  maxLife: number;
}

interface Nebula {
  x: number;
  y: number;
  radius: number;
  color: [number, number, number];
  phaseX: number;
  phaseY: number;
  speedX: number;
  speedY: number;
}

export function StarfieldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);
  const isVisibleRef = useRef(false);
  const starsRef = useRef<Star[]>([]);
  const shootingStarsRef = useRef<ShootingStar[]>([]);
  const nebulaeRef = useRef<Nebula[]>([]);
  const timeRef = useRef(0);
  const lastShootingRef = useRef(0);

  const initStars = useCallback((w: number, h: number) => {
    const stars: Star[] = [];
    for (let i = 0; i < 180; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: 0.5 + Math.random() * 2,
        speed: 0.15 + Math.random() * 0.6,
        opacity: 0.3 + Math.random() * 0.7,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.5 + Math.random() * 2,
      });
    }
    starsRef.current = stars;

    nebulaeRef.current = [
      { x: w * 0.2, y: h * 0.3, radius: 180, color: [0, 200, 180], phaseX: 0, phaseY: 0.5, speedX: 0.3, speedY: 0.2 },
      { x: w * 0.7, y: h * 0.6, radius: 220, color: [100, 60, 220], phaseX: 1, phaseY: 0, speedX: 0.2, speedY: 0.35 },
      { x: w * 0.5, y: h * 0.15, radius: 150, color: [0, 180, 220], phaseX: 2, phaseY: 1.5, speedX: 0.25, speedY: 0.15 },
      { x: w * 0.85, y: h * 0.8, radius: 160, color: [50, 140, 200], phaseX: 0.5, phaseY: 2, speedX: 0.15, speedY: 0.3 },
    ];
  }, []);

  const spawnShootingStar = useCallback((w: number, h: number) => {
    shootingStarsRef.current.push({
      x: Math.random() * w,
      y: Math.random() * h * 0.5,
      length: 60 + Math.random() * 100,
      speed: 8 + Math.random() * 6,
      angle: Math.PI / 6 + Math.random() * 0.3,
      opacity: 1,
      life: 0,
      maxLife: 40 + Math.random() * 30,
    });
  }, []);

  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const t = timeRef.current;
    ctx.clearRect(0, 0, w, h);

    // Nebulae
    for (const n of nebulaeRef.current) {
      const nx = n.x + Math.sin(t * 0.001 * n.speedX + n.phaseX) * 60;
      const ny = n.y + Math.cos(t * 0.001 * n.speedY + n.phaseY) * 40;
      const grad = ctx.createRadialGradient(nx, ny, 0, nx, ny, n.radius);
      grad.addColorStop(0, `rgba(${n.color[0]},${n.color[1]},${n.color[2]},0.06)`);
      grad.addColorStop(0.5, `rgba(${n.color[0]},${n.color[1]},${n.color[2]},0.025)`);
      grad.addColorStop(1, `rgba(${n.color[0]},${n.color[1]},${n.color[2]},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(nx - n.radius, ny - n.radius, n.radius * 2, n.radius * 2);
    }

    // Stars
    for (const s of starsRef.current) {
      s.y -= s.speed;
      if (s.y < -5) { s.y = h + 5; s.x = Math.random() * w; }
      const twinkle = 0.5 + 0.5 * Math.sin(t * 0.003 * s.twinkleSpeed + s.twinklePhase);
      const alpha = s.opacity * twinkle;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(220,240,255,${alpha})`;
      ctx.fill();
      if (s.size > 1.5) {
        const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * 3);
        glow.addColorStop(0, `rgba(200,230,255,${alpha * 0.3})`);
        glow.addColorStop(1, `rgba(200,230,255,0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(s.x - s.size * 3, s.y - s.size * 3, s.size * 6, s.size * 6);
      }
    }

    // Shooting stars
    const alive: ShootingStar[] = [];
    for (const ss of shootingStarsRef.current) {
      ss.life++;
      ss.x += Math.cos(ss.angle) * ss.speed;
      ss.y += Math.sin(ss.angle) * ss.speed;
      const progress = ss.life / ss.maxLife;
      ss.opacity = progress < 0.3 ? progress / 0.3 : 1 - (progress - 0.3) / 0.7;
      if (ss.life < ss.maxLife) {
        const tailX = ss.x - Math.cos(ss.angle) * ss.length;
        const tailY = ss.y - Math.sin(ss.angle) * ss.length;
        const grad = ctx.createLinearGradient(tailX, tailY, ss.x, ss.y);
        grad.addColorStop(0, `rgba(180,220,255,0)`);
        grad.addColorStop(1, `rgba(220,240,255,${ss.opacity * 0.8})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(ss.x, ss.y);
        ctx.stroke();
        alive.push(ss);
      }
    }
    shootingStarsRef.current = alive;

    // Spawn shooting star
    if (t - lastShootingRef.current > 3000 + Math.random() * 2000) {
      spawnShootingStar(w, h);
      lastShootingRef.current = t;
    }
  }, [spawnShootingStar]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(dpr, dpr);
      initStars(rect.width, rect.height);
    };

    resize();
    window.addEventListener("resize", resize);

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisibleRef.current = entry.isIntersecting;
        if (entry.isIntersecting && !animationRef.current) loop();
      },
      { threshold: 0.05 }
    );
    observer.observe(container);

    const loop = () => {
      if (!isVisibleRef.current) { animationRef.current = 0; return; }
      timeRef.current += 16;
      const rect = container.getBoundingClientRect();
      draw(ctx, rect.width, rect.height);
      animationRef.current = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      window.removeEventListener("resize", resize);
      observer.disconnect();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [initStars, draw]);

  return (
    <div ref={containerRef} className="absolute inset-0 z-0">
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}
