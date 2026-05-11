// ==================== 焊接走线 ====================
App.prototype._updateRouting = function(pos) {
  if (!this.routingState) return;
  const gp = this.hitTester.nearestGridPoint(pos.x, pos.y);
  if (!gp) return;

  const start = this.routingState.points[0];
  // 生成曼哈顿路径
  const points = [{gx: start.gx, gy: start.gy}];
  const dx = gp.gx - start.gx;
  const dy = gp.gy - start.gy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx !== 0) points.push({gx: gp.gx, gy: start.gy});
    if (dy !== 0) points.push({gx: gp.gx, gy: gp.gy});
  } else {
    if (dy !== 0) points.push({gx: start.gx, gy: gp.gy});
    if (dx !== 0) points.push({gx: gp.gx, gy: gp.gy});
  }

  if (points.length < 2) points.push({gx: gp.gx, gy: gp.gy});
  this.routingState.points = points;
};

App.prototype._finishRouting = function() {
  if (!this.routingState || this.routingState.points.length < 2) {
    this.routingState = null;
    this.routingFromEndpoint = null;
    return;
  }

  const points = this.routingState.points;
  const that = this;

  if (this.routingFromEndpoint) {
    // 延伸已有走线
    const ep = this.routingFromEndpoint;
    const oldTrace = ep.trace;
    const oldPoints = oldTrace.points.map(p => ({gx: p.gx, gy: p.gy}));

    const cmd = new Command('延伸焊锡', () => {
      if (ep.isStart) {
        // 在前面添加：反转新点然后追加到前面
        const newPts = points.slice().reverse();
        newPts.pop(); // 移除最后一个（和已有起点重合）
        oldTrace.points = [...newPts, ...oldTrace.points];
      } else {
        // 在后面添加
        const newPts = points.slice(1);
        oldTrace.points = [...oldTrace.points, ...newPts];
      }
      return {trace: oldTrace, oldPoints};
    }, (data) => {
      data.trace.points = data.oldPoints;
    });

    this.cmdMgr.execute(cmd);
  } else {
    // 新走线
    const newTrace = {id: uid(), points: points.map(p => ({gx: p.gx, gy: p.gy}))};
    const cmd = new Command('添加焊锡走线', () => {
      that.model.addSolderTrace(newTrace);
      that._mergeColinear(newTrace);
      return {trace: newTrace};
    }, (data) => {
      that.model.remove(data.trace);
    });

    this.cmdMgr.execute(cmd);
  }

  this.routingState = null;
  this.routingFromEndpoint = null;
  this._autoSave();
};

// ==================== 焊锡段拖拽 ====================
App.prototype._dragSegment = function(pos) {
  if (!this.dragSegInfo || !this.dragSegStartPoints) return;
  const gp = this.hitTester.nearestGridPoint(pos.x, pos.y);
  if (!gp) return;

  const {trace, segIdx} = this.dragSegInfo;
  const origPts = this.dragSegStartPoints;

  // 判断段方向
  const a = origPts[segIdx], b = origPts[segIdx + 1];
  if (a.gy === b.gy) {
    // 水平段：上下拖动
    const deltaGY = gp.gy - a.gy;
    trace.points[segIdx].gy = a.gy + deltaGY;
    trace.points[segIdx + 1].gy = b.gy + deltaGY;
  } else if (a.gx === b.gx) {
    // 垂直段：左右拖动
    const deltaGX = gp.gx - a.gx;
    trace.points[segIdx].gx = a.gx + deltaGX;
    trace.points[segIdx + 1].gx = b.gx + deltaGX;
  }
};

App.prototype._finishSegmentDrag = function(pos) {
  if (!this.dragSegInfo || !this.dragSegStartPoints) return;

  const {trace} = this.dragSegInfo;
  const newPoints = trace.points.map(p => ({gx: p.gx, gy: p.gy}));
  const oldPoints = this.dragSegStartPoints.map(p => ({gx: p.gx, gy: p.gy}));
  const that = this;

  const cmd = new Command('移动焊锡段', () => {
    trace.points = newPoints.map(p => ({gx: p.gx, gy: p.gy}));
    return {trace, oldPoints: oldPoints.map(p => ({gx: p.gx, gy: p.gy}))};
  }, (data) => {
    data.trace.points = data.oldPoints;
  });

  this.cmdMgr.execute(cmd);
  // 拖拽后合并共线点
  this._mergeColinear(trace);
  this.dragSegInfo = null;
  this.dragSegStartPoints = null;
  this.selectedObject = null;
  this._autoSave();
};

