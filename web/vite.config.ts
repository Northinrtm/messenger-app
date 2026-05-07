import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/storage": {
        target: "http://localhost:9000",
        changeOrigin: true,
      },
    },
  },
});
