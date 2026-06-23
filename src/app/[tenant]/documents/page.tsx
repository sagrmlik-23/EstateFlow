'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  FileText,
  Upload,
  Plus,
  RefreshCw,
  AlertCircle,
  Search,
  FolderOpen,
  File,
  FileSpreadsheet,
  FileImage,
  Download,
  Eye,
  Trash2,
  MoreHorizontal,
  Grid,
  List,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn, formatDate } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Document {
  id: string;
  name: string;
  type: string;
  category: string;
  file_size: string;
  uploaded_by: string;
  uploaded_at: string;
  lead_name?: string;
  deal_name?: string;
}

interface Category {
  id: string;
  name: string;
  count: number;
  icon: string;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
function getCategories(): Category[] {
  return [
    { id: 'all', name: 'All Documents', count: 24, icon: 'FolderOpen' },
    { id: 'property', name: 'Property Documents', count: 8, icon: 'FileText' },
    { id: 'legal', name: 'Legal & Agreements', count: 5, icon: 'FileText' },
    { id: 'client', name: 'Client Documents', count: 6, icon: 'FileText' },
    { id: 'financial', name: 'Financial', count: 3, icon: 'FileSpreadsheet' },
    { id: 'marketing', name: 'Marketing', count: 2, icon: 'FileImage' },
  ];
}

function getDocuments(): Document[] {
  return [
    { id: 'd1', name: 'Property Brochure - Lakeview.pdf', type: 'pdf', category: 'property', file_size: '2.4 MB', uploaded_by: 'Rahul Sharma', uploaded_at: '2026-06-15T10:30:00Z', lead_name: 'Rajesh Kumar' },
    { id: 'd2', name: 'Sale Agreement - Green Park.docx', type: 'doc', category: 'legal', file_size: '856 KB', uploaded_by: 'Priya Patel', uploaded_at: '2026-06-14T14:00:00Z', deal_name: '3BHK Apartment - Green Park' },
    { id: 'd3', name: 'Client KYC - Anita Desai.pdf', type: 'pdf', category: 'client', file_size: '1.2 MB', uploaded_by: 'Amit Singh', uploaded_at: '2026-06-13T09:15:00Z', lead_name: 'Anita Desai' },
    { id: 'd4', name: 'Floor Plan - Tower A.pdf', type: 'pdf', category: 'property', file_size: '3.1 MB', uploaded_by: 'Rahul Sharma', uploaded_at: '2026-06-12T16:45:00Z' },
    { id: 'd5', name: 'Expense Report - June.xlsx', type: 'xlsx', category: 'financial', file_size: '456 KB', uploaded_by: 'Sneha Gupta', uploaded_at: '2026-06-11T11:00:00Z' },
    { id: 'd6', name: 'Property Photos - Green Valley.zip', type: 'zip', category: 'property', file_size: '15.6 MB', uploaded_by: 'Priya Patel', uploaded_at: '2026-06-10T08:30:00Z' },
    { id: 'd7', name: 'Social Media Post - June.png', type: 'png', category: 'marketing', file_size: '3.2 MB', uploaded_by: 'Marketing Team', uploaded_at: '2026-06-09T13:00:00Z' },
    { id: 'd8', name: 'NOC Certificate.pdf', type: 'pdf', category: 'legal', file_size: '980 KB', uploaded_by: 'Legal Team', uploaded_at: '2026-06-08T10:00:00Z' },
  ];
}

function getTemplates() {
  return [
    { id: 't1', name: 'Sale Agreement Template', category: 'legal' },
    { id: 't2', name: 'Rental Agreement Template', category: 'legal' },
    { id: 't3', name: 'Offer Letter Template', category: 'property' },
    { id: 't4', name: 'NDA Template', category: 'legal' },
  ];
}

// ---------------------------------------------------------------------------
// File type icon helper
// ---------------------------------------------------------------------------
function getFileIcon(type: string) {
  switch (type) {
    case 'pdf':
      return <FileText className="h-4 w-4 text-red-500" />;
    case 'doc':
    case 'docx':
      return <FileText className="h-4 w-4 text-blue-500" />;
    case 'xlsx':
    case 'xls':
      return <FileSpreadsheet className="h-4 w-4 text-emerald-500" />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
      return <FileImage className="h-4 w-4 text-purple-500" />;
    default:
      return <File className="h-4 w-4 text-muted-foreground" />;
  }
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------
export default function DocumentsPage() {
  const params = useParams<{ tenant: string }>();
  const tenant = params?.tenant ?? '';

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [categories] = useState<Category[]>(getCategories());
  const [templates] = useState(getTemplates());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showPreview, setShowPreview] = useState<Document | null>(null);

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await new Promise((r) => setTimeout(r, 500));
      setDocuments(getDocuments());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const filteredDocs = documents.filter((doc) => {
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'all' || doc.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  // Loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6 animate-pulse">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-10 w-full rounded bg-muted" />
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 rounded-lg bg-muted" />
            ))}
          </div>
          <div className="h-64 rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="rounded-full bg-destructive/10 p-4 mb-4 inline-block">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Failed to load documents</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" onClick={fetchDocuments}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
            <p className="text-sm text-muted-foreground">
              Manage, upload, and generate documents
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowTemplateDialog(true)}>
              <FileText className="h-4 w-4 mr-1" />
              From Template
            </Button>
            <Button onClick={() => setShowUploadDialog(true)}>
              <Upload className="h-4 w-4 mr-1" />
              Upload
            </Button>
          </div>
        </div>

        {/* Search & View Toggle */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-9 w-9 rounded-none rounded-l-md"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-9 w-9 rounded-none rounded-r-md"
              onClick={() => setViewMode('grid')}
            >
              <Grid className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Category Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors hover:bg-accent/50',
                activeCategory === cat.id && 'border-primary bg-primary/5'
              )}
            >
              <FolderOpen className="h-5 w-5 text-muted-foreground mb-1" />
              <p className="text-sm font-medium truncate">{cat.name}</p>
              <p className="text-xs text-muted-foreground">{cat.count} files</p>
            </button>
          ))}
        </div>

        {/* Document List/Grid */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {activeCategory === 'all' ? 'All Documents' : categories.find((c) => c.id === activeCategory)?.name || 'Documents'}
              </CardTitle>
              <Badge variant="secondary">{filteredDocs.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {filteredDocs.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-base font-medium mb-1">No documents found</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {searchQuery ? 'Try a different search term' : 'Upload your first document to get started'}
                </p>
                {!searchQuery && (
                  <Button onClick={() => setShowUploadDialog(true)}>
                    <Upload className="h-4 w-4 mr-1" />
                    Upload Document
                  </Button>
                )}
              </div>
            ) : viewMode === 'list' ? (
              <div className="divide-y">
                {filteredDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 hover:bg-accent/30 -mx-2 px-2 rounded transition-colors"
                  >
                    <div className="rounded p-1.5 bg-muted shrink-0">
                      {getFileIcon(doc.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{doc.file_size}</span>
                        <span>·</span>
                        <span>{formatDate(doc.uploaded_at)}</span>
                        {doc.lead_name && (
                          <>
                            <span>·</span>
                            <span>{doc.lead_name}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setShowPreview(doc)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Grid View */
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="rounded-lg border p-3 hover:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => setShowPreview(doc)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="rounded p-2 bg-muted">
                        {getFileIcon(doc.type)}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <MoreHorizontal className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{doc.file_size}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(doc.uploaded_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upload Dialog */}
        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Upload Document</DialogTitle>
              <DialogDescription>
                Upload a document to the CRM. Supported formats: PDF, DOC, DOCX, XLSX, Images
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Drop zone */}
              <div className="border-2 border-dashed rounded-lg p-8 text-center hover:bg-accent/50 transition-colors cursor-pointer">
                <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">Drop files here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">Max file size: 25 MB</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select defaultValue="property">
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="property">Property Documents</SelectItem>
                    <SelectItem value="legal">Legal & Agreements</SelectItem>
                    <SelectItem value="client">Client Documents</SelectItem>
                    <SelectItem value="financial">Financial</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="related">Link to (optional)</Label>
                <Select defaultValue="">
                  <SelectTrigger>
                    <SelectValue placeholder="Link to lead or deal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    <SelectItem value="lead_001">Rajesh Kumar (Lead)</SelectItem>
                    <SelectItem value="deal_001">3BHK - Green Park (Deal)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
                Cancel
              </Button>
              <Button onClick={() => setShowUploadDialog(false)}>
                <Upload className="h-4 w-4 mr-1" />
                Upload
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Template Dialog */}
        <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Generate from Template</DialogTitle>
              <DialogDescription>
                Choose a template to generate a new document
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  className="w-full text-left rounded-lg border p-3 hover:bg-accent/50 transition-colors flex items-center gap-3"
                >
                  <div className="rounded p-1.5 bg-muted">
                    <FileText className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{template.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{template.category}</p>
                  </div>
                  <Button variant="ghost" size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Use
                  </Button>
                </button>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Preview Dialog */}
        <Dialog open={!!showPreview} onOpenChange={(o) => !o && setShowPreview(null)}>
          {showPreview && (
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {getFileIcon(showPreview.type)}
                  {showPreview.name}
                </DialogTitle>
                <DialogDescription>
                  {showPreview.file_size} · Uploaded {formatDate(showPreview.uploaded_at)} by {showPreview.uploaded_by}
                </DialogDescription>
              </DialogHeader>
              <div className="bg-muted rounded-lg h-64 flex items-center justify-center">
                <div className="text-center">
                  {showPreview.type === 'pdf' ? (
                    <FileText className="h-12 w-12 text-red-400 mx-auto mb-2" />
                  ) : showPreview.type === 'png' || showPreview.type === 'jpg' ? (
                    <FileImage className="h-12 w-12 text-purple-400 mx-auto mb-2" />
                  ) : (
                    <File className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                  )}
                  <p className="text-sm text-muted-foreground">Preview not available</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Download the file to view its contents
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowPreview(null)}>
                  Close
                </Button>
                <Button>
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
              </DialogFooter>
            </DialogContent>
          )}
        </Dialog>
      </div>
    </div>
  );
}
