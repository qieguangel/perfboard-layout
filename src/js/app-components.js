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

  // 组拖拽（组件部分）
  if (this._dragGroupStart) {
    for (const item of this._dragGroupStart) {
      if (item.gx1 !== undefined) {
        item.comp.gx1 = item.gx1 + dgx; item.comp.gy1 = item.gy1 + dgy;
        item.comp.gx2 = item.gx2 + dgx; item.comp.gy2 = item.gy2 + dgy;
      } else {
        item.comp.gx = item.gx + dgx; item.comp.gy = item.gy + dgy;
      }
    }
  } else if (this.selectedObject && this.dragCompStart) {
    const obj = this.selectedObject;
    const start = this.dragCompStart;
    if (obj.type === 'smd') {
      obj.gx1 = start.gx1 + dgx; obj.gy1 = start.gy1 + dgy;
      obj.gx2 = start.gx2 + dgx; obj.gy2 = start.gy2 + dgy;
    } else if (obj.type === 'header') {
      obj.gx = start.gx + dgx; obj.gy = start.gy + dgy;
    } else if (start.from !== undefined) {
      // 飞线
      obj.from.gx = start.from.gx + dgx; obj.from.gy = start.from.gy + dgy;
      obj.to.gx = start.to.gx + dgx; obj.to.gy = start.to.gy + dgy;
    }
  }

  // 多选中的走线/飞线移动（从原始位置计算，非累积）
  if (this._dragTraceFW) {
    for (const s of this._dragTraceFW) {
      if (s.type === 'trace') {
        const t = this.model.solderTraces.find(tr => tr.id === s.id);
        if (t) for (let i = 0; i < t.points.length; i++) { t.points[i].gx = s.pts[i].gx + dgx; t.points[i].gy = s.pts[i].gy + dgy; }
      } else if (s.type === 'flywire') {
        const f = this.model.flyWires.find(fw => fw.id === s.id);
        if (f) { f.from.gx = s.from.gx + dgx; f.from.gy = s.from.gy + dgy; f.to.gx = s.to.gx + dgx; f.to.gy = s.to.gy + dgy; }
      }
    }
  }

  if (!this._dragGroupStart && (!this.selectedObject || !this.dragCompStart) && this._multiSelObjects.length === 0) return;
  this._updatePropPanel();
};

