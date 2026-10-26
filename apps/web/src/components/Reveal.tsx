import type { ReactNode } from 'react';
import { useReveal } from '../lib/motion';

export default function Reveal({ children, className = '', delay = 0, variant = 'content' }: { children: ReactNode; className?: string; delay?: number; variant?: 'content' | 'image' }) {
  const ref = useReveal({ delay, variant });
  return <div ref={ref} className={`motion-reveal ${className}`}>{children}</div>;
}
