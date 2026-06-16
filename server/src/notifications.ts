import { b64uEncode, sha256 } from './auth';

export type CountryCode = 'LT' | 'LV' | 'EE' | 'PL';
export type PushPlatform = 'ios' | 'android';
export type PushEnvironment = 'sandbox' | 'production';
export type AlertSeverity = 'info' | 'watch' | 'warning' | 'critical';
export type FamilyNotificationType = 'member_joined' | 'member_left' | 'status_updated';
type FamilyNotificationLocale = 'en' | 'lt' | 'lv' | 'et' | 'pl' | 'uk';

export type NotificationEnv = {
  DB: D1Database;
  ALERT_QUEUE: Queue<AlertQueueMessage>;
  ADMIN_TOKEN: string;
  APNS_KEY_ID: string;
  APNS_TEAM_ID: string;
  APNS_BUNDLE_ID: string;
  APNS_PRIVATE_KEY: string;
  FCM_SERVICE_ACCOUNT_JSON?: string;
  FCM_ANDROID_PACKAGE_NAME?: string;
  // "true" only once Apple grants the Critical Alerts entitlement. Until then a
  // critical:true alert silently downgrades on-device, so createAlert coerces
  // it to time-sensitive (which needs no entitlement). See wrangler.toml [vars].
  APNS_CRITICAL_ENABLED?: string;
};

export type AlertQueueMessage = {
  kind: 'alert_batch';
  alertId: string;
  platform: PushPlatform | 'none';
  subscriptionIds: string[];
  smoke?: boolean;
};

export type CreateAlertInput = {
  title: string;
  body: string;
  countries: CountryCode[];
  severity: AlertSeverity;
  timeSensitive: boolean;
  critical: boolean;
  dryRun: boolean;
};

type PushSubscriptionRow = {
  id: string;
  platform: PushPlatform;
  token: string;
  environment: PushEnvironment;
  locale: string | null;
};

type AlertRow = {
  id: string;
  title: string;
  body: string;
  severity: AlertSeverity;
  time_sensitive: number;
  critical: number;
  dry_run: number;
  route: string | null;
  family_event_type: string | null;
};

type PushResult = {
  ok: boolean;
  status?: number;
  message?: string;
  invalidToken?: boolean;
  retryable?: boolean;
};

type FcmServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

const enc = new TextEncoder();
const dec = new TextDecoder();

const COUNTRY_SET = new Set<CountryCode>(['LT', 'LV', 'EE', 'PL']);
const SEVERITY_SET = new Set<AlertSeverity>(['info', 'watch', 'warning', 'critical']);
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 800;
const MAX_TOKEN_LENGTH = 4096;
const FANOUT_BATCH_SIZE = 100;
const DELIVERY_CONCURRENCY = 10;
const DELIVERY_PROCESSING_STALE_MS = 5 * 60 * 1000;
const ALERT_TTL_SECONDS = 30 * 60;
const APNS_JWT_TTL_SECONDS = 50 * 60;
const FAMILY_NOTIFICATION_ROUTE = '/(tabs)/family';
const FAMILY_NOTIFICATION_TYPES = ['member_joined', 'member_left', 'status_updated'] as const;

const FAMILY_NOTIFICATION_COPY: Record<
  FamilyNotificationLocale,
  Record<FamilyNotificationType, { title: string; body: string }>
> = {
  en: {
    member_joined: {
      title: 'Family update',
      body: 'A family member joined your group.',
    },
    member_left: {
      title: 'Family update',
      body: 'A family member left your group.',
    },
    status_updated: {
      title: 'Family status updated',
      body: 'A family member changed their safety status.',
    },
  },
  lt: {
    member_joined: {
      title: 'Šeimos atnaujinimas',
      body: 'Prie jūsų grupės prisijungė šeimos narys.',
    },
    member_left: {
      title: 'Šeimos atnaujinimas',
      body: 'Iš jūsų grupės išėjo šeimos narys.',
    },
    status_updated: {
      title: 'Šeimos būsena atnaujinta',
      body: 'Šeimos narys pakeitė saugumo būseną.',
    },
  },
  lv: {
    member_joined: {
      title: 'Ģimenes atjauninājums',
      body: 'Ģimenes dalībnieks pievienojās jūsu grupai.',
    },
    member_left: {
      title: 'Ģimenes atjauninājums',
      body: 'Ģimenes dalībnieks pameta jūsu grupu.',
    },
    status_updated: {
      title: 'Ģimenes statuss atjaunināts',
      body: 'Ģimenes dalībnieks mainīja drošības statusu.',
    },
  },
  et: {
    member_joined: {
      title: 'Pere uuendus',
      body: 'Pereliige liitus teie grupiga.',
    },
    member_left: {
      title: 'Pere uuendus',
      body: 'Pereliige lahkus teie grupist.',
    },
    status_updated: {
      title: 'Pere staatus uuendatud',
      body: 'Pereliige muutis oma ohutuse staatust.',
    },
  },
  pl: {
    member_joined: {
      title: 'Aktualizacja rodziny',
      body: 'Członek rodziny dołączył do grupy.',
    },
    member_left: {
      title: 'Aktualizacja rodziny',
      body: 'Członek rodziny opuścił grupę.',
    },
    status_updated: {
      title: 'Zaktualizowano status rodziny',
      body: 'Członek rodziny zmienił status bezpieczeństwa.',
    },
  },
  uk: {
    member_joined: {
      title: 'Оновлення сім’ї',
      body: 'Учасник сім’ї приєднався до вашої групи.',
    },
    member_left: {
      title: 'Оновлення сім’ї',
      body: 'Учасник сім’ї залишив вашу групу.',
    },
    status_updated: {
      title: 'Статус сім’ї оновлено',
      body: 'Учасник сім’ї змінив статус безпеки.',
    },
  },
};

