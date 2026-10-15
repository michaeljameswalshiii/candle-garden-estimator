import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const products = JSON.parse(await fs.readFile('packages/catalog/products.json', 'utf8'));
let paid = false;
let creations = 0;
await page.route('https://**/*', async route => {
  const url = route.request().url();
  if (url.startsWith('https://js.stripe.com/')) return route.fulfill({ contentType: 'text/javascript', body:
    `window.Stripe = function() { return { elements: function() { return { create: function() { return { mount: function(host) { host.textContent = 'Secure test payment'; }, destroy: function() {} }; } }; }, confirmPayment: async function() { return {}; } }; };` });
  if (url.includes('execute-api') || url.includes('candle-garden-web.vercel.app/api/')) {
    let data = {};
    if (url.includes('/api/mobile/catalog')) data = { products };
    else if (url.includes('/api/mobile/classes')) data = { classes: [] };
    else if (url.endsWith('/orders')) data = [];
    else if (url.endsWith('/payments/payment-sheet')) {
      const body = route.request().postDataJSON();
      if (body.items[0].type === 'gift_card') {
        if (body.items[0].giftAmount !== 500) throw new Error('Unexpected gift purchase');
        creations++;
        data = { orderId: 'ui-order', checkoutToken: 'ui-token', paymentIntentId: 'pi_ui', paymentIntentClientSecret: 'pi_ui_secret', amount: 50000 };
      } else {
        if (!body.giftCardCode) throw new Error('Missing gift card redemption');
        data = { orderId: 'ui-redemption', checkoutToken: 'ui-redeem-token', amount: 0, totalCents: 3500, giftCardCents: 3500, giftCardOnly: true };
      }
    } else if (url.endsWith('/payments/finalize')) data = { paid, orderId: 'ui-order' };
    else if (url.endsWith('/payments/gift-card-status')) data = { paid, emailSent: true };
    else if (url.endsWith('/payments/gift-card-balance')) data = { balanceCents: 25000 };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  }
  return route.continue();
});
await page.goto(process.env.GIFT_UI_BASE_URL || 'http://127.0.0.1:8091', { waitUntil: 'networkidle' });
const shop = page.getByRole('tab', { name: 'Shop' });
await shop.click();
await page.getByRole('button', { name: 'Give a gift card, $25 to $500' }).click();
await page.getByRole('radio', { name: '$500', exact: true }).click();
await page.getByRole('radio', { name: 'Send to someone', exact: true }).click();
await page.screenshot({ path: 'test-results/gift-card-mobile-overview.png', fullPage: true });
await page.getByRole('textbox', { name: 'Your email (receipt)', exact: true }).fill('buyer@example.com');
await page.getByRole('textbox', { name: 'Recipient email', exact: true }).fill('recipient@example.com');
await page.getByRole('textbox', { name: 'Personal message (optional)', exact: true }).fill('Enjoy a little Candle Garden joy!');
await page.screenshot({ path: 'test-results/gift-card-mobile-purchase.png', fullPage: true });
if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('Mobile page overflows horizontally');
await page.getByRole('button', { name: 'Continue to payment · $500', exact: true }).click();
try { await page.getByRole('button', { name: 'Pay test order', exact: true }).waitFor({ timeout: 10000 }); }
catch (error) { console.log('After checkout:', await page.locator('body').innerText(), 'Errors:', errors); throw error; }
paid = true;
await page.getByRole('button', { name: 'Pay test order', exact: true }).click();
await page.getByText('The gift card email has been sent.', { exact: true }).waitFor();
await page.screenshot({ path: 'test-results/gift-card-mobile-success.png', fullPage: true });
if (creations !== 1) throw new Error(`Checkout created ${creations} times`);
await page.getByRole('button', { name: 'Done', exact: true }).click();
await page.getByText('View scent & sizes', { exact: true }).first().click();
await page.getByText('Add to cart', { exact: true }).click();
await page.getByRole('tab', { name: /Cart/ }).click();
await page.getByRole('button', { name: 'Have a gift card?' }).click();
await page.getByRole('textbox', { name: 'Gift card code' }).fill('ABCD-ABCD-ABCD-ABCD-ABCD-ABCD-ABCD-ABCD');
await page.getByRole('button', { name: 'Check balance & use card' }).click();
await page.getByText(/\$250.00 available/).waitFor();
await page.screenshot({ path: 'test-results/gift-card-mobile-redemption.png', fullPage: true });
await page.getByText('Checkout as guest', { exact: true }).click();
for (const [placeholder, value] of [['Name', 'Gift Recipient'], ['Email', 'customer@example.com'], ['Phone', '9045551212'],
  ['Street address', '123 Test Street'], ['City', 'Atlantic Beach'], ['State', 'FL'], ['ZIP', '32233']]) {
  await page.getByPlaceholder(placeholder, { exact: true }).fill(value);
}
await page.getByText('Continue to payment', { exact: true }).click();
await page.getByText('PAYMENT CONFIRMED', { exact: true }).waitFor();
// The existing web AuthContext attempts native SecureStore cleanup on startup.
const newErrors = errors.filter(error => !error.includes('deleteValueWithKeyAsync is not a function'));
if (newErrors.length) throw new Error(newErrors.join('\n'));
console.log('Mobile $500 gift purchase, email confirmation, balance lookup, and fully covered redemption passed.');
if (errors.length) console.log('Existing web auth storage warning observed:', errors[0]);
await browser.close();
