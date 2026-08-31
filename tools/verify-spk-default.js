/* 验证：① 听者功能完整未被删 ② 首屏/预设声源全部为可连接音响 */
const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','实时音频模拟.html'),'utf8');
let pass=0,fail=0;
const chk=(n,ok,d='')=>{ok?pass++:fail++;console.log(`  ${ok?'✅':'❌'} ${n}${d?'   '+d:''}`);};

console.log('\n=== ① 听者功能完整性 ===\n');

// 听者 tab 的 DOM 元素必须都在
const earIds = ['eX','eY','eZ','eRot','eHrtf','eEarD','eShadow',
                'btnHead','btnCenter','btnSweet','mL','mR','sLat','sCtx','sNodes'];
earIds.forEach(id=>{
  chk('#'+id+' 存在且已绑定', html.includes(`id="${id}"`) && html.includes(`$('${id}')`));
});

// 三个听者卡片
chk('「听音位置」卡片在听者 tab', /<h3>听音位置/.test(html));
chk('「双耳渲染」卡片在听者 tab', /<h3>双耳渲染/.test(html));
chk('「实时传输监测」卡片在听者 tab', /<h3>实时传输监测/.test(html));

// 关键函数
['setListener','findSweetSpot','animateEarTo','updateSourceAudio'].forEach(f=>{
  chk('函数 '+f+' 存在', new RegExp('function '+f+'\\b').test(html));
});
chk('自动转头 headAuto 保留', /headAuto/.test(html));

console.log('\n=== ② 首屏默认场景 ===\n');

// boot() 必须用 bootDefaultSpeakers
const boot = html.match(/function boot\(\)\{[\s\S]*?\n\}/);
chk('boot() 调用 bootDefaultSpeakers', boot ? /bootDefaultSpeakers\(\)/.test(boot[0]) : false);

/* 首屏已改为调用摆位算法（pa 系统：主扩 L/R + 低音炮 + 返听 L/R），
   不再是硬编码坐标表。检查点改为：函数存在且确实委托给算法。 */
