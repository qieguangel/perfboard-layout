// ==================== 主题 ====================
App.prototype._toggleTheme = function() {
  this._isLight = !this._isLight;
  if (this._isLight) {
    document.documentElement.classList.add('light');
  } else {
    document.documentElement.classList.remove('light');
  }
  try { localStorage.setItem('perfboard_theme', this._isLight ? 'light' : 'dark'); } catch(e) {}
  this._needsRender = true;
};

// ==================== 文件管理 ====================
// 保存：更新当前文件（不弹窗，无名时自动编号；另存为用_saveAs）
App.prototype._save = function() {
  // 无名文件自动编号，不弹窗
  if (this._currentFile === '未命名' || !this._currentFile || (this._currentFile.startsWith('untitled') && this._currentFile !== 'untitled')) {
    let n = 1, name = 'my-layout';
    while (this._workspaceFiles.find(f => f.name === name)) { n++; name = 'my-layout' + n; }
    // 移除旧untitled条目
    if (this._currentFile && this._currentFile.startsWith('untitled')) {
      this._workspaceFiles = this._workspaceFiles.filter(f => f.name !== this._currentFile);
    }
    this._currentFile = name;
  }
  // 保存：仅更新工作区，不下载文件
  const exist = this._workspaceFiles.findIndex(f => f.name === this._currentFile);
  const saveData = this.model.toJSON();
  if (exist >= 0) {
    this._workspaceFiles[exist].data = saveData;
  } else {
    this._workspaceFiles.push({name: this._currentFile, data: saveData});
  }
  this._saveWorkspace();
  this._updateWorkspaceUI();
  this._isDirty = false;
  // 清除 session（已保存到 workspace，无需 session 恢复）
  try { localStorage.removeItem('perfboard_session'); } catch(e) {}
  document.getElementById('status-hint').textContent = `已保存: ${this._currentFile}`;
};

// 另存为：弹出命名框，下载 JSON 文件
App.prototype._saveAs = function() {
  const defName = (this._currentFile === '未命名' || (this._currentFile||'').startsWith('untitled')) ? 'my-layout' : this._currentFile;
  const name = prompt('文件名:', defName);
  if (!name || !name.trim()) return;
  // 如果是从untitled改名，移除旧untitled工作区条目
  const oldName = this._currentFile;
  if (oldName && oldName.startsWith('untitled')) {
    this._workspaceFiles = this._workspaceFiles.filter(f => f.name !== oldName);
  }
  this._currentFile = name.trim();
  this._downloadJSON(this._currentFile + '.json');
  const exist = this._workspaceFiles.findIndex(f => f.name === this._currentFile);
  if (exist >= 0) {
    this._workspaceFiles[exist].data = this.model.toJSON();
  } else {
    this._workspaceFiles.push({name: this._currentFile, data: this.model.toJSON()});
  }
  this._saveWorkspace();
  this._updateWorkspaceUI();
  this._isDirty = false;
  this._autoSave();
  document.getElementById('status-hint').textContent = `已保存: ${this._currentFile}.json`;
};

// 打开：触发文件选择器
App.prototype._openFile = function() {
  document.getElementById('open-file-input').click();
};

// 新建：自动命名 untitled / untitled2 / untitled3 ...
App.prototype._newFile = function() {
  if (this._isDirty) {
    if (!confirm(`"${this._currentFile}" 有未保存的修改，是否继续新建？`)) return;
  }
  this._autoSave();
  // 自动编号 untitled
  let n = 1, name = 'untitled';
  while (this._workspaceFiles.find(f => f.name === name)) { n++; name = 'untitled' + n; }
  this.model = new DataModel();
  this.cmdMgr.clear();
  this.selectedObject = null;
  this._smdCounter = 0; this._headerCounter = 0;
  this._currentFile = name;
  this._isDirty = false;
  // 加入工作区
  this._workspaceFiles.push({name, data: this.model.toJSON()});
  this._saveWorkspace();
  this._updateWorkspaceUI();
  this._updateCompList();
  this._updatePropPanel();
  document.getElementById('status-hint').textContent = `已新建: ${name}`;
};

// ==================== 工作区管理 ====================
App.prototype._saveWorkspace = function() {
  try {
    localStorage.setItem('perfboard_workspace', JSON.stringify(
      this._workspaceFiles.map(f => ({name: f.name, data: f.data}))
    ));
    localStorage.setItem('perfboard_active_file', this._currentFile);
  } catch(e) {}
};

App.prototype._loadWorkspace = function() {
  try {
    const data = localStorage.getItem('perfboard_workspace');
    if (data) this._workspaceFiles = JSON.parse(data);
  } catch(e) { this._workspaceFiles = []; }
  this._updateWorkspaceUI();
};

