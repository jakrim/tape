import * as Sentry from '@sentry/react-native';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

// Crash and error reporting. Off unless a DSN is configured.
Sentry.init({
  dsn: DSN,
  enabled: Boolean(DSN),
  // 5% of sessions traced: enough signal at 50k users without paying to trace everyone.
  tracesSampleRate: 0.05,
  sendDefaultPii: false,
});

export { Sentry };