const bds = html.match(/function bootDefaultSpeakers\([\s\S]*?\n\}/);
chk('存在 bootDefaultSpeakers', !!bds);
if(bds){
  const body = bds[0];
  chk('委托给 buildOptimalLayout', /buildOptimalLayout\(/.test(body));
  chk('默认系统为 pa', /sys:'pa'/.test(body));
  chk('主箱为落地箱',   /main:'floorstand'/.test(body));
  chk('返听为监听箱',   /wedge:'monitor'/.test(body));
  chk('写入听者位置',   /S\.ear\.x = L\.ear\.x/.test(body));
  chk('应用增益缩放',   /cfg\.gs/.test(body));
  chk('不再硬编码坐标', !/\['spk:/.test(body));
}

console.log('\n=== ③ 全部预设 ===\n');

/* 预设已改为声明式 layout（由摆位算法求解坐标），
   不再有硬编码的 srcs 数组与 ear。检查点相应改为：
   每个预设都声明了 layout，且其中引用的箱型均为音响。 */
const pre = html.match(/const PRESETS = \{([\s\S]*?)\n\};/);
chk('找到 PRESETS 定义', !!pre);
if(pre){
  const body = pre[1];
  const blocks = body.match(/layout:\{([^}]*)\}/g) || [];
  chk('共 7 个预设声明 layout', blocks.length === 7, `实到 ${blocks.length}`);
  let allSpk = true, badOnes = [];
  blocks.forEach(b=>{
    /* main / wedge 必须是音响箱型（SPEAKERS 的键），不能是乐器 */
    const mainM = b.match(/main:'(\w+)'/);
    const wedgeM = b.match(/wedge:'(\w+)'/);
    [mainM, wedgeM].forEach(m=>{
      if(!m) return;
      const SPEAKER_KEYS = ['bookshelf','floorstand','monitor','sub',
                            'ceiling','soundbar','portable','horn'];
      if(!SPEAKER_KEYS.includes(m[1])){ allSpk = false; badOnes.push(m[1]); }
    });
  });
  chk('所有预设的箱型均为音响', allSpk, badOnes.length? badOnes[0] : '');
  chk('无残留乐器类型', !/'(vocal|piano|guitar|bass|drums|violin|sax|flute)'/.test(body));
  chk('不再有硬编码坐标', !/srcs:\[\[/.test(body));
}

console.log('\n=== ③点五、听者：旋转速度与耳高 ===\n');

/* 自动转头：速度可调 */
['eRotSpd','eRotMode','eSweepAmp','eRotPeriod','earPose','sweepAmpRow'].forEach(id=>{
  chk('#'+id+' 存在', html.includes(`id="${id}"`));
});
chk('旋转速度已绑定',      /\$\('eRotSpd'\)\.oninput/.test(html));
chk('转头方式已绑定',      /\$\('eRotMode'\)\.onchange/.test(html));
chk('摆动幅度已绑定',      /\$\('eSweepAmp'\)\.oninput/.test(html));
chk('姿态按钮已绑定',      /#earPose \.chip/.test(html));
chk('周期同步函数存在',    /function syncRotPeriod/.test(html));
chk('耳高范围函数存在',    /function earZRange/.test(html));
chk('姿态定义存在',        /const EAR_POSE/.test(html));
chk('姿态应用函数存在',    /function setEarPose/.test(html));

/* 动画必须支持两种模式，且速度来自状态而非硬编码 */
const tickBody = html.slice(html.indexOf('if(headAuto && A.ready){'),
                            html.indexOf('if(headAuto && A.ready){')+900);
chk('动画读 S.ear.rotSpd（非硬编码速度）', /const spd = Math\.max\(2, e\.rotSpd/.test(tickBody));
chk('动画支持 sweep 模式',   /rotMode === 'sweep'/.test(tickBody));
chk('摆动在边界折返',        /sweepDir = -1/.test(tickBody) && /sweepDir =  1/.test(tickBody));
chk('单向模式折回 ±180',     /if\(e\.rot > 180\) e\.rot -= 360/.test(tickBody));
chk('不再硬编码 26',         !/rot \+= 26\*dt/.test(tickBody));

/* 耳高范围跟随层高 */
const ezr = html.match(/function earZRange\(\)\{[\s\S]*?\n\}/)[0];
chk('耳高上限跟随层高',   /S\.H-0\.10/.test(ezr), ezr.replace(/\s+/g,' ').trim());
chk('耳高下限为 0.20',    /min:0\.20/.test(ezr));
chk('范围同步函数存在',   /function syncEarZRange/.test(html));
chk('改层高时同步',       /syncEarZRange\(\);/.test(html));
chk('预设载入时同步',     /S\.ear\.z=1\.2; S\.ear\.rot=0;\n  syncEarZRange\(\);/.test(html));
chk('无残留硬编码 0.3~2.2', !/0\.3,\s*2\.2/.test(html) && !/0\.3,\s*Math\.max\(0\.3/.test(html));
chk('剖面拖动改用动态范围', /const r=earZRange\(\); S\.ear\.x=wx/.test(html));

console.log('\n=== ④ 加载与信号自洽 ===\n');

chk('loadPreset 改用摆位算法', /buildOptimalLayout\(S\.W, S\.D, S\.H, p\.layout\)/.test(html));
chk('loadPreset 应用增益缩放', /cfg\.gs !== undefined && cfg\.gs !== 1/.test(html));
chk('算法内含 toe-in（对准听者）', /sp\.rot = Math\.atan2\(ear\.x - sp\.x/.test(html));
chk('loadPreset 末尾重新路由', /routeSignal\(\); \}catch\(e\)\{\}/.test(html));
chk('启动引擎后确保有信号', /nSpk > 0 && !EXT\.active/.test(html));
chk('启动时自动切测试音', /em\.value = 'test'/.test(html));
chk('captureDefaults 快照声道', /ch:\(s\.ch \|\|/.test(html));
chk('alignSrcs 恢复声道', /if\(want\.ch\)\{ cur\.ch = want\.ch/.test(html));
chk('alignSrcs 末尾重新路由', /声道\/数量可能变了/.test(html));

console.log(`\n${'─'.repeat(58)}`);
console.log(fail===0?`🎉 全部通过（${pass} 项）`:`❌ ${fail} 项失败 / 共 ${pass+fail} 项`);
console.log('─'.repeat(58)+'\n');
process.exit(fail?1:0);
