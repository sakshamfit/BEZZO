/**
 * In-process scheduler for durable background work.
 *
 * Design constraints (jobs/queues spec, project rule §14 "modular monolith first"):
 *  - every job is idempotent and safe to run on several instances simultaneously;
 *  - a PostgreSQL advisory lock elects one runner per job per tick, so running N API instances does
 *    not multiply work (each job's unit of work is additionally guarded by row-level conditional SQL);
 *  - the queue itself is the database (`domain_events`, `notifications`, `search_index_jobs`,
 *    `pickup_offers`, ...), therefore a process restart never loses work;
 *  - this scheduler is intentionally swappable for a dedicated worker deployment (BullMQ/Redis or a
 *    Kubernetes worker Deployment) without touching job bodies — they are plain async functions here.
 *
 * `WORKER_ENABLED=false` disables all jobs on an instance, which is how the API fleet and the worker
 * fleet are separated in production.
 */
import { Inject, Injectable, Module, Global, type OnApplicationShutdown } from '@nestjs/common';
import { Database, type Database as DatabaseType } from '@bezzo/database';
import type { AppConfig } from '@bezzo/config';
import { APP_CONFIG } from '../config/config.module';
import { DATABASE } from '../database/database.module';
import { InjectLogger, BEZZO_LOGGER, type BezzoLogger } from '../logger/logger.module';
import { createRequestContext, runWithContext } from '../../common/context/request-context';

export interface JobDefinition {
  name: string;
  intervalMs: number;
  /** Advisory-lock key: concurrent runs across instances are prevented per job. */
  lockKey: number;
  handler: (context: JobContext) => Promise<JobOutcome | void>;
  /** Run immediately on boot (useful for outbox and assignment engines). */
  runOnStart?: boolean;
}

export interface JobContext {
  logger: BezzoLogger;
  jobRunId: string;
}

export interface JobOutcome {
  itemsProcessed?: number;
  itemsFailed?: number;
  metadata?: Record<string, unknown>;
  skipped?: boolean;
}

interface RegisteredJob extends JobDefinition {
  timer?: NodeJS.Timeout;
  running: boolean;
}

function stableLockKey(name: string): number {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 2_000_000_000;
}

@Injectable()
export class SchedulerService implements OnApplicationShutdown {
  private readonly jobs = new Map<string, RegisteredJob>();
  private started = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: DatabaseType,
    @InjectLogger() private readonly logger: BezzoLogger,
  ) {}

  register(definition: JobDefinition): void {
    if (this.jobs.has(definition.name)) {
      throw new Error(`Job "${definition.name}" is already registered`);
    }
    this.jobs.set(definition.name, { ...definition, running: false });
    if (this.started) this.schedule(this.jobs.get(definition.name) as RegisteredJob);
  }

  registeredJobs(): string[] {
    return [...this.jobs.keys()].sort();
  }

  /** Called by the worker module once every job has been registered. */
  start(): void {
    if (this.started) return;
    if (!this.config.WORKER_ENABLED) {
      this.logger.warnWith({}, 'WORKER_ENABLED=false — background jobs are not started');
      return;
    }
    this.started = true;
    for (const job of this.jobs.values()) {
      this.schedule(job);
    }
    this.logger.info({ jobs: this.registeredJobs() }, 'background workers started');
  }

  /** Run a job once, on demand (used by tests and by the admin "run now" action). */
  async runOnce(name: string): Promise<JobOutcome | null> {
    const job = this.jobs.get(name);
    if (!job) return null;
    return this.execute(job);
  }

  private schedule(job: RegisteredJob): void {
    if (job.runOnStart) {
      void this.execute(job);
    }
    job.timer = setInterval(() => void this.execute(job), job.intervalMs);
    // Node must not stay alive only because of a background timer.
    job.timer.unref?.();
  }

  private async execute(job: RegisteredJob): Promise<JobOutcome | null> {
    if (job.running) return null; // never overlap the same job inside one process
    job.running = true;
    const jobRunId = crypto.randomUUID();
    const startedAt = process.hrtime.bigint();

    try {
      // Advisory lock: exactly one instance runs this job per tick.
      const outcome = await this.database.withAdvisoryLock(stableLockKey(job.name) ^ job.lockKey, async () => {
        const context = createRequestContext();
        return runWithContext(context, () =>
          job.handler({ logger: this.logger.child(`job:${job.name}`), jobRunId }),
        );
      });

      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      await this.recordRun(job.name, jobRunId, 'SUCCEEDED', outcome ?? {}, durationMs, null);
      if ((outcome?.itemsProcessed ?? 0) > 0 || (outcome?.itemsFailed ?? 0) > 0) {
        this.logger.debugWith(
          { job: job.name, durationMs: Math.round(durationMs), ...(outcome ?? {}) },
          'job completed',
        );
      }
      return outcome ?? null;
    } catch (error) {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.logger.errorWith(
        { job: job.name, durationMs: Math.round(durationMs), error: (error as Error).message },
        'job failed',
      );
      await this.recordRun(job.name, jobRunId, 'FAILED', {}, durationMs, (error as Error).message).catch(
        () => undefined,
      );
      return null;
    } finally {
      job.running = false;
    }
  }

  private async recordRun(
    jobName: string,
    jobRunId: string,
    status: 'SUCCEEDED' | 'FAILED',
    outcome: JobOutcome,
    durationMs: number,
    error: string | null,
  ): Promise<void> {
    await this.database.query(
      `INSERT INTO job_runs (id, job_name, status, items_processed, items_failed, duration_ms, error_message, metadata, started_at, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6::INTEGER, $7, $8::JSONB,
               now() - ($6::TEXT || ' milliseconds')::INTERVAL, now())`,
      [
        jobRunId,
        jobName,
        status,
        outcome.itemsProcessed ?? 0,
        outcome.itemsFailed ?? 0,
        Math.round(durationMs),
        error,
        JSON.stringify(outcome.metadata ?? {}),
      ],
    );
  }

  onApplicationShutdown(): void {
    for (const job of this.jobs.values()) {
      if (job.timer) clearInterval(job.timer);
    }
    this.started = false;
  }
}

@Global()
@Module({
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class JobsModule {}