let apnsJwtCache: { token: string; expiresAt: number } | null = null;
let fcmJwtCache: { token: string; expiresAt: number } | null = null;

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === 'string' && COUNTRY_SET.has(value as CountryCode);
}

export function parseCountries(value: unknown): CountryCode[] {
  if (!Array.isArray(value)) throw new Error('invalid countries');
  const seen = new Set<CountryCode>();
  for (const item of value) {
    if (!isCountryCode(item)) throw new Error('invalid countries');
    seen.add(item);
  }
  return [...seen];
}

export function parsePlatform(value: unknown): PushPlatform {
  if (value === 'ios' || value === 'android') return value;
  throw new Error('invalid platform');
}

export function parseEnvironment(value: unknown): PushEnvironment {
  if (value === undefined || value === null) return 'production';
  if (value === 'sandbox' || value === 'production') return value;
  throw new Error('invalid environment');
}

export function parseAlertInput(value: Record<string, unknown>): CreateAlertInput {
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  const body = typeof value.body === 'string' ? value.body.trim() : '';
  if (!title || title.length > MAX_TITLE_LENGTH) throw new Error('invalid title');
  if (!body || body.length > MAX_BODY_LENGTH) throw new Error('invalid body');

  const countries = parseCountries(value.countries);
  if (countries.length === 0) throw new Error('invalid countries');

  const severity =
    typeof value.severity === 'string' && SEVERITY_SET.has(value.severity as AlertSeverity)
      ? (value.severity as AlertSeverity)
      : 'warning';

  return {
    title,
    body,
    countries,
    severity,
    timeSensitive: value.timeSensitive === true,
    critical: value.critical === true,
    dryRun: value.dryRun === true,
  };
}

export function validatePushToken(token: unknown): string {
  if (typeof token !== 'string') throw new Error('invalid token');
  const normalized = token.trim();
  if (normalized.length < 16 || normalized.length > MAX_TOKEN_LENGTH) throw new Error('invalid token');
  return normalized;
}

export async function pushSubscriptionId(platform: PushPlatform, token: string): Promise<string> {
  return b64uEncode(await sha256(enc.encode(`${platform}:${token}`)));
}

export async function registerPushSubscription(
  env: NotificationEnv,
  input: {
    deviceId: string;
    platform: PushPlatform;
    token: string;
    environment: PushEnvironment;
    countries: CountryCode[];
    locale?: string | null;
    appVersion?: string | null;
    familyEnabled?: boolean | null;
  }
): Promise<{ id: string; enabled: boolean; familyEnabled: boolean; countries: CountryCode[] }> {
  const id = await pushSubscriptionId(input.platform, input.token);
  const ts = Date.now();
  const enabled = input.countries.length > 0;
  const familyEnabled = input.familyEnabled ?? null;

  // Token-binding protection: a (platform, token) pair already registered to a
  // DIFFERENT device must not be silently reassigned (token-theft / hijack). The
  // ON CONFLICT clause only updates the row when the existing device_id matches.
  const existing = await env.DB.prepare('SELECT device_id FROM push_subscriptions WHERE id = ?')
    .bind(id)
    .first<{ device_id: string }>();
  if (existing && existing.device_id !== input.deviceId) {
    throw new Error('token already registered to another device');
  }

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO push_subscriptions
         (id, device_id, platform, token, environment, app_version, locale, enabled, family_enabled,
          failure_count, last_error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 0), 0, NULL, ?, ?)
       ON CONFLICT(platform, token) DO UPDATE SET
         environment = excluded.environment,
         app_version = excluded.app_version,
         locale = excluded.locale,
         enabled = excluded.enabled,
         family_enabled = COALESCE(?, push_subscriptions.family_enabled),
         updated_at = excluded.updated_at
       WHERE push_subscriptions.device_id = excluded.device_id`
    ).bind(
      id,
      input.deviceId,
      input.platform,
      input.token,
      input.environment,
      input.appVersion ?? null,
      input.locale ?? null,
      enabled ? 1 : 0,
      familyEnabled === null ? null : familyEnabled ? 1 : 0,
      ts,
      ts,
      familyEnabled === null ? null : familyEnabled ? 1 : 0
    ),
    env.DB.prepare('DELETE FROM push_subscription_countries WHERE subscription_id = ?').bind(id),
  ]);

  if (enabled) {
    await env.DB.batch(
      input.countries.map((country) =>
        env.DB.prepare(
          'INSERT OR IGNORE INTO push_subscription_countries (subscription_id, country) VALUES (?, ?)'
        ).bind(id, country)
      )
    );
  }

  return { id, enabled, familyEnabled: Boolean(input.familyEnabled), countries: input.countries };
}

export async function clearPushSubscriptions(env: NotificationEnv, deviceId: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM push_subscription_countries
        WHERE subscription_id IN (SELECT id FROM push_subscriptions WHERE device_id = ?)`
    ).bind(deviceId),
    env.DB.prepare('DELETE FROM push_subscriptions WHERE device_id = ?').bind(deviceId),
  ]);
}

