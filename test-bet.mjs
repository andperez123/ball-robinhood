import { chromium } from 'playwright';

async function testBet() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  const pages = await contexts[0].pages();
  
  // Find the page with localhost:5173
  let page = pages.find(p => p.url().includes('localhost:5173'));
  
  if (!page) {
    console.log('No localhost:5173 page found, creating new one');
    page = await contexts[0].newPage();
    await page.goto('http://localhost:5173/');
  }
  
  // Wait for page to load
  await page.waitForLoadState('networkidle');
  
  // Take screenshot of initial state
  await page.screenshot({ path: '/tmp/bet-test-initial.png', fullPage: true });
  console.log('Initial screenshot saved to /tmp/bet-test-initial.png');
  
  // Check for the incinerator count
  const incineratorText = await page.locator('text=BALL DESTROYED FOREVER').first().textContent().catch(() => null);
  console.log('Incinerator section found:', incineratorText);
  
  // Find and click the bet button
  const betButton = page.locator('button:has-text("SEND IT TO THE SEWER")');
  const buttonVisible = await betButton.isVisible().catch(() => false);
  console.log('Bet button visible:', buttonVisible);
  
  if (buttonVisible) {
    console.log('Clicking bet button...');
    await betButton.click();
    
    // Wait for confirmation
    await page.waitForTimeout(5000);
    
    // Take screenshot after bet
    await page.screenshot({ path: '/tmp/bet-test-after.png', fullPage: true });
    console.log('After-bet screenshot saved to /tmp/bet-test-after.png');
    
    // Check for confirmation message
    const pageText = await page.content();
    if (pageText.includes('Bet confirmed') || pageText.includes('confirmed')) {
      console.log('SUCCESS: Bet confirmation found!');
    } else {
      console.log('WARNING: No bet confirmation found');
    }
  } else {
    console.log('ERROR: Bet button not visible');
  }
  
  await browser.close();
}

testBet().catch(console.error);
