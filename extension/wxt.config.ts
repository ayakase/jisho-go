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
    name: 'Jisho Go - Tra tiếng Nhật siêu tốc',
    description: 'Công cụ tra từ điển và Kanji tiếng Nhật tức thì: hỗ trợ bôi đen tra nhanh, hover chữ Hán và nhận diện chữ trong ảnh (OCR).',
    action: {
      default_title: 'Jisho Go - Tra tiếng Nhật siêu tốc',
    },
    permissions: [
      "activeTab",
      "tabs",
      "scripting",
      "storage",
      "contextMenus",
      // "identity", // LLM/AI: đăng nhập Google cho ví AI (đã ẩn trên UI)
    ],
    host_permissions: [
      "<all_urls>",
      // Các host dưới đây chỉ phục vụ module LLM/AI (auth, ví, explain) - đã ẩn trên UI
      // "http://localhost/*",
      // "http://127.0.0.1/*",
      // "https://*.workers.dev/*",
      // "https://accounts.google.com/*",
      // "https://oauth2.googleapis.com/*",
      // "https://openidconnect.googleapis.com/*",
      // "https://vietqr.app/*",
    ],
    web_accessible_resources: [
      {
        resources: [
          "icon/*",
          "tesseract/worker.min.js",
          "tesseract/tesseract-core.wasm",
          "tesseract/tesseract-core.wasm.js",
          "tesseract/lang/jpn.traineddata.gz",
          "tesseract/lang/jpn_vert.traineddata.gz",
          "dict/kanji-dict.min.json.gz",
          "dict/vocabulary-dict.min.json.gz",
        ],
        matches: ["<all_urls>"],
      },
    ],

  },
});
