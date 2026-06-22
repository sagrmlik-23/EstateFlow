import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import NewPropertyForm from '@/components/properties/NewPropertyForm';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface PageProps {
  params: Promise<{ tenant: string }>;
}

// ---------------------------------------------------------------------------
// Loading fallback
// ---------------------------------------------------------------------------
function NewPropertySkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-md" />
          <div className="space-y-1">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function NewPropertyPage({ params }: PageProps) {
  const { tenant } = await params;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Suspense fallback={<NewPropertySkeleton />}>
        <NewPropertyForm tenant={tenant} />
      </Suspense>
    </div>
  );
}
