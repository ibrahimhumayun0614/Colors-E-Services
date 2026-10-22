import { useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Lock,
  Receipt,
  Users,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from '@/lib/branding';

function loginErrorMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes('too many')) {
    return 'Too many login attempts. Please wait a few minutes and try again.';
  }
  if (lower.includes('before your account is locked')) {
    return message;
  }
  if (lower.includes('invalid password') || lower.includes('unauthorized')) {
    return 'Incorrect password. Please try again.';
  }
  if (lower.includes('not configured') || lower.includes('api_secret')) {
    return 'Login is not set up yet. Add API_SECRET in Cloudflare for crm-app.';
  }
  if (
    lower.includes('temporarily unavailable') ||
    lower.includes('database') ||
    lower.includes('misconfigured')
  ) {
    return 'Sign-in is temporarily unavailable. Please try again later.';
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return message;
}

const highlights = [
  { icon: Receipt, text: 'Create invoices and track payment status' },
  { icon: Users, text: 'Keep customer billing details for each invoice' },
  { icon: FileText, text: 'Review invoice history in one place' },
];

export function LoginPage() {
  const { authenticated, login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionExpired = searchParams.get('expired') === '1';
  const returnTo = searchParams.get('returnTo');
  const passwordRef = useRef<HTMLInputElement>(null);

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);

  if (authenticated) {
    const destination = returnTo && returnTo.startsWith('/') ? returnTo : '/';
    return <Navigate to={destination} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(password, remember);
      toast.success('Welcome back!');
      const destination = returnTo && returnTo.startsWith('/') ? returnTo : '/';
      navigate(destination, { replace: true });
    } catch (err) {
      const message = loginErrorMessage(err instanceof Error ? err.message : 'Login failed');
      setError(message);
      setShake(true);
      window.setTimeout(() => setShake(false), 500);
      passwordRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-2">
        <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.12),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.08),transparent_35%)]" />
          <div className="relative page-enter">
            <div>
              <p className="text-lg font-semibold">{APP_NAME}</p>
              <p className="text-sm text-primary-foreground/70">{APP_TAGLINE}</p>
            </div>
          </div>

          <div className="relative space-y-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{APP_TAGLINE}</h1>
              <p className="mt-3 max-w-md text-primary-foreground/75">{APP_DESCRIPTION}</p>
            </div>
            <ul className="login-stagger space-y-4">
              {highlights.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm text-primary-foreground/90">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-foreground/10">
                    <Icon className="h-4 w-4" />
                  </div>
                  {text}
                </li>
              ))}
            </ul>
          </div>

          <p className="relative text-xs text-primary-foreground/50">
            Secured with Cloudflare · For personal use only
          </p>
        </div>

        <div className="flex items-center justify-center bg-gradient-to-br from-muted/40 via-background to-muted/20 p-4 sm:p-8">
          <Card className="login-panel-enter w-full max-w-md border shadow-lg">
            <CardHeader className="text-center sm:text-left">
              <div className="mb-3 lg:hidden">
                <p className="text-sm font-semibold">{APP_NAME}</p>
                <p className="text-xs text-muted-foreground">{APP_TAGLINE}</p>
              </div>
              <CardTitle className="text-2xl">Welcome back</CardTitle>
              <CardDescription>Sign in with your password to open {APP_NAME}</CardDescription>
            </CardHeader>
            <CardContent>
              {sessionExpired && (
                <p className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                  Your session expired. Please sign in again.
                </p>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className={cn('relative', shake && 'animate-shake')}>
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      ref={passwordRef}
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      className={cn(
                        'pl-9 pr-10',
                        error && 'border-destructive focus-visible:ring-destructive'
                      )}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoFocus
                      autoComplete="current-password"
                      disabled={loading}
                      aria-invalid={!!error}
                      aria-describedby={error ? 'login-error' : undefined}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      disabled={loading}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="h-4 w-4 rounded border-input"
                      disabled={loading}
                    />
                    Remember me on this device
                  </label>
                  <p className="pl-6 text-xs text-muted-foreground">
                    {remember
                      ? 'Keeps a signed-in session on this device for up to 30 days.'
                      : 'Session ends when you close this browser tab.'}
                  </p>
                </div>

                {error && (
                  <p
                    id="login-error"
                    role="alert"
                    aria-live="polite"
                    className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {error}
                  </p>
                )}

                <Button type="submit" className="h-10 w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign in'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
