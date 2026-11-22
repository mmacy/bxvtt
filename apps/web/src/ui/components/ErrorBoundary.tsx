import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import { cx } from '../lib/cx';
import { Button } from './Button';
import styles from './ErrorBoundary.module.css';

export interface ErrorFallbackProps {
  /** What stopped working, such as "The map" or "This panel". */
  area?: string;
  onRetry?: () => void;
  /** Error details that the user can copy for a bug report. They are never shown on screen. */
  details?: string;
  size?: 'compact' | 'default';
  className?: string;
}

/** The message shown when part of the interface fails. Shows no stack trace. */
export function ErrorFallback({
  area = 'This panel',
  onRetry,
  details,
  size = 'default',
  className,
}: ErrorFallbackProps) {
  return (
    <div role="alert" className={cx(styles.fallback, styles[size], className)}>
      <Icon name="skull" size={size === 'compact' ? 24 : 32} className={styles.icon} />
      <p className={styles.title}>{area} stopped working</p>
      <p className={styles.text}>
        The rest of the table still works. Try again, or reload the page if it keeps happening.
      </p>
      <div className={styles.actions}>
        {onRetry && (
          <Button variant="secondary" size="sm" icon="refresh" onClick={onRetry}>
            Try again
          </Button>
        )}
        {details && (
          <Button
            variant="ghost"
            size="sm"
            icon="copy"
            onClick={() => {
              void navigator.clipboard?.writeText(details);
            }}
          >
            Copy error details
          </Button>
        )}
      </div>
    </div>
  );
}

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** What stopped working, used in the fallback message. */
  area?: string;
  /** Replaces the default fallback. */
  fallback?: (props: { error: Error; reset: () => void }) => ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  size?: 'compact' | 'default';
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Catches a render error in its children and shows ErrorFallback in their place. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback({ error, reset: this.reset });
    return (
      <ErrorFallback
        area={this.props.area}
        size={this.props.size}
        onRetry={this.reset}
        details={`${error.name}: ${error.message}\n${error.stack ?? ''}`}
      />
    );
  }
}
