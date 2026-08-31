/* 验证「接入声卡 / 音响系统」已正确并入声源 tab，且无重复无残留 */
const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','实时音频模拟.html'),'utf8');
let pass=0,fail=0;
const chk=(n,ok,d='')=>{ok?pass++:fail++;console.log(`  ${ok?'✅':'❌'} ${n}${d?'   '+d:''}`);};

console.log('\n=== 声源面板整合验证 ===\n');

// 1. DOM 归属：两个卡片必须落在 t-src 内部
const tSrc  = html.indexOf('<div class="tc" id="t-src">');
const tEar  = html.indexOf('<div class="tc" id="t-ear">');
const tAna  = html.indexOf('<div class="tc" id="t-ana">');
const ext   = html.indexOf('id="extCard"');
const spk   = html.indexOf('id="spkCard"');
const srcListCard = html.indexOf('id="srcListCard"');
const srcList = html.indexOf('id="srcList"');
const addSrc= html.indexOf('id="newSrc"');      // 添加声源的那一行
const btnAdd = html.indexOf('id="btnAdd"');
const srcCnt = html.indexOf('id="srcCnt"');
const srcDetail= html.indexOf('id="srcDetail"');

console.log('  ── 位置关系 ──');
chk('接入声卡在「声源」tab 内', tSrc < ext && ext < tEar);
chk('音响系统在「声源」tab 内', tSrc < spk && spk < tEar);
chk('顺序：接入声卡 → 音响系统 → 声源', ext < spk && spk < srcListCard);
/* 「添加声源」必须落在声源列表下方 —— 这是本轮的核心诉求 */
/* 详情区已并入声源卡片（不再单独占一张卡片），
   顺序调整为：列表 → 选中项详情 → 添加按钮。
   "添加新项"放在卡片最底部，符合"先看已有、再调参数、最后加新的"阅读顺序。 */
chk('添加声源在「声源」卡片内',    srcListCard < addSrc);
chk('顺序：声源列表 → 声源详情',   srcList < srcDetail);
chk('顺序：声源详情 → 添加声源',   srcDetail < addSrc);
chk('下拉框与按钮紧邻且按钮在后',  addSrc < btnAdd);
chk('声源计数元素在列表之前',      srcCnt < srcList);
chk('不再有独立的「添加声源」卡片', !/<h3>添加声源<\/h3>/.test(html));
chk('「听者」tab 不再含这两个卡片', tEar < tAna && !(tEar < ext && ext < tAna));
chk('声源列表已包成卡片 srcListCard', srcListCard > 0);
chk('卡片标题含「声源」', /<h3[^>]*>🎚️ 声源/.test(html));

// 2. 无重复：spkList / spkDetail / refreshSpkDetail 应彻底消失
console.log('\n  ── 去重 ──');
chk('已移除独立的音响列表 spkList',   !html.includes('id="spkList"'));
chk('已移除独立的音响详情 spkDetail', !html.includes('id="spkDetail"'));
chk('已移除 refreshSpkDetail 函数',   !html.includes('function refreshSpkDetail'));
chk('无残留调用',                     !/refreshSpkDetail\(\)/.test(html));

// 3. 统一列表：buildSrcUI 不再过滤音响
console.log('\n  ── 统一声源列表 ──');
const bs = html.match(/function buildSrcUI\(\)\{[\s\S]*?\nfunction buildSrcDetail/);
chk('buildSrcUI 不再按 isSpk 过滤', bs ? !/filter\(o=>!isSpk/.test(bs[0]) : false);
chk('buildSrcUI 遍历全部 S.srcs',  bs ? /S\.srcs\.forEach\(\(s,i\)/.test(bs[0]) : false);
chk('列表项标注音响声道',          bs ? /spk\?[\s\S]{0,80}ch/.test(bs[0]) : false);

// 4. 详情分区：buildSrcDetail 同时处理两类
console.log('\n  ── 详情分区 ──');
const bd = html.match(/function buildSrcDetail\(\)\{[\s\S]*?\n\}/);
chk('存在 buildSrcDetail',           !!bd);
if(bd){
  chk('  → 音响分支（isSpk 优先）', /isSpk\(selSrc\)/.test(bd[0]));
  chk('  → 乐器分支',               /const s=selSrc, d=INSTR\[s\.type\]/.test(bd[0]));
  chk('  → 音响分支含朝向滑块',     /sdRot/.test(html));
  chk('  → 音响分支含声道选择',     /sdCh/.test(html));
  chk('  → 音响分支含对准听者',     /sdAim/.test(html));
  chk('  → 音响分支含镜像对称',     /sdMir/.test(html));
}
chk('详情标题可动态切换',            /id="srcDetailHead"/.test(html));
chk('标题随类型改写',                /srcDetailHead'\)\.textContent/.test(html));

// 5. TDZ 安全
console.log('\n  ── 依赖顺序 ──');
const pName = html.indexOf('const SPK_CH_NAME');
const pFn   = html.indexOf('function buildSrcDetail');
chk('SPK_CH_NAME 定义先于使用（无 TDZ）', pName < pFn, `${pName} < ${pFn}`);
chk('SPK_CH_NAME 仅定义一次', (html.match(/const SPK_CH_NAME/g)||[]).length === 1);

console.log(`\n${'─'.repeat(58)}`);
console.log(fail===0?`🎉 声源面板整合通过（${pass} 项）`:`❌ ${fail} 项失败 / 共 ${pass+fail} 项`);
console.log('─'.repeat(58)+'\n');
process.exit(fail?1:0);
