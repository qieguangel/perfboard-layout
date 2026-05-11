// ==================== 命令系统 ====================
class Command {
  constructor(label, execute, undo) {
    this.label = label;
    this._execute = execute;
    this._undo = undo;
    this._data = null;
  }
  execute() { this._data = this._execute(); }
  undo() { this._undo(this._data); }
}

class CommandManager {
  constructor(app) {
    this.app = app;
    this.undoStack = [];
    this.redoStack = [];
    this.maxUndo = 100;
  }

  execute(cmd) {
    cmd.execute();
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
    this.redoStack = [];
    if (this.app) { this.app._isDirty = true; this.app._needsRender = true; }
  }

  undo() {
    if (this.undoStack.length === 0) return false;
    const cmd = this.undoStack.pop();
    cmd.undo();
    this.redoStack.push(cmd);
    if (this.app) { this.app._isDirty = true; this.app._needsRender = true; }
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    const cmd = this.redoStack.pop();
    cmd.execute();
    this.undoStack.push(cmd);
    if (this.app) { this.app._isDirty = true; this.app._needsRender = true; }
    return true;
  }

  clear() { this.undoStack = []; this.redoStack = []; }
}
