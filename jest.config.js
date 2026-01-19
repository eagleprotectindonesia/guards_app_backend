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
          "@repo/database": ["./packages/database/src"],
          "@repo/shared": ["./packages/shared/src"],
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
    "^@/(.*)$": "<rootDir>/apps/web/$1",
    "^@repo/database$": "<rootDir>/packages/database/src",
    "^@repo/shared$": "<rootDir>/packages/shared/src",
    "^@repo/types$": "<rootDir>/packages/types/src",
    "^@repo/validations$": "<rootDir>/packages/validations/src"
  },
  moduleDirectories: ["node_modules", "<rootDir>"],
};