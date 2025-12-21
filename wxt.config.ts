import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'Kanji Go - Tra Kanji siêu tốc',
    description: 'Kanji Go - Tra Kanji siêu tốc',
    permissions: ["activeTab", "tabs", "scripting", "storage", "contextMenus"],

  },
});
