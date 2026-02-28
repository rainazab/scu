import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pool } from "pg";
import { CallJobStore, CallMode, ShelterCallTarget } from "./call_jobs";
import {
  buildConferenceJoinTwiml,
  buildShelterIntakeTwiml,
  createTwilioCall,
  sendSms,
  TwilioConfig,
} from "./twilio_client";
import { generateCallScript, parseTranscript } from "./ai_agent";
import { WarmTransferMode, WarmTransferStore } from "./warm_transfer";
import { SafetyControls } from "./safety_controls";
import { PersistenceService } from "./persistence";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const callJobs = new CallJobStore();
const warmTransfers = new WarmTransferStore();
const safetyControls = new SafetyControls();
const defaultCallMode: CallMode = process.env.EDEN_CALL_MODE === "live" ? "live" : "dry_run";
const twilioConfig: TwilioConfig = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || "",
  authToken: process.env.TWILIO_AUTH_TOKEN || "",
  fromNumber: process.env.TWILIO_FROM_NUMBER || "",
  statusCallbackUrl: process.env.TWILIO_STATUS_CALLBACK_URL || undefined,
};
const warmTransferStatusCallbackUrl =
  process.env.TWILIO_WARM_TRANSFER_STATUS_CALLBACK_URL || twilioConfig.statusCallbackUrl;
const enableCallRecording = process.env.ENABLE_CALL_RECORDING === "true";
const recordingCallbackUrl = process.env.NGROK_URL
  ? `${process.env.NGROK_URL.replace(/\/$/, "")}/webhooks/twilio/recording`
  : undefined;
const dryRunMode = defaultCallMode === "dry_run";

type IntakeNeed = "shelter" | "food" | "medical" | "mental_health" | "children_support" | "other";

interface IntakeTracker {
  job_id: string;
  created_at_ms: number;
  callback_number?: string;
  location: string;
  has_children: boolean;
  has_pets: boolean;
  sms_sent?: boolean;
  no_result_sms_sent?: boolean;
}

const intakeTrackers = new Map<string, IntakeTracker>();

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME || "eden_db",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
});
const persistence = new PersistenceService(pool);

pool.on("connect", () => {
  console.log("Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", message: "Eden shelter API is running" });
});

app.get("/api/safety/config", (_req: Request, res: Response) => {
  return res.json({
    success: true,
    config: safetyControls.config(),
  });
});

app.get("/api/safety/no-callback-numbers", (_req: Request, res: Response) => {
  return res.json({
    success: true,
    count: safetyControls.listBlockedNumbers().length,
    numbers: safetyControls.listBlockedNumbers(),
  });
});

app.post("/api/safety/no-callback-numbers", (req: Request, res: Response) => {
  const number = String(req.body.number || "");
  const result = safetyControls.addBlockedNumber(number);
  if (!result.normalized) {
    return res.status(400).json({ error: "number is required and must be parseable." });
  }
  void persistence.upsertBlockedNumber(result.normalized).catch((error) => {
    console.error("Failed to persist blocked number", { number: result.normalized, error });
  });
  return res.status(201).json({
    success: true,
    added: result.added,
    number: result.normalized,
  });
});

app.delete("/api/safety/no-callback-numbers", (req: Request, res: Response) => {
  const number = String(req.body.number || "");
  const result = safetyControls.removeBlockedNumber(number);
  if (!result.normalized) {
    return res.status(400).json({ error: "number is required and must be parseable." });
  }
  void persistence.deleteBlockedNumber(result.normalized).catch((error) => {
    console.error("Failed to remove blocked number from persistence", { number: result.normalized, error });
  });
  return res.json({
    success: true,
    removed: result.removed,
    number: result.normalized,
  });
});

app.get("/api/safety/escalations", (req: Request, res: Response) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 500));
  const escalations = safetyControls.listEscalations(limit);
  return res.json({
    success: true,
    count: escalations.length,
    escalations,
  });
});

function validateCoordinates(lat: number, lon: number): string | null {
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return "lat and lon must be valid numbers";
  }
  if (lat < -90 || lat > 90) {
    return "Latitude must be between -90 and 90";
  }
  if (lon < -180 || lon > 180) {
    return "Longitude must be between -180 and 180";
  }
  return null;
}

function mapTwilioStatus(status: string): "queued" | "initiated" | "completed" | "failed" {
  const normalized = (status || "").toLowerCase();
  if (["completed"].includes(normalized)) return "completed";
  if (["busy", "failed", "no-answer", "canceled"].includes(normalized)) return "failed";
  if (["initiated", "ringing", "in-progress", "answered"].includes(normalized)) return "initiated";
  return "queued";
}

function ensureTwilioConfigured(mode: CallMode): string | null {
  if (mode !== "live") return null;
  if (!twilioConfig.accountSid || !twilioConfig.authToken || !twilioConfig.fromNumber) {
    return "Live mode requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.";
  }
  return null;
}

function isTerminalCallStatus(status: string): boolean {
  const normalized = status.toLowerCase();
  return ["completed", "failed", "busy", "no-answer", "canceled"].includes(normalized);
}

function persistCallJobState(jobId: string): void {
  const job = callJobs.getJob(jobId);
  if (!job) return;
  void persistence.upsertCallJob(job).catch((error) => {
    console.error("Failed to persist call job", { jobId, error });
  });
}

function persistWarmTransferState(transferId: string): void {
  const transfer = warmTransfers.getSession(transferId);
  if (!transfer) return;
  void persistence.upsertWarmTransfer(transfer).catch((error) => {
    console.error("Failed to persist warm transfer", { transferId, error });
  });
}

