// ==================== 编辑操作 ====================
App.prototype.undo = function() { this.cmdMgr.undo(); this._afterEdit(); };
App.prototype.redo = function() { this.cmdMgr.redo(); this._afterEdit(); };

App.prototype.copy = function() {
  const sel = this.selectedObject;
  if (!sel || (sel.type !== 'smd' && sel.type !== 'header')) return;
  this.clipboard = this.model.cloneComponent(sel);
  document.getElementById('status-hint').textContent = '已复制';
};

App.prototype.cut = function() {
  const sel = this.selectedObject;
  if (!sel || (sel.type !== 'smd' && sel.type !== 'header')) return;
  this.clipboard = this.model.cloneComponent(sel);
  this.deleteSelected();
  document.getElementById('status-hint').textContent = '已剪切';
};

App.prototype.paste = function() {
  if (!this.clipboard) return;
  const clone = JSON.parse(JSON.stringify(this.clipboard));
  clone.id = uid();
  // 偏移
  if (clone.type === 'smd') {
    clone.gx1 += 2; clone.gy1 += 2; clone.gx2 += 2; clone.gy2 += 2;
  } else {
    clone.gx += 2; clone.gy += 2;
  }
  const that = this;
  const cmd = new Command('粘贴器件', () => {
    that.model.addComponent(clone);
    return {comp: clone};
  }, (data) => {
    that.model.remove(data.comp);
  });
  this.cmdMgr.execute(cmd);
  this.selectedObject = clone;
  this._updatePropPanel();
  this._updateCompList();
  this._autoSave();
};

App.prototype._exportJSON = function() {
  const name = this._currentFile === '未命名' ? 'perfboard-layout' : this._currentFile;
  this._downloadJSON(name + '.json');
  document.getElementById('status-hint').textContent = `已导出: ${name}.json`;
};

