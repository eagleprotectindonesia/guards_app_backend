import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsonc from "eslint-plugin-jsonc";
import jsoncParser from "jsonc-eslint-parser";
import fs from "fs";

// Read main package.json to serve as the source of truth
const mainPackageJson = JSON.parse(fs.readFileSync("./package.json", "utf8"));
const mainDeps = { ...mainPackageJson.dependencies, ...mainPackageJson.devDependencies };

const syncPackageJsonVersionsRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce dependency versions to match the main package.json",
    },
    fixable: "code",
    messages: {
      mismatch: "Dependency '{{name}}' version '{{version}}' does not match main package.json version '{{expected}}'.",
    },
  },
  create(context) {
    return {
      "JSONProperty": (node) => {
        if (
          (node.key.type === "JSONLiteral" && (node.key.value === "dependencies" || node.key.value === "devDependencies"))
        ) {
          const depsObject = node.value;
          if (depsObject.type !== "JSONObjectExpression") return;

          depsObject.properties.forEach(prop => {
            const depName = prop.key.value;
            const currentVersion = prop.value.value;
            const expectedVersion = mainDeps[depName];

            if (expectedVersion && currentVersion !== expectedVersion) {
              context.report({
                node: prop.value,
                messageId: "mismatch",
                data: {
                  name: depName,
                  version: currentVersion,
                  expected: expectedVersion,
                },
                fix(fixer) {
                  return fixer.replaceText(prop.value, `"${expectedVersion}"`);
                },
              });
            }
          });
        }
      },
    };
  },
};

const localPlugin = {
  rules: {
    "sync-package-json-versions": syncPackageJsonVersionsRule,
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...jsonc.configs["flat/recommended-with-jsonc"],
  {
    plugins: {
      "local-rules": localPlugin,
    },
  },
  {
    files: ["package.worker.json", "package.migration.json"],
    languageOptions: {
      parser: jsoncParser,
    },
    rules: {
      "local-rules/sync-package-json-versions": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "package-lock.json",
  ]),
]);

export default eslintConfig;
