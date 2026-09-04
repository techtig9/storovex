module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  // Live network tests are opt-in via STOROVEX_LIVE_TESTS=1; they self-skip otherwise.
  testPathIgnorePatterns: process.env.STOROVEX_LIVE_TESTS === "1" ? [] : ["/node_modules/", "\\.live\\.test\\."],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.jest.json" }]
  }
};
