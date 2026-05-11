// ==================== 器件移动 ====================
// 查找编组成员（componentAt会跳过，但拖拽和双击引脚仍需）
App.prototype._findGroupedComponentAt = function(sx, sy) {
  let best = null, bestDist = Infinity;
  for (const comp of this.model.allComponents()) {
    if (!comp.groupId) continue;
    const d = this.hitTester._distToComponent(comp, sx, sy);
    if (d !== null && d < bestDist) { bestDist = d; best = comp; }
  }
  if (best && bestDist < this.gridSize * this.zoom + SMD_HIT_DIST) return best;
  return null;
};

App.prototype._moveComponentToCursor = function(pos) {
  if (!this.dragMouseStart) return;
  // 使用浮点格点，小幅度鼠标移动也能追踪
  const rf = this.hitTester.screenToGridFloat(pos.x, pos.y);
  const dgx = Math.round(rf.gx - this.dragMouseStart.gx);
  const dgy = Math.round(rf.gy - this.dragMouseStart.gy);

  // 组拖拽
  if (this._dragGroupStart) {
    for (const item of this._dragGroupStart) {
      if (item.gx1 !== undefined) {
        item.comp.gx1 = item.gx1 + dgx; item.comp.gy1 = item.gy1 + dgy;
        item.comp.gx2 = item.gx2 + dgx; item.comp.gy2 = item.gy2 + dgy;
      } else {
        item.comp.gx = item.gx + dgx; item.comp.gy = item.gy + dgy;
      }
    }
    return;
  }

  if (!this.selectedObject || !this.dragCompStart) return;
  const comp = this.selectedObject;
  const start = this.dragCompStart;
  if (comp.type === 'smd') {
    comp.gx1 = start.gx1 + dgx; comp.gy1 = start.gy1 + dgy;
    comp.gx2 = start.gx2 + dgx; comp.gy2 = start.gy2 + dgy;
  } else if (comp.type === 'header') {
    comp.gx = start.gx + dgx; comp.gy = start.gy + dgy;
  }
  this._updatePropPanel();
};

App.prototype._finishComponentMove = function() {
  // 组拖拽完成
  if (this._dragGroupStart) {
    const oldItems = this._dragGroupStart.map(item => {
      if (item.gx1 !== undefined) return {comp:item.comp, gx1:item.gx1, gy1:item.gy1, gx2:item.gx2, gy2:item.gy2};
      return {comp:item.comp, gx:item.gx, gy:item.gy};
    });
    const newItems = this._dragGroupStart.map(item => {
      if (item.gx1 !== undefined) return {comp:item.comp, gx1:item.comp.gx1, gy1:item.comp.gy1, gx2:item.comp.gx2, gy2:item.comp.gy2};
      return {comp:item.comp, gx:item.comp.gx, gy:item.comp.gy};
    });
    const that = this;
    const cmd = new Command('移动编组', () => {
      for (const n of newItems) {
        if (n.gx1 !== undefined) { n.comp.gx1=n.gx1; n.comp.gy1=n.gy1; n.comp.gx2=n.gx2; n.comp.gy2=n.gy2; }
        else { n.comp.gx=n.gx; n.comp.gy=n.gy; }
      }
      return {oldItems};
    }, (data) => {
      for (const o of data.oldItems) {
        if (o.gx1 !== undefined) { o.comp.gx1=o.gx1; o.comp.gy1=o.gy1; o.comp.gx2=o.gx2; o.comp.gy2=o.gy2; }
        else { o.comp.gx=o.gx; o.comp.gy=o.gy; }
      }
    });
    this.cmdMgr.execute(cmd);
    this._dragGroupStart = null;
    this._updatePropPanel(); this._updateCompList(); this._autoSave();
    return;
  }
  if (!this.selectedObject || !this.dragCompStart) return;
  const comp = this.selectedObject;
  const newState = comp.type === 'smd'
    ? {gx1: comp.gx1, gy1: comp.gy1, gx2: comp.gx2, gy2: comp.gy2}
    : {gx: comp.gx, gy: comp.gy};
  const oldState = this.dragCompStart;
  const that = this;

  // 先恢复到原始状态，让execute重新设置
  if (comp.type === 'smd') {
    comp.gx1 = oldState.gx1; comp.gy1 = oldState.gy1;
    comp.gx2 = oldState.gx2; comp.gy2 = oldState.gy2;
  } else {
    comp.gx = oldState.gx; comp.gy = oldState.gy;
  }

  const cmd = new Command('移动器件', () => {
    if (comp.type === 'smd') {
      comp.gx1 = newState.gx1; comp.gy1 = newState.gy1;
      comp.gx2 = newState.gx2; comp.gy2 = newState.gy2;
    } else {
      comp.gx = newState.gx; comp.gy = newState.gy;
    }
    return {comp, oldState};
  }, (data) => {
    if (data.comp.type === 'smd') {
      data.comp.gx1 = data.oldState.gx1; data.comp.gy1 = data.oldState.gy1;
      data.comp.gx2 = data.oldState.gx2; data.comp.gy2 = data.oldState.gy2;
    } else {
      data.comp.gx = data.oldState.gx; data.comp.gy = data.oldState.gy;
    }
  });

  this.cmdMgr.execute(cmd);
  this.dragCompStart = null;
  this.dragMouseStart = null;
  this._updatePropPanel();
  this._updateCompList();
  this._autoSave();
};

