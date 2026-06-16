import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { MARKER_ICON_SOURCES } from '@/lib/markerIconSources';

// Decoded expo-image refs, reused across renders/visits. expo-image is required
// lazily and ONLY on Android (where the icons are used) so iOS — which renders
// markers with monogram/tint and has no expo-image native module unless rebuilt
// — never touches it. Map values are expo-image ImageRefs used as marker.icon.
const cache = new Map<string, unknown>();
let started = false;

/**
 * Preload all marker icons (category teardrops + numbered cluster circles) once
 * on Android, so panning/zooming never briefly shows a default pin while an icon
 * decodes. No-op on iOS. Returns the shared cache; `.get(key)` is undefined only
 * for the brief moment before the first preload finishes.
 */
export function useMarkerIcons(): Map<string, unknown> {
  const [, bump] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android' || started) return;
    started = true;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Image } = require('expo-image') as typeof import('expo-image');
    let cancelled = false;
    void Promise.all(
      Object.entries(MARKER_ICON_SOURCES).map(async ([key, source]) => {
        try {
          cache.set(key, await Image.loadAsync(source));
        } catch {
          // leave uncached → default pin for that key
        }
      })
    ).then(() => {
      if (!cancelled) bump((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return cache;
}
