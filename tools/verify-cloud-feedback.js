/* =========================================================================
   验证：① 顶部吸声云的几何与吸声 ② 啸叫检测判定逻辑

   做法：从 HTML 提取真实函数源码执行，不在测试里重写逻辑。
   纯函数直接测；依赖 DOM/AudioContext 的（fbTick）用最小 mock 驱动。
   ========================================================================= */
const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','实时音频模拟.html'),'utf8');

function grab(name){
  const i=html.indexOf('function '+name+'(');
  if(i<0) throw new Error('找不到函数 '+name);
  const j=html.indexOf('{',i); let d=0;
  for(let k=j;k<html.length;k++){
    if(html[k]==='{') d++;
    else if(html[k]==='}'){ d--; if(!d) return html.slice(i,k+1); }
  }
  throw new Error('括号不匹配: '+name);
}
function grabObj(name){
  const i=html.indexOf('const '+name+' = {');
  if(i<0) throw new Error('找不到对象 '+name);
  const j=html.indexOf('{',i); let d=0;
  for(let k=j;k<html.length;k++){
    if(html[k]==='{') d++;
    else if(html[k]==='}'){ d--; if(!d) return html.slice(i,k+1)+';'; }
  }
}
/* 提取 const NAME = {...}; 形式（FB、CLOUD_DEF 是对象字面量） */
function grabConstObj(name){
  const re=new RegExp('const '+name+' = \\{');
  const m=html.match(re);
  if(!m) throw new Error('找不到 const '+name);
  const j=html.indexOf('{', m.index); let d=0;
  for(let k=j;k<html.length;k++){
    if(html[k]==='{') d++;
    else if(html[k]==='}'){ d--; if(!d) return html.slice(m.index, k+1)+';'; }
  }
}

let pass=0, fail=0;
const chk=(n,ok,d='')=>{ok?pass++:fail++;console.log(`  ${ok?'✅':'❌'} ${n}${d?'   '+d:''}`);};

/* ---------- 构建执行环境 ---------- */
const NAMES=['clamp','matAlpha','cloudArea','cloudCover','cloudDefaultZ',
             'cloudBlocks','cloudAbsorbArea','cloudMake','spkCenterHeight'];
const src = NAMES.map(grab).join('\n') + '\n'
          + grabObj('MATS') + '\n'
          + grabConstObj('CLOUD_DEF') + '\n';
const S = { W:6, D:8, H:3.2, clouds:[], ear:{x:3,y:5,z:1.2} };
const BANDS=[125,250,500,1000,2000,4000];
const F = new Function('S','BANDS',
  src + '\nreturn {' + NAMES.concat(['MATS','CLOUD_DEF']).join(',') + '};')(S,BANDS);

console.log('\n=== ① 吸声云：覆盖率 ===\n');
{
  S.clouds=[];
  chk('无云板 → 覆盖率 0%', F.cloudCover()===0);
  S.clouds=[{x:3,y:4,w:2,d:2,z:2.6,mat:'panel100'}];
  chk('单块 2×2 / 48m² 顶 → 8.3%', Math.abs(F.cloudCover()-4/48)<1e-9,
      (F.cloudCover()*100).toFixed(1)+'%');
  S.clouds=[]; for(let i=0;i<50;i++) S.clouds.push({x:0,y:0,w:99,d:99,z:2.6,mat:'panel100'});
  chk('过量 → 封顶 100%', F.cloudCover()===1);
  S.clouds=[];
}