export async function updatePushPreferences(
  env: NotificationEnv,
  deviceId: string,
  input: { countries?: CountryCode[]; familyEnabled?: boolean }
): Promise<void> {
  const statements: D1PreparedStatement[] = [];
  if (input.countries) {
    statements.push(
      env.DB.prepare(
        `DELETE FROM push_subscription_countries
          WHERE subscription_id IN (SELECT id FROM push_subscriptions WHERE device_id = ?)`
      ).bind(deviceId),
      env.DB.prepare('UPDATE push_subscriptions SET enabled = ?, updated_at = ? WHERE device_id = ?').bind(
        input.countries.length > 0 ? 1 : 0,
        Date.now(),
        deviceId
      )
    );
  }
  if (typeof input.familyEnabled === 'boolean') {
    statements.push(
      env.DB.prepare('UPDATE push_subscriptions SET family_enabled = ?, updated_at = ? WHERE device_id = ?').bind(
        input.familyEnabled ? 1 : 0,
        Date.now(),
        deviceId
      )
    );
  }
  if (statements.length > 0) await env.DB.batch(statements);

  if (input.countries && input.countries.length > 0) {
    const { results } = await env.DB.prepare('SELECT id FROM push_subscriptions WHERE device_id = ?')
      .bind(deviceId)
      .all<{ id: string }>();
    const countryStatements = results.flatMap((subscription) =>
      input.countries!.map((country) =>
        env.DB.prepare(
          'INSERT OR IGNORE INTO push_subscription_countries (subscription_id, country) VALUES (?, ?)'
        ).bind(subscription.id, country)
      )
    );
    if (countryStatements.length > 0) await env.DB.batch(countryStatements);
  }
}

export async function createAlert(env: NotificationEnv, input: CreateAlertInput): Promise<{
  alertId: string;
  totalTargets: number;
  enqueuedBatches: number;
}> {
  const alertId = randomId(16);
  const ts = Date.now();

  // Apple Critical Alerts require a separate entitlement (aps-environment +
  // com.apple.developer.usernotifications.critical-alerts). Until it is granted
  // (APNS_CRITICAL_ENABLED="true"), interruption-level "critical" is rejected/
  // ignored and the alert silently downgrades — worse, it loses time-sensitive
  // treatment. So coerce critical -> time-sensitive here (no entitlement needed)
  // and persist the honest values, which is what the APNs builder reads.
  const criticalAllowed = env.APNS_CRITICAL_ENABLED === 'true';
  const critical = input.critical && criticalAllowed;
  const timeSensitive = input.timeSensitive || (input.critical && !criticalAllowed);
  if (input.critical && !criticalAllowed) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'critical_downgraded_no_entitlement',
        alertId,
        message: 'critical:true requested but APNS_CRITICAL_ENABLED!="true"; sent as time-sensitive',
      })
    );
  }

  const byPlatform = await findTargets(env, input.countries);
  const totalTargets = byPlatform.ios.length + byPlatform.android.length;
  const accountingTargets = input.dryRun ? Math.max(1, totalTargets) : totalTargets;
  const batches: AlertQueueMessage[] = [];

  for (const platform of ['ios', 'android'] as const) {
    const ids = byPlatform[platform];
    for (let i = 0; i < ids.length; i += FANOUT_BATCH_SIZE) {
      batches.push({
        kind: 'alert_batch',
        alertId,
        platform,
        subscriptionIds: ids.slice(i, i + FANOUT_BATCH_SIZE),
      });
    }
  }

  if (input.dryRun && batches.length === 0) {
    batches.push({
      kind: 'alert_batch',
      alertId,
      platform: 'none',
      subscriptionIds: [],
      smoke: true,
    });
  }

  await env.DB.prepare(
    `INSERT INTO notification_alerts
       (id, title, body, severity, countries, time_sensitive, critical, dry_run, status,
        total_targets, enqueued_batches, sent_count, failed_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, 0, 0, ?)`
  )
    .bind(
      alertId,
      input.title,
      input.body,
      input.severity,
      JSON.stringify(input.countries),
      timeSensitive ? 1 : 0,
      critical ? 1 : 0,
      input.dryRun ? 1 : 0,
      accountingTargets,
      batches.length,
      ts
    )
    .run();

  if (batches.length > 0) {
    try {
      await env.ALERT_QUEUE.sendBatch(batches.map((body) => ({ body })));
    } catch (err) {
      await env.DB.prepare(
        "UPDATE notification_alerts SET status = 'failed', completed_at = ? WHERE id = ?"
      )
        .bind(Date.now(), alertId)
        .run();
      throw err;
    }
  }

  if (batches.length === 0) {
    await env.DB.prepare(
      "UPDATE notification_alerts SET status = 'completed', completed_at = ? WHERE id = ?"
    )
      .bind(Date.now(), alertId)
      .run();
  }

  return { alertId, totalTargets, enqueuedBatches: batches.length };
}

