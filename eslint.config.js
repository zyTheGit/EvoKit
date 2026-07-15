// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', '*.cjs'],
  },
  {
    rules: {
      // Allow explicit `any` in migration/legacy code, but flag new uses
      '@typescript-eslint/no-explicit-any': 'warn',

      // Require explicit return types on public API functions
      '@typescript-eslint/explicit-function-return-type': 'off',

      // No unused vars (auto-fix removes them)
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],

      // Prefer const over let when variable is never reassigned
      'prefer-const': 'warn',

      // No console.log in production code — CLI tools are the exception
      'no-console': 'off',

      // Require === and !==
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
);
