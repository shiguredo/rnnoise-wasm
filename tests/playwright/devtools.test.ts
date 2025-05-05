import { test } from '@playwright/test'

test('should interact with devtools', async ({ page }) => {
  await page.goto('http://localhost:9000/')

  await page.waitForSelector('button#toggleGenerateButton')
  await page.click('button#toggleGenerateButton')

  await page.waitForSelector('button#toggleDenoiseButton')
  await page.click('button#toggleDenoiseButton')

  await page.close()
})
