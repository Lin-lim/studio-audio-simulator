/* =========================================================================
   验证：反射低通（每次反射额外衰减高频）
   ========================================================================= */
const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','实时音频模拟.html'),'utf8');
let pass=0, fail=0;
const chk=(n,ok,d='')=>{ ok?pass++:fail++; console.log(`  ${ok?'✅':'❌'} ${n}${d?'   '+d:''}`); };
function grab(n){const i=html.indexOf('function '+n+'(');if(i<0)throw Error('缺 '+n);
 const j=html.indexOf('{',i);let d=0;
 for(let k=j;k<html.length;k++){if(html[k]==='{')d++;else if(html[k]==='}'){d--;if(!d)return html.slice(i,k+1);}}}

/* 取真实源码执行，而非在测试里重写逻辑 —— 重写的话通过不代表实现对 */
const src = 'const REFL_LP_FC0=5000;const REFL_LP_SLOPE=0.35;'
  + 'const BANDS=[125,250,500,1000,2000,4000];const FDN_TAIL_ORDER=6;const FDN_TAIL_LP_MIX=0.35;\n'
  + grab('clamp')+'\n'+grab('reflLPCutoff')+'\n'+grab('reflLPStep')+'\n'
  + grab('reflLPGain')+'\n'+grab('reflLPGainBands');
const M = new Function(src+'\nreturn {reflLPCutoff,reflLPStep,reflLPGain,reflLPGainBands};')();

console.log('\n=== ① 源码结构 ===\n');
chk('常量 REFL_LP_FC0',    /const REFL_LP_FC0\s*=\s*5000/.test(html));
chk('常量 REFL_LP_SLOPE',  /const REFL_LP_SLOPE\s*=\s*0\.35/.test(html));
chk('reflLPCutoff 存在',   /function reflLPCutoff/.test(html));
chk('reflLPStep 存在',     /function reflLPStep/.test(html));
chk('reflLPGain 存在',     /function reflLPGain/.test(html));
chk('reflLPGainBands 存在',/function reflLPGainBands/.test(html));
chk('S.reflLP 状态',       /reflLP:0\.55/.test(html));
chk('  有物理注释',        /表面粗糙度散射/.test(html));
chk('  说明与空气吸收不重复', /空气吸收已按距离单独计算/.test(html));

console.log('\n=== ② 关闭时必须完全无染色 ===\n');
{
  let mx=0;
  for(let o=0;o<=3;o++)
    M.reflLPGainBands(o,0).forEach(v=>{ mx=Math.max(mx, Math.abs(20*Math.log10(v))); });
  chk('强度=0 各阶各频段恒为 1', mx<1e-9, `最大偏差 ${mx.toExponential(1)} dB`);
  chk('  截止频率为无穷',       !isFinite(M.reflLPCutoff(1,0)));
  chk('  直达声(order=0)恒为 1', M.reflLPGain(0, 4000, 1)===1);
  chk('  负阶数安全',           M.reflLPGain(-1, 4000, 1)===1);
}

console.log('\n=== ③ 单调性：阶数越高越暗 ===\n');
{
  for(const s of [0.2, 0.55, 1.0]){
    let mono=true;
    for(let bi=0;bi<6;bi++){
      let prev=Infinity;
      for(let o=0;o<=3;o++){
        const g=M.reflLPGainBands(o,s)[bi];
        if(g>prev+1e-12) mono=false;
        prev=g;
      }
    }
    chk(`  强度 ${s} 逐阶递减`, mono);
  }
}

console.log('\n=== ④ 频率选择性：高频衰减远大于低频 ===\n');
{
  for(const s of [0.3, 0.55, 1.0]){
    const g=M.reflLPGainBands(3,s);
    const lf=20*Math.log10(g[0]), hf=20*Math.log10(g[5]);
    chk(`  强度 ${s}: 4kHz ${hf.toFixed(1)}dB vs 125Hz ${lf.toFixed(2)}dB`,
        (lf-hf) > 1.0 && Math.abs(lf) < 0.1,
        `差 ${(lf-hf).toFixed(2)}dB · 低频几乎无损`);
  }
  /* 逐频段必须单调（频率越高衰减越多） */
  const g=M.reflLPGainBands(3,1);
  let mono=true;
  for(let bi=1;bi<6;bi++) if(g[bi] > g[bi-1]+1e-12) mono=false;
  chk('  衰减随频率单调增加', mono);
}

console.log('\n=== ⑤ 数值量级是否合理 ===\n');
{
  const d=(o,s)=>20*Math.log10(M.reflLPGain(o,4000,s));
  chk('  默认(0.55) 一阶 ', Math.abs(d(1,0.55)-(-1.12))<0.2, d(1,0.55).toFixed(2)+' dB');
  chk('  默认(0.55) 三阶 ', Math.abs(d(3,0.55)-(-4.29))<0.3, d(3,0.55).toFixed(2)+' dB');
  chk('  满强度(1.0) 三阶', Math.abs(d(3,1.0)-(-10.05))<0.5, d(3,1.0).toFixed(2)+' dB');
  chk('  满强度不过度',     d(3,1.0) > -15, '三阶 -10dB 内，未喧宾夺主');
  chk('  一阶温和',         d(1,1.0) > -3,  '一阶仅 -2.1dB，不破坏早期反射音色');
}

