#!/usr/bin/env node
/**
 * Exports the OpenAPI document to `openapi/bezzo-api.json`.
 *
 * Runs against the compiled application (`dist/`) so it exercises the exact module graph that will
 * be deployed. Usage: `pnpm --filter @bezzo/api openapi:export` (after `pnpm build`).
 */
const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

async function main() {
  const path = require('node:path');
  const distRoot = path.resolve(__dirname, '..', 'dist');

  // Configuration is validated at boot, so the exporter needs the same environment as the server.
  // Loading the repository `.env` keeps `pnpm openapi:export` working from any working directory
  // without duplicating secrets on the command line (real environment variables still win).
  const { loadEnvFile } = require('@bezzo/config');
  loadEnvFile({ silent: true });

  let AppModule;
  let SwaggerModule;
  let DocumentBuilder;
  let NestFactory;
  let FastifyAdapter;

  try {
    ({ AppModule } = require(path.join(distRoot, 'app.module.js')));
    ({ SwaggerModule, DocumentBuilder } = require('@nestjs/swagger'));
    ({ NestFactory } = require('@nestjs/core'));
    ({ FastifyAdapter } = require('@nestjs/platform-fastify'));
  } catch (error) {
    console.error('Unable to load the compiled application. Run `pnpm build` first.');
    console.error(error.message);
    process.exit(1);
  }

  // The export must not start listeners or background workers.
  process.env.WORKER_ENABLED = 'false';

  const app = await NestFactory.create(AppModule, new FastifyAdapter(), { logger: false, abortOnError: false });
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/live', 'health/ready', 'metrics', 'version'],
  });

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('BEZZO API')
      .setDescription(
        'B2B pharmaceutical marketplace API. Standardised envelopes, stable error codes, ' +
          'Idempotency-Key on mutations, role + permission + ownership authorization.',
      )
      .setVersion(process.env.APP_VERSION || '1.0.0')
      .addBearerAuth()
      .build(),
  );

  const outputDir = join(__dirname, '..', 'openapi');
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, 'bezzo-api.json');
  writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  console.log(`OpenAPI document written to ${outputPath}`);

  await app.close();
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  // Set the exit code instead of calling process.exit(): stderr is a pipe when this runs under pnpm
  // or CI, and an immediate exit would truncate the diagnostic message.
  process.exitCode = 1;
});
