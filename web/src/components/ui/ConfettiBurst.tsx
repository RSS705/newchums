"use client";

import { useEffect, useRef } from "react";

/** One-shot confetti burst rendered on a full-viewport canvas overlay.
 *
 *  Mounts, bursts, and goes quiet on its own (~2.5s); the parent just
 *  mounts it when the celebration moment happens. No dependencies, no
 *  pointer capture (clicks pass straight through), and it renders nothing
 *  at all when the user prefers reduced motion.
 */
export default function ConfettiBurst() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const COLORS = ["#F97316", "#FACC15", "#FB923C", "#FDE68A", "#16A34A", "#3B82F6", "#EC4899"];
    type Particle = {
      x: number; y: number; vx: number; vy: number;
      size: number; color: string; rot: number; vrot: number; shape: 0 | 1;
    };
    const particles: Particle[] = [];
    // Two cannons near the bottom corners firing up and inward reads as a
    // celebration on both phone and desktop without covering the dialog text.
    const cannons = [
      { x: w * 0.12, y: h * 0.85, dir: -Math.PI / 3 },
      { x: w * 0.88, y: h * 0.85, dir: (-2 * Math.PI) / 3 },
    ];
    for (const c of cannons) {
      for (let i = 0; i < 70; i++) {
        const angle = c.dir + (Math.random() - 0.5) * 0.9;
        const speed = 8 + Math.random() * 9;
        particles.push({
          x: c.x,
          y: c.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 5 + Math.random() * 5,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          rot: Math.random() * Math.PI,
          vrot: (Math.random() - 0.5) * 0.3,
          shape: Math.random() < 0.5 ? 0 : 1,
        });
      }
    }

    const start = performance.now();
    const DURATION = 2500;
    let raf = 0;
    const tick = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      if (t >= DURATION) return;
      const fade = t > DURATION - 600 ? (DURATION - t) / 600 : 1;
      for (const p of particles) {
        p.vy += 0.16; // gravity
        p.vx *= 0.992;
        p.vy *= 0.992;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === 0) {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        // Above the MUI dialog (~1300) and its backdrop so the burst is
        // visible over the celebration dialog itself.
        zIndex: 1450,
      }}
    />
  );
}