App.prototype._updateWorkspaceUI = function() {
  const list = document.getElementById('workspace-list');
  const current = this._currentFile;
  let html = '';

  // 显示未保存的临时文件（如果有修改且不是已知工作区文件）
  if (this._isDirty && current !== '未命名') {
    const inWs = this._workspaceFiles.find(f => f.name === current);
    if (!inWs) {
      html += `<div class="comp-item" style="color:#f39c12;font-style:italic;" data-ws="${current}">
        ${'⬤'} ${current} (未保存)
        <span data-del="${current}" style="float:right;color:var(--text2);cursor:pointer;margin-left:4px;">×</span>
      </div>`;
    }
  }

  if (this._workspaceFiles.length === 0 && !html) {
    list.innerHTML = '<div style="color:var(--text2);padding:2px 6px;">（空）</div>';
    return;
  }

  html += this._workspaceFiles.map(f => {
    const isCur = f.name === current;
    const sel = isCur ? (this._isDirty ? ' style="color:#f39c12;font-weight:bold;"' : ' style="color:var(--accent);font-weight:bold;"') : '';
    const dot = isCur ? (this._isDirty ? '⬤ ' : '● ') : '';
    return `<div class="comp-item"${sel} data-ws="${f.name}">
      ${dot}${f.name}${isCur && this._isDirty ? ' (已修改)' : ''}
      <span data-del="${f.name}" style="float:right;color:var(--text2);cursor:pointer;margin-left:4px;">×</span>
    </div>`;
  }).join('');

  list.innerHTML = html;

  // 事件委托：只在首次挂载，避免监听器累积
  if (!list._wsDelegateInstalled) {
    list._wsDelegateInstalled = true;
    const app = this;
    list.addEventListener('click', function(e) {
      // 删除按钮
      const delEl = e.target.closest('[data-del]');
      if (delEl) {
        e.stopPropagation();
        const name = delEl.dataset.del;
        const wasCurrent = name === app._currentFile;
        app._workspaceFiles = app._workspaceFiles.filter(x => x.name !== name);
        app._saveWorkspace();
        if (wasCurrent) {
          if (app._workspaceFiles.length > 0) {
            const next = app._workspaceFiles[0];
            app._switchToFile(next.name);
            document.getElementById('status-hint').textContent = `已移除并切换到: ${next.name}`;
          } else {
            app.model = new DataModel();
            app.cmdMgr.clear();
            app.selectedObject = null;
            app._smdCounter = 0; app._headerCounter = 0;
            app._currentFile = '未命名';
            app._isDirty = false;
            app._needsRender = true;
            app._updateCompList();
            app._updatePropPanel();
            document.getElementById('status-hint').textContent = '工作区已清空';
          }
          return;
        }
        app._updateWorkspaceUI();
        document.getElementById('status-hint').textContent = `已从工作区移除: ${name}`;
        return;
      }
      // 切换文件
      const wsEl = e.target.closest('[data-ws]');
      if (wsEl) {
        const name = wsEl.dataset.ws;
        if (name === app._currentFile) return;
        if (app._isDirty) {
          if (confirm(`"${app._currentFile}" 有未保存的修改，是否保存后切换？`)) {
            app._save();
          } else {
            try { localStorage.removeItem('perfboard_session'); } catch(e) {}
          }
        }
        app._switchToFile(name);
        document.getElementById('status-hint').textContent = `已切换: ${name}`;
      }
    });
  }
};

// 切换到指定文件（内部辅助）
App.prototype._switchToFile = function(name) {
  const f = this._workspaceFiles.find(x => x.name === name);
  if (!f) return;
  // 清除当前 session（不保留未保存的脏数据到下一个文件）
  try { localStorage.removeItem('perfboard_session'); } catch(e) {}
  this.model = new DataModel();
  this.model.fromJSON(f.data);
  this.cmdMgr.clear();
  this.selectedObject = null;
  this._smdCounter = 0; this._headerCounter = 0;
  for (const c of this.model.smdComponents) {
    const m = c.name.match(/^R(\d+)$/);
    if (m) this._smdCounter = Math.max(this._smdCounter, parseInt(m[1]) + 1);
  }
  for (const c of this.model.headerComponents) {
    const m = c.name.match(/^J(\d+)$/);
    if (m) this._headerCounter = Math.max(this._headerCounter, parseInt(m[1]) + 1);
  }
  this._currentFile = name;
  this._isDirty = false;
  this._needsRender = true;
  try { localStorage.setItem('perfboard_active_file', name); } catch(e) {}
  this._updateWorkspaceUI();
  this._updateCompList();
  this._updatePropPanel();
};

