/** Unit tests (no database required). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  testTimeout: 30000,
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', isolatedModules: true }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts'],
  moduleNameMapper: {
    '^@bezzo/(.*)$': '<rootDir>/../../packages/$1/src/index.ts',
  },
};
