// ==================== 模式切换 ====================
App.prototype.setMode = function(mode) {
  this._cancelAll();
  this.mode = mode;
  this._updateModeButtons();
  this._updateStatus();
  // 橡皮擦模式显示安全提示（3秒后自动消失）
  if (mode === 'eraser') {
    const toast = document.getElementById('toast');
    toast.textContent = '⚠️ 记得注意保存哟！';
    toast.style.display = 'block';
    toast.style.opacity = '1';
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => { toast.style.display = 'none'; }, 300);
    }, 3000);
  }
};

App.prototype._updateModeButtons = function() {
  document.querySelectorAll('#toolbar .group:first-child button').forEach(b => b.classList.remove('active'));
  const map = {select:'btn-select', smd:'btn-smd', header:'btn-header', flywire:'btn-flywire', solder:'btn-solder', eraser:'btn-eraser'};
  const btn = document.getElementById(map[this.mode]);
  if (btn) btn.classList.add('active');
};

// ==================== UI 更新 ====================
App.prototype._updatePropPanel = function() {
  const panel = document.getElementById('prop-panel');
  const sel = this.selectedObject;
  // 处理 group
  if (sel && sel.componentIds) {
    // 确保每次选中组都初始化拖拽数据
    this._dragGroupStart = [];
    for (const cid of sel.componentIds) {
      const c = this.model.findById(cid);
      if (!c) continue;
      if (c.type === 'smd') this._dragGroupStart.push({comp:c, gx1:c.gx1, gy1:c.gy1, gx2:c.gx2, gy2:c.gy2});
      else this._dragGroupStart.push({comp:c, gx:c.gx, gy:c.gy});
    }
    panel.style.display = 'block';
    document.getElementById('prop-name').value = sel.name || '';
    document.getElementById('prop-type').textContent = `器件组 (${sel.componentIds.length}个)`;
    document.getElementById('prop-pos').textContent = `包含 ${sel.componentIds.length} 个器件`;
    document.getElementById('prop-pins-row').style.display = 'none';
    document.getElementById('prop-color-row').style.display = 'none';
    return;
  }
  // 处理 trace（完整走线或选中段）
  const traceObj = (sel && sel.points) ? sel : (sel && sel.trace) ? sel.trace : null;
  if (traceObj) {
    panel.style.display = 'block';
    document.getElementById('prop-name').value = traceObj.name || '';
    document.getElementById('prop-type').textContent = `焊锡走线 (${traceObj.points.length}节点)`;
    document.getElementById('prop-pos').textContent = sel.trace ? `已选第${sel.segIdx+1}段` : '完整走线';
    document.getElementById('prop-pins-row').style.display = 'none';
    document.getElementById('prop-color-row').style.display = 'flex';
    document.getElementById('prop-color').value = traceObj.color || '#e94560';
    return;
  }
  // 处理多选
  if (this._multiSelObjects.length > 0) {
    panel.style.display = 'block';
    document.getElementById('prop-name').value = '';
    const compCnt = this._getMultiSelCompIds().length;
    const traceCnt = this._multiSelObjects.filter(o => o.type === 'trace').length;
    const fwCnt = this._multiSelObjects.filter(o => o.type === 'flywire').length;
    let desc = [];
    if (compCnt) desc.push(`${compCnt}器件`);
    if (traceCnt) desc.push(`${traceCnt}走线`);
    if (fwCnt) desc.push(`${fwCnt}飞线`);
    document.getElementById('prop-type').textContent = `多选 (${desc.join('+')})`;
    document.getElementById('prop-pos').textContent = 'G编组 | Ctrl+点击增减 | 可拖动/旋转/翻转';
    document.getElementById('prop-pins-row').style.display = 'none';
    document.getElementById('prop-color-row').style.display = 'none';
    return;
  }
  if (!sel || (sel.type !== 'smd' && sel.type !== 'header')) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  document.getElementById('prop-name').value = sel.name || '';
  document.getElementById('prop-type').textContent = sel.type === 'smd' ? '贴片器件' : '排针/排座';
  document.getElementById('prop-color-row').style.display = 'none';
  if (sel.type === 'smd') {
    document.getElementById('prop-pos').textContent = `(${sel.gx1},${sel.gy1}) - (${sel.gx2},${sel.gy2})`;
    document.getElementById('prop-pins-row').style.display = 'none';
  } else {
    document.getElementById('prop-pos').textContent = `(${sel.gx},${sel.gy}) ${sel.w}×${sel.h}`;
    const pinsRow = document.getElementById('prop-pins-row');
    const pinsDiv = document.getElementById('prop-pins');
    const labels = [];
    for (let dx = 0; dx < sel.w; dx++) {
      for (let dy = 0; dy < sel.h; dy++) {
        const key = `${dx},${dy}`;
        if (sel.pinLabels && sel.pinLabels[key]) {
          labels.push(`(${dx+1},${dy+1}): ${sel.pinLabels[key]}`);
        }
      }
    }
    if (labels.length > 0) { pinsRow.style.display = 'block'; pinsDiv.textContent = labels.join('\n'); }
    else { pinsRow.style.display = 'none'; }
  }
};

