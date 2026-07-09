/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      isolatedModules: true,
      diagnostics: {
        ignoreCodes: [151001]
      },
      tsconfig: {
        esModuleInterop: true,
        baseUrl: ".",
        paths: {
          "@/*": ["./apps/web/*"],
          "@repo/auth-server": ["./packages/auth-server/src"],
          "@repo/database": ["./packages/database/src"],
          "@repo/notifications": ["./packages/notifications/src"],
          "@repo/realtime": ["./packages/realtime/src"],
          "@repo/shared": ["./packages/shared/src"],
          "@repo/storage": ["./packages/storage/src"],
          "@repo/types": ["./packages/types/src"],
          "@repo/validations": ["./packages/validations/src"]
        }
      }
    }],
    "^.+\\.jsx?$": "ts-jest",
  },
  transformIgnorePatterns: [
    "node_modules/(?!(@scure|otplib|@otplib|qrcode|@noble)/)"
  ],
  moduleNameMapper: {
    "^@/lib/(.*)$": "<rootDir>/apps/web/lib/$1",
    "^@/(.*)$": "<rootDir>/apps/web/$1",
    "^@repo/database$": "<rootDir>/packages/database/src",
    "^@repo/database/(.*)$": "<rootDir>/packages/database/src/$1",
    "^@repo/auth-server$": "<rootDir>/packages/auth-server/src",
    "^@repo/notifications$": "<rootDir>/packages/notifications/src",
    "^@repo/realtime$": "<rootDir>/packages/realtime/src",
    "^@repo/realtime/(.*)$": "<rootDir>/packages/realtime/src/$1",
    "^@repo/shared$": "<rootDir>/packages/shared/src",
    "^@repo/storage$": "<rootDir>/packages/storage/src",
    "^@repo/types$": "<rootDir>/packages/types/src",
    "^@repo/validations$": "<rootDir>/packages/validations/src"
  },
  moduleDirectories: ["node_modules", "<rootDir>"],
};
