import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { api, type Service } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

type RenewalTarget = 'domain' | 'hosting' | 'maintenance' | 'all';

export function ServiceRenewDialog({
  service,
  open,
  onOpenChange,
}: {
  service: Service | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [target, setTarget] = useState<RenewalTarget>('all');
  const [years, setYears] = useState('1');
  const queryClient = useQueryClient();
  const toast = useToast();

  const renewMutation = useMutation({
    mutationFn: () =>
      api.services.renew(service!.id, {
        target: service!.service_type === 'website_maintenance' ? 'maintenance' : target,
        years: parseInt(years, 10) || 1,
        complete_tasks: true,
      }),
    onSuccess: () => {
      invalidate();
      toast.success('Renewal dates updated');
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const maintenanceMutation = useMutation({
    mutationFn: () => api.services.completeMaintenance(service!.id),
    onSuccess: () => {
      invalidate();
      toast.success('Maintenance marked complete — next due date set');
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['services'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    if (service?.client_id) {
      queryClient.invalidateQueries({ queryKey: ['services', service.client_id] });
    }
  }

  if (!service) return null;

  const isMaintenance = service.service_type === 'website_maintenance';
  const pending = renewMutation.isPending || maintenanceMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Renew / update dates</DialogTitle>
          <DialogDescription>
            {isMaintenance
              ? `Mark maintenance complete for ${service.name} and schedule the next due date from its billing cycle.`
              : `Bump renewal dates for ${service.name}. Linked open tasks will be marked done.`}
          </DialogDescription>
        </DialogHeader>

        {isMaintenance ? (
          <p className="text-sm text-muted-foreground">
            Billing cycle: <strong>{service.billing_cycle}</strong>
            {service.next_due_date ? ` · Current due ${service.next_due_date}` : ''}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>What to renew</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={target}
                onChange={(e) => setTarget(e.target.value as RenewalTarget)}
              >
                <option value="all">Domain & hosting</option>
                <option value="domain">Domain only</option>
                <option value="hosting">Hosting only</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Extend by (years)</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={years}
                onChange={(e) => setYears(e.target.value)}
              >
                <option value="1">1 year</option>
                <option value="2">2 years</option>
                <option value="3">3 years</option>
              </select>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              isMaintenance ? maintenanceMutation.mutate() : renewMutation.mutate()
            }
            disabled={pending}
          >
            <RefreshCw className="h-4 w-4" />
            {isMaintenance ? 'Complete maintenance' : 'Update dates'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
