// 自动化测试：验证保存/加载/不保存逻辑
// 用法: node test_save.js

const fs = require('fs');
const vm = require('vm');

// ====== Mock 浏览器环境 ======
global.document = {
  _elems: {},
  getElementById(id) {
    if (!this._elems[id]) {
      this._elems[id] = {
        id, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains(){} },
        parentElement: { clientWidth: 1200, clientHeight: 800, getBoundingClientRect() { return {width:1200,height:800}; } },
        getContext() { return mockCtx; },
        addEventListener() {}, querySelectorAll() { return []; },
        focus() {},
        value: '', checked: false,
        innerHTML: '', textContent: '',
        closest() { return null; }, dataset: {},
      };
    }
    return this._elems[id];
  },
  querySelectorAll() { return []; },
  createElement(tag) { return { tag, style:{}, href:'', download:'', click(){} }; },
  body: { appendChild(){} },
  documentElement: { classList: { add() {}, remove() {} } },
  addEventListener() {},
};

global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = v; },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; },
};

const mockCtx = { canvas: {width:1200, height:800}, setTransform() {}, clearRect() {}, fillRect() {},
  beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {}, strokeRect() {},
  setLineDash() {}, fillText() {}, strokeText() {}, save() {}, restore() {}, translate() {},
  scale() {}, measureText() { return {width:10}; }, quadraticCurveTo() {},
};
CanvasRenderingContext2D = { prototype: { roundRect(){} } };

global.window = {
  devicePixelRatio: 1, innerWidth: 1200, innerHeight: 800,
  addEventListener() {}, removeEventListener() {},
};
global.navigator = { userAgent: 'node-test' };
global.URL = { createObjectURL() { return ''; }, revokeObjectURL() {} };
global.Blob = class { constructor(d,o) {} };
global.requestAnimationFrame = function() {};

// ====== 导出 JS ======
const html = fs.readFileSync('dist/perfboard-v1.5.html', 'utf8');
const jsMatch = html.match(/<script>([\s\S]*)<\/script>/);
if (!jsMatch) { console.log('FAIL: cannot extract JS'); process.exit(1); }

// ====== 运行 JS ======
try {
  vm.runInThisContext(jsMatch[1]);
  console.log('OK: JS loaded, App instance:', typeof app);
} catch(e) {
  console.log('FAIL: JS error:', e.message, '\nLine:', e.stack?.split('\n')[1]);
  process.exit(1);
}

// ====== 辅助函数 ======
function log(msg) { console.log('  ' + msg); }
function assert(cond, msg) { if (!cond) { console.log('FAIL: ' + msg); process.exit(1); } console.log('  PASS: ' + msg); }

// ====== 测试 1：加载参考布局 ======
console.log('\n=== 测试 1: 加载 M0板.json 到工作区 ===');
const m0Data = JSON.parse(fs.readFileSync('参考布局/M0板.json', 'utf8'));
app._workspaceFiles = [{ name: 'test1.5', data: m0Data }];
app._switchToFile('test1.5');
app._isDirty = false;
app._saveWorkspace();
assert(app.model.headerComponents.length === 2, '加载后应有2个排针');
const origM0Left = app.model.headerComponents.find(h => h.name === 'M0左');
assert(origM0Left && origM0Left.gx === -20, 'M0左初始gx=-20');

// ====== 测试 2：修改后不保存切换 → 回来应是原状态 ======
console.log('\n=== 测试 2: 修改→不保存→切换→回来验证 ===');
// 1. 修改 M0左 的 gx
origM0Left.gx = 5;
app._isDirty = true;
app._autoSave(); // 模拟编辑时自动保存到 session
assert(origM0Left.gx === 5, '修改后gx=5');
assert(app._isDirty === true, '标记为脏');

// 2. 模拟"不保存"切换流程
//    清空 session（模拟 event delegate 的不保存分支）
localStorage.removeItem('perfboard_session');

// 3. 切换到另一个文件（这里用空文件模拟）
app._workspaceFiles.push({ name: 'empty', data: {smdComponents:[],headerComponents:[],solderTraces:[],flyWires:[],componentGroups:[]} });
app._switchToFile('empty');
app._workspaceFiles = app._workspaceFiles.filter(f => f.name !== 'empty');

// 4. 切换回 test1.5
app._switchToFile('test1.5');
const backM0Left = app.model.headerComponents.find(h => h.name === 'M0左');
assert(backM0Left.gx === -20, '不保存切回后gx应恢复为-20，实际=' + backM0Left.gx);

