import assert from 'node:assert/strict';
export async function runExperienceChecks({request,status,admin,seller,book,suffix}) {
  for (const query of ['min=9&max=1','max=-1','max=Infinity','min=NaN','page=1.5','page=-1','page=0','page=1001','limit=0','limit=41','max=100000001']) status(await request(`/api/listings?${query}`),400);
  const free=status(await request('/api/listings?max=0'),200).data;
  assert.ok(free.items.every(row=>row.price===0));
  const q=`UX ${suffix}`;
  const create=async(title,price) => {
    const created=status(await request('/api/listings',{method:'POST',cookie:seller.cookie,json:{...book,title,price}}),201).data;
    status(await request(`/api/admin/listings/${created.id}/decision`,{method:'POST',cookie:admin.cookie,json:{decision:'active',version:0}}),200);
    return created.id;
  };
  const one=await create(`${q} 100%_book`,0),two=await create(`${q} 100Xbook`,999);
  const query=async(tail)=>status(await request(`/api/listings?q=${encodeURIComponent(q)}&${tail}`),200).data;
  const first=await query('limit=1&sort=price_asc');assert.equal(first.items.length,1);assert.equal(first.items[0].id,one);assert.equal(first.has_more,true);
  const second=await query('page=2&limit=1&sort=price_asc');assert.equal(second.items[0].id,two);assert.equal(second.has_more,false);
  const empty=await query('page=3&limit=1');assert.equal(empty.items.length,0);assert.equal(empty.has_more,false);assert.equal(empty.catalog_empty,false);
  const literal=status(await request('/api/listings?q='+encodeURIComponent(q+' 100%_')),200).data;
  assert.deepEqual(literal.items.map(row=>row.id),[one]);
  const maxZero=await query('max=0');assert.deepEqual(maxZero.items.map(row=>row.id),[one]);
  const reverse=await query('sort=price_desc');assert.deepEqual(reverse.items.map(row=>row.id),[two,one]);
  status(await request(`/api/seller/listings/${one}/status`,{method:'POST',cookie:seller.cookie,json:{status:'hidden',version:1}}),200);
  const after=await query('limit=1&sort=price_asc');assert.equal(after.items[0].id,two);assert.equal(after.has_more,false);
  console.log('PASS: price 0, invalid query rejection, literal wildcard search, stable page boundaries, ordering and hidden-listing exclusion');
}
