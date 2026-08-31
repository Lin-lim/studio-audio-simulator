/* =========================================================================
   验证最佳摆位求解算法的几何正确性
   从 HTML 中提取真实源码执行，而不是在测试里重写一遍逻辑
   （重写的话测试通过不代表实现正确）
   ========================================================================= */
const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','实时音频模拟.html'),'utf8');

/* 提取需要的函数源码 */
function grab(name){
  const i = html.indexOf('function '+name+'(');
  if(i<0) throw new Error('找不到函数 '+name);
  let d=0, j=html.indexOf('{', i);
  for(let k=j;k<html.length;k++){
    if(html[k]==='{') d++;
    else if(html[k]==='}'){ d--; if(d===0) return html.slice(i,k+1); }
  }
  throw new Error('括号不匹配: '+name);
}
const NAMES = ['clamp','spkCenterHeight','triHalfWidth','wallMargin','solveStereo',
               'solveSub','solveWedges','buildOptimalLayout'];

/* 提取 SPEAKERS 数据对象（纯字面量，用括号匹配找到结尾） */
function grabObj(name){
  const i = html.indexOf('const '+name+' = {');
  if(i<0) throw new Error('找不到对象 '+name);
  const j = html.indexOf('{', i);
  let d=0;
  for(let k=j;k<html.length;k++){
    if(html[k]==='{') d++;
    else if(html[k]==='}'){ d--; if(d===0) return html.slice(i,k+1)+';'; }
  }
  throw new Error('括号不匹配: '+name);
}
const src = NAMES.map(grab).join('\n') + '\n' + grabObj('SPEAKERS');
const F = new Function(src + '\nreturn {' + NAMES.concat('SPEAKERS').join(',') + '};')();
const { clamp, spkCenterHeight, triHalfWidth, wallMargin, solveStereo, solveSub,
        solveWedges, buildOptimalLayout } = F;

let pass=0, fail=0;
const chk=(n,ok,d='')=>{ok?pass++:fail++;console.log(`  ${ok?'✅':'❌'} ${n}${d?'   '+d:''}`);};
const near=(a,b,tol)=>Math.abs(a-b)<=tol;

/* 偏轴角：音箱轴向与"指向听者"方向的夹角，对准时应为 0 */
function offAxis(sp, ex, ey){
  const vx=ex-sp.x, vy=ey-sp.y, L=Math.hypot(vx,vy)||1e-9;
  const th=sp.rot*Math.PI/180;
  const ax=Math.sin(th), ay=-Math.cos(th);
  return Math.acos(clamp((vx*ax+vy*ay)/L,-1,1))*180/Math.PI;
}

console.log('\n=== ① 等边三角形几何 ===\n');

/* 在宽度充足的大房间里，三角形应严格等边 */
{
  const W=20, D=20;
  const {spkY, earY, a} = solveStereo(W, D, false);
  const dy = earY - spkY;
  const side = 2*a;                                  // 音箱间距
  const dist = Math.hypot(a, dy);                    // 音箱到听者
  chk('宽度充足时严格等边', near(side, dist, 1e-6),
      `间距 ${side.toFixed(3)} vs 距离 ${dist.toFixed(3)} m`);
  chk('半间距 a = dy/√3', near(a, dy/Math.sqrt(3), 1e-6),
      `${a.toFixed(3)} = ${dy.toFixed(3)}/1.732`);
  chk('听者对音箱张角 60°', near(2*Math.atan(a/dy)*180/Math.PI, 60, 1e-4),
      `${(2*Math.atan(a/dy)*180/Math.PI).toFixed(2)}°`);
  chk('triHalfWidth 与公式一致', near(triHalfWidth(dy), dy/Math.sqrt(3), 1e-12));
}

console.log('\n=== ② 38% 听音位（远场） ===\n');
{
  const D=20, W=20;
  const {earY} = solveStereo(W, D, false);
  chk('远场听者位于 38% 进深', near(earY, D*0.38, 1e-6),
      `${earY.toFixed(2)} m / ${D} m = ${(earY/D*100).toFixed(1)}%`);
  /* 近场应当显著更靠前，否则说明 near 分支没生效 */
  const nf = solveStereo(5.6, 7.2, true);
  chk('近场听者明显靠前于 38%', nf.earY < 7.2*0.38 - 0.3,
      `近场 ${nf.earY.toFixed(2)} < 远场 ${(7.2*0.38).toFixed(2)} m`);
  const tri = 2*nf.a;
  chk('近场三角形边长在 1.0~1.8m', tri>=1.0-1e-6 && tri<=1.8+1e-6, `${tri.toFixed(2)} m`);
}

