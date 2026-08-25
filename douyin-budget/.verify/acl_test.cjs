/* 用与线上 App 完全一致的方式（publishable accessKey + 匿名登录）测试 dbudget_nodes 的 ACL，
 * 并据此决定如何预置 42 条内置节点。若匿名可读写 -> ACL 为「所有用户可读写」，功能线上可直接用。
 */
const fs = require('fs');
const path = require('path');
const cloudbase = require('@cloudbase/js-sdk');

const APPJS = '/Users/gujiwen/WorkBuddy/2026-08-19-15-32-01/douyin-budget/app.js';
const src = fs.readFileSync(APPJS, 'utf8');
const m = src.match(/const ACCESS_KEY = '([^']+)'/);
if (!m) { console.error('无法提取 ACCESS_KEY'); process.exit(2); }
const ACCESS_KEY = m[1];
const ENV_ID = 'suzhou-leyuan-d6gfkgrlvcef0e76f';

(async () => {
  const app = cloudbase.init({ env: ENV_ID, accessKey: ACCESS_KEY, region: 'ap-shanghai', auth: { detectSessionInUrl: true } });
  const { error } = await app.auth().signInAnonymously();
  if (error) { console.error('匿名登录失败', error); process.exit(3); }
  console.log('匿名登录成功');
  const db = app.database();

  // 1) 匿名读
  let readOk = false, readCount = -1;
  try {
    const r = await db.collection('dbudget_nodes').where({}).limit(1).get();
    readOk = true; readCount = r.data.length;
    console.log('匿名读 dbudget_nodes: OK, 当前文档数(limit1)=', readCount);
  } catch (e) { console.log('匿名读 dbudget_nodes: 失败 ->', e.message || e); }

  // 2) 匿名写（测试一条）
  let writeOk = false;
  let testId = null;
  try {
    const add = await db.collection('dbudget_nodes').add({ date: '2099-01-01', name: '__acl_test__', type: 'custom', color: '#000000', note: 'acl-test' });
    writeOk = true; testId = add.id;
    console.log('匿名写 dbudget_nodes: OK, id=', testId);
  } catch (e) { console.log('匿名写 dbudget_nodes: 失败 ->', e.message || e); }

  // 清理测试文档
  if (testId) {
    try { await db.collection('dbudget_nodes').doc(testId).remove(); console.log('测试文档已清理'); }
    catch (e) { console.log('清理失败(可忽略):', e.message || e); }
  }

  console.log('\n=== ACL 结论 ===');
  console.log('匿名读:', readOk ? '允许' : '拒绝', '| 匿名写:', writeOk ? '允许' : '拒绝');
  if (readOk && writeOk) {
    console.log('RESULT=PERMISSIVE  (集合ACL为「所有用户可读写」，线上功能可直接使用)');
  } else {
    console.log('RESULT=RESTRICTED  (集合ACL受限，需在控制台将 dbudget_nodes / dbudget_weather 设为「所有用户可读写」)');
  }
  process.exit(0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(4); });