console.log('\n=== ② 吸声云：双面吸声 ===\n');
{
  S.clouds=[{x:3,y:4,w:2,d:2,z:2.6,mat:'panel100'}];   // 几何 4 m²，双面 8 m²
  chk('几何面积 4 m²', F.cloudArea()===4);
  const a1k = F.matAlpha('panel100', 3);               // 1kHz 标称 0.99
  const A   = F.cloudAbsorbArea(3);
  /* 实现里对 α 做了 Math.min(.985, α) 夹取——这是必要的：
     α=1 会让 Eyring 项 -ln(1-α) 发散成无穷大。故期望值按 0.985 算。 */
  const aCap = Math.min(0.985, a1k);
  chk('1kHz 等效吸声 = 8×min(α,.985)', Math.abs(A - 8*aCap) < 1e-9,
      `${A.toFixed(2)} m² = 8 × ${aCap}`);
  chk('α 夹取确实生效（.99→.985）', a1k > 0.985 && aCap === 0.985,
      `标称 ${a1k} → 夹取 ${aCap}`);
  /* 低频吸声应显著低于高频（吸音棉的物理特性） */
  const alo=F.cloudAbsorbArea(0), ahi=F.cloudAbsorbArea(3);
  chk('低频吸声 < 高频吸声', alo < ahi,
      `125Hz ${alo.toFixed(2)} < 1kHz ${ahi.toFixed(2)} m²`);
  /* 反射型板材（实木）吸声应远低于吸音棉 */
  S.clouds[0].mat='wood';
  const wA=F.cloudAbsorbArea(3);
  S.clouds[0].mat='panel100';
  const pA=F.cloudAbsorbArea(3);
  chk('实木板吸声 < 吸音棉', wA < pA*0.5,
      `wood ${wA.toFixed(2)} vs panel100 ${pA.toFixed(2)} m²`);
  S.clouds=[];
}

console.log('\n=== ③ 遮挡几何 ===\n');
{
  S.clouds=[{x:3,y:5,w:2,d:2,z:2.6,mat:'panel100'}];   // x∈[2,4], y∈[4,6]
  const ex=3, ey=5, ez=1.2;
  const mz = 2*S.H - 0.9;                              // 一阶顶面镜像
  const t = (2.6-ez)/(mz-ez);
  chk('交点参数 t ∈ (0,1)', t>0 && t<1, `t=${t.toFixed(4)}`);

  chk('正下方反射 → 遮挡',  !!F.cloudBlocks(3, 5, mz, ex,ey,ez));
  chk('对角反射  → 不遮挡', !F.cloudBlocks(0.5, 0.5, mz, ex,ey,ez));
  /* 单独检验 x / y 方向边界（另一轴固定在中心） */
  chk('x 越界 5cm → 不遮挡',
      !F.cloudBlocks(ex+(4.05-ex)/t, ey, mz, ex,ey,ez));
  chk('x 内侧 5cm → 遮挡',
      !!F.cloudBlocks(ex+(3.95-ex)/t, ey, mz, ex,ey,ez));
  chk('y 越界 5cm → 不遮挡',
      !F.cloudBlocks(ex, ey+(6.05-ey)/t, mz, ex,ey,ez));
  chk('y 内侧 5cm → 遮挡',
      !!F.cloudBlocks(ex, ey+(5.95-ey)/t, mz, ex,ey,ez));
  /* 云板在声源与听者之间的高度之外时不应遮挡 */
  S.clouds=[{x:3,y:5,w:2,d:2,z:1.0,mat:'panel100'}];   // 低于耳朵高度
  chk('云板低于耳朵 → 不遮挡', !F.cloudBlocks(3,5,mz,ex,ey,ez));
  S.clouds=[];
}

console.log('\n=== ④ 云板参数合法性 ===\n');
{
  const c = F.cloudMake(100, 100, 1.2, 2.6, 'panel100');   // 越界坐标
  chk('越界坐标被夹回房内', c.x<=S.W-0.6 && c.y<=S.D-0.6,
      `(${c.x.toFixed(2)}, ${c.y.toFixed(2)})`);
  const c2 = F.cloudMake(3, 4, 1.2, 99, 'panel100');       // 超高
  chk('超高被夹到层高以下', c2.z < S.H, `z=${c2.z.toFixed(2)} < ${S.H}`);
  const c3 = F.cloudMake(3, 4, 1.2, null, 'panel100');     // 默认高度
  chk('默认高度在合理区间', c3.z>1.8 && c3.z<S.H, `z=${c3.z.toFixed(2)}`);
}

