import { useId } from 'react';
import type { Product } from '@/lib/api';
import { matchProductByTypedName } from '@/lib/product-catalog';
import { resolveCurrency } from '@/lib/services';
import { cn, formatCurrency } from '@/lib/utils';

type ProductLineDescriptionInputProps = {
  value: string;
  products: Product[];
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  onValueChange: (value: string) => void;
  onProductPick: (product: Product) => void;
};

export function ProductLineDescriptionInput({
  value,
  products,
  readOnly,
  placeholder = 'Description',
  className,
  inputClassName,
  onValueChange,
  onProductPick,
}: ProductLineDescriptionInputProps) {
  const listId = useId();

  function commitValue(text: string) {
    onValueChange(text);
    const match = matchProductByTypedName(products, text);
    if (match) onProductPick(match);
  }

  return (
    <div className={cn('min-w-0', className)}>
      <input
        list={products.length && !readOnly ? listId : undefined}
        readOnly={readOnly}
        value={value}
        placeholder={placeholder}
        onChange={(e) => commitValue(e.target.value)}
        onBlur={(e) => commitValue(e.target.value)}
        className={cn(
          'product-datalist-input w-full min-w-0 bg-transparent px-0 py-0.5 text-inherit outline-none',
          'border-0 border-b border-transparent rounded-none shadow-none',
          !readOnly && 'hover:border-neutral-200 focus:border-neutral-400',
          readOnly && 'cursor-default',
          inputClassName
        )}
        autoComplete="off"
      />
      {products.length > 0 && !readOnly && (
        <datalist id={listId}>
          {products.map((product) => (
            <option
              key={product.id}
              value={product.name}
              label={`${product.serial_number ? `${product.serial_number}. ` : ''}${product.name} — ${formatCurrency(product.unit_price, resolveCurrency(product.currency))}`}
            />
          ))}
        </datalist>
      )}
    </div>
  );
}
