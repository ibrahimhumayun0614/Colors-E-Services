import type { ReactNode, CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { easeOutExpo } from '@/lib/motion';

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  /** Extra delay after the element enters the viewport (ms). */
  delayMs?: number;
  /** How much of the element must be visible (0–1). */
  threshold?: number;
  /** Once true, stay visible even if scrolled away. */
  once?: boolean;
  style?: CSSProperties;
}

/**
 * Framer Motion scroll reveal (`whileInView`).
 * Respects prefers-reduced-motion.
 */
export function ScrollReveal({
  children,
  className,
  delayMs = 0,
  threshold = 0.12,
  once = true,
  style,
}: ScrollRevealProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return (
      <div className={cn(className)} style={style}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={cn(className)}
      style={style}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount: threshold, margin: '0px 0px -8% 0px' }}
      transition={{
        duration: 0.45,
        delay: delayMs / 1000,
        ease: easeOutExpo,
      }}
    >
      {children}
    </motion.div>
  );
}
