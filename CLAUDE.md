# 洞洞板布局工具 (Perfboard Layout Tool)

**重要规则：README 尽量少删除内容！修改 README 时优先追加和更新，不要删减已有的详细描述。**

**版本记录规则：每写一个新版本时，将该版本的修改总结写进 README 该版本条目。同时，将用户报告的上一版本 bug 写进上一版本的 README 介绍中（如 v0.12 的 bug 写在 v0.12 条目里，修复写在 v0.13 里）。这样每个版本的 README 条目既包含该版本的新功能，也包含该版本的已知问题。**

## 项目概述

单文件 HTML 应用（`perfboard-v1.0.html`），零依赖，浏览器直接打开即用。用于设计洞洞板（perfboard）的元器件布局和走线。

## 技术栈

- 纯 HTML/CSS/JS，单文件，无框架
- Canvas 2D 渲染
- 所有交互通过鼠标/键盘事件直接处理
- 数据存储在内存（`DataModel`），通过 `localStorage` 做会话恢复，通过 JSON 文件做持久化

## 文件结构

```
/
├── perfboard-v1.0.html      ← 当前最新版
├── README.md
├── CLAUDE.md
├── .gitignore
├── 参考布局/
│   └── M0板.json
└── 旧版本/
    ├── perfboard-v0.1.html ~ v0.21.html  ← 全部历史版本
    └── perfboardv0.1.html, perfboardv0.2.html  ← 用户原始旧版
```

## 核心架构

### 类结构（均在 `<script>` 标签内）

- **`DataModel`** — 数据层，存储 `solderTraces[]`, `flyWires[]`, `smdComponents[]`, `headerComponents[]`, `componentGroups[]`
- **`CommandManager`** — 撤销/重做系统，命令模式。`execute()` 记录操作，`undo()` 和 `redo()` 恢复。构造函数接受 `app` 引用用于标记 `_isDirty` 和 `_needsRender`
- **`Renderer`** — Canvas 渲染，包含 `_drawGrid()`, `_drawSolderTraces()`, `_drawFlyWires()`, `_drawSMDComponents()`, `_drawHeaderComponents()`, `_drawSelectionHighlight()`, `_drawTempElements()`
- **`HitTester`** — 碰撞检测，`nearestGridPoint()`, `screenToGrid()`, `screenToGridFloat()`, `gridToScreen()`, `componentAt()`, `solderSegmentAt()`, `flyWireAt()`, `solderEndpointAt()`
- **`App`** — 主控制器，状态机、事件处理、模式切换

### 关键交互状态（App 实例属性）

- `mode`: `'select' | 'smd' | 'header' | 'flywire' | 'solder' | 'eraser'`
- `routingState`: `{points: [{gx,gy},...]}` — 焊锡走线临时状态
- `_solderClickCount`, `_solderClickPos`, `_solderTimer` — 焊锡模式单击/双击检测
- `_isDirty`: 当前文件是否有未保存修改
- `_needsRender`: 脏渲染标记，false 时跳过帧渲染
- `selectedObject`: 当前选中对象（可为 component/group/trace/segment）
- `_dragGroupStart`: 编组/框选拖拽的起始位置数组
- `_multiSelection`: 框选多选器件 id 列表
- `_selectRect`: 矩形框选的屏幕坐标
- `headerPreview`: 排针放置预览矩形
- `_workspaceFiles`: 工作区文件列表 `[{name, data}]`

## 焊锡模式走线规则（v0.7+）

**核心问题**：浏览器的 `dblclick` 事件在两次 `click` 之后才触发，如果 `_handleSolderClick` 在 mousedown 直接执行逻辑，双击的第一击会误触发提交。

**v0.7 解决方案**：手动点击计数——mousedown 计数，280ms 窗口内第二次点击=双击，超时=单击。不依赖浏览器 dblclick 事件。

**v0.9 关键修复**：`_onMouseUp` 中 `routingState.points.length <= 1 && !isDragging → routingState=null` 会把双击刚启动的走线清掉。需加 `this.mode !== 'solder'` 条件。

