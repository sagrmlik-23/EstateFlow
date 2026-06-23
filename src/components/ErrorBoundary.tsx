'use client';

// ============================================================================
// EstateFlow CRM — Error Boundary
// Catches React render errors in the component tree and displays a
// fallback UI instead of crashing the entire application.
// ============================================================================

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Caught render error:', error, errorInfo);

    // In production, you would send this to an error tracking service
    // e.g., Sentry.captureException(error, { extra: errorInfo });
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  render(): React.ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
          <div className="rounded-full bg-destructive/10 p-4 mb-4">
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mb-1">
            An unexpected error occurred while rendering this page.
          </p>
          {this.state.error && (
            <p className="text-xs text-muted-foreground/70 font-mono bg-muted rounded-md px-3 py-2 max-w-md mb-6 break-all">
              {this.state.error.message}
            </p>
          )}
          <Button onClick={this.handleReset} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