export async function createFamilyNotification(
  env: NotificationEnv,
  input: {
    groupId: string;
    type: FamilyNotificationType;
    excludeDeviceIds: string[];
  }
): Promise<{
  alertId: string;
  totalTargets: number;
  enqueuedBatches: number;
}> {
  const copy = FAMILY_NOTIFICATION_COPY.en[input.type];
  const alertId = randomId(16);
  const ts = Date.now();
  const byPlatform = await findFamilyTargets(env, input.groupId, input.excludeDeviceIds);
  const totalTargets = byPlatform.ios.length + byPlatform.android.length;
  const batches: AlertQueueMessage[] = [];

  for (const platform of ['ios', 'android'] as const) {
    const ids = byPlatform[platform];
    for (let i = 0; i < ids.length; i += FANOUT_BATCH_SIZE) {
      batches.push({
        kind: 'alert_batch',
        alertId,
        platform,
        subscriptionIds: ids.slice(i, i + FANOUT_BATCH_SIZE),
      });
    }
  }

  await env.DB.prepare(
    `INSERT INTO notification_alerts
       (id, title, body, severity, countries, time_sensitive, critical, dry_run, status,
        total_targets, enqueued_batches, sent_count, failed_count, route, family_event_type, created_at)
     VALUES (?, ?, ?, 'watch', '[]', 1, 0, 0, 'queued', ?, ?, 0, 0, ?, ?, ?)`
  )
    .bind(
      alertId,
      copy.title,
      copy.body,
      totalTargets,
      batches.length,
      FAMILY_NOTIFICATION_ROUTE,
      input.type,
      ts
    )
    .run();

  if (batches.length > 0) {
    try {
      await env.ALERT_QUEUE.sendBatch(batches.map((body) => ({ body })));
    } catch (err) {
      await env.DB.prepare(
        "UPDATE notification_alerts SET status = 'failed', completed_at = ? WHERE id = ?"
      )
        .bind(Date.now(), alertId)
        .run();
      throw err;
    }
  } else {
    await env.DB.prepare(
      "UPDATE notification_alerts SET status = 'completed', completed_at = ? WHERE id = ?"
    )
      .bind(Date.now(), alertId)
      .run();
  }

  return { alertId, totalTargets, enqueuedBatches: batches.length };
}

/**
 * Anti push-spam cooldown. Atomically claims a (group, device, event) slot:
 * returns true (allowed to send) only when at least `cooldownMs` has elapsed
 * since the last send. The UPSERT updates last_sent_at only when the cooldown
 * has elapsed, and "row changed" means this caller won the slot.
 */
export async function claimFamilyNotificationSlot(
  env: NotificationEnv,
  groupId: string,
  deviceId: string,
  eventType: FamilyNotificationType,
  cooldownMs: number
): Promise<boolean> {
  const ts = Date.now();
  const result = await env.DB.prepare(
    `INSERT INTO family_notification_cooldowns (group_id, device_id, event_type, last_sent_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(group_id, device_id, event_type) DO UPDATE SET last_sent_at = excluded.last_sent_at
       WHERE excluded.last_sent_at - family_notification_cooldowns.last_sent_at >= ?`
  )
    .bind(groupId, deviceId, eventType, ts, cooldownMs)
    .run();
  return changed(result) > 0;
}

export async function getAlertStatus(env: NotificationEnv, alertId: string) {
  return env.DB.prepare(
    `SELECT id, severity, countries, dry_run, status, total_targets, enqueued_batches,
            sent_count, failed_count, family_event_type, created_at, completed_at
       FROM notification_alerts
      WHERE id = ?`
  )
    .bind(alertId)
    .first();
}