console.log('\n=== ⑤ 啸叫检测：状态机 ===\n');
{
  /* 提取 FB 与 fbTick，注入最小 mock。
     fbTick 依赖 clamp（dt 保护），一并提取。 */
  const fbSrc = grab('clamp') + '\n'
              + grabConstObj('FB') + '\n' + grab('fbTick') + '\n' + grab('fbReset');
  const N = 1024;
  let spectrum = new Float32Array(N);

  const mockAn = {
    fftSize: 2048, frequencyBinCount: N,
    getFloatFrequencyData(a){ a.set(spectrum); }
  };
  /* 频谱构造 */
  const fillBroad=(v, jitter)=>{ for(let i=0;i<N;i++) spectrum[i]=v+(Math.random()-0.5)*jitter; };
  const setPeak=(bin, v)=>{ spectrum[bin]=v; };

  const mkEnv = ()=>({
    A:{ ctx:{ sampleRate:48000 } },
    EXT:{ mode:'card', active:true },
    FB:null,
  });
  const E = mkEnv();
  /* fbTick 内部会调 fbRender/fbRenderLive 更新 DOM，
     测试环境里没有真实 DOM，注入空实现即可（不影响判定逻辑） */
  const fns = new Function('A','EXT','document','window','fbRender','fbRenderLive',
    fbSrc + '\nreturn {FB, fbTick, fbReset};');
  const noop = ()=>{};
  const M = fns(E.A, E.EXT, {getElementById:()=>null}, {}, noop, noop);
  const FB = M.FB;
  FB.an = mockAn; FB.buf = new Float32Array(N); FB.wired = true;

  /* t 必须跨调用连续递增 —— 真实浏览器里 performance.now() 单调递增。
     每次从 0 重来会得到负 dt，那不是实现的问题而是测试喂了不可能的输入。 */
  let clock = 0;
  const run=(frames, dtMs=16)=>{
    for(let i=0;i<frames;i++){ clock+=dtMs; M.fbTick(clock); }
    return FB.state;
  };

  /* 场景1：宽带信号（粉红噪声）→ 不应触发 */
  M.fbReset(); fillBroad(-60, 14);
  let st = run(200);
  chk('宽带信号 → idle（不误报）', st==='idle',
      `峰值 ${FB.peakDb.toFixed(0)}dB 突出度 ${FB.prom.toFixed(1)}dB`);

  /* 场景2：窄带持续尖峰 → 应触发 alarm */
  M.fbReset(); fillBroad(-65, 6); setPeak(200, -8);
  st = run(30);
  const watchOK = (st==='watch' || st==='alarm');
  chk('窄带尖峰 0.5s → 进入疑似/告警', watchOK, `state=${st}`);
  st = run(60);
  chk('窄带尖峰 1.4s → 确认告警', st==='alarm',
      `state=${st} ${Math.round(FB.peakHz)}Hz 突出度 ${FB.prom.toFixed(0)}dB`);
  chk('  峰值频率换算正确', Math.abs(FB.peakHz - 200*48000/2048) < 1,
      `${Math.round(FB.peakHz)} Hz`);
  FB.holdMs=0; FB.peakBin=-1;

  /* 场景3：扫频（频率持续移动）→ 不应触发 */
  M.fbReset(); fillBroad(-65, 6);
  for(let i=0;i<150;i++){ fillBroad(-65,6); setPeak(100+i*6, -8); clock+=16; M.fbTick(clock); }
  chk('扫频（频率移动）→ 不误报', FB.state==='idle',
      `state=${FB.state} 突出度 ${FB.prom.toFixed(0)}dB`);

  /* 场景4：弱信号（低于阈值）→ 不触发 */
  M.fbReset(); fillBroad(-88, 4); setPeak(200, -40);
  st = run(150);
  chk('弱信号 → 不触发', st==='idle',
      `峰值 ${FB.peakDb.toFixed(0)}dB < 阈值 ${FB.PEAK_DB}dB`);

  /* 场景5：测试音模式（非声卡）→ 完全不检测 */
  M.fbReset(); fillBroad(-65,6); setPeak(200,-8);
  E.EXT.mode='test';
  st = run(150);
  chk('内置测试音模式 → 不检测', st==='idle', `state=${st}`);
  E.EXT.mode='card';

  /* 场景6：未启动捕获 → 不检测 */
  M.fbReset(); fillBroad(-65,6); setPeak(200,-8);
  E.EXT.active=false;
  st = run(100);
  chk('未捕获 → 不检测', st==='idle');
  E.EXT.active=true;

  /* 场景7：信号消失后恢复 idle */
  M.fbReset(); fillBroad(-65,6); setPeak(200,-8);
  run(60);                                    // 先进 alarm
  const wasAlarm = (FB.state==='alarm');
  fillBroad(-70, 8);                          // 尖峰消失
  st = run(120);
  chk('尖峰消失 → 恢复 idle', wasAlarm && st==='idle', `${wasAlarm?'曾告警':'未告警'} → ${st}`);
}