// ==================== 放置操作（SMD/飞线/排针） ====================
App.prototype._handleSMDClick = function(pos) {
  const gp = this.hitTester.nearestGridPoint(pos.x, pos.y);
  if (!gp) return;

  if (!this.smdStart) {
    this.smdStart = {gx: gp.gx, gy: gp.gy};
    return;
  }

  // 检查是否相邻
  const dx = Math.abs(gp.gx - this.smdStart.gx);
  const dy = Math.abs(gp.gy - this.smdStart.gy);
  if (!((dx === 1 && dy === 0) || (dx === 0 && dy === 1))) {
    this.smdStart = {gx: gp.gx, gy: gp.gy}; // 重新选起点
    return;
  }

  const that = this;
  const comp = {
    id: uid(), type: 'smd',
    name: `R${that._smdCounter++}`,
    gx1: this.smdStart.gx, gy1: this.smdStart.gy,
    gx2: gp.gx, gy2: gp.gy,
  };

  const cmd = new Command('放置贴片器件', () => {
    that.model.addComponent(comp);
    return {comp};
  }, (data) => {
    that.model.remove(data.comp);
  });

  this.cmdMgr.execute(cmd);
  this.smdStart = null;
  this.selectedObject = comp;
  this._updatePropPanel();
  this._updateCompList();
  this._autoSave();
};

App.prototype._handleFlyWireClick = function(pos) {
  const gp = this.hitTester.nearestGridPoint(pos.x, pos.y);
  if (!gp) return;

  if (!this.flyWireStart) {
    this.flyWireStart = {gx: gp.gx, gy: gp.gy};
    return;
  }

  if (this.flyWireStart.gx === gp.gx && this.flyWireStart.gy === gp.gy) {
    this.flyWireStart = null;
    return;
  }

  const fw = {id: uid(), from: this.flyWireStart, to: {gx: gp.gx, gy: gp.gy}};
  const that = this;

  const cmd = new Command('放置飞线', () => {
    that.model.addFlyWire(fw);
    return {fw};
  }, (data) => {
    that.model.remove(data.fw);
  });

  this.cmdMgr.execute(cmd);
  this.flyWireStart = null;
  this._autoSave();
};

App.prototype._startHeaderPlace = function(pos) {
  const gp = this.hitTester.nearestGridPoint(pos.x, pos.y);
  if (!gp) return;
  this.headerPreview = {gx: gp.gx, gy: gp.gy, w: 1, h: 1};
};

