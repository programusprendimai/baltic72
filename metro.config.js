// Metro config — extends Expo defaults to bundle the prebuilt SQLite database
// (assets/db/baltic72.db) as an asset that expo-sqlite copies on first launch.
// Wrapped with Sentry's config so production source maps are emitted/uploaded
// for readable crash stack traces (upload runs at build time when
// SENTRY_AUTH_TOKEN + the org/project plugin are present).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);
config.resolver.assetExts.push('db');

module.exports = config;