export async function processAlertBatch(env: NotificationEnv, message: AlertQueueMessage): Promise<void> {
  if (message.kind !== 'alert_batch') return;

  const alert = await env.DB.prepare(
    `SELECT id, title, body, severity, time_sensitive, critical, dry_run, route, family_event_type
       FROM notification_alerts
      WHERE id = ?`
  )
    .bind(message.alertId)
    .first<AlertRow>();
  if (!alert) throw new Error('alert not found');

  if (alert.dry_run || message.smoke || message.platform === 'none') {
    const dryRunCount = Math.max(1, message.subscriptionIds.length);
    await recordDelivery(env, {
      alertId: message.alertId,
      subscriptionId: null,
      platform: message.platform === 'none' ? 'ios' : message.platform,
      status: 'dry_run',
      providerStatus: null,
      providerMessage: `dry run (${dryRunCount} target${dryRunCount === 1 ? '' : 's'})`,
    });
    await incrementAlert(env, message.alertId, dryRunCount, 0);
    return;
  }

  if (message.subscriptionIds.length === 0) {
    await incrementAlert(env, message.alertId, 0, 0);
    return;
  }

  const subscriptions = await loadSubscriptions(env, message.subscriptionIds);
  let hasRetryableFailure = false;
  for (let i = 0; i < subscriptions.length; i += DELIVERY_CONCURRENCY) {
    const outcomes = await Promise.all(
      subscriptions.slice(i, i + DELIVERY_CONCURRENCY).map((subscription) =>
        processOneSubscription(env, message.alertId, subscription, alert)
      )
    );
    hasRetryableFailure = outcomes.some((outcome) => outcome.retryable) || hasRetryableFailure;
  }

  if (hasRetryableFailure) throw new Error(`retryable provider failure for alert ${message.alertId}`);
}

export async function processDeadLetterBatch(env: NotificationEnv, message: AlertQueueMessage): Promise<void> {
  if (message.kind !== 'alert_batch' || message.platform === 'none' || message.subscriptionIds.length === 0) return;
  const subscriptions = await loadSubscriptionsById(env, message.subscriptionIds);
  for (const subscription of subscriptions) {
    const began = await beginDeliveryAttempt(env, message.alertId, subscription);
    if (!began) continue;
    await completeDeliveryAttempt(env, message.alertId, subscription, {
      ok: false,
      status: 0,
      message: 'delivery retry exhausted',
    });
  }
}

async function processOneSubscription(
  env: NotificationEnv,
  alertId: string,
  subscription: PushSubscriptionRow,
  alert: AlertRow
): Promise<{ retryable: boolean }> {
  const began = await beginDeliveryAttempt(env, alertId, subscription);
  if (!began) return { retryable: false };

  const result =
    subscription.platform === 'ios'
      ? await sendApns(env, subscription, alert)
      : await sendFcm(env, subscription, alert);

  if (result.retryable) {
    await releaseDeliveryAttempt(env, alertId, subscription.id, result);
    return { retryable: true };
  }

  await completeDeliveryAttempt(env, alertId, subscription, result);
  return { retryable: false };
}

async function findTargets(env: NotificationEnv, countries: CountryCode[]): Promise<Record<PushPlatform, string[]>> {
  const placeholders = countries.map(() => '?').join(', ');
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT s.id, s.platform
       FROM push_subscriptions s
       JOIN push_subscription_countries c ON c.subscription_id = s.id
      WHERE s.enabled = 1
        AND c.country IN (${placeholders})`
  )
    .bind(...countries)
    .all<{ id: string; platform: PushPlatform }>();

  const out: Record<PushPlatform, string[]> = { ios: [], android: [] };
  for (const row of results) {
    if (row.platform === 'ios' || row.platform === 'android') out[row.platform].push(row.id);
  }
  return out;
}

async function loadSubscriptions(env: NotificationEnv, ids: string[]): Promise<PushSubscriptionRow[]> {
  const placeholders = ids.map(() => '?').join(', ');
  const { results } = await env.DB.prepare(
    `SELECT id, platform, token, environment, locale
       FROM push_subscriptions
      WHERE id IN (${placeholders})`
  )
    .bind(...ids)
    .all<PushSubscriptionRow>();
  return results;
}

async function loadSubscriptionsById(env: NotificationEnv, ids: string[]): Promise<PushSubscriptionRow[]> {
  const placeholders = ids.map(() => '?').join(', ');
  const { results } = await env.DB.prepare(
    `SELECT id, platform, token, environment, locale
       FROM push_subscriptions
      WHERE id IN (${placeholders})`
  )
    .bind(...ids)
    .all<PushSubscriptionRow>();
  return results;
}

async function findFamilyTargets(
  env: NotificationEnv,
  groupId: string,
  excludeDeviceIds: string[]
): Promise<Record<PushPlatform, string[]>> {
  const excludes = [...new Set(excludeDeviceIds)].filter(Boolean);
  const excludeSql = excludes.length > 0 ? `AND m.device_id NOT IN (${excludes.map(() => '?').join(', ')})` : '';
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT s.id, s.platform
       FROM push_subscriptions s
       JOIN memberships m ON m.device_id = s.device_id
      WHERE m.group_id = ?
        AND s.family_enabled = 1
        ${excludeSql}`
  )
    .bind(groupId, ...excludes)
    .all<{ id: string; platform: PushPlatform }>();

  const out: Record<PushPlatform, string[]> = { ios: [], android: [] };
  for (const row of results) {
    if (row.platform === 'ios' || row.platform === 'android') out[row.platform].push(row.id);
  }
  return out;
}