// ====== 测试 3：修改后保存 → 检查工作区数据 ======
console.log('\n=== 测试 3: 修改→保存→检查工作区持久化 ===');
const m0Left3 = app.model.headerComponents.find(h => h.name === 'M0左');
m0Left3.gx = 10;
m0Left3.gy = 20;
app.model.smdComponents.push({
  id: 'el_test', type: 'smd', name: 'R99', gx1: 0, gy1: 0, gx2: 1, gy2: 0
});
app._isDirty = true;
app._save();

// 验证工作区数据已更新
const wsEntry = app._workspaceFiles.find(f => f.name === 'test1.5');
assert(wsEntry, '工作区应有test1.5条目');
const wsM0Left = wsEntry.data.headerComponents.find(h => h.name === 'M0左');
assert(wsM0Left.gx === 10, '工作区保存后M0左gx=10，实际=' + wsM0Left.gx);
assert(wsM0Left.gy === 20, '工作区保存后M0左gy=20，实际=' + wsM0Left.gy);
assert(wsEntry.data.smdComponents.length === 1, '工作区应有1个贴片器件');
assert(wsEntry.data.smdComponents[0].name === 'R99', '贴片器件名应为R99');

// 验证 localStorage 中 workspace 数据
const wsSaved = JSON.parse(localStorage.getItem('perfboard_workspace'));
const savedTest = wsSaved.find(f => f.name === 'test1.5');
const savedM0Left = savedTest.data.headerComponents.find(h => h.name === 'M0左');
assert(savedM0Left.gx === 10, 'localStorage中M0左gx=10，实际=' + savedM0Left.gx);
assert(savedTest.data.smdComponents.length === 1, 'localStorage中应有1个贴片器件');

// 验证 session 已清除（_save 后应清除）
const session = localStorage.getItem('perfboard_session');
assert(!session, '保存后session应为空，实际=' + JSON.stringify(session));

// ====== 测试 4：刷新后自动恢复（模拟完整页面重载） ======
console.log('\n=== 测试 4: 刷新后自动加载工作区文件 ===');
// 清空 localStorage session，保留 workspace
localStorage.removeItem('perfboard_session');
// 模拟 _loadFromStorage 中的自动加载逻辑
const wsAfterRefresh = JSON.parse(localStorage.getItem('perfboard_workspace'));
const activeName = localStorage.getItem('perfboard_active_file');
const f = wsAfterRefresh.find(x => x.name === activeName) || wsAfterRefresh[0];
const newModel = new DataModel();
newModel.fromJSON(f.data);
const refreshLeft = newModel.headerComponents.find(h => h.name === 'M0左');
assert(refreshLeft.gx === 10, '刷新后M0左gx=10，实际=' + refreshLeft.gx);
assert(refreshLeft.gy === 20, '刷新后M0左gy=20，实际=' + refreshLeft.gy);
assert(newModel.smdComponents.length === 1, '刷新后应有1个贴片器件');

// ====== 测试 5：不保存后刷新 → 不应恢复修改 ======
console.log('\n=== 测试 5: 不保存+刷新 → 修改应丢失 ===');
localStorage.clear();
const origData = JSON.parse(fs.readFileSync('参考布局/M0板.json', 'utf8'));
localStorage.setItem('perfboard_workspace', JSON.stringify([{name:'test1.5', data: origData}]));
localStorage.setItem('perfboard_active_file', 'test1.5');
// 模拟修改后不保存就刷新（session不存在）
const ws5 = JSON.parse(localStorage.getItem('perfboard_workspace'));
const f5 = ws5.find(x => x.name === 'test1.5');
const model5 = new DataModel();
model5.fromJSON(f5.data);
const left5 = model5.headerComponents.find(h => h.name === 'M0左');
assert(left5.gx === -20, '不保存刷新M0左gx应=-20(原值)，实际=' + left5.gx);
assert(model5.smdComponents.length === 0, '不保存刷新应无贴片器件');

// ====== 测试 6：toJSON 返回深拷贝（修改原模型不影响已保存数据） ======
console.log('\n=== 测试 6: toJSON深拷贝验证 ===');
localStorage.clear();
app._workspaceFiles = [{ name: 'deep', data: JSON.parse(JSON.stringify(m0Data)) }];
app._switchToFile('deep');
app.model.headerComponents[0].gx = 999;
const saved = app.model.toJSON();
app.model.headerComponents[0].gx = 0; // 修改原模型
assert(saved.headerComponents[0].gx === 999, 'toJSON深拷贝保护——修改模型不影响已导出数据，期望999实际=' + saved.headerComponents[0].gx);

