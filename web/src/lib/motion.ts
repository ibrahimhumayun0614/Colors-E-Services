import type { Transition, Variants } from 'motion/react';

/** Shared easing used across CRM motion. */
export const easeOutExpo: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const pageTransition: Transition = {
  duration: 0.35,
  ease: easeOutExpo,
};

export const revealTransition: Transition = {
  duration: 0.45,
  ease: easeOutExpo,
};

export const springSoft: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 32,
  mass: 0.85,
};

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.04,
    },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: revealTransition,
  },
};
