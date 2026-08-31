/* 用 mock DOM 验证外部音源模块的逻辑正确性（不依赖浏览器） */
const fs = require('fs'), path = require('path');
/* 同时兼容两种布局：开发时 app/index.html，交付时 实时音频模拟.html */
const CAND = [
  path.join(__dirname, '..', 'app', 'index.html'),
  path.join(__dirname, '..', '实时音频模拟.html'),
];
const HTML_PATH = CAND.find(f => fs.existsSync(f));
if(!HTML_PATH){ console.error('找不到 index.html，请在项目目录下运行'); process.exit(1); }
const html = fs.readFileSync(HTML_PATH,'utf8');

let pass = 0, fail = 0;
const chk = (n, ok, d='') => { ok?pass++:fail++; console.log(`  ${ok?'✅':'❌'} ${n}${d?'   '+d:''}`); };

console.log('\n=== 外部音源模块静态验证 ===\n');

// 1. 三大音频处理必须全部关闭
const noEC = /echoCancellation:\s*false/.test(html);
const noNS = /noiseSuppression:\s*false/.test(html);
const noAG = /autoGainControl:\s*false/.test(html);
chk('关闭回声消除（否则音乐被消掉）', noEC);
chk('关闭噪声抑制（否则音乐被压掉）', noNS);
chk('关闭自动增益（否则音量被拉扯）', noAG);

// 2. 降级序列：三个约束，立体声优先
const attemptsBlock = html.match(/const attempts\s*=\s*\[([\s\S]*?)\];/);
chk('存在逐级降级的约束序列', !!attemptsBlock);
if (attemptsBlock) {
  const b = attemptsBlock[1];
  chk('  第1档要求立体声 channelCount:2', /channelCount:\s*2/.test(b));
  chk('  第2档降级为单声道 channelCount:1', /channelCount:\s*1/.test(b));
  chk('  第3档完全不约束', (b.match(/Object\.assign/g)||[]).length === 2);
}

// 3. 信号流：必须同时接 inputBus（驻波）与 fdnIn（混响）
const linksDry = /EXT\.dryGain\.connect\(A\.inputBus\)/.test(html);
const linksWet = /EXT\.wetGain\.connect\(A\.fdnIn\)/.test(html);
chk('干声支路接入 inputBus（驻波染色）', linksDry);
chk('混响支路接入 fdnIn（FDN 后期混响）', linksWet);

// 4. 刻意不走 HRTF panner（保住立体声场）
const block = html.slice(html.indexOf('const EXT = {'), html.indexOf('/* ---------- 绑定 UI'));
/* 精确判据：extWireSpk（真正接线的函数）内部不得单声道化或重定位。
   早期版本对整个 EXT 模块做粗匹配，音响改造后 buildSourceNodes 出现在
   邻近代码里，导致误报。改为只检查接线函数本体。 */
const wireFn = html.match(/function extWireSpk\(src\)\{[\s\S]*?\n\}/);
chk('外部音源未使用 createPanner（保留立体声）',
    wireFn ? !/createPanner/.test(wireFn[0]) : false);
chk('接线函数不重建声源节点图（避免单声道化）',
    wireFn ? !/buildSourceNodes/.test(wireFn[0]) : false);
chk('接线函数按声道分离（L/R/LR）',
    wireFn ? /spkCh/.test(wireFn[0]) : false);

// 5. 资源清理：stop 必须停音轨 + 断连接
const stopBlock = html.slice(html.indexOf('function extStop'), html.indexOf('/* ---------- 绑定 UI'));
chk('停止时断开 dryGain', /dryGain\.disconnect/.test(stopBlock));
chk('停止时断开 wetGain', /wetGain\.disconnect/.test(stopBlock));
chk('停止时断开源节点', /EXT\.src\.disconnect/.test(stopBlock));
chk('停止时终止音轨（释放设备）', /t\.stop\(\)/.test(stopBlock));
chk('停止时清理定时器', /clearInterval/.test(stopBlock));

// 6. 环路检测
chk('检测虚拟声卡关键词 CABLE', /'cable'/.test(html));
chk('检测立体声混音关键词', /stereo mix|立体声混音/.test(html));
chk('虚拟输入 + 默认输出时告警', /__outSink/.test(html) && /啸叫/.test(html));

// 7. 错误处理覆盖
['NotAllowedError','NotFoundError','NotReadableError','OverconstrainedError'].forEach(e=>{
  chk('处理 ' + e, html.includes(e));
});

// 8. 设备热插拔与自动枚举
chk('监听 devicechange（热插拔）', /devicechange/.test(html));
chk('加载后自动枚举设备', /setTimeout\(extEnumDevices/.test(html));
chk('设备列表刷新按钮已绑定', /bind\('extRefresh'/.test(html));

// 9. 权限取得策略：getUserMedia 后立即停止音轨
chk('枚举前先取权限并立即停止（不录音）', /getTracks\(\)\.forEach\(t => t\.stop\(\)\)/.test(html));

// 9b. 运行环境检测（file:// 下必须给出明确指引，否则用户会一头雾水）
chk('存在环境检测函数 extCheckEnv', /function extCheckEnv/.test(html));
chk('检测 isSecureContext',         /isSecureContext/.test(html));
chk('检测 navigator.mediaDevices',  /navigator\.mediaDevices\.getUserMedia/.test(html));
chk('file 协议下给出 bat 指引',     /file:'[\s\S]{0,300}?Start\.bat/.test(html));
chk('页面加载时执行检测',           /extCheckEnv\(\);/.test(html));

// 10. UI 元素齐备
['extDev','extStart','extStop','extRefresh','extVol','extWet','extDry','extStat'].forEach(id=>{
  chk('UI 元素 #' + id, html.includes(`id="${id}"`));
});

console.log(`\n${'─'.repeat(56)}`);
console.log(fail===0 ? `🎉 外部音源验证通过（${pass} 项）` : `❌ ${fail} 项失败 / 共 ${pass+fail} 项`);
console.log('─'.repeat(56)+'\n');
process.exit(fail?1:0);
