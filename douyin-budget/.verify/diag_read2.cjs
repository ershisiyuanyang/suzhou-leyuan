/* 进一步诊断：SDK 读在 Node 环境是否完全失效。
 * 1) 读已知线上可用的 dbudget_plans（生产 app 一直在读）
 * 2) 同会话内 写一条临时 doc -> 按 _id 读回
 */
const fs = require('fs');
const cloudbase = require('@cloudbase/js-sdk');
const APPJS = '/Users/gujiwen/WorkBuddy/2026-08-19-15-32-01/douyin-budget/app.js';
const ACCESS_KEY = fs.readFileSync(APPJS,'utf8').match(/const ACCESS_KEY = '([^']+)'/)[1];
const ENV_ID = 'suzhou-leyuan-d6gfkgrlvcef0e76f';

(async () => {
  const app = cloudbase.init({ env: ENV_ID, accessKey: ACCESS_KEY, region: 'ap-shanghai', auth: { detectSessionInUrl: true } });
  await app.auth().signInAnonymously();
  console.log('登录态 openid=', app.auth().currentUserWithCache ? (app.auth().currentUserWithCache().uid||'?') : 'n/a');
  const db = app.database();

  // 1) 读生产集合
  try { const r = await db.collection('dbudget_plans').limit(5).get(); console.log('[dbudget_plans] count=', r.data.length); }
  catch(e){ console.log('[dbudget_plans] ERR', e.message||e); }

  // 2) 同会话 写->读
  try {
    const add = await db.collection('dbudget_nodes').add({ date:'2099-12-31', name:'__diag__', type:'custom', color:'#000', note:'x' });
    console.log('写入临时 doc id=', add.id);
    const r = await db.collection('dbudget_nodes').doc(add.id).get();
    console.log('按 _id 读回条数=', r.data ? (Array.isArray(r.data)?r.data.length:1) : 0, 'name=', r.data && r.data.name);
    await db.collection('dbudget_nodes').doc(add.id).remove();
    console.log('临时 doc 已清理');
  } catch(e){ console.log('[write-read] ERR', e.message||e); }
  process.exit(0);
})().catch(e => { console.error('DIAG2 ERR', e); process.exit(1); });
