/* 决定性测试：同会话写入 -> 用字段查询自己刚写的文档。
 * 若返回 1 -> 查询机制正常，仅跨会话(ACL creator-only)被过滤 -> 集合 ACL 为 restrictive。
 * 若返回 0 -> 查询在本集合全局失效（与 ACL 无关，需重建/控台处理）。
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
  const add = await db.collection('dbudget_nodes').add({ date:'2099-05-05', name:'__ownself__', type:'custom', color:'#000', note:'x' });
  console.log('写入 id=', add.id);
  try { const r = await db.collection('dbudget_nodes').where({ date:'2099-05-05' }).limit(5).get(); console.log('同会话按字段查询 n=', r.data.length); } catch(e){ console.log('ERR', e.message||e); }
  try { const r = await db.collection('dbudget_nodes').where({ _id: add.id }).limit(5).get(); console.log('同会话按 _id 查询 n=', r.data.length); } catch(e){ console.log('ERR2', e.message||e); }
  await db.collection('dbudget_nodes').doc(add.id).remove();
  process.exit(0);
})().catch(e => { console.error('DIAG5 ERR', e); process.exit(1); });