function recordEscalationAndPersist(input: {
  source: "call_job" | "warm_transfer" | "transcript";
  reference_id: string;
  reason: string;
  details?: string;
}) {
  const escalation = safetyControls.recordEscalation(input);
  void persistence.insertEscalation(escalation).catch((error) => {
    console.error("Failed to persist escalation event", { escalationId: escalation.escalation_id, error });
  });
  return escalation;
}

async function queryNearestShelters(params: {
  lat: number;
  lon: number;
  limit: number;
  needs: IntakeNeed[];
  has_children: boolean;
}): Promise<
  Array<{
    id: number;
    shelter_name: string;
    intake_phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    accepts_children: boolean;
    accepts_pets: boolean;
    distance_meters: number;
  }>
> {
  const primaryNeed = params.needs[0] || "shelter";
  const values: Array<string | number | boolean> = [params.lon, params.lat];
  let where = "WHERE coordinates IS NOT NULL";

  if (params.has_children) {
    values.push(true);
    where += ` AND accepts_children = $${values.length}`;
  }

  if (primaryNeed !== "shelter" && primaryNeed !== "children_support") {
    values.push(`%${primaryNeed.replace("_", " ")}%`);
    where += ` AND (description ILIKE $${values.length} OR shelter_name ILIKE $${values.length})`;
  }

  values.push(Math.max(1, Math.min(params.limit, 20)));

  const result = await pool.query(
    `
    SELECT
      id, shelter_name, intake_phone, address, city, state,
      accepts_children, accepts_pets,
      ST_Distance(coordinates, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_meters
    FROM shelters
    ${where}
    ORDER BY distance_meters ASC
    LIMIT $${values.length}
    `,
    values
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    shelter_name: String(row.shelter_name),
    intake_phone: row.intake_phone ? String(row.intake_phone) : null,
    address: row.address ? String(row.address) : null,
    city: row.city ? String(row.city) : null,
    state: row.state ? String(row.state) : null,
    accepts_children: Boolean(row.accepts_children),
    accepts_pets: Boolean(row.accepts_pets),
    distance_meters: Number(row.distance_meters || 0),
  }));
}

function buildSurvivorContextFromIntake(input: {
  needs: IntakeNeed[];
  people_count: number;
  has_children: boolean;
  has_pets: boolean;
  location: string;
  notes?: string;
}): string {
  const needsText = input.needs.length ? input.needs.join(", ") : "shelter support";
  return `Person in ${input.location} needs: ${needsText}. Group of ${input.people_count} people${
    input.has_children ? " with children" : ""
  }. ${input.has_pets ? "Has pets." : "No pets."}${input.notes ? ` Note: ${input.notes}.` : ""}`;
}

function toSimpleAttemptStatus(status: string): string {
  if (status === "initiated") return "calling";
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  return "queued";
}

async function sendFoundSms(params: {
  callback_number: string;
  shelter_name: string;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  accepts_children?: boolean;
  accepts_pets?: boolean;
}): Promise<void> {
  const lines = [
    "✅ Eden found help for you:",
    "",
    `${params.shelter_name}`,
    `📍 ${params.address || "Address shared by intake team"}, ${params.city || ""}`.trim(),
    `📞 ${params.phone || "Call local intake line"}`,
    "",
  ];
  if (params.accepts_children) lines.push("Children welcome ✓");
  if (params.accepts_pets) lines.push("Pets welcome ✓");
  lines.push("", "Please arrive soon — they're expecting you.", "", "Need more help? Reply HELP or call 211 (free, 24/7).");
  const body = lines.join("\n");

  if (dryRunMode) return;
  await sendSms(twilioConfig, params.callback_number, body);
}

async function sendNoResultSms(params: {
  callback_number: string;
  count: number;
  location: string;
}): Promise<void> {
  const body = `Eden searched ${params.count} shelters near ${params.location}.
No beds available tonight.

📞 Call 211 — free 24/7 social services
📞 SF Hotline: (415) 255-0560

Try again tomorrow morning — we'll keep searching.
— Eden`;
  if (dryRunMode) return;
  await sendSms(twilioConfig, params.callback_number, body);
}

function applyDemoProgress(jobId: string): void {
  if (!dryRunMode) return;
  const tracker = intakeTrackers.get(jobId);
  if (!tracker) return;
  const job = callJobs.getJob(jobId);
  if (!job) return;

  const elapsedMs = Date.now() - tracker.created_at_ms;
  const attempts = job.attempts;
  if (attempts.length === 0) return;

  const first = attempts[0];
  const second = attempts[1];
  const third = attempts[2];

  if (first && elapsedMs >= 200 && first.status === "queued") {
    callJobs.markAttempt(jobId, first.attempt_id, { status: "initiated" });
    persistCallJobState(jobId);
  }

  if (first && elapsedMs >= 2000 && first.status === "initiated") {
    callJobs.markAttempt(jobId, first.attempt_id, { status: "failed", error: "no beds" });
    persistCallJobState(jobId);
  }
  if (second && elapsedMs >= 2200 && second.status === "queued") {
    callJobs.markAttempt(jobId, second.attempt_id, { status: "initiated" });
    persistCallJobState(jobId);
  }
  if (second && elapsedMs >= 4000 && second.status === "initiated") {
    callJobs.markAttempt(jobId, second.attempt_id, { status: "failed", error: "no beds" });
    persistCallJobState(jobId);
  }
  if (third && elapsedMs >= 4200 && third.status === "queued") {
    callJobs.markAttempt(jobId, third.attempt_id, { status: "initiated" });
    persistCallJobState(jobId);
  }
  if (third && elapsedMs >= 7000 && third.status === "initiated") {
    callJobs.markAttempt(jobId, third.attempt_id, {
      status: "completed",
      parsed_transcript: {
        availability_status: "available",
        reported_available_beds: 1,
        intake_requirements: ["Photo ID"],
        needs_human_followup: false,
        summary: "Shelter confirmed one available bed.",
      },
    });
    persistCallJobState(jobId);
  }
}

