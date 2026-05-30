const { chromium } = require('playwright');

(async () => {
  console.log("Launching browser...");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  console.log("Navigating to http://localhost:8085 ...");
  await page.goto('http://localhost:8085', { waitUntil: 'networkidle', timeout: 15000 });
  
  console.log("Taking main menu screenshot...");
  await page.screenshot({ path: 'main-menu-new.png' });
  
  console.log("Clicking Classic ∞ mode...");
  // Try to find the classic mode button
  const classicButton = await page.$('text=Classic ∞');
  if (classicButton) {
      await classicButton.click();
      console.log("Waiting for game to load...");
      await page.waitForTimeout(2000); // Wait for transition
      
      console.log("Taking game screenshot...");
      await page.screenshot({ path: 'game-screen-new.png' });
  } else {
      console.log("Could not find Classic ∞ button.");
  }
  
  await browser.close();
  console.log("Done!");
})();