App.prototype._updateCompList = function() {
  const list = document.getElementById('comp-list');
  const comps = this.model.allComponents();
  let html = comps.map(c => {
    const sel = (this.selectedObject && this.selectedObject.id === c.id) || this._multiSelObjects.some(o => o.id === c.id) ? ' selected' : '';
    const grp = c.groupId ? ' 🔗' : '';
    const typeLabel = c.type === 'smd' ? '[贴片]' : `[排针 ${c.w}×${c.h}]`;
    return `<div class="comp-item${sel}" data-id="${c.id}">${typeLabel} ${c.name}${grp}</div>`;
  }).join('');
  // 显示组
  if (this.model.componentGroups.length > 0) {
    html += '<div style="border-top:1px solid var(--border);margin:4px 0;"></div>';
    html += this.model.componentGroups.map(g => {
      const sel = this.selectedObject && this.selectedObject.id === g.id ? ' selected' : '';
      return `<div class="comp-item${sel}" data-id="${g.id}" style="color:#9b59b6;">🔗 ${g.name} (${g.componentIds.length}器件)</div>`;
    }).join('');
  }
  list.innerHTML = html;

  list.querySelectorAll('.comp-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      this._multiSelObjects = [];
      const comp = this.model.findById(id) || this.model.componentGroups.find(g => g.id === id);
      if (comp) {
        this.selectedObject = comp;
        this._updatePropPanel();
        this._updateCompList();
      }
    });
    el.addEventListener('dblclick', () => {
      const id = el.dataset.id;
      const comp = this.model.findById(id);
      if (comp) {
        const newName = prompt('器件名称:', comp.name);
        if (newName !== null) {
          comp.name = newName;
          this._updatePropPanel();
          this._updateCompList();
          this._autoSave();
        }
      }
    });
  });
};

App.prototype._updateStatus = function() {
  document.getElementById('status-mode').textContent =
    `模式: ${{select:'选择', smd:'贴片', header:'排针', flywire:'飞线', solder:'焊锡', eraser:'橡皮擦'}[this.mode]}`;
  const gp = this.highlightedGridPoint;
  document.getElementById('status-pos').textContent = gp
    ? `格点: (${gp.gx}, ${gp.gy})` : '坐标: -';
  document.getElementById('status-zoom').textContent = `缩放: ${Math.round(this.zoom * 100)}%`;
  const hints = {
    select: '短按选中 | 长按拖移器件 | 长按格点走焊锡 | 右键拖动画面',
    smd: '点击相邻两个格点放置贴片器件 | Esc取消',
    header: '拖动矩形区域放置排针/排座 | Esc取消',
    flywire: '点击两个格点创建飞线 | Esc取消',
    solder: '双击开始 | 单击固定段 | 双击结束 | Enter完成',
    eraser: '长按左键拖拽擦除器件/焊锡段',
  };
  document.getElementById('status-hint').textContent = hints[this.mode] || '';
};

