const { chromium } = require('playwright');

(async () => {
  console.log("Launching browser...");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  console.log("Navigating to http://localhost:8085 ...");
  await page.goto('http://localhost:8085', { waitUntil: 'networkidle', timeout: 15000 });
  
  const classicButton = await page.$('text=Classic ∞');
  if (classicButton) {
      await classicButton.click();
      console.log("Waiting for game to load...");
      await page.waitForTimeout(2000); // Wait for transition
      
      // Attempt to drag the first hand piece to the board
      // Playwright uses mouse movements to drag and drop
      console.log("Finding hand pieces...");
      
      const boundingBox = await page.evaluate(() => {
          // Find the hand container and the board
          // This relies on basic layout knowledge, since we don't have testIDs
          // Let's just find the first draggable piece.
          // In React Native Web, Dnd components usually have specific data attributes or just bounding boxes.
          return null; // A bit complex to guess selectors without test IDs
      });
      
      // We will just do a simple mouse drag from bottom center to middle center
      console.log("Simulating drag and drop...");
      const { width, height } = page.viewportSize();
      await page.mouse.move(width / 2, height - 100); // Hand piece area
      await page.mouse.down();
      await page.mouse.move(width / 2, height / 2, { steps: 20 }); // Board area
      await page.mouse.up();
      
      console.log("Waiting for score popup animation...");
      await page.waitForTimeout(500); // Wait for popup
      
      await page.screenshot({ path: 'game-screen-placed.png' });
      console.log("Screenshot taken: game-screen-placed.png");
  } else {
      console.log("Could not find Classic ∞ button.");
  }
  
  await browser.close();
  console.log("Done!");
})();
