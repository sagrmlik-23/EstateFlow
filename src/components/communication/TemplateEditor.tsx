'use client';

import { useState, useCallback } from 'react';
import {
  Plus,
  X,
  Eye,
  Edit3,
  Copy,
  Check,
  AlertCircle,
  GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateVariable {
  key: string;
  label: string;
  defaultValue: string;
  required: boolean;
}

export interface MessageTemplate {
  id?: string;
  name: string;
  channel: 'whatsapp' | 'sms' | 'email';
  subject?: string;
  content: string;
  variables: TemplateVariable[];
  category?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const DEFAULT_CHANNEL_OPTIONS = ['whatsapp', 'sms', 'email'] as const;

export const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TemplateEditorProps {
  template?: MessageTemplate;
  onSave: (template: MessageTemplate) => void;
  onCancel?: () => void;
  isSaving?: boolean;
  error?: string | null;
}

// ---------------------------------------------------------------------------
// Variable tag helpers
// ---------------------------------------------------------------------------

const VARIABLE_REGEX = /\{\{(\w+)\}\}/g;

function extractVariables(content: string): string[] {
  const matches = content.match(VARIABLE_REGEX);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, '')))];
}

function interpolateTemplate(content: string, variables: Record<string, string>): string {
  return content.replace(VARIABLE_REGEX, (_, key) => variables[key] || `{{${key}}}`);
}

// ---------------------------------------------------------------------------
// Preview with sample data
// ---------------------------------------------------------------------------

