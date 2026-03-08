import { useEffect, useState, useRef, memo } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { BookOpen, GraduationCap, FileCheck, Shield, Award, Star, Sparkles } from "lucide-react";

const icons = [BookOpen, GraduationCap, FileCheck, Shield, Award, Star, Sparkles];

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  icon: typeof BookOpen | null;
  delay: number;
  duration: number;
  opacity: number;
}

interface FloatingParticlesProps {
  count?: number;
  withIcons?: boolean;
  className?: string;
}

function generateParticles(count: number, withIcons: boolean): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: withIcons ? 16 + Math.random() * 8 : 2 + Math.random() * 4,
    icon: withIcons && Math.random() > 0.5 ? icons[Math.floor(Math.random() * icons.length)] : null,
    delay: Math.random() * 2,
    duration: 3 + Math.random() * 4,
    opacity: 0.1 + Math.random() * 0.2,
  }));
}

const Particle = memo(function Particle({
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
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const particleX = (particle.x / 100) * rect.width;
      const particleY = (particle.y / 100) * rect.height;
      
      const distX = latestX - rect.left - particleX;
      const distY = mouseY.get() - rect.top - particleY;
      const distance = Math.sqrt(distX * distX + distY * distY);
      const maxDistance = 200;
      
      if (distance < maxDistance) {
        const force = (1 - distance / maxDistance) * 30;
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

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        left: `${particle.x}%`,
        top: `${particle.y}%`,
      }}
      animate={{
        x: offset.x,
        y: [offset.y - 10, offset.y + 10, offset.y - 10],
        rotate: particle.icon ? [0, 5, -5, 0] : 0,
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
          stiffness: 100,
          damping: 15,
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
          className="text-accent"
          style={{
            width: particle.size,
            height: particle.size,
            opacity: particle.opacity,
          }}
        />
      ) : (
        <div
          className="rounded-full bg-accent"
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
  withIcons = true,
  className = "" 
}: FloatingParticlesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [particles] = useState(() => generateParticles(count, withIcons));
  
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
        <Particle
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
