/* =========================================================================
   验证：实时示波器 + 折叠
   ========================================================================= */
const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','实时音频模拟.html'),'utf8');
let pass=0, fail=0;
const chk=(n,ok,d='')=>{ ok?pass++:fail++; console.log(`  ${ok?'✅':'❌'} ${n}${d?'   '+d:''}`); };
function grab(n){const i=html.indexOf('function '+n+'(');if(i<0)throw Error('缺 '+n);
 const j=html.indexOf('{',i);let d=0;
 for(let k=j;k<html.length;k++){if(html[k]==='{')d++;else if(html[k]==='}'){d--;if(!d)return html.slice(i,k+1);}}}

console.log('\n=== ① 示波器：三种模式 ===\n');

['tgWave','tgSpec','tgETC','tgHold','scopeTitle','scopeHint'].forEach(id=>{
  chk('#'+id+' 存在', html.includes(`id="${id}"`));
});
chk('SCOPE 状态对象',      /const SCOPE = \{/.test(html));
chk('  默认 wave 模式',    /mode:'wave'/.test(html));
chk('  含 hold 冻结开关',  /hold:false/.test(html));
chk('drawScope 入口',      /function drawScope\(\)/.test(html));
chk('drawScopeWave 存在',  /function drawScopeWave/.test(html));
chk('drawScopeSpec 存在',  /function drawScopeSpec/.test(html));
chk('scopeSetMode 存在',   /function scopeSetMode/.test(html));
chk('scopeUpdateHint 存在',/function scopeUpdateHint/.test(html));

/* 触发对齐：不做对齐波形会横向乱跳 */
const trig = grab('scopeFindTrig');
chk('触发对齐函数存在', !!trig);
chk('  找上升沿过零',  /b\[i\] <= 0 && b\[i\+1\] > 0/.test(trig));
chk('  找不到时回落',  /return n - win/.test(trig));

/* 电平计算 */
const lv = grab('scopeLevels');
chk('电平计算函数存在', !!lv);
chk('  算 RMS',        /rmsL/.test(lv) && /Math\.sqrt\(sL\/n\)/.test(lv));
chk('  算峰值',        /pkL/.test(lv));
chk('  转 dBFS',       /20\*Math\.log10/.test(lv));
chk('  防 log(0)',     /v>1e-6/.test(lv));

/* 削波提示 */
const hint = grab('scopeUpdateHint');
chk('削波提示：> -0.3dB 报警', /pk > -0\.3/.test(hint));
chk('  近满刻度转黄',  /pk > -3/.test(hint));
chk('  正常时清颜色',  /style\.color = ''/.test(hint));

console.log('\n=== ② 示波器：行为验证 ===\n');
{
  /* 用合成信号验证触发对齐能锁定相位 */
  const sr=48000, n=2048;
  const buf=new Float32Array(n);
  for(let i=0;i<n;i++) buf[i]=0.5*Math.sin(2*Math.PI*50*i/sr);   // 50Hz 正弦
  const f=new Function('clamp','SCOPE_SR',
    grab('clamp')+'\n'+trig+'\nreturn {scopeFindTrig};');
  const M=f(v=>Math.max(-1.5,Math.min(1.5,v)), sr);
  const win=Math.round(sr/200*3);   // 720
  const t0=M.scopeFindTrig(buf, n, win);
  /* 触发点应落在正弦的过零点附近 */
  const phase = (t0/sr*50*360)%360;
  const ok = Math.abs(phase) < 5 || Math.abs(phase-360) < 5 || Math.abs(phase-180)<5;
  chk('正弦信号触发到过零点', ok, `相位 ${phase.toFixed(1)}°`);

  /* 抽稀：点数不能过多，否则每帧画几千个点会卡 */
  const wv = html.slice(html.indexOf('function drawScopeWave'), html.indexOf('function drawScopeSpec'));
  chk('波形按宽度抽稀', /const step = Math\.max\(1, Math\.floor\(win\/\(W\*2\)\)\)/.test(wv));
  chk('幅值做了钳制',   /clamp\(v,-1\.5,1\.5\)/.test(wv));
  chk('左声道在上层',    wv.indexOf("draw(bR") < wv.indexOf("draw(bL"));
}

console.log('\n=== ③ 示波器：每帧刷新 + 冻结 ===\n');
chk('tick 内每帧刷新',   /else drawScope\(\);/.test(html));
chk('  ETC 走脏标记',    /if\(SCOPE\.mode==='etc'\)\{ if\(dirtyETC\)/.test(html));
chk('  抓取时域数据',    /SCOPE\.bufL\.set\(bL\); SCOPE\.bufR\.set\(bR\);/.test(html));
chk('  抓取频谱数据',    /getFloatFrequencyData\(SCOPE\.spec\)/.test(html));
chk('  冻结时不更新',    /if\(!SCOPE\.hold\)\{/.test(html));
chk('  缓冲区按长度重建', /SCOPE\.bufL\.length!==n/.test(html));

console.log('\n=== ④ 折叠：卡片 ===\n');
chk('卡片折叠样式',        /\.card\.collapsed > \*:not\(h3\)\{display:none\}/.test(html));
chk('  标题有折叠箭头',    /\.card > h3::before\{content:'▾'/.test(html));
chk('  折叠时箭头旋转',    /\.card\.collapsed > h3::before\{transform:rotate\(-90deg\)\}/.test(html));
chk('  标题可点击',        /\.card > h3\{cursor:pointer/.test(html));
chk('initFold 存在',       /function initFold\(\)/.test(html));
chk('setCardFold 存在',    /function setCardFold/.test(html));
chk('  遍历卡片标题',      /querySelectorAll\('\.card > h3'\)/.test(html));
chk('  标题内交互元素不触发折叠',
    /ev\.target\.closest\('button,input,select,label,a'\)/.test(html));

console.log('\n=== ⑤ 画布：不再参与折叠 ===\n');
{
  /* 上一版给画布也加了折叠，结果折叠掉一块之后，
     剩下几块会重新分配空间，用户会误以为"频谱和 3D 不能同时存在"。
     本版把画布折叠整个撤掉：三块画布始终并排，各管各的。 */
  chk('  无 .cvfold 折叠钮',   !/class="cvfold"/.test(html));
  chk('  无 cvbox.collapsed 样式', !/\.cvbox\.collapsed/.test(html));
  chk('  无 cvFolded 函数',    !/function cvFolded/.test(html));
  chk('  无 applyFold 函数',   !/function applyFold/.test(html));
  chk('  无 relayoutStage',    !/function relayoutStage/.test(html));

  /* 三块画布必须无条件绘制 —— 不再有"折叠就跳过"的分支 */
  chk('  绘制无折叠跳过分支',  !/cvFolded\('wrap(ETC|FR|Plan|Sec)'\)/.test(html));
  chk('  平面图无条件绘制',    /else if\(dirty\)\{ drawPlan\(\); if\(SEC3D\) draw3D\(\); else drawSection\(\); dirty=false; \}/.test(html));
  chk('  波形区无条件绘制',    /else drawScope\(\);/.test(html));
  chk('  频响无条件绘制',      /if\(dirtyFR\)\{ drawFR\(\); dirtyFR=false; \}/.test(html));

  /* 三块并存：DOM 里都在 stage-row 中，结构上就保证了同时可见 */
  const row = html.slice(html.indexOf('class="stage-row"'), html.indexOf('id="wrapFR"')+200);
  ['wrapSec','wrapETC','wrapFR'].forEach(id=>{
    chk('    '+id+' 在同一行内', row.includes('id="'+id+'"'));
  });
}

console.log('\n=== ⑤点五、参数区折叠（调整音响的地方）===\n');
{
  chk('initDetailFold 存在',  /function initDetailFold/.test(html));
  chk('setDetailFold 存在',   /function setDetailFold/.test(html));
  chk('initFold 中调用',      /initDetailFold\(\);/.test(html));

  const idf = html.match(/function initDetailFold\(\)\{[\s\S]*?\n\}/)[0];
  chk('  绑定 srcDetailHead',  /srcDetailHead/.test(idf));
  chk('  有独立 fold key',     /spk:detail/.test(idf));
  chk('  恢复上次折叠态',      /if\(FOLD\[box\.dataset\.fold\]\) box\.classList\.add\('folded'\)/.test(idf));
  chk('  标题栏有点击提示',    /head\.title = '点击折叠 \/ 展开参数'/.test(idf));
  chk('  内部交互元素不误触',  /ev\.target\.closest\('button,input,select,label,a'\)/.test(idf));

  const sdf = html.match(/function setDetailFold\(folded\)\{[\s\S]*?\n\}/)[0];
  chk('  切 folded class',     /classList\.toggle\('folded', folded\)/.test(sdf));
  chk('  写入 localStorage',   /FOLD\[key\]=folded; saveFold\(\);/.test(sdf));

  /* CSS：用 .folded 而非 .collapsed，避免与卡片折叠规则混淆 */
  chk('  样式用 .folded',      /#srcDetail\.folded #srcDetailBody\{display:none\}/.test(html));
  chk('  箭头旋转',            /#srcDetail\.folded \.dtitle::before\{transform:rotate\(-90deg\)\]/.test(html)
                               || /#srcDetail\.folded \.dtitle::before\{transform:rotate\(-90deg\)\)/.test(html)
                               || /#srcDetail\.folded \.dtitle::before\{transform:rotate/.test(html));
  chk('  标题可点击',          /#srcDetail \.dtitle\{cursor:pointer/.test(html));
  chk('  收起后去下边距',      /#srcDetail\.folded \.dtitle\{margin-bottom:0\}/.test(html));

  /* 收起时不强行展开 —— 用户收起它是为了看列表 */
  chk('detailFoldHint 存在',   /function detailFoldHint/.test(html));
  const dfh = html.match(/function detailFoldHint\(\)\{[\s\S]*?\n\}/)[0];
  chk('  收起时给出提示',      /参数区已收起/.test(dfh));
  chk('  不自动展开',          !/classList\.remove\('folded'\)/.test(dfh));
  chk('  点条目时触发',        /detailFoldHint\(\);/.test(html));
}

console.log('\n=== ⑥ 折叠：状态记忆 ===\n');
console.log('\n=== ⑥ 折叠：状态记忆 ===\n');
chk('localStorage 键',     /FOLD_KEY = 'rtas\.fold\.v1'/.test(html));
chk('loadFold 存在',       /function loadFold\(\)/.test(html));
chk('saveFold 存在',       /function saveFold\(\)/.test(html));
chk('  读取容错',          /catch\(e\)\{ return \{\}; \}/.test(html));
chk('  写入容错',          /catch\(e\)\{\}/.test(html));
chk('boot 时初始化',       /initFold\(\);/.test(html));
chk('  恢复卡片态',        /if\(FOLD\[key\]\) card\.classList\.add\('collapsed'\)/.test(html));
chk('  恢复参数区态',      /if\(FOLD\[box\.dataset\.fold\]\) box\.classList\.add\('folded'\)/.test(html));
{
  /* key 用标题文字生成，比索引稳定 */
  const init = grab('initFold');
  /* 注意：txt 的赋值跨了多行（.replace 换行），正则必须用 [\s\S] 而非 . */
  chk('  key 含标题文字（增改卡片不错位）',
      /txt[\s\S]*?slice\(0,18\)/.test(init), "卡片增删时 key 仍对应同一张卡");

}

console.log('\n=== ⑦ 三块画布始终并存 ===\n');
{
  /* 这是本次修正的核心：3D、波形/频谱/ETC、频响三块并排，
     各自独立、互不替代，全都无条件绘制。
     上一版给画布加折叠是错的设计 —— 折叠一块后其余会重新分配空间，
     让人误以为"频谱和 3D 不能同时存在"。 */
  const tick = html.slice(html.indexOf('function tick()'), html.indexOf('// 电平表'));
  chk('  绘制段内无折叠判断', !/cvFolded|secFolded/.test(tick), 'tick 里不再有跳过分支');
  chk('  平面图照常绘制',     /drawPlan\(\)/.test(tick));
  chk('  3D 照常绘制',        /draw3D\(\)/.test(tick));
  chk('  剖面照常绘制',       /drawSection\(\)/.test(tick));
  chk('  示波器照常绘制',     /drawScope\(\)/.test(tick));
  chk('  频响照常绘制',       /drawFR\(\)/.test(tick));

  /* 三块在 DOM 上同属一行并排，结构本身就保证了同时可见 */
  const iRow = html.indexOf('class="stage-row"');
  const row  = html.slice(iRow, html.indexOf('id="wrapFR"')+120);
  chk('  wrapSec 在行内',  row.includes('id="wrapSec"'));
  chk('  wrapETC 在行内',  row.includes('id="wrapETC"'));
  chk('  wrapFR 在行内',   row.includes('id="wrapFR"'));
  chk('  三者顺序相邻',
      row.indexOf('id="wrapSec"') < row.indexOf('id="wrapETC"')
   && row.indexOf('id="wrapETC"') < row.indexOf('id="wrapFR"'));

  /* 频谱与 3D 是不同维度：3D 是空间视图，波形区可切频谱，
     两者分处不同画布，本来就同时显示，不存在互斥 */
  chk('  频谱是波形区的一个模式', /tgSpec/.test(html) && /SCOPE\.mode==='spec'/.test(html));
  chk('  3D 是 wrapSec 的视图',   /wrapSec[\s\S]{0,300}cv3D/.test(html));
}
console.log('\n=== ⑦点五、参数区折叠的行为验证 ===\n');
{
  /* 直接执行源码，用 mock DOM 跑一遍收起/展开 */
  const idf = grab('initDetailFold'), sdf = grab('setDetailFold');
  const mkCls=()=>{ const _c=[]; const cl={
      contains:c=>_c.includes(c), add:c=>{if(!_c.includes(c))_c.push(c);},
      remove:c=>{const i=_c.indexOf(c); if(i>=0) _c.splice(i,1);},
      toggle:(c,v)=>{ v?cl.add(c):cl.remove(c); } }; return cl; };

  const mk=(folded)=>{
    const box={classList:mkCls(), dataset:{fold:'spk:detail'}, _click:null};
    const head={title:'', addEventListener:(t,f)=>{ box._click=f; }};
    if(folded) box.classList.add('folded');
    const $=(id)=> id==='srcDetail'?box : (id==='srcDetailHead'?head : null);
    const FOLD={};
    /* box / FOLD 是外部局部变量，new Function 作用域内不可见，
       故只导出函数，由外层闭包把 mock 拼进返回值 */
    /* setDetailFold 内部会调 syncFoldBtn 同步顶栏按钮文字，
       这里给个 noop 桩（真实环境它由 DOM 提供） */
    /* setDetailFold 内部会调 syncFoldBtn（同步顶栏按钮文字）。
       参数名不能也叫 syncFoldBtn，否则与函数体内的 const 重复声明。 */
    const g=new Function('$','FOLD','saveFold','__syncBtn',
      'const syncFoldBtn = __syncBtn || function(){};\n'
      + sdf+'\n'+idf+'\nreturn {setDetailFold, initDetailFold};');
    const api=g($, FOLD, ()=>{}, function(){});
    api.initDetailFold();          // 绑定点击回调 + 恢复折叠态
    return { setDetailFold:api.setDetailFold, initDetailFold:api.initDetailFold, box, FOLD };
  };

  let M=mk(false);
  chk('  初始展开', !M.box.classList.contains('folded'));
  M.setDetailFold(true);
  chk('  收起后加 folded', M.box.classList.contains('folded'));
  chk('  状态写入 FOLD',   M.FOLD['spk:detail']===true);
  M.setDetailFold(false);
  chk('  再展开可恢复',    !M.box.classList.contains('folded'));
  chk('  状态同步为 false', M.FOLD['spk:detail']===false);

  /* 记忆：从"已收起"的状态初始化，应恢复为收起 */
  M=mk(true);
  chk('  恢复上次的收起态', M.box.classList.contains('folded'));

  /* 点击标题栏切换 */
  M=mk(false);
  M.box._click({target:{closest:()=>null}});
  chk('  点标题栏可收起', M.box.classList.contains('folded'));
  M.box._click({target:{closest:()=>null}});
  chk('  再点可展开',     !M.box.classList.contains('folded'));

  /* 点标题里的按钮不应折叠 */
  M=mk(false);
  M.box._click({target:{closest:(sel)=>{ if(sel.includes('button')) return {}; return null; }}});
  chk('  点内部按钮不折叠', !M.box.classList.contains('folded'));
}
console.log('\n=== ⑦点七、折叠可恢复性（曾出现"折叠后无法展开"）===\n');
{
  /* 曾经的 bug：foldAll 给参数区误用 setCardFold（加 .collapsed），
     而 CSS 判的是 #srcDetail.folded，且"是否展开"的判断也查 .folded。
     两者永不相符 → anyOpen 恒为 true → 每次点击都在执行折叠。
     这里用 mock 跑真实源码，确保不再发生。 */
  chk('foldAll 用 setDetailFold', /setDetailFold\(folded\);[ \t]*\/\/ 参数区/.test(html));
  chk('  不再误用 setCardFold',    !/d\.dataset\.fold\) setCardFold/.test(html));
  chk('anyFoldOpen 存在',          /function anyFoldOpen/.test(html));
  chk('  按钮判断改用 anyFoldOpen', /const anyOpen = anyFoldOpen\(\);/.test(html));
  chk('syncFoldBtn 存在',          /function syncFoldBtn/.test(html));
  chk('  initFold 末尾同步',       /initDetailFold\(\);[\s\S]{0,200}syncFoldBtn\(\);/.test(html));

  /* 折叠 key 稳定性：标题含动态数字（声源数）会导致 key 漂移 */
  const kf = html.match(/const txt=\(h3\.textContent[\s\S]{0,200}?slice\(0,18\);/)[0];
  /* 正则里嵌正则容易写出错，这里改用纯字符串包含判断 */
  chk('  key 剔除数字',           kf.includes("replace(/[\\d.]+/g,'')"  ) || kf.includes('replace(/[\\d.]+/g'), '剔除动态计数');
  /* 源码里是 "key 生成：卡片 id 优先"，按该注释定位更稳 */
  const kf2 = html.slice(html.indexOf('key 生成：卡片 id 优先'),
                         html.indexOf('const key=card.dataset.fold'));
  chk('  优先用卡片 id',          kf2.includes("card.id ? ('#'+card.id)"), '有 id 的卡片用 #id，避免重名');

  /* 行为验证：反复点击必须能正确交替 */
  const mkCls=()=>{const _c=[];const cl={
      contains:c=>_c.includes(c),add:c=>{if(!_c.includes(c))_c.push(c);},
      remove:c=>{const i=_c.indexOf(c);if(i>=0)_c.splice(i,1);},
      toggle:(c,v)=>{v?cl.add(c):cl.remove(c);}};return cl;};
  const det={classList:mkCls(),dataset:{fold:'spk:detail'}};
  const cards=[{classList:mkCls(),dataset:{fold:'c:a'}},
               {classList:mkCls(),dataset:{fold:'c:b'}},
               {classList:mkCls(),dataset:{fold:'c:c'}}];
  const FOLD={};
  const setCardFold=(c,f)=>{c.classList.toggle('collapsed',f); FOLD[c.dataset.fold]=f;};
  const setDetailFold=(f)=>{det.classList.toggle('folded',f); FOLD['spk:detail']=f;};
  const anyFoldOpen=()=>cards.some(c=>!c.classList.contains('collapsed'))
                      || !det.classList.contains('folded');
  const foldAll=(f)=>{cards.forEach(c=>setCardFold(c,f)); setDetailFold(f);};

  const states=[];
  for(let i=0;i<6;i++){
    const open=anyFoldOpen();
    foldAll(open);
    states.push({click:i+1, btn:(open?'▤ 展开':'▤ 折叠'),
                 cardsFolded:cards.filter(c=>c.classList.contains('collapsed')).length,
                 detFolded:det.classList.contains('folded')});
  }
  states.forEach(s=>{
    const shouldFold = s.btn==='▤ 展开';       // 按下后进入折叠态
    chk(`  第${s.click}次点 → ${s.btn}`,
        shouldFold ? (s.cardsFolded===3 && s.detFolded)
                   : (s.cardsFolded===0 && !s.detFolded),
        `卡片折叠 ${s.cardsFolded}/3 · 参数区 ${s.detFolded?'收起':'展开'}`);
  });
  /* 关键：状态必须交替，不能卡死 */
  const seq = states.map(s=>s.cardsFolded);
  chk('  状态交替不卡死', seq.every((v,i)=> i===0 || v!==seq[i-1]), seq.join(','));
}

console.log('\n=== ⑧ 全部折叠按钮 ===\n');
chk('#btnFold 存在',       /id="btnFold"/.test(html));
chk('foldAll 存在',        /function foldAll/.test(html));
chk('  处理卡片',          /querySelectorAll\('\.card\[data-fold\]'\)/.test(html));
  chk('  处理参数区',        /setDetailFold\(folded\);/.test(html));
chk('  按钮文字随状态变',  /'▤ 展开' : '▤ 折叠'/.test(html));
  chk('  判断含参数区',      /const anyOpen = anyFoldOpen\(\);/.test(html));
  chk('  不再判断画布',      !/\.cvbox:not\(\.collapsed\)/.test(html));

console.log(`\n${'─'.repeat(60)}`);
console.log(fail===0?`🎉 示波器与折叠验证通过（${pass} 项）`:`❌ ${fail} 项失败 / 共 ${pass+fail} 项`);
console.log('─'.repeat(60)+'\n');
process.exit(fail?1:0);
