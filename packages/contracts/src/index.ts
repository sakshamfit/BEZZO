/**
 * @bezzo/contracts — the shared BEZZO domain vocabulary.
 *
 * Consumers:
 *  - apps/api      (NestJS) — validation, state machine enforcement, DTO typing
 *  - apps/web      (Next.js) — typed API client, UI state gating
 *  - apps/mobile   (React Native / Expo) — typed API client, offline scan payloads
 *
 * Nothing in this package performs I/O or imports framework code, so it stays safe to share with
 * every runtime (Node, browser, React Native Hermes).
 */
export * from './domain/enums';
export * from './domain/state-machines';
export * from './errors/error-codes';
export * from './http/envelope';
export * from './dto/identity';
export * from './dto/marketplace';
export * from './dto/picker';
export * from './dto/admin';
export * from './config/operational-config';
