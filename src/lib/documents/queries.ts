// ============================================================================
// EstateFlow CRM — Document Management & PDF Generation Queries
// Phase 6 — Documents, Forms, Tasks v1.0.0
// ============================================================================
//
// Manages uploaded documents (via existing `documents` table) and provides
// document templates for PDF generation (agreement, MOU, receipt, NOC, booking).
//
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import type { PaginationParams, PaginationMeta } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DocumentCategory =
  | 'contract'
  | 'agreement'
  | 'id_proof'
  | 'property_doc'
  | 'other';

export type DocumentTemplateType =
  | 'agreement'
  | 'mou'
  | 'receipt'
  | 'noc'
  | 'booking_form';

export interface DocumentRow {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  deal_id: string | null;
  property_id: string | null;
  uploaded_by: string | null;
  name: string;
  file_type: string | null;
  file_size: number | null;
  storage_url: string;
  category: string | null;
  created_at: string;
}

export interface CreateDocumentInput {
  title: string;
  type?: DocumentTemplateType;
  content?: string;
  lead_id?: string | null;
  deal_id?: string | null;
  property_id?: string | null;
  name?: string;
  file_type?: string;
  file_size?: number;
  storage_url?: string;
  category?: DocumentCategory;
}

export interface UpdateDocumentInput {
  name?: string;
  category?: DocumentCategory;
  file_type?: string;
  file_size?: number;
  storage_url?: string;
}

export interface DocumentFilters {
  category?: DocumentCategory;
  lead_id?: string;
  deal_id?: string;
  property_id?: string;
  uploaded_by?: string;
  created_after?: string;
  created_before?: string;
}

export interface DocumentTemplate {
  id: DocumentTemplateType;
  name: string;
  description: string;
  default_fields: string[];
}

// ---------------------------------------------------------------------------
// Document template definitions
// ---------------------------------------------------------------------------

const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: 'agreement',
    name: 'Sales Agreement',
    description: 'Standard property sale/purchase agreement between buyer and seller',
    default_fields: [
      'buyer_name', 'seller_name', 'property_address', 'property_area',
      'total_amount', 'advance_amount', 'balance_amount', 'payment_terms',
      'possession_date', 'additional_terms',
    ],
  },
  {
    id: 'mou',
    name: 'Memorandum of Understanding',
    description: 'Non-binding preliminary agreement outlining mutual terms',
    default_fields: [
      'party_a_name', 'party_b_name', 'property_details', 'proposed_price',
      'due_diligence_period', 'earnest_money', 'validity_date', 'terms',
    ],
  },
  {
    id: 'receipt',
    name: 'Payment Receipt',
    description: 'Acknowledgment of payment received from a client',
    default_fields: [
      'payer_name', 'amount', 'amount_in_words', 'payment_mode',
      'payment_date', 'for_property', 'transaction_id', 'remarks',
    ],
  },
  {
    id: 'noc',
    name: 'No Objection Certificate',
    description: 'Certificate stating no objection from relevant authority',
    default_fields: [
      'issuing_authority', 'property_details', 'owner_name',
      'noc_date', 'valid_until', 'reference_number', 'remarks',
    ],
  },
  {
    id: 'booking_form',
    name: 'Booking Form',
    description: 'Property booking/application form for prospective buyers',
    default_fields: [
      'applicant_name', 'applicant_phone', 'applicant_email', 'property_name',
      'unit_number', 'total_price', 'booking_amount', 'booking_date',
      'expected_loan_amount', 'id_proof_type', 'id_proof_number', 'terms_accepted',
    ],
  },
];

// ---------------------------------------------------------------------------
// Supabase client (lazy init)
// ---------------------------------------------------------------------------

let _supabase: ReturnType<typeof createClient> | null = null;

function getDb() {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.',
    );
  }

  _supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return _supabase;
}

// ---------------------------------------------------------------------------
// 1. getDocumentTemplates — List available templates
// ---------------------------------------------------------------------------

export function getDocumentTemplates(): DocumentTemplate[] {
  return DOCUMENT_TEMPLATES;
}

// ---------------------------------------------------------------------------
// 2. createDocument — Insert a document record
// ---------------------------------------------------------------------------

