// ConfettiOverlay.tsx
import React, {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    useImperativeHandle,
    forwardRef,
  } from 'react';
  import { createPortal } from 'react-dom';
  
  type ConfettiOverlayProps = {
    /** Запустить анимацию (если без ref) */
    active?: boolean;
    /** Сколько частиц */
    particleCount?: number;
    /** Длительность жизни частиц (мс) */
    ttl?: number;
    /** Начальная скорость (px/с) [min, max] */
    speed?: [number, number];
    /** Гравитация (px/с²) */
    gravity?: number;
    /** Сопротивление (0..1), ближе к 1 — сильнее тормозит */
    drag?: number;
    /** Размер частиц (px) [min, max] */
    size?: [number, number];
    /** Палитра */
    colors?: string[];
    /** z-index слоя */
    zIndex?: number | string;
    /** Вызывается по завершении анимации */
    onComplete?: () => void;
  };
  
  export type ConfettiOverlayRef = {
    /** Императивный запуск */
    trigger: () => void;
    /** Идёт ли сейчас анимация */
    isRunning: () => boolean;
  };
  
  type Particle = {
    x: number;
    y: number;
    vx: number; // px/s
    vy: number; // px/s
    size: number;
    color: string;
    life: number; // ms с рождения
    ttl: number;  // ms до смерти
    rot: number;  // rad
    spin: number; // rad/s
    shape: 'rect' | 'circle';
  };
  
  const DEFAULT_COLORS = [
    '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#5ac8fa', '#007aff', '#af52de',
  ];
  
  export const ConfettiOverlay = forwardRef<ConfettiOverlayRef, ConfettiOverlayProps>(
    (
      {
        active = false,
        particleCount = 550,
        ttl = 5000,
        speed = [350, 1100],
        gravity = 200,
        drag = 1,
        size = [2, 6],
        colors = DEFAULT_COLORS,
        zIndex = 2147483647, // поверх всего
        onComplete,
      },
      ref
    ) => {
      const canvasRef = useRef<HTMLCanvasElement | null>(null);
      const rafRef = useRef<number | null>(null);
      const [mounted, setMounted] = useState(false);
  
      const runningRef = useRef(false);
      const particlesRef = useRef<Particle[]>([]);
      const startTimeRef = useRef<number>(0);
      const lastTRef = useRef<number>(0);
  
      // Портал доступен только в браузере
      useLayoutEffect(() => {
        setMounted(typeof window !== 'undefined' && !!document?.body);
      }, []);
  
      // Resize canvas to viewport
      const fitToViewport = () => {
        const c = canvasRef.current;
        if (!c) return;
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const w = window.innerWidth;
        const h = window.innerHeight;
        c.width = Math.floor(w * dpr);
        c.height = Math.floor(h * dpr);
        c.style.width = `${w}px`;
        c.style.height = `${h}px`;
        const ctx = c.getContext('2d');
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
  
      useEffect(() => {
        if (!mounted) return;
        fitToViewport();
        window.addEventListener('resize', fitToViewport);
        return () => window.removeEventListener('resize', fitToViewport);
      }, [mounted]);
  
      const randomBetween = (min: number, max: number) =>
        min + Math.random() * (max - min);
  
      const spawnParticles = () => {
        const c = canvasRef.current!;
        const width = c.clientWidth;
        const height = c.clientHeight;
        const cx = width / 2;
        const cy = height / 2;
  
        const parts: Particle[] = [];
        for (let i = 0; i < particleCount; i++) {
          const angle = Math.random() * Math.PI * 2; // во все стороны
          // Чуть усилим равномерность: sqrt для распределения мощи
          const spd = randomBetween(speed[0], speed[1]);
          const vx = Math.cos(angle) * spd;
          const vy = Math.sin(angle) * spd;
          parts.push({
            x: cx,
            y: cy,
            vx,
            vy,
            size: randomBetween(size[0], size[1]),
            color: colors[(Math.random() * colors.length) | 0],
            life: 0,
            ttl: ttl + Math.random() * 400, // немного рандома
            rot: Math.random() * Math.PI * 2,
            spin: randomBetween(-6, 6),
            shape: Math.random() < 0.55 ? 'rect' : 'circle',
          });
        }
        particlesRef.current = parts;
      };
  
      const step = (t: number) => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
  
        if (!lastTRef.current) lastTRef.current = t;
        const dt = Math.min(64, t - lastTRef.current); // ms (cap spikes)
        lastTRef.current = t;
  
        ctx.clearRect(0, 0, canvasRef.current.clientWidth, canvasRef.current.clientHeight);
  
        let alive = 0;
        for (const p of particlesRef.current) {
          // physics (s-based)
          const dts = dt / 1000;
          p.vx *= drag;
          p.vy = p.vy * drag + gravity * dts;
          p.x += p.vx * dts;
          p.y += p.vy * dts;
          p.life += dt;
          p.rot += p.spin * dts;
  
          // fade out by life progress
          const k = Math.max(0, 1 - p.life / p.ttl);
          if (k <= 0) continue;
          alive++;
  
          ctx.globalAlpha = Math.max(0, Math.min(1, k));
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
  
          if (p.shape === 'rect') {
            ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
          } else {
            ctx.beginPath();
            ctx.arc(0, 0, p.size, 0, Math.PI * 2);
            ctx.fill();
          }
  
          ctx.restore();
        }
        ctx.globalAlpha = 1;
  
        if (alive > 0) {
          rafRef.current = requestAnimationFrame(step);
        } else {
          runningRef.current = false;
          onComplete?.();
        }
      };
  
      const trigger = () => {
        console.log('🎊 ConfettiOverlay: trigger called', { mounted, running: runningRef.current, canvas: !!canvasRef.current });
        if (!mounted || runningRef.current) {
          console.log('🎊 ConfettiOverlay: Не запускаем - mounted:', mounted, 'running:', runningRef.current);
          return;
        }
        if (!canvasRef.current) {
          console.log('🎊 ConfettiOverlay: Canvas не готов');
          return;
        }
        console.log('🎊 ConfettiOverlay: Запускаем анимацию!');
        runningRef.current = true;
        startTimeRef.current = performance.now();
        lastTRef.current = 0;
        spawnParticles();
        rafRef.current = requestAnimationFrame(step);
      };
  
      useImperativeHandle(ref, () => ({
        trigger,
        isRunning: () => runningRef.current,
      }));
  
      // Автозапуск по пропсу active
      useEffect(() => {
        console.log('🎊 ConfettiOverlay: active prop changed to', active, 'mounted:', mounted);
        if (active && mounted) {
          console.log('🎊 ConfettiOverlay: Запускаем анимацию конфетти');
          trigger();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [active, mounted]);
  
      // cleanup
      useEffect(() => {
        return () => {
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
      }, []);
  
      if (!mounted) return null;
  
      const layer = (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex,
            pointerEvents: 'none', // КЛЮЧ: не блокировать клики/скролл/ввод
          }}
          aria-hidden="true"
        >
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              display: 'block',
            }}
          />
        </div>
      );
  
      return createPortal(layer, document.body);
    }
  );

ConfettiOverlay.displayName = 'ConfettiOverlay';
  