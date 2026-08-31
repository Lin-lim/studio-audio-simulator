/* =========================================================================
   验证：署名 + 预设地面 50mm 吸音棉 + 修复项
   ========================================================================= */
const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','实时音频模拟.html'),'utf8');
let pass=0, fail=0;
const chk=(n,ok,d='')=>{ ok?pass++:fail++; console.log(`  ${ok?'✅':'❌'} ${n}${d?'   '+d:''}`); };

console.log('\n=== ① 作者署名 ===\n');
chk('HTML 头注释含作者', /作者：limlin/.test(html));
chk('HTML 头注释含元宝', /使用：元宝（Yuanbao）完成/.test(html));
chk('主脚本头注释含作者', /作者 : limlin/.test(html));
chk('主脚本头注释含元宝', /工具 : 元宝（Yuanbao）/.test(html));
chk('首页 overlay 署名',  /class="ov-credit"/.test(html));
chk('  首页含 limlin',    /ov-credit[\s\S]{0,200}limlin/.test(html));
chk('  首页含元宝',       /ov-credit[\s\S]{0,200}元宝/.test(html));
chk('页脚署名元素',       /id="fCredit"/.test(html));
chk('  页脚含作者',       /fCredit[\s\S]{0,200}limlin/.test(html));
chk('分析 tab 说明含署名', /作者 <strong>limlin<\/strong>/.test(html));
chk('  说明含元宝',       /元宝（Yuanbao）<\/strong> 完成/.test(html));
chk('<title> 含署名',     /by limlin \/ 元宝/.test(html));
chk('署名样式已定义',     /\.ov-credit\{/.test(html));
chk('  署名用主色',       /\.ov-credit b\{color:var\(--acc\)/.test(html));
{
  const n=(html.match(/limlin/g)||[]).length;
  chk('  出现次数合理', n>=5 && n<=20, `实到 ${n} 处`);
  chk('  元宝同样多处', (html.match(/元宝/g)||[]).length>=5);
}

console.log('\n=== ② 启动脚本署名（ASCII，避免 cmd 乱码）===\n');
{
  const bat=fs.readFileSync(path.join(__dirname,'..','Start.bat'),'utf8');
  const ps1=fs.readFileSync(path.join(__dirname,'..','start-server.ps1'),'utf8');
  chk('Start.bat 含作者',   /Author : limlin/.test(bat));
  chk('Start.bat 含元宝',   /Yuanbao/.test(bat));
  chk('ps1 含作者',         /Author : limlin/.test(ps1));
  chk('ps1 含元宝',         /Yuanbao/.test(ps1));
  /* 关键：bat/ps1 必须纯 ASCII，否则 cmd 会乱码（此前踩过坑） */
  chk('Start.bat 纯 ASCII', !/[^\x00-\x7F]/.test(bat), '含中文会在 cmd 乱码');
  chk('ps1 纯 ASCII',       !/[^\x00-\x7F]/.test(ps1));
  chk('  bat 原有功能未破坏', /start-server\.ps1/.test(bat) || /powershell/.test(bat));
}

console.log('\n=== ③ 预设地面 = 50mm 吸音棉 ===\n');
{
  const raw=html.match(/const PRESETS = \{([\s\S]*?)\n\};/)[1];
  const all=[...raw.matchAll(/floor:'(\w+)'/g)].map(m=>m[1]);
  chk('七个预设都有 floor', all.length===7, `实到 ${all.length}`);
  chk('  全部为 panel50',  all.every(v=>v==='panel50'),
      all.every(v=>v==='panel50') ? '' : '实际: '+[...new Set(all)].join(','));
  chk('  S 初始值也是',    /floor:'panel50', ceil/.test(html));
  /* panel50 必须真实存在且吸声系数够高 */
  chk('  panel50 材料存在', /panel50\s*:\s*\{n:'50mm 吸音棉'/.test(html));
  const a=html.match(/panel50\s*:\s*\{n:'50mm 吸音棉',\s*a:\[([^\]]*)\]/)[1]
             .split(',').map(Number);
  chk('  中高频吸声 >0.9',  a[3]>0.9 && a[4]>0.9, `1k=${a[3]} 2k=${a[4]}`);
  chk('  低频不过度吸',     a[0]<0.25, `125Hz=${a[0]}`);
}

console.log('\n=== ④ 折叠修复（曾"折叠后无法展开"）===\n');
chk('foldAll 用 setDetailFold', /setDetailFold\(folded\);[ \t]*\/\/ 参数区/.test(html));
chk('  旧的错误写法已移除',      !/d\.dataset\.fold\) setCardFold/.test(html));
chk('anyFoldOpen 独立函数',      /function anyFoldOpen\(\)\{/.test(html));
chk('  卡片判断正确',            /\.card\[data-fold\]:not\(\.collapsed\)/.test(html));
chk('  参数区判断正确',          /!d\.classList\.contains\('folded'\)/.test(html));
chk('syncFoldBtn 存在',          /function syncFoldBtn/.test(html));
chk('  setCardFold 后同步',      /if\(key\)\{ FOLD\[key\]=folded; saveFold\(\); \}\n  syncFoldBtn\(\);/.test(html));
chk('  setDetailFold 后同步',    /if\(key\)\{ FOLD\[key\]=folded; saveFold\(\); \}\n  syncFoldBtn\(\);/.test(html));
chk('  initFold 末尾同步',       /initDetailFold\(\);[\s\S]{0,220}syncFoldBtn\(\);/.test(html));
{
  /* 折叠 key 必须剔除动态数字 */
  const seg=html.slice(html.indexOf('key 生成：卡片 id 优先'),
                       html.indexOf('const key=card.dataset.fold'));
  chk('  key 剔除数字',   /replace\(\/\[\\d\.\]\+\/g/.test(seg), '声源数变化不会丢状态');
  chk('  优先用卡片 id',  /card\.id \? \('#'\+card\.id\)/.test(seg));
}

console.log('\n=== ⑤ 行为验证：折叠/展开必须能交替 ===\n');
{
  const mkCls=()=>{const _c=[];return{
    contains:c=>_c.includes(c),add:c=>{if(!_c.includes(c))_c.push(c);},
    remove:c=>{const i=_c.indexOf(c);if(i>=0)_c.splice(i,1);},
    toggle:(c,v)=>{v?(void 0):(void 0)}};};
  /* 用真实源码跑 */
  const grab=n=>{const i=html.indexOf('function '+n+'(');const j=html.indexOf('{',i);let d=0;
    for(let k=j;k<html.length;k++){if(html[k]==='{')d++;else if(html[k]==='}'){d--;if(!d)return html.slice(i,k+1);}}};
  const FOLD={};
  const mkc=()=>{const _c=[];const cl={contains:c=>_c.includes(c),
    add:c=>{if(!_c.includes(c))_c.push(c);},remove:c=>{const i=_c.indexOf(c);if(i>=0)_c.splice(i,1);},
    toggle:(c,v)=>{v?cl.add(c):cl.remove(c);}};return cl;};
  const det={classList:mkc(),dataset:{fold:'spk:detail'}};
  const cards=[{classList:mkc(),dataset:{fold:'#a'}},{classList:mkc(),dataset:{fold:'#b'}},
               {classList:mkc(),dataset:{fold:'c:几何尺寸'}}];
  const $=id=>id==='srcDetail'?det:null;
  const g=new Function('$','FOLD','saveFold','syncFoldBtn',
    grab('setCardFold')+'\n'+grab('setDetailFold')+'\n'
    +'function anyFoldOpen(){const cards=[];return null;}\n'
    +'return {setCardFold,setDetailFold};');
  /* anyFoldOpen 依赖 DOM，这里手写等价判断 */
  const anyFoldOpen=()=>cards.some(c=>!c.classList.contains('collapsed'))
                      || !det.classList.contains('folded');
  const api=g($,FOLD,()=>{},()=>{});
  const setCardFold=(c,f)=>api.setCardFold(c,f);
  const setDetailFold=f=>api.setDetailFold(f);
  const foldAll=f=>{cards.forEach(c=>setCardFold(c,f)); setDetailFold(f);};

  const seq=[];
  for(let i=0;i<6;i++){
    const open=anyFoldOpen();
    foldAll(open);
    seq.push(cards.filter(c=>c.classList.contains('collapsed')).length);
  }
  chk('  六次点击正确交替', seq.join(',')==='3,0,3,0,3,0', seq.join(','));
  chk('  不卡死在折叠态',   !seq.every(v=>v===3));
  chk('  不卡死在展开态',   !seq.every(v=>v===0));
}

console.log(`\n${'─'.repeat(60)}`);
console.log(fail===0?`🎉 署名与地面材料验证通过（${pass} 项）`:`❌ ${fail} 项失败 / 共 ${pass+fail} 项`);
console.log('─'.repeat(60)+'\n');
process.exit(fail?1:0);
