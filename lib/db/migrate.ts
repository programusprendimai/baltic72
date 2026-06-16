import type { SQLiteDatabase } from 'expo-sqlite';

import checklistSeed from '@/data/seed/checklist.json';
import shelterManifest from '@/data/seed/shelters.manifest.json';
import { MIGRATIONS, SCHEMA_VERSION } from '@/lib/db/schema';

/**
 * Verifies the schema and seeds the small 72h-kit checklist.
 *
 * Shelters are NOT seeded here — the full multi-country set (LT + EE + LV + PL,
 * ~98k points) ships inside a prebuilt SQLite database asset that expo-sqlite
 * copies on first launch (see DatabaseProvider's `assetSource`). That avoids
 * inlining a 55 MB JSON into the JS bundle and inserting ~98k rows at runtime.
 * Subsequent shelter updates arrive over the network via lib/sync.ts.
 *
 * On a fresh install the DB already contains everything (the prebuilt asset),
 * so the statements below are idempotent no-ops; they only matter as a safety
 * net if the app ever opens a database that the asset copy didn't populate.
 */
export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync('PRAGMA journal_mode = WAL;');

  for (const statement of MIGRATIONS) {
    await db.execAsync(statement);
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)`,
    String(SCHEMA_VERSION)
  );

  const shelterCount = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM shelters`
  );
  const currentShelterVersion = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM meta WHERE key = 'shelter_data_version'`
  );
  if (
    !currentShelterVersion?.value &&
    (shelterCount?.count ?? 0) === shelterManifest.count
  ) {
    await db.runAsync(
      `INSERT OR REPLACE INTO meta (key, value) VALUES ('shelter_data_version', ?)`,
      shelterManifest.version
    );
  }

  for (const item of checklistSeed) {
    await db.runAsync(
      `INSERT INTO checklist_items (id, category, sort_order, label_key)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         category = excluded.category,
         sort_order = excluded.sort_order,
         label_key = excluded.label_key`,
      item.id,
      item.category,
      item.sort_order,
      item.label_key
    );
    await db.runAsync(
      `INSERT OR IGNORE INTO checklist_state (item_id, checked) VALUES (?, 0)`,
      item.id
    );
  }

  const seedIds = checklistSeed.map((item) => item.id);
  const placeholders = seedIds.map(() => '?').join(', ');
  await db.runAsync(
    `DELETE FROM checklist_state WHERE item_id NOT IN (${placeholders})`,
    ...seedIds
  );
  await db.runAsync(
    `DELETE FROM checklist_items WHERE id NOT IN (${placeholders})`,
    ...seedIds
  );
}