**v0.10 关键修复**：v0.7 删除了 `_onMouseMove` 中的局部变量 `gp`（改成直接赋值 `this.highlightedGridPoint`），但排针预览代码仍引用 `gp` → `undefined` → 条件永不成立 → 预览尺寸永远是 1×1。

**v0.17 关键修复**：编组/框选拖拽状态机长按检测只检查了 `dragCompStart`（独立器件），漏掉了 `_dragGroupStart`（编组/框选）。mousemove 三处条件和 mouseup 一处条件均需补充。

## 反复修改的易错功能

### 1. 焊锡走线交互（v0.4→v0.10 反复修改）
- 不要依赖浏览器 `dblclick` 事件（在两次完整 click 之后才触发）
- 用 mousedown 手动点击计数（280ms 窗口）
- `_onMouseUp` 的 routingState 清理逻辑必须加 `this.mode !== 'solder'`
- 焊锡模式 mousedown 后 `mouseDown=false` 防止长按检测干扰
- 删除局部变量后检查所有引用处（如排针预览的 `gp`）

### 2. 编组/框选拖拽（v0.11→v0.17 反复修改）
- 状态机（mousemove 长按检测、拖拽中分支、mouseup 完成）三处都要检查 `_dragGroupStart`
- 编组后 `componentAt` 需跳过已编组成员（`comp.groupId` 检查）
- 拆组时清除 `_dragGroupStart` 残留
- 点击独立器件时清除 `_dragGroupStart`
- 框选拖拽时自动从 `_multiSelection` 构建临时 `_dragGroupStart`

### 3. 拖动灵敏度
- `nearestGridPoint` 可能返回 null → 用 `screenToGrid` 或 `screenToGridFloat`
- 浮点格点 `screenToGridFloat` + `Math.round` 实现平滑拖拽

### 4. 焊锡合并
- `_commitAndContinueRouting` 后保留 `routingFromEndpoint`（不要设 null）
- `_finishRouting` 新建走线后也要调 `_mergeColinear`
- 段拖拽完成后调 `_mergeColinear`

### 5. 橡皮擦 Undo
- 器件用 `JSON.parse(JSON.stringify(comp))` 保存完整数据
- 焊锡用 ID 追踪新建/删除的走线

### 6. 文件管理
- 导入后立即调 `_updateWorkspaceUI()` + `_needsRender = true`
- 保存 = 更新工作区（不下载）；另存为 = 弹窗命名 + 下载
- 关闭页面前 `beforeunload` 自动保存

## 备份和 GitHub 注意事项

- 每次修改前 `git log --oneline -3` 确认当前状态
- commit message 使用中文，概述改动内容
- `git tag vX.X` 后 `git push && git push --tags`
- 旧版 HTML 放入 `旧版本/` 目录，根目录只留最新版
- `.gitignore` 包含 `.claude/` 目录

## 版本命名规则

- **用户未确认切换大版本前，永远只递增小版本号（0.x）**
- 主文件始终为 `perfboard-vX.X.html`（必须带版本号）
- 所有历史版本归档在 `旧版本/` 目录
- Git tag: `vX.X`
- 仅在用户明确要求时才升级主版本号（如 v0.21 → v1.0）

## 代码审查检查清单

修改代码时必须检查：
1. 是否意外删除了局部变量但保留了对它的引用
2. 是否修改了状态机的一处条件但漏了其他分支
3. 是否改了 mousedown 但没改对应的 mouseup/mousemove
4. 是否改了某个模式的处理逻辑但影响了其他模式
5. 是否新增了状态变量但没在 `_cancelAll()` 中清理
6. 是否新增了状态变量但没在构造函数中初始化
7. 是否改了渲染逻辑但没同时更新浅色/深色两套颜色
8. 是否改了数据模型但没更新 `toJSON()` 和 `fromJSON()`

## 浅色/深色主题

- CSS 变量控制（`:root` 和 `:root.light`）
- Renderer 中 `light` 参数传递到各 `_draw*` 方法
- 主题切换时设置 `_needsRender = true`
- 修改渲染颜色时两套都要测试

## 已知用户偏好

- README 只追加不删除
- 工具是单文件离线使用
- 中文注释和说明
- 焊锡规则严格遵循 Multisim 风格（双击开始/单击固定/双击结束）
- 版本号必须体现在文件名上
