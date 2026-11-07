import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        game: resolve(__dirname, "index.html"),
        fauna: resolve(__dirname, "creatures.html"),
      },
    },
  },
});
