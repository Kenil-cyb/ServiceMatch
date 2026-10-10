import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { sanitizeApiBaseUrl } from './src/services/apiConfig.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiBaseUrl = sanitizeApiBaseUrl(env.VITE_API_BASE_URL, mode === "production");

  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(apiBaseUrl),
    },
  };
});
