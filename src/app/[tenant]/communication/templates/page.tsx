'use client';

import { useState, useEffect } from 'react';

import {
  Plus,
  RefreshCw,
  AlertCircle,
  Search,
  LayoutTemplate,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Toaster } from '@/components/ui/toaster';
import {
  TemplateEditor,
  TemplateCard,
  type MessageTemplate,
} from '@/components/communication/TemplateEditor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const CHANNEL_OPTIONS = [
  { value: '', label: 'All Channels' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
];

// Sample templates for demo
// ---------------------------------------------------------------------------

const SAMPLE_TEMPLATES: MessageTemplate[] = [
  {
    id: '1',
    name: 'Welcome Message',
    channel: 'whatsapp',
    content:
      'Hi {{name}}! 👋\n\nThank you for reaching out to EstateFlow. We are excited to help you find the perfect property.\n\nHere is a quick overview of what we offer:\n• Luxury apartments\n• Independent houses\n• Commercial spaces\n• Plots & land\n\nFeel free to reply with any questions!\n\nBest,\n{{agent_name}}',
    variables: [
      { key: 'name', label: 'Lead Name', defaultValue: 'Ravi', required: true },
      { key: 'agent_name', label: 'Agent Name', defaultValue: 'Priya', required: true },
    ],
    category: 'Welcome',
    createdAt: '2025-06-15T10:30:00Z',
    updatedAt: '2025-06-15T10:30:00Z',
  },
  {
    id: '2',
    name: 'Property Follow-Up',
    channel: 'sms',
    content:
      'Hi {{name}}, this is {{agent_name}} from EstateFlow. You had shown interest in {{property_type}} near {{location}}. We have some great options starting from ₹{{budget}}. Would you like to schedule a site visit? Reply YES or call us.',
    variables: [
      { key: 'name', label: 'Lead Name', defaultValue: 'Amit', required: true },
      { key: 'agent_name', label: 'Agent Name', defaultValue: 'Sneha', required: true },
      { key: 'property_type', label: 'Property Type', defaultValue: 'apartment', required: true },
      { key: 'location', label: 'Location', defaultValue: 'Whitefield', required: true },
      { key: 'budget', label: 'Budget', defaultValue: '50 Lakhs', required: true },
    ],
    category: 'Follow-up',
    createdAt: '2025-06-14T14:00:00Z',
    updatedAt: '2025-06-16T09:00:00Z',
  },
  {
    id: '3',
    name: 'Appointment Reminder',
    channel: 'whatsapp',
    content:
      '🔔 Reminder: Site Visit Tomorrow!\n\nHi {{name}},\n\nThis is a reminder for your scheduled site visit:\n\n📍 Property: {{property_title}}\n📅 Date: {{date}}\n⏰ Time: {{time}}\n📍 Location: {{location}}\n\nPlease confirm your availability by replying YES.\n\nThanks,\n{{agent_name}}',
    variables: [
      { key: 'name', label: 'Lead Name', defaultValue: 'Deepa', required: true },
      { key: 'property_title', label: 'Property Title', defaultValue: '3 BHK Villa', required: true },
      { key: 'date', label: 'Date', defaultValue: '25 June', required: true },
      { key: 'time', label: 'Time', defaultValue: '11:00 AM', required: true },
      { key: 'location', label: 'Location', defaultValue: 'Sarjapur Road', required: true },
      { key: 'agent_name', label: 'Agent Name', defaultValue: 'Raj', required: true },
    ],
    category: 'Reminder',
    createdAt: '2025-06-13T08:00:00Z',
    updatedAt: '2025-06-17T16:00:00Z',
  },
  {
    id: '4',
    name: 'New Property Alert',
    channel: 'email',
    subject: 'Exciting New Properties in {{location}}!',
    content:
      'Hi {{name}},\n\nGreat news! We have just listed some amazing new properties in {{location}} that match your preferences:\n\n🏠 {{property_title_1}} - ₹{{price_1}}\n🏠 {{property_title_2}} - ₹{{price_2}}\n🏠 {{property_title_3}} - ₹{{price_3}}\n\nClick here to view full details:\n{{listing_url}}\n\nInterested? Reply to this email or call {{agent_phone}}.\n\nBest regards,\n{{agent_name}}\nEstateFlow CRM',
    variables: [
      { key: 'name', label: 'Lead Name', defaultValue: 'Vikram', required: true },
      { key: 'location', label: 'Location', defaultValue: 'Electronic City', required: true },
      { key: 'property_title_1', label: 'Property 1 Title', defaultValue: '2 BHK Apartment', required: true },
      { key: 'price_1', label: 'Property 1 Price', defaultValue: '45 Lakhs', required: true },
      { key: 'property_title_2', label: 'Property 2 Title', defaultValue: '3 BHK Duplex', required: true },
      { key: 'price_2', label: 'Property 2 Price', defaultValue: '75 Lakhs', required: true },
      { key: 'property_title_3', label: 'Property 3 Title', defaultValue: 'Villa', required: true },
      { key: 'price_3', label: 'Property 3 Price', defaultValue: '1.2 Cr', required: true },
      { key: 'listing_url', label: 'Listing URL', defaultValue: 'https://estateflow.com/properties', required: false },
      { key: 'agent_phone', label: 'Agent Phone', defaultValue: '+91 98765 43210', required: true },
      { key: 'agent_name', label: 'Agent Name', defaultValue: 'Ananya', required: true },
    ],
    category: 'Marketing',
    createdAt: '2025-06-10T12:00:00Z',
    updatedAt: '2025-06-18T11:30:00Z',
  },
  {
    id: '5',
    name: 'Thank You - Site Visit',
    channel: 'whatsapp',
    content:
      'Hi {{name}}! 🙏\n\nThank you for visiting {{property_title}} today. We hope you enjoyed the tour.\n\nHere is a quick recap:\n📍 {{location}}\n💰 ₹{{price}}\n🛏️ {{bedrooms}} BHK\n📐 {{area}} sq.ft.\n\nIf you have any questions or would like to discuss further, please feel free to reach out.\n\nLooking forward to hearing from you!\n\n{{agent_name}}',
    variables: [
      { key: 'name', label: 'Lead Name', defaultValue: 'Suresh', required: true },
      { key: 'property_title', label: 'Property Title', defaultValue: '3 BHK Independent House', required: true },
      { key: 'location', label: 'Location', defaultValue: 'HSR Layout', required: true },
      { key: 'price', label: 'Price', defaultValue: '85 Lakhs', required: true },
      { key: 'bedrooms', label: 'Bedrooms', defaultValue: '3', required: true },
      { key: 'area', label: 'Area', defaultValue: '1500', required: true },
      { key: 'agent_name', label: 'Agent Name', defaultValue: 'Meera', required: true },
    ],
    category: 'Follow-up',
    createdAt: '2025-06-08T16:00:00Z',
    updatedAt: '2025-06-19T10:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CommunicationTemplatesPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const [tenant, setTenant] = useState('');
  const [templates, setTemplates] = useState<MessageTemplate[]>(SAMPLE_TEMPLATES);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Resolve params
  useEffect(() => {
    params.then((p) => setTenant(p.tenant));
  }, [params]);

  // Simulate loading
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  // Filter templates
  const filteredTemplates = templates.filter((t) => {
    const matchesSearch =
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.content.toLowerCase().includes(search.toLowerCase()) ||
      (t.category || '').toLowerCase().includes(search.toLowerCase());

    const matchesChannel = !channelFilter || t.channel === channelFilter;

    return matchesSearch && matchesChannel;
  });

  // Handle save (create or update)
  const handleSave = async (template: MessageTemplate) => {
    setIsSaving(true);
    setSaveError(null);

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 800));

      if (template.id) {
        // Update existing
        setTemplates((prev) =>
          prev.map((t) => (t.id === template.id ? template : t))
        );
      } else {
        // Create new
        const newTemplate: MessageTemplate = {
          ...template,
          id: `template-${Date.now()}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setTemplates((prev) => [newTemplate, ...prev]);
      }

      setShowCreateDialog(false);
      setEditingTemplate(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save template';
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle delete
  const handleDelete = (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  // Handle edit
  const handleEdit = (template: MessageTemplate) => {
    setEditingTemplate(template);
    setShowCreateDialog(true);
  };

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="h-8 w-48 rounded bg-muted" />
                <div className="h-4 w-32 rounded bg-muted mt-2" />
              </div>
              <div className="h-9 w-36 rounded bg-muted" />
            </div>
            <div className="h-10 w-full rounded bg-muted" />
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-20 rounded-lg bg-muted" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------
  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="rounded-full bg-destructive/10 p-4 mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold mb-1">Failed to load templates</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Reload
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-background">
      <Toaster />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Message Templates</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Create and manage reusable message templates with dynamic variables
              <span className="ml-1">· {templates.length} templates</span>
            </p>
          </div>
          <Button onClick={() => { setEditingTemplate(null); setShowCreateDialog(true); }}>
            <Plus className="h-4 w-4 mr-1" />
            New Template
          </Button>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col gap-3 sm:flex-row mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates by name, content or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <div className="w-full sm:w-44">
            <Select
              value={channelFilter}
              onValueChange={setChannelFilter}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="All Channels" />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Templates list */}
        {filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="rounded-full bg-muted p-4 mb-3">
              <LayoutTemplate className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold mb-1">No templates found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mb-4">
              {search || channelFilter
                ? 'Try adjusting your search or filter criteria.'
                : 'Create your first message template to get started.'}
            </p>
            {!search && !channelFilter && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setEditingTemplate(null); setShowCreateDialog(true); }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Create Template
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onEdit={() => handleEdit(template)}
                onDelete={() => template.id && handleDelete(template.id)}
              />
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? 'Edit Template' : 'Create New Template'}
              </DialogTitle>
            </DialogHeader>
            <TemplateEditor
              template={editingTemplate || undefined}
              onSave={handleSave}
              onCancel={() => {
                setShowCreateDialog(false);
                setEditingTemplate(null);
              }}
              isSaving={isSaving}
              error={saveError}
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
