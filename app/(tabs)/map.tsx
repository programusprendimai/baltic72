import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
} from 'expo-router';
import * as Location from 'expo-location';
import { AppleMaps, GoogleMaps } from 'expo-maps';
import { useSQLiteContext } from 'expo-sqlite';
import { Minus, Navigation, Plus, SlidersHorizontal } from 'lucide-react-native';

import { ShelterCard } from '@/components/ShelterCard';
import { Footnote } from '@/components/ui/Typography';
import { useMarkerIcons } from '@/lib/useMarkerIcons';
import Colors from '@/constants/Colors';
import { radius, spacing } from '@/constants/design';
import { useColorScheme } from '@/components/useColorScheme';
import {
  countSheltersByCategory,
  getClusterCells,
  getSheltersInBounds,
  type ClusterCell,
} from '@/lib/db/queries';
import {
  SHELTER_CATEGORIES,
  type Shelter,
  type ShelterCategory,
} from '@/lib/db/types';
import { useI18n } from '@/providers/I18nProvider';

type Filter = 'all' | ShelterCategory;
type LatLng = { latitude: number; longitude: number };
type MapSearchParams = { focus?: string };

const VILNIUS = { latitude: 54.6892, longitude: 25.2798 };

type Region = LatLng & {
  latitudeDelta: number;
  longitudeDelta: number;
  zoom: number;
};

const DEFAULT_DELTA = 0.08;
const CLUSTER_COLS = 7;
const CLUSTER_COLOR = '#1B4D8C';

function regionAround(c: LatLng, delta = DEFAULT_DELTA, zoom = 12): Region {
  return {
    latitude: c.latitude,
    longitude: c.longitude,
    latitudeDelta: delta,
    longitudeDelta: delta,
    zoom,
  };
}

function boundsOf(region: Region) {
  return {
    south: region.latitude - region.latitudeDelta / 2,
    north: region.latitude + region.latitudeDelta / 2,
    west: region.longitude - region.longitudeDelta / 2,
    east: region.longitude + region.longitudeDelta / 2,
  };
}

type MapPoint =
  | { kind: 'pin'; shelter: Shelter }
  | { kind: 'cluster'; id: string; latitude: number; longitude: number; count: number };

// Build markers from the DB-side grid clusters (which cover EVERY shelter in
// view). A cell holding a single shelter is drawn as a real, tappable pin when
// we have its record loaded; otherwise it stays a count bubble that zooms in.
function buildMapPoints(cells: ClusterCell[], byId: Map<string, Shelter>): MapPoint[] {
  return cells.map((cell) => {
    if (cell.count === 1) {
      const shelter = byId.get(cell.sampleId);
      if (shelter) return { kind: 'pin', shelter };
    }
    return {
      kind: 'cluster',
      id: `c-${cell.gx}_${cell.gy}`,
      latitude: cell.lat,
      longitude: cell.lng,
      count: cell.count,
    };
  });
}

// Category accent colors are data-domain (not theme tokens) — kept inline by design.
const CATEGORY_COLOR: Record<ShelterCategory, string> = {
  kas: '#0F766E',
  priedanga: '#1B4D8C',
  evakuacija: '#B45309',
  sirena: '#7C2D12',
};

const CATEGORY_SYMBOL_IOS: Record<ShelterCategory, string> = {
  kas: 'building.2.fill',
  priedanga: 'shield.lefthalf.filled',
  evakuacija: 'figure.walk.arrival',
  sirena: 'speaker.wave.3.fill',
};

