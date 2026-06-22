'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Bath, Bed, Maximize2, MapPin, Eye, Pencil } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatPrice, getPropertyTypeLabel } from '@/lib/utils';
import type { PropertyRow } from '@/lib/properties/queries';

// ---------------------------------------------------------------------------
// Status badge config
// ---------------------------------------------------------------------------
const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'secondary'> = {
  available: 'success',
  rented: 'info',
  sold: 'danger',
  under_offer: 'warning',
  off_market: 'secondary',
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
export interface PropertyCardProps {
  property: PropertyRow;
  tenant: string;
  href?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function PropertyCard({ property, tenant, href }: PropertyCardProps) {
  const imageUrl =
    property.images?.[0] ?? '/placeholder-property.svg';
  const detailHref = href ?? `/${tenant}/properties/${property.id}`;

  return (
    <Card className="group overflow-hidden transition-all hover:shadow-md">
      {/* Image */}
      <Link href={detailHref} className="block relative aspect-[4/3] overflow-hidden bg-muted">
        {imageUrl && !imageUrl.includes('placeholder') ? (
          <Image
            src={imageUrl}
            alt={property.title}
            fill
            className="object-cover transition-transform group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="text-center">
              <svg
                className="mx-auto h-12 w-12 mb-2 opacity-30"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span className="text-xs">No image</span>
            </div>
          </div>
        )}

        {/* Status badge overlay */}
        <div className="absolute top-2 left-2">
          <Badge variant={STATUS_VARIANTS[property.availability_status] ?? 'secondary'}>
            {getStatusLabel(property.availability_status)}
          </Badge>
        </div>

        {/* Type badge */}
        <div className="absolute top-2 right-2">
          <Badge variant="outline" className="bg-background/80 backdrop-blur-sm">
            {getPropertyTypeLabel(property.property_type)}
          </Badge>
        </div>
      </Link>

      {/* Content */}
      <CardContent className="p-4">
        {/* Price */}
        <p className="text-lg font-bold text-foreground">
          {formatPrice(property.price)}
        </p>

        {/* Title */}
        <Link href={detailHref}>
          <h3 className="mt-1 font-medium text-foreground line-clamp-1 hover:underline">
            {property.title}
          </h3>
        </Link>

        {/* Location */}
        {property.location && (
          <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{property.location}</span>
          </div>
        )}

        {/* Stats: beds, baths, area */}
        <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
          {property.bedrooms != null && (
            <span className="flex items-center gap-1">
              <Bed className="h-4 w-4" />
              {property.bedrooms}
            </span>
          )}
          {property.bathrooms != null && (
            <span className="flex items-center gap-1">
              <Bath className="h-4 w-4" />
              {property.bathrooms}
            </span>
          )}
          {property.area_sqft != null && (
            <span className="flex items-center gap-1">
              <Maximize2 className="h-4 w-4" />
              {property.area_sqft.toLocaleString('en-IN')} sqft
            </span>
          )}
        </div>

        {/* Quick actions */}
        <div className="mt-3 flex items-center gap-2 border-t pt-3">
          <Button variant="ghost" size="sm" className="flex-1 gap-1" asChild>
            <Link href={detailHref}>
              <Eye className="h-4 w-4" />
              View
            </Link>
          </Button>
          <Button variant="ghost" size="sm" className="flex-1 gap-1" asChild>
            <Link href={`/${tenant}/properties/${property.id}/edit`}>
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
