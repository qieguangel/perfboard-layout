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
  const ids = this._getSelectionIds();
  if (ids.length >= 2) { this._rotateMulti(ids); return; }
  const sel = this.selectedObject;
  if (!sel) return;
  if (sel.type === 'smd') { this._rotateSMD(sel); }
  else if (sel.type === 'header') { this._rotateHeader(sel); }
  else if (sel.componentIds) { this._rotateMulti(sel.componentIds); }
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
    const cx = comp.gx + Math.floor(comp.w/2);
    const cy = comp.gy + Math.floor(comp.h/2);
    comp.w = oldH;
    comp.h = oldW;
    comp.gx = cx - Math.floor(comp.w/2);
    comp.gy = cy - Math.floor(comp.h/2);
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

App.prototype.flipHorizontal = function() {
  const ids = this._getSelectionIds();
  if (ids.length >= 2) { this._flipMulti(ids, 'h'); return; }
  const sel = this.selectedObject;
  if (!sel) return;

  if (sel.componentIds) { this._flipMulti(sel.componentIds, 'h'); return; }
  if (sel.type === 'smd') {
    document.getElementById('status-hint').textContent = '贴片器件请用Ctrl+R旋转，无需翻转';
    return;
  }
  if (sel.type === 'header') {
    const old = {gx: sel.gx, gy: sel.gy, w: sel.w, h: sel.h, pinLabels: sel.pinLabels ? JSON.parse(JSON.stringify(sel.pinLabels)) : {}};
    const cmd = new Command('水平翻转', () => {
      const newLabels = {};
      for (const [key, label] of Object.entries(old.pinLabels)) {
        const [dx, dy] = key.split(',').map(Number);
        newLabels[`${sel.w - 1 - dx},${dy}`] = label;
      }
      sel.pinLabels = newLabels;
      return {comp: sel, old};
    }, (data) => {
      data.comp.pinLabels = data.old.pinLabels;
    });
    this.cmdMgr.execute(cmd);
    document.getElementById('status-hint').textContent = '已水平翻转（标签已更新）';
  }
  this._autoSave();
};

App.prototype.flipVertical = function() {
  const ids = this._getSelectionIds();
  if (ids.length >= 2) { this._flipMulti(ids, 'v'); return; }
  const sel = this.selectedObject;
  if (!sel) return;

  if (sel.componentIds) { this._flipMulti(sel.componentIds, 'v'); return; }
  if (sel.type === 'smd') {
    document.getElementById('status-hint').textContent = '贴片器件请用Ctrl+R旋转，无需翻转';
    return;
  }
  if (sel.type === 'header') {
    const old = {gx: sel.gx, gy: sel.gy, w: sel.w, h: sel.h, pinLabels: sel.pinLabels ? JSON.parse(JSON.stringify(sel.pinLabels)) : {}};
    const cmd = new Command('垂直翻转', () => {
      const newLabels = {};
      for (const [key, label] of Object.entries(old.pinLabels)) {
        const [dx, dy] = key.split(',').map(Number);
        newLabels[`${dx},${sel.h - 1 - dy}`] = label;
      }
      sel.pinLabels = newLabels;
      return {comp: sel, old};
    }, (data) => {
      data.comp.pinLabels = data.old.pinLabels;
    });
    this.cmdMgr.execute(cmd);
    document.getElementById('status-hint').textContent = '已垂直翻转（标签已更新）';
  }
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

App.prototype._afterEdit = function() {
  this._updatePropPanel();
  this._updateCompList();
  this._autoSave();
};
