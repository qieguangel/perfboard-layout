// ==================== 鼠标事件 ====================
App.prototype._onMouseDown = function(e) {
  const pos = this._getMousePos(e);
  this.mouseX = pos.x; this.mouseY = pos.y;
  this.mouseDown = true;
  this.mouseDownTime = Date.now();
  this.mouseDownSX = pos.x;
  this.mouseDownSY = pos.y;
  this.mouseButton = e.button;
  this.isDragging = false;

  // 右键：开始平移
  if (e.button === 2) {
    this.dragStartOffsetX = this.offsetX;
    this.dragStartOffsetY = this.offsetY;
    return;
  }

  if (e.button !== 0) return;

  // 根据模式处理
  if (this.mode === 'smd') {
    this._handleSMDClick(pos);
    return;
  }
  if (this.mode === 'flywire') {
    this._handleFlyWireClick(pos);
    return;
  }
  if (this.mode === 'solder') {
    this._handleSolderClick(pos);
    // 焊锡模式下点击即处理完毕，立即清除mouseDown，防止mousemove中的长按检测误触发_updateRouting
    this.mouseDown = false;
    this.isDragging = false;
    return;
  }
  if (this.mode === 'header') {
    this._startHeaderPlace(pos);
    return;
  }
  if (this.mode === 'eraser') {
    this._eraserErase(pos);
    return;
  }

  // 选择模式
  // Ctrl+点击多选切换
  if ((e.ctrlKey || e.metaKey) && this.mode === 'select') {
    const hit = this.hitTester.hitAnythingAt(pos.x, pos.y);
    if (hit) {
      this._toggleMultiSelect(hit);
      this.mouseDown = false; // 防止后续拖拽
      this._updatePropPanel();
      this._updateCompList();
    } else {
      // Ctrl+点击空白：清空多选
      this._multiSelObjects = [];
      this.selectedObject = null;
      this._updatePropPanel();
      this._updateCompList();
    }
    return;
  }

  // 检查是否点击了焊锡段
  const seg = this.hitTester.solderSegmentAt(pos.x, pos.y);
  if (seg) {
    // 点击焊锡段，准备可能的拖拽
    this.selectedObject = seg;
    this.dragSegInfo = seg;
    this.dragSegStartPoints = seg.trace.points.map(p => ({gx: p.gx, gy: p.gy}));
    this._updatePropPanel();
    this._updateCompList();
    return;
  }

  // 检查是否点击了飞线
  const fw = this.hitTester.flyWireAt(pos.x, pos.y);
  if (fw) {
    this.selectedObject = fw;
    this._updatePropPanel();
    this._updateCompList();
    return;
  }

  // 检查是否点击了器件
  const comp = this.hitTester.componentAt(pos.x, pos.y);
  if (comp) {
    this.selectedObject = comp;
    this._dragGroupStart = null; // 点击独立器件时清除编组拖拽
    this.dragCompStart = comp.type === 'smd'
      ? {gx1: comp.gx1, gy1: comp.gy1, gx2: comp.gx2, gy2: comp.gy2}
      : {gx: comp.gx, gy: comp.gy};
    const rf = this.hitTester.screenToGridFloat(pos.x, pos.y);
    this.dragMouseStart = {gx: rf.gx, gy: rf.gy};
    this._updatePropPanel();
    this._updateCompList();
    return;
  }

  // 检查是否点击了编组成员（即使componentAt跳过，仍可拖拽整组）
  const grpComp = this._findGroupedComponentAt(pos.x, pos.y);
  if (grpComp && grpComp.groupId) {
    const grp = this.model.componentGroups.find(g => g.id === grpComp.groupId);
    if (grp) {
      this.selectedObject = grp;
      this._dragGroupStart = [];
      for (const cid of grp.componentIds) {
        const c = this.model.findById(cid);
        if (!c) continue;
        if (c.type === 'smd') this._dragGroupStart.push({comp:c, gx1:c.gx1, gy1:c.gy1, gx2:c.gx2, gy2:c.gy2});
        else this._dragGroupStart.push({comp:c, gx:c.gx, gy:c.gy});
      }
      const rf = this.hitTester.screenToGridFloat(pos.x, pos.y);
      this.dragMouseStart = {gx: rf.gx, gy: rf.gy};
      this._updatePropPanel();
      this._updateCompList();
      return;
    }
  }

  // 选择模式空白处：开始矩形框选（短按拖动即可，移除格点路由避免冲突）
  this.selectedObject = null;
  this._multiSelObjects = [];
  this._selectRect = {sx1: pos.x, sy1: pos.y, sx2: pos.x, sy2: pos.y};
  this._updatePropPanel();
  this._updateCompList();
};