console.log('\n=== ⑥ 配置风险评估 ===\n');
{
  const rbSrc = grab('fbAssessRisk') + '\n' + grab('extIsVirtual');
  const EXT_HINTS = html.match(/const EXT_HINTS = \[([\s\S]*?)\];/)[1];
  const mkEl = (text)=>({ selectedOptions:[{textContent:text}] });
  let curEl = mkEl('麦克风');
  const E2 = new Function('document','window','EXT','FB',
    'const EXT_HINTS=['+EXT_HINTS+'];\n' + rbSrc +
    '\nreturn {fbAssessRisk};');
  const FB2 = {risk:'none', riskMsg:''};

  /* 注意：EXT_HINTS 在函数体内部用 const 声明，不能再作为参数传入，
     否则会 "Identifier has already been declared"。 */
  const R = E2(
    { getElementById:(id)=> id==='extDev' ? curEl : null },
    { __outSink:'default' },
    { mode:'card' }, FB2
  ).fbAssessRisk;

  curEl = mkEl('立体声混音 (Realtek)');
  let r = R();
  chk('立体声混音 → 高风险', r==='high', r);

  curEl = mkEl('CABLE Output (VB-Audio)');
  r = R();
  chk('虚拟声卡 + 默认输出 → 高风险', r==='high', r);

  /* 输出改为独立设备后应降级 */
  const R2 = new Function('document','window','EXT','FB',
    'const EXT_HINTS=['+EXT_HINTS+'];\n' + rbSrc + '\nreturn {fbAssessRisk};')(
    { getElementById:(id)=> id==='extDev' ? mkEl('CABLE Output (VB-Audio)') : null },
    { __outSink:'realtek-hdmi-1' }, {mode:'card'}, FB2
  ).fbAssessRisk;
  r = R2();
  chk('虚拟声卡 + 独立输出 → 低风险', r==='low', r);

  curEl = mkEl('麦克风 (Realtek)');
  const R3 = new Function('document','window','EXT','FB',
    'const EXT_HINTS=['+EXT_HINTS+'];\n' + rbSrc + '\nreturn {fbAssessRisk};')(
    { getElementById:(id)=> id==='extDev' ? mkEl('麦克风 (Realtek)') : null },
    { __outSink:'default' }, {mode:'card'}, FB2
  ).fbAssessRisk;
  r = R3();
  chk('普通麦克风 → 无风险', r==='none', r);
}

