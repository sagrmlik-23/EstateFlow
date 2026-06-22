// ============================================================================
// EstateFlow CRM — Lead Notification Email Template
// Agent-4-3-Email-Notifications v1.0.0
// ============================================================================

import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Heading,
  Hr,
  Img,
  Row,
  Column,
} from '@react-email/components';
import * as React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeadNotificationProps {
  /** Tenant/company name */
  companyName: string;
  /** Lead's full name */
  leadName: string;
  /** Lead's phone number */
  leadPhone: string | null;
  /** Lead's email address */
  leadEmail: string | null;
  /** Lead source (website, referral, whatsapp, etc.) */
  leadSource: string | null;
  /** Budget range (e.g. "$200K - $300K") */
  budget: string | null;
  /** Preferred location */
  location: string | null;
  /** Property type interested in */
  propertyType: string | null;
  /** Lead score (0-100) */
  leadScore: number | null;
  /** URL to CRM lead detail page */
  leadUrl: string;
  /** Tenant logo URL (white-label brand) */
  logoUrl: string | null;
  /** Primary brand color (hex) */
  primaryColor: string;
  /** Whether this is white-label (no EstateFlow branding) */
  isWhiteLabel: boolean;
}

// ---------------------------------------------------------------------------
// Default styles
// ---------------------------------------------------------------------------

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '600px',
};

const box = {
  padding: '0 48px',
};

const headerSection = {
  padding: '20px 48px',
  textAlign: 'center' as const,
};

const logo = {
  maxHeight: '48px',
  maxWidth: '200px',
  margin: '0 auto',
};

const heading = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '30px 0 16px',
};

const label = {
  color: '#666',
  fontSize: '12px',
  fontWeight: 'bold' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  marginBottom: '4px',
};

const value = {
  color: '#333',
  fontSize: '16px',
  marginBottom: '16px',
};

const ctaButton = {
  backgroundColor: '#1e40af',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold' as const,
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '14px 24px',
  margin: '24px 0',
};

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  textAlign: 'center' as const,
  padding: '0 48px',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const LeadNotificationEmail = ({
  companyName,
  leadName,
  leadPhone,
  leadEmail,
  leadSource,
  budget,
  location,
  propertyType,
  leadScore,
  leadUrl,
  logoUrl,
  primaryColor,
  isWhiteLabel,
}: LeadNotificationProps) => {
  const buttonBg = primaryColor || '#1e40af';

  return (
    <Html>
      <Head />
      <Preview>
        New lead: {leadName} — {companyName}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header with logo */}
          {logoUrl ? (
            <Section style={headerSection}>
              <Img
                src={logoUrl}
                alt={companyName}
                style={logo}
                width="auto"
                height="48"
              />
            </Section>
          ) : null}

          <Section style={box}>
            <Heading style={heading}>New Lead Received 🎉</Heading>
            <Text>
              A new lead has been captured in {companyName}. Here are the
              details:
            </Text>

            <Hr style={{ margin: '24px 0' }} />

            {/* Lead Details */}
            <Text style={label}>Name</Text>
            <Text style={value}>{leadName}</Text>

            {leadPhone ? (
              <>
                <Text style={label}>Phone</Text>
                <Text style={value}>{leadPhone}</Text>
              </>
            ) : null}

            {leadEmail ? (
              <>
                <Text style={label}>Email</Text>
                <Text style={value}>{leadEmail}</Text>
              </>
            ) : null}

            {leadSource ? (
              <>
                <Text style={label}>Source</Text>
                <Text style={value}>{capitalize(leadSource)}</Text>
              </>
            ) : null}

            <Hr style={{ margin: '24px 0' }} />

            <Row>
              {budget ? (
                <Column style={{ width: '50%' }}>
                  <Text style={label}>Budget</Text>
                  <Text style={value}>{budget}</Text>
                </Column>
              ) : null}
              {location ? (
                <Column style={{ width: '50%' }}>
                  <Text style={label}>Location</Text>
                  <Text style={value}>{location}</Text>
                </Column>
              ) : null}
            </Row>

            {propertyType ? (
              <>
                <Text style={label}>Property Type</Text>
                <Text style={value}>{capitalize(propertyType)}</Text>
              </>
            ) : null}

            {leadScore !== null && leadScore !== undefined ? (
              <>
                <Text style={label}>Lead Score</Text>
                <Text style={value}>{leadScore}/100</Text>
              </>
            ) : null}

            <Hr style={{ margin: '24px 0' }} />

            {/* CTA Button */}
            <a
              href={leadUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                ...ctaButton,
                backgroundColor: buttonBg,
              }}
            >
              View Lead in CRM
            </a>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text>
              This is an automated notification from{' '}
              {isWhiteLabel ? companyName : 'EstateFlow CRM'}.
            </Text>
            {!isWhiteLabel ? (
              <Text data-brand="estateflow">
                Powered by EstateFlow CRM
              </Text>
            ) : null}
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
}

export default LeadNotificationEmail;
