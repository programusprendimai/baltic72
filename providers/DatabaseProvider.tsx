import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import type { ReactNode } from 'react';

import { initializeDatabase } from '@/lib/db/migrate';
import { refreshShelters } from '@/lib/sync';

function ShelterSyncBridge({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const initialSyncTriggered = useRef(false);

  useEffect(() => {
    if (initialSyncTriggered.current) return;
    initialSyncTriggered.current = true;
    void refreshShelters(db);
  }, [db]);

  useEffect(() => {
    const handler = (state: AppStateStatus) => {
      if (state === 'active') {
        void refreshShelters(db);
      }
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, [db]);

  return <>{children}</>;
}

export function DatabaseProvider({ children }: { children: ReactNode }) {
  return (
    <SQLiteProvider
      databaseName="baltic72.db"
      // Ships a prebuilt DB (LT+EE+LV+PL shelters + checklist) copied on first
      // launch — avoids inlining a 55 MB JSON and inserting ~98k rows at runtime.
      assetSource={{ assetId: require('../assets/db/baltic72.db') }}
      onInit={initializeDatabase}>
      <ShelterSyncBridge>{children}</ShelterSyncBridge>
    </SQLiteProvider>
  );
}
