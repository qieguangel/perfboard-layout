// ==================== 渲染器 ====================
class Renderer {
  constructor(app) { this.app = app; this.dpr = 1; }

  get canvas() { return this.app.canvas; }
  get ctx() { return this.app.ctx; }
  get model() { return this.app.model; }
  get gridSize() { return this.app.gridSize; }
  get zoom() { return this.app.zoom; }
  get ox() { return this.app.offsetX; }
  get oy() { return this.app.offsetY; }

  gridToScreen(gx, gy) {
    return {
      sx: gx * this.gridSize * this.zoom + this.ox,
      sy: gy * this.gridSize * this.zoom + this.oy,
    };
  }

  render() {
    const ctx = this.ctx;
    const W = this.canvas.width / this.dpr;
    const H = this.canvas.height / this.dpr;
    const light = this.app._isLight;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = light ? '#f5f5f5' : '#1a1a2e';
    ctx.fillRect(0, 0, W, H);

    this._drawGrid(W, H, light);
    this._drawFlyWires();
    this._drawSolderTraces(light);
    this._drawSMDComponents(light);
    this._drawHeaderComponents(light);
    this._drawSelectionHighlight();
    this._drawTempElements();
  }

  _drawGrid(W, H, light) {
    const ctx = this.ctx;
    const gs = this.gridSize * this.zoom;
    if (gs < 6) return;

    const gxMin = Math.floor(-this.ox / gs) - 1;
    const gxMax = Math.ceil((W - this.ox) / gs) + 1;
    const gyMin = Math.floor(-this.oy / gs) - 1;
    const gyMax = Math.ceil((H - this.oy) / gs) + 1;

    ctx.fillStyle = light ? '#ccc' : '#444';
    const dotR = Math.max(1, gs * 0.06);
    for (let gx = gxMin; gx <= gxMax; gx++) {
      for (let gy = gyMin; gy <= gyMax; gy++) {
        const sx = gx * gs + this.ox;
        const sy = gy * gs + this.oy;
        ctx.beginPath();
        ctx.arc(sx, sy, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawSolderTraces(light) {
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const defColor = light ? '#c0392b' : '#e94560';
    for (const trace of this.model.solderTraces) {
      if (trace.points.length < 2) continue;
      const tc = trace.color || defColor;
      // glow
      ctx.strokeStyle = tc + '4d';
      ctx.lineWidth = (this.gridSize * this.zoom * 0.45);
      ctx.beginPath();
      const p0 = this.gridToScreen(trace.points[0].gx, trace.points[0].gy);
      ctx.moveTo(p0.sx, p0.sy);
      for (let i = 1; i < trace.points.length; i++) {
        const p = this.gridToScreen(trace.points[i].gx, trace.points[i].gy);
        ctx.lineTo(p.sx, p.sy);
      }
      ctx.stroke();

      ctx.strokeStyle = tc;
      ctx.lineWidth = Math.max(2, this.gridSize * this.zoom * 0.22);
      ctx.beginPath();
      const q0 = this.gridToScreen(trace.points[0].gx, trace.points[0].gy);
      ctx.moveTo(q0.sx, q0.sy);
      for (let i = 1; i < trace.points.length; i++) {
        const p = this.gridToScreen(trace.points[i].gx, trace.points[i].gy);
        ctx.lineTo(p.sx, p.sy);
      }
      ctx.stroke();

      for (const pt of [trace.points[0], trace.points[trace.points.length - 1]]) {
        const p = this.gridToScreen(pt.gx, pt.gy);
        ctx.fillStyle = tc;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, Math.max(2.5, this.gridSize * this.zoom * 0.16), 0, Math.PI * 2);
        ctx.fill();
      }
      // 焊锡线名称
      if (trace.name) {
        const mid = trace.points[Math.floor(trace.points.length / 2)];
        const mp = this.gridToScreen(mid.gx, mid.gy);
        ctx.fillStyle = light ? '#333' : '#fff';
        ctx.font = `${Math.max(9, this.gridSize * this.zoom * 0.28)}px "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(trace.name, mp.sx, mp.sy - 4);
      }
    }
  }

  _drawFlyWires() {
    const ctx = this.ctx;
    for (const fw of this.model.flyWires) {
      const a = this.gridToScreen(fw.from.gx, fw.from.gy);
      const b = this.gridToScreen(fw.to.gx, fw.to.gy);
      ctx.strokeStyle = '#4fc3f7';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
      ctx.setLineDash([]);

      // 端点小圆
      ctx.fillStyle = '#4fc3f7';
      const r = Math.max(2, this.gridSize * this.zoom * 0.1);
      ctx.beginPath(); ctx.arc(a.sx, a.sy, r, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(b.sx, b.sy, r, 0, Math.PI*2); ctx.fill();
    }
  }

  _drawSMDComponents(light) {
    const ctx = this.ctx;
    const gs = this.gridSize * this.zoom;
    for (const comp of this.model.smdComponents) {
      const a = this.gridToScreen(comp.gx1, comp.gy1);
      const b = this.gridToScreen(comp.gx2, comp.gy2);
      const cx = (a.sx + b.sx) / 2, cy = (a.sy + b.sy) / 2;
      const isH = comp.gy1 === comp.gy2;
      const bw = isH ? gs * 0.85 : gs * 0.3;
      const bh = isH ? gs * 0.3 : gs * 0.85;

      ctx.fillStyle = light ? '#2980b9' : '#3498db';
      ctx.strokeStyle = '#2471a3';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(cx - bw/2, cy - bh/2, bw, bh, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = light ? '#fff' : '#fff';
      ctx.font = `${Math.max(10, gs * 0.35)}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(comp.name, cx, cy - bh/2 - 4);
    }
  }

  _drawHeaderComponents(light) {
    const ctx = this.ctx;
    const gs = this.gridSize * this.zoom;
    for (const comp of this.model.headerComponents) {
      const p = this.gridToScreen(comp.gx, comp.gy);
      const w = (comp.w - 1) * gs;
      const h = (comp.h - 1) * gs;
      const margin = gs * 0.35;

      const color = light ? '#1e8449' : '#2ecc71';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(p.sx - margin, p.sy - margin, w + margin*2, h + margin*2);

      ctx.fillStyle = light ? 'rgba(30,132,73,0.08)' : 'rgba(46,204,113,0.1)';
      ctx.fillRect(p.sx - margin, p.sy - margin, w + margin*2, h + margin*2);

      ctx.fillStyle = color;
      for (let dx = 0; dx < comp.w; dx++) {
        for (let dy = 0; dy < comp.h; dy++) {
          const gsx = (comp.gx + dx) * gs + this.ox;
          const gsy = (comp.gy + dy) * gs + this.oy;
          ctx.beginPath();
          ctx.arc(gsx, gsy, Math.max(2, gs * 0.13), 0, Math.PI*2);
          ctx.fill();
        }
      }

      ctx.fillStyle = color;
      ctx.font = `bold ${Math.max(10, gs * 0.35)}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(comp.name, p.sx - margin, p.sy - margin - 4);

      ctx.fillStyle = light ? '#666' : '#aaa';
      ctx.font = `${Math.max(8, gs * 0.25)}px "Microsoft YaHei", sans-serif`;
      for (let dx = 0; dx < comp.w; dx++) {
        for (let dy = 0; dy < comp.h; dy++) {
          const key = `${dx},${dy}`;
          if (comp.pinLabels && comp.pinLabels[key]) {
            const gsx = (comp.gx + dx) * gs + this.ox;
            const gsy = (comp.gy + dy) * gs + this.oy;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(comp.pinLabels[key], gsx, gsy + gs * 0.1);
          }
        }
      }
    }
  }

  _drawSelectionHighlight() {
    const ctx = this.ctx;
    const dashLen = 4;

    // 多选框选高亮
    const multi = this.app._multiSelection;
    if (multi.length > 0) {
      const gs = this.gridSize * this.zoom;
      for (const cid of multi) {
        const c = this.app.model.findById(cid);
        if (!c) continue;
        ctx.strokeStyle = '#f39c12'; ctx.lineWidth = 2;
        ctx.setLineDash([dashLen, dashLen]);
        if (c.type === 'smd') {
          const a = this.gridToScreen(c.gx1, c.gy1), b = this.gridToScreen(c.gx2, c.gy2);
          const cx = (a.sx + b.sx) / 2, cy = (a.sy + b.sy) / 2;
          const isH = c.gy1 === c.gy2;
          const bw = isH ? gs * 0.85 + 6 : gs * 0.3 + 6;
          const bh = isH ? gs * 0.3 + 6 : gs * 0.85 + 6;
          ctx.strokeRect(cx - bw/2, cy - bh/2, bw, bh);
        } else {
          const p = this.gridToScreen(c.gx, c.gy);
          const w = (c.w - 1) * gs, h = (c.h - 1) * gs, m = gs * 0.35 + 3;
          ctx.strokeRect(p.sx - m, p.sy - m, w + m*2, h + m*2);
        }
      }
      ctx.setLineDash([]);
    }

    const sel = this.app.selectedObject;
    if (!sel) return;

    if (sel.type === 'smd') {
      const a = this.gridToScreen(sel.gx1, sel.gy1);
      const b = this.gridToScreen(sel.gx2, sel.gy2);
      const cx = (a.sx + b.sx)/2, cy = (a.sy + b.sy)/2;
      const isH = sel.gy1 === sel.gy2;
      const gs = this.gridSize * this.zoom;
      const bw = isH ? gs * 0.85 + 8 : gs * 0.3 + 8;
      const bh = isH ? gs * 0.3 + 8 : gs * 0.85 + 8;
      ctx.strokeStyle = '#f39c12';
      ctx.lineWidth = 2;
      ctx.setLineDash([dashLen, dashLen]);
      ctx.strokeRect(cx - bw/2, cy - bh/2, bw, bh);
      ctx.setLineDash([]);
    } else if (sel.type === 'header') {
      const p = this.gridToScreen(sel.gx, sel.gy);
      const gs = this.gridSize * this.zoom;
      const w = (sel.w - 1) * gs;
      const h = (sel.h - 1) * gs;
      const m = gs * 0.35 + 3;
      ctx.strokeStyle = '#f39c12';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([dashLen, dashLen]);
      ctx.strokeRect(p.sx - m, p.sy - m, w + m*2, h + m*2);
      ctx.setLineDash([]);
    } else if (sel.from !== undefined) {
      // Fly wire
      const a = this.gridToScreen(sel.from.gx, sel.from.gy);
      const b = this.gridToScreen(sel.to.gx, sel.to.gy);
      ctx.strokeStyle = '#f39c12';
      ctx.lineWidth = 3;
      ctx.setLineDash([dashLen, dashLen]);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      ctx.setLineDash([]);
    } else if (sel.componentIds !== undefined) {
      // 选中组：高亮所有成员
      const gs = this.gridSize * this.zoom;
      for (const cid of sel.componentIds) {
        const c = this.app.model.findById(cid);
        if (!c) continue;
        if (c.type === 'smd') {
          const a = this.gridToScreen(c.gx1, c.gy1), b = this.gridToScreen(c.gx2, c.gy2);
          const cx = (a.sx + b.sx) / 2, cy = (a.sy + b.sy) / 2;
          const isH = c.gy1 === c.gy2;
          const bw = isH ? gs * 0.85 + 8 : gs * 0.3 + 8;
          const bh = isH ? gs * 0.3 + 8 : gs * 0.85 + 8;
          ctx.strokeStyle = '#9b59b6'; ctx.lineWidth = 2;
          ctx.setLineDash([dashLen, dashLen]);
          ctx.strokeRect(cx - bw/2, cy - bh/2, bw, bh);
        } else {
          const p = this.gridToScreen(c.gx, c.gy);
          const w = (c.w - 1) * gs, h = (c.h - 1) * gs, m = gs * 0.35 + 3;
          ctx.strokeStyle = '#9b59b6'; ctx.lineWidth = 2.5;
          ctx.setLineDash([dashLen, dashLen]);
          ctx.strokeRect(p.sx - m, p.sy - m, w + m*2, h + m*2);
        }
      }
      ctx.setLineDash([]);
    } else if (sel.trace && sel.segIdx !== undefined) {
      // 焊锡段选中高亮
      const gs = this.gridSize * this.zoom;
      const t0 = this.gridToScreen(sel.trace.points[sel.segIdx].gx, sel.trace.points[sel.segIdx].gy);
      const t1 = this.gridToScreen(sel.trace.points[sel.segIdx + 1].gx, sel.trace.points[sel.segIdx + 1].gy);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
      ctx.lineWidth = Math.max(7, gs * 0.5);
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(t0.sx, t0.sy); ctx.lineTo(t1.sx, t1.sy); ctx.stroke();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = Math.max(3, gs * 0.26);
      ctx.beginPath(); ctx.moveTo(t0.sx, t0.sy); ctx.lineTo(t1.sx, t1.sy); ctx.stroke();
      ctx.fillStyle = '#f59e0b';
      const er = Math.max(3, gs * 0.18);
      ctx.beginPath(); ctx.arc(t0.sx, t0.sy, er, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(t1.sx, t1.sy, er, 0, Math.PI * 2); ctx.fill();
      ctx.lineCap = 'butt';
    }
  }

  _drawTempElements() {
    const ctx = this.ctx;
    const gs = this.gridSize * this.zoom;
    const light = this.app._isLight;

    // 临时焊锡路径（正在走线中）
    const route = this.app.routingState;
    if (route && route.points.length >= 1) {
      const previewPts = [...route.points];
      // 焊锡模式下：显示从最后点到当前格点的预览
      if (this.app.mode === 'solder') {
        const gp = this.app.highlightedGridPoint;
        if (gp && (previewPts[previewPts.length - 1].gx !== gp.gx || previewPts[previewPts.length - 1].gy !== gp.gy)) {
          const last = previewPts[previewPts.length - 1];
          if (last.gx !== gp.gx && last.gy !== gp.gy) {
            if (Math.abs(gp.gx - last.gx) >= Math.abs(gp.gy - last.gy)) {
              previewPts.push({gx: gp.gx, gy: last.gy});
            } else {
              previewPts.push({gx: last.gx, gy: gp.gy});
            }
          }
          previewPts.push({gx: gp.gx, gy: gp.gy});
        }
      }
      if (previewPts.length >= 2) {
        const mainColor = light ? 'rgba(192,57,43,0.6)' : 'rgba(233,69,96,0.6)';
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = Math.max(2, gs * 0.22);
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        const p0 = this.gridToScreen(previewPts[0].gx, previewPts[0].gy);
        ctx.moveTo(p0.sx, p0.sy);
        for (let i = 1; i < previewPts.length; i++) {
          const p = this.gridToScreen(previewPts[i].gx, previewPts[i].gy);
          ctx.lineTo(p.sx, p.sy);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 高亮当前格点
    const gp = this.app.highlightedGridPoint;
    if (gp) {
      const p = this.gridToScreen(gp.gx, gp.gy);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, gs * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 排针预览矩形
    const headerPreview = this.app.headerPreview;
    if (headerPreview) {
      const p = this.gridToScreen(headerPreview.gx, headerPreview.gy);
      const w = (headerPreview.w - 1) * gs;
      const h = (headerPreview.h - 1) * gs;
      const m = gs * 0.35;
      ctx.strokeStyle = 'rgba(46, 204, 113, 0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(p.sx - m, p.sy - m, w + m*2, h + m*2);
      ctx.setLineDash([]);
    }

    // 飞线第一点标记
    const flyStart = this.app.flyWireStart;
    if (flyStart) {
      const p = this.gridToScreen(flyStart.gx, flyStart.gy);
      ctx.strokeStyle = '#4fc3f7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, gs * 0.3, 0, Math.PI*2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(79, 195, 247, 0.3)';
      ctx.fill();
    }

    // 矩形框选预览
    const selectRect = this.app._selectRect;
    if (selectRect && this.app.isDragging) {
      const x = Math.min(selectRect.sx1, selectRect.sx2);
      const y = Math.min(selectRect.sy1, selectRect.sy2);
      const w = Math.abs(selectRect.sx2 - selectRect.sx1);
      const h = Math.abs(selectRect.sy2 - selectRect.sy1);
      ctx.strokeStyle = '#f39c12';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = 'rgba(243,156,18,0.08)';
      ctx.fillRect(x, y, w, h);
      ctx.setLineDash([]);
    }

    // SMD 第一点标记
    const smdStart = this.app.smdStart;
    if (smdStart) {
      const p = this.gridToScreen(smdStart.gx, smdStart.gy);
      ctx.strokeStyle = '#3498db';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, gs * 0.3, 0, Math.PI*2);
      ctx.stroke();
    }
  }
}