// ==================== 放置操作（焊锡部分） ====================
// 焊锡模式的mousedown入口：用点击计数区分单击/双击
App.prototype._handleSolderClick = function(pos) {
  // 直接用 screenToGrid 而非 nearestGridPoint，保证空白处也能落到格点
  const gp = this.hitTester.screenToGrid(pos.x, pos.y);
  if (!gp) return;

  this._solderClickCount = (this._solderClickCount || 0) + 1;
  if (this._solderClickCount === 1) {
    // 第一次点击 → 启动定时器，280ms后认定为单击
    this._solderClickPos = {gx: gp.gx, gy: gp.gy};
    if (this._solderTimer) clearTimeout(this._solderTimer);
    this._solderTimer = setTimeout(() => {
      this._solderTimer = null;
      this._solderClickCount = 0;
      this._handleSolderSingleClick(this._solderClickPos);
    }, 280);
  } else {
    // 第二次点击在280ms内到达 → 双击
    if (this._solderTimer) { clearTimeout(this._solderTimer); this._solderTimer = null; }
    this._solderClickCount = 0;
    this._handleSolderDoubleClick({gx: gp.gx, gy: gp.gy});
  }
};

// 单击逻辑：固定当前段并继续（要求已有活跃走线）
App.prototype._handleSolderSingleClick = function(gp) {
  if (!this.routingState) {
    // 没有活跃走线时单击 → 给提示，要求双击开始
    document.getElementById('status-hint').textContent = '焊锡模式：双击格点开始走线';
    return;
  }
  const last = this.routingState.points[this.routingState.points.length - 1];
  if (last.gx === gp.gx && last.gy === gp.gy) return;

  // 添加曼哈顿路径（必要时插入中间点）
  if (last.gx !== gp.gx && last.gy !== gp.gy) {
    if (Math.abs(gp.gx - last.gx) >= Math.abs(gp.gy - last.gy)) {
      this.routingState.points.push({gx: gp.gx, gy: last.gy});
    } else {
      this.routingState.points.push({gx: last.gx, gy: gp.gy});
    }
  }
  this.routingState.points.push({gx: gp.gx, gy: gp.gy});
  this._commitAndContinueRouting();
};

// 双击逻辑：开始 或 结束走线
App.prototype._handleSolderDoubleClick = function(gp) {
  if (!this.routingState) {
    // 没有活跃走线 → 双击开始
    const screenPos = this.hitTester.gridToScreen(gp.gx, gp.gy);
    const ep = this.hitTester.solderEndpointAt(screenPos.sx, screenPos.sy);
    if (ep) {
      this.routingFromEndpoint = ep;
      this.routingState = {points: [{gx: ep.point.gx, gy: ep.point.gy}]};
    } else {
      this.routingState = {points: [{gx: gp.gx, gy: gp.gy}]};
    }
    document.getElementById('status-hint').textContent = '焊锡走线已开始 | 单击固定段 | 双击结束';
    return;
  }

  // 已有活跃走线 → 双击结束（先把双击点作为终点提交）
  const last = this.routingState.points[this.routingState.points.length - 1];
  if (last.gx !== gp.gx || last.gy !== gp.gy) {
    if (last.gx !== gp.gx && last.gy !== gp.gy) {
      if (Math.abs(gp.gx - last.gx) >= Math.abs(gp.gy - last.gy)) {
        this.routingState.points.push({gx: gp.gx, gy: last.gy});
      } else {
        this.routingState.points.push({gx: last.gx, gy: gp.gy});
      }
    }
    this.routingState.points.push({gx: gp.gx, gy: gp.gy});
  }
  if (this.routingState.points.length >= 2) {
    this._finishRouting();
  } else {
    this.routingState = null;
    this.routingFromEndpoint = null;
  }
  document.getElementById('status-hint').textContent = '焊锡走线已完成';
};

