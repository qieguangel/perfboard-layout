// ==================== 常量 ====================
const LONG_PRESS_MS = 300;
const CLICK_DIST = 5;
const GRID_HIT_RADIUS_RATIO = 0.4;
const SEG_HIT_DIST = 8;
const SMD_HIT_DIST = 12;
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 5;
const ZOOM_STEP = 0.1;

// ==================== 工具函数 ====================
let _idCounter = 1;
function uid() { return 'el_' + (_idCounter++); }

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx*dx + dy*dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px-ax)*dx + (py-ay)*dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t*dx), py - (ay + t*dy));
}

// ==================== Polyfill for roundRect ====================
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r) {
    if (typeof r === 'number') r = {tl:r, tr:r, br:r, bl:r};
    this.moveTo(x+r.tl, y);
    this.lineTo(x+w-r.tr, y);
    this.quadraticCurveTo(x+w, y, x+w, y+r.tr);
    this.lineTo(x+w, y+h-r.br);
    this.quadraticCurveTo(x+w, y+h, x+w-r.br, y+h);
    this.lineTo(x+r.bl, y+h);
    this.quadraticCurveTo(x, y+h, x, y+h-r.bl);
    this.lineTo(x, y+r.tl);
    this.quadraticCurveTo(x, y, x+r.tl, y);
  };
}
