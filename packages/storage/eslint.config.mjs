import { defineConfig } from 'eslint/config';
import tsParser from '@typescript-eslint/parser';

export default defineConfig([
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    ignores: ['node_modules/**', 'dist/**', '.turbo/**'],
    rules: {
      'no-unused-vars': 'warn',
    },
  },
]);
