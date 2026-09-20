/**
 * Integration tests. These require a real PostgreSQL instance (DATABASE_URL) because BEZZO
 * correctness claims — atomic inventory reservation, pickup claim, idempotency — can only be proven
 * against the real database engine.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  testTimeout: 60000,
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', isolatedModules: true }],
  },
  maxWorkers: 1,
  moduleNameMapper: {
    '^@bezzo/(.*)$': '<rootDir>/../../packages/$1/src/index.ts',
  },
};