export async function createDocument(tenantId: string, data: CreateDocumentInput, uploadedBy: string): Promise<DocumentRow> {
  const supabase = getDb();

  const insertData: Record<string, any> = {
    tenant_id: tenantId,
    name: data.name || data.title || 'Untitled Document',
    file_type: data.file_type ?? null,
    file_size: data.file_size ?? null,
    storage_url: data.storage_url ?? '',
    category: data.category ?? 'other',
    lead_id: data.lead_id ?? null,
    deal_id: data.deal_id ?? null,
    property_id: data.property_id ?? null,
    uploaded_by: uploadedBy,
  };

  const { data: result, error } = await (supabase.from('documents') as any)
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('[documents/queries] createDocument error:', error);
    throw new Error(`Failed to create document: ${error.message}`);
  }

  return result as DocumentRow;
}

// ---------------------------------------------------------------------------
// 3. getDocuments — Paginated list with filters
// ---------------------------------------------------------------------------

export async function getDocuments(
  tenantId: string,
  filters: DocumentFilters = {},
  pagination: PaginationParams = { page: 1, limit: 20, offset: 0 },
  sortBy: string = 'created_at',
  sortDir: 'asc' | 'desc' = 'desc',
): Promise<{ data: DocumentRow[]; meta: PaginationMeta }> {
  const supabase = getDb();

  let query = supabase
    .from('documents')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (filters.category) query = query.eq('category', filters.category);
  if (filters.lead_id) query = query.eq('lead_id', filters.lead_id);
  if (filters.deal_id) query = query.eq('deal_id', filters.deal_id);
  if (filters.property_id) query = query.eq('property_id', filters.property_id);
  if (filters.uploaded_by) query = query.eq('uploaded_by', filters.uploaded_by);
  if (filters.created_after) query = query.gte('created_at', filters.created_after);
  if (filters.created_before) query = query.lte('created_at', filters.created_before);

  query = query
    .order(sortBy, { ascending: sortDir === 'asc' })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('[documents/queries] getDocuments error:', error);
    throw new Error(`Failed to fetch documents: ${error.message}`);
  }

  const total = count ?? 0;

  return {
    data: (data as DocumentRow[]) || [],
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      total_pages: Math.ceil(total / pagination.limit),
    },
  };
}

// ---------------------------------------------------------------------------
// 4. getDocumentById — Single document
// ---------------------------------------------------------------------------

export async function getDocumentById(docId: string): Promise<DocumentRow | null> {
  const supabase = getDb();

  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', docId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[documents/queries] getDocumentById error:', error);
    throw new Error(`Failed to fetch document: ${error.message}`);
  }

  return data as unknown as DocumentRow;
}

// ---------------------------------------------------------------------------
// 5. updateDocument — Update document metadata
// ---------------------------------------------------------------------------

export async function updateDocument(docId: string, data: UpdateDocumentInput): Promise<DocumentRow> {
  const supabase = getDb();

  const updateData: Record<string, any> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.file_type !== undefined) updateData.file_type = data.file_type;
  if (data.file_size !== undefined) updateData.file_size = data.file_size;
  if (data.storage_url !== undefined) updateData.storage_url = data.storage_url;

  const { data: result, error } = await (supabase.from('documents') as any)
    .update(updateData)
    .eq('id', docId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error(`Document not found: ${docId}`);
    }
    console.error('[documents/queries] updateDocument error:', error);
    throw new Error(`Failed to update document: ${error.message}`);
  }

  return result as DocumentRow;
}

// ---------------------------------------------------------------------------
// 6. deleteDocument — Delete a document record
// ---------------------------------------------------------------------------

