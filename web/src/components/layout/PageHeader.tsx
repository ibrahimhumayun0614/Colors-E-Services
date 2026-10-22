import { type ReactNode } from 'react';
import { Breadcrumbs, type BreadcrumbItem } from '@/components/layout/Breadcrumbs';

interface PageHeaderProps {
  title: string;
  description?: string;
  meta?: string;
  breadcrumbs?: BreadcrumbItem[];
  action?: ReactNode;
}

export function PageHeader({ title, description, meta, breadcrumbs, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
        {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
