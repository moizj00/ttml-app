import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, "package.json"), "utf-8")
);
const plugins = [react(), tailwindcss()];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version ?? "1.0.0"),
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // ─── Vendor splitting: isolate heavy libraries ───
          if (id.includes("node_modules")) {
            // Tiptap rich text editor (attorney review only)
            if (
              id.includes("@tiptap") ||
              id.includes("prosemirror") ||
              id.includes("@tiptap/pm")
            ) {
              return "vendor-tiptap";
            }
            // Stripe (payment pages only)
            if (id.includes("@stripe") || id.includes("stripe")) {
              return "vendor-stripe";
            }
            // Supabase client
            if (id.includes("@supabase")) {
              return "vendor-supabase";
            }
            // Radix UI primitives
            if (id.includes("@radix-ui")) {
              return "vendor-radix";
            }
            // PDF generation (approval flow only)
            if (
              id.includes("pdfkit") ||
              id.includes("fontkit") ||
              id.includes("png-js") ||
              id.includes("brotli")
            ) {
              return "vendor-pdf";
            }
            // AI SDK (server-side, but may leak into client)
            if (id.includes("ai-sdk") || id.includes("@ai-sdk")) {
              return "vendor-ai";
            }
            // Lucide icons
            if (id.includes("lucide-react")) {
              return "vendor-icons";
            }
            // React core
            if (id.includes("react-dom") || id.includes("react/")) {
              return "vendor-react";
            }
          }
        },
      },
    },
  },
  server: {
    host: true,
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
