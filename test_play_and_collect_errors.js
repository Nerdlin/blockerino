const { chromium } = require('playwright');

(async () => {
  console.log("Launching browser...");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const consoleErrors = [];
  page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
          consoleErrors.push({ type: msg.type(), text: msg.text() });
      }
  });
  
  page.on('pageerror', err => {
      consoleErrors.push({ type: 'pageerror', text: err.toString() });
  });

  console.log("Navigating to http://localhost:8085 ...");
  await page.goto('http://localhost:8085', { waitUntil: 'networkidle', timeout: 15000 });
  
  console.log("Clicking Classic ∞ mode...");
  const classicButton = await page.$('text=Classic ∞');
  if (classicButton) {
      await classicButton.click();
      await page.waitForTimeout(2000);
      
      // Let's drag a piece to the center of the board
      const { width, height } = page.viewportSize();
      console.log("Simulating drag and drop to trigger gameplay...");
      
      // Drag 1
      await page.mouse.move(width / 2, height - 100);
      await page.mouse.down();
      await page.mouse.move(width / 2, height / 2, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(1000);

      // Drag 2
      await page.mouse.move(width / 2 - 100, height - 100);
      await page.mouse.down();
      await page.mouse.move(width / 2, height / 2 - 50, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(1000);

      // Drag 3
      await page.mouse.move(width / 2 + 100, height - 100);
      await page.mouse.down();
      await page.mouse.move(width / 2 + 50, height / 2, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(1500);

      console.log("Console Errors and Warnings captured:");
      consoleErrors.forEach(err => {
          console.log(`[${err.type.toUpperCase()}] ${err.text}`);
      });
  } else {
      console.error("FAIL: Classic ∞ button not found!");
  }
  
  await browser.close();
  console.log("Done!");
})();
