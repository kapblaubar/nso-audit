import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests',testMatch:['management.spec.ts','customer-entry.spec.ts'],workers:1,
  outputDir:'.azure/browser-results',
  use:{baseURL:'http://127.0.0.1:5173',...(process.platform==='win32'?{channel:'msedge'}:{}),headless:true},
  webServer:{command:'npm run dev --workspace @nso-audit/web -- --host 127.0.0.1 --port 5173 --strictPort',url:'http://127.0.0.1:5173',reuseExistingServer:false},
});
