// Extends app.json and injects secrets from the environment so they never get
// committed to the (public) repo. The Google Maps SDK for Android key comes from
// GOOGLE_MAPS_KEY — `.env.local` locally (auto-loaded by Expo), or a CI/EAS
// secret in pipelines. iOS uses Apple Maps and needs no key.
//
// Sentry: SENTRY_DSN is surfaced to the app at runtime via `extra.sentryDsn`
// (a DSN is a public client key, but we keep it out of the repo for hygiene).
// SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN are build-time only and drive
// source-map upload; the @sentry/react-native plugin is added only when the org
// + project are present so local/dev builds without them still work.
module.exports = ({ config }) => {
  const googleMapsKey = process.env.GOOGLE_MAPS_KEY;
  const sentryDsn = process.env.SENTRY_DSN;
  const sentryOrg = process.env.SENTRY_ORG;
  const sentryProject = process.env.SENTRY_PROJECT;

  const plugins = [...(config.plugins || [])];
  if (googleMapsKey) plugins.push('./plugins/with-android-google-maps');
  if (sentryOrg && sentryProject) {
    plugins.push([
      '@sentry/react-native/expo',
      { organization: sentryOrg, project: sentryProject, url: 'https://sentry.io/' },
    ]);
  }

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...(config.android && config.android.config),
        ...(googleMapsKey ? { googleMaps: { apiKey: googleMapsKey } } : {}),
      },
    },
    plugins,
    extra: {
      ...(config.extra || {}),
      ...(sentryDsn ? { sentryDsn } : {}),
    },
  };
};
