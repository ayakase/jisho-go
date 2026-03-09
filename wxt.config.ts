import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  vite: () => ({
    plugins: [{
      name: 'fix-svelte-hmr-accept-exports',
      enforce: 'post' as const,
      transform(code: string) {
        if (code.includes('.hot.acceptExports(')) {
          return code.replace(/\.hot\.acceptExports\(/g, '.hot.acceptExports?.(');
        }
      }
    }]
  }),
  manifest: {
    name: 'Kanji Go - Tra Kanji siêu tốc',
    description: 'Kanji Go - Tra Kanji siêu tốc',
    permissions: ["activeTab", "tabs", "scripting", "storage", "contextMenus"],

  },
});
