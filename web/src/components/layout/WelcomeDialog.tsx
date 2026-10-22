import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { APP_NAME } from '@/lib/branding';

const DISMISS_KEY = 'crm_welcome_dismissed';

function isDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function WelcomeDialog() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(isDismissed);

  const { data: demoStatus, isLoading } = useQuery({
    queryKey: ['demo-status'],
    queryFn: api.demo.status,
  });

  const loadDemoMutation = useMutation({
    mutationFn: api.demo.load,
    onSuccess: (result) => {
      queryClient.invalidateQueries();
      toast.success(`Demo data loaded (${result.clientCount} sample clients)`);
      persistDismiss();
      setDismissed(true);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function persistDismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore storage failures */
    }
  }

  function handleClose() {
    persistDismiss();
    setDismissed(true);
  }

  // Show only on first visit, before demo data exists.
  const open = !dismissed && !isLoading && !demoStatus?.loaded;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !loadDemoMutation.isPending) handleClose();
      }}
    >
      <DialogContent className="max-w-md rounded-2xl text-center">
        <DialogHeader className="items-center text-center sm:text-center">
          <DialogTitle className="text-xl">Welcome to {APP_NAME}</DialogTitle>
          <DialogDescription className="text-balance">
            New here? Load sample clients, services, and invoices to try invoice management right
            away. You can remove demo data later from Settings.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex flex-col gap-2">
          <Button
            size="lg"
            className="w-full gap-2"
            disabled={loadDemoMutation.isPending}
            onClick={() => loadDemoMutation.mutate()}
          >
            {loadDemoMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Database className="h-4 w-4" />
            )}
            {loadDemoMutation.isPending ? 'Loading demo data…' : 'Load demo data'}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            disabled={loadDemoMutation.isPending}
            onClick={() => {
              handleClose();
              navigate('/settings');
            }}
          >
            Manage data in Settings
          </Button>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            disabled={loadDemoMutation.isPending}
            onClick={handleClose}
          >
            Skip for now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
