/// <reference types="vitest" />
import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import { loadMcpPlugin } from "./scripts/mcp-sdk-windows.mjs";
import { excludeAndroidDownloads } from "./scripts/rustore/exclude-android-downloads.mjs";
import { privateCleanupWorkerSource, runtimeRequestMatcher } from "./src/lib/pwa/privateCachePolicy";
import { createShellPrecache } from "./scripts/pwa/shellPrecache";

const pwaCacheVersion = "sintagma-1.0.82";

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }): Promise<UserConfig & {
  test: { globals: boolean; environment: "jsdom"; include: string[] };
}> => {
  const mcpPlugin = await loadMcpPlugin(__dirname);
  const shellPrecache = createShellPrecache({ receiptPath: process.env.PWA_SHELL_RECEIPT_PATH });
  return ({
  // Capacitor serves bundled files at https://localhost, including deep routes.
  // Relative assets would resolve under /documents/assets after ordinary links.
  base: '/',
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    excludeAndroidDownloads(process.env.CAPACITOR_BUILD === "true"),
    react(),
    mcpPlugin(),
    mode === "development" && componentTagger(),
    {
      name: 'sintagma-private-cache-cleanup',
      generateBundle(this: import('rollup').PluginContext) {
        this.emitFile({ type: 'asset', fileName: 'sw-private-cache-cleanup.js', source: privateCleanupWorkerSource() });
      },
    },
    shellPrecache.plugin,
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      devOptions: { enabled: false },
      includeAssets: ["favicon.ico", "robots.txt"],
      manifest: {
        name: "СИНТАГМА — Система дистанционного обучения",
        short_name: "СИНТАГМА",
        description: "Система дистанционного обучения и документооборота для организаций",
        theme_color: "#1F1F1F",
        background_color: "#F9F8F5",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        cacheId: pwaCacheVersion,
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MB limit
        globPatterns: ["**/*.{js,css,html,ico,png,jpg,jpeg,gif,webp,svg,woff,woff2}"],
        manifestTransforms: [shellPrecache.manifestTransform],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        importScripts: ['sw-private-cache-cleanup.js'],
        navigateFallbackDenylist: [
          /^\/~oauth/, /^\/downloads\//,
          /\/(?:sb-api|sb-functions|sb-storage|sb-realtime)(?:\/|$)/i,
          /\/(?:rest|auth|functions|storage)\/v1(?:\/|$)/i,
          /^\/(?:object|render\/image)\//i,
          /[%?]/, // Never turn encoded/private or credential-bearing navigation into an offline shell.
          /[?&](?:access_token|refresh_token|token|signature|sig|apikey|authorization|code|password|session|jwt)=/i,
        ],
        runtimeCaching: [
          {
            urlPattern: runtimeRequestMatcher('private'),
            handler: "NetworkOnly",
          },
          {
            urlPattern: runtimeRequestMatcher('public-lesson'),
            handler: "CacheFirst",
            options: {
              cacheName: 'sintagma-public-lessons-v1',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: runtimeRequestMatcher('static'),
            handler: "CacheFirst",
            options: {
              cacheName: `${pwaCacheVersion}-static-cache`,
              // Match the course TTL; bounded eviction and build refresh still apply.
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(Date.now().toString()),
  },
  esbuild: {
    drop: mode === "production" ? ["console", "debugger"] : [],
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React vendor
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          // Supabase client
          "supabase-vendor": ["@supabase/supabase-js"],
          // Data fetching / state
          "query-vendor": ["@tanstack/react-query"],
          // Heavy UI: Radix primitives
          "radix-vendor": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-popover",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-accordion",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-switch",
          ],
          // Forms
          "forms-vendor": ["react-hook-form", "@hookform/resolvers", "zod"],
          // Charts (recharts is heavy)
          "charts-vendor": ["recharts"],
          // Icons
          "icons-vendor": ["lucide-react"],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  });
});
