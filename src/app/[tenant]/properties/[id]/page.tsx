import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import {
  Bed,
  Bath,
  Maximize2,
  MapPin,
  Pencil,
  ArrowLeft,
  Home,
  Phone,
  User,
  Calendar,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPrice, formatDate, getPropertyTypeLabel } from '@/lib/utils';
import { getPropertyById } from '@/lib/properties/queries';
import type { PropertyRow } from '@/lib/properties/queries';
import { Suspense } from 'react';
import ActivityTimeline from '@/components/activity/ActivityTimeline';

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------
const STATUS_STYLES: Record<string, string> = {
  available: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800',
  sold: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
  rented: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  under_offer: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
  off_market: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400 border-gray-200 dark:border-gray-800',
};

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    available: 'Available',
    sold: 'Sold',
    rented: 'Rented',
    under_offer: 'Under Offer',
    off_market: 'Off Market',
  };
  return labels[status] ?? status;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface PageProps {
  params: Promise<{ tenant: string; id: string }>;
}

// ---------------------------------------------------------------------------
// Image Gallery
// ---------------------------------------------------------------------------
function ImageGallery({ images }: { images: string[] | null }) {
  const allImages = images?.length ? images : [];
  const displayImages = allImages.length > 0 ? allImages : [null];

  return (
    <div className="overflow-hidden rounded-lg border bg-muted">
      {allImages.length > 0 ? (
        <div className="grid gap-1 md:grid-cols-4">
          {/* Main image */}
          <div className="relative aspect-[4/3] md:col-span-2 md:row-span-2">
            <Image
              src={allImages[0]!}
              alt="Property"
              fill
              className="object-cover"
              priority
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
          {/* Thumbnail grid */}
          {allImages.slice(1, 5).map((img, i) => (
            <div key={i} className="relative hidden aspect-[4/3] md:block">
              <Image
                src={img}
                alt={`Property image ${i + 2}`}
                fill
                className="object-cover"
                sizes="25vw"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex aspect-[16/9] items-center justify-center text-muted-foreground">
          <div className="text-center">
            <Home className="mx-auto h-16 w-16 opacity-20" />
            <p className="mt-2 text-sm">No images available</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Info card
// ---------------------------------------------------------------------------
function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number | null | undefined }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Amenities list
// ---------------------------------------------------------------------------
function AmenitiesList({ amenities }: { amenities: string[] | null }) {
  if (!amenities || amenities.length === 0) return null;

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold">Amenities</h3>
      <div className="flex flex-wrap gap-2">
        {amenities.map((amenity, i) => (
          <div
            key={i}
            className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs"
          >
            <Check className="h-3 w-3 text-green-500" />
            {amenity}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Property Detail Content
// ---------------------------------------------------------------------------
async function PropertyDetailContent({ tenant, id }: { tenant: string; id: string }) {
  const result = await getPropertyById(id);

  if (!result.success) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="rounded-full bg-destructive/10 p-4">
          <X className="h-10 w-10 text-destructive" />
        </div>
        <h3 className="mt-4 text-lg font-semibold">Error loading property</h3>
        <p className="mt-2 text-sm text-muted-foreground">{result.error}</p>
        <Button variant="outline" className="mt-6" asChild>
          <Link href={`/${tenant}/properties`}>Back to Properties</Link>
        </Button>
      </div>
    );
  }

  const property = result.data;
  if (!property) {
    notFound();
  }

  return (
    <div className="space-y-8">
      {/* Back + Edit */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" className="gap-2" asChild>
          <Link href={`/${tenant}/properties`}>
            <ArrowLeft className="h-4 w-4" />
            Back to Properties
          </Link>
        </Button>
        <Button size="sm" className="gap-2" asChild>
          <Link href={`/${tenant}/properties/${id}/edit`}>
            <Pencil className="h-4 w-4" />
            Edit Property
          </Link>
        </Button>
      </div>

      {/* Image Gallery */}
      <ImageGallery images={property.images} />

      {/* Title + Status + Price */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold sm:text-3xl">{property.title}</h1>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                STATUS_STYLES[property.availability_status] ?? ''
              }`}
            >
              {getStatusLabel(property.availability_status)}
            </span>
          </div>
          {property.location && (
            <div className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {property.location}
            </div>
          )}
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-foreground">{formatPrice(property.price)}</p>
          <p className="text-xs text-muted-foreground">
            Listed {formatDate(property.created_at)}
          </p>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoRow
          icon={<Bed className="h-5 w-5" />}
          label="Bedrooms"
          value={property.bedrooms}
        />
        <InfoRow
          icon={<Bath className="h-5 w-5" />}
          label="Bathrooms"
          value={property.bathrooms}
        />
        <InfoRow
          icon={<Maximize2 className="h-5 w-5" />}
          label="Area"
          value={property.area_sqft ? `${property.area_sqft.toLocaleString('en-IN')} sqft` : null}
        />
        <InfoRow
          icon={<Home className="h-5 w-5" />}
          label="Type"
          value={getPropertyTypeLabel(property.property_type)}
        />
      </div>

      {/* Description */}
      {property.description && (
        <>
          <Separator />
          <div>
            <h3 className="mb-2 text-sm font-semibold">Description</h3>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {property.description}
            </p>
          </div>
        </>
      )}

      {/* Amenities */}
      {property.amenities && property.amenities.length > 0 && (
        <>
          <Separator />
          <AmenitiesList amenities={property.amenities} />
        </>
      )}

      {/* Owner Info */}
      {(property.owner_name || property.owner_phone) && (
        <>
          <Separator />
          <div>
            <h3 className="mb-3 text-sm font-semibold">Owner Information</h3>
            <div className="flex flex-wrap gap-4">
              {property.owner_name && (
                <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm">{property.owner_name}</span>
                </div>
              )}
              {property.owner_phone && (
                <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                  <a
                    href={`tel:${property.owner_phone}`}
                    className="text-sm hover:underline"
                  >
                    {property.owner_phone}
                  </a>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Map Placeholder */}
      {property.latitude && property.longitude && (
        <>
          <Separator />
          <div>
            <h3 className="mb-3 text-sm font-semibold">Location</h3>
            <div className="flex aspect-[16/6] items-center justify-center rounded-lg border bg-muted text-muted-foreground">
              <div className="text-center">
                <MapPin className="mx-auto h-8 w-8 opacity-30" />
                <p className="mt-1 text-xs">
                  Map integration — lat: {property.latitude.toFixed(4)}, lng: {property.longitude.toFixed(4)}
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Activity Timeline */}
      <Separator />
      <div>
        <h3 className="mb-4 text-sm font-semibold">Activity</h3>
        <ActivityTimeline
          tenantId={tenant}
          entityType="property"
          entityId={id}
          pageSize={10}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function PropertyDetailSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="aspect-[16/9] w-full rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-24 w-full rounded-lg" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function PropertyDetailPage({ params }: PageProps) {
  const { tenant, id } = await params;

  return (
    <div className="container mx-auto px-4 py-8">
      <Suspense fallback={<PropertyDetailSkeleton />}>
        <PropertyDetailContent tenant={tenant} id={id} />
      </Suspense>
    </div>
  );
}
