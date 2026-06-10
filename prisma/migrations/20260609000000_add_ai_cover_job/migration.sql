-- Async AI cover generation jobs.
--
-- Sellers submit a generation request, get a job id back in <1s, and can
-- navigate away while the OpenAI call runs in the background. The job table
-- tracks status (QUEUED → PROCESSING → COMPLETED/FAILED/TIMEOUT), stores the
-- input snapshot, and persists the final result_image_url. A cron sweeper
-- rescues stuck QUEUED jobs (process crashes between INSERT and worker fire)
-- and times out PROCESSING jobs after 5 min.
--
-- Indexes:
--   (user_id, status, created_at) → "one in-flight per user" concurrency check
--                                   + per-user job history list
--   (status, created_at)          → cron sweeper scan

CREATE TABLE "AICoverJob" (
    "id"                   TEXT         PRIMARY KEY,
    "user_id"              TEXT         NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "draft_id"             TEXT,
    "status"               TEXT         NOT NULL DEFAULT 'QUEUED',
    "title"                TEXT         NOT NULL,
    "category"             TEXT         NOT NULL,
    "subcategory"          TEXT,
    "style"                TEXT         NOT NULL,
    "size"                 TEXT,
    "description"          TEXT         NOT NULL,
    "hijab_required"       BOOLEAN      NOT NULL DEFAULT false,
    "model_skin_tone"      TEXT         NOT NULL,
    "reference_image_keys" TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "result_image_url"     TEXT,
    "error_message"        TEXT,
    "attempts"             INTEGER      NOT NULL DEFAULT 0,
    "started_at"           TIMESTAMP(3),
    "completed_at"         TIMESTAMP(3),
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3) NOT NULL
);

CREATE INDEX "AICoverJob_user_id_status_created_at_idx"
    ON "AICoverJob" ("user_id", "status", "created_at");

CREATE INDEX "AICoverJob_status_created_at_idx"
    ON "AICoverJob" ("status", "created_at");
