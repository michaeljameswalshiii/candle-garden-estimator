import { chromium, expect } from '@playwright/test';

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.addInitScript(()=>{
  sessionStorage.setItem('cg_access_token','ui-access');sessionStorage.setItem('cg_id_token','ui-id');
  sessionStorage.setItem('cg_expires_at',String(Date.now()+3600000));
  sessionStorage.setItem('cg_cart_v1',JSON.stringify([{key:'product::ui::10oz',type:'product',productId:'ui',name:'Test candle',size:'10oz',quantity:1,unitPrice:35}]));
});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://**/*', async route=>{
 const url=route.request().url(); const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 if(url.includes('cognito-idp')) return send({Username:'ui-buyer',UserAttributes:[{Name:'sub',Value:'ui-account'},{Name:'name',Value:'Alex Buyer'},{Name:'email',Value:'buyer@example.com'},{Name:'phone_number',Value:'+19045551212'},{Name:'address',Value:'363 Atlantic Boulevard, Suite 8, Atlantic Beach, FL 32233'}]});
 if(url.includes('zippopotam')) return send({places:[{'place name':'Atlantic Beach','state abbreviation':'FL'}]});
 if(url.includes('candle-garden-web.vercel.app') || url.includes('execute-api')) {
   if(url.endsWith('/orders')) return send([{id:'ui-history',status:'paid',created_at:'2026-10-14',total_amount:95.62,customer_email:'stale@example.com',shipping:{name:'Previous Buyer',phone:'5551112222',email:'old@example.com',address:'1 Previous Street',city:'Boston',state:'MA',zip:'02108'},shipping_labels:[{key:'empties_in',labelUrl:'https://example.com/empties.pdf',trackingNumber:'1Z999'}]}]);
   if(url.endsWith('/payments/validate-address')) return send({valid:true,address:{street:'363 Atlantic Blvd Ste 8',city:'Atlantic Beach',state:'FL',zip:'32233'}});
   if(url.includes('/catalog')) return send({products:[]});
   if(url.includes('/classes')) return send({classes:[]});
   return send({});
 }
 return route.continue();
});
try {
 await page.goto(process.env.CHECKOUT_UI_BASE_URL || 'http://127.0.0.1:18765',{waitUntil:'domcontentloaded'});
 await page.getByRole('tab',{name:/Cart/}).click();
 await expect(page.getByRole('link',{name:'Triple I Business Solutions'})).toBeVisible();
 await page.getByText('Checkout with my account',{exact:true}).click();
 await expect(page.getByText('buyer@example.com')).toBeVisible();
 await expect(page.getByText('(904) 555-1212')).toBeVisible();
 await expect(page.getByPlaceholder('Phone',{exact:true})).toHaveCount(0);
 await expect(page.getByPlaceholder('Email',{exact:true})).toHaveCount(0);
 await expect(page.getByPlaceholder('Street address',{exact:true})).toHaveValue('363 Atlantic Boulevard, Suite 8');
 await expect(page.getByPlaceholder('City',{exact:true})).toHaveValue('Atlantic Beach');
 await page.getByText('Use previous order address',{exact:true}).click();
 await expect(page.getByPlaceholder('Street address',{exact:true})).toHaveValue('1 Previous Street');
 await expect(page.getByText('buyer@example.com')).toBeVisible();
 await expect(page.getByText('(904) 555-1212')).toBeVisible();
 await expect(page.getByText('5551112222')).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Print empties label/})).toBeVisible();
 await page.getByRole('textbox',{name:'Full US address lookup'}).fill('363 Atlantic Boulevard, Suite 8, Atlantic Beach, FL 32233');
 await page.getByRole('button',{name:'Find and check address',exact:true}).click();
 await expect(page.getByPlaceholder('Street address',{exact:true})).toHaveValue('363 Atlantic Blvd Ste 8');
 await page.getByPlaceholder('Street address',{exact:true}).fill('363 Atlantic Blvd Ste 9');
 await expect(page.getByPlaceholder('Street address',{exact:true})).toHaveValue('363 Atlantic Blvd Ste 9');
 await page.screenshot({path:'test-results/checkout-address-mobile.png',fullPage:true});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error('Horizontal overflow');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: account prefill, previous order selection, full-address lookup, editable correction, mobile layout.');
} catch(e) { console.log(await page.locator('body').innerText());throw e; }
finally {await browser.close();}


