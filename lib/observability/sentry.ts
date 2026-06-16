// Crash + error reporting for the Baltic72 app.
//
// This is a civil-safety app with end-to-end encryption: a crash report must
// NEVER carry plaintext family data, crypto keys, push tokens or invite
// secrets off the device. `initSentry` therefore ships with an aggressive
// redactor (see `scrubEvent`) and PII collection disabled.
//
// The DSN is injected at build time from `process.env.SENTRY_DSN` via
// app.config.js -> `expo.extra.sentryDsn` (the repo is public, so secrets are
// never committed — same pattern as GOOGLE_MAPS_KEY). When no DSN is present
// (e.g. local dev without a .env.local), init is a no-op.
import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';

export { Sentry };

/** Substrings in an object key that mark its value as sensitive. */
const SENSITIVE_KEY = /key|secret|token|cipher|ciphertext|plaintext|private|seed|mnemonic|passphrase|password|signature|sig\b|nonce|invite|dek|kek/i;
const REDACTED = '[redacted]';
const MAX_DEPTH = 6;

/** Recursively replace values under sensitive keys with `[redacted]`. */
function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.extra) event.extra = redact(event.extra) as typeof event.extra;
  if (event.contexts) event.contexts = redact(event.contexts) as typeof event.contexts;
  if (event.tags) event.tags = redact(event.tags) as typeof event.tags;
  // Request bodies/cookies can carry ciphertext or auth material — drop them.
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) delete event.request.headers.Authorization;
  }
  return event;
}

const dsn =
  (Constants.expoConfig?.extra as { sentryDsn?: string } | undefined)?.sentryDsn ??
  process.env.EXPO_PUBLIC_SENTRY_DSN;

/**
 * Initialise Sentry as early as possible (before the React tree renders) so
 * startup crashes are captured. Safe to call once at module load. Release and
 * dist are auto-derived by the SDK from the native app version + build number
 * (app.json `version` / iOS `buildNumber` / Android `versionCode`), which is
 * also what the Sentry Metro plugin tags uploaded source maps with — so do NOT
 * override them here or events won't match their maps.
 */
export function initSentry(): void {
  if (!dsn) {
    if (__DEV__) console.log('[sentry] no DSN configured — error reporting disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    // Never attach IP / user identifiers automatically.
    sendDefaultPii: false,
    // Light performance sampling; crashes/errors are always captured.
    tracesSampleRate: __DEV__ ? 0 : 0.2,
    enableNativeCrashHandling: true,
    attachStacktrace: true,
    maxBreadcrumbs: 50,
    beforeSend: scrubEvent,
    beforeBreadcrumb(breadcrumb) {
      // Console logs in a crypto app can carry sensitive objects — keep the
      // category/level for context but strip the captured arguments/message.
      if (breadcrumb.category === 'console') {
        breadcrumb.message = undefined;
        if (breadcrumb.data) breadcrumb.data = redact(breadcrumb.data) as typeof breadcrumb.data;
      }
      return breadcrumb;
    },
  });
}