App.prototype._onMouseMove = function(e) {
  const pos = this._getMousePos(e);
  const dx = pos.x - this.mouseDownSX;
  const dy = pos.y - this.mouseDownSY;
  this.mouseX = pos.x; this.mouseY = pos.y;
  this._needsRender = true; // 鼠标移动需要重绘（预览线/高亮）

  // 更新格点高亮（焊锡模式始终显示，其他模式仅靠近格点时显示）
  if (this.mode === 'solder') {
    this.highlightedGridPoint = this.hitTester.screenToGrid(pos.x, pos.y);
  } else {
    this.highlightedGridPoint = this.hitTester.nearestGridPoint(pos.x, pos.y);
  }

  // 右键平移
  if (this.mouseDown && this.mouseButton === 2) {
    this.offsetX = this.dragStartOffsetX + dx;
    this.offsetY = this.dragStartOffsetY + dy;
    this.isDragging = true;
    this._updateStatus();
    return;
  }

  // 橡皮擦模式：长按拖拽连续擦除
  if (this.mode === 'eraser' && this.mouseDown && this.mouseButton === 0) {
    const elapsed = Date.now() - this.mouseDownTime;
    if (elapsed >= LONG_PRESS_MS) {
      this._eraserErase(pos);
    }
    return;
  }

  // 矩形框选更新（短按拖动即可，不要求长按）
  if (this._selectRect && this.mouseDown && this.mode === 'select') {
    if (Math.hypot(dx, dy) > 3) {
      this.isDragging = true;
      this._selectRect.sx2 = pos.x; this._selectRect.sy2 = pos.y;
    }
    return;
  }

  // 排针放置预览
  if (this.mouseDown && this.mode === 'header' && this.headerPreview) {
    const startGp = this.hitTester.nearestGridPoint(this.mouseDownSX, this.mouseDownSY);
    const hgp = this.highlightedGridPoint;
    if (startGp && hgp) {
      const gx = Math.min(startGp.gx, hgp.gx);
      const gy = Math.min(startGp.gy, hgp.gy);
      const w = Math.abs(hgp.gx - startGp.gx) + 1;
      const h = Math.abs(hgp.gy - startGp.gy) + 1;
      this.headerPreview = {gx, gy, w, h};
    }
    return;
  }

  // 长按检测
  const elapsed = Date.now() - this.mouseDownTime;
  const moved = Math.hypot(dx, dy);

  if (this.mouseDown && !this.isDragging) {
    // 焊锡段拖拽
    if (this.dragSegInfo && elapsed >= LONG_PRESS_MS) {
      this.isDragging = true;
      return;
    }

    // 器件/编组/框选移动
    if ((this.dragCompStart || this._dragGroupStart) && this.selectedObject && elapsed >= LONG_PRESS_MS) {
      // 框选状态下自动转为临时_dragGroupStart
      const compIds = this._getMultiSelCompIds();
      if (!this._dragGroupStart && compIds.length >= 2) {
        this._dragGroupStart = [];
        for (const cid of compIds) {
          const c = this.model.findById(cid);
          if (!c) continue;
          if (c.type === 'smd') this._dragGroupStart.push({comp:c, gx1:c.gx1, gy1:c.gy1, gx2:c.gx2, gy2:c.gy2});
          else this._dragGroupStart.push({comp:c, gx:c.gx, gy:c.gy});
        }
      }
      this.isDragging = true;
      this._moveComponentToCursor(pos);
      return;
    }
  }

  // 已经处于拖拽状态
  if (this.isDragging) {
    if (this.dragSegInfo) {
      this._dragSegment(pos);
    } else if (this._dragGroupStart || (this.dragCompStart && this.selectedObject)) {
      this._moveComponentToCursor(pos);
    } else if (this.routingState) {
      this._updateRouting(pos);
    }
  }

  this._updateStatus();
};

