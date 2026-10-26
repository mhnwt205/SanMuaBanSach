import assert from 'node:assert/strict';
export async function runCmsChecks({
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
}) {
  const a = admin.cookie;
  const cmsImages = [];
  for (let index = 0; index < 5; index++) {
    const image = new FormData();
    image.append('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5V8AAAAASUVORK5CYII=', 'base64')], {type:'image/png'}), 'cms.png');
    cmsImages.push(status(await request('/api/images', {method:'POST', cookie:a, body:image}),201).data.key);
  }

  const get = async (path, cookie = a) =>
    status(await request(path, { cookie }), 200).data;
  const post = async (path, json, cookie = a, expected = 200) =>
    status(await request(path, { method: 'POST', json, cookie }), expected)
      .data;
  const patch = async (path, json, cookie = a, expected = 200) =>
    status(await request(path, { method: 'PATCH', json, cookie }), expected)
      .data;
  const put = async (path, json, cookie = a, expected = 200) =>
    status(await request(path, { method: 'PUT', json, cookie }), expected).data;
  const trash = async (path, row, cookie = a, expected = 200) =>
    status(
      await request(path, {
        method: 'DELETE',
        json: { version: row.version },
        cookie,
      }),
      expected,
    ).data;
  const category = (
    await post(
      '/api/admin/categories',
      { name: `Test ${suffix}`, description: 'Isolated category' },
      a,
      201,
    )
  ).id;
  const categories = () => get('/api/admin/categories?limit=100');
  const cat = (await categories()).items.find((row) => row.id === category);
  await patch(`/api/admin/categories/${category}`, {
    name: `Updated ${suffix}`,
    version: cat.version,
  });
  await patch(
    `/api/admin/categories/${category}`,
    { name: 'Stale overwrite', version: cat.version },
    a,
    409,
  );
  const changedCat = (await categories()).items.find(
    (row) => row.id === category,
  );
  assert.equal(changedCat.name, `Updated ${suffix}`);
  await post(
    '/api/admin/catalog',
    { ...book, image_keys: cmsImages, seller_id: buyer.id, category: changedCat.name },
    a,
    400,
  );
  for (const keys of [[], cmsImages.slice(0,1), [...cmsImages,cmsImages[0]], [cmsImages[0],cmsImages[0]]]) {
    await post('/api/admin/catalog', {...book, seller_id:seller.id, category:changedCat.name, image_keys:keys}, a, 400);
  }
  const created = await post(
    '/api/admin/catalog',
    {
      ...book,
      image_keys: cmsImages,
      seller_id: seller.id,
      category: changedCat.name,
      status: 'active',
      image_keys: cmsImages,
    },
    a,
    201,
  );
  const catalog = async (id = created.id) =>
    (await get('/api/admin/catalog?limit=100')).items.find(
      (row) => row.id === id,
    );
  let item = await catalog();
  assert.equal(item.status, 'pending');
  assert.equal(JSON.parse(item.image_keys).length, 5);
  status(await request(`/api/listings/${item.id}`), 404);
  await post(`/api/admin/listings/${item.id}/decision`, {
    decision: 'active',
    version: item.version,
  });
  status(await request(`/api/listings/${item.id}`), 200);
  item = await catalog();
  await patch(`/api/admin/catalog/${item.id}`, {
    ...book,
    image_keys: cmsImages,
    title: 'Edited CMS fixture',
    price: book.price,
    category: changedCat.name,
    version: item.version,
    status: 'active',
  });
  status(await request(`/api/listings/${item.id}`), 404);
  const edited = await catalog();
  assert.equal(edited.status, 'pending');
  await patch(
    `/api/admin/catalog/${item.id}`,
    {
      ...book,
      image_keys: cmsImages,
      category: changedCat.name,
      version: item.version,
    },
    a,
    409,
  );
  await trash(`/api/admin/catalog/${item.id}`, edited);
  assert.equal(await catalog(), undefined);
  status(
    await request(`/api/listings/${item.id}/contact`, { cookie: buyer.cookie }),
    404,
  );
  const deleted = (await get('/api/admin/catalog?trash=1')).items.find(
    (row) => row.id === item.id,
  );
  assert.ok(deleted);
  await post(`/api/admin/catalog/${item.id}/restore`, {
    version: deleted.version,
  });
  assert.equal((await catalog()).status, 'pending');
  await trash(`/api/admin/categories/${category}`, changedCat);
  assert.ok(
    !(await get('/api/categories')).items.some((row) => row.id === category),
  );
  const trashedCategory = (
    await get('/api/admin/categories?trash=1')
  ).items.find((row) => row.id === category);
  await post(`/api/admin/categories/${category}/restore`, {
    version: trashedCategory.version,
  });
  assert.ok(
    (await get('/api/categories')).items.some((row) => row.id === category),
  );
  console.log(
    'PASS: CMS create/edit, stale-version protection, trash/restore, private pending listings, category CRUD',
  );

  const createdUser = await post(
    '/api/admin/users',
    {
      name: 'CMS created User',
      email: `cms-created-${suffix}@example.test`,
      password,
      role: 'admin',
      is_super_admin: 1,
    },
    a,
    201,
  );
  const newLogin = status(
    await request('/api/auth/login', {
      method: 'POST',
      json: { email: `cms-created-${suffix}@example.test`, password },
    }),
    200,
  );
  assert.equal(newLogin.data.user.id, createdUser.id);
  assert.equal(newLogin.data.user.role, 'user');
  assert.equal(newLogin.data.user.is_super_admin, false);
  assert.equal(newLogin.data.user.cms_access, false);
  await post(
    '/api/admin/users',
    {
      name: 'Duplicate CMS User',
      email: `cms-created-${suffix}@example.test`,
      password,
    },
    a,
    409,
  );
  const staff = await account('staff');
  const staffRow = async () =>
    (
      await get(`/api/admin/users?q=${encodeURIComponent(staff.email)}`)
    ).items.find((row) => row.id === staff.id);
  let user = await staffRow();
  await patch(`/api/admin/users/${staff.id}`, {
    name: 'Staff updated',
    version: user.version,
    role: 'admin',
    is_super_admin: 1,
  });
  let me = await get('/api/auth/me', staff.cookie);
  assert.equal(me.user.role, 'user');
  assert.equal(me.user.is_super_admin, false);
  const role = (
    await post(
      '/api/admin/roles',
      { name: `Reader ${suffix}`, permissions: ['listings.view'] },
      a,
      201,
    )
  ).id;
  const roleRow = async () =>
    (await get('/api/admin/roles?limit=100')).items.find(
      (row) => row.id === role,
    );
  user = await staffRow();
  await put(`/api/admin/users/${staff.id}/roles`, {
    role_ids: [role],
    version: user.version,
  });
  me = await get('/api/auth/me', staff.cookie);
  assert.equal(me.user.cms_access, true);
  assert.equal(me.user.role, 'user');
  assert.deepEqual(me.user.permissions, ['listings.view']);
  await get('/api/admin/catalog', staff.cookie);
  await post('/api/listings', book, staff.cookie, 403);
  await patch(
    `/api/admin/catalog/${created.id}`,
    { ...book, image_keys: cmsImages, version: 0 },
    staff.cookie,
    403,
  );
  await trash(
    `/api/admin/catalog/${created.id}`,
    { version: 0 },
    staff.cookie,
    403,
  );
  await post(
    '/api/admin/roles',
    { name: 'Escalation', permissions: ['roles.view'] },
    staff.cookie,
    403,
  );
  await post(
    `/api/admin/users/${admin.id}/lock`,
    { locked: true, version: 0 },
    staff.cookie,
    403,
  );
  let roleData = await roleRow();
  await patch(`/api/admin/roles/${role}`, {
    name: roleData.name,
    version: roleData.version,
    permissions: ['listings.view', 'listings.update'],
  });
  assert.ok(
    (await get('/api/auth/me', staff.cookie)).user.permissions.includes(
      'listings.update',
    ),
  );
  roleData = await roleRow();
  await patch(`/api/admin/roles/${role}`, {
    name: roleData.name,
    version: roleData.version,
    permissions: ['listings.view'],
  });
  await patch(
    `/api/admin/catalog/${created.id}`,
    { ...book, image_keys: cmsImages, version: 0 },
    staff.cookie,
    403,
  );
  roleData = await roleRow();
  await trash(`/api/admin/roles/${role}`, roleData);
  assert.equal(
    (await get('/api/auth/me', staff.cookie)).user.cms_access,
    false,
  );
  status(await request('/api/admin/catalog', { cookie: staff.cookie }), 403);
  const deletedRole = (await get('/api/admin/roles?trash=1')).items.find(
    (row) => row.id === role,
  );
  await post(`/api/admin/roles/${role}/restore`, {
    version: deletedRole.version,
  });
  assert.equal((await get('/api/auth/me', staff.cookie)).user.cms_access, true);
  await post(
    '/api/admin/roles',
    { name: 'Unknown permission', permissions: ['god.mode'] },
    a,
    400,
  );
  // Persist exactly the multi-selection, including actions without view.
  let independent = await roleRow();
  await patch(`/api/admin/roles/${role}`, {name:independent.name,version:independent.version,permissions:['listings.update','listings.review','categories.view']});
  assert.deepEqual((await roleRow()).permissions.sort(), ['categories.view','listings.review','listings.update']);
  assert.deepEqual((await get('/api/auth/me',staff.cookie)).user.permissions.sort(), ['categories.view','listings.review','listings.update']);
  status(await request('/api/admin/catalog',{cookie:staff.cookie}),403);
  independent=await roleRow();
  await patch(`/api/admin/roles/${role}`, {name:independent.name,version:independent.version,permissions:['listings.view']});
  const staleRole = await roleRow();
  await patch(
    `/api/admin/roles/${role}`,
    { name: staleRole.name, version: staleRole.version - 1, permissions: [] },
    a,
    409,
  );
  assert.deepEqual((await roleRow()).permissions, ['listings.view']);
  console.log(
    'PASS: per-checkbox permissions, CMS rights separate from Seller, immediate grant/revoke and role trash/restore',
  );

  const sellerReviewer = (
    await post(
      '/api/admin/roles',
      {
        name: `Seller reviewer ${suffix}`,
        permissions: ['sellers.view', 'sellers.review'],
      },
      a,
      201,
    )
  ).id;
  user = await staffRow();
  await put(`/api/admin/users/${staff.id}/roles`, {
    role_ids: [sellerReviewer],
    version: user.version,
  });
  await post(
    '/api/seller/applications',
    { phone: '0900000000', note: 'Self-approval must be denied' },
    staff.cookie,
    201,
  );
  const selfApplication = (
    await get('/api/admin/seller-applications', staff.cookie)
  ).items.find((item) => item.user_id === staff.id);
  await post(
    `/api/admin/seller-applications/${selfApplication.id}/decision`,
    { decision: 'approved' },
    staff.cookie,
    403,
  );
  await post(`/api/admin/seller-applications/${selfApplication.id}/decision`, {
    decision: 'rejected',
    note: 'Cần bổ sung thông tin người bán',
  });
  assert.equal((await get('/api/seller/applications/me',staff.cookie)).application.review_note,'Cần bổ sung thông tin người bán');
  const managerRole = (
    await post(
      '/api/admin/roles',
      {
        name: `Limited manager ${suffix}`,
        permissions: [
          'roles.view',
          'roles.create',
          'roles.update',
          'users.view',
          'users.assign_roles',
        ],
      },
      a,
      201,
    )
  ).id;
  user = await staffRow();
  await put(`/api/admin/users/${staff.id}/roles`, {
    role_ids: [managerRole],
    version: user.version,
  });
  await post(
    '/api/admin/roles',
    { name: 'Forbidden grant', permissions: ['users.view', 'users.lock'] },
    staff.cookie,
    403,
  );
  const superRow = (
    await get(`/api/admin/users?q=${encodeURIComponent(admin.email)}`)
  ).items.find((row) => row.id === admin.id);
  await put(
    `/api/admin/users/${admin.id}/roles`,
    { role_ids: [managerRole], version: superRow.version },
    staff.cookie,
    404,
  );
  user = await staffRow();
  await put(
    `/api/admin/users/${staff.id}/roles`,
    { role_ids: [managerRole], version: user.version },
    staff.cookie,
    403,
  );
  await post(
    `/api/admin/users/${admin.id}/lock`,
    { locked: true, version: superRow.version },
    a,
    403,
  );
  const superRole = await post(
    '/api/admin/roles',
    {
      name: `Powerful ${suffix}`,
      permissions: ['roles.view', 'roles.update', 'users.view', 'users.lock'],
    },
    a,
    201,
  );
  const powerful = (await get('/api/admin/roles?limit=100')).items.find(
    (row) => row.id === superRole.id,
  );
  await patch(
    `/api/admin/roles/${powerful.id}`,
    {
      name: powerful.name,
      version: powerful.version,
      permissions: ['roles.view'],
    },
    staff.cookie,
    403,
  );
  user = await staffRow();
  await post(`/api/admin/users/${staff.id}/lock`, {
    locked: true,
    version: user.version,
  });
  status(await request('/api/auth/me', { cookie: staff.cookie }), 401);
  await post(
    '/api/auth/login',
    { email: staff.email, password },
    undefined,
    403,
  );
  user = await staffRow();
  await post(`/api/admin/users/${staff.id}/lock`, {
    locked: false,
    version: user.version,
  });
  const lockedSeller = (
    await get(`/api/admin/users?q=${encodeURIComponent(seller.email)}`)
  ).items.find((row) => row.id === seller.id);
  await post(`/api/admin/users/${seller.id}/lock`, {
    locked: true,
    version: lockedSeller.version,
  });
  status(await request(`/api/listings/${listing.id}`), 404);
  status(
    await request(`/api/listings/${listing.id}/contact`, {
      cookie: buyer.cookie,
    }),
    404,
  );
  const unlockSeller = (
    await get(`/api/admin/users?q=${encodeURIComponent(seller.email)}`)
  ).items.find((row) => row.id === seller.id);
  await post(`/api/admin/users/${seller.id}/lock`, {
    locked: false,
    version: unlockSeller.version,
  });
  status(await request(`/api/listings/${listing.id}`), 200);
  const login = status(
    await request('/api/auth/login', {
      method: 'POST',
      json: { email: seller.email, password },
    }),
    200,
  );
  seller.cookie = login.response.headers.get('set-cookie').split(';')[0];
  const audit = await get('/api/admin/audit?limit=100');
  assert.ok(audit.items.some((item) => item.action === 'trash'));
  assert.ok(audit.items.some((item) => item.action === 'assign_roles'));
  assert.ok(!JSON.stringify(audit).includes(password));
  console.log(
    'PASS: no self-escalation or grants beyond authority; Super protection, locked sessions, seller privacy and audit history',
  );
  return { staff, role, category };
}