console.log('\n=== ⑥点五、未检测原因与刷新时机 ===\n');
{
  /* fbWhyIdle：四条前提缺一不可，缺谁就说明谁 */
  const why = grab('fbWhyIdle');
  chk('fbWhyIdle 存在', !!why);
  chk('  提示未启动引擎',   /请先点/.test(why));
  chk('  提示测试音模式',   /EXT\.mode!=='card'/.test(why));
  chk('  提示未开始捕获',   /!EXT\.active/.test(why));
  chk('  提示分析器未接',   /!FB\.wired/.test(why));
  chk('  全部满足时返回 null', /return null;/.test(why));

  /* 行为验证：四种未检测状态各返回对应原因 */
  const mk = (mode, active, wired, ready)=>{
    const f = new Function('A','EXT','FB',
      why + '\nreturn {fbWhyIdle};');
    return f({ready}, {mode, active}, {wired}).fbWhyIdle();
  };
  chk('  未启动引擎 → 提示启动',   /启动音频引擎/.test(mk('card',false,false,false)||''));
  chk('  test 模式 → 提示测试音',   /测试音/.test(mk('test',false,false,true)||''));
  chk('  card 未捕获 → 提示开始捕获', /开始捕获/.test(mk('card',false,false,true)||''));
  chk('  card 已捕获但分析器未接 → 提示重连', /重新捕获/.test(mk('card',true,false,true)||''));
  chk('  全满足 → 正在检测(null)', mk('card',true,true,true)===null);

  /* 刷新时机：这是本次修复的核心 */
  chk('fbRefresh 统一入口存在',  /function fbRefresh\(\)/.test(html));
  const n = (html.match(/fbRefresh\(\);/g)||[]).length;
  chk('  已在多处调用（≥5）', n>=5, `实到 ${n} 处`);
  chk('  模式切换后刷新',     /fbRefresh\(\);.*\/\/ 切换后重估/s.test(html)
                              || /切换后重估接线风险/.test(html));
  chk('  开始捕获后刷新',     /fbAttach\(\); fbRefresh\(\);/.test(html));
  chk('  停止捕获后刷新',     /fbDetach\(\);[\s\S]{0,60}fbRefresh\(\);/.test(html));
  chk('  引擎启动后刷新',     /fbRefresh\(\);\n    updateMetrics/.test(html));
  chk('  设备枚举后刷新',     /_raf\(\(\)=>\{ try\{ fbRefresh/.test(html));
  chk('  换设备时刷新',       /sel\.onchange = \(\)=>\{ try\{ fbRefresh/.test(html));

  /* idle 分支必须显示"正在检测"，不能静默隐藏 */
  const idleBranch = html.slice(html.indexOf("if(FB.state==='idle'){"),
                                html.indexOf("if(FB.state==='idle'){")+900);
  chk('  未检测时显示原因',   /未检测 ·/.test(idleBranch));
  chk('  正在检测时有指示',   /正在检测声反馈/.test(idleBranch));
  chk('  高风险优先于未检测', idleBranch.indexOf('risk===') < idleBranch.indexOf('fbWhyIdle'));
}

console.log('\n=== ⑥点六、左下角「加装吸音棉」提示 ===\n');
{
  chk('提示元素 #fTip 存在',   /id="fTip"/.test(html));
  chk('  文字元素 #fTipTxt',   /id="fTipTxt"/.test(html));
  chk('  位于 footer 内',      html.indexOf('<footer>') < html.indexOf('id="fTip"'));
  chk('  在所有 fstat 之前',
      html.indexOf('id="fTip"') < html.indexOf('id="fRT"'));

  /* 样式：平时安静，告警时才亮 */
  chk('#fTip 默认弱化',        /#fTip\{cursor:pointer;color:var\(--txt3\)/.test(html));
  chk('  有 alert 态（黄）',   /#fTip\.alert\{color:var\(--warn\)/.test(html));
  chk('  有 alarm 态（红闪）', /#fTip\.alarm\{[^}]*animation:fTipBlink/.test(html));
  chk('  定义闪烁动画',        /@keyframes fTipBlink/.test(html));
  chk('  定义引导高亮动画',    /@keyframes tipPulse/.test(html));
  chk('  tip-pulse 类存在',    /\.tip-pulse\{animation:tipPulse/.test(html));

  /* 联动逻辑 */
  const syn = html.match(/function fbSyncTip\(\)\{[\s\S]*?\n\}/)[0];
  chk('fbSyncTip 存在', !!syn);
  chk('  alarm 态文案',     /alarm/.test(syn) && /点此加装吸音棉/.test(syn));
  chk('  watch 态文案',     /watch/.test(syn));
  chk('  risk 高时提示',    /risk==='high'/.test(syn));
  chk('  平时为静态提示',   /啸叫 → 加装吸音棉/.test(syn));
  chk('  每次先清状态类',   /classList\.remove\('alert','alarm'\)/.test(syn));

  /* 行为验证：四种状态返回对应文案 */
  /* 行为验证：四种状态返回对应文案。
     直接执行源码，把 $('fTip') / $('fTipTxt') 换成 mock 对象。 */
  const mkTip = (state, risk)=>{
    const mkCls = ()=>({_c:[],
      add(...a){ a.forEach(x=>this._c.push(x)); },
      remove(...a){ a.forEach(x=>{ const i=this._c.indexOf(x); if(i>=0) this._c.splice(i,1); }); }});
    const box = { classList:mkCls(), textContent:'' };
    const txt = { textContent:'' };
    /* 注意：源码是 const box=$('fTip')，若把 $('fTip') 替换成同名的 box，
       会变成 const box=box —— 触发 TDZ 报错。故 mock 用带前缀的名字。 */
    const body = syn
      .replace(/\$\('fTip'\)/g, '__box')
      .replace(/\$\('fTipTxt'\)/g, '__txt');
    const g = new Function('FB','__box','__txt',
      body + '\nfbSyncTip(); return {box:__box, txt:__txt};');
    return g({state:state, risk:risk}, box, txt);
  };
  let r=mkTip('alarm','none');
  chk('  alarm → 红色 + 闪烁', r.box.classList._c.includes('alarm'), r.txt.textContent);
  chk('  alarm 文案含动作指引', /点此加装/.test(r.txt.textContent));
  r=mkTip('watch','none');
  chk('  watch → 黄色告警', r.box.classList._c.includes('alert'), r.txt.textContent);
  r=mkTip('idle','high');
  chk('  接线高风险 → 黄色', r.box.classList._c.includes('alert'), r.txt.textContent);
  r=mkTip('idle','none');
  chk('  正常 → 无状态类', r.box.classList._c.length===0, r.txt.textContent);

  /* 点击引导 */
  const go = html.match(/function fbTipGoto\(\)\{[\s\S]*?\n\}/)[0];
  chk('fbTipGoto 存在', !!go);
  chk('  切到房间 tab',     /data-t="room"/.test(go));
  chk('  高亮吸音棉按钮',   /qBass/.test(go) && /qCloud/.test(go));
  chk('  高亮三个目标',     (go.match(/'q\w+'/g)||[]).length===3);
  chk('  强制重排以重播动画', /void el\.offsetWidth/.test(go));
  chk('  动画后清理类',     /remove\('tip-pulse'\)/.test(go));
  chk('  不擅自改材料',     !/S\.surf\s*=/.test(go));
  chk('  给出说明',         /setHint/.test(go));
  /* 必须区分电环路与声学环路：吸音棉只对后者有效 */
  chk('  识别电环路',       /立体声混音\|stereo mix/.test(go));
  chk('  电环路时说明无效', /加装吸音棉无效/.test(go));
  chk('  声学环路时说明有效', /对声学反馈有效/.test(go));
  chk('提示已绑定点击',     /\$\('fTip'\)\.?[\s\S]{0,20}onclick/.test(html)
                            || /if\(t\) t\.onclick/.test(html));

  /* 包装：任何调用 fbRender 的地方都会同步提示 */
  chk('fbRender 为包装函数', /function fbRender\(\)\{[\s\S]{0,120}fbSyncTip/.test(html));
  chk('  内部实现已改名',    /function fbRenderInner/.test(html));
  chk('  fbRefresh 不再重复', !/fbRender\(\); fbSyncTip\(\);/.test(html));
}

console.log('\n=== ⑦ 集成：源码中的应用点 ===\n');
{
  chk('roomStats 计入云板吸声',   /cloudAbsorbArea\(bi\)/.test(html));
  chk('imageSources 应用遮挡',    /cloudBlocks\(mx,my,mz, ex,ey,ez\)/.test(html));
  chk('2D 绘制已接入',            /drawClouds2D\(g\);/.test(html));
  chk('3D 绘制已接入',            /kind==='cloud'/.test(html));
  chk('剖面图绘制已接入',         /drawCloudsSection\(/.test(html));
  chk('hitTest 支持云板',         /t:'cloud'/.test(html));
  chk('拖动已实现',               /S\.view\.drag==='cloud'/.test(html));
  chk('tick 中调用检测',          /fbTick\(now\);/.test(html));
  chk('捕获时接入分析器',         /fbAttach\(\);/.test(html));
  chk('停止时断开分析器',         /fbDetach\(\);/.test(html));
  chk('UI 提示框存在',            /id="fbBox"/.test(html));
  chk('房间尺寸变化夹回云板',     /cloudFitRoom\(\); cloudSyncUI\(\);/.test(html));
}

console.log(`\n${'─'.repeat(62)}`);
console.log(fail===0?`🎉 云板与啸叫检测验证通过（${pass} 项）`:`❌ ${fail} 项失败 / 共 ${pass+fail} 项`);
console.log('─'.repeat(62)+'\n');
process.exit(fail?1:0);