App.prototype._finishHeaderPlace = function() {
  if (!this.headerPreview) return;
  const that = this;
  const comp = {
    id: uid(), type: 'header',
    name: `J${that._headerCounter++}`,
    gx: this.headerPreview.gx,
    gy: this.headerPreview.gy,
    w: this.headerPreview.w,
    h: this.headerPreview.h,
    pinLabels: {},
  };

  const cmd = new Command('放置排针/排座', () => {
    that.model.addComponent(comp);
    return {comp};
  }, (data) => {
    that.model.remove(data.comp);
  });

  this.cmdMgr.execute(cmd);
  this.headerPreview = null;
  this.selectedObject = comp;
  this.mode = 'select';
  this._updateModeButtons();
  this._updatePropPanel();
  this._updateCompList();
  this._autoSave();
};

// ==================== 矩形框选/编组 ====================
App.prototype._finishRectSelect = function() {
  const r = this._selectRect;
  if (!r) return;
  const x1 = Math.min(r.sx1, r.sx2), x2 = Math.max(r.sx1, r.sx2);
  const y1 = Math.min(r.sy1, r.sy2), y2 = Math.max(r.sy1, r.sy2);
  if (x2 - x1 < 5 && y2 - y1 < 5) { this._selectRect = null; return; } // 太小忽略

  const ids = [];
  for (const comp of this.model.allComponents()) {
    // 获取组件屏幕位置
    let cx, cy;
    if (comp.type === 'smd') {
      const a = this.hitTester.gridToScreen(comp.gx1, comp.gy1);
      const b = this.hitTester.gridToScreen(comp.gx2, comp.gy2);
      cx = (a.sx + b.sx) / 2; cy = (a.sy + b.sy) / 2;
    } else {
      const p = this.hitTester.gridToScreen(comp.gx, comp.gy);
      const gs = this.gridSize * this.zoom;
      cx = p.sx + (comp.w - 1) * gs / 2;
      cy = p.sy + (comp.h - 1) * gs / 2;
    }
    if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) {
      ids.push(comp.id);
    }
  }
  this._multiSelection = ids;
  if (ids.length > 0) {
    this.selectedObject = null;
    document.getElementById('status-hint').textContent = `已框选 ${ids.length} 个器件 | G编组 G拆组`;
  }
  this._selectRect = null;
  this._updateCompList();
};

// 编组
App.prototype._groupSelected = function() {
  const ids = this._getSelectionIds();
  if (ids.length < 2) { document.getElementById('status-hint').textContent = '至少选2个器件才能编组'; return; }
  const group = { id: uid(), name: 'Grp' + (this.model.componentGroups.length + 1), componentIds: [...ids] };
  for (const comp of this.model.allComponents()) {
    if (ids.includes(comp.id)) comp.groupId = group.id;
  }
  this.model.componentGroups.push(group);
  this._multiSelection = [];
  this.selectedObject = group;
  this._updateCompList();
  this._autoSave();
  document.getElementById('status-hint').textContent = `已编组: ${group.name}`;
};

// 拆组
App.prototype._ungroupSelected = function() {
  const sel = this.selectedObject;
  if (sel && sel.componentIds) {
    for (const comp of this.model.allComponents()) {
      if (comp.groupId === sel.id) comp.groupId = null;
    }
    this.model.componentGroups = this.model.componentGroups.filter(g => g.id !== sel.id);
    this.selectedObject = null;
    this._dragGroupStart = null; // 清除残留编组拖拽数据
    this._updateCompList();
    this._autoSave();
    document.getElementById('status-hint').textContent = '已拆组';
  } else if (this._multiSelection.length >= 2) {
    for (const comp of this.model.allComponents()) {
      if (this._multiSelection.includes(comp.id)) comp.groupId = null;
    }
    document.getElementById('status-hint').textContent = '已拆组';
  }
};

// 获取当前多选id列表
App.prototype._getSelectionIds = function() {
  if (this._multiSelection.length > 0) return this._multiSelection;
  if (this.selectedObject) {
    if (this.selectedObject.componentIds) return this.selectedObject.componentIds;
    if (this.selectedObject.id) return [this.selectedObject.id];
  }
  return [];
};