console.log('\n=== ③ 侧墙留白 ===\n');
{
  chk('留白随房宽增长', wallMargin(3) < wallMargin(10));
  chk('留白封顶 1.2m', near(wallMargin(30), 1.2, 1e-9), `${wallMargin(30)} m`);
  chk('极小房间留白不低于 0.30m', wallMargin(1) >= 0.30-1e-9);
  /* 窄房间里音箱不得越界 */
  const W=2.0, D=4.0;
  const {spkY,a} = solveStereo(W,D,false);
  chk('窄房间音箱仍在房内', W/2-a >= 0.15-1e-9,
      `距墙 ${(W/2-a).toFixed(3)} m`);
}

console.log('\n=== ④ 低音炮 1/4 点 ===\n');
{
  const sb = solveSub(8, 10);
  chk('位于宽度 1/4 处', near(sb.x, 2.0, 1e-9), `x=${sb.x}`);
  chk('贴前墙摆放', sb.y <= 1.0, `y=${sb.y.toFixed(2)} m`);
  chk('置于地面高度', sb.z <= 0.35, `z=${sb.z} m`);
}

console.log('\n=== ⑤ 返听纵深保护 ===\n');
{
  const w1 = solveWedges(10, 5, 2.0, 1.9, 2);   // 纵深仅 0.1m
  chk('纵深不足时不放返听', w1.length === 0);
  const w2 = solveWedges(10, 5, 6.0, 1.0, 2);   // 纵深 5m
  chk('纵深充足时返回一对', w2.length === 2);
  if(w2.length===2){
    chk('  左右分居听者两侧', w2[0].x < 5 && w2[1].x > 5,
        `${w2[0].x.toFixed(2)} / ${w2[1].x.toFixed(2)}`);
    chk('  位于听者前方', w2[0].y < 6.0 && w2[0].y > 1.0, `y=${w2[0].y.toFixed(2)}`);
    chk('  贴地摆放', w2[0].z <= 0.35, `z=${w2[0].z} m`);
  }
}

console.log('\n=== ⑥ 各预设完整校验 ===\n');

const PRESETS_RAW = html.match(/const PRESETS = \{([\s\S]*?)\n\};/)[1];
/* 正则需容忍 H 与 surf 之间可选的 lp 字段（反射低通强度）。
   写死顺序会在新增字段时误报。 */
const presets = [...PRESETS_RAW.matchAll(
  /(\w+):\s*\{\s*W:([\d.]+),D:([\d.]+),H:([\d.]+),\s*(?:lp:([\d.]+),\s*)?surf:\{[^}]*\},\s*layout:\{([^}]*)\}/g)]
  .map(m=>({ key:m[1], W:+m[2], D:+m[3], H:+m[4],
             lp:(m[5]!==undefined? +m[5] : null),
             spec:eval('({'+m[6]+'})') }));

chk('解析出 7 个预设', presets.length===7, `实到 ${presets.length}`);
{
  const withLp = presets.filter(p=>p.lp!==null);
  chk('  每个预设都有 lp', withLp.length===7, `实到 ${withLp.length} 个`);
  chk('  lp 都在 0~1 内',  withLp.every(p=>p.lp>=0 && p.lp<=1));
  const vals = withLp.map(p=>p.lp);
  chk('  lp 有区分度',     new Set(vals).size >= 5, `${new Set(vals).size} 种取值`);
}