async function beginDeliveryAttempt(
  env: NotificationEnv,
  alertId: string,
  subscription: PushSubscriptionRow
): Promise<boolean> {
  const ts = Date.now();
  const inserted = await env.DB.prepare(
    `INSERT INTO notification_delivery_state
       (alert_id, subscription_id, platform, status, attempts, created_at, updated_at)
     VALUES (?, ?, ?, 'processing', 1, ?, ?)
     ON CONFLICT(alert_id, subscription_id) DO NOTHING`
  )
    .bind(alertId, subscription.id, subscription.platform, ts, ts)
    .run();
  if (changed(inserted) > 0) return true;

  const state = await env.DB.prepare(
    'SELECT status, updated_at FROM notification_delivery_state WHERE alert_id = ? AND subscription_id = ?'
  )
    .bind(alertId, subscription.id)
    .first<{ status: string; updated_at: number }>();
  if (!state || state.status === 'sent' || state.status === 'failed') return false;
  if (ts - state.updated_at < DELIVERY_PROCESSING_STALE_MS) return false;

  const claimed = await env.DB.prepare(
    `UPDATE notification_delivery_state
        SET attempts = attempts + 1,
            updated_at = ?
      WHERE alert_id = ?
        AND subscription_id = ?
        AND status = 'processing'
        AND updated_at <= ?`
  )
    .bind(ts, alertId, subscription.id, ts - DELIVERY_PROCESSING_STALE_MS)
    .run();
  return changed(claimed) > 0;
}

async function releaseDeliveryAttempt(
  env: NotificationEnv,
  alertId: string,
  subscriptionId: string,
  result: PushResult
) {
  await env.DB.prepare(
    `DELETE FROM notification_delivery_state
      WHERE alert_id = ?
        AND subscription_id = ?
        AND status = 'processing'`
  )
    .bind(alertId, subscriptionId)
    .run();
  await env.DB.prepare(
    `UPDATE push_subscriptions
        SET failure_count = failure_count + 1,
            last_error = ?,
            updated_at = ?
      WHERE id = ?`
  )
    .bind(result.message ?? 'retryable provider error', Date.now(), subscriptionId)
    .run();
}

async function completeDeliveryAttempt(
  env: NotificationEnv,
  alertId: string,
  subscription: PushSubscriptionRow,
  result: PushResult
) {
  const status = result.ok ? 'sent' : 'failed';
  const completed = await env.DB.prepare(
    `UPDATE notification_delivery_state
        SET status = ?,
            provider_status = ?,
            provider_message = ?,
            updated_at = ?
      WHERE alert_id = ?
        AND subscription_id = ?
        AND status = 'processing'`
  )
    .bind(status, result.status ?? null, result.message ?? null, Date.now(), alertId, subscription.id)
    .run();
  if (changed(completed) === 0) return;

  if (result.ok) {
    await env.DB.prepare(
      'UPDATE push_subscriptions SET failure_count = 0, last_error = NULL, updated_at = ? WHERE id = ?'
    )
      .bind(Date.now(), subscription.id)
      .run();
  } else if (result.invalidToken) {
    await deletePushSubscription(env, subscription.id);
  } else {
    await env.DB.prepare(
      `UPDATE push_subscriptions
          SET failure_count = failure_count + 1,
              last_error = ?,
              updated_at = ?
        WHERE id = ?`
    )
      .bind(result.message ?? 'provider error', Date.now(), subscription.id)
      .run();
  }

  await recordDelivery(env, {
    alertId,
    subscriptionId: subscription.id,
    platform: subscription.platform,
    status,
    providerStatus: result.status ?? null,
    providerMessage: result.message ?? null,
  });
  await incrementAlert(env, alertId, result.ok ? 1 : 0, result.ok ? 0 : 1);
}

