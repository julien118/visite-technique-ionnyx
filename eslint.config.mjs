import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

// Config ESLint « plate » (ESLint 9, requis par eslint-config-next 16). On réutilise
// les presets Next via FlatCompat pour garder exactement les mêmes règles qu'avant
// (next/core-web-vitals + next/typescript), sans réécriture manuelle.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['.next/**', 'node_modules/**'],
  },
];

export default eslintConfig;
