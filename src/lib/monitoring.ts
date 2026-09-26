import * as Sentry from '@sentry/react-native';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

// Crash and error reporting. Off unless a DSN is configured.
Sentry.init({
  dsn: DSN,
  enabled: Boolean(DSN),
  tracesSampleRate: 0.2,
  sendDefaultPii: false,
});

export { Sentry };
