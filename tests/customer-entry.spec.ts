import {test,expect,type Page} from '@playwright/test';
async function mockAuth(page:Page){
  await page.route('**/src/auth.ts*',route=>route.fulfill({contentType:'application/javascript',body:`
    export async function initializeAuth(){return {};}
    export async function signIn(){sessionStorage.setItem('test.microsoft','requested');}
    export async function signOut(){} export async function signInManagement(){} export async function signOutManagement(){}
    export async function getApiAccessToken(){return 'unused';}
  `}));
}
test('public entry has one Sign in button and no staff link; customer sign-in offers Microsoft and email',async({page})=>{
  await mockAuth(page);await page.goto('/');
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toHaveCount(1);
  await expect(page.locator('a[href="/clientmanagement"]')).toHaveCount(0);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.getByRole('button',{name:'Continue with Microsoft'})).toBeVisible();
  await expect(page.getByLabel('Email address')).toBeVisible();
  await page.screenshot({path:'.azure/browser-results/customer-signin.png',fullPage:true});
  await page.getByRole('button',{name:'Continue with Microsoft'}).click();
  expect(await page.evaluate(()=>sessionStorage.getItem('test.microsoft'))).toBe('requested');
});
test('email registration, session restoration and logout use the account API',async({page})=>{
  await mockAuth(page);let registered=false,revoked=false;
  await page.route('**/api/account/**',async route=>{
    const action=new URL(route.request().url()).pathname.split('/').at(-1);
    if(action==='register'){
      const body=route.request().postDataJSON();expect(body.email).toBe('client@example.test');expect(body.name).toBe('Client');registered=true;
      return route.fulfill({json:{message:'Check your inbox for a verification link.'}});
    }
    if(action==='login')return route.fulfill({json:{token:'a'.repeat(43)}});
    if(action==='logout'){revoked=true;return route.fulfill({json:{message:'Signed out.'}});}
    expect(route.request().headers().authorization).toBe(`Bearer ${'a'.repeat(43)}`);
    return route.fulfill({json:{user:{id:'test',name:'Client',email:'client@example.test'},workspaces:[]}});
  });
  await page.goto('/signin');await page.getByRole('button',{name:'Create account',exact:true}).click();
  await page.getByLabel('Your name').fill('Client');await page.getByLabel('Email address').fill('client@example.test');
  await page.getByLabel('Password',{exact:true}).fill('Long enough passphrase 1!');await page.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('verification link');expect(registered).toBe(true);
  await page.getByRole('button',{name:'Back to sign in'}).click();
  await page.getByLabel('Password',{exact:true}).fill('Long enough passphrase 1!');await page.getByRole('button',{name:'Sign in with email'}).click();
  await expect(page.getByRole('heading',{name:'Welcome, Client'})).toBeVisible();
  await expect(page.getByText('Your email is verified.',{exact:false})).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'Welcome, Client'})).toBeVisible();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Sign in to NSO Audit'})).toBeVisible();expect(revoked).toBe(true);
  expect(await page.evaluate(()=>sessionStorage.getItem('nso.customerSession'))).toBeNull();
});
test('verification links require explicit confirmation and remove the token fragment',async({page})=>{
  await mockAuth(page);let requests=0;
  await page.route('**/api/account/verify',async route=>{
    requests++;expect(route.request().method()).toBe('POST');expect(route.request().postDataJSON().token).toBe('x'.repeat(43));
    await route.fulfill({json:{message:'Email verified. You can now sign in.'}});
  });
  await page.goto(`/account/verify#token=${'x'.repeat(43)}`);
  await expect(page).toHaveURL(/\/account\/verify$/);expect(requests).toBe(0);
  await page.getByRole('button',{name:'Verify email',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Email verified');expect(requests).toBe(1);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('registration and reset reject passwords missing the required character classes',async({page})=>{
  await mockAuth(page);let submissions=0;
  await page.route('**/api/account/**',route=>{submissions++;return route.fulfill({json:{message:'Accepted.'}});});
  await page.goto('/signin');await page.getByRole('button',{name:'Create account',exact:true}).click();
  await page.getByLabel('Your name').fill('Client');await page.getByLabel('Email address').fill('client@example.test');
  for(const invalid of ['onlylowercase123!','ONLYUPPERCASE123!','NoNumbersHere!!!','NoSpecialChars123']){
    await page.getByLabel('Password',{exact:true}).fill(invalid);
    await page.getByRole('button',{name:'Create account',exact:true}).click();
    expect(await page.getByLabel('Password',{exact:true}).evaluate((input:HTMLInputElement)=>input.validity.patternMismatch)).toBe(true);
  }
  expect(submissions).toBe(0);
  await page.goto(`/account/reset#token=${'x'.repeat(43)}`);
  await page.getByLabel('New password',{exact:true}).fill('NoSpecialChars123');
  await page.getByRole('button',{name:'Save new password'}).click();expect(submissions).toBe(0);
  await page.getByLabel('New password',{exact:true}).fill('LongerPassword1!');
  await page.getByRole('button',{name:'Save new password'}).click();await expect(page.getByRole('status')).toContainText('Accepted');expect(submissions).toBe(1);
});
