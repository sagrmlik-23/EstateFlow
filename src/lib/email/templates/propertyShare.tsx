// ============================================================================
// EstateFlow CRM — Property Share Email Template
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
} from '@react-email/components';
import * as React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PropertyShareProps {
  /** Tenant/company name */
  companyName: string;
  /** Property title */
  propertyTitle: string;
  /** Property image URL */
  propertyImageUrl: string | null;
  /** Price (formatted with currency, e.g. "$450,000") */
  price: string;
  /** Number of bedrooms */
  bedrooms: number | null;
  /** Number of bathrooms */
  bathrooms: number | null;
  /** Square footage / area */
  area: string | null;
  /** Property address / location */
  address: string;
  /** Property type (apartment, villa, etc.) */
  propertyType: string | null;
  /** Description snippet */
  description: string | null;
  /** URL to view the full property listing */
  propertyUrl: string;
  /** Message from the sender (agent) */
  senderMessage: string | null;
  /** Agent name (sender) */
  agentName: string;
  /** Agent phone */
  agentPhone: string | null;
  /** Agent email */
  agentEmail: string | null;
  /** Tenant logo URL */
  logoUrl: string | null;
  /** Primary brand color */
  primaryColor: string;
  /** Whether this is white-label */
  isWhiteLabel: boolean;
}

// ---------------------------------------------------------------------------
// Styles
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

const logo = {
  maxHeight: '48px',
  maxWidth: '200px',
  margin: '0 auto',
};

const propertyImage = {
  width: '100%',
  maxHeight: '320px',
  objectFit: 'cover' as const,
  borderRadius: '8px',
  marginBottom: '20px',
};

const heading = {
  color: '#333',
  fontSize: '22px',
  fontWeight: 'bold',
  margin: '16px 0 8px',
};

const priceText = {
  color: '#1e40af',
  fontSize: '28px',
  fontWeight: 'bold',
  margin: '8px 0 16px',
};

const label = {
  color: '#666',
  fontSize: '12px',
  fontWeight: 'bold' as const,
  textTransform: 'uppercase',
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

export const PropertyShareEmail = ({
  companyName,
  propertyTitle,
  propertyImageUrl,
  price,
  bedrooms,
  bathrooms,
  area,
  address,
  propertyType,
  description,
  propertyUrl,
  senderMessage,
  agentName,
  agentPhone,
  agentEmail,
  logoUrl,
  primaryColor,
  isWhiteLabel,
}: PropertyShareProps) => {
  const buttonBg = primaryColor || '#1e40af';

  return (
    <Html>
      <Head />
      <Preview>
        {propertyTitle} — {price} | {companyName}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Logo */}
          {logoUrl ? (
            <Section style={{ textAlign: 'center', padding: '20px 48px 0' }}>
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
            {/* Agent message */}
            {senderMessage ? (
              <Text style={{ fontStyle: 'italic', color: '#555', marginBottom: '24px' }}>
                &ldquo;{senderMessage}&rdquo;
              </Text>
            ) : null}

            <Text style={{ color: '#666' }}>
              {agentName} has shared a property with you:
            </Text>

            {/* Property Image */}
            {propertyImageUrl ? (
              <Img
                src={propertyImageUrl}
                alt={propertyTitle}
                style={propertyImage}
                width="100%"
                height="auto"
              />
            ) : null}

            <Heading style={heading}>{propertyTitle}</Heading>
            <Text style={priceText}>{price}</Text>
            <Text style={{ color: '#555', fontSize: '14px', marginBottom: '16px' }}>
              {address}
            </Text>

            <Hr style={{ margin: '24px 0' }} />

            {/* Property Details */}
            {propertyType ? (
              <>
                <Text style={label}>Type</Text>
                <Text style={value}>{propertyType}</Text>
              </>
            ) : null}

            {bedrooms ? (
              <>
                <Text style={label}>Bedrooms</Text>
                <Text style={value}>{bedrooms}</Text>
              </>
            ) : null}

            {bathrooms ? (
              <>
                <Text style={label}>Bathrooms</Text>
                <Text style={value}>{bathrooms}</Text>
              </>
            ) : null}

            {area ? (
              <>
                <Text style={label}>Area</Text>
                <Text style={value}>{area}</Text>
              </>
            ) : null}

            {description ? (
              <>
                <Text style={label}>Description</Text>
                <Text style={value}>{description}</Text>
              </>
            ) : null}

            <Hr style={{ margin: '24px 0' }} />

            {/* Agent Contact */}
            <Text style={label}>Contact Agent</Text>
            <Text style={value}>{agentName}</Text>
            {agentPhone ? <Text style={value}>{agentPhone}</Text> : null}
            {agentEmail ? <Text style={value}>{agentEmail}</Text> : null}

            {/* CTA */}
            <a
              href={propertyUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                ...ctaButton,
                backgroundColor: buttonBg,
              }}
            >
              View Property
            </a>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text>
              Powered by {isWhiteLabel ? companyName : 'EstateFlow CRM'}
            </Text>
            {!isWhiteLabel ? (
              <Text data-brand="estateflow">
                © {new Date().getFullYear()} EstateFlow CRM. All rights reserved.
              </Text>
            ) : null}
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default PropertyShareEmail;