App.prototype._onMouseUp = function(e) {
  const pos = this._getMousePos(e);
  const elapsed = Date.now() - this.mouseDownTime;
  const moved = Math.hypot(pos.x - this.mouseDownSX, pos.y - this.mouseDownSY);

  if (e.button === 2) {
    this.mouseDown = false;
    this.isDragging = false;
    return;
  }

  if (e.button !== 0) return;

  // 矩形框选完成
  if (this._selectRect && this.isDragging) {
    this._finishRectSelect();
    this.mouseDown = false; this.isDragging = false;
    return;
  }
  this._selectRect = null;

  // 排针放置完成
  if (this.mode === 'header' && this.headerPreview) {
    this._finishHeaderPlace();
    this.mouseDown = false;
    this.isDragging = false;
    return;
  }

  // 焊锡段拖拽完成
  if (this.isDragging && this.dragSegInfo) {
    this._finishSegmentDrag(pos);
    this.mouseDown = false;
    this.isDragging = false;
    return;
  }

  // 器件/编组/框选移动完成
  if (this.isDragging && (this._dragGroupStart || (this.dragCompStart && this.selectedObject))) {
    this._finishComponentMove();
    this.mouseDown = false;
    this.isDragging = false;
    return;
  }

  this.mouseDown = false;
  this.isDragging = false;
  this.dragSegInfo = null;
  this.dragSegStartPoints = null;

  this._autoSave();
};

App.prototype._onWheel = function(e) {
  const pos = this._getMousePos(e);
  const oldZoom = this.zoom;
  const delta = -Math.sign(e.deltaY) * ZOOM_STEP;
  this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.zoom + delta));

  // 以鼠标位置为中心缩放
  const worldX = (pos.x - this.offsetX) / oldZoom;
  const worldY = (pos.y - this.offsetY) / oldZoom;
  this.offsetX = pos.x - worldX * this.zoom;
  this.offsetY = pos.y - worldY * this.zoom;
  this._needsRender = true;
  this._updateStatus();
};

// ==================== 双击处理 ====================
App.prototype._onDoubleClick = function(e) {
  // 焊锡/飞线模式下不触发命名——这两种模式双击有其他用途
  if (this.mode === 'solder' || this.mode === 'flywire') return;

  const pos = this._getMousePos(e);

  // 检查是否双击了排针引脚
  const pinHit = this._hitTestHeaderPin(pos.x, pos.y);
  if (pinHit) {
    const {comp, dx, dy} = pinHit;
    const key = `${dx},${dy}`;
    const curLabel = comp.pinLabels ? comp.pinLabels[key] || '' : '';
    const newLabel = prompt(`引脚 (${dx+1},${dy+1}) 标签:`, curLabel);
    if (newLabel !== null) {
      if (!comp.pinLabels) comp.pinLabels = {};
      if (newLabel.trim()) {
        comp.pinLabels[key] = newLabel.trim();
      } else {
        delete comp.pinLabels[key];
      }
      this._autoSave();
    }
    return;
  }

  // 检查是否双击了器件
  const comp = this.hitTester.componentAt(pos.x, pos.y);
  if (comp) {
    this.selectedObject = comp;
    this._updatePropPanel();
    this._updateCompList();
    const newName = prompt('器件名称:', comp.name);
    if (newName !== null && newName.trim()) {
      comp.name = newName.trim();
      this._updatePropPanel();
      this._updateCompList();
      this._autoSave();
    }
    return;
  }

  // 双击飞线
  const fw = this.hitTester.flyWireAt(pos.x, pos.y);
  if (fw) {
    this.selectedObject = fw;
    this._updateCompList();
    return;
  }
};

