import test from 'node:test';
import assert from 'node:assert/strict';
import {sortSidebarThreads} from '../bridge/thread-order.mjs';
test('sidebar follows pinned and active manual order without jumping on activity',()=>{
  const rows=[
    {id:'active-b',activeOrderKey:'b',updatedAt:'2030-01-01'},
    {id:'pin-z',pinnedAt:'2026-01-01',pinOrderKey:'z'},
    {id:'new',createdAt:'2026-01-02'},
    {id:'active-a',activeOrderKey:'a'},
    {id:'pin-a',pinnedAt:'2026-01-01',pinOrderKey:'a'},
    {id:'reopened',createdAt:'2025-01-01',unsettledAt:'2026-01-03'},
    {id:'pin-legacy',pinnedAt:'2026-01-01',createdAt:'2027-01-01'},
  ];
  const ids=sortSidebarThreads(rows).map(t=>t.id);
  assert.deepEqual(ids,['pin-a','pin-z','pin-legacy','reopened','new','active-a','active-b']);
  assert.deepEqual(sortSidebarThreads(rows.map(t=>({...t,updatedAt:'2040-01-01'}))).map(t=>t.id),ids);
  assert.equal(rows[0].id,'active-b');
});
