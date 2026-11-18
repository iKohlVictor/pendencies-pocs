import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  // Em watch, não limpar dist: evita a api perder os tipos enquanto o rebuild roda.
  clean: !options.watch,
  sourcemap: true,
}));