// 打开文件并加入工作区
App.prototype._handleOpenFile = function(file) {
  if (!file) return;
  document.getElementById('status-hint').textContent = '正在加载...';
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const name = file.name.replace(/\.json$/i, '');
      const exist = this._workspaceFiles.findIndex(f => f.name === name);
      if (exist >= 0) this._workspaceFiles.splice(exist, 1);
      this._workspaceFiles.push({name, data});
      this._saveWorkspace();

      this.model = new DataModel();
      this.model.fromJSON(data);
      this.cmdMgr.clear();
      this.selectedObject = null;
      this._smdCounter = 0; this._headerCounter = 0;
      for (const c of this.model.smdComponents) {
        const m = c.name.match(/^R(\d+)$/);
        if (m) this._smdCounter = Math.max(this._smdCounter, parseInt(m[1]) + 1);
      }
      for (const c of this.model.headerComponents) {
        const m = c.name.match(/^J(\d+)$/);
        if (m) this._headerCounter = Math.max(this._headerCounter, parseInt(m[1]) + 1);
      }
      this._currentFile = name;
      this._isDirty = false;
      this._needsRender = true;
      this._updateWorkspaceUI();
      this._updateCompList();
      this._updatePropPanel();
      this._autoSave();
      document.getElementById('status-hint').textContent = `已打开: ${name}`;
    } catch (err) { alert('打开失败：无效的 JSON 文件'); }
  };
  reader.readAsText(file);
};

// ==================== 持久化（仅用于会话恢复） ====================
App.prototype._autoSave = function() {
  try {
    localStorage.setItem('perfboard_session', JSON.stringify({
      model: this.model.toJSON(),
      currentFile: this._currentFile,
      smdCounter: this._smdCounter,
      headerCounter: this._headerCounter,
    }));
  } catch(e) {}
};

App.prototype._loadFromStorage = function() {
  // 恢复主题
  try {
    const theme = localStorage.getItem('perfboard_theme');
    if (theme === 'light') { this._isLight = true; document.documentElement.classList.add('light'); }
  } catch(e) {}

  // 检测是否有上次会话
  let hasSession = false;
  try {
    const data = localStorage.getItem('perfboard_session');
    if (data) {
      const parsed = JSON.parse(data);
      if (parsed.model && (parsed.model.smdComponents?.length > 0 || parsed.model.headerComponents?.length > 0 || parsed.model.solderTraces?.length > 0)) {
        hasSession = true;
        // 暂存，等用户确认后恢复
        this._pendingSession = parsed;
      }
    }
  } catch(e) {}

  // 恢复工作区
  this._loadWorkspace();

  // 初始居中
  this.offsetX = this.canvas.parentElement.clientWidth / 2;
  this.offsetY = this.canvas.parentElement.clientHeight / 2;

  // 始终自动加载上次活动文件（不因 session 存在而跳过）
  if (this._workspaceFiles.length > 0) {
    let activeName = null;
    try { activeName = localStorage.getItem('perfboard_active_file'); } catch(e) {}
    const f = this._workspaceFiles.find(x => x.name === activeName) || this._workspaceFiles[0];
    if (f && f.data) {
      this.model = new DataModel();
      this.model.fromJSON(f.data);
      this._currentFile = f.name;
      for (const c of this.model.smdComponents) {
        const m = c.name.match(/^R(\d+)$/);
        if (m) this._smdCounter = Math.max(this._smdCounter, parseInt(m[1]) + 1);
      }
      for (const c of this.model.headerComponents) {
        const m = c.name.match(/^J(\d+)$/);
        if (m) this._headerCounter = Math.max(this._headerCounter, parseInt(m[1]) + 1);
      }
      this._needsRender = true;
      this._updateCompList();
    }
  }

  // 如果有上次未保存的会话，显示恢复提示（覆盖已加载的工作区数据）
  if (hasSession) {
    document.getElementById('status-hint').innerHTML = '<span style="cursor:pointer;text-decoration:underline;color:var(--accent);" onclick="app._restoreSession()">点击恢复上次会话</span> | <span style="cursor:pointer;text-decoration:underline;" onclick="app._discardSession()">忽略</span>';
  }
};

App.prototype._restoreSession = function() {
  if (!this._pendingSession) return;
  const parsed = this._pendingSession;
  this.model.fromJSON(parsed.model);
  this._currentFile = parsed.currentFile || '未命名';
  this._smdCounter = parsed.smdCounter || 0;
  this._headerCounter = parsed.headerCounter || 0;
  this.cmdMgr.clear();
  this._pendingSession = null;
  // 恢复计数器
  for (const c of this.model.smdComponents) {
    const m = c.name.match(/^R(\d+)$/);
    if (m) this._smdCounter = Math.max(this._smdCounter, parseInt(m[1]) + 1);
  }
  for (const c of this.model.headerComponents) {
    const m = c.name.match(/^J(\d+)$/);
    if (m) this._headerCounter = Math.max(this._headerCounter, parseInt(m[1]) + 1);
  }
  this._updateCompList();
  this._updatePropPanel();
  document.getElementById('status-hint').textContent = '已恢复上次会话';
};

App.prototype._discardSession = function() {
  this._pendingSession = null;
  try { localStorage.removeItem('perfboard_session'); } catch(e) {}
  document.getElementById('status-hint').textContent = '已开始全新布局';
};
