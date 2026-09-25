/**
 * BEZZO API bootstrap.
 *
 * Responsibilities:
 *  - bind to 0.0.0.0 so the service is reachable from containers/load balancers;
 *  - install security headers, CORS, request-context middleware and the global envelope/filter;
 *  - expose OpenAPI documentation at /docs (non-production) and health/metrics endpoints;
 *  - fail fast when configuration is invalid (handled inside the config provider).
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';
import { loadConfig, loadEnvFile } from '@bezzo/config';
import { AppModule } from './app.module';
import { requestContextMiddleware } from './common/middleware/request-context.middleware';
import { renderApiIndex } from './common/http/api-index';

const zlib = require('node:zlib') as typeof import('node:zlib') & {
  createZstdCompress?: unknown;
};
const responseEncodings =
  typeof zlib.createZstdCompress === 'function'
    ? ['zstd', 'br', 'gzip']
    : ['br', 'gzip'];

async function bootstrap(): Promise<void> {
  // `.env` is a developer convenience only: variables already present in the environment (containers,
  // CI, secret manager) always win.
  loadEnvFile({ silent: true });
  const config = loadConfig();
  const logger = new Logger('Bootstrap');

  const adapter = new FastifyAdapter({
    trustProxy: true,
    bodyLimit: config.API_BODY_LIMIT_BYTES,
    // Raw body is required to verify payment/logistics webhook signatures byte-for-byte.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: false,
    rawBody: true,
  });

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onRequest', requestContextMiddleware);

  // Body-less mutations (DELETE /cart/items/:id, POST /notifications/read-all, …) are legitimate, but
  // Fastify's stock JSON parser rejects an empty payload with "Body cannot be empty when content-type
  // is set to 'application/json'". Mobile SDKs and generic HTTP clients set that header without a body,
  // so the parser is replaced through the Nest adapter (`useBodyParser` also flags the parser as
  // registered, which stops NestApplication.init from installing the stock one afterwards). Raw bytes
  // are still captured on `request.rawBody`, which payment/logistics webhook signature verification
  // depends on.
  fastify.removeContentTypeParser('application/json');
  adapter.useBodyParser(
    'application/json',
    true,
    { bodyLimit: config.API_BODY_LIMIT_BYTES },
    (_request, body, done) => {
      const raw = body.length === 0 ? '' : body.toString('utf8');
      if (raw.trim().length === 0) {
        done(null, undefined);
        return;
      }
      try {
        const { onProtoPoisoning, onConstructorPoisoning } = fastify.initialConfig;
        // Fastify types `getDefaultJsonParser` for string payloads; at runtime it accepts the buffer
        // that `useBodyParser` (parseAs: 'buffer') hands over, so the signature is narrowed here.
        const parseJson = fastify.getDefaultJsonParser(
          onProtoPoisoning ?? 'error',
          onConstructorPoisoning ?? 'error',
        ) as unknown as (
          request: unknown,
          body: Buffer,
          done: (error: Error | null, parsed?: unknown) => void,
        ) => void;
        parseJson(_request, body, done);
      } catch {
        done(new Error('Request body is not valid JSON'), undefined);
      }
    },
  );

  // Compress textual API responses at the origin so clients benefit even when the edge does not
  // negotiate compression. Prefer Zstandard on Node 22.15+, then Brotli, then gzip. Compressed
  // request bodies remain disabled; image/PDF and other already-compressed media are not compressed.
  await app.register(require('@fastify/compress'), {
    global: true,
    globalDecompression: false,
    encodings: responseEncodings,
    threshold: 1024,
    brotliOptions: {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 },
    },
  });

  // Security headers for a JSON API.
  //
  // Content-Security-Policy and Cross-Origin-Resource-Policy are omitted here: the API serves JSON to
  // programmatic clients and two first-party HTML pages (`/` and `/docs`), and CSP/embedding policy is
  // enforced by the web app and the CDN/WAF in front of the API (see the infrastructure spec).
  // `frameguard` is deliberately off as well so those first-party pages can be embedded by Bezzo's own
  // tooling (local preview panels, ops dashboards) rather than being blocked by X-Frame-Options.
  await app.register(require('@fastify/helmet'), {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
    // `X-Frame-Options: SAMEORIGIN` (helmet's default) would make the API's own operator pages
    // impossible to embed in the BEZZO console, which hosts them in a same-origin iframe. Framing is
    // restricted by the CDN/WAF and by CSP in the web app instead of a blanket deny here.
    xFrameOptions: false,
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
    // HSTS only makes sense once TLS terminates in front of the API.
    strictTransportSecurity: config.NODE_ENV === 'production',
  });
  await app.register(require('@fastify/cors'), {
    origin: true,
    credentials: true,
    exposedHeaders: ['X-Request-ID', 'X-Correlation-ID', 'Retry-After'],
  });

  // Human/operator entry point. Registered on the raw instance because the global prefix must not
  // apply to it (the API contract owns the prefixed paths).
  const docsEnabled = config.NODE_ENV !== 'production';
  fastify.get('/', (_request, reply) => {
    void reply
      .type('text/html; charset=utf-8')
      .header('cache-control', 'no-store')
      .send(
        renderApiIndex({
          serviceName: `${config.APP_NAME} API`,
          version: config.APP_VERSION,
          environment: config.NODE_ENV,
          basePath: config.API_BASE_PATH,
          docsEnabled,
        }),
      );
  });

  app.setGlobalPrefix(config.API_BASE_PATH.replace(/^\//, ''), {
    exclude: ['health', 'health/live', 'health/ready', 'metrics', 'version'],
  });
  app.enableShutdownHooks();
  // The error filter and the envelope/metrics interceptors are registered as APP_FILTER /
  // APP_INTERCEPTOR providers inside AppModule so that they participate in dependency injection.

  if (docsEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('BEZZO API')
        .setDescription(
          'B2B pharmaceutical marketplace API. Contract: standardized envelope, stable error codes, ' +
            'Idempotency-Key on mutations, role+permission+ownership authorization.',
        )
        .setVersion('1.0')
        .addBearerAuth()
        .addTag('auth')
        .addTag('buyer')
        .addTag('supplier')
        .addTag('catalog')
        .addTag('orders')
        .addTag('picker')
        .addTag('hub')
        .addTag('admin')
        .build(),
    );
    SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs/json' });
  }

  await app.listen({ port: config.API_PORT, host: config.API_HOST });
  logger.log(`BEZZO API listening on http://${config.API_HOST}:${config.API_PORT}${config.API_BASE_PATH}`);
}

void bootstrap();