const EXPECT_N = { mono:1, stereo:2, '2.1':3, pa:5, rehearsal:4 };
let allOk = true;
presets.forEach(p=>{
  const L = buildOptimalLayout(p.W, p.D, p.H, p.spec);
  const n = L.srcs.length;
  const want = EXPECT_N[p.spec.sys];
  const okN = p.spec.sys==='pa' ? (n===5) : (n===want);
  const bad = [];

  // 全部在房间内
  L.srcs.forEach(s=>{
    if(s.x<0.15 || s.x>p.W-0.15) bad.push(`${s.type} x越界 ${s.x.toFixed(2)}`);
    if(s.y<0.15 || s.y>p.D-0.15) bad.push(`${s.type} y越界 ${s.y.toFixed(2)}`);
    if(s.z<=0 || s.z>p.H) bad.push(`${s.type} z越界 ${s.z.toFixed(2)}`);
  });
  // 偏轴角必须归零（toe-in 对准听者）
  L.srcs.forEach(s=>{
    const oa = offAxis(s, L.ear.x, L.ear.y);
    if(oa > 0.01) bad.push(`${s.type} 偏轴 ${oa.toFixed(2)}°`);
  });
  // 听者在房内
  if(L.ear.x<0.1||L.ear.x>p.W-0.1||L.ear.y<0.1||L.ear.y>p.D-0.1) bad.push('听者越界');

  const ok = okN && bad.length===0;
  if(!ok) allOk=false;
  const dim = `${p.W}×${p.D}×${p.H}`;
  console.log(`  ${ok?'✅':'❌'} ${p.key.padEnd(8)} ${dim.padEnd(14)} ${p.spec.sys.padEnd(10)} ${n} 只` +
              (bad.length? '  ⚠ '+bad[0] : ''));
});
chk('全部预设摆位合法', allOk);

console.log('\n=== ⑦ 声道分配 ===\n');
{
  const L = buildOptimalLayout(11,15,5.5,{sys:'pa',main:'floorstand',wedge:'monitor'});
  const chs = L.srcs.map(s=>s.ch);
  chk('主扩左为 L', chs[0]==='L');
  chk('主扩右为 R', chs[1]==='R');
  chk('低音炮为 L+R 合并', chs.includes('LR'));
  chk('返听含 L 与 R', chs.filter(c=>c==='L').length>=2 && chs.filter(c=>c==='R').length>=2);
  const mono = buildOptimalLayout(2.4,3.4,2.6,{sys:'mono',main:'portable'});
  chk('单声道系统为 LR 合并', mono.srcs[0].ch==='LR');
}

console.log('\n=== ⑧ 高度层次 ===\n');
{
  const L = buildOptimalLayout(11,15,5.5,{sys:'pa',main:'floorstand',wedge:'monitor'});
  const main = L.srcs.filter(s=>s.type.includes('floorstand'));
  const sub  = L.srcs.find(s=>s.type.includes('sub'));
  const wed  = L.srcs.filter(s=>s.type.includes('monitor'));
  chk('主扩高于低音炮', main[0].z > sub.z, `${main[0].z.toFixed(2)} > ${sub.z}`);
  chk('主扩高于返听',   main[0].z > wed[0].z, `${main[0].z.toFixed(2)} > ${wed[0].z}`);
  chk('全部低于层高',   L.srcs.every(s=>s.z < 5.5));
}

console.log('\n=== ⑨ 音量平衡（返听不得盖过主扩） ===\n');
{
  ['live','hall','garage'].forEach(k=>{
    const p = presets.find(x=>x.key===k);
    const L = buildOptimalLayout(p.W, p.D, p.H, p.spec);
    const mains = L.srcs.filter(s=>s.ch==='L'||s.ch==='R');
    const main  = mains.find(s=>!s.type.includes('monitor')) || mains[0];
    const wed   = L.srcs.filter(s=>s.type.includes('monitor') && (s.ch==='L'||s.ch==='R'));
    if(!wed.length){ console.log(`  ⏭️  ${k} 无返听`); return; }
    /* 听者处的相对声压：增益 / 距离 */
    const dM = Math.hypot(main.x-L.ear.x, main.y-L.ear.y);
    const dW = Math.hypot(wed[0].x-L.ear.x, wed[0].y-L.ear.y);
    const splM = (main.gs||1) / dM;
    const splW = (wed[0].gs||1) / dW;
    const ratio = 20*Math.log10(splW/splM);
    chk(`${k} 返听低于主扩`, ratio < 0.5,
        `${ratio.toFixed(1)} dB（主扩距 ${dM.toFixed(2)}m / 返听距 ${dW.toFixed(2)}m）`);
    chk(`  ${k} 返听不低于 -12dB（仍听得见）`, ratio > -12,
        `${ratio.toFixed(1)} dB`);
  });
}

console.log(`\n${'─'.repeat(60)}`);
console.log(fail===0?`🎉 摆位算法验证通过（${pass} 项）`:`❌ ${fail} 项失败 / 共 ${pass+fail} 项`);
console.log('─'.repeat(60)+'\n');
process.exit(fail?1:0);