App.prototype._finishComponentMove = function() {
  // 快照多选中的走线/飞线当前位置
  const traceSnaps = [], fwSnaps = [];
  for (const obj of this._multiSelObjects) {
    if (obj.type === 'trace') {
      const t = this.model.solderTraces.find(tr => tr.id === obj.id);
      if (t) traceSnaps.push({id: t.id, pts: t.points.map(p => ({gx:p.gx, gy:p.gy}))});
    } else if (obj.type === 'flywire') {
      const f = this.model.flyWires.find(fw => fw.id === obj.id);
      if (f) fwSnaps.push({id: f.id, from:{gx:f.from.gx, gy:f.from.gy}, to:{gx:f.to.gx, gy:f.to.gy}});
    }
  }

  const makeCmd = (label, applyFn, undoFn) => {
    this.cmdMgr.execute(new Command(label, applyFn, undoFn));
  };

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
    const tSnaps = traceSnaps, fSnaps = fwSnaps;
    makeCmd('移动编组', () => {
      for (const n of newItems) {
        if (n.gx1 !== undefined) { n.comp.gx1=n.gx1; n.comp.gy1=n.gy1; n.comp.gx2=n.gx2; n.comp.gy2=n.gy2; }
        else { n.comp.gx=n.gx; n.comp.gy=n.gy; }
      }
      return {oldItems, tSnaps, fSnaps};
    }, (data) => {
      for (const o of data.oldItems) {
        if (o.gx1 !== undefined) { o.comp.gx1=o.gx1; o.comp.gy1=o.gy1; o.comp.gx2=o.gx2; o.comp.gy2=o.gy2; }
        else { o.comp.gx=o.gx; o.comp.gy=o.gy; }
      }
      for (const s of data.tSnaps) {
        const t = this.model.solderTraces.find(tr => tr.id === s.id);
        if (t) t.points = s.pts.map(p => ({gx:p.gx, gy:p.gy}));
      }
      for (const s of data.fSnaps) {
        const f = this.model.flyWires.find(fw => fw.id === s.id);
        if (f) { f.from.gx=s.from.gx; f.from.gy=s.from.gy; f.to.gx=s.to.gx; f.to.gy=s.to.gy; }
      }
    });
    this._dragGroupStart = null;
    this._dragTraceFW = null;
    this._updatePropPanel(); this._updateCompList(); this._autoSave();
    return;
  }
  if (!this.selectedObject || !this.dragCompStart) return;
  const obj = this.selectedObject;
  const oldState = this.dragCompStart;
  const that = this;
  let newState, label;

  if (obj.type === 'smd') {
    newState = {gx1: obj.gx1, gy1: obj.gy1, gx2: obj.gx2, gy2: obj.gy2};
    obj.gx1 = oldState.gx1; obj.gy1 = oldState.gy1;
    obj.gx2 = oldState.gx2; obj.gy2 = oldState.gy2;
    label = '移动器件';
  } else if (obj.type === 'header') {
    newState = {gx: obj.gx, gy: obj.gy};
    obj.gx = oldState.gx; obj.gy = oldState.gy;
    label = '移动器件';
  } else {
    // 飞线
    newState = {from: {gx: obj.from.gx, gy: obj.from.gy}, to: {gx: obj.to.gx, gy: obj.to.gy}};
    obj.from.gx = oldState.from.gx; obj.from.gy = oldState.from.gy;
    obj.to.gx = oldState.to.gx; obj.to.gy = oldState.to.gy;
    label = '移动飞线';
  }

  const cmd = new Command(label, () => {
    if (obj.type === 'smd') {
      obj.gx1 = newState.gx1; obj.gy1 = newState.gy1;
      obj.gx2 = newState.gx2; obj.gy2 = newState.gy2;
    } else if (obj.type === 'header') {
      obj.gx = newState.gx; obj.gy = newState.gy;
    } else {
      obj.from.gx = newState.from.gx; obj.from.gy = newState.from.gy;
      obj.to.gx = newState.to.gx; obj.to.gy = newState.to.gy;
    }
    return {obj, oldState};
  }, (data) => {
    if (data.obj.type === 'smd') {
      data.obj.gx1 = data.oldState.gx1; data.obj.gy1 = data.oldState.gy1;
      data.obj.gx2 = data.oldState.gx2; data.obj.gy2 = data.oldState.gy2;
    } else if (data.obj.type === 'header') {
      data.obj.gx = data.oldState.gx; data.obj.gy = data.oldState.gy;
    } else {
      data.obj.from.gx = data.oldState.from.gx; data.obj.from.gy = data.oldState.from.gy;
      data.obj.to.gx = data.oldState.to.gx; data.obj.to.gy = data.oldState.to.gy;
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

  let ids = [];
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
      ids.push({type: comp.type, id: comp.id});
    }
  }
  // 过滤：只选中部分编组成员的，全部移除（编组不可部分选中）
  const selIds = new Set(ids.filter(o => o.type === 'smd' || o.type === 'header').map(o => o.id));
  for (const grp of this.model.componentGroups) {
    const inSel = grp.componentIds.filter(id => selIds.has(id));
    if (inSel.length > 0 && inSel.length < grp.componentIds.length) {
      // 部分选中 → 移除该组所有成员
      ids = ids.filter(o => !grp.componentIds.includes(o.id));
    }
  }
  // 框选焊锡走线（走线任一点在矩形内 → 整条加入）
  for (const trace of this.model.solderTraces) {
    let inRect = false;
    for (const pt of trace.points) {
      const p = this.hitTester.gridToScreen(pt.gx, pt.gy);
      if (p.sx >= x1 && p.sx <= x2 && p.sy >= y1 && p.sy <= y2) { inRect = true; break; }
    }
    if (inRect) ids.push({type: 'trace', id: trace.id});
  }
  // 框选飞线（两端点都在矩形内 → 加入）
  for (const fw of this.model.flyWires) {
    const a = this.hitTester.gridToScreen(fw.from.gx, fw.from.gy);
    const b = this.hitTester.gridToScreen(fw.to.gx, fw.to.gy);
    if (a.sx >= x1 && a.sx <= x2 && a.sy >= y1 && a.sy <= y2 &&
        b.sx >= x1 && b.sx <= x2 && b.sy >= y1 && b.sy <= y2) {
      ids.push({type: 'flywire', id: fw.id});
    }
  }
  this._multiSelObjects = ids;
  if (ids.length > 0) {
    this.selectedObject = null;
    const cc = ids.filter(o => o.type === 'smd' || o.type === 'header').length;
    const tc = ids.filter(o => o.type === 'trace').length;
    const fc = ids.filter(o => o.type === 'flywire').length;
    let desc = []; if (cc) desc.push(`${cc}器件`); if (tc) desc.push(`${tc}走线`); if (fc) desc.push(`${fc}飞线`);
    document.getElementById('status-hint').textContent = `已框选 ${desc.join('+')} | G编组 Ctrl+R旋转`;
  }
  this._selectRect = null;
  this._updateCompList();
};

