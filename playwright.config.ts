import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  workers: 1,
  testDir: 'tests',
  testIgnore: '**/rnnoise.test.ts',
  reporter: 'html',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],
  webServer: {
    command: 'pnpm run dev --port 9000',
    url: 'http://localhost:9000/',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
