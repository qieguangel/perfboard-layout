// ==================== 应用主类（核心） ====================
class App {
  constructor() {
    this.model = new DataModel();
    this.cmdMgr = new CommandManager(this);
    this.canvas = document.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.renderer = new Renderer(this);
    this.hitTester = new HitTester(this);

    // 视口状态
    this.gridSize = 25;
    this.zoom = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    // 交互状态
    this.mode = 'select'; // select | smd | header | flywire | solder
    this.selectedObject = null;
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.mouseDownTime = 0;
    this.mouseDownSX = 0;
    this.mouseDownSY = 0;
    this.mouseButton = -1;
    this.isDragging = false;
    this.dragStartOffsetX = 0;
    this.dragStartOffsetY = 0;
    this.dragCompStart = null;
    this.dragMouseStart = null;
    this.dragSegInfo = null;
    this.dragSegStartPoints = null;

    // 临时状态
    this.routingState = null;
    this.routingFromEndpoint = null;
    this._solderTimer = null;
    this._toastTimer = null; // 提示消息自动消失定时器
    this._solderPendingGp = null;
    this.headerPreview = null;
    // 矩形框选
    this._selectRect = null;     // {sx1,sy1,sx2,sy2} 屏幕坐标
    this._multiSelection = [];   // 框选的多个组件id列表
    this._dragGroupStart = null; // 编组拖拽起始状态
    this._needsRender = true;    // 脏渲染标记
    this._lastMX = -1; this._lastMY = -1;
    this.flyWireStart = null;
    this.smdStart = null;
    this.highlightedGridPoint = null;

    // 剪贴板
    this.clipboard = null;

    // 器件名称计数器
    this._smdCounter = 0;
    this._headerCounter = 0;

    // 文件管理
    this._currentFile = '未命名';
    this._workspaceFiles = []; // {name, data} 工作区文件列表
    this._isDirty = false;     // 当前文件是否有未保存修改

    // 主题
    this._isLight = false;

    this._init();
  }

  _init() {
    this._resizeCanvas();
    window.addEventListener('resize', () => this._resizeCanvas());

    const cw = document.getElementById('canvas-wrap');
    cw.addEventListener('mousedown', e => { this.canvas.focus(); this._onMouseDown(e); });
    cw.addEventListener('mousemove', e => this._onMouseMove(e));
    cw.addEventListener('mouseup', e => this._onMouseUp(e));
    cw.addEventListener('wheel', e => { e.preventDefault(); this._onWheel(e); }, {passive:false});
    cw.addEventListener('contextmenu', e => e.preventDefault());
    cw.addEventListener('dblclick', e => this._onDoubleClick(e));

    document.addEventListener('keydown', e => this._onKeyDown(e));

    this._setupToolbar();
    this._loadFromStorage();
    this._startRenderLoop();
    this._updateStatus();
    this._updateCompList();
  }

  _resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.renderer.dpr = dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _getMousePos(e) {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // ==================== 渲染循环 ====================
  _startRenderLoop() {
    const loop = () => {
      if (this._needsRender) {
        this._needsRender = false;
        this.renderer.render();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // 标记需要重绘（在model变更/滚动/缩放时调用）
  _markDirty() { this._needsRender = true; }
}
