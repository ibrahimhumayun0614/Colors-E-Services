import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { pageTransition, pageVariants } from '@/lib/motion';

interface AnimatedPageProps {
  className?: string;
  children?: React.ReactNode;
}

/** Framer Motion page enter/exit + smooth scroll-to-top on navigation. */
export function AnimatedPage({ className, children }: AnimatedPageProps) {
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const main = document.querySelector<HTMLElement>('[data-app-scroll]');
    const behavior: ScrollBehavior = reduceMotion ? 'auto' : 'smooth';

    if (main) {
      main.scrollTo({ top: 0, behavior });
    } else {
      window.scrollTo({ top: 0, behavior });
    }
  }, [pathname, reduceMotion]);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        className={cn(className)}
        variants={reduceMotion ? undefined : pageVariants}
        initial={reduceMotion ? false : 'initial'}
        animate={reduceMotion ? undefined : 'animate'}
        exit={reduceMotion ? undefined : 'exit'}
        transition={pageTransition}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/** Staggered list-row entrance — CSS delay helper (kept for existing list rows). */
export function listStaggerStyle(index: number, stepMs = 40, maxMs = 420) {
  return { animationDelay: `${Math.min(index * stepMs, maxMs)}ms` };
}

/** Motion props for list rows when using motion.li / motion.div. */
export function listMotionProps(index: number, step = 0.04, max = 0.42) {
  return {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: {
      delay: Math.min(index * step, max),
      duration: 0.38,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  };
}
