/* =========================================================================
   验证：声源面板整合为单一界面
   ① 列表条目为一行摘要（不含滑杆）
   ② 全部参数集中在详情区
   ③ 详情区与列表同属一张卡片
   ========================================================================= */
const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','实时音频模拟.html'),'utf8');
let pass=0, fail=0;
const chk=(n,ok,d='')=>{ok?pass++:fail++;console.log(`  ${ok?'✅':'❌'} ${n}${d?'   '+d:''}`);};

console.log('\n=== ① 列表条目：一行摘要 ===\n');

const bsu = html.match(/function buildSrcUI\(\)\{[\s\S]*?\n\}/)[0];
chk('条目内不再有 range 滑杆', !/<input type="range"/.test(bsu),
    '滑杆已移到详情区');
chk('条目含位置摘要 src-pos', /class="src-pos"/.test(bsu));
chk('条目含 S/M/✕ 三个按钮', (bsu.match(/class="mini/g)||[]).length === 3);
chk('条目仍可选中（onmousedown 设 S.sel）', /S\.sel=i;/.test(bsu));
chk('条目不再单独绑定位置滑杆', !/sx\.oninput/.test(bsu));

console.log('\n=== ② 详情区：含全部可调参数 ===\n');

const pos = html.match(/function posBlock\(s\)\{[\s\S]*?\n\}/)[0];
chk('posBlock 存在', !!pos);
['sdX','sdY','sdZ','sdG'].forEach(id=>{
  chk('  含滑杆 #'+id, pos.includes('id="'+id+'"'));
});
chk('  含"摆位"小节标题', /dsec">摆位/.test(pos));
chk('  高度上限跟随层高', /S\.H-0\.1/.test(pos));

const bind = html.match(/function bindPosBlock\(s\)\{[\s\S]*?\n\}/)[0];
chk('bindPosBlock 存在', !!bind);
['sdX','sdY','sdZ','sdG'].forEach(id=>{
  chk('  绑定 #'+id, bind.includes("$('"+id+"')"));
});
chk('两处分支均调用 bindPosBlock',
    (html.match(/bindPosBlock\(s\);/g)||[]).length === 2,
    '音响 + 乐器');

/* 详情区同时要有箱体/音色参数 */
const bsd = html.match(/function buildSrcDetail\(\)\{[\s\S]*?\n\}/)[0]
         || html.slice(html.indexOf('function buildSrcDetail(){'),
                       html.indexOf('/* ---------- 数值同步 ---------- */'));
chk('音响分支含朝向滑杆 sdRot', /id="sdRot"/.test(bsd));
chk('音响分支含声道选择 sdCh', /id="sdCh"/.test(bsd));
chk('音响分支含偏轴角 sdOffAxis', /id="sdOffAxis"/.test(bsd));
chk('乐器分支含指向性 sdQ', /id="sdQ"/.test(bsd));
chk('乐器分支含朝向 sdR', /id="sdR"/.test(bsd));

console.log('\n=== ③ 同属一张卡片 ===\n');
{
  const card = html.match(/<div class="card" id="srcListCard">[\s\S]*?\n      <\/div>/);
  chk('找到 srcListCard', !!card);
  const c = card ? card[0] : '';
  chk('  含声源列表 srcList', /id="srcList"/.test(c));
  chk('  含详情区 srcDetail', /id="srcDetail"/.test(c));
  chk('  含添加下拉框 newSrc', /id="newSrc"/.test(c));
  chk('  详情在列表之后', c.indexOf('id="srcList"') < c.indexOf('id="srcDetail"'));
  chk('  添加在详情之后',
      c.indexOf('id="srcDetail"') < c.indexOf('id="newSrc"'));
  /* 详情区不再是一张独立的 card */
  chk('srcDetail 不再是独立 card', !/<div class="card" id="srcDetail"/.test(html));
}

console.log('\n=== ④ 拖动同步指向详情区 ===\n');
{
  const sy = html.match(/function syncSrcSlider\(i\)\{[\s\S]*?\n\}/)[0];
  chk('同步详情区滑杆', /\$\('sdX'\)/.test(sy));
  chk('  仅当该项被选中时', /if\(S\.sel===i\)/.test(sy));
  chk('同步列表位置摘要', /\.src-pos/.test(sy));
  chk('不再读列表条目的滑杆', !/cards\[i\]\.querySelectorAll\('input/.test(sy));
}

console.log('\n=== ⑤ 紧凑布局 ===\n');
chk('定义 grid2 两列网格', /\.grid2\{display:grid/.test(html));
chk('定义 dsec 小节标题', /\.dsec\{/.test(html));
chk('定义 dtitle 详情标题', /\.dtitle\{/.test(html));
chk('条目样式已收紧', /\.src\{[^}]*padding:5px 7px/.test(html));
chk('条目头部无下边距', /\.src-hd\{display:flex;align-items:center;gap:6px\}/.test(html));

console.log('\n=== ⑥ 交互细节 ===\n');
{
  /* 拖朝向时不应重建整个详情区（会失焦） */
  const rotHandler = html.slice(html.indexOf("rot.oninput="), html.indexOf("rot.oninput=")+700);
  chk('拖朝向只更新偏轴角', /sdOffAxis/.test(rotHandler));
  chk('  未调用 buildSrcDetail 重建', !/buildSrcDetail\(\)/.test(rotHandler));
}

console.log(`\n${'─'.repeat(60)}`);
console.log(fail===0?`🎉 声源面板整合验证通过（${pass} 项）`:`❌ ${fail} 项失败 / 共 ${pass+fail} 项`);
console.log('─'.repeat(60)+'\n');
process.exit(fail?1:0);