// 提交当前焊锡段并继续从终点走线
App.prototype._commitAndContinueRouting = function() {
  if (!this.routingState || this.routingState.points.length < 2) return;

  const pts = this.routingState.points;
  const that = this;

  if (this.routingFromEndpoint) {
    const ep = this.routingFromEndpoint;
    const newPts = pts.slice(1);
    const oldTrace = ep.trace;
    const oldPoints = oldTrace.points.map(p => ({gx: p.gx, gy: p.gy}));

    const cmd = new Command('延伸焊锡', () => {
      if (ep.isStart) {
        const rev = newPts.slice().reverse();
        oldTrace.points = [...rev, ...oldTrace.points];
      } else {
        oldTrace.points = [...oldTrace.points, ...newPts];
      }
      that._mergeColinear(oldTrace);
      return {trace: oldTrace, oldPoints};
    }, (data) => { data.trace.points = data.oldPoints; });
    this.cmdMgr.execute(cmd);
  } else {
    const newTrace = {id: uid(), points: pts.map(p => ({gx: p.gx, gy: p.gy}))};
    const cmd = new Command('添加焊锡走线', () => {
      that.model.addSolderTrace(newTrace);
      that._mergeColinear(newTrace);
      return {trace: newTrace};
    }, (data) => { that.model.remove(data.trace); });
    this.cmdMgr.execute(cmd);
    // 记录新走线的终点引用，后续单击/双击可延续
    this.routingFromEndpoint = {trace: newTrace, point: newTrace.points[newTrace.points.length - 1], isStart: false};
  }

  const lastPt = pts[pts.length - 1];
  this.routingState = {points: [{gx: lastPt.gx, gy: lastPt.gy}]};
  this._autoSave();
  document.getElementById('status-hint').textContent = '段已固定 | 单击继续 | 双击结束';
};

// 合并共线段 + 合并相接的独立焊锡线
App.prototype._mergeColinear = function(trace) {
  // 1. 内部共线点简化
  const pts = trace.points;
  if (pts.length >= 3) {
    let i = 1;
    while (i < pts.length - 1) {
      const prev = pts[i - 1], curr = pts[i], next = pts[i + 1];
      if ((prev.gx === curr.gx && curr.gx === next.gx) ||
          (prev.gy === curr.gy && curr.gy === next.gy)) {
        pts.splice(i, 1);
      } else { i++; }
    }
  }

  // 2. 跨走线合并：找与 trace 端点相接的其他走线
  if (pts.length < 2) return;
  const merged = [trace];
  let changed = true;
  while (changed) {
    changed = false;
    for (const other of this.model.solderTraces) {
      if (merged.includes(other) || other.points.length < 2) continue;
      for (const mt of merged) {
        const mf = mt.points[0], ml = mt.points[mt.points.length - 1];
        const of = other.points[0], ol = other.points[other.points.length - 1];
        // 首-尾相接
        if (ml.gx === of.gx && ml.gy === of.gy) {
          mt.points = [...mt.points, ...other.points.slice(1)];
          this.model.remove(other); merged.push(other); changed = true; break;
        }
        // 首-首相接（反转other）
        if (ml.gx === ol.gx && ml.gy === ol.gy) {
          mt.points = [...mt.points, ...other.points.slice().reverse().slice(1)];
          this.model.remove(other); merged.push(other); changed = true; break;
        }
        // 尾-首相接
        if (mf.gx === ol.gx && mf.gy === ol.gy) {
          mt.points = [...other.points, ...mt.points.slice(1)];
          this.model.remove(other); merged.push(other); changed = true; break;
        }
        // 尾-尾相接（反转other）
        if (mf.gx === of.gx && mf.gy === of.gy) {
          mt.points = [...other.points.slice().reverse(), ...mt.points.slice(1)];
          this.model.remove(other); merged.push(other); changed = true; break;
        }
      }
    }
  }
  // 再次内部简化（合并后可能产生新的共线点）
  for (const mt of merged) {
    const p = mt.points;
    if (p.length >= 3) {
      let i = 1;
      while (i < p.length - 1) {
        const prev = p[i - 1], curr = p[i], next = p[i + 1];
        if ((prev.gx === curr.gx && curr.gx === next.gx) ||
            (prev.gy === curr.gy && curr.gy === next.gy)) {
          p.splice(i, 1);
        } else { i++; }
      }
    }
  }
};
