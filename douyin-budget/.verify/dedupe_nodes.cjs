/* 去重 dbudget_nodes：按 date|name|type 分组，保留每组第一条，删除其余重复项。
 * 当前应为 84 条（两套各 42，openid 分别为 wdWG... 与 GH42...），去重后保留 42 条。
 */
const fs = require('fs');
const cloudbase = require('@cloudbase/js-sdk');
const APPJS = '/Users/gujiwen/WorkBuddy/2026-08-19-15-32-01/douyin-budget/app.js';
const ACCESS_KEY = fs.readFileSync(APPJS,'utf8').match(/const ACCESS_KEY = '([^']+)'/)[1];
const ENV_ID = 'suzhou-leyuan-d6gfkgrlvcef0e76f';

(async () => {
  const app = cloudbase.init({ env: ENV_ID, accessKey: ACCESS_KEY, region: 'ap-shanghai', auth: { detectSessionInUrl: true } });
  await app.auth().signInAnonymously();
  const db = app.database();

  // 全量读取
  let all = [];
  let skip = 0;
  for (;;) {
    const r = await db.collection('dbudget_nodes').where({}).skip(skip).limit(200).get();
    all.push(...r.data);
    if (r.data.length < 200) break;
    skip += 200;
  }
  console.log('当前总条数:', all.length);

  const seen = new Set();
  const keep = [];
  const dupIds = [];
  for (const n of all) {
    const k = `${n.date}|${n.name}|${n.type}`;
    if (seen.has(k)) dupIds.push(n._id);
    else { seen.add(k); keep.push(n); }
  }
  console.log('去重后唯一数:', keep.length, '| 待删除重复数:', dupIds.length);

  let del = 0;
  for (const id of dupIds) {
    try { await db.collection('dbudget_nodes').doc(id).remove(); del++; }
    catch (e) { console.error('删除失败', id, e.message || e); }
  }
  console.log('已删除:', del);

  // 复核
  const after = await db.collection('dbudget_nodes').where({}).limit(200).get();
  const t = {};
  after.data.forEach(n => t[n.type] = (t[n.type]||0)+1);
  console.log('=== 复核 最终条数:', after.data.length, '| 按类型:', JSON.stringify(t));
  process.exit(0);
})().catch(e => { console.error('DEDUPE ERR', e); process.exit(1); });