app.get("/api/shelters/nearest", async (req: Request, res: Response) => {
  try {
    const { lat, lon, limit = "10", max_distance_miles } = req.query;
    if (!lat || !lon) {
      return res.status(400).json({
        error: "Missing required parameters",
        message: "Please provide lat and lon query parameters",
        example: "/api/shelters/nearest?lat=37.7749&lon=-122.4194&limit=5",
      });
    }

    const latitude = parseFloat(lat as string);
    const longitude = parseFloat(lon as string);
    const coordError = validateCoordinates(latitude, longitude);
    if (coordError) {
      return res.status(400).json({ error: "Invalid coordinates", message: coordError });
    }

    const resultLimit = Math.max(1, Math.min(parseInt(limit as string, 10) || 10, 100));
    const maxDistanceMeters = max_distance_miles
      ? parseFloat(max_distance_miles as string) * 1609.34
      : null;

    const values: Array<number | null> = [longitude, latitude];
    let query = `
      SELECT
        id,
        shelter_name,
        description,
        address,
        city,
        state,
        zipcode,
        intake_phone,
        bed_count,
        available_beds,
        accepts_children,
        accepts_pets,
        languages_spoken,
        last_verified_at,
        latitude,
        longitude,
        ST_Distance(coordinates, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_meters
      FROM shelters
      WHERE coordinates IS NOT NULL
    `;

    if (maxDistanceMeters !== null && !Number.isNaN(maxDistanceMeters)) {
      values.push(maxDistanceMeters);
      query += ` AND ST_DWithin(coordinates, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)`;
    }

    query += ` ORDER BY distance_meters ASC LIMIT ${resultLimit}`;

    const result = await pool.query(query, values);
    const shelters = result.rows.map((row) => ({
      id: row.id,
      shelter_name: row.shelter_name,
      description: row.description,
      address: row.address,
      city: row.city,
      state: row.state,
      zipcode: row.zipcode,
      intake_phone: row.intake_phone,
      bed_count: row.bed_count,
      available_beds: row.available_beds,
      accepts_children: row.accepts_children,
      accepts_pets: row.accepts_pets,
      languages_spoken: row.languages_spoken,
      last_verified_at: row.last_verified_at,
      coordinates: {
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
      },
      distance: {
        meters: Math.round(parseFloat(row.distance_meters)),
        miles: (parseFloat(row.distance_meters) * 0.000621371).toFixed(2),
      },
    }));

    return res.json({
      success: true,
      query: {
        latitude,
        longitude,
        limit: resultLimit,
        max_distance_miles: max_distance_miles ? parseFloat(max_distance_miles as string) : null,
      },
      count: shelters.length,
      shelters,
    });
  } catch (error) {
    console.error("Error fetching nearest shelters:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/api/shelters/nearest", async (req: Request, res: Response) => {
  req.query = {
    lat: String(req.body.latitude),
    lon: String(req.body.longitude),
    limit: String(req.body.limit ?? 10),
    ...(req.body.max_distance_miles !== undefined && {
      max_distance_miles: String(req.body.max_distance_miles),
    }),
  };
  return app._router.handle({ ...req, method: "GET", url: "/api/shelters/nearest" }, res, () => {});
});

app.get("/api/shelters", async (req: Request, res: Response) => {
  try {
    const pageNum = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limitNum = Math.max(1, Math.min(parseInt((req.query.limit as string) || "20", 10), 100));
    const offset = (pageNum - 1) * limitNum;

    const countResult = await pool.query("SELECT COUNT(*) FROM shelters");
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await pool.query(
      `
      SELECT
        id, shelter_name, description, address, city, state, zipcode,
        intake_phone, bed_count, available_beds, accepts_children, accepts_pets,
        languages_spoken, last_verified_at, latitude, longitude, url
      FROM shelters
      ORDER BY available_beds DESC, shelter_name ASC
      LIMIT $1 OFFSET $2
      `,
      [limitNum, offset]
    );

    return res.json({
      success: true,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
      shelters: result.rows,
    });
  } catch (error) {
    console.error("Error fetching shelters:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/api/shelters/:id", async (req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT * FROM shelters WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Not found",
        message: `Shelter with ID ${req.params.id} not found`,
      });
    }
    return res.json({ success: true, shelter: result.rows[0] });
  } catch (error) {
    console.error("Error fetching shelter:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/api/calls/jobs", async (req: Request, res: Response) => {
  try {
    const shelterIdsRaw = Array.isArray(req.body.shelter_ids) ? req.body.shelter_ids : [];
    const shelterIds = shelterIdsRaw.map((v: unknown) => Number(v)).filter((v: number) => Number.isInteger(v));
    const survivorContextRaw = String(req.body.survivor_context || "").trim();
    const callbackNumber = req.body.callback_number ? String(req.body.callback_number) : undefined;
    const anonymousMode = Boolean(req.body.anonymous_mode);
    const escalationApproved = Boolean(req.body.escalation_approved);
    const requestedMode = req.body.mode === "live" ? "live" : req.body.mode === "dry_run" ? "dry_run" : undefined;
    const mode: CallMode = requestedMode || defaultCallMode;

    if (shelterIds.length === 0) {
      return res.status(400).json({ error: "shelter_ids must include at least one shelter ID." });
    }
    if (!survivorContextRaw) {
      return res.status(400).json({ error: "survivor_context is required." });
    }
    if (callbackNumber && safetyControls.isBlockedNumber(callbackNumber)) {
      return res.status(403).json({ error: "callback_number is blocked by no-call-back safety policy." });
    }

    const risk = safetyControls.assessRisk(survivorContextRaw);
    if (mode === "live" && safetyControls.shouldBlockLiveAction(risk, escalationApproved)) {
      const escalation = recordEscalationAndPersist({
        source: "call_job",
        reference_id: "pending-call-job",
        reason: "High-risk request blocked from live calls without escalation approval.",
        details: `Matched keywords: ${risk.matched_keywords.join(", ")}`,
      });
      return res.status(409).json({
        error: "Live call blocked pending human escalation.",
        risk,
        escalation,
      });
    }

    const survivorContext = anonymousMode
      ? safetyControls.redactForAnonymousMode(survivorContextRaw)
      : survivorContextRaw;

    const twilioError = ensureTwilioConfigured(mode);
    if (twilioError) return res.status(400).json({ error: twilioError });

    const result = await pool.query(
      `
      SELECT id, shelter_name, intake_phone, city, state
      FROM shelters
      WHERE id = ANY($1::int[])
      `,
      [shelterIds]
    );
    const targets: ShelterCallTarget[] = result.rows;
    if (targets.length === 0) {
      return res.status(404).json({ error: "No shelters found for provided IDs." });
    }

    const job = callJobs.createJob({
      mode,
      survivor_context: survivorContext,
      callback_number: anonymousMode ? undefined : callbackNumber,
      anonymous_mode: anonymousMode,
      escalation_approved: escalationApproved,
      targets,
    });
    persistCallJobState(job.job_id);

    for (const attempt of job.attempts) {
      const scriptResult = await generateCallScript({
        shelterName: attempt.shelter_name,
        survivorContext,
        callbackNumber: anonymousMode ? undefined : callbackNumber,
      });
      callJobs.markAttempt(job.job_id, attempt.attempt_id, {
        generated_script: scriptResult.script,
      });
      persistCallJobState(job.job_id);

      if (!attempt.to_phone) {
        callJobs.markAttempt(job.job_id, attempt.attempt_id, {
          status: "failed",
          error: "Shelter does not have intake_phone configured.",
        });
        persistCallJobState(job.job_id);
        continue;
      }
      if (safetyControls.isBlockedNumber(attempt.to_phone)) {
        callJobs.markAttempt(job.job_id, attempt.attempt_id, {
          status: "failed",
          error: "Destination number blocked by no-call-back safety policy.",
        });
        persistCallJobState(job.job_id);
        continue;
      }

      if (mode === "dry_run") {
        callJobs.markAttempt(job.job_id, attempt.attempt_id, {
          status: "completed",
          provider_call_sid: `DRYRUN-${attempt.attempt_id}`,
        });
        persistCallJobState(job.job_id);
        continue;
      }

      try {
        const twiml = buildShelterIntakeTwiml({
          shelterName: attempt.shelter_name,
          survivorContext,
          callbackNumber: anonymousMode ? undefined : callbackNumber,
          scriptText: scriptResult.script,
        });
        const { sid } = await createTwilioCall(twilioConfig, {
          to: attempt.to_phone,
          twiml,
          record: enableCallRecording,
          recordingCallbackUrl,
        });
        callJobs.bindProviderSid(job.job_id, attempt.attempt_id, sid);
        callJobs.markAttempt(job.job_id, attempt.attempt_id, { status: "initiated" });
        persistCallJobState(job.job_id);
      } catch (error) {
        callJobs.markAttempt(job.job_id, attempt.attempt_id, {
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown Twilio error",
        });
        persistCallJobState(job.job_id);
      }
    }

    const fresh = callJobs.getJob(job.job_id);
    return res.status(201).json({
      success: true,
      message: mode === "dry_run" ? "Dry-run call job simulated." : "Live call job initiated.",
      job: fresh,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to create call job",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/api/calls/script-preview", async (req: Request, res: Response) => {
  const shelterName = String(req.body.shelter_name || "").trim();
  const survivorContextRaw = String(req.body.survivor_context || "").trim();
  const callbackNumber = req.body.callback_number ? String(req.body.callback_number) : undefined;
  const anonymousMode = Boolean(req.body.anonymous_mode);

  if (!shelterName || !survivorContextRaw) {
    return res.status(400).json({
      error: "shelter_name and survivor_context are required.",
    });
  }
  const survivorContext = anonymousMode
    ? safetyControls.redactForAnonymousMode(survivorContextRaw)
    : survivorContextRaw;

  const scriptResult = await generateCallScript({
    shelterName,
    survivorContext,
    callbackNumber: anonymousMode ? undefined : callbackNumber,
  });
  return res.json({
    success: true,
    source: scriptResult.source,
    anonymous_mode: anonymousMode,
    script: scriptResult.script,
  });
});

app.get("/api/calls/jobs", (_req: Request, res: Response) => {
  return res.json({
    success: true,
    count: callJobs.listJobs().length,
    jobs: callJobs.listJobs(),
  });
});

app.get("/api/calls/jobs/:job_id", (req: Request, res: Response) => {
  const job = callJobs.getJob(req.params.job_id);
  if (!job) {
    return res.status(404).json({ error: "Call job not found." });
  }
  return res.json({ success: true, job });
});

app.post("/webhooks/twilio/status", (req: Request, res: Response) => {
  const sid = String(req.body.CallSid || "");
  const status = String(req.body.CallStatus || "");
  if (!sid) return res.status(400).send("Missing CallSid");

  const linked = callJobs.findByProviderSid(sid);
  if (!linked) return res.status(200).send("OK");

  callJobs.markAttempt(linked.job.job_id, linked.attempt.attempt_id, {
    status: mapTwilioStatus(status),
  });
  persistCallJobState(linked.job.job_id);
  return res.status(200).send("OK");
});

app.post("/webhooks/twilio/recording", (req: Request, res: Response) => {
  const sid = String(req.body.CallSid || "");
  const recordingUrl = String(req.body.RecordingUrl || "");
  if (!sid) return res.status(400).json({ error: "Missing CallSid" });

  const linked = callJobs.findByProviderSid(sid);
  if (!linked) return res.status(200).json({ success: true, ignored: true });

  callJobs.markAttempt(linked.job.job_id, linked.attempt.attempt_id, {
    recording_url: recordingUrl || undefined,
  });
  persistCallJobState(linked.job.job_id);
  return res.status(200).json({ success: true });
});

app.post("/webhooks/twilio/transcript", (req: Request, res: Response) => {
  const sid = String(req.body.CallSid || req.body.call_sid || "");
  const transcript = String(req.body.TranscriptText || req.body.transcript || "");
  if (!sid) return res.status(400).json({ error: "Missing CallSid" });

  const linked = callJobs.findByProviderSid(sid);
  if (!linked) return res.status(200).json({ success: true, ignored: true });

  const excerpt = transcript.slice(0, 500);
  parseTranscript(transcript)
    .then((result) => {
      callJobs.markAttempt(linked.job.job_id, linked.attempt.attempt_id, {
        transcript_excerpt: excerpt,
        parsed_transcript: result.parsed,
      });
      persistCallJobState(linked.job.job_id);
      if (result.parsed.needs_human_followup) {
        recordEscalationAndPersist({
          source: "transcript",
          reference_id: linked.job.job_id,
          reason: "Transcript indicates human follow-up required.",
          details: result.parsed.summary,
        });
      }
    })
    .catch(() => {
      callJobs.markAttempt(linked.job.job_id, linked.attempt.attempt_id, {
        transcript_excerpt: excerpt,
      });
      persistCallJobState(linked.job.job_id);
    });
  return res.status(200).json({ success: true, accepted: true });
});

app.post("/api/calls/parse-transcript", async (req: Request, res: Response) => {
  const transcript = String(req.body.transcript || "").trim();
  if (!transcript) {
    return res.status(400).json({ error: "transcript is required." });
  }
  const parsed = await parseTranscript(transcript);
  if (parsed.parsed.needs_human_followup) {
    recordEscalationAndPersist({
      source: "transcript",
      reference_id: "manual-parse",
      reason: "Manual transcript parse indicates human follow-up required.",
      details: parsed.parsed.summary,
    });
  }
  return res.json({
    success: true,
    source: parsed.source,
    parsed: parsed.parsed,
  });
});

app.post("/api/intake", async (req: Request, res: Response) => {
  try {
    const needs = (Array.isArray(req.body.needs) ? req.body.needs : [])
      .map((x: unknown) => String(x))
      .filter((x: string) => x.length > 0) as IntakeNeed[];
    const peopleCount = Number(req.body.people_count || 1);
    const hasChildren = Boolean(req.body.has_children);
    const hasPets = Boolean(req.body.has_pets);
    const location = String(req.body.location || "").trim();
    const notes = req.body.notes ? String(req.body.notes) : "";
    const callbackNumber = String(req.body.callback_number || "").trim();

    if (!location || !callbackNumber) {
      return res.status(400).json({ error: "location and callback_number are required." });
    }
    if (safetyControls.isBlockedNumber(callbackNumber)) {
      return res.status(403).json({ error: "callback_number is blocked by no-call-back safety policy." });
    }

    // Approximate coordinates for Bay Area demo; fallback to SF.
    const cityToCoords: Record<string, { lat: number; lon: number }> = {
      "san francisco": { lat: 37.7749, lon: -122.4194 },
      "mission district": { lat: 37.7599, lon: -122.4148 },
      "soma": { lat: 37.7786, lon: -122.4059 },
      oakland: { lat: 37.8044, lon: -122.2711 },
      "san jose": { lat: 37.3382, lon: -121.8863 },
      berkeley: { lat: 37.8715, lon: -122.273 },
      fremont: { lat: 37.5483, lon: -121.9886 },
      "santa clara": { lat: 37.3541, lon: -121.9552 },
    };
    const key = location.toLowerCase();
    const matched = Object.keys(cityToCoords).find((k) => key.includes(k));
    const { lat, lon } = matched ? cityToCoords[matched] : cityToCoords["san francisco"];

    const survivorContextRaw = buildSurvivorContextFromIntake({
      needs,
      people_count: Number.isFinite(peopleCount) ? Math.max(1, peopleCount) : 1,
      has_children: hasChildren,
      has_pets: hasPets,
      location,
      notes,
    });
    const risk = safetyControls.assessRisk(survivorContextRaw);
    if (defaultCallMode === "live" && safetyControls.shouldBlockLiveAction(risk, false)) {
      const escalation = recordEscalationAndPersist({
        source: "call_job",
        reference_id: "intake-live-blocked",
        reason: "High-risk intake blocked from live mode without escalation approval.",
        details: `Matched keywords: ${risk.matched_keywords.join(", ")}`,
      });
      return res.status(409).json({ error: "Live intake blocked pending escalation.", risk, escalation });
    }

    const targets = await queryNearestShelters({
      lat,
      lon,
      limit: 10,
      needs,
      has_children: hasChildren,
    });
    if (targets.length === 0) {
      return res.status(404).json({ error: "No nearby resources found for intake." });
    }

    const callTargets: ShelterCallTarget[] = targets.map((t) => ({
      id: t.id,
      shelter_name: t.shelter_name,
      intake_phone: t.intake_phone,
      city: t.city,
      state: t.state,
    }));

    const job = callJobs.createJob({
      mode: defaultCallMode,
      survivor_context: survivorContextRaw,
      callback_number: callbackNumber,
      anonymous_mode: false,
      escalation_approved: false,
      targets: callTargets,
    });
    persistCallJobState(job.job_id);

    intakeTrackers.set(job.job_id, {
      job_id: job.job_id,
      created_at_ms: Date.now(),
      callback_number: callbackNumber,
      location,
      has_children: hasChildren,
      has_pets: hasPets,
    });

    if (!dryRunMode) {
      for (const attempt of job.attempts) {
        if (!attempt.to_phone) {
          callJobs.markAttempt(job.job_id, attempt.attempt_id, {
            status: "failed",
            error: "Shelter does not have intake_phone configured.",
          });
          persistCallJobState(job.job_id);
          continue;
        }
        try {
          const scriptResult = await generateCallScript({
            shelterName: attempt.shelter_name,
            survivorContext: survivorContextRaw,
            callbackNumber,
          });
          callJobs.markAttempt(job.job_id, attempt.attempt_id, {
            generated_script: scriptResult.script,
          });
          const twiml = buildShelterIntakeTwiml({
            shelterName: attempt.shelter_name,
            survivorContext: survivorContextRaw,
            callbackNumber,
            scriptText: scriptResult.script,
          });
          const { sid } = await createTwilioCall(twilioConfig, {
            to: attempt.to_phone,
            twiml,
            record: enableCallRecording,
            recordingCallbackUrl,
          });
          callJobs.bindProviderSid(job.job_id, attempt.attempt_id, sid);
          callJobs.markAttempt(job.job_id, attempt.attempt_id, { status: "initiated" });
          persistCallJobState(job.job_id);
        } catch (error) {
          callJobs.markAttempt(job.job_id, attempt.attempt_id, {
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown Twilio error",
          });
          persistCallJobState(job.job_id);
        }
      }
    }

    return res.status(201).json({
      job_id: job.job_id,
      message: "Search started",
      estimated_calls: job.attempts.length,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to start intake search",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/api/intake/status/:job_id", async (req: Request, res: Response) => {
  const job = callJobs.getJob(req.params.job_id);
  if (!job) return res.status(404).json({ error: "Job not found." });

  applyDemoProgress(job.job_id);
  const refreshed = callJobs.getJob(job.job_id) || job;
  const tracker = intakeTrackers.get(job.job_id);

  let result: null | {
    shelter_name: string;
    address?: string;
    city?: string;
    state?: string;
    intake_phone?: string;
    accepts_children?: boolean;
    accepts_pets?: boolean;
  } = null;

  const availableAttempt = refreshed.attempts.find(
    (a) => a.parsed_transcript?.availability_status === "available"
  );

  if (availableAttempt) {
    const shelterResult = await pool.query(
      `SELECT shelter_name, address, city, state, intake_phone, accepts_children, accepts_pets FROM shelters WHERE id = $1`,
      [availableAttempt.shelter_id]
    );
    const row = shelterResult.rows[0];
    if (row) {
      result = {
        shelter_name: String(row.shelter_name),
        address: row.address ? String(row.address) : undefined,
        city: row.city ? String(row.city) : undefined,
        state: row.state ? String(row.state) : undefined,
        intake_phone: row.intake_phone ? String(row.intake_phone) : undefined,
        accepts_children: Boolean(row.accepts_children),
        accepts_pets: Boolean(row.accepts_pets),
      };
    }

    if (tracker?.callback_number && !tracker.sms_sent) {
      try {
        await sendFoundSms({
          callback_number: tracker.callback_number,
          shelter_name: result?.shelter_name || availableAttempt.shelter_name,
          address: result?.address,
          city: result?.city,
          phone: result?.intake_phone,
          accepts_children: result?.accepts_children,
          accepts_pets: result?.accepts_pets,
        });
        tracker.sms_sent = true;
      } catch (error) {
        console.error("Failed to send found SMS", error);
      }
    }
  } else {
    const allDone = refreshed.attempts.length > 0 && refreshed.attempts.every((a) => a.status !== "queued");
    if (allDone && tracker?.callback_number && !tracker.no_result_sms_sent) {
      try {
        await sendNoResultSms({
          callback_number: tracker.callback_number,
          count: refreshed.attempts.length,
          location: tracker.location,
        });
        tracker.no_result_sms_sent = true;
      } catch (error) {
        console.error("Failed to send no-result SMS", error);
      }
    }
  }

  const attempts = refreshed.attempts.map((attempt) => ({
    shelter_name: attempt.shelter_name,
    status: toSimpleAttemptStatus(attempt.status),
    reason:
      attempt.parsed_transcript?.availability_status === "waitlist"
        ? "no beds"
        : attempt.error || undefined,
  }));

  return res.json({
    status: result ? "completed" : refreshed.status,
    attempts,
    result,
  });
});

app.post("/api/demo/reset", (_req: Request, res: Response) => {
  callJobs.reset();
  warmTransfers.reset();
  intakeTrackers.clear();
  return res.json({ success: true, message: "Demo state reset." });
});

app.post("/api/warm-transfers", async (req: Request, res: Response) => {
  try {
    const jobId = String(req.body.job_id || "").trim();
    const attemptId = String(req.body.attempt_id || "").trim();
    const survivorPhone = String(req.body.survivor_phone || "").trim();
    const survivorName = req.body.survivor_name ? String(req.body.survivor_name) : undefined;
    const notesRaw = req.body.notes ? String(req.body.notes) : undefined;
    const anonymousMode = Boolean(req.body.anonymous_mode);
    const escalationApproved = Boolean(req.body.escalation_approved);
    const requestedMode = req.body.mode === "live" ? "live" : req.body.mode === "dry_run" ? "dry_run" : undefined;
    const mode: WarmTransferMode = requestedMode || defaultCallMode;

    if (!jobId || !attemptId || !survivorPhone) {
      return res.status(400).json({
        error: "job_id, attempt_id, and survivor_phone are required.",
      });
    }
    if (safetyControls.isBlockedNumber(survivorPhone)) {
      return res.status(403).json({ error: "survivor_phone is blocked by no-call-back safety policy." });
    }

    const twilioError = ensureTwilioConfigured(mode);
    if (twilioError) return res.status(400).json({ error: twilioError });

    const job = callJobs.getJob(jobId);
    if (!job) return res.status(404).json({ error: "Call job not found." });
    const attempt = job.attempts.find((a) => a.attempt_id === attemptId);
    if (!attempt) return res.status(404).json({ error: "Call attempt not found on this job." });
    if (!attempt.to_phone) return res.status(400).json({ error: "Shelter attempt has no destination phone." });
    if (safetyControls.isBlockedNumber(attempt.to_phone)) {
      return res.status(403).json({ error: "Shelter destination number blocked by no-call-back safety policy." });
    }

    const notes = notesRaw
      ? anonymousMode
        ? safetyControls.redactForAnonymousMode(notesRaw)
        : notesRaw
      : undefined;
    const risk = safetyControls.assessRisk(`${notesRaw || ""} ${attempt.parsed_transcript?.summary || ""}`);
    if (mode === "live" && safetyControls.shouldBlockLiveAction(risk, escalationApproved)) {
      const escalation = recordEscalationAndPersist({
        source: "warm_transfer",
        reference_id: jobId,
        reason: "High-risk warm transfer blocked from live mode without escalation approval.",
        details: `Matched keywords: ${risk.matched_keywords.join(", ")}`,
      });
      return res.status(409).json({
        error: "Live warm transfer blocked pending human escalation.",
        risk,
        escalation,
      });
    }

    const transfer = warmTransfers.createSession({
      mode,
      job_id: jobId,
      attempt_id: attemptId,
      shelter_name: attempt.shelter_name,
      shelter_phone: attempt.to_phone,
      survivor_phone: survivorPhone,
      survivor_name: anonymousMode ? undefined : survivorName,
      notes,
    });
    persistWarmTransferState(transfer.transfer_id);

    if (mode === "dry_run") {
      warmTransfers.bindCallSid(transfer.transfer_id, "survivor", `DRYRUN-SURVIVOR-${transfer.transfer_id}`);
      warmTransfers.bindCallSid(transfer.transfer_id, "shelter", `DRYRUN-SHELTER-${transfer.transfer_id}`);
      warmTransfers.setStatus(transfer.transfer_id, "bridged");
      persistWarmTransferState(transfer.transfer_id);
      return res.status(201).json({
        success: true,
        message: "Dry-run warm transfer simulated.",
        transfer: warmTransfers.getSession(transfer.transfer_id),
      });
    }

    const conferenceTwiml = buildConferenceJoinTwiml(transfer.conference_name);
    warmTransfers.setStatus(transfer.transfer_id, "connecting");
    persistWarmTransferState(transfer.transfer_id);
    try {
      const [survivorCall, shelterCall] = await Promise.all([
        createTwilioCall(twilioConfig, {
          to: survivorPhone,
          twiml: conferenceTwiml,
          statusCallbackUrl: warmTransferStatusCallbackUrl,
        }),
        createTwilioCall(twilioConfig, {
          to: attempt.to_phone,
          twiml: conferenceTwiml,
          statusCallbackUrl: warmTransferStatusCallbackUrl,
        }),
      ]);
      warmTransfers.bindCallSid(transfer.transfer_id, "survivor", survivorCall.sid);
      warmTransfers.bindCallSid(transfer.transfer_id, "shelter", shelterCall.sid);
      warmTransfers.setStatus(transfer.transfer_id, "bridged");
      persistWarmTransferState(transfer.transfer_id);
    } catch (error) {
      warmTransfers.setStatus(transfer.transfer_id, "failed");
      persistWarmTransferState(transfer.transfer_id);
      recordEscalationAndPersist({
        source: "warm_transfer",
        reference_id: transfer.transfer_id,
        reason: "Warm transfer failed to initiate.",
        details: error instanceof Error ? error.message : "Unknown Twilio error",
      });
      return res.status(502).json({
        error: "Failed to initiate warm transfer",
        message: error instanceof Error ? error.message : "Unknown Twilio error",
        transfer: warmTransfers.getSession(transfer.transfer_id),
      });
    }

    return res.status(201).json({
      success: true,
      message: "Warm transfer initiated.",
      transfer: warmTransfers.getSession(transfer.transfer_id),
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to create warm transfer",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/api/warm-transfers", (_req: Request, res: Response) => {
  const transfers = warmTransfers.listSessions();
  return res.json({
    success: true,
    count: transfers.length,
    transfers,
  });
});

app.get("/api/warm-transfers/:transfer_id", (req: Request, res: Response) => {
  const transfer = warmTransfers.getSession(req.params.transfer_id);
  if (!transfer) {
    return res.status(404).json({ error: "Warm transfer not found." });
  }
  return res.json({ success: true, transfer });
});

app.post("/webhooks/twilio/warm-transfer-status", (req: Request, res: Response) => {
  const sid = String(req.body.CallSid || "");
  const status = String(req.body.CallStatus || "").toLowerCase();
  if (!sid) return res.status(400).send("Missing CallSid");

  const linked = warmTransfers.findBySid(sid);
  if (!linked) return res.status(200).send("OK");

  if (["answered", "in-progress"].includes(status)) {
    warmTransfers.setStatus(linked.session.transfer_id, "bridged");
  } else if (isTerminalCallStatus(status)) {
    if (["failed", "busy", "no-answer", "canceled"].includes(status)) {
      warmTransfers.setStatus(linked.session.transfer_id, "failed");
    } else {
      warmTransfers.setStatus(linked.session.transfer_id, "completed");
    }
  } else {
    warmTransfers.setStatus(linked.session.transfer_id, "connecting");
  }
  persistWarmTransferState(linked.session.transfer_id);
  return res.status(200).send("OK");
});

app.get("/api/dashboard/overview", async (_req: Request, res: Response) => {
  try {
    const shelterCountResult = await pool.query("SELECT COUNT(*) FROM shelters");
    const shelterCount = Number(shelterCountResult.rows[0].count || 0);

    const jobs = callJobs.listJobs();
    const attempts = jobs.flatMap((j) => j.attempts);
    const transfers = warmTransfers.listSessions();

    const parsedAvailability = attempts.reduce(
      (acc, attempt) => {
        const status = attempt.parsed_transcript?.availability_status;
        if (status === "available") acc.available += 1;
        else if (status === "waitlist") acc.waitlist += 1;
        else if (status === "unknown") acc.unknown += 1;
        return acc;
      },
      { available: 0, waitlist: 0, unknown: 0 }
    );

    const response = {
      success: true,
      generated_at: new Date().toISOString(),
      top_stats: {
        total_shelters_in_db: shelterCount,
        calls_made: attempts.filter((a) => a.status !== "queued").length,
        beds_found: parsedAvailability.available,
        active_transfers: transfers.filter((t) => t.status === "connecting" || t.status === "bridged").length,
      },
      shelters: {
        total: shelterCount,
      },
      call_jobs: {
        total: jobs.length,
        queued: jobs.filter((j) => j.status === "queued").length,
        in_progress: jobs.filter((j) => j.status === "in_progress").length,
        completed: jobs.filter((j) => j.status === "completed").length,
        failed: jobs.filter((j) => j.status === "failed").length,
      },
      call_attempts: {
        total: attempts.length,
        queued: attempts.filter((a) => a.status === "queued").length,
        initiated: attempts.filter((a) => a.status === "initiated").length,
        completed: attempts.filter((a) => a.status === "completed").length,
        failed: attempts.filter((a) => a.status === "failed").length,
        parsed_outcomes: parsedAvailability,
      },
      warm_transfers: {
        total: transfers.length,
        queued: transfers.filter((t) => t.status === "queued").length,
        connecting: transfers.filter((t) => t.status === "connecting").length,
        bridged: transfers.filter((t) => t.status === "bridged").length,
        completed: transfers.filter((t) => t.status === "completed").length,
        failed: transfers.filter((t) => t.status === "failed").length,
      },
      safety: {
        blocked_numbers: safetyControls.listBlockedNumbers().length,
        escalation_events: safetyControls.listEscalations(1000).length,
      },
    };

    return res.json(response);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to build dashboard overview",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/api/dashboard/activity", (_req: Request, res: Response) => {
  const jobs = callJobs.listJobs().slice(0, 10);
  const transfers = warmTransfers.listSessions().slice(0, 10);
  const escalations = safetyControls.listEscalations(10);
  const recentAttempts = callJobs
    .listJobs()
    .flatMap((job) =>
      job.attempts.map((attempt) => ({
        job_id: job.job_id,
        shelter_name: attempt.shelter_name,
        status: attempt.status,
        updated_at: attempt.updated_at,
      }))
    )
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 50);
  return res.json({
    success: true,
    recent_call_attempts: recentAttempts,
    recent_call_jobs: jobs,
    recent_warm_transfers: transfers,
    recent_escalations: escalations,
  });
});

async function bootstrapPersistence(): Promise<void> {
  if (!persistence.isEnabled()) return;
  await persistence.ensureSchema();

  const persistedBlocked = await persistence.listBlockedNumbers();
  persistedBlocked.forEach((num) => {
    safetyControls.addBlockedNumber(num);
  });

  const persistedEscalations = await persistence.listEscalations(500);
  safetyControls.seedEscalations(persistedEscalations);
}

app.listen(port, () => {
  void bootstrapPersistence().catch((error) => {
    console.error("Persistence bootstrap failed", error);
  });
  console.log(`Eden shelter API running on http://localhost:${port}`);
  console.log(`Nearest shelters: http://localhost:${port}/api/shelters/nearest?lat=37.7749&lon=-122.4194`);
  console.log(`Call mode: ${defaultCallMode}`);
  console.log(`Persistence enabled: ${persistence.isEnabled()}`);
});

process.on("SIGTERM", async () => {
  await pool.end();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await pool.end();
  process.exit(0);
});


