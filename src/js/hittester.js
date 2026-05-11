// ==================== 命中测试 ====================
class HitTester {
  constructor(app) { this.app = app; }

  get model() { return this.app.model; }
  get gridSize() { return this.app.gridSize; }
  get zoom() { return this.app.zoom; }
  get ox() { return this.app.offsetX; }
  get oy() { return this.app.offsetY; }

  screenToGrid(sx, sy) {
    return {
      gx: Math.round((sx - this.ox) / (this.gridSize * this.zoom)),
      gy: Math.round((sy - this.oy) / (this.gridSize * this.zoom)),
    };
  }

  // 浮点格点（不取整），用于平滑拖拽
  screenToGridFloat(sx, sy) {
    return {
      gx: (sx - this.ox) / (this.gridSize * this.zoom),
      gy: (sy - this.oy) / (this.gridSize * this.zoom),
    };
  }

  gridToScreen(gx, gy) {
    return {
      sx: gx * this.gridSize * this.zoom + this.ox,
      sy: gy * this.gridSize * this.zoom + this.oy,
    };
  }

  // 找最近的格点
  nearestGridPoint(sx, sy) {
    const {gx, gy} = this.screenToGrid(sx, sy);
    const {sx: gsx, sy: gsy} = this.gridToScreen(gx, gy);
    const dist = Math.hypot(sx - gsx, sy - gsy);
    if (dist < this.gridSize * this.zoom * GRID_HIT_RADIUS_RATIO) {
      return {gx, gy, dist, sx: gsx, sy: gsy};
    }
    return null;
  }

  // 找点击位置的器件（跳过已编组成员，编组后只能选中组整体）
  componentAt(sx, sy) {
    let best = null, bestDist = Infinity;
    for (const comp of this.model.allComponents()) {
      if (comp.groupId) continue; // 已编组，跳过
      const d = this._distToComponent(comp, sx, sy);
      if (d !== null && d < bestDist) { bestDist = d; best = comp; }
    }
    if (best) {
      if (best.type === 'smd') {
        if (bestDist > this.gridSize * this.zoom + SMD_HIT_DIST) return null;
      } else {
        if (bestDist > SMD_HIT_DIST) return null;
      }
    }
    return best;
  }

  _distToComponent(comp, sx, sy) {
    if (comp.type === 'smd') {
      const p1 = this.gridToScreen(comp.gx1, comp.gy1);
      const p2 = this.gridToScreen(comp.gx2, comp.gy2);
      const cx = (p1.sx + p2.sx) / 2, cy = (p1.sy + p2.sy) / 2;
      return Math.hypot(sx - cx, sy - cy);
    } else {
      const p = this.gridToScreen(comp.gx, comp.gy);
      const w = comp.w * this.gridSize * this.zoom;
      const h = comp.h * this.gridSize * this.zoom;
      const cx = p.sx + w/2, cy = p.sy + h/2;
      if (sx >= p.sx && sx <= p.sx + w && sy >= p.sy && sy <= p.sy + h) return 0;
      // 到矩形边缘的距离
      const dx = Math.max(p.sx - sx, 0, sx - (p.sx + w));
      const dy = Math.max(p.sy - sy, 0, sy - (p.sy + h));
      return Math.hypot(dx, dy);
    }
  }

  // 找点击位置的焊锡段
  solderSegmentAt(sx, sy) {
    const hitDist = Math.max(8, this.gridSize * this.zoom * 0.25);
    let best = null, bestDist = hitDist;
    for (const trace of this.model.solderTraces) {
      for (let i = 0; i < trace.points.length - 1; i++) {
        const a = this.gridToScreen(trace.points[i].gx, trace.points[i].gy);
        const b = this.gridToScreen(trace.points[i+1].gx, trace.points[i+1].gy);
        const d = distToSeg(sx, sy, a.sx, a.sy, b.sx, b.sy);
        if (d < bestDist) { bestDist = d; best = {trace, segIdx: i}; }
      }
    }
    return best;
  }

  // 找点击位置的飞线
  flyWireAt(sx, sy) {
    const hitDist = Math.max(8, this.gridSize * this.zoom * 0.25);
    let best = null, bestDist = hitDist;
    for (const fw of this.model.flyWires) {
      const a = this.gridToScreen(fw.from.gx, fw.from.gy);
      const b = this.gridToScreen(fw.to.gx, fw.to.gy);
      const d = distToSeg(sx, sy, a.sx, a.sy, b.sx, b.sy);
      if (d < bestDist) { bestDist = d; best = fw; }
    }
    return best;
  }

  // 找焊锡端点
  solderEndpointAt(sx, sy) {
    let best = null, bestDist = this.gridSize * this.zoom * GRID_HIT_RADIUS_RATIO;
    for (const trace of this.model.solderTraces) {
      for (const pt of [trace.points[0], trace.points[trace.points.length - 1]]) {
        const {sx: gsx, sy: gsy} = this.gridToScreen(pt.gx, pt.gy);
        const d = Math.hypot(sx - gsx, sy - gsy);
        if (d < bestDist) { bestDist = d; best = {trace, point: pt, isStart: pt === trace.points[0]}; }
      }
    }
    return best;
  }
}
