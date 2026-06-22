'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { PROPERTY_TYPES, AVAILABILITY_STATUSES } from '@/lib/constants';
import { getPropertyTypeLabel } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface FormData {
  title: string;
  description: string;
  price: string;
  area_sqft: string;
  bedrooms: string;
  bathrooms: string;
  property_type: string;
  availability_status: string;
  location: string;
  owner_name: string;
  owner_phone: string;
  images: string[];
  amenities: string[];
}

interface FormErrors {
  [key: string]: string | undefined;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------
const initialFormData: FormData = {
  title: '',
  description: '',
  price: '',
  area_sqft: '',
  bedrooms: '',
  bathrooms: '',
  property_type: '',
  availability_status: 'available',
  location: '',
  owner_name: '',
  owner_phone: '',
  images: [''],
  amenities: [''],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function NewPropertyForm({ tenant }: { tenant: string }) {
  const router = useRouter();
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ─── Field setter ─────────────────────────────────────────────────────────
  const update = (field: keyof FormData, value: string | string[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error on change
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // ─── Array field helpers (images, amenities) ──────────────────────────────
  const addArrayItem = (field: 'images' | 'amenities') => {
    setFormData((prev) => ({
      ...prev,
      [field]: [...prev[field], ''],
    }));
  };

  const removeArrayItem = (field: 'images' | 'amenities', index: number) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  const updateArrayItem = (field: 'images' | 'amenities', index: number, value: string) => {
    setFormData((prev) => {
      const arr = [...prev[field]];
      arr[index] = value;
      return { ...prev, [field]: arr };
    });
  };

  // ─── Validation ───────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: FormErrors = {};

    if (!formData.title.trim()) {
      errs.title = 'Title is required';
    } else if (formData.title.length > 200) {
      errs.title = 'Title must be 200 characters or less';
    }

    const price = parseFloat(formData.price);
    if (!formData.price.trim()) {
      errs.price = 'Price is required';
    } else if (isNaN(price) || price < 0) {
      errs.price = 'Price must be a non-negative number';
    }

    if (!formData.property_type) {
      errs.property_type = 'Property type is required';
    }

    if (formData.description.length > 2000) {
      errs.description = 'Description must be 2000 characters or less';
    }

    const beds = parseInt(formData.bedrooms, 10);
    if (formData.bedrooms.trim() && (isNaN(beds) || beds < 0)) {
      errs.bedrooms = 'Bedrooms must be a non-negative integer';
    }

    const baths = parseInt(formData.bathrooms, 10);
    if (formData.bathrooms.trim() && (isNaN(baths) || baths < 0)) {
      errs.bathrooms = 'Bathrooms must be a non-negative integer';
    }

    const area = parseFloat(formData.area_sqft);
    if (formData.area_sqft.trim() && (isNaN(area) || area < 0)) {
      errs.area_sqft = 'Area must be a non-negative number';
    }

    // Validate image URLs
    const validImages = formData.images.filter((u) => u.trim());
    for (const url of validImages) {
      try {
        new URL(url);
      } catch {
        errs.images = 'One or more image URLs are invalid';
        break;
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ─── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validate()) return;

    setSubmitting(true);

    try {
      const validImages = formData.images
        .map((u) => u.trim())
        .filter(Boolean);
      const validAmenities = formData.amenities
        .map((a) => a.trim())
        .filter(Boolean);

      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        price: parseFloat(formData.price),
        area_sqft: formData.area_sqft.trim() ? parseFloat(formData.area_sqft) : null,
        bedrooms: formData.bedrooms.trim() ? parseInt(formData.bedrooms, 10) : null,
        bathrooms: formData.bathrooms.trim() ? parseInt(formData.bathrooms, 10) : null,
        property_type: formData.property_type,
        availability_status: formData.availability_status,
        location: formData.location.trim() || null,
        owner_name: formData.owner_name.trim() || null,
        owner_phone: formData.owner_phone.trim() || null,
        images: validImages.length > 0 ? validImages : null,
        amenities: validAmenities.length > 0 ? validAmenities : null,
      };

      const res = await fetch(`/api/properties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        setSubmitError(result.error || 'Failed to create property');
        if (result.details) {
          const fieldErrors: FormErrors = {};
          for (const [key, msgs] of Object.entries(result.details)) {
            fieldErrors[key] = Array.isArray(msgs) ? msgs[0] : String(msgs);
          }
          setErrors((prev) => ({ ...prev, ...fieldErrors }));
        }
        return;
      }

      // Redirect to the new property
      router.push(`/${tenant}/properties/${result.data.id}`);
      router.refresh();
    } catch (err) {
      console.error('[NewProperty] Submit error:', err);
      setSubmitError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/${tenant}/properties`}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Add Property</h1>
            <p className="text-sm text-muted-foreground">
              Create a new property listing
            </p>
          </div>
        </div>
        <Button type="submit" disabled={submitting} className="gap-2">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? 'Saving...' : 'Save Property'}
        </Button>
      </div>

      {/* Global error */}
      {submitError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {submitError}
        </div>
      )}

      {/* Basic Info */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Basic Information</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Title */}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">
              Title <span className="text-destructive">*</span>
            </label>
            <Input
              value={formData.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="e.g., Modern 3BHK Apartment in Whitefield"
              className={errors.title ? 'border-destructive' : ''}
            />
            {errors.title && (
              <p className="mt-1 text-xs text-destructive">{errors.title}</p>
            )}
          </div>

          {/* Property Type */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              Property Type <span className="text-destructive">*</span>
            </label>
            <Select
              value={formData.property_type}
              onValueChange={(v) => update('property_type', v)}
            >
              <SelectTrigger className={errors.property_type ? 'border-destructive' : ''}>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PROPERTY_TYPES).map(([key, val]) => (
                  <SelectItem key={val} value={val}>
                    {getPropertyTypeLabel(val)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.property_type && (
              <p className="mt-1 text-xs text-destructive">{errors.property_type}</p>
            )}
          </div>

          {/* Status */}
          <div>
            <label className="mb-1 block text-sm font-medium">Status</label>
            <Select
              value={formData.availability_status}
              onValueChange={(v) => update('availability_status', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(AVAILABILITY_STATUSES).map(([key, val]) => (
                  <SelectItem key={val} value={val}>
                    {key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Price */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              Price (₹) <span className="text-destructive">*</span>
            </label>
            <Input
              type="number"
              min={0}
              step={1000}
              value={formData.price}
              onChange={(e) => update('price', e.target.value)}
              placeholder="e.g., 7500000"
              className={errors.price ? 'border-destructive' : ''}
            />
            {errors.price && (
              <p className="mt-1 text-xs text-destructive">{errors.price}</p>
            )}
          </div>
        </div>
      </section>

      <Separator />

      {/* Details */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Property Details</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Bedrooms</label>
            <Input
              type="number"
              min={0}
              value={formData.bedrooms}
              onChange={(e) => update('bedrooms', e.target.value)}
              placeholder="e.g., 3"
              className={errors.bedrooms ? 'border-destructive' : ''}
            />
            {errors.bedrooms && (
              <p className="mt-1 text-xs text-destructive">{errors.bedrooms}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Bathrooms</label>
            <Input
              type="number"
              min={0}
              value={formData.bathrooms}
              onChange={(e) => update('bathrooms', e.target.value)}
              placeholder="e.g., 2"
              className={errors.bathrooms ? 'border-destructive' : ''}
            />
            {errors.bathrooms && (
              <p className="mt-1 text-xs text-destructive">{errors.bathrooms}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Area (sqft)</label>
            <Input
              type="number"
              min={0}
              value={formData.area_sqft}
              onChange={(e) => update('area_sqft', e.target.value)}
              placeholder="e.g., 1500"
              className={errors.area_sqft ? 'border-destructive' : ''}
            />
            {errors.area_sqft && (
              <p className="mt-1 text-xs text-destructive">{errors.area_sqft}</p>
            )}
          </div>
        </div>

        {/* Location */}
        <div>
          <label className="mb-1 block text-sm font-medium">Location</label>
          <Input
            value={formData.location}
            onChange={(e) => update('location', e.target.value)}
            placeholder="e.g., Whitefield, Bangalore"
          />
        </div>

        {/* Description */}
        <div>
          <label className="mb-1 block text-sm font-medium">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="Describe the property..."
            rows={4}
            className={`flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
              errors.description ? 'border-destructive' : ''
            }`}
          />
          {errors.description && (
            <p className="mt-1 text-xs text-destructive">{errors.description}</p>
          )}
        </div>
      </section>

      <Separator />

      {/* Amenities */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Amenities</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addArrayItem('amenities')}
            className="gap-1"
          >
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>
        <div className="space-y-2">
          {formData.amenities.map((amenity, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={amenity}
                onChange={(e) => updateArrayItem('amenities', i, e.target.value)}
                placeholder="e.g., Swimming Pool, Gym, Parking"
              />
              {formData.amenities.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => removeArrayItem('amenities', i)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      <Separator />

      {/* Images */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Image URLs</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addArrayItem('images')}
            className="gap-1"
          >
            <Plus className="h-3 w-3" />
            Add URL
          </Button>
        </div>
        <div className="space-y-2">
          {formData.images.map((url, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={url}
                onChange={(e) => updateArrayItem('images', i, e.target.value)}
                placeholder="https://example.com/image.jpg"
              />
              {formData.images.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => removeArrayItem('images', i)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {errors.images && (
            <p className="text-xs text-destructive">{errors.images}</p>
          )}
        </div>
      </section>

      <Separator />

      {/* Owner Info */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Owner Information</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Owner Name</label>
            <Input
              value={formData.owner_name}
              onChange={(e) => update('owner_name', e.target.value)}
              placeholder="e.g., Rajesh Kumar"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Owner Phone</label>
            <Input
              value={formData.owner_phone}
              onChange={(e) => update('owner_phone', e.target.value)}
              placeholder="e.g., +91 98765 43210"
            />
          </div>
        </div>
      </section>

      {/* Submit (mobile) */}
      <div className="sticky bottom-0 border-t bg-background py-4 sm:hidden">
        <Button type="submit" className="w-full gap-2" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? 'Saving...' : 'Save Property'}
        </Button>
      </div>
    </form>
  );
}
