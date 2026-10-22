import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, type Product } from '@/lib/api';
import { resolveCurrency } from '@/lib/services';
import { useToast } from '@/context/ToastContext';
import { useDebounce } from '@/hooks/useDebounce';
import { formatCurrency } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { SearchInput } from '@/components/SearchInput';
import { TableSkeleton } from '@/components/layout/Skeletons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const fieldClass =
  'bg-background shadow-none focus-visible:ring-1 focus-visible:ring-ring/30';

function isProductActive(product: Product) {
  return product.is_active === true || product.is_active === 1;
}

function ProductForm({
  initial,
  onSubmit,
  loading,
}: {
  initial?: Product;
  onSubmit: (data: Partial<Product>) => void;
  loading?: boolean;
}) {
  const [serialNumber, setSerialNumber] = useState(initial?.serial_number ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [sku, setSku] = useState(initial?.sku ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [unitPrice, setUnitPrice] = useState(String(initial?.unit_price ?? ''));
  const [active, setActive] = useState(initial ? isProductActive(initial) : true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      serial_number: serialNumber.trim() || undefined,
      name: name.trim(),
      sku: sku.trim() || null,
      description: description.trim() || null,
      unit_price: parseFloat(unitPrice) || 0,
      currency: 'INR',
      is_active: active ? 1 : 0,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="product-serial">Serial number</Label>
          <Input
            id="product-serial"
            className={fieldClass}
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            placeholder={initial ? undefined : 'Auto if empty'}
            required={!!initial}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="product-name">Name</Label>
          <Input
            id="product-name"
            className={fieldClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="product-sku">SKU (optional)</Label>
          <Input
            id="product-sku"
            className={fieldClass}
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={active ? 'active' : 'inactive'} onValueChange={(v) => setActive(v === 'active')}>
            <SelectTrigger className={fieldClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active (show on invoices)</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="product-price">Unit price (INR)</Label>
          <Input
            id="product-price"
            type="number"
            min="0"
            step="0.01"
            className={fieldClass}
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Currency</Label>
          <Input className={fieldClass} value="INR (₹)" readOnly disabled />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="product-desc">Description (optional)</Label>
        <Textarea
          id="product-desc"
          className={fieldClass}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Saving…' : initial ? 'Save changes' : 'Add product'}
      </Button>
    </form>
  );
}

export function ProductsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', debouncedSearch],
    queryFn: () =>
      api.products.list({
        active: '0',
        ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
      }),
  });

  const createMutation = useMutation({
    mutationFn: api.products.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setOpen(false);
      toast.success('Product added');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Product> }) => api.products.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setEditing(null);
      toast.success('Product updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: api.products.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setDeleting(null);
      toast.success('Product deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6 page-stagger">
      <PageHeader
        title="Products"
        description="Catalog items and list prices used when creating invoices."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                New product
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add product</DialogTitle>
              </DialogHeader>
              <ProductForm onSubmit={(data) => createMutation.mutate(data)} loading={createMutation.isPending} />
            </DialogContent>
          </Dialog>
        }
      />

      <SearchInput value={search} onChange={setSearch} placeholder="Search products…" />

      {isLoading ? (
        <TableSkeleton rows={5} />
      ) : products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products yet"
          description="Add products with pricing so you can pick them when creating an invoice."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Add product
            </Button>
          }
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">S.No</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-mono text-sm tabular-nums text-muted-foreground">
                    {product.serial_number ?? '—'}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{product.name}</div>
                    {product.description && (
                      <div className="text-xs text-muted-foreground line-clamp-1">{product.description}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{product.sku || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatCurrency(product.unit_price, resolveCurrency(product.currency))}
                  </TableCell>
                  <TableCell>
                    <Badge variant={isProductActive(product) ? 'success' : 'secondary'}>
                      {isProductActive(product) ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button type="button" size="icon" variant="ghost" onClick={() => setEditing(product)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleting(product)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(next) => !next && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit product</DialogTitle>
          </DialogHeader>
          {editing && (
            <ProductForm
              initial={editing}
              loading={updateMutation.isPending}
              onSubmit={(data) => updateMutation.mutate({ id: editing.id, data })}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(next) => !next && setDeleting(null)}
        title="Delete product?"
        description={`Remove "${deleting?.name}" from the catalog. Existing invoices are not changed.`}
        confirmLabel="Delete"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </div>
  );
}
