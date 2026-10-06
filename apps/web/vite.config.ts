import { defineConfig } from "vite";

export default defineConfig({
  envDir: "../..",
  publicDir: ".registry",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          icons: ["lucide-react"],
          motion: ["motion/react"],
          react: ["react", "react-dom"],
          validation: ["zod"],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
});
