/* 区分：是 .where({}) 全局失效，还是新集合 dbudget_nodes 查询索引未就绪。 */
const fs = require('fs');
const cloudbase = require('@cloudbase/js-sdk');
const APPJS = '/Users/gujiwen/WorkBuddy/2026-08-19-15-32-01/douyin-budget/app.js';
const ACCESS_KEY = fs.readFileSync(APPJS,'utf8').match(/const ACCESS_KEY = '([^']+)'/)[1];
const ENV_ID = 'suzhou-leyuan-d6gfkgrlvcef0e76f';

(async () => {
  const app = cloudbase.init({ env: ENV_ID, accessKey: ACCESS_KEY, region: 'ap-shanghai', auth: { detectSessionInUrl: true } });
  await app.auth().signInAnonymously();
  const db = app.database();

  const t = async (label, q) => { try { const r = await q.limit(5).get(); console.log(`[${label}] n=`, r.data.length); } catch(e){ console.log(`[${label}] ERR`, e.message||e); } };

  await t('plans where{}', db.collection('dbudget_plans').where({}));
  await t('nodes where{}', db.collection('dbudget_nodes').where({}));
  // 用 MCP 已知真实 _id 直接读
  const realId = '0fb91b1d6a8d145500ad2d7b25663b7c'; // 2026-01-01 元旦
  try { const r = await db.collection('dbudget_nodes').doc(realId).get(); console.log('[nodes doc realId] n=', r.data?1:0, 'name=', r.data && r.data.name); } catch(e){ console.log('[nodes doc realId] ERR', e.message||e); }
  process.exit(0);
})().catch(e => { console.error('DIAG3 ERR', e); process.exit(1); });
