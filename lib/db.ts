// Storage: Neon Postgres in production, an in-memory store in demo mode.
//
// Stored: tokens, the plan and manual overrides. The only Strava activity data
// kept is the laps of interval and tempo runs, for at most 7 days (Strava's API
// terms limit caching to 7 days), so rep paces don't cost an API call per run
// on every page load.

import { neon } from "@neondatabase/serverless";
import { databaseUrl, isDemo } from "./config";
import type { ManualStatus, Override, Plan } from "./types";

export interface AthleteRecord {
  id: number;
  firstname: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // seconds since the epoch
}

export interface PlanRecord {
  plan: Plan;
  updatedAt: string; // ISO timestamp
}

/** One lap of a Strava activity, as cached. */
export interface StoredLap {
  distanceM: number;
  movingTimeS: number;
  avgHr: number | null;
}

export const LAP_CACHE_DAYS = 7;

export interface Store {
  upsertAthlete(athlete: AthleteRecord): Promise<void>;
  getAthlete(id: number): Promise<AthleteRecord | null>;
  updateTokens(
    id: number,
    accessToken: string,
    refreshToken: string,
    expiresAt: number,
  ): Promise<void>;
  getPlan(athleteId: number): Promise<PlanRecord | null>;
  /** IDs of every athlete who has uploaded a plan, oldest sign-up first. */
  listAthletesWithPlans(): Promise<number[]>;
  savePlan(athleteId: number, plan: Plan): Promise<PlanRecord>;
  getOverrides(athleteId: number): Promise<Override[]>;
  /** Saves an override, or deletes it when both status and activityIds are null. */
  setOverride(athleteId: number, override: Override): Promise<void>;
  /** Cached laps fetched in the last 7 days; older ones are deleted. */
  getLaps(athleteId: number, activityIds: number[]): Promise<Map<number, StoredLap[]>>;
  saveLaps(athleteId: number, activityId: number, laps: StoredLap[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// Neon Postgres

type Sql = ReturnType<typeof neon>;
type Row = Record<string, unknown>;

let schemaReady: Promise<void> | null = null;

/** Creates the tables on first use, once per server instance. */
function ensureSchema(sql: Sql): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`create table if not exists athletes (
        id bigint primary key,
        firstname text,
        access_token text,
        refresh_token text,
        expires_at bigint,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )`;
      await sql`create table if not exists plans (
        athlete_id bigint primary key references athletes(id) on delete cascade,
        plan jsonb not null,
        updated_at timestamptz not null default now()
      )`;
      await sql`create table if not exists session_overrides (
        athlete_id bigint not null references athletes(id) on delete cascade,
        session_id text not null,
        status text null,
        activity_ids bigint[] null,
        updated_at timestamptz not null default now(),
        primary key (athlete_id, session_id)
      )`;
      await sql`create table if not exists activity_laps (
        athlete_id bigint not null references athletes(id) on delete cascade,
        activity_id bigint not null,
        laps jsonb not null,
        fetched_at timestamptz not null default now(),
        primary key (athlete_id, activity_id)
      )`;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  const ready = schemaReady;
  return ready;
}

function toIso(value: unknown): string {
  const iso = new Date(value as string | Date).toISOString();
  return iso;
}

class NeonStore implements Store {
  private sql: Sql;

  constructor(url: string) {
    this.sql = neon(url);
  }

  private async rows(query: Promise<unknown>): Promise<Row[]> {
    const result = (await query) as Row[];
    return result;
  }

  async upsertAthlete(a: AthleteRecord): Promise<void> {
    await ensureSchema(this.sql);
    await this.sql`
      insert into athletes (id, firstname, access_token, refresh_token, expires_at)
      values (${a.id}, ${a.firstname}, ${a.accessToken}, ${a.refreshToken}, ${a.expiresAt})
      on conflict (id) do update set
        firstname = excluded.firstname,
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at,
        updated_at = now()`;
  }

  async getAthlete(id: number): Promise<AthleteRecord | null> {
    await ensureSchema(this.sql);
    const rows = await this.rows(this.sql`select * from athletes where id = ${id}`);
    const row = rows[0];
    const athlete: AthleteRecord | null = row
      ? {
          id: Number(row.id),
          firstname: String(row.firstname ?? ""),
          accessToken: String(row.access_token),
          refreshToken: String(row.refresh_token),
          expiresAt: Number(row.expires_at),
        }
      : null;
    return athlete;
  }

  async updateTokens(
    id: number,
    accessToken: string,
    refreshToken: string,
    expiresAt: number,
  ): Promise<void> {
    await ensureSchema(this.sql);
    await this.sql`
      update athletes set access_token = ${accessToken}, refresh_token = ${refreshToken},
        expires_at = ${expiresAt}, updated_at = now()
      where id = ${id}`;
  }

  async getPlan(athleteId: number): Promise<PlanRecord | null> {
    await ensureSchema(this.sql);
    const rows = await this.rows(
      this.sql`select plan, updated_at from plans where athlete_id = ${athleteId}`,
    );
    const row = rows[0];
    const record: PlanRecord | null = row
      ? { plan: row.plan as Plan, updatedAt: toIso(row.updated_at) }
      : null;
    return record;
  }

  async listAthletesWithPlans(): Promise<number[]> {
    await ensureSchema(this.sql);
    const rows = await this.rows(this.sql`
      select a.id from athletes a join plans p on p.athlete_id = a.id
      order by a.created_at, a.id`);
    const ids = rows.map((row) => Number(row.id));
    return ids;
  }

  async savePlan(athleteId: number, plan: Plan): Promise<PlanRecord> {
    await ensureSchema(this.sql);
    const rows = await this.rows(this.sql`
      insert into plans (athlete_id, plan, updated_at)
      values (${athleteId}, ${JSON.stringify(plan)}::jsonb, now())
      on conflict (athlete_id) do update set plan = excluded.plan, updated_at = now()
      returning updated_at`);
    const record: PlanRecord = { plan, updatedAt: toIso(rows[0].updated_at) };
    return record;
  }

  async getOverrides(athleteId: number): Promise<Override[]> {
    await ensureSchema(this.sql);
    const rows = await this.rows(this.sql`
      select session_id, status, activity_ids from session_overrides
      where athlete_id = ${athleteId}`);
    const overrides = rows.map((row) => {
      const ids = row.activity_ids as unknown[] | null;
      const override: Override = {
        sessionId: String(row.session_id),
        status: (row.status as ManualStatus | null) ?? null,
        activityIds: ids === null ? null : ids.map((id) => Number(id)),
      };
      return override;
    });
    return overrides;
  }

  async setOverride(athleteId: number, o: Override): Promise<void> {
    await ensureSchema(this.sql);
    if (o.status === null && o.activityIds === null) {
      await this.sql`
        delete from session_overrides
        where athlete_id = ${athleteId} and session_id = ${o.sessionId}`;
      return;
    }
    await this.sql`
      insert into session_overrides (athlete_id, session_id, status, activity_ids)
      values (${athleteId}, ${o.sessionId}, ${o.status}, ${o.activityIds}::bigint[])
      on conflict (athlete_id, session_id) do update set
        status = excluded.status,
        activity_ids = excluded.activity_ids,
        updated_at = now()`;
  }

  async getLaps(
    athleteId: number,
    activityIds: number[],
  ): Promise<Map<number, StoredLap[]>> {
    await ensureSchema(this.sql);
    await this.sql`
      delete from activity_laps
      where fetched_at < now() - make_interval(days => ${LAP_CACHE_DAYS})`;
    const found = new Map<number, StoredLap[]>();
    if (activityIds.length === 0) {
      return found;
    }
    const rows = await this.rows(this.sql`
      select activity_id, laps from activity_laps
      where athlete_id = ${athleteId} and activity_id = any(${activityIds}::bigint[])`);
    for (const row of rows) {
      found.set(Number(row.activity_id), row.laps as StoredLap[]);
    }
    return found;
  }

  async saveLaps(
    athleteId: number,
    activityId: number,
    laps: StoredLap[],
  ): Promise<void> {
    await ensureSchema(this.sql);
    await this.sql`
      insert into activity_laps (athlete_id, activity_id, laps, fetched_at)
      values (${athleteId}, ${activityId}, ${JSON.stringify(laps)}::jsonb, now())
      on conflict (athlete_id, activity_id) do update set
        laps = excluded.laps,
        fetched_at = now()`;
  }
}

// ---------------------------------------------------------------------------
// In-memory store (demo mode)

interface MemoryData {
  athletes: Map<number, AthleteRecord>;
  plans: Map<number, PlanRecord>;
  overrides: Map<number, Map<string, Override>>;
  laps: Map<string, { at: number; laps: StoredLap[] }>; // "athlete:activity"
}

export class MemoryStore implements Store {
  constructor(private data: MemoryData = emptyData()) {}

  async upsertAthlete(a: AthleteRecord): Promise<void> {
    this.data.athletes.set(a.id, { ...a });
  }

  async getAthlete(id: number): Promise<AthleteRecord | null> {
    const athlete = this.data.athletes.get(id) ?? null;
    return athlete;
  }

  async updateTokens(
    id: number,
    accessToken: string,
    refreshToken: string,
    expiresAt: number,
  ): Promise<void> {
    const athlete = this.data.athletes.get(id);
    if (athlete) {
      this.data.athletes.set(id, { ...athlete, accessToken, refreshToken, expiresAt });
    }
  }

  async getPlan(athleteId: number): Promise<PlanRecord | null> {
    const record = this.data.plans.get(athleteId) ?? null;
    return record;
  }

  async listAthletesWithPlans(): Promise<number[]> {
    const ids = [...this.data.athletes.keys()].filter((id) => this.data.plans.has(id));
    return ids;
  }

  async savePlan(athleteId: number, plan: Plan): Promise<PlanRecord> {
    const record: PlanRecord = { plan, updatedAt: new Date().toISOString() };
    this.data.plans.set(athleteId, record);
    return record;
  }

  async getOverrides(athleteId: number): Promise<Override[]> {
    const overrides = [...(this.data.overrides.get(athleteId)?.values() ?? [])];
    return overrides;
  }

  async setOverride(athleteId: number, o: Override): Promise<void> {
    const forAthlete = this.data.overrides.get(athleteId) ?? new Map();
    if (o.status === null && o.activityIds === null) {
      forAthlete.delete(o.sessionId);
    } else {
      forAthlete.set(o.sessionId, { ...o });
    }
    this.data.overrides.set(athleteId, forAthlete);
  }

  async getLaps(
    athleteId: number,
    activityIds: number[],
    nowMs: number = Date.now(),
  ): Promise<Map<number, StoredLap[]>> {
    const oldest = nowMs - LAP_CACHE_DAYS * 24 * 60 * 60 * 1000;
    for (const [key, entry] of this.data.laps) {
      if (entry.at < oldest) this.data.laps.delete(key);
    }
    const found = new Map<number, StoredLap[]>();
    for (const id of activityIds) {
      const entry = this.data.laps.get(`${athleteId}:${id}`);
      if (entry) found.set(id, entry.laps);
    }
    return found;
  }

  async saveLaps(
    athleteId: number,
    activityId: number,
    laps: StoredLap[],
    nowMs: number = Date.now(),
  ): Promise<void> {
    this.data.laps.set(`${athleteId}:${activityId}`, { at: nowMs, laps });
  }
}

function emptyData(): MemoryData {
  const data: MemoryData = {
    athletes: new Map(),
    plans: new Map(),
    overrides: new Map(),
    laps: new Map(),
  };
  return data;
}

// ---------------------------------------------------------------------------

const globalStore = globalThis as unknown as { __whtStore?: Store };

/** Returns the store for this server instance. */
export async function getStore(): Promise<Store> {
  if (!globalStore.__whtStore) {
    if (isDemo()) {
      const { seedDemoStore } = await import("./demo");
      const store = new MemoryStore();
      await seedDemoStore(store);
      globalStore.__whtStore = store;
    } else {
      const url = databaseUrl();
      if (!url) {
        throw new Error("Missing DATABASE_URL (or POSTGRES_URL)");
      }
      globalStore.__whtStore = new NeonStore(url);
    }
  }
  const store = globalStore.__whtStore;
  return store;
}
