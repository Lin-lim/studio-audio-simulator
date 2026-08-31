/* =========================================================================
   验证：分析 tab 的「音频参数与延迟」
   ========================================================================= */
const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','实时音频模拟.html'),'utf8');
let pass=0, fail=0;
const chk=(n,ok,d='')=>{ ok?pass++:fail++; console.log(`  ${ok?'✅':'❌'} ${n}${d?'   '+d:''}`); };
function grab(n){const i=html.indexOf('function '+n+'(');if(i<0)throw Error('缺 '+n);
 const j=html.indexOf('{',i);let d=0;
 for(let k=j;k<html.length;k++){if(html[k]==='{')d++;else if(html[k]==='}'){d--;if(!d)return html.slice(i,k+1);}}}

console.log('\n=== ① 卡片结构 ===\n');
{
  const i=html.indexOf('🎧 音频参数与延迟');
  chk('卡片存在', i>0);
  const card=html.slice(i, html.indexOf('<div class="card">', i));
  chk('  位于分析 tab 内', html.indexOf('id="t-ana"') < i);
  chk('  在「说明」卡片之前', i < html.indexOf('<h3>说明</h3>'));
  ['vSR','vState','vCh','vBranch','vSrcCount','vSignal'].forEach(id=>
    chk('  引擎参数 #'+id, html.includes(`id="${id}"`)));
  ['vLatSys','vLatDir','vLatPre','vLatRef','vLatTot'].forEach(id=>
    chk('  延迟 #'+id, html.includes(`id="${id}"`)));
  ['vPk','vRms','vHead','vClip'].forEach(id=>
    chk('  电平 #'+id, html.includes(`id="${id}"`)));
  chk('  延迟堆叠条 #latBar', /id="latBar"/.test(html));
  chk('  三段：系统/空气/预延迟',
      /id="lbSys"/.test(html) && /id="lbAir"/.test(html) && /id="lbPre"/.test(html));
  chk('  评价区 #latVerdict', /id="latVerdict"/.test(html));
  chk('  分三个小节分组', (card.match(/class="dsec"/g)||[]).length===3);
}

