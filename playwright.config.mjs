import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',fullyParallel:true,workers:2,
  use:{baseURL:'http://127.0.0.1:8790',browserName:'chromium',viewport:{width:1000,height:780},trace:'retain-on-failure'},
  webServer:{command:'node scripts/run-node.mjs scripts/preview.mjs',url:'http://127.0.0.1:8790',reuseExistingServer:!process.env.CI},
  reporter:[['list'],['html',{open:'never'}]],
});
