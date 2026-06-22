'use client';

import React from 'react';
import PropertyCard from '@/components/properties/PropertyCard';
import type { PropertyRow } from '@/lib/properties/queries';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface PropertyGridProps {
  properties: PropertyRow[];
  tenant: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function PropertyGrid({ properties, tenant }: PropertyGridProps) {
  if (properties.length === 0) {
    return null; // empty state is handled by parent
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {properties.map((property) => (
        <PropertyCard
          key={property.id}
          property={property}
          tenant={tenant}
        />
      ))}
    </div>
  );
}
