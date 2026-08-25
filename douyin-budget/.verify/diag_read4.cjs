/* 关键对照：真实字段查询在 plans vs nodes 上的表现。
 * plans 有 active 字段；nodes 有 type 字段。若 plans 真实字段能查到、nodes 真实字段查不到 -> 集合级读取问题(ACL/未就绪)。
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

  const t = async (label, q) => { try { const r = await q.limit(10).get(); console.log(`[${label}] n=`, r.data.length); } catch(e){ console.log(`[${label}] ERR`, e.message||e); } };

  await t('plans where{active:true}', db.collection('dbudget_plans').where({ active: true }));
  await t('nodes where{type:holiday}', db.collection('dbudget_nodes').where({ type: 'holiday' }));
  await t('nodes where{name:元旦}', db.collection('dbudget_nodes').where({ name: '元旦' }));
  // 全量不带 where 的 get
  await t('nodes 裸get', db.collection('dbudget_nodes'));
  await t('plans 裸get', db.collection('dbudget_plans'));
  process.exit(0);
})().catch(e => { console.error('DIAG4 ERR', e); process.exit(1); });
