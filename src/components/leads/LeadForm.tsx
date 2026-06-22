'use client';

import { useState } from 'react';
import { z } from 'zod';
import { Loader2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LEAD_STATUSES, LEAD_SOURCES } from '@/lib/constants';
import { toast } from '@/hooks/use-toast';
import type { LeadRow } from '@/lib/leads/queries';

// Zod validation schema
const leadFormSchema = z.object({
  full_name: z.string().min(1, 'Full name is required').max(255),
  phone: z
    .string()
    .regex(/^(\+91)?[0-9]{10}$/, 'Invalid phone number. Use +91XXXXXXXXXX or 10 digits')
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
  email: z
    .string()
    .email('Invalid email')
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
  source: z.string().nullable().optional(),
  status: z.string().optional(),
  budget_min: z
    .string()
    .transform((v) => (v === '' ? null : Number(v)))
    .pipe(z.number().nonnegative().nullable().optional()),
  budget_max: z
    .string()
    .transform((v) => (v === '' ? null : Number(v)))
    .pipe(z.number().nonnegative().nullable().optional()),
  preferred_location: z.string().max(255).nullable().optional(),
  property_type: z.string().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

type LeadFormValues = z.infer<typeof leadFormSchema>;

interface LeadFormProps {
  lead?: LeadRow | null;
  onSuccess?: (lead: LeadRow) => void;
  onCancel?: () => void;
  tenantId: string;
}

const SOURCE_OPTIONS = [
  { value: '', label: 'Select source...' },
  { value: LEAD_SOURCES.WEBSITE, label: 'Website' },
  { value: LEAD_SOURCES.REFERRAL, label: 'Referral' },
  { value: LEAD_SOURCES.WHATSAPP, label: 'WhatsApp' },
  { value: LEAD_SOURCES.FACEBOOK, label: 'Facebook' },
  { value: LEAD_SOURCES.INSTAGRAM, label: 'Instagram' },
  { value: LEAD_SOURCES.COLD_CALL, label: 'Cold Call' },
  { value: LEAD_SOURCES.WALK_IN, label: 'Walk-In' },
  { value: LEAD_SOURCES.OTHER, label: 'Other' },
];

const PROPERTY_TYPE_OPTIONS = [
  { value: '', label: 'Select type...' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'villa', label: 'Villa' },
  { value: 'plot', label: 'Plot' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'penthouse', label: 'Penthouse' },
  { value: 'other', label: 'Other' },
];

const STATUS_OPTIONS = [
  { value: LEAD_STATUSES.NEW, label: 'New' },
  { value: LEAD_STATUSES.CONTACTED, label: 'Contacted' },
  { value: LEAD_STATUSES.QUALIFIED, label: 'Qualified' },
  { value: LEAD_STATUSES.PROPOSAL, label: 'Proposal' },
  { value: LEAD_STATUSES.NEGOTIATION, label: 'Negotiation' },
  { value: LEAD_STATUSES.CLOSED_WON, label: 'Won' },
  { value: LEAD_STATUSES.CLOSED_LOST, label: 'Lost' },
  { value: LEAD_STATUSES.ARCHIVED, label: 'Archived' },
];

export function LeadForm({ lead, onSuccess, onCancel, tenantId }: LeadFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formValues, setFormValues] = useState<Record<string, string>>({
    full_name: lead?.full_name || '',
    phone: lead?.phone || '',
    email: lead?.email || '',
    source: lead?.source || '',
    status: lead?.status || LEAD_STATUSES.NEW,
    budget_min: lead?.budget_min?.toString() || '',
    budget_max: lead?.budget_max?.toString() || '',
    preferred_location: lead?.preferred_location || '',
    property_type: lead?.property_type || '',
    notes: lead?.notes || '',
  });

  const isEditing = !!lead;

  const handleChange = (field: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
    // Clear field error on change
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrors({});

    // Client-side validation
    const result = leadFormSchema.safeParse(formValues);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as string;
        if (!fieldErrors[field]) {
          fieldErrors[field] = err.message;
        }
      });
      setErrors(fieldErrors);
      setIsSubmitting(false);
      return;
    }

    try {
      const url = isEditing
        ? `/api/leads/${lead!.id}`
        : '/api/leads';

      const method = isEditing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'current-user',
          'x-tenant-id': tenantId,
          'x-user-role': 'agent',
        },
        body: JSON.stringify({
          ...result.data,
          phone: result.data.phone || null,
          email: result.data.email || null,
          source: result.data.source || null,
          preferred_location: result.data.preferred_location || null,
          property_type: result.data.property_type || null,
          notes: result.data.notes || null,
        }),
      });

      const response = await res.json();

      if (!res.ok) {
        throw new Error(response.error || 'Failed to save lead');
      }

      toast({
        title: isEditing ? 'Lead Updated' : 'Lead Created',
        description: `${response.data.full_name} has been ${isEditing ? 'updated' : 'created'} successfully.`,
        variant: 'success',
      });

      onSuccess?.(response.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Full Name */}
      <div className="space-y-2">
        <Label htmlFor="full_name">
          Full Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="full_name"
          value={formValues.full_name}
          onChange={(e) => handleChange('full_name', e.target.value)}
          placeholder="Enter lead name"
          className={errors.full_name ? 'border-destructive' : ''}
        />
        {errors.full_name && (
          <p className="text-xs text-destructive">{errors.full_name}</p>
        )}
      </div>

      {/* Phone & Email Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={formValues.phone}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder="+91XXXXXXXXXX or 10 digits"
            className={errors.phone ? 'border-destructive' : ''}
          />
          {errors.phone && (
            <p className="text-xs text-destructive">{errors.phone}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={formValues.email}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder="email@example.com"
            className={errors.email ? 'border-destructive' : ''}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email}</p>
          )}
        </div>
      </div>

      {/* Source & Status Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="source">Source</Label>
          <Select
            value={formValues.source}
            onValueChange={(v) => handleChange('source', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select source" />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isEditing && (
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={formValues.status}
              onValueChange={(v) => handleChange('status', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Budget Range Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="budget_min">Min Budget</Label>
          <Input
            id="budget_min"
            type="number"
            min={0}
            value={formValues.budget_min}
            onChange={(e) => handleChange('budget_min', e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="budget_max">Max Budget</Label>
          <Input
            id="budget_max"
            type="number"
            min={0}
            value={formValues.budget_max}
            onChange={(e) => handleChange('budget_max', e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      {/* Location & Property Type Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="preferred_location">Preferred Location</Label>
          <Input
            id="preferred_location"
            value={formValues.preferred_location}
            onChange={(e) => handleChange('preferred_location', e.target.value)}
            placeholder="e.g., Bandra, Andheri"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="property_type">Property Type</Label>
          <Select
            value={formValues.property_type}
            onValueChange={(v) => handleChange('property_type', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {PROPERTY_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={formValues.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          placeholder="Additional notes about this lead..."
          rows={4}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1" />
          )}
          {isEditing ? 'Update Lead' : 'Create Lead'}
        </Button>
      </div>
    </form>
  );
}
