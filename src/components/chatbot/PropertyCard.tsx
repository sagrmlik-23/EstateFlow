'use client';

// ============================================================================
// EstateFlow CRM — Inline Property Card for Chat
// Phase 5 — AI Chatbot (AGENT-5-2-WEBSITE-WIDGET)
// ============================================================================

import Image from 'next/image';
import { Home, MapPin, BedDouble, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn, formatPrice, getPropertyTypeLabel } from '@/lib/utils';
import type { PropertyCardData } from '@/types/chatbot';

interface PropertyCardProps {
  property: PropertyCardData;
  themeColor?: string;
  onViewDetails?: (propertyId: string) => void;
  onScheduleVisit?: (propertyId: string) => void;
  className?: string;
}

export default function PropertyCard({
  property,
  themeColor = '#2563eb',
  onViewDetails,
  onScheduleVisit,
  className,
}: PropertyCardProps) {
  return (
    <Card
      className={cn(
        'overflow-hidden border shadow-sm max-w-[280px]',
        className,
      )}
    >
      {/* Property Image */}
      <div className="relative h-36 w-full bg-muted">
        {property.imageUrl ? (
          <Image
            src={property.imageUrl}
            alt={property.title}
            fill
            className="object-cover"
            sizes="280px"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Home className="h-10 w-10 text-muted-foreground/50" />
          </div>
        )}
        <div
          className="absolute top-2 left-2 rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
          style={{ backgroundColor: themeColor }}
        >
          {getPropertyTypeLabel(property.type)}
        </div>
      </div>

      {/* Details */}
      <div className="p-3 space-y-1.5">
        <h4 className="text-sm font-semibold leading-tight line-clamp-1">
          {property.title}
        </h4>

        <p
          className="text-base font-bold"
          style={{ color: themeColor }}
        >
          {formatPrice(property.price)}
        </p>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{property.location}</span>
        </div>

        {(property.bedrooms || property.area) && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {property.bedrooms && (
              <span className="flex items-center gap-1">
                <BedDouble className="h-3 w-3" />
                {property.bedrooms} BHK
              </span>
            )}
            {property.area && (
              <span className="flex items-center gap-1">
                <Maximize2 className="h-3 w-3" />
                {property.area} sq.ft
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1.5">
          <Button
            size="sm"
            variant="default"
            className="flex-1 h-8 text-xs"
            style={{ backgroundColor: themeColor }}
            onClick={() => onViewDetails?.(property.propertyId)}
          >
            View Details
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-8 text-xs"
            onClick={() => onScheduleVisit?.(property.propertyId)}
          >
            Schedule Visit
          </Button>
        </div>
      </div>
    </Card>
  );
}
