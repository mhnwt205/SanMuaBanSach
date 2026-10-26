import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const MotionContext = createContext<{ enabled: boolean } | null>(null);

export function MotionProvider({ children }: { children: ReactNode }) {
  const [systemReduced, setSystemReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const enabled = !systemReduced;
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset.motion = enabled ? 'on' : 'off';
    return () => { delete document.documentElement.dataset.motion; };
  }, [enabled]);
  return <MotionContext.Provider value={{ enabled }}>{children}</MotionContext.Provider>;
}

export function useMotion() {
  const value = useContext(MotionContext);
  if (!value) throw new Error('MotionProvider is required');
  return value;
}

// One input-driven animation frame for all scroll scenes, with no idle loop.
const scrollReaders = new Set<() => void>();
let stopScrollTracking: (() => void) | undefined;
function observeScroll(read: () => void) {
  scrollReaders.add(read);
  if (!stopScrollTracking) {
    let frame = 0;
    const schedule = () => {
      if (document.hidden || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        scrollReaders.forEach(callback => callback());
      });
    };
    const visibility = () => {
      if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
      else schedule();
    };
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    resize?.observe(document.body);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    document.addEventListener('visibilitychange', visibility);
    stopScrollTracking = () => {
      cancelAnimationFrame(frame); resize?.disconnect();
      window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule);
      document.removeEventListener('visibilitychange', visibility);
      stopScrollTracking = undefined;
    };
    schedule();
  }
  read();
  return () => {
    scrollReaders.delete(read);
    if (!scrollReaders.size) stopScrollTracking?.();
  };
}

// Reveal only non-interactive visuals/text, leaving links and buttons in place.
const revealCallbacks = new WeakMap<Element, () => void>();
const seenImages = new Set<string>();
let revealObserver: IntersectionObserver | undefined;
function observeReveal(node: HTMLElement, reveal: () => void) {
  revealObserver ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      revealCallbacks.get(entry.target)?.();
      revealCallbacks.delete(entry.target);
      revealObserver?.unobserve(entry.target);
    }
  }, { threshold: 0.16 });
  revealCallbacks.set(node, reveal);
  revealObserver.observe(node);
  return () => { revealObserver?.unobserve(node); revealCallbacks.delete(node); };
}

type RevealOptions = { delay?: number; variant?: 'content' | 'image'; onceKey?: string };
export function useReveal<T extends HTMLElement = HTMLDivElement>({ delay = 0, variant = 'content', onceKey }: RevealOptions = {}) {
  const ref = useRef<T>(null);
  const played = useRef(false);
  const { enabled } = useMotion();
  useEffect(() => {
    const node = ref.current;
    if (!enabled || played.current || !node || typeof IntersectionObserver === 'undefined' || typeof node.animate !== 'function') return;
    if (onceKey && seenImages.has(onceKey)) { played.current = true; node.dataset.revealed = 'true'; return; }
    let animation: Animation | undefined;
    const stop = observeReveal(node, () => {
      played.current = true;
      node.dataset.revealed = 'true';
      if (onceKey) {
        seenImages.add(onceKey);
        if (seenImages.size > 300) seenImages.delete(seenImages.values().next().value!);
      }
      let stagger = delay;
      const grid = node.closest('.book-grid'), card = node.closest('.book-card');
      if (variant === 'image' && grid && card) {
        const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
        stagger += (Array.from(grid.children).indexOf(card) % Math.max(1, columns)) * 45;
      }
      const frames: Keyframe[] = variant === 'image'
        ? [{ opacity: .65, transform: 'scale(1.045)' }, { opacity: 1, transform: 'scale(1)' }]
        : [{ opacity: .3, transform: 'translate3d(0, 12px, 0)' }, { opacity: 1, transform: 'translate3d(0, 0, 0)' }];
      animation = node.animate(frames, { duration: variant === 'image' ? 820 : 680, delay: Math.min(stagger, 180), easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
      animation.onfinish = () => animation?.cancel();
    });
    return () => { stop(); animation?.cancel(); };
  }, [enabled, delay, variant, onceKey]);
  return ref;
}

export function useBookSceneMotion() {
  const ref = useRef<HTMLElement>(null);
  const { enabled } = useMotion();
  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node || typeof IntersectionObserver === 'undefined') return;
    let visible = false;
    const draw = () => {
      if (!visible) return;
      const rect = node.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, (innerHeight * .1 - rect.top) / Math.max(rect.height * .75, 1)));
      node.style.setProperty('--hero-scroll', progress.toFixed(3));
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) draw(); });
    observer.observe(node);
    const stop = observeScroll(draw);
    return () => { stop(); observer.disconnect(); node.style.removeProperty('--hero-scroll'); };
  }, [enabled]);
  return ref;
}