export default function MapScreen() {
  const { t } = useI18n();
  const { focus } = useLocalSearchParams<MapSearchParams>();
  const db = useSQLiteContext();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const { width } = useWindowDimensions();
  const navigation = useNavigation();

  // Single live dataset: every shelter in the current viewport, sorted by
  // distance to its center. Markers AND the card carousel both read from this
  // and auto-update on pan/zoom — no "search this area" button.
  const [mapShelters, setMapShelters] = useState<Shelter[]>([]);
  const [clusterCells, setClusterCells] = useState<ClusterCell[]>([]);
  const [viewRegion, setViewRegion] = useState<Region | null>(null);
  const [counts, setCounts] = useState<Record<ShelterCategory, number>>({
    kas: 0,
    priedanga: 0,
    evakuacija: 0,
    sirena: 0,
  });
  const [filter, setFilter] = useState<Filter>('all');
  const [origin, setOrigin] = useState<LatLng | null>(null);
  // The device's real GPS position, set only when location permission is
  // granted. Distances on shelter cards are measured from this; while it's
  // null no distance is shown. Distinct from `origin` (the camera focus point,
  // which falls back to Vilnius).
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  // Whether foreground location permission is currently granted. The map's
  // my-location (blue dot) layer MUST only be enabled when this is true:
  // expo-maps calls GoogleMap.setMyLocationEnabled(true), which throws a
  // SecurityException (hard crash) if location permission is not granted.
  const [locationGranted, setLocationGranted] = useState(false);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const cardListRef = useRef<FlatList<Shelter>>(null);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewRegionRef = useRef<Region | null>(null);
  const mapRef = useRef<{
    setCameraPosition: (c: { coordinates: LatLng; zoom?: number }) => void;
  } | null>(null);

  const resolveCurrentRegion = useCallback(async (): Promise<Region> => {
    const existing = await Location.getForegroundPermissionsAsync();
    let granted = existing.status === 'granted';
    if (!granted && existing.canAskAgain) {
      const req = await Location.requestForegroundPermissionsAsync();
      granted = req.status === 'granted';
    }
    setLocationGranted(granted);
    if (!granted) {
      setUserLocation(null);
      return regionAround(VILNIUS, 0.18, 11);
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const coords = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
    setUserLocation(coords);
    return regionAround(coords);
  }, []);

  const applyRegion = useCallback((region: Region) => {
    const coordinates = {
      latitude: region.latitude,
      longitude: region.longitude,
    };
    setOrigin(coordinates);
    setViewRegion(region);
    mapRef.current?.setCameraPosition({ coordinates, zoom: region.zoom });
  }, []);

  const visibleShelters = useMemo(() => {
    if (!pinnedId) return mapShelters;
    const pinned = mapShelters.find((s) => s.id === pinnedId);
    return pinned ? [pinned] : mapShelters;
  }, [mapShelters, pinnedId]);

  const categoriesForQuery = useMemo<ShelterCategory[] | undefined>(
    () => (filter === 'all' ? undefined : [filter]),
    [filter]
  );

  useEffect(() => {
    void countSheltersByCategory(db).then(setCounts);
  }, [db]);

  // 1. Resolve the user's location once; fall back to Vilnius if denied.
  useEffect(() => {
    if (focus === 'current') return;
    let cancelled = false;
    (async () => {
      try {
        const region = await resolveCurrentRegion();
        if (cancelled) return;
        setOrigin({ latitude: region.latitude, longitude: region.longitude });
        setViewRegion((prev) => prev ?? region);
      } catch {
        if (!cancelled) {
          setOrigin((prev) => prev ?? VILNIUS);
          setViewRegion((prev) => prev ?? regionAround(VILNIUS, 0.18, 11));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [focus, resolveCurrentRegion]);

  useFocusEffect(
    useCallback(() => {
      if (focus !== 'current') return;
      let cancelled = false;
      (async () => {
        try {
          const region = await resolveCurrentRegion();
          if (!cancelled) {
            applyRegion(region);
            router.setParams({ focus: undefined });
          }
        } catch {
          if (!cancelled) {
            applyRegion(regionAround(VILNIUS, 0.18, 11));
            router.setParams({ focus: undefined });
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [applyRegion, focus, resolveCurrentRegion])
  );

  useEffect(() => {
    viewRegionRef.current = viewRegion;
  }, [viewRegion]);

  // 2. On every pan/zoom (or filter change) load two things in parallel:
  //    - cluster cells: a DB-side grid count of ALL shelters in view (markers),
  //    - nearest shelters: a distance-ordered slice for the carousel and for
  //      resolving single-shelter cells into tappable pins.
  useEffect(() => {
    if (!viewRegion) return;
    let cancelled = false;
    const bounds = boundsOf(viewRegion);
    const center = { latitude: viewRegion.latitude, longitude: viewRegion.longitude };
    const cell = {
      lat: viewRegion.latitudeDelta / CLUSTER_COLS,
      lng: viewRegion.longitudeDelta / CLUSTER_COLS,
    };
    const filter = { categories: categoriesForQuery };
    (async () => {
      const [cells, nearest] = await Promise.all([
        cell.lat > 0 && cell.lng > 0
          ? getClusterCells(db, bounds, cell, filter)
          : Promise.resolve([]),
        getSheltersInBounds(db, bounds, center, { ...filter, limit: 600 }, userLocation),
      ]);
      if (!cancelled) {
        setClusterCells(cells);
        setMapShelters(nearest);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, viewRegion, categoriesForQuery, userLocation]);

  const mapPoints = useMemo(() => {
    const byId = new Map(mapShelters.map((s) => [s.id, s]));
    return buildMapPoints(clusterCells, byId);
  }, [clusterCells, mapShelters]);

  useEffect(
    () => () => {
      if (moveTimer.current) clearTimeout(moveTimer.current);
    },
    []
  );

  // Initial camera is frozen after the first location fix so it doesn't fight
  // the user; subsequent pans/zooms are read live via onCameraMove.
  const initialCamera = useMemo(
    () => ({ coordinates: origin ?? VILNIUS, zoom: 12 }),
    [origin]
  );

  // Debounced so we reload once movement settles, not on every frame.
  const onCameraMove = useCallback((region: Region) => {
    if (moveTimer.current) clearTimeout(moveTimer.current);
    moveTimer.current = setTimeout(() => setViewRegion(region), 300);
  }, []);

  // Tapping a cluster zooms the camera in; the viewport effect then reloads at
  // finer granularity and the cluster breaks into its members.
  const onClusterPress = useCallback((latitude: number, longitude: number) => {
    const zoom = (viewRegionRef.current?.zoom ?? 12) + 2;
    mapRef.current?.setCameraPosition({
      coordinates: { latitude, longitude },
      zoom,
    });
  }, []);

  // Step the camera zoom in/out around the current center. The programmatic
  // move re-fires onCameraMove, so markers and the carousel reload to match.
  const onZoom = useCallback(
    (delta: number) => {
      const r = viewRegionRef.current;
      const center = r
        ? { latitude: r.latitude, longitude: r.longitude }
        : (origin ?? VILNIUS);
      const zoom = Math.max(4, Math.min(19, (r?.zoom ?? 12) + delta));
      mapRef.current?.setCameraPosition({ coordinates: center, zoom });
    },
    [origin]
  );

  const onLocate = useCallback(async () => {
    try {
      const region = await resolveCurrentRegion();
      applyRegion(region);
    } catch {
      applyRegion(regionAround(VILNIUS, 0.18, 11));
    }
  }, [applyRegion, resolveCurrentRegion]);

  const onMarkerTap = useCallback((id: string | undefined) => {
    if (!id) return;
    setPinnedId((prev) => (prev === id ? null : id));
    cardListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const clearPin = useCallback(() => setPinnedId(null), []);

  const filterActive = filter !== 'all';

  // Filter lives in the header (top-right) and opens a native picker, keeping
  // the map itself unobstructed.
  const openFilterSheet = useCallback(() => {
    const categoryLabels = SHELTER_CATEGORIES.map(
      (c) => `${t(`map.categories.${c}`)} · ${counts[c]}`
    );
    const labels = [t('map.filtersAll'), ...categoryLabels];
    const choose = (i: number) => {
      setFilter(i === 0 ? 'all' : SHELTER_CATEGORIES[i - 1]);
      setPinnedId(null);
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: t('map.filterTitle'),
          options: [...labels, t('map.filterCancel')],
          cancelButtonIndex: labels.length,
        },
        (i) => {
          if (i >= 0 && i < labels.length) choose(i);
        }
      );
    } else {
      // Android: a simple ordered dialog of the same options.
      Alert.alert(t('map.filterTitle'), undefined, [
        ...labels.map((label, i) => ({ text: label, onPress: () => choose(i) })),
        { text: t('map.filterCancel'), style: 'cancel' as const },
      ]);
    }
  }, [filter, filterActive, counts, t]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={openFilterSheet}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('map.filterTitle')}
          style={styles.headerButton}>
          <SlidersHorizontal
            size={22}
            color={filterActive ? colors.brand : colors.text}
          />
          {filterActive ? (
            <View style={[styles.headerDot, { backgroundColor: colors.brand }]} />
          ) : null}
        </Pressable>
      ),
    });
  }, [navigation, openFilterSheet, filterActive, colors, t]);

  const cardWidth = width - spacing.xl * 2;
  // The grounded tab bar sits in the layout flow, so the screen already ends at
  // its top edge — `bottom: 0` is flush against it. Just a small breathing gap.
  const bottomInset = spacing.sm;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ShelterMap
        ref={mapRef}
        points={mapPoints}
        cameraPosition={initialCamera}
        colorScheme={scheme}
        showUserLocation={locationGranted}
        onMarkerPress={onMarkerTap}
        onClusterPress={onClusterPress}
        onCameraMove={onCameraMove}
      />

      {/* Floating map controls on the right edge */}
      <View style={styles.rightControls} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('map.currentLocation')}
          onPress={() => void onLocate()}
          style={({ pressed }) => [
            styles.locateButton,
            { backgroundColor: colors.surface, borderColor: colors.border },
            pressed && { backgroundColor: colors.surfaceMuted },
          ]}>
          <Navigation size={22} color={colors.text} />
        </Pressable>
        <View
          style={[
            styles.zoomGroup,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('map.zoomIn')}
            onPress={() => onZoom(1)}
            style={({ pressed }) => [
              styles.zoomButton,
              pressed && { backgroundColor: colors.surfaceMuted },
            ]}>
            <Plus size={22} color={colors.text} />
          </Pressable>
          <View style={[styles.zoomDivider, { backgroundColor: colors.border }]} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('map.zoomOut')}
            onPress={() => onZoom(-1)}
            style={({ pressed }) => [
              styles.zoomButton,
              pressed && { backgroundColor: colors.surfaceMuted },
            ]}>
            <Minus size={22} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {/* Floating card carousel, above the tab bar */}
      <View
        style={[styles.bottomOverlay, { bottom: bottomInset }]}
        pointerEvents="box-none">
        {visibleShelters.length > 0 ? (
          <FlatList
            ref={cardListRef}
            horizontal
            data={visibleShelters}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            snapToInterval={cardWidth + spacing.md}
            decelerationRate="fast"
            contentContainerStyle={styles.carousel}
            renderItem={({ item }) => (
              <View style={{ width: cardWidth, marginRight: spacing.md }}>
                <ShelterCard
                  shelter={item}
                  highlighted={item.id === pinnedId}
                  onClear={clearPin}
                />
              </View>
            )}
            onScrollToIndexFailed={() => undefined}
          />
        ) : null}
      </View>
    </View>
  );
}

type MapHandle = {
  setCameraPosition: (c: { coordinates: LatLng; zoom?: number }) => void;
};

type ShelterMapProps = {
  points: MapPoint[];
  cameraPosition: { coordinates: { latitude: number; longitude: number }; zoom: number };
  colorScheme: 'light' | 'dark';
  // Only enable the native my-location layer when location permission is
  // granted — see `locationGranted` above (prevents a SecurityException crash).
  showUserLocation: boolean;
  onMarkerPress: (id: string | undefined) => void;
  onClusterPress: (latitude: number, longitude: number) => void;
  onCameraMove: (region: Region) => void;
};

function clusterLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}

function handleMarkerClick(
  id: string | undefined,
  points: MapPoint[],
  onMarkerPress: ShelterMapProps['onMarkerPress'],
  onClusterPress: ShelterMapProps['onClusterPress']
) {
  if (!id) return;
  if (id.startsWith('c-')) {
    const cluster = points.find((p) => p.kind === 'cluster' && p.id === id);
    if (cluster && cluster.kind === 'cluster') {
      onClusterPress(cluster.latitude, cluster.longitude);
    }
    return;
  }
  onMarkerPress(id);
}

const ShelterMap = forwardRef<MapHandle, ShelterMapProps>(function ShelterMap(
  {
    points,
    cameraPosition,
    colorScheme,
    showUserLocation,
    onMarkerPress,
    onClusterPress,
    onCameraMove,
  },
  ref
) {
  // Android markers can't draw a count/colour (no monogram/tint like iOS), so we
  // attach pre-rendered PNG icons: a numbered circle per cluster, a coloured
  // teardrop per category. Preloaded once (no-op on iOS).
  const icons = useMarkerIcons();

  if (Platform.OS === 'ios') {
    const markers: AppleMaps.Marker[] = points.map((p) =>
      p.kind === 'cluster'
        ? {
            id: p.id,
            coordinates: { latitude: p.latitude, longitude: p.longitude },
            monogram: clusterLabel(p.count),
            tintColor: CLUSTER_COLOR,
          }
        : {
            id: p.shelter.id,
            coordinates: {
              latitude: p.shelter.latitude,
              longitude: p.shelter.longitude,
            },
            title: p.shelter.name,
            systemImage: CATEGORY_SYMBOL_IOS[p.shelter.category],
            tintColor: CATEGORY_COLOR[p.shelter.category],
          }
    );

    return (
      <AppleMaps.View
        ref={ref as never}
        style={StyleSheet.absoluteFill}
        cameraPosition={cameraPosition}
        markers={markers}
        properties={{ isMyLocationEnabled: showUserLocation }}
        uiSettings={{ myLocationButtonEnabled: false, compassEnabled: true }}
        colorScheme={
          colorScheme === 'dark'
            ? AppleMaps.MapColorScheme.DARK
            : AppleMaps.MapColorScheme.LIGHT
        }
        onMarkerClick={(event) =>
          handleMarkerClick(event.id, points, onMarkerPress, onClusterPress)
        }
        onCameraMove={(event) => {
          if (event.coordinates.latitude != null && event.coordinates.longitude != null) {
            onCameraMove({
              latitude: event.coordinates.latitude,
              longitude: event.coordinates.longitude,
              latitudeDelta: event.latitudeDelta,
              longitudeDelta: event.longitudeDelta,
              zoom: event.zoom,
            });
          }
        }}
      />
    );
  }

  if (Platform.OS === 'android') {
    const markers: GoogleMaps.Marker[] = points.map((p) =>
      p.kind === 'cluster'
        ? {
            id: p.id,
            coordinates: { latitude: p.latitude, longitude: p.longitude },
            title: `${p.count}`,
            icon: icons.get(
              p.count > 99 ? 'c99plus' : `c${p.count}`
            ) as GoogleMaps.Marker['icon'],
            anchor: { x: 0.5, y: 0.5 }, // circle badge is centred on the point
          }
        : {
            id: p.shelter.id,
            coordinates: {
              latitude: p.shelter.latitude,
              longitude: p.shelter.longitude,
            },
            title: p.shelter.name,
            snippet: p.shelter.address ?? p.shelter.city,
            icon: icons.get(`cat_${p.shelter.category}`) as GoogleMaps.Marker['icon'],
            // teardrop tip sits on the point (default bottom-centre anchor)
          }
    );

    return (
      <GoogleMaps.View
        ref={ref as never}
        style={StyleSheet.absoluteFill}
        cameraPosition={cameraPosition}
        markers={markers}
        properties={{ isMyLocationEnabled: showUserLocation }}
        // Disable Google's native zoom buttons — the app draws its own (which
        // also serve iOS, where Apple Maps has none); avoids duplicate controls.
        uiSettings={{
          myLocationButtonEnabled: false,
          compassEnabled: true,
          zoomControlsEnabled: false,
        }}
        onMarkerClick={(event) =>
          handleMarkerClick(event.id, points, onMarkerPress, onClusterPress)
        }
        onCameraMove={(event) => {
          if (event.coordinates.latitude != null && event.coordinates.longitude != null) {
            onCameraMove({
              latitude: event.coordinates.latitude,
              longitude: event.coordinates.longitude,
              latitudeDelta: event.latitudeDelta,
              longitudeDelta: event.longitudeDelta,
              zoom: event.zoom,
            });
          }
        }}
      />
    );
  }

  return (
    <View style={styles.webFallback}>
      <Footnote tone="textSecondary">{points.length}</Footnote>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  headerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 5,
  },
  rightControls: {
    position: 'absolute',
    // App-owned controls stay together so provider-native map buttons cannot overlap them.
    top: spacing.md + 40 + spacing.md,
    right: spacing.xl,
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  locateButton: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomGroup: {
    width: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  zoomButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomDivider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  bottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    gap: spacing.sm,
  },
  carousel: {
    paddingHorizontal: spacing.xl,
  },
  webFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