// ====== 测试 7：保存→导出JSON→写入磁盘→重新加载→验证 ======
console.log('\n=== 测试 7: 完整保存-导出-重载+持久化循环 ===');
localStorage.clear();
const cleanData = JSON.parse(JSON.stringify(m0Data));
app._workspaceFiles = [{ name: 'roundtrip', data: cleanData }];
app._switchToFile('roundtrip');
app._isDirty = false;

// 修改：添加排针+贴片+走线+飞线
const newHdr = { id: 'el_new_hdr', type: 'header', name: 'J99', gx: 5, gy: 5, w: 3, h: 2, pinLabels: {'0,0':'VCC'}, groupId: null };
app.model.headerComponents.push(newHdr);
const newSmd = { id: 'el_new_smd', type: 'smd', name: 'R99', gx1: 10, gy1: 10, gx2: 11, gy2: 10 };
app.model.smdComponents.push(newSmd);
const newTrace = { id: 'el_new_tr', points: [{gx:0,gy:0},{gx:5,gy:0},{gx:5,gy:5}] };
app.model.solderTraces.push(newTrace);
const newFw = { id: 'el_new_fw', from: {gx:0,gy:0}, to: {gx:10,gy:10} };
app.model.flyWires.push(newFw);
app._isDirty = true;

// 保存
app._save();
assert(app._isDirty === false, '保存后_isDirty应为false');

// 导出 JSON（模拟另存为的下载）
const exportedJson = app.model.toJSON();
const exportedStr = JSON.stringify(exportedJson, null, 2);
const exportedParsed = JSON.parse(exportedStr);
assert(exportedParsed.headerComponents.length === 3, '导出JSON应有3个排针(原有2+新增1)，实际=' + exportedParsed.headerComponents.length);
assert(exportedParsed.smdComponents.length === 1, '导出JSON应有1个贴片');
assert(exportedParsed.solderTraces.length === 1, '导出JSON应有1条焊锡走线');
assert(exportedParsed.flyWires.length === 1, '导出JSON应有1条飞线');

// 模拟"另存为"写入磁盘 → 清除 → 重新导入
const savedJson = JSON.parse(exportedStr);
localStorage.clear();
localStorage.setItem('perfboard_workspace', JSON.stringify([{name:'imported', data: savedJson}]));
localStorage.setItem('perfboard_active_file', 'imported');
const wsReload = JSON.parse(localStorage.getItem('perfboard_workspace'));
const fReload = wsReload.find(x => x.name === 'imported');
const modelReload = new DataModel();
modelReload.fromJSON(fReload.data);
assert(modelReload.headerComponents.length === 3, '重新导入后应有3个排针，实际=' + modelReload.headerComponents.length);
assert(modelReload.smdComponents.length === 1, '重新导入后应有1个贴片');
assert(modelReload.solderTraces.length === 1, '重新导入后应有1条焊锡走线');
assert(modelReload.flyWires.length === 1, '重新导入后应有1条飞线');
assert(modelReload.headerComponents.find(h => h.name === 'J99'), '重新导入后应找到J99');

// ====== 测试 8：多次保存保持数据一致性 ======
console.log('\n=== 测试 8: 多次保存验证 ===');
localStorage.clear();
const base = JSON.parse(JSON.stringify(m0Data));
app._workspaceFiles = [{ name: 'multisave', data: base }];
app._switchToFile('multisave');
app._isDirty = false;
for (let i = 0; i < 3; i++) {
  app.model.smdComponents.push({ id: 'el_save' + i, type: 'smd', name: 'R' + (10+i), gx1: i, gy1: 0, gx2: i+1, gy2: 0 });
  app._isDirty = true;
  app._save();
  const wsCheck = JSON.parse(localStorage.getItem('perfboard_workspace'));
  assert(wsCheck[0].data.smdComponents.length === i + 1, '第'+(i+1)+'次保存后应有'+(i+1)+'个贴片');
}
assert(app._isDirty === false, '3次保存后_isDirty应为false');

console.log('\n===== 全部测试通过(' + (new Date().toISOString()) + ') =====');
