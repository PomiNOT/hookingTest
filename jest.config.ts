import type { JestConfigWithTsJest } from 'ts-jest';

export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  resolver: 'jest-ts-webcompat-resolver',
  transform: {
    '^.+\\.ts?$': [
      'ts-jest',
      {
        useESM: true
      }
    ] 
  },
  extensionsToTreatAsEsm: ['.ts']
} as JestConfigWithTsJest