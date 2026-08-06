/**
 * Configuration Jest — Plateforme de Gestion Immobilière
 * Auteur : DIABATE Oumarou — DATACONNECT AFRICA · 06 août 2026
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['apps/api/src/**/*.(t|j)s'],
  coveragePathIgnorePatterns: ['\\.module\\.ts$', 'main\\.ts$', '\\.dto\\.ts$'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
};