// 多选移动
App.prototype._moveMultiSelection = function(dgx, dgy) {
  const ids = this._getSelectionIds();
  for (const comp of this.model.allComponents()) {
    if (!ids.includes(comp.id)) continue;
    if (comp.type === 'smd') {
      comp.gx1 += dgx; comp.gy1 += dgy;
      comp.gx2 += dgx; comp.gy2 += dgy;
    } else {
      comp.gx += dgx; comp.gy += dgy;
    }
  }
};

// 橡皮擦模式：长按拖拽擦除
App.prototype._eraserErase = function(pos) {
  // 擦除焊锡段
  const seg = this.hitTester.solderSegmentAt(pos.x, pos.y);
  if (seg) {
    const trace = seg.trace; const i = seg.segIdx;
    const oldTraceData = {id: trace.id, points: trace.points.map(p=>({gx:p.gx,gy:p.gy})), color: trace.color, name: trace.name};
    const that = this;
    const cmd = new Command('橡皮擦-焊锡段', () => {
      that.model.remove(trace);
      const leftPts = oldTraceData.points.slice(0, i + 1);
      const rightPts = oldTraceData.points.slice(i + 1);
      const ids = [];
      if (leftPts.length >= 2) { const t = {id: uid(), points: leftPts, color: oldTraceData.color, name: oldTraceData.name}; that.model.addSolderTrace(t); ids.push(t.id); }
      if (rightPts.length >= 2) { const t = {id: uid(), points: rightPts, color: oldTraceData.color, name: oldTraceData.name}; that.model.addSolderTrace(t); ids.push(t.id); }
      return {oldTraceData, newIds: ids};
    }, (data) => {
      for (const id of data.newIds) { const t = that.model.solderTraces.find(tr => tr.id === id); if (t) that.model.remove(t); }
      that.model.addSolderTrace({id: data.oldTraceData.id, points: data.oldTraceData.points, color: data.oldTraceData.color, name: data.oldTraceData.name});
    });
    this.cmdMgr.execute(cmd); this._autoSave(); return;
  }
  // 擦除飞线
  const fw = this.hitTester.flyWireAt(pos.x, pos.y);
  if (fw) {
    const saved = {id: fw.id, from: {gx:fw.from.gx,gy:fw.from.gy}, to: {gx:fw.to.gx,gy:fw.to.gy}};
    const that = this;
    const cmd = new Command('橡皮擦-飞线', () => { that.model.remove(fw); return {saved}; }, (data) => { that.model.addFlyWire(data.saved); });
    this.cmdMgr.execute(cmd); this._autoSave(); return;
  }
  // 擦除器件（保存完整数据以可靠恢复）
  const comp = this.hitTester.componentAt(pos.x, pos.y);
  if (comp) {
    const saved = JSON.parse(JSON.stringify(comp));
    const that = this;
    const cmd = new Command('橡皮擦-器件', () => {
      that.model.remove(comp); return {saved};
    }, (data) => {
      that.model.addComponent(data.saved);
    });
    this.cmdMgr.execute(cmd); this._autoSave(); return;
  }
  // 擦除编组成员
  const gc = this._findGroupedComponentAt(pos.x, pos.y);
  if (gc) {
    const gid = gc.groupId;
    for (const c of this.model.allComponents()) { if (c.groupId === gid) c.groupId = null; }
    this.model.componentGroups = this.model.componentGroups.filter(g => g.id !== gid);
    this._updateCompList(); this._autoSave();
  }
};

App.prototype._cancelAll = function() {
  this.routingState = null;
  this.routingFromEndpoint = null;
  if (this._solderTimer) { clearTimeout(this._solderTimer); this._solderTimer = null; }
  if (this._toastTimer) { clearTimeout(this._toastTimer); this._toastTimer = null; }
  this._solderPendingGp = null;
  this._solderClickCount = 0;
  this._solderClickPos = null;
  this._selectRect = null;
  this._multiSelection = [];
  this.headerPreview = null;
  this.flyWireStart = null;
  this.smdStart = null;
  this.dragSegInfo = null;
  this.dragSegStartPoints = null;
  this.dragCompStart = null;
  this.dragMouseStart = null;
  this.selectedObject = null;
  this.isDragging = false;
  this.mouseDown = false;
  this._updatePropPanel();
  this._updateCompList();
};