// ==================== 工具栏 ====================
App.prototype._setupToolbar = function() {
  document.getElementById('btn-select').addEventListener('click', () => this.setMode('select'));
  document.getElementById('btn-smd').addEventListener('click', () => this.setMode('smd'));
  document.getElementById('btn-header').addEventListener('click', () => this.setMode('header'));
  document.getElementById('btn-flywire').addEventListener('click', () => this.setMode('flywire'));
  document.getElementById('btn-solder').addEventListener('click', () => this.setMode('solder'));
  document.getElementById('btn-eraser').addEventListener('click', () => this.setMode('eraser'));
  document.getElementById('btn-undo').addEventListener('click', () => this.undo());
  document.getElementById('btn-redo').addEventListener('click', () => this.redo());
  document.getElementById('btn-delete').addEventListener('click', () => this.deleteSelected());
  document.getElementById('btn-rotate').addEventListener('click', () => this.rotateComponent());
  document.getElementById('btn-fliph').addEventListener('click', () => this.flipHorizontal());
  document.getElementById('btn-flipv').addEventListener('click', () => this.flipVertical());
  document.getElementById('btn-group').addEventListener('click', () => this._groupSelected());
  document.getElementById('btn-ungroup').addEventListener('click', () => this._ungroupSelected());

  // 回到原点
  document.getElementById('btn-home').addEventListener('click', () => {
    const cw = this.canvas.parentElement;
    this.zoom = 1;
    this.offsetX = cw.clientWidth / 2;
    this.offsetY = cw.clientHeight / 2;
    this._needsRender = true;
    this._updateStatus();
    document.getElementById('status-hint').textContent = '已回到原点 (0, 0)';
  });

  // 功能介绍弹窗
  document.getElementById('btn-features').addEventListener('click', () => {
    document.getElementById('features-overlay').classList.toggle('show');
  });

  // 新版本介绍弹窗
  document.getElementById('btn-version').addEventListener('click', () => {
    document.getElementById('version-overlay').classList.toggle('show');
  });

  document.getElementById('btn-help').addEventListener('click', () => {
    document.getElementById('help-overlay').classList.toggle('show');
  });

  document.getElementById('prop-apply').addEventListener('click', () => {
    const sel = this.selectedObject;
    if (!sel) return;
    const newName = document.getElementById('prop-name').value.trim();
    if (newName) { sel.name = newName; }
    // 焊锡线颜色/名称（支持完整走线或选中段）
    const traceObj = sel.points ? sel : (sel.trace ? sel.trace : null);
    if (traceObj) {
      const oldName = traceObj.name, oldColor = traceObj.color;
      const newColor = document.getElementById('prop-color').value;
      const that = this;
      const cmd = new Command('修改焊锡属性', () => {
        traceObj.name = newName; traceObj.color = newColor;
        return {trace: traceObj, oldName, oldColor};
      }, (data) => {
        data.trace.name = data.oldName; data.trace.color = data.oldColor;
      });
      this.cmdMgr.execute(cmd);
    }
    // 组名称
    if (sel.componentIds && newName) { sel.name = newName; }
    this._updateCompList();
    this._autoSave();
  });

  // 主题切换
  document.getElementById('btn-theme').addEventListener('click', () => this._toggleTheme());

  // 文件管理
  document.getElementById('btn-newfile').addEventListener('click', () => this._newFile());
  document.getElementById('btn-openfile').addEventListener('click', () => this._openFile());
  document.getElementById('btn-save').addEventListener('click', () => this._save());
  document.getElementById('btn-saveas').addEventListener('click', () => this._saveAs());
  document.getElementById('open-file-input').addEventListener('change', (e) => {
    this._handleOpenFile(e.target.files[0]); e.target.value = '';
  });

  // 工作区管理
  document.getElementById('btn-ws-import').addEventListener('click', () => {
    document.getElementById('ws-file-input').click();
  });
  document.getElementById('btn-ws-clear').addEventListener('click', () => {
    if (confirm('确定清空工作区文件列表？（不会删除已保存的JSON文件）')) {
      this._workspaceFiles = [];
      this._saveWorkspace();
      this._updateWorkspaceUI();
    }
  });
  document.getElementById('ws-file-input').addEventListener('change', (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    let loaded = 0;
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          const name = file.name.replace(/\.json$/i, '');
          const exist = this._workspaceFiles.findIndex(f => f.name === name);
          if (exist >= 0) this._workspaceFiles.splice(exist, 1);
          this._workspaceFiles.push({name, data});
          loaded++;
          this._saveWorkspace();
          this._updateWorkspaceUI();
          if (loaded === files.length) {
            document.getElementById('status-hint').textContent = `已导入 ${loaded} 个文件到工作区`;
          }
        } catch(err) {}
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  });
  this._loadWorkspace();

  // 关闭页面前：自动保存到localStorage，有未保存修改时提示
  window.addEventListener('beforeunload', (e) => {
    this._autoSave();
    if (this._isDirty) {
      e.preventDefault();
    }
  });
};
