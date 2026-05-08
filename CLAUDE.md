# 洞洞板布局工具 (Perfboard Layout Tool)

**重要规则：README 尽量少删除内容！修改 README 时优先追加和更新，不要删减已有的详细描述。**

**版本记录规则：每写一个新版本时，将该版本的修改总结写进 README 该版本条目。同时，将用户报告的上一版本 bug 写进上一版本的 README 介绍中（如 v0.12 的 bug 写在 v0.12 条目里，修复写在 v0.13 里）。这样每个版本的 README 条目既包含该版本的新功能，也包含该版本的已知问题。**

## 项目概述

单文件 HTML 应用（`perfboard.html`），零依赖，浏览器直接打开即用。用于设计洞洞板（perfboard）的元器件布局和走线。

## 技术栈

- 纯 HTML/CSS/JS，单文件，无框架
- Canvas 2D 渲染
- 所有交互通过鼠标/键盘事件直接处理
- 数据存储在内存（`DataModel`），通过 `localStorage` 做会话恢复，通过 JSON 文件做持久化

## 文件结构

```
/
├── perfboard.html          ← 始终是最新版（当前 v0.10）
├── perfboard-v0.10.html    ← 带版本号的副本
├── README.md
├── CLAUDE.md
├── .gitignore
└── 旧版本/
    ├── perfboard-v0.1.html ~ v0.10.html  ← 全部历史版本
    └── perfboardv0.1.html, perfboardv0.2.html  ← 用户原始旧版
```

## 核心架构

### 类结构（均在 `<script>` 标签内）

- **`DataModel`** — 数据层，存储 `solderTraces[]`, `flyWires[]`, `smdComponents[]`, `headerComponents[]`
- **`CommandManager`** — 撤销/重做系统，命令模式。`execute()` 记录操作，`undo()` 和 `redo()` 恢复。构造函数接受 `app` 引用用于标记 `_isDirty`
- **`Renderer`** — Canvas 渲染，包含 `_drawGrid()`, `_drawSolderTraces()`, `_drawFlyWires()`, `_drawSMDComponents()`, `_drawHeaderComponents()`, `_drawSelectionHighlight()`, `_drawTempElements()`
- **`HitTester`** — 碰撞检测，`nearestGridPoint()`, `screenToGrid()`, `gridToScreen()`, `componentAt()`, `solderSegmentAt()`, `flyWireAt()`, `solderEndpointAt()`
- **`App`** — 主控制器，状态机、事件处理、模式切换

### 关键交互状态（App 实例属性）

- `mode`: `'select' | 'smd' | 'header' | 'flywire' | 'solder'`
- `routingState`: `{points: [{gx,gy},...]}` — 焊锡走线临时状态
- `_solderClickCount`, `_solderClickPos`, `_solderTimer` — 焊锡模式单击/双击检测
- `_isDirty`: 当前文件是否有未保存修改
- `selectedObject`: 当前选中对象
- `headerPreview`: 排针放置预览矩形

## 焊锡模式走线规则（v0.7+）

**核心问题**：浏览器的 `dblclick` 事件在两次 `click` 之后才触发，如果 `_handleSolderClick` 在 mousedown 直接执行逻辑，双击的第一击会误触发提交。

**v0.7 解决方案**：手动点击计数——mousedown 计数，280ms 窗口内第二次点击=双击，超时=单击。不依赖浏览器 dblclick 事件。

**v0.9 关键修复**：`_onMouseUp` 中 `routingState.points.length <= 1 && !isDragging → routingState=null` 会把双击刚启动的走线清掉。需加 `this.mode !== 'solder'` 条件。

**v0.10 关键修复**：v0.7 删除了 `_onMouseMove` 中的局部变量 `gp`（改成直接赋值 `this.highlightedGridPoint`），但排针预览代码仍引用 `gp` → `undefined` → 条件永不成立 → 预览尺寸永远是 1×1。

## 常见陷阱

1. **`nearestGridPoint` 可能返回 `null`**（鼠标离格点太远时）。需要始终有值的场景用 `screenToGrid`。
2. **mousedown/mouseup 顺序**：浏览器的 dblclick 事件在两次完整 click 之后。不要在 mousedown 中做不可逆操作。
3. **`_drawTempElements` 中的预览**：依赖 `highlightedGridPoint`，焊锡模式下必须始终有值。
4. **排针预览需要 `mouseDown` 为 `true`**：v0.8 在焊锡模式下设置 `mouseDown=false` 是正确的（防止长按检测干扰），但只影响 solder 模式。
5. **`_onMouseUp` 中的清理逻辑**：`routingState` 只有 1 个点时取消走线——这条规则只适用于选择模式的长按拖拽，不适用于焊锡模式的双击流程。

## 版本命名规则

- 主文件始终为 `perfboard.html`
- 带版本号的副本：`perfboard-vX.X.html`
- 所有历史版本归档在 `旧版本/` 目录
- Git tag: `vX.X`
- 用户确认功能无 bug 前使用 0.x 版本号
