/* 验证信号路由状态机的互斥性：任何时刻只能有一条通路 */
const fs=require('fs'), path=require('path');
/* 同时兼容两种布局：开发时 app/index.html，交付时 实时音频模拟.html */
const CAND=[path.join(__dirname,'..','app','index.html'),
            path.join(__dirname,'..','实时音频模拟.html')];
const HTML_PATH=CAND.find(f=>fs.existsSync(f));
if(!HTML_PATH){ console.error('找不到 index.html，请在项目目录下运行'); process.exit(1); }
const html=fs.readFileSync(HTML_PATH,'utf8');
let pass=0,fail=0;
const chk=(n,ok,d='')=>{ok?pass++:fail++;console.log(`  ${ok?'✅':'❌'} ${n}${d?'   '+d:''}`);};

console.log('\n=== 信号路由状态机 ===\n');

// 1. routeSignal 必须存在，且内部先「全清」再「二选一」
const rs = html.match(/function routeSignal\(\)\{[\s\S]*?\n\}/);
chk('存在统一的 routeSignal()', !!rs);
if(rs){
  const body = rs[0];
  chk('  → 先清空总线直连', /extUnwireBus\(\)/.test(body));
  chk('  → 清空所有音响输入', /extUnwireSpk\(s\)/.test(body));
  chk('  → 二选一：nSpk===0 接总线', /if\(nSpk === 0\)/.test(body));
  chk('  → 二选一：else 只接音响', /\}else\{[\s\S]{0,200}?extWireSpk/.test(body));
  // 互斥性：接总线的分支里绝不能出现 extWireSpk
  const busBranch = body.match(/if\(nSpk === 0\)\{([\s\S]*?)\n  \}else\{/);
  chk('  → 互斥：总线分支不接音响', busBranch ? !/extWireSpk/.test(busBranch[1]) : false);
  const spkBranch = body.match(/\}else\{([\s\S]*?)\n  \}\n/);
  chk('  → 互斥：音响分支不接总线', spkBranch ? !/A\.inputBus/.test(spkBranch[1]) : false);
}

// 2. 所有状态变化点都必须调用它
const sites = [
  /* 不要写死"紧跟其后的注释"——插入新逻辑就会误报。
     改为：在 extStart 函数体内，routeSignal() 出现在 fbAttach() 之前即可。 */
  ['开始捕获后',        /routeSignal\(\);[\s\S]{0,200}?fbAttach\(\);/],
  /* 窗口放宽到 400：停止后要先停啸叫检测、刷新面板，再重新路由。
     用窄窗口会因为中间插入新逻辑（以及注释占位）而误报，
     这里真正要保证的是"停止后确实重新路由了"，顺序有先后即可。 */
  ['停止捕获后',        /EXT\.active = false;[\s\S]{0,400}?routeSignal\(\)/],
  ['切换信号源后',      /function extSetMode[\s\S]{0,600}?extRewireAll\(\)/],
  ['添加音响后',        /function addSpeaker[\s\S]{0,700}?routeSignal\(\)/],
  ['移除声源后',        /S\.srcs\.splice\(i,1\);[\s\S]{0,200}?routeSignal\(\)/],
];
console.log('');
sites.forEach(([n,re])=>chk(n+'重新路由', re.test(html)));

// 3. extRewireAll 必须是 routeSignal 的别名（不能自己另搞一套）
const alias = html.match(/function extRewireAll\(\)\{([^}]*)\}/);
chk('extRewireAll 是 routeSignal 的别名', alias && /routeSignal\(\)/.test(alias[1]));

console.log(`\n${'─'.repeat(56)}`);
console.log(fail===0?`🎉 路由状态机自洽（${pass} 项）`:`❌ ${fail} 项失败 / 共 ${pass+fail} 项`);
console.log('─'.repeat(56)+'\n');
process.exit(fail?1:0);
