// expo-maps (unlike react-native-maps) does NOT inject the Android Google Maps
// API key, and Expo's core only auto-applies the key mod for react-native-maps.
// So we apply it explicitly: this reads `android.config.googleMaps.apiKey` from
// the resolved config and writes <meta-data com.google.android.geo.API_KEY> into
// AndroidManifest.xml during prebuild. iOS uses Apple Maps and is unaffected.
const { AndroidConfig } = require('@expo/config-plugins');

module.exports = (config) =>
  AndroidConfig.GoogleMapsApiKey.withGoogleMapsApiKey(config);