function PreviewPanel({
  content,
  variables,
}: {
  content: string;
  variables: TemplateVariable[];
}) {
  const sampleValues: Record<string, string> = {};
  variables.forEach((v) => {
    sampleValues[v.key] = v.defaultValue || `[${v.label}]`;
  });

  const previewText = interpolateTemplate(content, sampleValues);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Eye className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Preview</span>
      </div>
      <div className="rounded-md bg-muted/50 p-3">
        <p className="text-sm whitespace-pre-wrap break-words">{previewText}</p>
      </div>
      {variables.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs text-muted-foreground font-medium">Sample values used:</p>
          <div className="flex flex-wrap gap-1.5">
            {variables.map((v) => (
              <Badge key={v.key} variant="secondary" className="text-[10px]">
                {`{{${v.key}}}`} → {sampleValues[v.key]}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TemplateEditor({
  template,
  onSave,
  onCancel,
  isSaving = false,
  error = null,
}: TemplateEditorProps) {
  const isEditing = !!template?.id;

  const [name, setName] = useState(template?.name || '');
  const [channel, setChannel] = useState<'whatsapp' | 'sms' | 'email'>(
    template?.channel || 'whatsapp'
  );
  const [subject, setSubject] = useState(template?.subject || '');
  const [content, setContent] = useState(template?.content || '');
  const [variables, setVariables] = useState<TemplateVariable[]>(
    template?.variables || []
  );
  const [category, setCategory] = useState(template?.category || '');

  // Sync variables from content
  const [activeTab, setActiveTab] = useState('edit');

  const updateVariablesFromContent = useCallback(() => {
    const keysInContent = extractVariables(content);
    setVariables((prev) => {
      const existingMap = new Map(prev.map((v) => [v.key, v]));
      const updated: TemplateVariable[] = keysInContent.map((key) => {
        if (existingMap.has(key)) return existingMap.get(key)!;
        return {
          key,
          label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          defaultValue: '',
          required: true,
        };
      });
      // Keep existing variables that are no longer in content but were user-added
      prev.forEach((v) => {
        if (!keysInContent.includes(v.key) && !updated.find((u) => u.key === v.key)) {
          // Only add back if it has a non-empty default or was explicitly saved
        }
      });
      return updated;
    });
  }, [content]);

  // Sync variables when content changes (debounced by the user clicking "Sync")
  const handleSyncVariables = () => {
    updateVariablesFromContent();
  };

  // Add a new variable
  const addVariable = () => {
    const baseKey = `var_${variables.length + 1}`;
    setVariables((prev) => [
      ...prev,
      {
        key: baseKey,
        label: `Variable ${variables.length + 1}`,
        defaultValue: '',
        required: true,
      },
    ]);
  };

  // Update a variable
  const updateVariable = (index: number, field: keyof TemplateVariable, value: string | boolean) => {
    setVariables((prev) => {
      const updated = [...prev];
      const current = updated[index];
      if (!current) return prev;
      if (field === 'key') updated[index] = { key: value as string, label: current.label, defaultValue: current.defaultValue, required: current.required };
      else if (field === 'label') updated[index] = { key: current.key, label: value as string, defaultValue: current.defaultValue, required: current.required };
      else if (field === 'defaultValue') updated[index] = { key: current.key, label: current.label, defaultValue: value as string, required: current.required };
      else if (field === 'required') updated[index] = { key: current.key, label: current.label, defaultValue: current.defaultValue, required: value as boolean };
      return updated;
    });
  };

  // Remove a variable
  const removeVariable = (index: number) => {
    setVariables((prev) => prev.filter((_, i) => i !== index));
  };

  // Insert variable tag into content
  const insertVariableTag = (key: string) => {
    setContent((prev) => prev + `{{${key}}}`);
  };

  // Save
  const handleSave = () => {
    if (!name.trim() || !content.trim()) return;

    onSave({
      id: template?.id,
      name: name.trim(),
      channel,
      subject: channel === 'email' ? subject.trim() : undefined,
      content: content.trim(),
      variables,
      category: category || undefined,
      createdAt: template?.createdAt,
      updatedAt: new Date().toISOString(),
    });
  };

  const isFormValid = name.trim() && content.trim();

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {isEditing ? 'Edit Template' : 'Create Template'}
          </h2>
          <TabsList className="h-8">
            <TabsTrigger value="edit" className="text-xs px-3">
              <Edit3 className="h-3.5 w-3.5 mr-1" />
              Edit
            </TabsTrigger>
            <TabsTrigger value="preview" className="text-xs px-3">
              <Eye className="h-3.5 w-3.5 mr-1" />
              Preview
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="edit" className="mt-0 space-y-4">
          {/* Basic info */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="template-name" className="text-xs text-muted-foreground">
                Template Name *
              </Label>
              <Input
                id="template-name"
                placeholder="e.g., Welcome Message"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="template-channel" className="text-xs text-muted-foreground">
                Channel *
              </Label>
              <Select
                value={channel}
                onValueChange={(v) => setChannel(v as 'whatsapp' | 'sms' | 'email')}
              >
                <SelectTrigger id="template-channel" className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_CHANNEL_OPTIONS.map((ch) => (
                    <SelectItem key={ch} value={ch}>
                      {CHANNEL_LABELS[ch]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="template-category" className="text-xs text-muted-foreground">
              Category (optional)
            </Label>
            <Input
              id="template-category"
              placeholder="e.g., Welcome, Follow-up, Reminder"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          {/* Email subject */}
          {channel === 'email' && (
            <div className="space-y-1.5">
              <Label htmlFor="template-subject" className="text-xs text-muted-foreground">
                Email Subject
              </Label>
              <Input
                id="template-subject"
                placeholder="Subject line with {{variables}}"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          )}

          {/* Content */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="template-content" className="text-xs text-muted-foreground">
                Message Content *
              </Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1"
                onClick={handleSyncVariables}
              >
                <Copy className="h-3 w-3" />
                Sync variables
              </Button>
            </div>
            <Textarea
              id="template-content"
              placeholder={`Hello {{name}}, thank you for your interest in {{property}}!`}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              className="text-sm resize-y min-h-[100px]"
            />
            <p className="text-xs text-muted-foreground">
              Use {'{{variable_name}}'} to add dynamic content
            </p>
          </div>

          {/* Variables */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Template Variables</CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={addVariable}
              >
                <Plus className="h-3 w-3" />
                Add Variable
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {variables.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No variables defined yet. Use {'{{variable_name}}'} in your content or click "Add Variable".
                </p>
              )}
              {variables.map((variable, index) => (
                <div
                  key={index}
                  className="flex flex-wrap items-start gap-2 rounded-lg border bg-muted/30 p-2.5"
                >
                  <div className="flex-1 min-w-0 space-y-1.5 sm:space-y-0 sm:flex sm:items-center sm:gap-2">
                    {/* Key */}
                    <div className="flex-1">
                      <Input
                        placeholder="Variable key"
                        value={variable.key}
                        onChange={(e) => updateVariable(index, 'key', e.target.value)}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground hidden sm:inline">→</span>
                    {/* Label */}
                    <div className="flex-1">
                      <Input
                        placeholder="Label"
                        value={variable.label}
                        onChange={(e) => updateVariable(index, 'label', e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    {/* Default value */}
                    <div className="flex-1">
                      <Input
                        placeholder="Sample value"
                        value={variable.defaultValue}
                        onChange={(e) => updateVariable(index, 'defaultValue', e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => insertVariableTag(variable.key)}
                      title="Insert tag"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removeVariable(index)}
                      title="Remove variable"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview" className="mt-0">
          <PreviewPanel content={content} variables={variables} />
        </TabsContent>
      </Tabs>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && (
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
        )}
        <Button size="sm" onClick={handleSave} disabled={!isFormValid || isSaving}>
          {isSaving ? (
            <>
              <span className="h-4 w-4 mr-1 animate-spin rounded-full border-2 border-background border-t-transparent" />
              Saving...
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-1" />
              {isEditing ? 'Update Template' : 'Create Template'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template card (for listing)
// ---------------------------------------------------------------------------

export function TemplateCard({
  template,
  onEdit,
  onDelete,
}: {
  template: MessageTemplate;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const totalVars = template.variables.length;

  return (
    <Card className="hover:bg-accent/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold truncate">{template.name}</h3>
              <Badge variant="secondary" className="text-[10px] h-5">
                {CHANNEL_LABELS[template.channel]}
              </Badge>
              {template.category && (
                <Badge variant="outline" className="text-[10px] h-5">
                  {template.category}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {template.content}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{totalVars} variable{totalVars !== 1 ? 's' : ''}</span>
              {template.updatedAt && (
                <>
                  <span>·</span>
                  <span>Updated {template.updatedAt}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onEdit && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
                <Edit3 className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