App.prototype._hitTestHeaderPin = function(sx, sy) {
  for (const comp of this.model.headerComponents) {
    for (let dx = 0; dx < comp.w; dx++) {
      for (let dy = 0; dy < comp.h; dy++) {
        const p = this.hitTester.gridToScreen(comp.gx + dx, comp.gy + dy);
        const dist = Math.hypot(sx - p.sx, sy - p.sy);
        if (dist < this.gridSize * this.zoom * 0.35) {
          return {comp, dx, dy};
        }
      }
    }
  }
  return null;
};

// ==================== 键盘快捷键 ====================
App.prototype._onKeyDown = function(e) {
  // 如果在输入框中，不处理
  if (e.target.tagName === 'INPUT') return;

  const ctrl = e.ctrlKey || e.metaKey;

  if (ctrl && e.key === 'z') { e.preventDefault(); this.undo(); return; }
  if (ctrl && (e.key === 'y' || (e.key === 'Z' && e.shiftKey))) { e.preventDefault(); this.redo(); return; }
  if (ctrl && e.key === 'c') { e.preventDefault(); this.copy(); return; }
  if (ctrl && e.key === 'v') { e.preventDefault(); this.paste(); return; }
  if (ctrl && e.key === 'x') { e.preventDefault(); this.cut(); return; }
  if (ctrl && e.key === 'r') { e.preventDefault(); this.rotateComponent(); return; }
  if (ctrl && e.key === 's') { e.preventDefault(); this._save(); return; }

  if (e.key === 'h' || e.key === 'H') { e.preventDefault(); this.flipHorizontal(); return; }
  if (e.key === 'v' || e.key === 'V') { e.preventDefault(); this.flipVertical(); return; }
  if (e.key === 'Delete' || e.key === 'Del') { e.preventDefault(); this.deleteSelected(); return; }
  if (e.key === 'Escape') { e.preventDefault(); this._cancelAll(); return; }
  if (e.key === 'g' || e.key === 'G') { e.preventDefault(); this._groupSelected(); return; }
  if (e.key === 'u' || e.key === 'U') { e.preventDefault(); this._ungroupSelected(); return; }

  if (e.key === '1') { this.setMode('select'); return; }
  if (e.key === '2') { this.setMode('smd'); return; }
  if (e.key === '3') { this.setMode('header'); return; }
  if (e.key === '4') { this.setMode('flywire'); return; }
  if (e.key === '5') { this.setMode('solder'); return; }
  if (e.key === '6') { this.setMode('eraser'); return; }

  // 焊锡模式下 Enter 完成当前走线
  if (e.key === 'Enter' && this.mode === 'solder' && this.routingState) {
    e.preventDefault();
    if (this._solderTimer) { clearTimeout(this._solderTimer); this._solderTimer = null; }
    this._solderClickCount = 0;
    if (this.routingState.points.length >= 2) {
      this._finishRouting();
      document.getElementById('status-hint').textContent = '焊锡走线已完成';
    } else {
      this.routingState = null;
      this.routingFromEndpoint = null;
      document.getElementById('status-hint').textContent = '焊锡走线已取消';
    }
  }

  // Ctrl+点击多选切换
  _toggleMultiSelect(hit) {
    const idx = this._multiSelObjects.findIndex(
      o => o.type === hit.type && o.id === hit.id
    );
    if (idx >= 0) {
      // 已选中 → 移除
      this._multiSelObjects.splice(idx, 1);
    } else {
      // 未选中 → 添加
      this._multiSelObjects.push({type: hit.type, id: hit.id});
    }
    if (this._multiSelObjects.length === 0) {
      this.selectedObject = null;
    } else {
      this.selectedObject = null; // 多选活跃时无单选
    }
  }
};