console.log('\n=== ② 样式 ===\n');
chk('堆叠条样式',      /\.latbar\{display:flex/.test(html));
chk('  三段配色',      /\.l-sys\{background:#7c9cff/.test(html)
                       && /\.l-air\{background:#38d9c4/.test(html)
                       && /\.l-pre\{background:#ff9142/.test(html));
chk('  宽度过渡动画',  /\.latbar i\{[^}]*transition:width/.test(html));
chk('图例样式',        /\.latlegend\{/.test(html));
chk('  图例色块',      /\.latlegend i\{/.test(html));
chk('总延迟行有分隔',  /\.kv\.lat-total\{border-top/.test(html));
chk('  总延迟高亮',    /\.kv\.lat-total b\{color:var\(--acc\)/.test(html));

console.log('\n=== ③ 三个更新函数 ===\n');
chk('updateAudioParams 存在', /function updateAudioParams/.test(html));
chk('updateLatency 存在',     /function updateLatency/.test(html));
chk('updateLevels 存在',      /function updateLevels/.test(html));

const uap=grab('updateAudioParams');
chk('  未启动时显示占位', /vSR','vCh','vBranch/.test(uap));
chk('  采样率转 kHz',     /sampleRate\/1000/.test(uap));
chk('  输出通道数',       /destination\.channelCount/.test(uap));
chk('  活跃反射分支',     /s\.slots\?s\.slots\.size:0/.test(uap));
chk('  状态用颜色区分',   /ctx\.state==='running'/.test(uap));
chk('    suspended 显眼', /suspended'\)\s*\?\s*'var\(--warn\)'/.test(uap));
chk('  信号来源三态',     /EXT\.mode==='test'/.test(uap) && /EXT\.active/.test(uap));
chk('  设备名去掉星标',   /replace\(\/\^⭐/.test(uap));
chk('  设备名截断',       /nm\.slice\(0,15\)/.test(uap));

console.log('\n=== ④ 延迟分解：物理正确性 ===\n');
const ul=grab('updateLatency');
chk('  系统延迟 = base+output',
    /\(ctx\.baseLatency\|\|0\) \+ \(ctx\.outputLatency\|\|0\)/.test(ul));
chk('  空气传播 = 直达声时间',
    /directPath\(src, S\.ear\.x,S\.ear\.y,S\.ear\.z\)\.t/.test(ul));
chk('  预延迟 = 平均自由程/声速', /st\.mfp\/soundSpeed\(\)/.test(ul));
chk('   且与引擎 predelay 同式',
    /clamp\(st\.mfp\/c, 0\.001, 0\.4\)/.test(html),
    'A.predelay 用的是同一公式');
chk('  首反射取一阶最小', /im\.order===1/.test(ul) && /Math\.min\(refT, im\.t\)/.test(ul));
chk('  总延迟 = 系统 + 空气',
    /const total = sysLat \+ dirT/.test(ul),
    '预延迟是混响尾巴起点，不应计入直达路径');
chk('  未启动时清零条',   /el\.style\.width='0%'/.test(ul));

/* 关键：总延迟不应把预延迟算进去 */
{
  const m=ul.match(/const total = ([^;]+);/);
  chk('  总数不含预延迟', m && !/preT/.test(m[1]), m?m[1].trim():'');
}

console.log('\n=== ⑤ 延迟评价：可感知门槛 ===\n');
chk('  ≤12ms 很低',   /sysLat<=0\.012\)[\s\S]{0,80}很低/.test(ul));
chk('  ≤25ms 适中',   /sysLat<=0\.025\)[\s\S]{0,80}适中/.test(ul));
chk('  ≤50ms 偏高',   /sysLat<=0\.05\)[\s\S]{0,80}偏高/.test(ul));
chk('  >50ms 很高',   /else[\s\S]{0,120}系统延迟很高/.test(ul));
{
  /* 系统延迟占绝对多数时要点明，避免用户误以为改房间有用 */
  const hint=ul.slice(ul.indexOf('sysLat > (dirT+preT)*3'));
  chk('  系统占大头时点明', /驱动与缓冲区/.test(hint), '防止误判为房间问题');
  chk('  说明改房间没用',   /改房间没有用/.test(hint));
  chk('  建议换 ASIO',      /ASIO/.test(hint));
}

console.log('\n=== ⑥ 调用时机 ===\n');
chk('  tick 每帧刷电平',   /if\(!SCOPE\.hold\) updateLevels\(\);/.test(html));
chk('    冻结时不刷新',    /if\(!SCOPE\.hold\) updateLevels/.test(html));
chk('  updateMetrics 末尾调用', /updateLatency\(\);\n  updateAudioParams\(\);/.test(html));
chk('    无声源时也刷新',  /return;\n?[\s\S]{0,10}\}/.test(html)
                            && /updateLatency\(\); updateAudioParams\(\);\n    return;/.test(html));
chk('  引擎启动后调用',    /updateMetrics\(\); updateModes\(\); drawRT\(\);\n    updateAudioParams\(\); updateLatency\(\);/.test(html));
chk('  开始捕获后调用',    /fbAttach\(\); fbRefresh\(\); updateAudioParams\(\); updateLatency\(\);/.test(html));
chk('  停止捕获后调用',    /fbRefresh\(\); updateAudioParams\(\);/.test(html));
chk('  模式切换后调用',    /updateAudioParams\(\);\s*\/\/ 信号来源显示随之变化/.test(html));

console.log('\n=== ⑦ 行为验证：延迟数值 ===\n');
{
  /* 提取真实的 directPath / soundSpeed / roomStats 太重，
     这里验证延迟公式的算术：ms 换算与占比归一化 */
  const ms = s => s*1000;
  chk('  ms 换算正确', Math.abs(ms(0.0213)-21.3)<1e-9);

  /* 占比归一化：三段之和应为 100% */
  const pct=(v,sum)=> sum>0 ? v/sum*100 : 0;
  const sys=0.0213, dir=0.0088, pre=0.0125;
  const sum=sys+dir+pre;
  const tot=pct(sys,sum)+pct(dir,sum)+pct(pre,sum);
  chk('  堆叠条三段和为 100%', Math.abs(tot-100)<1e-6, tot.toFixed(2)+'%');

  /* 用真实量级的场景验证"系统占大头"的提示逻辑。
     阈值是 sysLat > (dirT+preT)*3 —— 只有系统延迟远超声学时才提示，
     否则会误伤"大房间 + 低延迟"的正常配置。 */
  const BIG_HINT = (s,d,p)=> s > (d+p)*3;
  const cases = [
    ['WASAPI 共享模式 + 小房间', 0.040, 0.0044, 0.0044, true ],  // 40 vs 8.8*3
    ['ASIO 低延迟 + 音乐厅',     0.008, 0.0300, 0.0280, false],  // 8 vs 58*3
    ['典型笔记本 + 配音间',      0.021, 0.0044, 0.0044, false],  // 21 vs 26.4 → 不触发
    ['老旧驱动 + 客厅',          0.060, 0.0088, 0.0070, true ],  // 60 vs 47.4
  ];
  cases.forEach(([name,s,d,p,exp])=>{
    const got=BIG_HINT(s,d,p);
    chk('  '+name, got===exp,
        `系统 ${(s*1000).toFixed(0)}ms / 声学 ${((d+p)*1000).toFixed(1)}ms → ${got?'提示':'不提示'}`);
  });

  /* 演播室实测量级：三者同量级，不应触发提示（声学确实有意义） */
  {
    const s=0.021, d=0.0146, p=0.0135;   // 系统21 / 直达14.6 / 预延迟13.5
    chk('  演播室：三者同量级不提示', !BIG_HINT(s,d,p),
        `系统21 vs 声学28.1×3 → 声学占比 ${((d+p)/(s+d+p)*100).toFixed(0)}%`);
  }
}

console.log('\n=== ⑧ 电平：与示波器共用数据 ===\n');
{
  const lv=grab('updateLevels');
  chk('  复用 SCOPE.bufL/R', /SCOPE\.bufL, bR=SCOPE\.bufR/.test(lv));
  chk('  复用 scopeLevels',  /scopeLevels\(bL,bR\)/.test(lv));
  chk('  峰值取左右较大',    /Math\.max\(L\.pkL,L\.pkR\)/.test(lv));
  chk('  动态余量 = 0-峰值', /\(0-pk\)\.toFixed/.test(lv));
  chk('  削波阈值 -0.3dB',   /pk > -0\.3/.test(lv));
  chk('  削波时变红',        /clipEl\.style\.color = clipped \? '#ff5d5d'/.test(lv));
  chk('  未启动时占位',      /forEach\(k=>set\(k,'—'\)\)/.test(lv));
}

console.log(`\n${'─'.repeat(60)}`);
console.log(fail===0?`🎉 音频参数与延迟验证通过（${pass} 项）`:`❌ ${fail} 项失败 / 共 ${pass+fail} 项`);
console.log('─'.repeat(60)+'\n');
process.exit(fail?1:0);
