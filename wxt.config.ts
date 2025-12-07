import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'Kanji Go',
    description: 'Kanji Go - Tra kanji siêu tốc',
    permissions: ['storage'],
  },
});
