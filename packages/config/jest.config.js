/** Jest configuration for the package (CommonJS so Jest can load it directly). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/*.spec.ts'],
  testTimeout: 30000,
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json', isolatedModules: true }],
  },
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!**/index.ts'],
};