App.prototype._downloadJSON = function(filename) {
  const data = JSON.stringify(this.model.toJSON(), null, 2);
  const blob = new Blob([data], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

App.prototype.deleteSelected = function() {
  const sel = this.selectedObject;
  if (!sel) return;

  // 焊锡段：删除该段，前后分裂为两条独立走线
  if (sel.trace && sel.segIdx !== undefined) {
    const trace = sel.trace;
    const i = sel.segIdx;
    const pts = trace.points;
    const leftPts = pts.slice(0, i + 1);   // points[0..i]
    const rightPts = pts.slice(i + 1);      // points[i+1..n]
    const that = this;

    const cmd = new Command('删除焊锡段', () => {
      // 移除原走线
      that.model.remove(trace);
      // 创建左右两段（至少2个点）
      const created = [];
      if (leftPts.length >= 2) {
        const lt = {id: uid(), points: leftPts.map(p=>({gx:p.gx,gy:p.gy})), color: trace.color, name: trace.name};
        that.model.addSolderTrace(lt); created.push(lt);
      }
      if (rightPts.length >= 2) {
        const rt = {id: uid(), points: rightPts.map(p=>({gx:p.gx,gy:p.gy})), color: trace.color, name: trace.name};
        that.model.addSolderTrace(rt); created.push(rt);
      }
      return {trace, leftPts, rightPts, created, oldColor: trace.color, oldName: trace.name};
    }, (data) => {
      for (const t of data.created) that.model.remove(t);
      that.model.addSolderTrace(data.trace);
    });

    this.cmdMgr.execute(cmd);
    this.selectedObject = null;
    this._updatePropPanel(); this._updateCompList(); this._autoSave();
    return;
  }

  // 普通对象删除
  const that = this;
  const arr = this.model.arrayFor(sel);
  const idx = arr ? arr.indexOf(sel) : -1;

  const cmd = new Command('删除', () => {
    that.model.remove(sel);
    return {obj: sel, arr, idx};
  }, (data) => {
    if (data.arr) data.arr.splice(data.idx, 0, data.obj);
  });

  this.cmdMgr.execute(cmd);
  this.selectedObject = null;
  this._updatePropPanel();
  this._updateCompList();
  this._autoSave();
};

App.prototype.rotateComponent = function() {
  const allObjs = this._getAllSelectedObjects();
  if (allObjs.length === 0) return;

  const bounds = this._computeSelectionBounds(allObjs);
  if (!bounds) return;
  const {cx, cy} = bounds;

  const snapshots = this._snapshotAllObjects(allObjs);
  const that = this;

  const cmd = new Command(allObjs.length >= 2 ? '旋转多选' : '旋转', () => {
    that._rotateAllObjects(allObjs, cx, cy);
    return {snapshots: that._snapshotAllObjects(allObjs)};
  }, (data) => {
    that._restoreAllObjects(data.snapshots);
  });

  this.cmdMgr.execute(cmd);
  this._autoSave();
};

App.prototype._rotateMulti = function(ids) {
  // 计算所有组件的中心
  let sumX = 0, sumY = 0, count = 0;
  for (const c of this.model.allComponents()) {
    if (!ids.includes(c.id)) continue;
    if (c.type === 'smd') { sumX += (c.gx1 + c.gx2) / 2; sumY += (c.gy1 + c.gy2) / 2; count++; }
    else { sumX += c.gx + (c.w - 1) / 2; sumY += c.gy + (c.h - 1) / 2; count++; }
  }
  if (count === 0) return;
  const cx = sumX / count, cy = sumY / count; // 浮点中心，不取整
  const that = this;
  const oldStates = [];
  for (const c of this.model.allComponents()) {
    if (!ids.includes(c.id)) continue;
    if (c.type === 'smd') {
      oldStates.push({comp: c, old: {gx1: c.gx1, gy1: c.gy1, gx2: c.gx2, gy2: c.gy2}});
      const dx1 = c.gx1 - cx, dy1 = c.gy1 - cy;
      const dx2 = c.gx2 - cx, dy2 = c.gy2 - cy;
      c.gx1 = Math.round(cx - dy1); c.gy1 = Math.round(cy + dx1);
      c.gx2 = Math.round(cx - dy2); c.gy2 = Math.round(cy + dx2);
    } else {
      oldStates.push({comp: c, old: {gx: c.gx, gy: c.gy, w: c.w, h: c.h, pinLabels: c.pinLabels ? JSON.parse(JSON.stringify(c.pinLabels)) : {}}});
      const dx = c.gx + (c.w - 1) / 2 - cx;
      const dy = c.gy + (c.h - 1) / 2 - cy;
      const newCenterX = cx - dy, newCenterY = cy + dx;
      const oldW = c.w, oldH = c.h;
      c.w = oldH; c.h = oldW;
      c.gx = Math.round(newCenterX - (c.w - 1) / 2);
      c.gy = Math.round(newCenterY - (c.h - 1) / 2);
      // 引脚标签跟随旋转: 旧(dx,dy)→新(oldH-1-dy, dx)
      if (c.pinLabels) {
        const newLabels = {};
        for (const [key, label] of Object.entries(c.pinLabels)) {
          const [dx, dy] = key.split(',').map(Number);
          newLabels[`${oldH - 1 - dy},${dx}`] = label;
        }
        c.pinLabels = newLabels;
      }
    }
  }
  const cmd = new Command('旋转多选', () => { return {oldStates}; }, (data) => {
    for (const {comp, old} of data.oldStates) {
      if (old.gx1 !== undefined) { comp.gx1 = old.gx1; comp.gy1 = old.gy1; comp.gx2 = old.gx2; comp.gy2 = old.gy2; }
      else { comp.gx = old.gx; comp.gy = old.gy; comp.w = old.w; comp.h = old.h; }
    }
  });
  this.cmdMgr.execute(cmd);
  this._autoSave();
};

App.prototype._rotateSMD = function(comp) {
  const old = {gx1: comp.gx1, gy1: comp.gy1, gx2: comp.gx2, gy2: comp.gy2};
  // 不取整中点，保证旋转后端点仍在格点上且相邻
  const cx = (comp.gx1 + comp.gx2) / 2;
  const cy = (comp.gy1 + comp.gy2) / 2;
  const dx1 = comp.gx1 - cx, dy1 = comp.gy1 - cy;
  const newGx1 = Math.round(cx - dy1), newGy1 = Math.round(cy + dx1);
  const newGx2 = Math.round(cx + dy1), newGy2 = Math.round(cy - dx1);
  const that = this;

  const cmd = new Command('旋转器件', () => {
    comp.gx1 = newGx1; comp.gy1 = newGy1;
    comp.gx2 = newGx2; comp.gy2 = newGy2;
    return {comp, old};
  }, (data) => {
    data.comp.gx1 = data.old.gx1; data.comp.gy1 = data.old.gy1;
    data.comp.gx2 = data.old.gx2; data.comp.gy2 = data.old.gy2;
  });
  this.cmdMgr.execute(cmd);
  this._autoSave();
};

App.prototype._rotateHeader = function(comp) {
  const oldW = comp.w, oldH = comp.h;
  const oldLabels = comp.pinLabels ? JSON.parse(JSON.stringify(comp.pinLabels)) : {};
  const old = {gx: comp.gx, gy: comp.gy, w: comp.w, h: comp.h, pinLabels: oldLabels};
  const that = this;

  const cmd = new Command('旋转器件', () => {
    const cx = comp.gx + (comp.w - 1) / 2;
    const cy = comp.gy + (comp.h - 1) / 2;
    comp.w = oldH;
    comp.h = oldW;
    comp.gx = Math.round(cx - (comp.w - 1) / 2);
    comp.gy = Math.round(cy - (comp.h - 1) / 2);
    // 变换引脚标签：旧(dx,dy) → 新(h-1-dy, dx)
    const newLabels = {};
    for (const [key, label] of Object.entries(oldLabels)) {
      const [dx, dy] = key.split(',').map(Number);
      const newKey = `${oldH - 1 - dy},${dx}`;
      newLabels[newKey] = label;
    }
    comp.pinLabels = newLabels;
    return {comp, old: {...old, pinLabels: oldLabels}};
  }, (data) => {
    data.comp.gx = data.old.gx; data.comp.gy = data.old.gy;
    data.comp.w = data.old.w; data.comp.h = data.old.h;
    data.comp.pinLabels = data.old.pinLabels;
  });
  this.cmdMgr.execute(cmd);
  this._autoSave();
};

App.prototype.flipHorizontal = function() { this._flipGeneric('h'); };
App.prototype.flipVertical = function() { this._flipGeneric('v'); };

App.prototype._flipGeneric = function(dir) {
  const allObjs = this._getAllSelectedObjects();
  if (allObjs.length === 0) return;

  const bounds = this._computeSelectionBounds(allObjs);
  if (!bounds) return;
  const {cx, cy} = bounds;

  const snapshots = this._snapshotAllObjects(allObjs);
  const that = this;
  const label = dir === 'h' ? (allObjs.length>=2?'水平翻转多选':'水平翻转') : (allObjs.length>=2?'垂直翻转多选':'垂直翻转');

  const cmd = new Command(label, () => {
    that._flipAllObjects(allObjs, cx, cy, dir);
    return {snapshots: that._snapshotAllObjects(allObjs)};
  }, (data) => {
    that._restoreAllObjects(data.snapshots);
  });
  this.cmdMgr.execute(cmd);
  document.getElementById('status-hint').textContent = `已${dir==='h'?'水平':'垂直'}翻转`;
  this._autoSave();
};

App.prototype._flipMulti = function(ids, dir) {
  let sumX = 0, sumY = 0, count = 0;
  for (const c of this.model.allComponents()) {
    if (!ids.includes(c.id)) continue;
    if (c.type === 'smd') { sumX += (c.gx1 + c.gx2) / 2; sumY += (c.gy1 + c.gy2) / 2; count++; }
    else { sumX += c.gx + (c.w - 1) / 2; sumY += c.gy + (c.h - 1) / 2; count++; }
  }
  if (count === 0) return;
  const cx = sumX / count, cy = sumY / count; // 浮点中心
  const that = this;
  const oldStates = [];
  for (const c of this.model.allComponents()) {
    if (!ids.includes(c.id)) continue;
    if (c.type === 'smd') {
      oldStates.push({comp: c, old: {gx1: c.gx1, gy1: c.gy1, gx2: c.gx2, gy2: c.gy2}});
      if (dir === 'h') { c.gx1 = Math.round(2*cx - c.gx1); c.gx2 = Math.round(2*cx - c.gx2); }
      else { c.gy1 = Math.round(2*cy - c.gy1); c.gy2 = Math.round(2*cy - c.gy2); }
    } else {
      oldStates.push({comp: c, old: {gx: c.gx, gy: c.gy, w: c.w, h: c.h, pinLabels: c.pinLabels ? JSON.parse(JSON.stringify(c.pinLabels)) : {}}});
      if (dir === 'h') {
        c.gx = Math.round(2*cx - (c.gx + c.w - 1));
        if (c.pinLabels) {
          const newLabels = {};
          for (const [key, label] of Object.entries(c.pinLabels)) {
            const [dx, dy] = key.split(',').map(Number);
            newLabels[`${c.w - 1 - dx},${dy}`] = label;
          }
          c.pinLabels = newLabels;
        }
      } else {
        c.gy = Math.round(2*cy - (c.gy + c.h - 1));
        if (c.pinLabels) {
          const newLabels = {};
          for (const [key, label] of Object.entries(c.pinLabels)) {
            const [dx, dy] = key.split(',').map(Number);
            newLabels[`${dx},${c.h - 1 - dy}`] = label;
          }
          c.pinLabels = newLabels;
        }
      }
    }
  }
  const cmd = new Command(dir==='h'?'水平翻转多选':'垂直翻转多选', () => { return {oldStates}; }, (data) => {
    for (const {comp, old} of data.oldStates) {
      if (old.gx1 !== undefined) { comp.gx1 = old.gx1; comp.gy1 = old.gy1; comp.gx2 = old.gx2; comp.gy2 = old.gy2; }
      else { comp.gx = old.gx; comp.gy = old.gy; comp.w = old.w; comp.h = old.h; }
    }
  });
  this.cmdMgr.execute(cmd);
  this._autoSave();
};

// ==================== 混合类型变换辅助方法 ====================
App.prototype._computeSelectionBounds = function(allObjs) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let count = 0;
  for (const obj of allObjs) {
    if (obj.type === 'smd' || obj.type === 'header') {
      const c = this.model.findById(obj.id); if (!c) continue;
      if (c.type === 'smd') {
        minX = Math.min(minX, c.gx1, c.gx2); minY = Math.min(minY, c.gy1, c.gy2);
        maxX = Math.max(maxX, c.gx1, c.gx2); maxY = Math.max(maxY, c.gy1, c.gy2);
      } else {
        minX = Math.min(minX, c.gx); minY = Math.min(minY, c.gy);
        maxX = Math.max(maxX, c.gx + c.w - 1); maxY = Math.max(maxY, c.gy + c.h - 1);
      }
      count++;
    } else if (obj.type === 'trace') {
      const t = this.model.solderTraces.find(tr => tr.id === obj.id); if (!t) continue;
      for (const pt of t.points) {
        minX = Math.min(minX, pt.gx); minY = Math.min(minY, pt.gy);
        maxX = Math.max(maxX, pt.gx); maxY = Math.max(maxY, pt.gy);
      }
      count++;
    } else if (obj.type === 'flywire') {
      const f = this.model.flyWires.find(fw => fw.id === obj.id); if (!f) continue;
      minX = Math.min(minX, f.from.gx, f.to.gx); minY = Math.min(minY, f.from.gy, f.to.gy);
      maxX = Math.max(maxX, f.from.gx, f.to.gx); maxY = Math.max(maxY, f.from.gy, f.to.gy);
      count++;
    }
  }
  return count > 0 ? {cx: (minX + maxX) / 2, cy: (minY + maxY) / 2} : null;
};

App.prototype._snapshotAllObjects = function(allObjs) {
  const snaps = [];
  for (const obj of allObjs) {
    if (obj.type === 'smd') {
      const c = this.model.findById(obj.id); if (!c) continue;
      snaps.push({type:'smd', id:c.id, gx1:c.gx1, gy1:c.gy1, gx2:c.gx2, gy2:c.gy2});
    } else if (obj.type === 'header') {
      const c = this.model.findById(obj.id); if (!c) continue;
      snaps.push({type:'header', id:c.id, gx:c.gx, gy:c.gy, w:c.w, h:c.h,
        pinLabels: c.pinLabels ? JSON.parse(JSON.stringify(c.pinLabels)) : {}});
    } else if (obj.type === 'trace') {
      const t = this.model.solderTraces.find(tr => tr.id === obj.id); if (!t) continue;
      snaps.push({type:'trace', id:t.id, points: t.points.map(p=>({gx:p.gx, gy:p.gy}))});
    } else if (obj.type === 'flywire') {
      const f = this.model.flyWires.find(fw => fw.id === obj.id); if (!f) continue;
      snaps.push({type:'flywire', id:f.id, from:{gx:f.from.gx, gy:f.from.gy}, to:{gx:f.to.gx, gy:f.to.gy}});
    }
  }
  return snaps;
};

App.prototype._restoreAllObjects = function(snaps) {
  for (const s of snaps) {
    if (s.type === 'smd') {
      const c = this.model.findById(s.id); if (c) { c.gx1=s.gx1; c.gy1=s.gy1; c.gx2=s.gx2; c.gy2=s.gy2; }
    } else if (s.type === 'header') {
      const c = this.model.findById(s.id); if (c) {
        c.gx=s.gx; c.gy=s.gy; c.w=s.w; c.h=s.h;
        if (s.pinLabels && Object.keys(s.pinLabels).length > 0) { c.pinLabels = JSON.parse(JSON.stringify(s.pinLabels)); } else { c.pinLabels = {}; }
      }
    } else if (s.type === 'trace') {
      const t = this.model.solderTraces.find(tr => tr.id === s.id); if (t) t.points = s.points.map(p=>({gx:p.gx, gy:p.gy}));
    } else if (s.type === 'flywire') {
      const f = this.model.flyWires.find(fw => fw.id === s.id); if (f) { f.from.gx=s.from.gx; f.from.gy=s.from.gy; f.to.gx=s.to.gx; f.to.gy=s.to.gy; }
    }
  }
};

App.prototype._rotateAllObjects = function(allObjs, cx, cy) {
  for (const obj of allObjs) {
    if (obj.type === 'smd') {
      const c = this.model.findById(obj.id); if (!c) continue;
      const dx1=c.gx1-cx, dy1=c.gy1-cy, dx2=c.gx2-cx, dy2=c.gy2-cy;
      c.gx1=Math.round(cx-dy1); c.gy1=Math.round(cy+dx1);
      c.gx2=Math.round(cx-dy2); c.gy2=Math.round(cy+dx2);
    } else if (obj.type === 'header') {
      const c = this.model.findById(obj.id); if (!c) continue;
      const oldW=c.w, oldH=c.h;
      const hcx=c.gx+(oldW-1)/2, hcy=c.gy+(oldH-1)/2;
      const dx=hcx-cx, dy=hcy-cy;
      const nx=cx-dy, ny=cy+dx;
      c.w=oldH; c.h=oldW;
      c.gx=Math.round(nx-(c.w-1)/2); c.gy=Math.round(ny-(c.h-1)/2);
      if (c.pinLabels) {
        const nl={}; for (const [k,v] of Object.entries(c.pinLabels)) {
          const [dx0,dy0]=k.split(',').map(Number); nl[`${oldH-1-dy0},${dx0}`]=v;
        } c.pinLabels=nl;
      }
    } else if (obj.type === 'trace') {
      const t = this.model.solderTraces.find(tr => tr.id === obj.id); if (!t) continue;
      for (const pt of t.points) { const dx=pt.gx-cx, dy=pt.gy-cy; pt.gx=Math.round(cx-dy); pt.gy=Math.round(cy+dx); }
    } else if (obj.type === 'flywire') {
      const f = this.model.flyWires.find(fw => fw.id === obj.id); if (!f) continue;
      const dx1=f.from.gx-cx, dy1=f.from.gy-cy, dx2=f.to.gx-cx, dy2=f.to.gy-cy;
      f.from.gx=Math.round(cx-dy1); f.from.gy=Math.round(cy+dx1);
      f.to.gx=Math.round(cx-dy2); f.to.gy=Math.round(cy+dx2);
    }
  }
};

App.prototype._flipAllObjects = function(allObjs, cx, cy, dir) {
  for (const obj of allObjs) {
    if (obj.type === 'smd') {
      const c = this.model.findById(obj.id); if (!c) continue;
      if (dir==='h') { c.gx1=Math.round(2*cx-c.gx1); c.gx2=Math.round(2*cx-c.gx2); }
      else { c.gy1=Math.round(2*cy-c.gy1); c.gy2=Math.round(2*cy-c.gy2); }
    } else if (obj.type === 'header') {
      const c = this.model.findById(obj.id); if (!c) continue;
      if (dir==='h') {
        c.gx=Math.round(2*cx-(c.gx+c.w-1));
        if (c.pinLabels) { const nl={}; for (const [k,v] of Object.entries(c.pinLabels)) {
          const [dx,dy]=k.split(',').map(Number); nl[`${c.w-1-dx},${dy}`]=v; } c.pinLabels=nl; }
      } else {
        c.gy=Math.round(2*cy-(c.gy+c.h-1));
        if (c.pinLabels) { const nl={}; for (const [k,v] of Object.entries(c.pinLabels)) {
          const [dx,dy]=k.split(',').map(Number); nl[`${dx},${c.h-1-dy}`]=v; } c.pinLabels=nl; }
      }
    } else if (obj.type === 'trace') {
      const t = this.model.solderTraces.find(tr => tr.id === obj.id); if (!t) continue;
      for (const pt of t.points) { if (dir==='h') pt.gx=Math.round(2*cx-pt.gx); else pt.gy=Math.round(2*cy-pt.gy); }
    } else if (obj.type === 'flywire') {
      const f = this.model.flyWires.find(fw => fw.id === obj.id); if (!f) continue;
      if (dir==='h') { f.from.gx=Math.round(2*cx-f.from.gx); f.to.gx=Math.round(2*cx-f.to.gx); }
      else { f.from.gy=Math.round(2*cy-f.from.gy); f.to.gy=Math.round(2*cy-f.to.gy); }
    }
  }
};

App.prototype._afterEdit = function() {
  this._updatePropPanel();
  this._updateCompList();
  this._autoSave();
};