async function deletePushSubscription(env: NotificationEnv, subscriptionId: string) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM push_subscription_countries WHERE subscription_id = ?').bind(subscriptionId),
    env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(subscriptionId),
  ]);
}

function changed(result: D1Result<unknown>): number {
  const meta = result.meta as { changes?: number } | undefined;
  return typeof meta?.changes === 'number' ? meta.changes : 0;
}

async function recordDelivery(
  env: NotificationEnv,
  input: {
    alertId: string;
    subscriptionId: string | null;
    platform: PushPlatform;
    status: 'sent' | 'failed' | 'dry_run';
    providerStatus: number | null;
    providerMessage: string | null;
  }
) {
  await env.DB.prepare(
    `INSERT INTO notification_deliveries
       (id, alert_id, subscription_id, platform, status, provider_status, provider_message, attempted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      randomId(16),
      input.alertId,
      input.subscriptionId,
      input.platform,
      input.status,
      input.providerStatus,
      input.providerMessage,
      Date.now()
    )
    .run();
}

async function incrementAlert(env: NotificationEnv, alertId: string, sent: number, failed: number) {
  await env.DB.prepare(
    `UPDATE notification_alerts
        SET sent_count = sent_count + ?,
            failed_count = failed_count + ?,
            status = CASE
              WHEN sent_count + ? + failed_count + ? >= total_targets THEN 'completed'
              ELSE 'sending'
            END,
            completed_at = CASE
              WHEN sent_count + ? + failed_count + ? >= total_targets THEN ?
              ELSE completed_at
            END
      WHERE id = ?`
  )
    .bind(sent, failed, sent, failed, sent, failed, Date.now(), alertId)
    .run();
}

async function sendApns(
  env: NotificationEnv,
  subscription: PushSubscriptionRow,
  alert: AlertRow
): Promise<PushResult> {
  const jwt = await getApnsJwt(env);
  const endpoint =
    subscription.environment === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
  const interruptionLevel = alert.critical ? 'critical' : alert.time_sensitive ? 'time-sensitive' : 'active';
  const copy = notificationCopy(alert, subscription.locale);
  const payload: Record<string, unknown> = {
    aps: {
      alert: { title: copy.title, body: copy.body },
      sound: alert.critical ? { critical: 1, name: 'default', volume: 1 } : 'default',
      'interruption-level': interruptionLevel,
    },
    alertId: alert.id,
    severity: alert.severity,
  };
  if (alert.route) payload.url = alert.route;
  if (isFamilyNotificationType(alert.family_event_type)) payload.familyEventType = alert.family_event_type;

  const res = await fetch(`${endpoint}/3/device/${encodeURIComponent(subscription.token)}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': env.APNS_BUNDLE_ID.trim(),
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + ALERT_TTL_SECONDS),
      'apns-collapse-id': alert.id,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (res.ok) return { ok: true, status: res.status };
  const detail = await readProviderMessage(res);
  const reason = apnsReason(detail);
  return {
    ok: false,
    status: res.status,
    message: detail,
    invalidToken: reason === 'BadDeviceToken' || reason === 'Unregistered',
    retryable: isRetryableProviderStatus(res.status),
  };
}

async function sendFcm(
  env: NotificationEnv,
  subscription: PushSubscriptionRow,
  alert: AlertRow
): Promise<PushResult> {
  if (!env.FCM_SERVICE_ACCOUNT_JSON) {
    return { ok: false, status: 0, message: 'fcm_not_configured' };
  }

  const account = parseFcmServiceAccount(env.FCM_SERVICE_ACCOUNT_JSON);
  const accessToken = await getFcmAccessToken(account);
  const copy = notificationCopy(alert, subscription.locale);
  const data: Record<string, string> = { alertId: alert.id, severity: alert.severity };
  if (alert.route) data.url = alert.route;
  if (isFamilyNotificationType(alert.family_event_type)) data.familyEventType = alert.family_event_type;

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token: subscription.token,
        notification: { title: copy.title, body: copy.body },
        data,
        android: {
          priority: 'HIGH',
          ttl: `${ALERT_TTL_SECONDS}s`,
          restricted_package_name: (env.FCM_ANDROID_PACKAGE_NAME ?? env.APNS_BUNDLE_ID).trim(),
          notification: {
            channel_id: 'emergency-alerts',
            notification_priority: 'PRIORITY_MAX',
            default_sound: true,
          },
        },
      },
    }),
  });

  if (res.ok) return { ok: true, status: res.status };
  const detail = await readProviderMessage(res);
  const fcmCode = fcmErrorCode(detail);
  return {
    ok: false,
    status: res.status,
    message: detail,
    invalidToken: fcmCode === 'UNREGISTERED' || isInvalidFcmRegistrationToken(detail),
    retryable: isRetryableProviderStatus(res.status),
  };
}