// 编组
App.prototype._groupSelected = function() {
  const ids = this._getSelectionIds();
  if (ids.length < 2) { document.getElementById('status-hint').textContent = '至少选2个器件才能编组'; return; }
  const group = { id: uid(), name: 'Grp' + (this.model.componentGroups.length + 1), componentIds: [...ids] };
  const that = this;
  const oldGroups = new Map(); // comp.id → old groupId
  for (const comp of this.model.allComponents()) {
    if (ids.includes(comp.id)) { oldGroups.set(comp.id, comp.groupId); comp.groupId = group.id; }
  }
  this.model.componentGroups.push(group);
  this._multiSelObjects = [];
  this.selectedObject = group;

  const cmd = new Command('编组', () => {
    for (const comp of that.model.allComponents()) { if (ids.includes(comp.id)) comp.groupId = group.id; }
    if (!that.model.componentGroups.includes(group)) that.model.componentGroups.push(group);
    that.selectedObject = group;
    return {group, ids, oldGroups};
  }, (data) => {
    for (const comp of that.model.allComponents()) { if (data.ids.includes(comp.id)) comp.groupId = data.oldGroups.get(comp.id) || null; }
    that.model.componentGroups = that.model.componentGroups.filter(g => g.id !== data.group.id);
    that.selectedObject = null;
  });
  this.cmdMgr.execute(cmd);
  this._updateCompList();
  this._autoSave();
  document.getElementById('status-hint').textContent = `已编组: ${group.name}`;
};

// 拆组
App.prototype._ungroupSelected = function() {
  const sel = this.selectedObject;
  const that = this;
  if (sel && sel.componentIds) {
    const oldGroup = JSON.parse(JSON.stringify(sel));
    const oldComps = new Map();
    for (const comp of this.model.allComponents()) {
      if (comp.groupId === sel.id) { oldComps.set(comp.id, comp.groupId); comp.groupId = null; }
    }
    this.model.componentGroups = this.model.componentGroups.filter(g => g.id !== sel.id);
    this.selectedObject = null;
    this._dragGroupStart = null;

    const cmd = new Command('拆组', () => {
      for (const comp of that.model.allComponents()) { if (oldComps.has(comp.id)) comp.groupId = null; }
      that.model.componentGroups = that.model.componentGroups.filter(g => g.id !== oldGroup.id);
      that.selectedObject = null;
      return {oldGroup, oldComps};
    }, (data) => {
      for (const comp of that.model.allComponents()) { if (data.oldComps.has(comp.id)) comp.groupId = data.oldComps.get(comp.id); }
      that.model.componentGroups.push(data.oldGroup);
    });
    this.cmdMgr.execute(cmd);
    this._updateCompList();
    this._autoSave();
    document.getElementById('status-hint').textContent = '已拆组';
  } else if (this._getMultiSelCompIds().length >= 2) {
    const compIds = this._getMultiSelCompIds();
    for (const comp of this.model.allComponents()) {
      if (compIds.includes(comp.id)) comp.groupId = null;
    }
    document.getElementById('status-hint').textContent = '已拆组';
  }
};

// 从多选对象中提取仅组件的ID列表（用于编组/旋转/翻转等组件专用操作）
App.prototype._getMultiSelCompIds = function() {
  return this._multiSelObjects
    .filter(o => o.type === 'smd' || o.type === 'header')
    .map(o => o.id);
};

// 获取当前选中的所有对象（统一多选/单选/编组）
App.prototype._getAllSelectedObjects = function() {
  if (this._multiSelObjects.length > 0) return [...this._multiSelObjects];
  if (this.selectedObject) {
    if (this.selectedObject.componentIds) {
      return this.selectedObject.componentIds.map(id => {
        const c = this.model.findById(id);
        return c ? {type: c.type, id} : null;
      }).filter(Boolean);
    }
    if (this.selectedObject.type === 'smd' || this.selectedObject.type === 'header') {
      return [{type: this.selectedObject.type, id: this.selectedObject.id}];
    }
    if (this.selectedObject.trace && this.selectedObject.segIdx !== undefined) {
      return [{type: 'trace', id: this.selectedObject.trace.id}];
    }
    if (this.selectedObject.from !== undefined) {
      return [{type: 'flywire', id: this.selectedObject.id}];
    }
  }
  return [];
};

// 获取当前多选id列表（组件ID，兼容旧接口）
App.prototype._getSelectionIds = function() {
  if (this._multiSelObjects.length > 0) return this._getMultiSelCompIds();
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
  this._multiSelObjects = [];
  this.headerPreview = null;
  this.flyWireStart = null;
  this.smdStart = null;
  this.dragSegInfo = null;
  this.dragSegStartPoints = null;
  this.dragCompStart = null;
  this.dragMouseStart = null;
  this._dragTraceFW = null;
  this.selectedObject = null;
  this.isDragging = false;
  this.mouseDown = false;
  this._updatePropPanel();
  this._updateCompList();
};
