// ==================== 数据模型 ====================
class DataModel {
  constructor() {
    this.solderTraces = [];   // {id, points:[{gx,gy},...], color?, name?}
    this.flyWires = [];       // {id, from:{gx,gy}, to:{gx,gy}}
    this.smdComponents = [];  // {id, type:'smd', name, gx1,gy1, gx2,gy2, groupId?}
    this.headerComponents = []; // {id, type:'header', name, gx,gy, w,h, pinLabels:{}, groupId?}
    this.componentGroups = []; // {id, name, componentIds:[id,...]}
  }

  allComponents() {
    return [...this.smdComponents, ...this.headerComponents];
  }

  findById(id) {
    for (const arr of [this.smdComponents, this.headerComponents, this.solderTraces, this.flyWires]) {
      const found = arr.find(e => e.id === id);
      if (found) return found;
    }
    return null;
  }

  arrayFor(obj) {
    if (obj.type === 'smd') return this.smdComponents;
    if (obj.type === 'header') return this.headerComponents;
    if (obj.points !== undefined) return this.solderTraces;
    if (obj.from !== undefined) return this.flyWires;
    return null;
  }

  remove(obj) {
    const arr = this.arrayFor(obj);
    if (!arr) return;
    const idx = arr.indexOf(obj);
    if (idx >= 0) arr.splice(idx, 1);
  }

  addComponent(comp) {
    if (comp.type === 'smd') this.smdComponents.push(comp);
    else this.headerComponents.push(comp);
  }

  addSolderTrace(trace) { this.solderTraces.push(trace); }
  addFlyWire(fw) { this.flyWires.push(fw); }

  cloneComponent(comp) {
    const c = JSON.parse(JSON.stringify(comp));
    c.id = uid();
    return c;
  }

  toJSON() {
    return {
      smdComponents: this.smdComponents,
      headerComponents: this.headerComponents,
      solderTraces: this.solderTraces,
      flyWires: this.flyWires,
      componentGroups: this.componentGroups,
    };
  }

  fromJSON(data) {
    if (!data) return;
    this.smdComponents = data.smdComponents || [];
    this.headerComponents = data.headerComponents || [];
    this.solderTraces = data.solderTraces || [];
    this.flyWires = data.flyWires || [];
    this.componentGroups = data.componentGroups || [];
    _idCounter = Math.max(...this._allIds(), 0) + 1;
  }

  _allIds() {
    const ids = [];
    for (const arr of [this.smdComponents, this.headerComponents, this.solderTraces, this.flyWires]) {
      for (const e of arr) { const n = parseInt(e.id.replace('el_','')); if (!isNaN(n)) ids.push(n); }
    }
    return ids;
  }
}