export async function deleteDocument(docId: string): Promise<void> {
  const supabase = getDb();

  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', docId);

  if (error) {
    console.error('[documents/queries] deleteDocument error:', error);
    throw new Error(`Failed to delete document: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// 7. generatePDF — Generate PDF from a template by populating placeholders
//     Uses a simple HTML-based template approach that can be rendered via
//     a PDF library (e.g., puppeteer, @react-pdf/renderer, or wkhtmltopdf).
//     Returns the rendered HTML string — the caller converts to PDF.
// ---------------------------------------------------------------------------

export interface PDFTemplateData {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Generate an HTML document from a named template and field data.
 * Returns HTML string that can be converted to PDF via a rendering service.
 */
export async function generatePDF(
  templateType: DocumentTemplateType,
  data: PDFTemplateData,
): Promise<string> {
  const template = DOCUMENT_TEMPLATES.find((t) => t.id === templateType);
  if (!template) {
    throw new Error(`Unknown document template: ${templateType}`);
  }

  const safe = (val: unknown): string => {
    if (val === null || val === undefined) return '__________';
    return String(val);
  };

  const today = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const styles = `
    <style>
      @page { margin: 20mm 15mm; }
      body { font-family: 'Arial', 'Helvetica', sans-serif; font-size: 12pt; color: #222; line-height: 1.6; }
      .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #1a365d; padding-bottom: 15px; }
      .header h1 { color: #1a365d; margin: 0 0 5px; font-size: 22pt; }
      .header .subtitle { color: #4a5568; font-size: 10pt; }
      .content { margin: 20px 0; }
      .field-row { margin: 8px 0; display: flex; }
      .field-label { font-weight: bold; min-width: 200px; color: #2d3748; }
      .field-value { flex: 1; border-bottom: 1px dotted #cbd5e0; padding-bottom: 2px; }
      .signature-section { margin-top: 60px; display: flex; justify-content: space-between; }
      .signature-box { width: 45%; }
      .signature-line { border-top: 1px solid #222; margin-top: 50px; padding-top: 8px; text-align: center; font-size: 10pt; color: #4a5568; }
      .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 9pt; color: #718096; text-align: center; }
      .terms { margin-top: 30px; font-size: 10pt; }
      .terms h3 { color: #1a365d; }
      .terms ol { padding-left: 20px; }
      .terms li { margin: 4px 0; }
      .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 60pt; color: rgba(200,200,200,0.15); pointer-events: none; z-index: -1; }
    </style>
  `;

  const baseHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">${styles}</head><body>`;

  const footerHtml = `
    <div class="footer">
      <p>This is a computer-generated document. No signature is required unless printed and signed manually.</p>
      <p>Generated on ${today} &bull; EstateFlow CRM</p>
    </div>
  `;

  let bodyHtml = '';

  switch (templateType) {
    case 'agreement': {
      bodyHtml = `
        <div class="header">
          <h1>SALES AGREEMENT</h1>
          <div class="subtitle">Property Sale and Purchase Agreement</div>
        </div>
        <div class="content">
          <p>This Sales Agreement (hereinafter referred to as the "Agreement") is made and entered into on <strong>${today}</strong>.</p>

          <h3>PARTIES</h3>
          <div class="field-row"><span class="field-label">Buyer Name:</span><span class="field-value">${safe(data.buyer_name)}</span></div>
          <div class="field-row"><span class="field-label">Seller Name:</span><span class="field-value">${safe(data.seller_name)}</span></div>

          <h3>PROPERTY DETAILS</h3>
          <div class="field-row"><span class="field-label">Property Address:</span><span class="field-value">${safe(data.property_address)}</span></div>
          <div class="field-row"><span class="field-label">Area (sq. ft.):</span><span class="field-value">${safe(data.property_area)}</span></div>

          <h3>FINANCIAL TERMS</h3>
          <div class="field-row"><span class="field-label">Total Amount (₹):</span><span class="field-value">${safe(data.total_amount)}</span></div>
          <div class="field-row"><span class="field-label">Advance Amount (₹):</span><span class="field-value">${safe(data.advance_amount)}</span></div>
          <div class="field-row"><span class="field-label">Balance Amount (₹):</span><span class="field-value">${safe(data.balance_amount)}</span></div>
          <div class="field-row"><span class="field-label">Payment Terms:</span><span class="field-value">${safe(data.payment_terms)}</span></div>

          <h3>POSSESSION</h3>
          <div class="field-row"><span class="field-label">Possession Date:</span><span class="field-value">${safe(data.possession_date)}</span></div>

          <div class="terms">
            <h3>TERMS & CONDITIONS</h3>
            <ol>
              <li>The Buyer agrees to purchase the above-mentioned property from the Seller under the terms stated herein.</li>
              <li>The total consideration shall be paid as per the payment schedule agreed between the parties.</li>
              <li>The Seller warrants clear and marketable title to the property.</li>
              <li>All applicable taxes, registration charges, and stamp duty shall be borne by the Buyer.</li>
              <li>Possession shall be handed over on the agreed date, subject to full payment of the agreed amount.</li>
              ${data.additional_terms ? `<li>${safe(data.additional_terms)}</li>` : ''}
            </ol>
          </div>

          <div class="signature-section">
            <div class="signature-box">
              <div class="signature-line">Buyer Signature</div>
            </div>
            <div class="signature-box">
              <div class="signature-line">Seller Signature</div>
            </div>
          </div>
        </div>
      `;
      break;
    }

    case 'mou': {
      bodyHtml = `
        <div class="header">
          <h1>MEMORANDUM OF UNDERSTANDING</h1>
          <div class="subtitle">Non-Binding Preliminary Agreement</div>
        </div>
        <div class="content">
          <p>This Memorandum of Understanding ("MoU") is entered into on <strong>${today}</strong>.</p>

          <h3>PARTIES</h3>
          <div class="field-row"><span class="field-label">Party A:</span><span class="field-value">${safe(data.party_a_name)}</span></div>
          <div class="field-row"><span class="field-label">Party B:</span><span class="field-value">${safe(data.party_b_name)}</span></div>

          <h3>PROPERTY / SUBJECT</h3>
          <div class="field-row"><span class="field-label">Details:</span><span class="field-value">${safe(data.property_details)}</span></div>
          <div class="field-row"><span class="field-label">Proposed Price (₹):</span><span class="field-value">${safe(data.proposed_price)}</span></div>

          <h3>KEY TERMS</h3>
          <div class="field-row"><span class="field-label">Due Diligence Period:</span><span class="field-value">${safe(data.due_diligence_period)}</span></div>
          <div class="field-row"><span class="field-label">Earnest Money (₹):</span><span class="field-value">${safe(data.earnest_money)}</span></div>
          <div class="field-row"><span class="field-label">Validity Date:</span><span class="field-value">${safe(data.validity_date)}</span></div>
          <div class="field-row"><span class="field-label">Terms:</span><span class="field-value">${safe(data.terms)}</span></div>

          <div class="signature-section">
            <div class="signature-box">
              <div class="signature-line">Party A Signature</div>
            </div>
            <div class="signature-box">
              <div class="signature-line">Party B Signature</div>
            </div>
          </div>
        </div>
      `;
      break;
    }

    case 'receipt': {
      bodyHtml = `
        <div class="header">
          <h1>PAYMENT RECEIPT</h1>
          <div class="subtitle">Official Acknowledgment of Payment</div>
        </div>
        <div class="content">
          <p>Receipt Date: <strong>${today}</strong></p>

          <div class="field-row"><span class="field-label">Received From:</span><span class="field-value">${safe(data.payer_name)}</span></div>
          <div class="field-row"><span class="field-label">Amount (₹):</span><span class="field-value">${safe(data.amount)}</span></div>
          <div class="field-row"><span class="field-label">Amount in Words:</span><span class="field-value">${safe(data.amount_in_words)}</span></div>
          <div class="field-row"><span class="field-label">Payment Mode:</span><span class="field-value">${safe(data.payment_mode)}</span></div>
          <div class="field-row"><span class="field-label">Payment Date:</span><span class="field-value">${safe(data.payment_date)}</span></div>
          <div class="field-row"><span class="field-label">Property:</span><span class="field-value">${safe(data.for_property)}</span></div>
          <div class="field-row"><span class="field-label">Transaction ID:</span><span class="field-value">${safe(data.transaction_id)}</span></div>
          <div class="field-row"><span class="field-label">Remarks:</span><span class="field-value">${safe(data.remarks)}</span></div>

          <div class="signature-section">
            <div class="signature-box">
              <div class="signature-line">Authorized Signatory</div>
            </div>
            <div class="signature-box">
              <div class="signature-line">Receiver's Stamp</div>
            </div>
          </div>
        </div>
      `;
      break;
    }

    case 'noc': {
      bodyHtml = `
        <div class="header">
          <h1>NO OBJECTION CERTIFICATE</h1>
          <div class="subtitle">Certificate of No Objection</div>
        </div>
        <div class="content">
          <p>Date: <strong>${today}</strong></p>

          <div class="field-row"><span class="field-label">Issuing Authority:</span><span class="field-value">${safe(data.issuing_authority)}</span></div>
          <div class="field-row"><span class="field-label">Property Details:</span><span class="field-value">${safe(data.property_details)}</span></div>
          <div class="field-row"><span class="field-label">Owner Name:</span><span class="field-value">${safe(data.owner_name)}</span></div>
          <div class="field-row"><span class="field-label">NOC Date:</span><span class="field-value">${safe(data.noc_date)}</span></div>
          <div class="field-row"><span class="field-label">Valid Until:</span><span class="field-value">${safe(data.valid_until)}</span></div>
          <div class="field-row"><span class="field-label">Reference Number:</span><span class="field-value">${safe(data.reference_number)}</span></div>
          <div class="field-row"><span class="field-label">Remarks:</span><span class="field-value">${safe(data.remarks)}</span></div>

          <p style="margin-top: 30px;">This is to certify that the aforementioned authority has no objection to the proceeding as described.</p>

          <div class="signature-section">
            <div class="signature-box">
              <div class="signature-line">Authorized Signatory</div>
            </div>
            <div class="signature-box">
              <div class="signature-line">Official Stamp</div>
            </div>
          </div>
        </div>
      `;
      break;
    }

    case 'booking_form': {
      bodyHtml = `
        <div class="header">
          <h1>PROPERTY BOOKING FORM</h1>
          <div class="subtitle">Application for Property Reservation</div>
        </div>
        <div class="content">
          <p>Date: <strong>${today}</strong></p>

          <h3>APPLICANT DETAILS</h3>
          <div class="field-row"><span class="field-label">Full Name:</span><span class="field-value">${safe(data.applicant_name)}</span></div>
          <div class="field-row"><span class="field-label">Phone:</span><span class="field-value">${safe(data.applicant_phone)}</span></div>
          <div class="field-row"><span class="field-label">Email:</span><span class="field-value">${safe(data.applicant_email)}</span></div>

          <h3>PROPERTY DETAILS</h3>
          <div class="field-row"><span class="field-label">Property Name:</span><span class="field-value">${safe(data.property_name)}</span></div>
          <div class="field-row"><span class="field-label">Unit Number:</span><span class="field-value">${safe(data.unit_number)}</span></div>
          <div class="field-row"><span class="field-label">Total Price (₹):</span><span class="field-value">${safe(data.total_price)}</span></div>

          <h3>BOOKING DETAILS</h3>
          <div class="field-row"><span class="field-label">Booking Amount (₹):</span><span class="field-value">${safe(data.booking_amount)}</span></div>
          <div class="field-row"><span class="field-label">Booking Date:</span><span class="field-value">${safe(data.booking_date)}</span></div>
          <div class="field-row"><span class="field-label">Expected Loan Amount (₹):</span><span class="field-value">${safe(data.expected_loan_amount)}</span></div>

          <h3>IDENTIFICATION</h3>
          <div class="field-row"><span class="field-label">ID Proof Type:</span><span class="field-value">${safe(data.id_proof_type)}</span></div>
          <div class="field-row"><span class="field-label">ID Proof Number:</span><span class="field-value">${safe(data.id_proof_number)}</span></div>

          <div class="terms">
            <h3>TERMS & CONDITIONS</h3>
            <ol>
              <li>The booking amount is adjustable against the total consideration.</li>
              <li>Booking is subject to the allotment of the unit by the developer/builder.</li>
              <li>In case of cancellation, refund will be as per company policy.</li>
              <li>The applicant confirms that all information provided is accurate.</li>
              ${data.terms_accepted ? '<li>The applicant has read and accepted the terms and conditions.</li>' : ''}
            </ol>
          </div>

          <div class="signature-section">
            <div class="signature-box">
              <div class="signature-line">Applicant Signature</div>
            </div>
            <div class="signature-box">
              <div class="signature-line">Authorized Signatory</div>
            </div>
          </div>
        </div>
      `;
      break;
    }

    default: {
      bodyHtml = `<p>Template type "${templateType}" is not yet implemented.</p>`;
    }
  }

  const watermark = `<div class="watermark">DRAFT</div>`;

  return `${baseHtml}${watermark}${bodyHtml}${footerHtml}</body></html>`;
}
