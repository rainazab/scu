import { randomUUID } from "crypto";

export type CallMode = "dry_run" | "live";
export type CallAttemptStatus = "queued" | "initiated" | "completed" | "failed";
export type CallJobStatus = "queued" | "in_progress" | "completed" | "failed";

export interface ShelterCallTarget {
  id: number;
  shelter_name: string;
  intake_phone: string | null;
  city: string | null;
  state: string | null;
}

export interface CallAttempt {
  attempt_id: string;
  shelter_id: number;
  shelter_name: string;
  to_phone: string | null;
  status: CallAttemptStatus;
  provider_call_sid?: string;
  error?: string;
  transcript_excerpt?: string;
  updated_at: string;
}

export interface CallJob {
  job_id: string;
  mode: CallMode;
  status: CallJobStatus;
  created_at: string;
  updated_at: string;
  request: {
    survivor_context: string;
    callback_number?: string;
    shelter_ids: number[];
  };
  attempts: CallAttempt[];
}

export class CallJobStore {
  private readonly jobs = new Map<string, CallJob>();
  private readonly sidToAttempt = new Map<string, { job_id: string; attempt_id: string }>();

  createJob(params: {
    mode: CallMode;
    survivor_context: string;
    callback_number?: string;
    targets: ShelterCallTarget[];
  }): CallJob {
    const now = new Date().toISOString();
    const job_id = randomUUID();
    const attempts = params.targets.map((target) => ({
      attempt_id: randomUUID(),
      shelter_id: target.id,
      shelter_name: target.shelter_name,
      to_phone: target.intake_phone,
      status: "queued" as const,
      updated_at: now,
    }));

    const job: CallJob = {
      job_id,
      mode: params.mode,
      status: "queued",
      created_at: now,
      updated_at: now,
      request: {
        survivor_context: params.survivor_context,
        callback_number: params.callback_number,
        shelter_ids: params.targets.map((t) => t.id),
      },
      attempts,
    };

    this.jobs.set(job_id, job);
    return job;
  }

  listJobs(): CallJob[] {
    return Array.from(this.jobs.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  getJob(job_id: string): CallJob | undefined {
    return this.jobs.get(job_id);
  }

  markAttempt(job_id: string, attempt_id: string, patch: Partial<CallAttempt>): void {
    const job = this.jobs.get(job_id);
    if (!job) return;
    const attempt = job.attempts.find((a) => a.attempt_id === attempt_id);
    if (!attempt) return;

    Object.assign(attempt, patch, { updated_at: new Date().toISOString() });
    this.recomputeJobStatus(job);
  }

  bindProviderSid(job_id: string, attempt_id: string, sid: string): void {
    this.sidToAttempt.set(sid, { job_id, attempt_id });
    this.markAttempt(job_id, attempt_id, { provider_call_sid: sid });
  }

  findByProviderSid(sid: string): { job: CallJob; attempt: CallAttempt } | undefined {
    const pointer = this.sidToAttempt.get(sid);
    if (!pointer) return undefined;
    const job = this.jobs.get(pointer.job_id);
    if (!job) return undefined;
    const attempt = job.attempts.find((a) => a.attempt_id === pointer.attempt_id);
    if (!attempt) return undefined;
    return { job, attempt };
  }

  private recomputeJobStatus(job: CallJob): void {
    const statuses = job.attempts.map((a) => a.status);
    const now = new Date().toISOString();

    if (statuses.every((s) => s === "completed")) {
      job.status = "completed";
    } else if (statuses.some((s) => s === "initiated")) {
      job.status = "in_progress";
    } else if (statuses.some((s) => s === "failed") && statuses.every((s) => s !== "queued")) {
      job.status = "failed";
    } else {
      job.status = "queued";
    }
    job.updated_at = now;
  }
}
