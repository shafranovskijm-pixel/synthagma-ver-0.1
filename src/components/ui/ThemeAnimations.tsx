import { useMemo } from "react";
import { motion } from "framer-motion";

function LeavesAnimation() {
  const leaves = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: Math.random() * 8,
      duration: 6 + Math.random() * 6,
      size: 14 + Math.random() * 10,
      drift: (Math.random() - 0.5) * 80,
    })), []);
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {leaves.map(l => (
        <motion.div
          key={l.id}
          className="absolute -top-8 select-none"
          style={{ left: l.left, fontSize: l.size }}
          animate={{ y: ["0vh", "105vh"], x: [0, l.drift], rotate: [0, 360] }}
          transition={{ duration: l.duration, delay: l.delay, repeat: Infinity, ease: "linear" }}
        >
          🍃
        </motion.div>
      ))}
    </div>
  );
}

function FadeAnimation() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0">
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3"
        animate={{ opacity: [0.3, 0.7, 0.3] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function LightsAnimation() {
  const dots = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      delay: Math.random() * 4,
      duration: 2 + Math.random() * 3,
      size: 2 + Math.random() * 3,
    })), []);
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {dots.map(d => (
        <motion.div
          key={d.id}
          className="absolute rounded-full bg-amber-300"
          style={{ left: d.left, top: d.top, width: d.size, height: d.size }}
          animate={{ opacity: [0, 0.8, 0], scale: [0.8, 1.2, 0.8] }}
          transition={{ duration: d.duration, delay: d.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

function GradientAnimation() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      <motion.div
        className="absolute w-96 h-96 rounded-full bg-primary/10 blur-3xl"
        animate={{ x: [-100, 200, -100], y: [-50, 150, -50] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        style={{ top: "20%", left: "30%" }}
      />
    </div>
  );
}

function GlowAnimation() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      <motion.div
        className="absolute w-64 h-64 rounded-full bg-violet-400/15 blur-3xl"
        animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        style={{ top: "30%", left: "20%" }}
      />
      <motion.div
        className="absolute w-48 h-48 rounded-full bg-purple-400/10 blur-3xl"
        animate={{ scale: [1.2, 0.9, 1.2], opacity: [0.2, 0.5, 0.2] }}
        transition={{ duration: 7, delay: 2, repeat: Infinity, ease: "easeInOut" }}
        style={{ bottom: "20%", right: "25%" }}
      />
    </div>
  );
}

function ParticlesAnimation() {
  const particles = useMemo(() =>
    Array.from({ length: 45 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      delay: Math.random() * 6,
      duration: 3 + Math.random() * 4,
      size: i < 10 ? 3 + Math.random() * 3 : i < 25 ? 1.5 + Math.random() * 2 : 0.5 + Math.random() * 1.5,
      opacity: i < 10 ? 0.4 : i < 25 ? 0.3 : 0.2,
    })), []);
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {particles.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-teal-300"
          style={{ left: p.left, top: p.top, width: p.size, height: p.size }}
          animate={{
            opacity: [0, p.opacity, 0],
            y: [0, -20 - Math.random() * 30],
            x: [(Math.random() - 0.5) * 20],
          }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

function SandAnimation() {
  const grains = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: Math.random() * 8,
      duration: 5 + Math.random() * 5,
      size: 1.5 + Math.random() * 2.5,
      drift: 30 + Math.random() * 60,
    })), []);
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {grains.map(g => (
        <motion.div
          key={g.id}
          className="absolute -top-4 rounded-full bg-amber-600/30"
          style={{ left: g.left, width: g.size, height: g.size }}
          animate={{ y: ["0vh", "105vh"], x: [0, g.drift] }}
          transition={{ duration: g.duration, delay: g.delay, repeat: Infinity, ease: "linear" }}
        />
      ))}
    </div>
  );
}

interface ThemeAnimationsProps {
  animation: string;
}

export function ThemeAnimations({ animation }: ThemeAnimationsProps) {
  switch (animation) {
    case "leaves": return <LeavesAnimation />;
    case "fade": return <FadeAnimation />;
    case "lights": return <LightsAnimation />;
    case "gradient": return <GradientAnimation />;
    case "glow": return <GlowAnimation />;
    case "particles": return <ParticlesAnimation />;
    case "sand": return <SandAnimation />;
    default: return null;
  }
}
