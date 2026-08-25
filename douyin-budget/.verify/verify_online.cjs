/* 端到端模拟 app 线上行为：loadNodes / seedNodes 幂等 / addNode-read-delete 往返。
 * 验证 ACL 修复后，匿名登录能正常读取全部节点、按需补充、增删改。
 */
const fs = require('fs');
const cloudbase = require('@cloudbase/js-sdk');
const ROOT = '/Users/gujiwen/WorkBuddy/2026-08-19-15-32-01/douyin-budget';
const ACCESS_KEY = fs.readFileSync(ROOT+'/app.js','utf8').match(/const ACCESS_KEY = '([^']+)'/)[1];
const BUILTIN = JSON.parse(fs.readFileSync(ROOT+'/.seed/builtin_nodes.json','utf8'));
const ENV_ID = 'suzhou-leyuan-d6gfkgrlvcef0e76f';

const getAll = async (db, coll) => {
  const res = []; let skip = 0;
  for (;;){ const p = await db.collection(coll).where({}).skip(skip).limit(200).get(); res.push(...p.data); if(p.data.length<200) break; skip+=200; }
  return res;
};

(async () => {
  const app = cloudbase.init({ env: ENV_ID, accessKey: ACCESS_KEY, region: 'ap-shanghai', auth: { detectSessionInUrl: true } });
  await app.auth().signInAnonymously();
  const db = app.database();

  // loadNodes
  const existing = await getAll(db, 'dbudget_nodes');
  console.log('[loadNodes] 线上节点数:', existing.length);

  // seedNodes 幂等判定
  const keys = new Set(existing.map(n => `${n.date}|${n.name}|${n.type}`));
  const toAdd = BUILTIN.filter(b => !keys.has(`${b.date}|${b.name}|${b.type}`));
  console.log('[seedNodes] 待补充(应为0):', toAdd.length);

  // addNode 往返
  const add = await db.collection('dbudget_nodes').add({ date:'2099-09-09', name:'__e2e__', type:'custom', color:'#8c8c8c', note:'t' });
  const back = await db.collection('dbudget_nodes').where({ date:'2099-09-09', name:'__e2e__' }).limit(1).get();
  console.log('[addNode] 写入后跨会话可查:', back.data.length === 1);
  await db.collection('dbudget_nodes').doc(add.id).remove();
  console.log('[deleteNode] 已删除测试节点');

  const after = await db.collection('dbudget_nodes').where({}).limit(200).get();
  console.log('=== 最终线上节点数:', after.data.length, '(应为42)');
  process.exit(0);
})().catch(e => { console.error('E2E ERR', e); process.exit(1); });
