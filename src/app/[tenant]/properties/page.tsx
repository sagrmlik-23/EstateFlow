import Link from 'next/link';
import { Suspense } from 'react';
import { Plus, LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PropertyFilters from '@/components/properties/PropertyFilters';
import PropertyGrid from '@/components/properties/PropertyGrid';
import type { PropertyRow } from '@/lib/properties/queries';
import { getProperties } from '@/lib/properties/queries';
import { buildPaginationParams } from '@/lib/types';
import { resolveTenantId } from '@/lib/routing/resolveTenantId';

// ---------------------------------------------------------------------------
// Types for search params
// ---------------------------------------------------------------------------
interface PageProps {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{
    search?: string;
    property_type?: string;
    availability_status?: string;
    price_min?: string;
    price_max?: string;
    bedrooms?: string;
    location?: string;
    page?: string;
    view?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------
function PropertyListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-10 w-full sm:w-[200px]" />
        <Skeleton className="h-10 w-[160px]" />
        <Skeleton className="h-10 w-[160px]" />
        <Skeleton className="h-10 w-[150px]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-lg border">
            <Skeleton className="aspect-[4/3] w-full" />
            <div className="space-y-2 p-4">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-32" />
              <div className="flex gap-4">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyState({ tenant }: { tenant: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="rounded-full bg-muted p-4">
        <svg
          className="h-10 w-10 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          />
        </svg>
      </div>
      <h3 className="mt-4 text-lg font-semibold">No properties yet</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
        Get started by adding your first property listing to the portfolio.
      </p>
      <Button className="mt-6 gap-2" asChild>
        <Link href={`/${tenant}/properties/new`}>
          <Plus className="h-4 w-4" />
          Add Property
        </Link>
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------
function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="rounded-full bg-destructive/10 p-4">
        <svg
          className="h-10 w-10 text-destructive"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
      </div>
      <h3 className="mt-4 text-lg font-semibold">Failed to load properties</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main content (fetches data)
// ---------------------------------------------------------------------------
async function PropertyListContent({
  tenant,
  searchParams,
}: {
  tenant: string;
  searchParams: Record<string, string | undefined>;
}) {
  const tenantId = await resolveTenantId(tenant);
  const page = parseInt(searchParams.page ?? '1', 10);
  const pagination = buildPaginationParams(page, 20);

  // Build filters from search params
  const filters: Record<string, string | number | undefined> = {};
  if (searchParams.property_type) filters.property_type = searchParams.property_type;
  if (searchParams.availability_status) filters.availability_status = searchParams.availability_status;
  if (searchParams.price_min) filters.price_min = parseInt(searchParams.price_min, 10);
  if (searchParams.price_max) filters.price_max = parseInt(searchParams.price_max, 10);
  if (searchParams.bedrooms) filters.bedrooms = parseInt(searchParams.bedrooms, 10);
  if (searchParams.location) filters.location = searchParams.location;

  const result = await getProperties(tenantId, filters, pagination);

  if (!result.success) {
    return <ErrorState message={result.error ?? 'An unexpected error occurred'} />;
  }

  const properties = result.data ?? [];
  const meta = result.meta;
  const totalPages = meta?.total_pages ?? 1;
  const total = meta?.total ?? 0;

  if (properties.length === 0 && page === 1) {
    return <EmptyState tenant={tenant} />;
  }

  return (
    <div className="space-y-6">
      {/* Results info */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <p>
          {total} {total === 1 ? 'property' : 'properties'} found
        </p>
      </div>

      {/* Property grid */}
      <PropertyGrid properties={properties} tenant={tenant} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-4">
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
            const pageNum = i + 1;
            const isActive = pageNum === page;
            return (
              <Link
                key={pageNum}
                href={`/${tenant}/properties?${new URLSearchParams({
                  ...Object.fromEntries(
                    Object.entries(searchParams).filter(([_, v]) => v != null),
                  ),
                  page: String(pageNum),
                } as Record<string, string>)}`}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                {pageNum}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default async function PropertiesPage({ params, searchParams }: PageProps) {
  const { tenant } = await params;
  const sp = await searchParams;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Properties</h1>
          <p className="text-sm text-muted-foreground">Manage your property listings</p>
        </div>
        <Button className="gap-2 shrink-0" asChild>
          <Link href={`/${tenant}/properties/new`}>
            <Plus className="h-4 w-4" />
            Add Property
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <PropertyFilters className="mb-6" />

      {/* List */}
      <Suspense fallback={<PropertyListSkeleton />}>
        <PropertyListContent tenant={tenant} searchParams={sp} />
      </Suspense>
    </div>
  );
}
