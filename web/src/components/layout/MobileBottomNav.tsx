import { NavLink } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { LayoutDashboard, Package, Users, FileText, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { springSoft } from '@/lib/motion';

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/', label: 'Invoices', icon: FileText, end: true },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function MobileBottomNav() {
  const reduceMotion = useReducedMotion();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background md:hidden">
      <div className="flex items-center justify-around px-0.5 py-1.5">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'relative flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[9px] font-medium',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && !reduceMotion && (
                  <motion.span
                    layoutId="mobile-nav-pill"
                    className="absolute inset-0 rounded-lg bg-primary/10"
                    transition={springSoft}
                  />
                )}
                {isActive && reduceMotion && (
                  <span className="absolute inset-0 rounded-lg bg-primary/10" />
                )}
                <motion.span
                  className="relative"
                  whileTap={reduceMotion ? undefined : { scale: 0.9 }}
                  animate={
                    reduceMotion
                      ? undefined
                      : isActive
                        ? { scale: 1.08 }
                        : { scale: 1 }
                  }
                  transition={springSoft}
                >
                  <Icon className="h-4 w-4" />
                </motion.span>
                <span className="relative">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
