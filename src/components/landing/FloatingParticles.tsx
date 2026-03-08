import { useEffect, useState, useRef, memo } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { BookOpen, GraduationCap, FileCheck, Shield, Award, Star, Sparkles } from "lucide-react";

const icons = [BookOpen, GraduationCap, FileCheck, Shield, Award, Star, Sparkles];

type ParticleStyle = 'filled' | 'outlined' | 'glow';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  icon: typeof BookOpen | null;
  delay: number;
  duration: number;
  opacity: number;
  style: ParticleStyle;
}

interface FloatingParticlesProps {
  count?: number;
  mode?: 'icons' | 'dots' | 'mixed';
  className?: string;
}

function generateParticles(count: number, mode: 'icons' | 'dots' | 'mixed'): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const useIcon = mode === 'icons' || (mode === 'mixed' && Math.random() > 0.6);
    const styles: ParticleStyle[] = ['filled', 'outlined', 'glow'];
    
    return {
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: useIcon ? 14 + Math.random() * 6 : 1 + Math.random() * 2,
      icon: useIcon ? icons[Math.floor(Math.random() * icons.length)] : null,
      delay: Math.random() * 2,
      duration: 4 + Math.random() * 4,
      opacity: useIcon ? 0.15 + Math.random() * 0.15 : 0.3 + Math.random() * 0.4,
      style: styles[Math.floor(Math.random() * styles.length)],
    };
  });
}

const ParticleElement = memo(function ParticleElement({
  particle,
  mouseX,
  mouseY,
  containerRef,
}: {
  particle: Particle;
  mouseX: ReturnType<typeof useSpring>;
  mouseY: ReturnType<typeof useSpring>;
  containerRef: React.RefObject<HTMLDivElement>;
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const unsubX = mouseX.on("change", (latestX) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const particleX = (particle.x / 100) * rect.width;
      const particleY = (particle.y / 100) * rect.height;
      
      const distX = latestX - rect.left - particleX;
      const distY = mouseY.get() - rect.top - particleY;
      const distance = Math.sqrt(distX * distX + distY * distY);
      const maxDistance = 150;
      
      if (distance < maxDistance) {
        const force = (1 - distance / maxDistance) * 25;
        setOffset({
          x: -(distX / distance) * force,
          y: -(distY / distance) * force,
        });
      } else {
        setOffset({ x: 0, y: 0 });
      }
    });

    return () => unsubX();
  }, [mouseX, mouseY, particle.x, particle.y, containerRef]);

  const Icon = particle.icon;

  const getDotStyle = () => {
    switch (particle.style) {
      case 'outlined':
        return "rounded-full border border-accent/50";
      case 'glow':
        return "rounded-full bg-accent shadow-[0_0_6px_hsl(var(--accent)/0.6)]";
      default:
        return "rounded-full bg-accent";
    }
  };

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        left: `${particle.x}%`,
        top: `${particle.y}%`,
      }}
      animate={{
        x: offset.x,
        y: [offset.y - 8, offset.y + 8, offset.y - 8],
        rotate: particle.icon ? [0, 3, -3, 0] : 0,
      }}
      transition={{
        y: {
          duration: particle.duration,
          repeat: Infinity,
          ease: "easeInOut",
          delay: particle.delay,
        },
        x: {
          type: "spring",
          stiffness: 120,
          damping: 18,
        },
        rotate: {
          duration: particle.duration * 1.5,
          repeat: Infinity,
          ease: "easeInOut",
        },
      }}
    >
      {Icon ? (
        <Icon
          className="text-accent drop-shadow-sm"
          style={{
            width: particle.size,
            height: particle.size,
            opacity: particle.opacity,
          }}
        />
      ) : (
        <div
          className={getDotStyle()}
          style={{
            width: particle.size,
            height: particle.size,
            opacity: particle.opacity,
          }}
        />
      )}
    </motion.div>
  );
});

export function FloatingParticles({ 
  count = 12, 
  mode = 'mixed',
  className = "" 
}: FloatingParticlesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [particles] = useState(() => generateParticles(count, mode));
  
  const mouseXRaw = useMotionValue(0);
  const mouseYRaw = useMotionValue(0);
  const mouseX = useSpring(mouseXRaw, { stiffness: 100, damping: 20 });
  const mouseY = useSpring(mouseYRaw, { stiffness: 100, damping: 20 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseXRaw.set(e.clientX);
      mouseYRaw.set(e.clientY);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseXRaw, mouseYRaw]);

  return (
    <div 
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
    >
      {particles.map((particle) => (
        <ParticleElement
          key={particle.id}
          particle={particle}
          mouseX={mouseX}
          mouseY={mouseY}
          containerRef={containerRef}
        />
      ))}
    </div>
  );
}
