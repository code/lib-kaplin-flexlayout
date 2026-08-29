import { defineConfig, UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

// Banner content
const banner = `/**
 * ${pkg.name}
 * @version ${pkg.version}
 */\n`;

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: `${import.meta.dirname}/src/index.ts`,
      name: 'index',
      fileName: 'index',
      formats: ['es'],
    },
    outDir: 'dist',
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime'
      ],
      output: {
        banner,
      },
    }
  },
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
} as UserConfig);
