import { cn, getInitials } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { getUserProfile } from '@/lib/auth';
import { useProfileAvatar } from '@/lib/avatar';
import { api } from '@/lib/api';
import { springSoft } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GlobalSearch } from '@/components/GlobalSearch';
import { NotificationsPanel } from '@/components/NotificationsPanel';
import { AnimatedPage } from '@/components/layout/AnimatedPage';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { WelcomeDialog } from '@/components/layout/WelcomeDialog';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Moon,
  LayoutDashboard,
  Package,
  Users,
  FileText,
  Settings,
  LogOut,
  ChevronsUpDown,
  Sun,
  User,
} from 'lucide-react';
import { APP_NAME, APP_TAGLINE } from '@/lib/branding';

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/', label: 'Invoices', icon: FileText, end: true },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const THEME_KEY = 'crm_theme';

function getInitialTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem(THEME_KEY, theme);
}

function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  const isDark = theme === 'dark';

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggleTheme() {
    setTheme(isDark ? 'light' : 'dark');
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="shrink-0 text-muted-foreground hover:text-foreground"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

function AccountCard({
  onSettings,
  onSignOut,
}: {
  onSettings: () => void;
  onSignOut: () => void;
}) {
  const avatar = useProfileAvatar();
  const reduceMotion = useReducedMotion();
  const { data: profile = getUserProfile() } = useQuery({
    queryKey: ['profile', 'sidebar'],
    queryFn: api.profile.get,
    initialData: getUserProfile,
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <motion.button
          type="button"
          whileHover={reduceMotion ? undefined : { y: -2 }}
          whileTap={reduceMotion ? undefined : { scale: 0.985 }}
          transition={springSoft}
          className="m-4 flex w-[calc(100%-2rem)] items-center gap-2.5 rounded-xl border bg-background p-2.5 text-left shadow-sm transition-colors hover:border-primary/25 hover:bg-accent/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-primary/25 data-[state=open]:bg-accent/60"
          aria-label="Account menu"
        >
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-semibold text-foreground">
            {avatar ? (
              <img src={avatar} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              getInitials(profile.name) || 'AD'
            )}
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-emerald-500" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight">{profile.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{profile.email}</span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </motion.button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-56">
        <DropdownMenuItem onClick={onSettings} className="gap-2">
          <User className="h-4 w-4" />
          Profile & settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onSignOut}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-muted/30">
      <aside className="hidden h-dvh w-64 shrink-0 flex-col border-r bg-background md:flex">
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{APP_NAME}</p>
            <p className="truncate text-xs text-muted-foreground">{APP_TAGLINE}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <NotificationsPanel />
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              onClick={handleLogout}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="border-b p-4">
          <GlobalSearch />
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-4">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <motion.div
              key={to}
              whileHover={reduceMotion ? undefined : { x: 2 }}
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              transition={springSoft}
            >
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            </motion.div>
          ))}
        </nav>
        <AccountCard
          onSettings={() => navigate('/settings')}
          onSignOut={handleLogout}
        />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b bg-background px-4 md:hidden">
          <span className="font-semibold truncate">{APP_NAME}</span>
          <div className="flex items-center gap-1">
            <GlobalSearch compact />
            <NotificationsPanel />
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              onClick={handleLogout}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main
          data-app-scroll
          className="app-scroll min-h-0 flex-1 overflow-y-auto p-4 pb-24 md:p-6 md:pb-6"
        >
          <AnimatedPage>
            <Outlet />
          </AnimatedPage>
        </main>
      </div>

      <MobileBottomNav />
      <WelcomeDialog />
    </div>
  );
}
