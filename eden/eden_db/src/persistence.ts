import { Pool } from "pg";
import { CallJob } from "./call_jobs";
import { EscalationEvent } from "./safety_controls";
import { WarmTransferSession } from "./warm_transfer";

export class PersistenceService {
  private readonly enabled: boolean;
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
    this.enabled = (process.env.EDEN_PERSISTENCE_ENABLED || "true").toLowerCase() !== "false";
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async ensureSchema(): Promise<void> {
    if (!this.enabled) return;

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS call_jobs (
        job_id UUID PRIMARY KEY,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        survivor_context TEXT NOT NULL,
        callback_number TEXT,
        anonymous_mode BOOLEAN DEFAULT FALSE,
        escalation_approved BOOLEAN DEFAULT FALSE,
        shelter_ids INTEGER[] NOT NULL,
        attempts JSONB NOT NULL DEFAULT '[]'::jsonb
      );

      CREATE TABLE IF NOT EXISTS warm_transfers (
        transfer_id UUID PRIMARY KEY,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        conference_name TEXT NOT NULL,
        job_id UUID NOT NULL,
        attempt_id UUID NOT NULL,
        shelter_name TEXT NOT NULL,
        shelter_phone TEXT NOT NULL,
        survivor_phone TEXT NOT NULL,
        survivor_name TEXT,
        notes TEXT,
        call_sids JSONB NOT NULL DEFAULT '{}'::jsonb
      );

      CREATE TABLE IF NOT EXISTS escalation_events (
        escalation_id UUID PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL,
        source TEXT NOT NULL,
        reference_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        details TEXT
      );

      CREATE TABLE IF NOT EXISTS blocked_numbers (
        phone TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_call_jobs_updated_at ON call_jobs(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_warm_transfers_updated_at ON warm_transfers(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_escalation_events_created_at ON escalation_events(created_at DESC);
    `);
  }

  async upsertCallJob(job: CallJob): Promise<void> {
    if (!this.enabled) return;
    await this.pool.query(
      `
      INSERT INTO call_jobs (
        job_id, mode, status, created_at, updated_at,
        survivor_context, callback_number, anonymous_mode, escalation_approved,
        shelter_ids, attempts
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11::jsonb
      )
      ON CONFLICT (job_id) DO UPDATE SET
        mode = EXCLUDED.mode,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at,
        survivor_context = EXCLUDED.survivor_context,
        callback_number = EXCLUDED.callback_number,
        anonymous_mode = EXCLUDED.anonymous_mode,
        escalation_approved = EXCLUDED.escalation_approved,
        shelter_ids = EXCLUDED.shelter_ids,
        attempts = EXCLUDED.attempts
      `,
      [
        job.job_id,
        job.mode,
        job.status,
        job.created_at,
        job.updated_at,
        job.request.survivor_context,
        job.request.callback_number || null,
        Boolean(job.request.anonymous_mode),
        Boolean(job.request.escalation_approved),
        job.request.shelter_ids,
        JSON.stringify(job.attempts),
      ]
    );
  }

  async getCallJob(job_id: string): Promise<CallJob | null> {
    if (!this.enabled) return null;
    const result = await this.pool.query(
      `SELECT job_id, mode, status, created_at, updated_at,
         survivor_context, callback_number, anonymous_mode, escalation_approved,
         shelter_ids, attempts
       FROM call_jobs WHERE job_id = $1`,
      [job_id]
    );
    const row = result.rows[0];
    if (!row) return null;
    const attempts = Array.isArray(row.attempts) ? row.attempts : (row.attempts && typeof row.attempts === "object" ? [row.attempts] : []);
    return {
      job_id: String(row.job_id),
      mode: row.mode as CallJob["mode"],
      status: row.status as CallJob["status"],
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
      request: {
        survivor_context: String(row.survivor_context),
        callback_number: row.callback_number ? String(row.callback_number) : undefined,
        anonymous_mode: Boolean(row.anonymous_mode),
        escalation_approved: Boolean(row.escalation_approved),
        shelter_ids: Array.isArray(row.shelter_ids) ? row.shelter_ids.map(Number) : [],
      },
      attempts: attempts.map((a: Record<string, unknown>) => ({
        attempt_id: String(a.attempt_id ?? ""),
        shelter_id: Number(a.shelter_id ?? 0),
        shelter_name: String(a.shelter_name ?? ""),
        to_phone: a.to_phone ? String(a.to_phone) : null,
        status: (a.status as CallJob["attempts"][0]["status"]) ?? "queued",
        generated_script: a.generated_script ? String(a.generated_script) : undefined,
        generated_script_source: a.generated_script_source as "openai" | "fallback" | undefined,
        voice_path: a.voice_path as "elevenlabs_play" | "twilio_say" | undefined,
        provider_call_sid: a.provider_call_sid ? String(a.provider_call_sid) : undefined,
        recording_url: a.recording_url ? String(a.recording_url) : undefined,
        error: a.error ? String(a.error) : undefined,
        transcript_excerpt: a.transcript_excerpt ? String(a.transcript_excerpt) : undefined,
        parsed_transcript: a.parsed_transcript as CallJob["attempts"][0]["parsed_transcript"],
        updated_at: (a.updated_at as string) ?? new Date().toISOString(),
      })),
    };
  }

  async upsertWarmTransfer(transfer: WarmTransferSession): Promise<void> {
    if (!this.enabled) return;
    await this.pool.query(
      `
      INSERT INTO warm_transfers (
        transfer_id, mode, status, created_at, updated_at, conference_name,
        job_id, attempt_id, shelter_name, shelter_phone, survivor_phone,
        survivor_name, notes, call_sids
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14::jsonb
      )
      ON CONFLICT (transfer_id) DO UPDATE SET
        mode = EXCLUDED.mode,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at,
        conference_name = EXCLUDED.conference_name,
        job_id = EXCLUDED.job_id,
        attempt_id = EXCLUDED.attempt_id,
        shelter_name = EXCLUDED.shelter_name,
        shelter_phone = EXCLUDED.shelter_phone,
        survivor_phone = EXCLUDED.survivor_phone,
        survivor_name = EXCLUDED.survivor_name,
        notes = EXCLUDED.notes,
        call_sids = EXCLUDED.call_sids
      `,
      [
        transfer.transfer_id,
        transfer.mode,
        transfer.status,
        transfer.created_at,
        transfer.updated_at,
        transfer.conference_name,
        transfer.job_id,
        transfer.attempt_id,
        transfer.shelter_name,
        transfer.shelter_phone,
        transfer.survivor_phone,
        transfer.survivor_name || null,
        transfer.notes || null,
        JSON.stringify(transfer.call_sids),
      ]
    );
  }

  async insertEscalation(event: EscalationEvent): Promise<void> {
    if (!this.enabled) return;
    await this.pool.query(
      `
      INSERT INTO escalation_events (escalation_id, created_at, source, reference_id, reason, details)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (escalation_id) DO NOTHING
      `,
      [event.escalation_id, event.created_at, event.source, event.reference_id, event.reason, event.details || null]
    );
  }

  async upsertBlockedNumber(phone: string): Promise<void> {
    if (!this.enabled) return;
    await this.pool.query(
      `INSERT INTO blocked_numbers (phone) VALUES ($1) ON CONFLICT (phone) DO NOTHING`,
      [phone]
    );
  }

  async deleteBlockedNumber(phone: string): Promise<void> {
    if (!this.enabled) return;
    await this.pool.query(`DELETE FROM blocked_numbers WHERE phone = $1`, [phone]);
  }

  async listBlockedNumbers(): Promise<string[]> {
    if (!this.enabled) return [];
    const result = await this.pool.query(`SELECT phone FROM blocked_numbers ORDER BY phone ASC`);
    return result.rows.map((r) => String(r.phone));
  }

  async listEscalations(limit = 100): Promise<EscalationEvent[]> {
    if (!this.enabled) return [];
    const result = await this.pool.query(
      `
      SELECT escalation_id, created_at, source, reference_id, reason, details
      FROM escalation_events
      ORDER BY created_at DESC
      LIMIT $1
      `,
      [limit]
    );
    return result.rows.map((r) => ({
      escalation_id: String(r.escalation_id),
      created_at: new Date(r.created_at).toISOString(),
      source: r.source as "call_job" | "warm_transfer" | "transcript",
      reference_id: String(r.reference_id),
      reason: String(r.reason),
      details: r.details ? String(r.details) : undefined,
    }));
  }
}
