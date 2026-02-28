import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pool } from "pg";
import { CallJobStore, CallMode, ShelterCallTarget } from "./call_jobs";
import { buildConferenceJoinTwiml, buildShelterIntakeTwiml, createTwilioCall, TwilioConfig } from "./twilio_client";
import { generateCallScript, parseTranscript } from "./ai_agent";
import { WarmTransferMode, WarmTransferStore } from "./warm_transfer";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const callJobs = new CallJobStore();
const warmTransfers = new WarmTransferStore();
const defaultCallMode: CallMode = process.env.EDEN_CALL_MODE === "live" ? "live" : "dry_run";
const twilioConfig: TwilioConfig = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || "",
  authToken: process.env.TWILIO_AUTH_TOKEN || "",
  fromNumber: process.env.TWILIO_FROM_NUMBER || "",
  statusCallbackUrl: process.env.TWILIO_STATUS_CALLBACK_URL || undefined,
};
const warmTransferStatusCallbackUrl =
  process.env.TWILIO_WARM_TRANSFER_STATUS_CALLBACK_URL || twilioConfig.statusCallbackUrl;

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME || "eden_db",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
});

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
        ST_Distance(coordinates, ST_MakePoint($1::float, $2::float)::geography) AS distance_meters
      FROM shelters
      WHERE coordinates IS NOT NULL
    `;

    if (maxDistanceMeters !== null && !Number.isNaN(maxDistanceMeters)) {
      values.push(maxDistanceMeters);
      query += ` AND ST_DWithin(coordinates, ST_MakePoint($1::float, $2::float)::geography, $3)`;
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
    const survivorContext = String(req.body.survivor_context || "").trim();
    const callbackNumber = req.body.callback_number ? String(req.body.callback_number) : undefined;
    const requestedMode = req.body.mode === "live" ? "live" : req.body.mode === "dry_run" ? "dry_run" : undefined;
    const mode: CallMode = requestedMode || defaultCallMode;

    if (shelterIds.length === 0) {
      return res.status(400).json({ error: "shelter_ids must include at least one shelter ID." });
    }
    if (!survivorContext) {
      return res.status(400).json({ error: "survivor_context is required." });
    }

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
      callback_number: callbackNumber,
      targets,
    });

    for (const attempt of job.attempts) {
      const scriptResult = await generateCallScript({
        shelterName: attempt.shelter_name,
        survivorContext,
        callbackNumber,
      });
      callJobs.markAttempt(job.job_id, attempt.attempt_id, {
        generated_script: scriptResult.script,
      });

      if (!attempt.to_phone) {
        callJobs.markAttempt(job.job_id, attempt.attempt_id, {
          status: "failed",
          error: "Shelter does not have intake_phone configured.",
        });
        continue;
      }

      if (mode === "dry_run") {
        callJobs.markAttempt(job.job_id, attempt.attempt_id, {
          status: "completed",
          provider_call_sid: `DRYRUN-${attempt.attempt_id}`,
        });
        continue;
      }

      try {
        const twiml = buildShelterIntakeTwiml({
          shelterName: attempt.shelter_name,
          survivorContext,
          callbackNumber,
          scriptText: scriptResult.script,
        });
        const { sid } = await createTwilioCall(twilioConfig, {
          to: attempt.to_phone,
          twiml,
        });
        callJobs.bindProviderSid(job.job_id, attempt.attempt_id, sid);
        callJobs.markAttempt(job.job_id, attempt.attempt_id, { status: "initiated" });
      } catch (error) {
        callJobs.markAttempt(job.job_id, attempt.attempt_id, {
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown Twilio error",
        });
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
  const survivorContext = String(req.body.survivor_context || "").trim();
  const callbackNumber = req.body.callback_number ? String(req.body.callback_number) : undefined;

  if (!shelterName || !survivorContext) {
    return res.status(400).json({
      error: "shelter_name and survivor_context are required.",
    });
  }

  const scriptResult = await generateCallScript({
    shelterName,
    survivorContext,
    callbackNumber,
  });
  return res.json({
    success: true,
    source: scriptResult.source,
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
  return res.status(200).send("OK");
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
    })
    .catch(() => {
      callJobs.markAttempt(linked.job.job_id, linked.attempt.attempt_id, {
        transcript_excerpt: excerpt,
      });
    });
  return res.status(200).json({ success: true, accepted: true });
});

app.post("/api/calls/parse-transcript", async (req: Request, res: Response) => {
  const transcript = String(req.body.transcript || "").trim();
  if (!transcript) {
    return res.status(400).json({ error: "transcript is required." });
  }
  const parsed = await parseTranscript(transcript);
  return res.json({
    success: true,
    source: parsed.source,
    parsed: parsed.parsed,
  });
});

app.post("/api/warm-transfers", async (req: Request, res: Response) => {
  try {
    const jobId = String(req.body.job_id || "").trim();
    const attemptId = String(req.body.attempt_id || "").trim();
    const survivorPhone = String(req.body.survivor_phone || "").trim();
    const survivorName = req.body.survivor_name ? String(req.body.survivor_name) : undefined;
    const notes = req.body.notes ? String(req.body.notes) : undefined;
    const requestedMode = req.body.mode === "live" ? "live" : req.body.mode === "dry_run" ? "dry_run" : undefined;
    const mode: WarmTransferMode = requestedMode || defaultCallMode;

    if (!jobId || !attemptId || !survivorPhone) {
      return res.status(400).json({
        error: "job_id, attempt_id, and survivor_phone are required.",
      });
    }

    const twilioError = ensureTwilioConfigured(mode);
    if (twilioError) return res.status(400).json({ error: twilioError });

    const job = callJobs.getJob(jobId);
    if (!job) return res.status(404).json({ error: "Call job not found." });
    const attempt = job.attempts.find((a) => a.attempt_id === attemptId);
    if (!attempt) return res.status(404).json({ error: "Call attempt not found on this job." });
    if (!attempt.to_phone) return res.status(400).json({ error: "Shelter attempt has no destination phone." });

    const transfer = warmTransfers.createSession({
      mode,
      job_id: jobId,
      attempt_id: attemptId,
      shelter_name: attempt.shelter_name,
      shelter_phone: attempt.to_phone,
      survivor_phone: survivorPhone,
      survivor_name: survivorName,
      notes,
    });

    if (mode === "dry_run") {
      warmTransfers.bindCallSid(transfer.transfer_id, "survivor", `DRYRUN-SURVIVOR-${transfer.transfer_id}`);
      warmTransfers.bindCallSid(transfer.transfer_id, "shelter", `DRYRUN-SHELTER-${transfer.transfer_id}`);
      warmTransfers.setStatus(transfer.transfer_id, "bridged");
      return res.status(201).json({
        success: true,
        message: "Dry-run warm transfer simulated.",
        transfer: warmTransfers.getSession(transfer.transfer_id),
      });
    }

    const conferenceTwiml = buildConferenceJoinTwiml(transfer.conference_name);
    warmTransfers.setStatus(transfer.transfer_id, "connecting");
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
    } catch (error) {
      warmTransfers.setStatus(transfer.transfer_id, "failed");
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
  return res.json({
    success: true,
    recent_call_jobs: jobs,
    recent_warm_transfers: transfers,
  });
});

app.listen(port, () => {
  console.log(`Eden shelter API running on http://localhost:${port}`);
  console.log(`Nearest shelters: http://localhost:${port}/api/shelters/nearest?lat=37.7749&lon=-122.4194`);
  console.log(`Call mode: ${defaultCallMode}`);
});

process.on("SIGTERM", async () => {
  await pool.end();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await pool.end();
  process.exit(0);
});