async function getApnsJwt(env: NotificationEnv): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (apnsJwtCache && apnsJwtCache.expiresAt > nowSeconds) return apnsJwtCache.token;

  const header = b64uJson({ alg: 'ES256', kid: env.APNS_KEY_ID.trim() });
  const claims = b64uJson({ iss: env.APNS_TEAM_ID.trim(), iat: nowSeconds });
  const signingInput = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(env.APNS_PRIVATE_KEY),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(signingInput));
  const token = `${signingInput}.${b64uEncode(ecdsaSignatureToJose(new Uint8Array(signature), 32))}`;
  apnsJwtCache = { token, expiresAt: nowSeconds + APNS_JWT_TTL_SECONDS };
  return token;
}

async function getFcmAccessToken(account: FcmServiceAccount): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (fcmJwtCache && fcmJwtCache.expiresAt > nowSeconds) return fcmJwtCache.token;

  const header = b64uJson({ alg: 'RS256', typ: 'JWT' });
  const claims = b64uJson({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  });
  const signingInput = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(signingInput));
  const assertion = `${signingInput}.${b64uEncode(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!res.ok) throw new Error(`fcm auth failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error('fcm auth missing token');
  fcmJwtCache = {
    token: body.access_token,
    expiresAt: nowSeconds + Math.max(60, (body.expires_in ?? 3600) - 120),
  };
  return fcmJwtCache.token;
}

function parseFcmServiceAccount(raw: string): FcmServiceAccount {
  const parsed = JSON.parse(raw) as Partial<FcmServiceAccount>;
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('invalid fcm service account');
  }
  return {
    project_id: parsed.project_id,
    client_email: parsed.client_email,
    private_key: parsed.private_key,
  };
}

function b64uJson(value: unknown): string {
  return b64uEncode(enc.encode(JSON.stringify(value)));
}

function pemToDer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function ecdsaSignatureToJose(signature: Uint8Array, partLength: number): Uint8Array {
  if (signature.byteLength === partLength * 2) return signature;

  if (signature[0] !== 0x30) throw new Error('invalid ecdsa signature');
  let offset = 2;
  if (signature[1] & 0x80) offset = 2 + (signature[1] & 0x7f);
  if (signature[offset] !== 0x02) throw new Error('invalid ecdsa signature');
  const rLength = signature[offset + 1];
  const r = signature.slice(offset + 2, offset + 2 + rLength);
  offset = offset + 2 + rLength;
  if (signature[offset] !== 0x02) throw new Error('invalid ecdsa signature');
  const sLength = signature[offset + 1];
  const s = signature.slice(offset + 2, offset + 2 + sLength);

  const out = new Uint8Array(partLength * 2);
  out.set(trimOrPadInteger(r, partLength), 0);
  out.set(trimOrPadInteger(s, partLength), partLength);
  return out;
}

function trimOrPadInteger(value: Uint8Array, length: number): Uint8Array {
  let bytes = value;
  while (bytes.length > 0 && bytes[0] === 0 && bytes.length > length) bytes = bytes.slice(1);
  if (bytes.length > length) throw new Error('invalid ecdsa integer');
  const out = new Uint8Array(length);
  out.set(bytes, length - bytes.length);
  return out;
}

async function readProviderMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  return text.slice(0, 500) || res.statusText || 'provider error';
}

function isRetryableProviderStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function apnsReason(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { reason?: unknown };
    return typeof parsed.reason === 'string' ? parsed.reason : null;
  } catch {
    return null;
  }
}

function fcmErrorCode(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as {
      error?: { details?: Array<{ errorCode?: unknown }>; status?: unknown };
    };
    const detailCode = parsed.error?.details?.find((detail) => typeof detail.errorCode === 'string')?.errorCode;
    if (typeof detailCode === 'string') return detailCode;
    return typeof parsed.error?.status === 'string' ? parsed.error.status : null;
  } catch {
    return null;
  }
}

function isInvalidFcmRegistrationToken(raw: string): boolean {
  return raw.toLowerCase().includes('registration token is not a valid fcm registration token');
}

function isFamilyNotificationType(value: unknown): value is FamilyNotificationType {
  return typeof value === 'string' && FAMILY_NOTIFICATION_TYPES.includes(value as FamilyNotificationType);
}

function notificationLocale(locale: string | null): FamilyNotificationLocale {
  const code = locale?.toLowerCase().split(/[-_]/)[0] ?? '';
  return code in FAMILY_NOTIFICATION_COPY ? (code as FamilyNotificationLocale) : 'en';
}

function notificationCopy(alert: AlertRow, locale: string | null): { title: string; body: string } {
  if (isFamilyNotificationType(alert.family_event_type)) {
    return FAMILY_NOTIFICATION_COPY[notificationLocale(locale)][alert.family_event_type];
  }
  return { title: alert.title, body: alert.body };
}

function randomId(bytes = 16): string {
  return b64uEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}
