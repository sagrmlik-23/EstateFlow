// ============================================================================
// EstateFlow CRM — Welcome Email Template
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

export interface WelcomeEmailProps {
  /** Tenant/company name */
  companyName: string;
  /** Recipient's full name */
  userName: string;
  /** Login URL for the CRM */
  loginUrl: string;
  /** Tenant logo URL */
  logoUrl: string | null;
  /** Primary brand color */
  primaryColor: string;
  /** Whether this is white-label (no EstateFlow branding) */
  isWhiteLabel: boolean;
  /** Support email address */
  supportEmail: string;
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

const heading = {
  color: '#333',
  fontSize: '28px',
  fontWeight: 'bold',
  margin: '30px 0 16px',
};

const subheading = {
  color: '#555',
  fontSize: '18px',
  margin: '8px 0 24px',
};

const stepNumber = {
  display: 'inline-block',
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  textAlign: 'center' as const,
  lineHeight: '28px',
  color: '#fff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  marginRight: '12px',
};

const stepTitle = {
  color: '#333',
  fontSize: '16px',
  fontWeight: 'bold' as const,
  marginBottom: '4px',
};

const stepDesc = {
  color: '#666',
  fontSize: '14px',
  lineHeight: '20px',
  marginBottom: '20px',
  marginLeft: '40px',
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
  margin: '32px 0',
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

export const WelcomeEmail = ({
  companyName,
  userName,
  loginUrl,
  logoUrl,
  primaryColor,
  isWhiteLabel,
  supportEmail,
}: WelcomeEmailProps) => {
  const buttonBg = primaryColor || '#1e40af';
  const stepBg = primaryColor || '#1e40af';

  return (
    <Html>
      <Head />
      <Preview>
        Welcome to {companyName} — Get started with your CRM
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
            <Heading style={heading}>
              Welcome to {companyName}, {userName}! 👋
            </Heading>
            <Text style={subheading}>
              Your CRM account is now active. Here&apos;s how to get started
              in just a few minutes.
            </Text>

            <Hr style={{ margin: '24px 0' }} />

            {/* Step 1 */}
            <div style={{ marginBottom: '24px' }}>
              <span style={{ ...stepNumber, backgroundColor: stepBg }}>
                1
              </span>
              <span style={stepTitle}>Log in to your account</span>
              <Text style={stepDesc}>
                Click the button below to access your CRM dashboard. Bookmark
                the login page for easy access.
              </Text>
            </div>

            {/* Step 2 */}
            <div style={{ marginBottom: '24px' }}>
              <span style={{ ...stepNumber, backgroundColor: stepBg }}>
                2
              </span>
              <span style={stepTitle}>Set up your profile</span>
              <Text style={stepDesc}>
                Add your profile picture, contact information, and configure
                your notification preferences in Settings.
              </Text>
            </div>

            {/* Step 3 */}
            <div style={{ marginBottom: '24px' }}>
              <span style={{ ...stepNumber, backgroundColor: stepBg }}>
                3
              </span>
              <span style={stepTitle}>Import your properties</span>
              <Text style={stepDesc}>
                Add your property listings, set pricing, upload photos, and
                organize them into categories for easy management.
              </Text>
            </div>

            {/* Step 4 */}
            <div style={{ marginBottom: '24px' }}>
              <span style={{ ...stepNumber, backgroundColor: stepBg }}>
                4
              </span>
              <span style={stepTitle}>Configure AI agents</span>
              <Text style={stepDesc}>
                Set up AI voice agents to qualify leads, schedule viewings,
                and send follow-ups automatically.
              </Text>
            </div>

            <Hr style={{ margin: '24px 0' }} />

            {/* CTA */}
            <a
              href={loginUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                ...ctaButton,
                backgroundColor: buttonBg,
              }}
            >
              Log In to {companyName}
            </a>

            <Text style={{ color: '#666', fontSize: '14px', marginTop: '16px' }}>
              Need help? Contact our support team at{' '}
              <a
                href={`mailto:${supportEmail}`}
                style={{ color: buttonBg, textDecoration: 'underline' }}
              >
                {supportEmail}
              </a>
            </Text>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text>
              This email was sent because a new account was created for
              {isWhiteLabel ? companyName : 'EstateFlow CRM'}.
            </Text>
            {!isWhiteLabel ? (
              <Text data-brand="estateflow">
                © {new Date().getFullYear()} EstateFlow CRM. All rights
                reserved.
              </Text>
            ) : null}
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default WelcomeEmail;
