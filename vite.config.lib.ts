import { defineConfig, PluginOption, UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

// Banner content
const banner = `/**
 * ${pkg.name}
 * @version ${pkg.version}
 */\n`;

// Banner injection plugin  
function bannerPlugin(): PluginOption {
  return {
    name: 'inject-banner',
    apply: 'build',
    generateBundle(_, bundle) {
      for (const [, file] of Object.entries(bundle)) {
        if (file.type === 'chunk' && file.fileName.endsWith('.js')) {
          file.code = banner + file.code;
        }
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), bannerPlugin()],
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
      ]
    }
  },
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
} as UserConfig);
