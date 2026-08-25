/* 线上 seed 42 条内置节点到 dbudget_nodes。
 * 逻辑与 app.js 的 seedNodes() 完全一致：读取线上已有节点，按 date|name|type 去重，
 * 仅补充缺失项（幂等）。用 publishable accessKey + 匿名登录，与线上 app 同权。
 */
const fs = require('fs');
const path = require('path');
const cloudbase = require('@cloudbase/js-sdk');

const ROOT = '/Users/gujiwen/WorkBuddy/2026-08-19-15-32-01/douyin-budget';
const APPJS = path.join(ROOT, 'app.js');
const SEED = path.join(ROOT, '.seed', 'builtin_nodes.json');

const src = fs.readFileSync(APPJS, 'utf8');
const m = src.match(/const ACCESS_KEY = '([^']+)'/);
if (!m) { console.error('无法提取 ACCESS_KEY'); process.exit(2); }
const ACCESS_KEY = m[1];
const ENV_ID = 'suzhou-leyuan-d6gfkgrlvcef0e76f';

const BUILTIN = JSON.parse(fs.readFileSync(SEED, 'utf8'));

(async () => {
  const app = cloudbase.init({ env: ENV_ID, accessKey: ACCESS_KEY, region: 'ap-shanghai', auth: { detectSessionInUrl: true } });
  const { error } = await app.auth().signInAnonymously();
  if (error) { console.error('匿名登录失败', error); process.exit(3); }
  console.log('匿名登录成功');
  const db = app.database();

  const existRes = await db.collection('dbudget_nodes').where({}).limit(1000).get();
  const exist = existRes.data || [];
  console.log('线上已有节点数:', exist.length);
  const keys = new Set(exist.map(n => `${n.date}|${n.name}|${n.type}`));
  const toAdd = BUILTIN.filter(b => !keys.has(`${b.date}|${b.name}|${b.type}`));
  console.log('待补充节点数:', toAdd.length);

  if (!toAdd.length) {
    console.log('无需补充，已是 42 条内置节点。');
  } else {
    let ok = 0;
    for (const b of toAdd) {
      try {
        await db.collection('dbudget_nodes').add(Object.assign({}, b));
        ok++;
      } catch (e) {
        console.error('添加失败:', b.date, b.name, e.message || e);
      }
    }
    console.log(`已写入 ${ok}/${toAdd.length} 条`);
  }

  const after = await db.collection('dbudget_nodes').where({}).limit(1000).get();
  const t = {};
  (after.data || []).forEach(n => { t[n.type] = (t[n.type] || 0) + 1; });
  console.log('=== 线上最终节点数:', (after.data || []).length, '| 按类型:', JSON.stringify(t));
  process.exit(0);
})().catch(e => { console.error('SEED ERROR', e); process.exit(4); });
