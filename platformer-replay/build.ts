// Build script : bundle tout le TypeScript en un seul dist/main.js
// Lance avec : deno run --allow-read --allow-write --allow-env --allow-net build.ts

import { build, stop } from 'https://deno.land/x/esbuild@v0.20.2/mod.js';
import { denoPlugins } from 'https://deno.land/x/esbuild_deno_loader@0.9.0/mod.ts';

await build({
  plugins: [...denoPlugins()],
  entryPoints: ['./src/main.ts'],
  outfile: './dist/main.js',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: false, // false pour la démo — code lisible dans les DevTools
  sourcemap: 'inline',
});

await stop();
console.log('✅ Build OK → dist/main.js');
