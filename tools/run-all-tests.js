/* 统一测试入口：依次运行各验证脚本并汇总 */
const {execSync} = require('child_process');
const path = require('path');
const dir = __dirname;
const suites = [
  ['信号路由状态机', 'verify-signal-routing.js'],
  ['外部音源与音响',  'verify-external-audio.js'],
  ['声源面板整合',    'verify-src-merge.js'],
  ['音响化与听者',    'verify-spk-default.js'],
  ['最佳摆位算法',    'verify-layout.js'],
  ['吸声云与啸叫检测','verify-cloud-feedback.js'],
  ['声源面板整合',    'verify-src-unified.js'],
  ['示波器与折叠',    'verify-scope-fold.js'],
  ['音频参数与延迟',  'verify-audio-params.js'],
  ['反射低通',        'verify-refl-lp.js'],
  ['署名与地面材料',  'verify-credit-floor.js'],
];
let pass=0, fail=0;
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  实时音频模拟 · 测试套件                                     ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
suites.forEach(([name, f])=>{
  try{
    const out = execSync(`node "${path.join(dir,f)}"`, {encoding:'utf8', stdio:'pipe'});
    const m = out.match(/🎉.*?（(\d+) 项）/);
    const n = m ? +m[1] : 0;
    pass += n;
    console.log(`  ✅ ${name.padEnd(18)} ${n} 项通过`);
  }catch(e){
    const out = (e.stdout||'') + (e.stderr||'');
    const m = out.match(/❌ (\d+) 项失败 \/ 共 (\d+) 项/);
    const f2 = m ? +m[1] : 1, t = m ? +m[2] : 1;
    fail += f2; pass += (t - f2);
    console.log(`  ❌ ${name.padEnd(18)} ${f2} 项失败`);
    out.split('\n').filter(l=>l.includes('❌')).forEach(l=>console.log('     '+l.trim()));
  }
});
console.log('\n'+'─'.repeat(64));
console.log(fail===0 ? `🎉 全部通过（${pass} 项）` : `❌ ${fail} 项失败 / 共 ${pass+fail} 项`);
console.log('─'.repeat(64)+'\n');
process.exit(fail?1:0);
