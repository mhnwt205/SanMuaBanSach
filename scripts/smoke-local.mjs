import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// Only temporary, isolated D1/R2 state is used. No Cloudflare login or remote commands.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const api = join(root, 'apps/api');
const wrangler = join(api, 'node_modules/wrangler/bin/wrangler.js');
const temporary = await mkdtemp(join(tmpdir(), 'cho-sach-smoke-'));
const state = join(temporary, 'state');
const env = {
  ...process.env,
  XDG_CONFIG_HOME: join(temporary, 'config'),
  WRANGLER_SEND_METRICS: 'false',
};
const suffix = randomBytes(8).toString('hex');
const password = randomBytes(24).toString('base64url');
const phone = '0900000000';
let server;
let webServer;
let logs = '';
let checks = 0;

function localD1(args) {
  return execFileSync(
    process.execPath,
    [wrangler, 'd1', ...args, '--local', '--persist-to', state],
    {
      cwd: api,
      env,
      encoding: 'utf8',
      timeout: 60000,
    },
  );
}

try {
  localD1(['migrations', 'apply', 'cho-sach-cu-db']);
  console.log('PASS: migration on isolated local D1');
  const port = await new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const value = probe.address().port;
      probe.close(() => resolvePort(value));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    [
      wrangler,
      'dev',
      '--local',
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
      '--inspector-port',
      '0',
      '--persist-to',
      state,
    ],
    {
      cwd: api,
      env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  server.stdout.on('data', (data) => {
    logs = (logs + data).slice(-12000);
  });
  server.stderr.on('data', (data) => {
    logs = (logs + data).slice(-12000);
  });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null)
      throw new Error(`Local Worker exited before startup. ${logs}`);
    try {
      const response = await fetch(`${base}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* The local Worker may still be starting. */
    }
    await delay(250);
  }
  assert.ok(ready, `Local Worker did not become ready. ${logs}`);

  async function request(path, { method = 'GET', json, cookie, body, headers: customHeaders = {} } = {}) {
    const headers = {...customHeaders};
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    }
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(30000),
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    return { response, data, text };
  }
  function status(result, expected) {
    assert.equal(
      result.response.status,
      expected,
      `Unexpected HTTP status for ${result.response.url}`,
    );
    checks++;
    return result;
  }
  assert.equal(status(await request('/api/listings'),200).data.catalog_empty,true);
  async function account(label) {
    const email = `${label}-${suffix}@example.test`;
    const registration = status(
      await request('/api/auth/register', {
        method: 'POST',
        json: { name: `Test ${label}`, email, password, role: 'admin' },
      }),
      201,
    );
    assert.equal(
      registration.data.user.role,
      'user',
      'Registration must not permit role escalation',
    );
    const login = status(
      await request('/api/auth/login', {
        method: 'POST',
        json: { email, password },
      }),
      200,
    );
    const header = login.response.headers.get('set-cookie');
    assert.match(header, /HttpOnly/i);
    assert.match(header, /SameSite=Lax/i);
    return {
      id: registration.data.user.id,
      email,
      cookie: header.split(';')[0],
    };
  }
  status(await request('/api/auth/me'), 401);
  status(await request('/api/listings/unknown/contact'), 401);
  status(await request('/api/listings', { method: 'POST', json: {} }), 401);
  const admin = await account('admin');
  const seller = await account('seller');
  const buyer = await account('buyer');
  status(
    await request('/api/auth/register', {
      method: 'POST',
      json: { name: 'Duplicate fixture', email: buyer.email, password },
    }),
    409,
  );
  status(await request('/api/admin/listings', { cookie: seller.cookie }), 403);
  status(
    await request('/api/listings', {
      method: 'POST',
      cookie: seller.cookie,
      json: {},
    }),
    403,
  );
  status(
    await request('/api/auth/login', {
      method: 'POST',
      json: { email: buyer.email, password: 'invalid-password' },
    }),
    401,
  );
  status(
    await request('/api/images', { method: 'POST', cookie: buyer.cookie }),
    403,
  );
  console.log(
    'PASS: registration, password login, HttpOnly sessions, user/admin boundaries',
  );

  // Bootstrap only the admin fixture in this newly created test database.
  assert.match(admin.id, /^[0-9a-f-]{36}$/);
  localD1([
    'execute',
    'cho-sach-cu-db',
    '--command',
    `UPDATE users SET role='admin',is_super_admin=1 WHERE id='${admin.id}'`,
  ]);
  status(
    await request('/api/seller/applications', {
      method: 'POST',
      cookie: seller.cookie,
      json: { phone, note: 'Local smoke fixture' },
    }),
    201,
  );
  status(
    await request('/api/seller/applications', {
      method: 'POST',
      cookie: seller.cookie,
      json: { phone },
    }),
    409,
  );
  const pending = status(
    await request('/api/seller/applications/me', { cookie: seller.cookie }),
    200,
  ).data.application;
  assert.equal(pending.status, 'pending');
  status(
    await request(`/api/admin/seller-applications/${pending.id}/decision`, {
      method: 'POST',
      cookie: buyer.cookie,
      json: { decision: 'approved' },
    }),
    403,
  );
  status(
    await request(`/api/admin/seller-applications/${pending.id}/decision`, {
      method: 'POST',
      cookie: admin.cookie,
      json: { decision: 'approved' },
    }),
    200,
  );
  assert.equal(
    status(await request('/api/auth/me', { cookie: seller.cookie }), 200).data
      .user.role,
    'seller',
  );
  console.log('PASS: seller application and admin approval');
  assert.equal(
    status(await request('/api/capabilities'), 200).data.image_uploads,
    true,
  );
  status(
    await request('/api/account', {
      method: 'PATCH',
      json: { name: 'Blocked' },
    }),
    401,
  );
  status(await request('/api/seller/listings', { cookie: buyer.cookie }), 403);
  status(await request('/api/admin/users', { cookie: buyer.cookie }), 403);
  const profile = status(
    await request('/api/account', {
      method: 'PATCH',
      cookie: buyer.cookie,
      json: { name: 'Updated Buyer', role: 'admin', email: seller.email },
    }),
    200,
  );
  assert.equal(profile.data.user.name, 'Updated Buyer');
  assert.equal(profile.data.user.role, 'user');
  assert.equal(profile.data.user.email, buyer.email);
  assert.match(
    profile.response.headers.get('cache-control'),
    /private, no-store/,
  );
  const users = status(
    await request('/api/admin/users', { cookie: admin.cookie }),
    200,
  );
  assert.equal(users.data.items.length, 3);
  assert.ok(!users.text.includes('password_hash'));
  status(await request(`/api/sellers/${buyer.id}`), 404);

  const badImage = new FormData();
  badImage.append(
    'file',
    new Blob(['not an image'], { type: 'image/png' }),
    'spoof.png',
  );
  status(
    await request('/api/images', {
      method: 'POST',
      cookie: seller.cookie,
      body: badImage,
    }),
    415,
  );
  const image = new FormData();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrS8AAAAASUVORK5CYII=',
    'base64',
  );
  image.append('file', new Blob([png], { type: 'image/png' }), 'cover.png');
  const uploaded = status(
    await request('/api/images', {
      method: 'POST',
      cookie: seller.cookie,
      body: image,
    }),
    201,
  ).data;
  const served = status(await request(uploaded.url), 200);
  assert.equal(served.response.headers.get('content-type'), 'image/png');
  assert.equal(
    served.response.headers.get('x-content-type-options'),
    'nosniff',
  );
  status(
    await request(uploaded.url, { method: 'DELETE', cookie: buyer.cookie }),
    403,
  );
  console.log(
    'PASS: local R2 upload/download, image signature and ownership checks',
  );

  const secondImage = new FormData();
  secondImage.append('file', new Blob([png], {type:'image/png'}), 'back.png');
  const secondUploaded = status(await request('/api/images', {method:'POST', cookie:seller.cookie, body:secondImage}),201).data;
  const book = {
    title: `Smoke ${suffix}`,
    author: 'Local test author',
    price: 42000,
    condition: 'good',
    category: 'Văn học',
    city: 'Hà Nội',
    description: 'Isolated local fixture',
    image_keys: [uploaded.key, secondUploaded.key],
  };
  status(
    await request('/api/listings', {
      method: 'POST',
      cookie: seller.cookie,
      json: { ...book, price: -1 },
    }),
    400,
  );
  for (const keys of [[], [uploaded.key], [uploaded.key, uploaded.key], Array.from({length:6},(_,i)=>`${seller.id}/test-${i}.png`)]) {
    status(await request('/api/listings', {method:'POST', cookie:seller.cookie, json:{...book,image_keys:keys}}),400);
  }
  const listing = status(
    await request('/api/listings', {
      method: 'POST',
      cookie: seller.cookie,
      json: book,
    }),
    201,
  ).data;
  assert.equal(listing.status, 'pending');
  const owned = status(
    await request('/api/seller/listings', { cookie: seller.cookie }),
    200,
  );
  assert.equal(owned.data.items[0].id, listing.id);
  assert.equal(owned.data.items[0].status, 'pending');
  assert.equal(
    status(await request('/api/seller/listings', { cookie: admin.cookie }), 200)
      .data.items.length,
    0,
  );
  assert.equal(
    status(await request(`/api/sellers/${seller.id}`), 200).data.items.length,
    0,
  );

  status(await request(`/api/listings/${listing.id}`), 404);
  assert.equal(
    status(await request('/api/listings'), 200).data.items.length,
    0,
  );
  status(
    await request(`/api/listings/${listing.id}/contact`, {
      cookie: buyer.cookie,
    }),
    404,
  );
  status(
    await request(`/api/admin/listings/${listing.id}/decision`, {
      method: 'POST',
      cookie: seller.cookie,
      json: { decision: 'active' },
    }),
    403,
  );
  status(
    await request(`/api/admin/listings/${listing.id}/decision`, {
      method: 'POST',
      cookie: admin.cookie,
      json: { decision: 'active' },
    }),
    200,
  );
  const adminCatalog = status(
    await request('/api/admin/listings?status=all&limit=1', {
      cookie: admin.cookie,
    }),
    200,
  );
  assert.equal(adminCatalog.data.items[0].id, listing.id);
  assert.equal(adminCatalog.data.total, 1);
  assert.match(
    adminCatalog.response.headers.get('cache-control'),
    /private, no-store/,
  );
  assert.equal(
    status(
      await request('/api/admin/listings?status=pending', {
        cookie: admin.cookie,
      }),
      200,
    ).data.total,
    0,
  );
  assert.equal(
    status(
      await request(`/api/admin/listings?status=active&q=${suffix}`, {
        cookie: admin.cookie,
      }),
      200,
    ).data.items[0].id,
    listing.id,
  );
  assert.equal(
    status(
      await request('/api/admin/listings?status=all&page=2&limit=1', {
        cookie: admin.cookie,
      }),
      200,
    ).data.items.length,
    0,
  );
  status(
    await request('/api/admin/listings?status=unknown', {
      cookie: admin.cookie,
    }),
    400,
  );
  status(
    await request('/api/admin/listings?status=all', { cookie: buyer.cookie }),
    403,
  );
  const detail = status(await request(`/api/listings/${listing.id}`), 200);
  const store = status(await request(`/api/sellers/${seller.id}`), 200);
  assert.equal(store.data.items[0].id, listing.id);
  assert.ok(!store.text.includes(phone));
  assert.ok(!store.text.includes(seller.email));
  assert.ok(!store.text.includes('password_hash'));

  const found = status(
    await request(
      `/api/listings?q=${suffix}&category=${encodeURIComponent('Văn học')}&sort=price_asc`,
    ),
    200,
  );
  assert.equal(found.data.items[0].id, listing.id);
  assert.equal(found.data.items[0].price, 42000);
  for (const result of [detail, found]) {
    assert.ok(
      !result.text.includes(phone),
      'Public listing must not expose a phone',
    );
    assert.ok(
      !result.text.includes(seller.email),
      'Public listing must not expose seller email',
    );
    assert.ok(
      !result.text.includes('password_hash'),
      'Public listing must not expose password hashes',
    );
  }
  status(await request(`/api/listings/${listing.id}/contact`), 401);
  const contact = status(
    await request(`/api/listings/${listing.id}/contact`, {
      cookie: buyer.cookie,
    }),
    200,
  );
  assert.equal(contact.data.phone, phone);
  assert.match(
    contact.response.headers.get('cache-control'),
    /private, no-store/,
  );
  const { runCmsChecks } = await import('./cms-checks.mjs');
  const cmsFixtures = await runCmsChecks({
    request,
    status,
    account,
    admin,
    seller,
    buyer,
    book,
    listing,
    password,
    suffix,
  });
  const {runSellerChecks} = await import('./seller-checks.mjs');
  await runSellerChecks({request,status,account,seller,buyer,admin,book,suffix});
  const {runAccountChecks} = await import('./account-checks.mjs');
  await runAccountChecks({request,status,account,password,seller,admin});
  const { runReportChecks } = await import('./report-checks.mjs');
  const reportFixture = await runReportChecks({ request,status,account,admin,seller,buyer,book,suffix });
  const {runExperienceChecks}=await import('./experience-checks.mjs');
  await runExperienceChecks({request,status,admin,seller,book,suffix});
  const {runOperationsChecks}=await import('./operations-checks.mjs');
  await runOperationsChecks({request,status,account,seller,admin,book,suffix,localD1});
  if (process.argv.includes('--ui') || process.argv.includes('--ui-fast') || process.argv.includes('--reports-ui') || process.argv.includes('--experience-ui')) {
    const webPort = await new Promise((resolvePort) => {
      const probe = createServer();
      probe.listen(0, '127.0.0.1', () => {
        const number = probe.address().port;
        probe.close(() => resolvePort(number));
      });
    });
    const viteModule = join(
      root,
      'apps/web/node_modules/vite/dist/node/index.js',
    );
    // Serve the production build; preserve SPA fallback and proxy to the isolated Worker.
    const program = `import {preview} from ${JSON.stringify(viteModule)}; await preview({root:${JSON.stringify(join(root, 'apps/web'))},configFile:false,preview:{host:'127.0.0.1',port:${webPort},strictPort:true,proxy:{'/api':${JSON.stringify(base)}}}});`;
    webServer = spawn(
      process.execPath,
      ['--input-type=module', '-e', program],
      { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    webServer.stdout.on('data', () => {});
    webServer.stderr.on('data', () => {});
    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        if ((await fetch(`http://127.0.0.1:${webPort}`)).ok) break;
      } catch {}
      await delay(250);
    }
    // UI logout must revoke its own session, not the API assertions' session.
    const adminUiLogin = status(
      await request('/api/auth/login', {
        method: 'POST',
        json: { email: admin.email, password },
      }),
      200,
    );
    const adminUiCookie = adminUiLogin.response.headers
      .get('set-cookie')
      .split(';')[0];
    if (!process.argv.includes('--reports-ui') && !process.argv.includes('--experience-ui')) execFileSync(
      'python3',
      [
        '-u',
        join(root, 'scripts/check-ui.py'),
        `http://127.0.0.1:${webPort}`,
        '--fixture',
        ...(process.argv.includes('--ui-fast') ? ['--fixture-only'] : []),
        '--output-dir',
        join(root, '../SanMuaBanSach-artifacts/fixture-ui'),
      ],
      {
        cwd: root,
        stdio: 'inherit',
        timeout: 360000,
        env: {
          ...env,
          UI_REPORT_LISTING_ID: reportFixture.listingId,
          UI_REPORT_STAFF_COOKIE: reportFixture.cookie,
          UI_BUYER_COOKIE: buyer.cookie,
          UI_LISTING_ID: listing.id,
          UI_BUYER_EMAIL: buyer.email,
          UI_ADMIN_EMAIL: admin.email,
          UI_STAFF_EMAIL: cmsFixtures.staff.email,
          UI_PASSWORD: password,
          UI_SELLER_COOKIE: seller.cookie,
          UI_ADMIN_COOKIE: adminUiCookie,
        },
      },
    );
    if (!process.argv.includes('--experience-ui')) execFileSync('python3', ['-u',join(root,'scripts/check-ui.py'),`http://127.0.0.1:${webPort}`,'--reports-only','--output-dir','/tmp/cho-sach-reports-ui'], {
      cwd:root,stdio:'inherit',timeout:180000,env:{...env,UI_REPORT_LISTING_ID:reportFixture.listingId,UI_REPORT_STAFF_COOKIE:reportFixture.cookie,UI_BUYER_COOKIE:buyer.cookie},
    });
    if (process.argv.includes('--experience-ui')) execFileSync('python3',['-u',join(root,'scripts/check-experience.py'),`http://127.0.0.1:${webPort}`],{cwd:root,stdio:'inherit',timeout:240000,env});
  }
  status(
    await request('/api/auth/logout', { method: 'POST', cookie: buyer.cookie }),
    200,
  );
  status(
    await request(`/api/listings/${listing.id}/contact`, {
      cookie: buyer.cookie,
    }),
    401,
  );
  console.log(
    'PASS: pending/approved visibility, search, phone protection and session revocation',
  );

  const rejected = status(
    await request('/api/listings', {
      method: 'POST',
      cookie: seller.cookie,
      json: book,
    }),
    201,
  ).data;
  status(
    await request(`/api/admin/listings/${rejected.id}/decision`, {
      method: 'POST',
      cookie: admin.cookie,
      json: { decision: 'rejected', note: 'Mô tả sách cần bổ sung' },
    }),
    200,
  );
  status(await request(`/api/listings/${rejected.id}`), 404);
  status(
    await request(uploaded.url, { method: 'DELETE', cookie: seller.cookie }),
    409,
  );
  console.log(
    `PASS: ${checks} HTTP checks plus data/privacy assertions. No remote resources accessed.`,
  );
} finally {
  if (webServer && webServer.exitCode === null) webServer.kill('SIGTERM');
  if (server && server.exitCode === null) {
    const exited = new Promise((resolveExit) =>
      server.once('exit', resolveExit),
    );
    if (process.platform === 'win32') server.kill('SIGTERM');
    else {
      try {
        process.kill(-server.pid, 'SIGTERM');
      } catch {
        /* Already exited. */
      }
    }
    await Promise.race([exited, delay(3000)]);
  }
  await rm(temporary, { recursive: true, force: true, maxRetries: 3 });
}
