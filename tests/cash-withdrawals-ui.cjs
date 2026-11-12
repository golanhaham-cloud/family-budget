// Synthetic-only browser regression for dated cash withdrawals. Optional runner:
// npm install --no-save --package-lock=false playwright; node tests/cash-withdrawals-ui.cjs
const {chromium}=require('playwright');
const fs=require('fs');const assert=require('assert');const http=require('http');const path=require('path');
const base=path.join(__dirname,'../public');
const server=http.createServer((req,res)=>{const f=path.join(base, req.url==='/'?'index.html':req.url);try{res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(f));}catch{res.statusCode=404;res.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({serviceWorkers:'block',viewport:{width:390,height:844}}); const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message)});
let data={categories:[{id:'c1',name:'סופר ומזון',icon:'🛒',active:true}],budgets:{'2026-11':{c1:7200}},expenses:[],fixedExpenses:[],incomeEntries:[],recurringIncomes:[],plannedExpenses:[],cashWithdrawals:[],settings:{openingBalance:10000,openingBalanceDate:'2026-11-01',creditBillingDay:1,cards:[],cashBudgets:{'2026-11':1000},variableOverrides:{}}};let version=1;
await page.context().route('**/api/**',async route=>{if(route.request().method()==='PUT'){let b=route.request().postDataJSON();assert.equal(b.baseVersion,version);data=b.data;version++;return route.fulfill({json:{version}});}return route.fulfill({json:{data,version,household:{key:'synthetic',name:'בדיקה בלבד'},admin:false,adviceEnabled:false}});});
async function login(){await page.getByPlaceholder('הקלד/י את שמך').fill('בדיקת ממשק');await page.getByRole('button',{name:'כניסה',exact:true}).click();}
async function forecast(){await page.getByRole('button',{name:'📈 תחזית',exact:true}).click();}
async function novText(){const b=page.getByRole('button').filter({hasText:'נובמבר 2026'}).first();if(await b.getAttribute('aria-expanded')!=='true')await b.click();return page.locator('body').innerText();}
async function novRow(){const t=await page.getByRole('button').filter({hasText:'נובמבר 2026'}).first().innerText();return t;}
async function assertNovChange(amount){const r=await novRow();assert(r.includes(amount),'November change should be '+amount+' but row is: '+JSON.stringify(r));}
async function addWithdrawal(amount,date,note){const b=page.getByRole('button',{name:/משיכות מזומן/}).first();if(await b.getAttribute('aria-expanded')!=='true')await b.click();await page.getByLabel('סכום המשיכה').fill(String(amount));await page.getByLabel('תאריך המשיכה').fill(date);if(note)await page.getByLabel('הערה למשיכה').fill(note);await page.getByRole('button',{name:'＋ הוספת משיכה',exact:true}).click();}
await page.goto(`http://127.0.0.1:${server.address().port}`);await login();await forecast();

// ללא משיכות: נובמבר = 6,200 אשראי + 1,000 מזומן מפוזר = שינוי חודשי 7,200-
let t=await novText();
await assertNovChange('7,200');assert(!t.includes('🏧 משיכת מזומן'),'no withdrawal rows before adding');

// משיכה 350 ב־12.11: ירידה ביום המשיכה, ההערכה המפוזרת 650, סכום החודש לא משתנה (אין ספירה כפולה)
await addWithdrawal(350,'2026-11-12','בדיקה בלבד');
await page.getByText('🏧 משיכת מזומן · בדיקה בלבד').waitFor();
assert.equal(data.cashWithdrawals.length,1);assert.equal(data.cashWithdrawals[0].amount,350);assert.equal(data.cashWithdrawals[0].date,'2026-11-12');
t=await novText();
assert(t.includes('🏧 משיכות מזומן'),'withdrawal block in month detail');
assert(t.includes('650 ₪'),'spread estimate reduced to 650');
await assertNovChange('7,200');
await page.screenshot({path:'/downloads/withdrawal-350-mobile.png',fullPage:true});

// הוצאה בפועל לא משנה את יתרת הבנק בתחזית
await page.getByRole('button',{name:'▦ ראשי',exact:true}).click();
await page.getByRole('button',{name:'הוצאה חדשה',exact:true}).click();
await page.getByRole('spinbutton').first().fill('100');
await page.getByRole('button',{name:'שמירה',exact:true}).click();
await page.waitForTimeout(500);assert.equal(data.expenses.length,1);
await forecast();t=await novText();
await assertNovChange('7,200');

// משיכה נוספת 200 בסוף החודש (28.11): אירוע ביום 28, הערכה 450, סכום החודש עדיין 7,200
await addWithdrawal(200,'2026-11-28');
await page.getByText('28', {exact:true}).first().waitFor();
t=await novText();
assert(t.includes('450 ₪'),'spread estimate 450 after two withdrawals');
await assertNovChange('7,200');
const i12=t.indexOf('🏧 משיכת מזומן');const i28=t.lastIndexOf('🏧 משיכת מזומן');assert(i12!==-1&&i28>i12,'two dated events');

// משיכה 700 מעבר לתקציב (סה"כ 1,250): ההערכה מתאפסת, העודף יורד — החודש 7,450-
await addWithdrawal(700,'2026-11-05');
await page.waitForTimeout(500);t=await novText();
await assertNovChange('7,450');
assert(!t.includes('מזומן/ביט (יורד מהבנק באותו חודש)'),'estimate floored at zero - spread line hidden');
await page.screenshot({path:'/downloads/withdrawal-over-budget-mobile.png',fullPage:true});

// מחיקת משיכה מחזירה את החשבון
page.on('dialog',d=>d.accept());
await page.getByRole('button',{name:/מחיקת משיכה/}).first().click();
await page.waitForTimeout(500);t=await novText();
await assertNovChange('7,250');assert.equal(data.cashWithdrawals.length,2);

// שרידות אחרי רענון
await page.reload();await page.getByRole('button',{name:'בדיקת ממשק',exact:true}).click();await forecast();
await page.getByRole('button',{name:/משיכות מזומן \(2\)/}).waitFor();
await novText();await assertNovChange('7,250');
await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'/downloads/withdrawals-desktop.png',fullPage:true});
assert.deepEqual(errors,[]);
console.log('PASS: dated withdrawal on its day, offset without double count, late-month and over-budget withdrawals, expense entry does not move forecast, delete, persistence, mobile+desktop, no JS errors');
await browser.close();server.close();})().catch(e=>{console.error(e);server.close();process.exit(1)});