console.log('\n=== ⑥ 截止频率随反射序号下降 ===\n');
{
  const c=[1,2,3,4].map(k=>M.reflLPCutoff(k,1));
  let desc=true;
  for(let i=1;i<c.length;i++) if(c[i]>=c[i-1]) desc=false;
  chk('  逐次下降', desc, c.map(v=>v.toFixed(0)).join(' → ')+' Hz');
  chk('  一阶 = 5000Hz', Math.abs(c[0]-5000)<1);
  /* 掠射/粗糙导致后续反射更暗 */
  chk('  三阶明显低于一阶', c[2] < c[0]*0.7, `${c[2].toFixed(0)} < ${(c[0]*0.7).toFixed(0)}`);
}

console.log('\n=== ⑦ 后期混响尾巴 ===\n');
chk('FDN_TAIL_ORDER 已定义', /const FDN_TAIL_ORDER = 6/.test(html));
chk('FDN_TAIL_LP_MIX 已定义',/const FDN_TAIL_LP_MIX = 0\.35/.test(html));
chk('  接入 tailHigh',       /lpTailDb\*FDN_TAIL_LP_MIX\*S\.tailAmt/.test(html));
chk('  说明避免重复扣减',    /混响室法测得的材料吸声系数已经包含了散射损失/.test(html));
chk('  clamp 下限已放宽',    /-34, 6/.test(html));
{
  const d=s=>20*Math.log10(M.reflLPGain(6,4000,s))*0.35;
  chk('  默认尾巴衰减适度', Math.abs(d(0.55)-(-3.91))<0.5, d(0.55).toFixed(2)+' dB');
  chk('  满强度尾巴不过暗', d(1.0) > -14, d(1.0).toFixed(2)+' dB');
  chk('  关闭时无影响',     Math.abs(d(0))<1e-9);
  /* 尾巴应比三阶更暗（高阶散射更多） */
  const t=20*Math.log10(M.reflLPGain(6,4000,1));
  chk('  6阶比3阶更暗',     t < 20*Math.log10(M.reflLPGain(3,4000,1)),
      `${t.toFixed(1)} < ${(20*Math.log10(M.reflLPGain(3,4000,1))).toFixed(1)} dB`);
}

console.log('\n=== ⑧ 接入 imageSources ===\n');
chk('lpTab 按阶数预计算',  /lpTab\[o\] = reflLPGainBands\(o, S\.reflLP\)/.test(html));
chk('  上限为 maxOrder',   /for\(let o=0;o<=maxOrder;o\+\+\)/.test(html));
chk('  乘入反射增益',      /r \*= lpTab\[order\]\[bi\];/.test(html));
chk('  位置在空气吸收前',  html.indexOf('r *= lpTab[order][bi];') < html.indexOf('Math.exp(-air[bi]*dist)'));
{
  /* 直达声必须不受影响 */
  const dp=grab('directPath');
  chk('  directPath 未被改动', !/lpTab|reflLP/.test(dp), '直达声恒为 1，不受低通影响');
}

console.log('\n=== ⑨ 界面 ===\n');
chk('滑块 #rReflLP',      /id="rReflLP"/.test(html));
chk('  范围 0~1',         /id="rReflLP" min="0" max="1"/.test(html));
chk('  默认 0.55',        /id="rReflLP"[^>]*value="0\.55"/.test(html));
chk('  数值显示',         /id="vReflLP"/.test(html));
chk('  实时说明区',       /id="lpInfo"/.test(html));
chk('绑定 oninput',       /\$\('rReflLP'\)\.oninput/.test(html));
chk('  触发 updateAll',   /S\.reflLP=\+\$\('rReflLP'\)\.value; syncUI\(\); updateAll\(\);/.test(html));
{
  /* 说明区显示各阶实际衰减 */
  const seg=html.slice(html.indexOf("$('vReflLP').textContent"), html.indexOf("$('vReflLP').textContent")+700);
  chk('  显示一阶衰减',   /dB\(1\)/.test(seg));
  chk('  显示三阶衰减',   /dB\(3\)/.test(seg));
  chk('  显示尾巴衰减',   /FDN_TAIL_ORDER/.test(seg));
  chk('  关闭时明确提示', /已关闭/.test(seg));
}

console.log('\n=== ⑩ 预设与重置 ===\n');
{
  const lp=[...html.matchAll(/(booth|control|live|living|bath|hall|garage):\s*\{[^}]*?lp:([\d.]+)/g)];
  chk('七个预设都设了 lp', lp.length===7, `实到 ${lp.length} 个`);
  const m=Object.fromEntries(lp.map(x=>[x[1],+x[2]]));
  chk('  浴室最光滑(最小)', m.bath===Math.min(...Object.values(m)), `bath=${m.bath}`);
  chk('  音乐厅最粗糙(最大)', m.hall===Math.max(...Object.values(m)), `hall=${m.hall}`);
  chk('  loadPreset 应用', /if\(p\.lp !== undefined\) S\.reflLP = p\.lp;/.test(html));
  chk('  未指定时不覆盖',  /!== undefined/.test(html));
  chk('  resetAll 还原',   /S\.reflLP = \(D\.reflLP!==undefined\)/.test(html));
  chk('  快照含 reflLP',   /reflLP:S\.reflLP/.test(html));
}

console.log(`\n${'─'.repeat(60)}`);
console.log(fail===0?`🎉 反射低通验证通过（${pass} 项）`:`❌ ${fail} 项失败 / 共 ${pass+fail} 项`);
console.log('─'.repeat(60)+'\n');
process.exit(fail?1:0);
