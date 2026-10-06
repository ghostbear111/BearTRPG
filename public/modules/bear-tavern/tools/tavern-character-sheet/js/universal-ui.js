/* A local, schema-driven character editor. User strings are always text. */
(function (root) {
  'use strict';
  const TYPES = [
    ['text', '短文本'], ['textarea', '长文本'], ['number', '数字'],
    ['boolean', '开关'], ['select', '单选'], ['multiselect', '多选'],
    ['tags', '标签'], ['resource', '当前值 / 上限'], ['list', '列表'], ['formula', '计算公式']
  ];
  let sharedDialog, dialogOwner, sequence = 0;
  const clone = value => JSON.parse(JSON.stringify(value));
  function el(tag, attributes, ...children) {
    const node = document.createElement(tag);
    Object.entries(attributes || {}).forEach(([key, value]) => {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (value !== undefined && value !== null) node.setAttribute(key, String(value));
    });
    children.flat().forEach(child => {
      if (child !== undefined && child !== null) node.append(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }
  function button(label, action, className = 'button-quiet') {
    return el('button', {type: 'button', class: className, text: label, onclick: action});
  }
  function input(type, value = '', attributes = {}) {
    const node = el('input', {type, ...attributes});
    if (type === 'checkbox') node.checked = !!value;
    else node.value = value;
    return node;
  }
  function area(value = '', attributes = {}) {
    const node = el('textarea', attributes); node.value = value; return node;
  }
  function field(label, control, hint) {
    if (!control.hasAttribute('aria-label')) control.setAttribute('aria-label', label);
    return el('label', {class: 'field'}, el('span', {text: label}), control,
      hint ? el('small', {class: 'universal-help', text: hint}) : null);
  }
  function check(label, checked) {
    const control = input('checkbox', checked);
    return {control, node: el('label', {class: 'universal-check'}, control, el('span', {text: label}))};
  }
  function lines(value) { return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean); }
  function tags(value) { return value.split(/[,，\n]/).map(item => item.trim()).filter(Boolean); }
  function numeric(control) {
    if (!control.value.trim()) throw new Error('请填写数字；需要清空时可设为 0。');
    const value = Number(control.value);
    if (!Number.isFinite(value)) throw new Error('请填写有限的数字。');
    return value;
  }
  function nextId(prefix, existing) {
    let n = 1; while (existing.includes(prefix + '_' + n)) n++; return prefix + '_' + n;
  }
  function getDialog() {
    if (!sharedDialog) {
      sharedDialog = el('dialog', {id: 'universal-designer-dialog', class: 'app-dialog dialog-wide universal-dialog', 'aria-label': '通用角色卡设计器'});
      document.body.append(sharedDialog);
      sharedDialog.addEventListener('close', () => { dialogOwner = null; });
    }
    return sharedDialog;
  }
  function modal(owner, title, body, save, options = {}) {
    const dialog = getDialog();
    if (dialog.open) dialog.close();
    dialogOwner = owner;
    const error = el('p', {class: 'form-error', role: 'alert'});
    const close = () => dialog.close();
    const form = el('form', {novalidate: ''},
      el('div', {class: 'dialog-heading'}, el('h2', {text: title}), button('×', close, 'icon-button')),
      options.lead ? el('p', {class: 'dialog-lead', text: options.lead}) : null,
      body, error,
      el('div', {class: 'dialog-footer'}, button('取消', close),
        el('button', {type: 'submit', class: options.danger ? 'button-danger' : 'button-primary', text: options.saveText || '保存'})));
    form.addEventListener('submit', event => {
      event.preventDefault(); error.textContent = '';
      try { save(); close(); } catch (problem) { error.textContent = problem.message || '修改无法保存，请检查字段。'; }
    });
    dialog.replaceChildren(form); dialog.showModal();
    return {dialog, error};
  }

  function mount(container, card, options = {}) {
    const U = root.TavernUniversal;
    if (!U) throw new Error('通用规则引擎尚未加载。');
    let design = false, disposed = false;
    const owner = {}, formulas = new Map(), valueErrors = new Map(), idPrefix = 'universal-' + (++sequence) + '-';
    const rollLog = [];
    let validation, message;
    container.classList.add('universal-editor');
    function announce(text, failure = false) {
      if (!message) return;
      message.textContent = text; message.classList.toggle('is-error', failure);
    }
    function candidate(edit) {
      const sheet = clone(card.sheet); edit(sheet); return U.normalizeSheet(sheet);
    }
    function commit(edit, redraw = true) {
      if (disposed) return;
      const sheet = candidate(edit);
      card.sheet = sheet;
      if (options.onChange) options.onChange(card);
      if (redraw) render(); else updateComputed();
    }
    function changeValue(definition, value, errorNode) {
      try {
        commit(sheet => { sheet.values[definition.id] = value; }, false);
        errorNode.textContent = ''; valueErrors.delete(definition.id);
      } catch (problem) { errorNode.textContent = problem.message; valueErrors.set(definition.id, problem.message); }
      if (options.onValidityChange) options.onValidityChange(Array.from(valueErrors.values()));
    }
    function updateComputed() {
      formulas.forEach((nodes, id) => {
        try { nodes.value.textContent = U.evaluateField(card.sheet, id); nodes.error.textContent = ''; }
        catch (problem) { nodes.value.textContent = '无法计算'; nodes.error.textContent = problem.message; }
      });
      if (validation) {
        const errors = U.validateSheet(card.sheet);
        validation.textContent = errors.length ? '草稿提醒：' + errors.join('；') : '';
      }
    }
    function safeAction(action) {
      try { action(); } catch (problem) { announce(problem.message, true); }
    }
    function moveModule(moduleId, offset) {
      safeAction(() => commit(sheet => {
        const modules = sheet.schema.modules, at = modules.findIndex(item => item.id === moduleId);
        const target = at + offset;
        if (target < 0 || target >= modules.length) return;
        [modules[at], modules[target]] = [modules[target], modules[at]];
      }));
    }
    function moveField(moduleId, fieldId, offset) {
      safeAction(() => commit(sheet => {
        const fields = sheet.schema.modules.find(item => item.id === moduleId).fields;
        const at = fields.findIndex(item => item.id === fieldId), target = at + offset;
        if (target < 0 || target >= fields.length) return;
        [fields[at], fields[target]] = [fields[target], fields[at]];
      }));
    }
    function deleteField(moduleId, definition) {
      modal(owner, '删除字段', el('p', {class: 'dialog-lead', text: '将删除“' + definition.label + '”及这张卡对应的值。若其他公式引用它，请先修改公式。'}), () => {
        commit(sheet => {
          const module = sheet.schema.modules.find(item => item.id === moduleId);
          module.fields = module.fields.filter(item => item.id !== definition.id);
          delete sheet.values[definition.id];
        });
      }, {danger: true, saveText: '确认删除字段'});
    }
    function deleteModule(module) {
      modal(owner, '删除模块', el('p', {class: 'dialog-lead', text: '将删除“' + module.name + '”模块、其中 ' + module.fields.length + ' 个字段和这张卡对应的值。若其他公式引用这些字段，请先修改公式。'}), () => {
        commit(sheet => {
          const removed = sheet.schema.modules.find(item => item.id === module.id);
          removed.fields.forEach(item => { delete sheet.values[item.id]; });
          sheet.schema.modules = sheet.schema.modules.filter(item => item.id !== module.id);
        });
      }, {danger: true, saveText: '确认删除模块'});
    }
    function moduleEditor(existing) {
      const moduleId = input('text', existing?.id || nextId('module', card.sheet.schema.modules.map(item => item.id)));
      moduleId.readOnly = !!existing;
      const name = input('text', existing?.name || '', {maxlength: 100, placeholder: '例如：战斗属性、魔法、阵营关系'});
      const description = area(existing?.description || '', {rows: 3});
      const hidden = check('隐藏模块（设计模式仍可查看）', existing?.hidden || false);
      modal(owner, existing ? '编辑模块' : '添加模块', el('div', {class: 'universal-form-grid'},
        field('模块名称', name), field('模块 ID', moduleId, '英文、数字和下划线；创建后保持稳定。'),
        el('div', {class: 'universal-span'}, field('模块说明', description), hidden.node)), () => {
        commit(sheet => {
          const item = {id: moduleId.value.trim(), name: name.value.trim(), description: description.value, hidden: hidden.control.checked, fields: existing ? clone(existing.fields) : []};
          if (existing) sheet.schema.modules[sheet.schema.modules.findIndex(module => module.id === existing.id)] = item;
          else sheet.schema.modules.push(item);
        });
      });
    }
    function schemaEditor() {
      const name = input('text', card.sheet.schema.name, {maxlength: 100});
      const version = input('number', card.sheet.schema.version, {min: 1, step: 1});
      const description = area(card.sheet.schema.description, {rows: 4});
      modal(owner, '规则信息', el('div', {class: 'universal-form-grid'},
        field('规则名称', name), field('规则版本', version),
        el('div', {class: 'universal-span'}, field('规则说明', description))), () => {
        commit(sheet => { sheet.schema.name = name.value.trim(); sheet.schema.version = numeric(version); sheet.schema.description = description.value; });
      }, {lead: '修改只作用于当前角色的规则快照。另存为模板可用于创建新角色。'});
    }
    function referencePicker(target, definitions, label, showIds) {
      const picker = el('select', {'aria-label': label});
      picker.append(new Option('选择数值字段', ''));
      definitions.forEach(definition => picker.append(new Option(definition.label + (showIds ? ' [' + definition.id + ']' : ''), definition.id)));
      const insert = button('插入引用', () => {
        if (!picker.value) return;
        const at = target.selectionStart ?? target.value.length, end = target.selectionEnd ?? at;
        target.setRangeText('[' + picker.value + ']', at, end, 'end'); target.focus();
      }, 'button-outline');
      insert.disabled = definitions.length === 0;
      return el('div', {class: 'universal-reference-picker'}, picker, insert);
    }
    function fieldEditor(moduleId, existing) {
      const taken = card.sheet.schema.modules.flatMap(item => item.fields.map(definition => definition.id));
      const fieldId = input('text', existing?.id || nextId('field', taken)); fieldId.readOnly = !!existing;
      const label = input('text', existing?.label || '', {maxlength: 100, placeholder: '例如：感知、生命、熟练技能'});
      const type = el('select', {'aria-label': '字段类型'});
      TYPES.forEach(([value, name]) => type.append(new Option(name, value)));
      type.value = existing?.type || 'number'; type.disabled = !!existing;
      const unit = input('text', existing?.unit || '', {maxlength: 30, placeholder: '例如：米、金币；也可留空'});
      const description = area(existing?.description || '', {rows: 2});
      const required = check('必填（空值保留为草稿）', existing?.required || false);
      const privateField = check('私密字段（玩家导出与打印时移除）', existing?.private || false);
      const typeFields = el('div', {class: 'universal-form-grid universal-span'});
      let controls = {};
      function refreshType() {
        const kind = type.value, initial = existing || {};
        controls = {}; typeFields.replaceChildren();
        if (['number', 'resource'].includes(kind)) {
          controls.min = input('number', initial.min ?? '', {step: 'any', placeholder: '不限制'});
          controls.max = input('number', initial.max ?? '', {step: 'any', placeholder: '不限制'});
          typeFields.append(field('允许最小值', controls.min), field('允许最大值', controls.max,
            kind === 'resource' ? '约束容量上限；当前值可以因临时加值超过容量。' : null));
          if (kind === 'number') {
            controls.step = input('number', initial.step ?? '', {step: 'any', min: 0, placeholder: '不限制'});
            controls.default = input('number', initial.default ?? '', {step: 'any', placeholder: '使用默认值'});
            typeFields.append(field('步长', controls.step), field('新角色默认值', controls.default));
          } else {
            controls.current = input('number', initial.default?.value ?? '', {step: 'any', placeholder: '使用默认值'});
            controls.capacity = input('number', initial.default?.max ?? '', {step: 'any', placeholder: '使用默认值'});
            typeFields.append(field('默认当前值', controls.current), field('默认上限', controls.capacity));
          }
        } else if (['select', 'multiselect'].includes(kind)) {
          controls.options = area((initial.options || []).join('\n'), {rows: 5, placeholder: '人类\n精灵\n矮人'});
          typeFields.append(el('div', {class: 'universal-span'}, field('选项（每行一个）', controls.options)));
          controls.default = kind === 'select' ? input('text', initial.default || '') : area((initial.default || []).join('\n'), {rows: 2});
          typeFields.append(el('div', {class: 'universal-span'}, field('新角色默认值', controls.default, kind === 'select' ? '填写一个完整选项，可留空。' : '每行一个已有选项，可留空。')));
        } else if (kind === 'formula') {
          controls.expression = area(initial.expression || '', {rows: 3, placeholder: 'floor([strength] / 2) + [level]'});
          const numericFields = card.sheet.schema.modules.flatMap(module => module.fields).filter(definition => ['number', 'resource', 'formula'].includes(definition.type) && definition.id !== existing?.id);
          typeFields.append(el('div', {class: 'universal-span'}, field('计算表达式', controls.expression,
            '用 [字段ID] 引用数字、资源当前值或其他公式。支持四则运算、floor、ceil、round、min、max、abs。'),
            referencePicker(controls.expression, numericFields, '公式可引用字段', true),
            el('p', {class: 'universal-help', text: numericFields.length ? '可引用：' + numericFields.map(definition => '[' + definition.id + '] ' + definition.label).join(' · ') : '先添加数字或资源字段，再引用它们。'})));
        } else if (kind === 'boolean') {
          controls.default = check('默认开启', initial.default || false);
          typeFields.append(controls.default.node);
        } else {
          controls.default = ['textarea', 'list'].includes(kind) ? area(Array.isArray(initial.default) ? initial.default.join('\n') : initial.default || '', {rows: 3}) : input('text', Array.isArray(initial.default) ? initial.default.join('，') : initial.default || '');
          typeFields.append(el('div', {class: 'universal-span'}, field('新角色默认值', controls.default,
            kind === 'tags' ? '标签用逗号分隔。' : kind === 'list' ? '每行一个条目，条目可重复。' : '只用于新角色或新增字段；已有值会保留。')));
        }
      }
      type.addEventListener('change', refreshType); refreshType();
      const body = el('div', {class: 'universal-form-grid'},
        field('字段名称', label), field('字段 ID', fieldId, '英文、数字和下划线；公式引用此 ID。'),
        field('字段类型', type, existing ? '类型固定。更换类型请新增字段后手动迁移数据。' : null), field('显示单位', unit),
        el('div', {class: 'universal-span'}, field('字段说明', description)), typeFields,
        el('div', {class: 'universal-span universal-checkboxes'}, required.node, privateField.node));
      modal(owner, existing ? '编辑字段' : '添加字段', body, () => {
        const kind = type.value;
        const definition = {id: fieldId.value.trim(), label: label.value.trim(), type: kind, unit: unit.value.trim(), description: description.value, required: required.control.checked, private: privateField.control.checked};
        ['min', 'max', 'step'].forEach(key => { if (controls[key]?.value.trim()) definition[key] = numeric(controls[key]); });
        if (kind === 'formula') definition.expression = controls.expression.value.trim();
        else if (kind === 'boolean') definition.default = controls.default.control.checked;
        else if (kind === 'number') { if (controls.default.value.trim()) definition.default = numeric(controls.default); }
        else if (kind === 'resource') {
          if (controls.current.value.trim() || controls.capacity.value.trim()) definition.default = {value: controls.current.value.trim() ? numeric(controls.current) : 0, max: controls.capacity.value.trim() ? numeric(controls.capacity) : 0};
        } else if (['select', 'multiselect'].includes(kind)) {
          definition.options = lines(controls.options.value);
          definition.default = kind === 'select' ? controls.default.value.trim() : lines(controls.default.value);
        } else if (kind === 'tags') definition.default = tags(controls.default.value);
        else if (kind === 'list') definition.default = lines(controls.default.value);
        else definition.default = controls.default.value;
        commit(sheet => {
          const fields = sheet.schema.modules.find(module => module.id === moduleId).fields;
          if (existing) fields[fields.findIndex(item => item.id === existing.id)] = definition;
          else fields.push(definition);
        });
      }, {lead: existing ? '已有字段值会保留。新约束如果不兼容现有值，会提示错误并保留原设置。' : '字段 ID 在整张卡中唯一；新增字段会填入默认值。'});
    }
    function renderField(definition, module, position) {
      const fieldValue = card.sheet.values[definition.id];
      const labelId = idPrefix + definition.id + '-label', controlId = idPrefix + definition.id;
      const error = el('p', {class: 'universal-field-error', role: 'status', text: valueErrors.get(definition.id) || ''});
      const heading = el('div', {class: 'universal-field-label'},
        el('label', {id: labelId, for: controlId, text: definition.label + (definition.required ? ' *' : '')}),
        definition.unit ? el('span', {class: 'universal-unit', text: definition.unit}) : null,
        definition.private ? el('span', {class: 'universal-private', text: '私密'}) : null);
      let control;
      const attrs = {id: controlId, 'aria-labelledby': labelId};
      if (definition.type === 'formula') {
        control = el('output', {...attrs, class: 'universal-formula'});
        formulas.set(definition.id, {value: control, error});
      } else if (definition.type === 'boolean') {
        control = input('checkbox', fieldValue, attrs);
        control.addEventListener('change', () => changeValue(definition, control.checked, error));
      } else if (definition.type === 'select') {
        control = el('select', attrs); control.append(new Option('尚未选择', ''));
        definition.options.forEach(item => control.append(new Option(item, item)));
        control.value = fieldValue;
        control.addEventListener('change', () => changeValue(definition, control.value, error));
      } else if (definition.type === 'multiselect') {
        control = el('div', {...attrs, class: 'universal-choices', role: 'group'});
        definition.options.forEach(item => {
          const itemCheck = check(item, fieldValue.includes(item));
          itemCheck.control.addEventListener('change', () => {
            const next = [...card.sheet.values[definition.id]];
            if (itemCheck.control.checked && !next.includes(item)) next.push(item);
            else if (!itemCheck.control.checked) next.splice(next.indexOf(item), 1);
            changeValue(definition, next, error);
          });
          control.append(itemCheck.node);
        });
      } else if (definition.type === 'resource') {
        const current = input('number', fieldValue.value, {step: 'any', 'aria-label': definition.label + ' 当前值'});
        const maximum = input('number', fieldValue.max, {step: 'any', 'aria-label': definition.label + ' 上限'});
        control = el('div', {...attrs, class: 'universal-resource'}, field('当前', current), el('span', {'aria-hidden': 'true', text: '/'}), field('上限', maximum));
        [current, maximum].forEach(node => node.addEventListener('input', () => {
          try { changeValue(definition, {value: numeric(current), max: numeric(maximum)}, error); }
          catch (problem) { error.textContent = problem.message; }
        }));
      } else if (definition.type === 'number') {
        control = input('number', fieldValue, {...attrs, min: definition.min, max: definition.max, step: definition.step || 'any'});
        control.addEventListener('input', () => {
          try { changeValue(definition, numeric(control), error); } catch (problem) { error.textContent = problem.message; }
        });
      } else {
        const displayed = Array.isArray(fieldValue) ? fieldValue.join(definition.type === 'list' ? '\n' : '，') : fieldValue;
        control = ['textarea', 'list'].includes(definition.type) ? area(displayed, {...attrs, rows: 4}) : input('text', displayed, attrs);
        control.addEventListener('input', () => {
          changeValue(definition, definition.type === 'list' ? lines(control.value) : definition.type === 'tags' ? tags(control.value) : control.value, error);
        });
      }
      const wrapper = el('div', {class: 'universal-field' + (['textarea', 'list', 'multiselect'].includes(definition.type) ? ' universal-field-wide' : '') + (definition.private ? ' is-private' : '')},
        heading, control, definition.description ? el('p', {class: 'universal-help', text: definition.description}) : null,
        definition.type === 'tags' ? el('p', {class: 'universal-help', text: '用逗号分隔多个标签。'}) : null,
        definition.type === 'list' ? el('p', {class: 'universal-help', text: '每行一个条目。'}) : null,
        design ? el('p', {class: 'universal-field-key', text: definition.id + ' · ' + TYPES.find(item => item[0] === definition.type)[1] + (definition.type === 'formula' ? ' · ' + definition.expression : '')}) : null,
        error);
      if (design) {
        const up = button('↑', () => moveField(module.id, definition.id, -1)); up.disabled = position === 0; up.setAttribute('aria-label', '上移字段 ' + definition.label);
        const down = button('↓', () => moveField(module.id, definition.id, 1)); down.disabled = position === module.fields.length - 1; down.setAttribute('aria-label', '下移字段 ' + definition.label);
        wrapper.append(el('div', {class: 'universal-field-tools'}, button('编辑', () => fieldEditor(module.id, definition)), up, down,
          button('删除', () => deleteField(module.id, definition), 'button-quiet universal-delete')));
      }
      return wrapper;
    }
    function renderRoller() {
      const expression = input('text', '', {placeholder: '例如：1d20 + [strength]', 'aria-label': '掷骰表达式'});
      const log = el('ol', {class: 'universal-roll-log', 'aria-live': 'polite'});
      const error = el('p', {class: 'universal-field-error', role: 'alert'});
      function showLog() {
        log.replaceChildren(...rollLog.map(result => el('li', {}, el('strong', {text: String(result.total)}), el('span', {text: result.detail}))));
      }
      const form = el('form', {class: 'universal-roll-form'}, expression, el('button', {type: 'submit', class: 'button-primary', text: '掷骰'}));
      form.addEventListener('submit', event => {
        event.preventDefault(); error.textContent = '';
        try {
          const result = U.roll(expression.value.trim(), card.sheet);
          rollLog.unshift(result); if (rollLog.length > 10) rollLog.pop(); showLog();
          if (options.onRoll) options.onRoll(result);
        } catch (problem) { error.textContent = problem.message; }
      });
      showLog();
      const numericFields = card.sheet.schema.modules.filter(module => !module.hidden).flatMap(module => module.fields).filter(definition => ['number', 'resource', 'formula'].includes(definition.type));
      return el('section', {class: 'universal-roller', 'aria-label': '通用骰子'}, el('h3', {text: '检定与骰子'}),
        el('p', {class: 'universal-help', text: '例如 2d6 或 2d20kh1（取高）、2d20kl1（取低）；可插入数值字段作为修正。掷骰记录仅保留于当前编辑页面。'}),
        form, numericFields.length ? referencePicker(expression, numericFields, '掷骰引用字段', false) : null, error, log);
    }
    function render() {
      if (disposed) return;
      formulas.clear();
      const schema = card.sheet.schema;
      const toggle = button(design ? '完成布局编辑' : '编辑布局', () => { design = !design; render(); }, design ? 'button-primary' : 'button-outline');
      toggle.setAttribute('aria-pressed', String(design));
      const actions = el('div', {class: 'universal-actions'}, options.mode === 'creation' ? null : toggle);
      if (options.onTemplateSave) actions.append(button('另存为模板', () => options.onTemplateSave(clone(card.sheet.schema)), 'button-outline'));
      message = el('p', {class: 'universal-message', role: 'status'});
      validation = el('p', {class: 'universal-validation', role: 'status'});
      const children = [el('header', {class: 'universal-summary'},
        el('div', {}, el('span', {class: 'universal-kicker', text: '通用角色卡 · 规则快照'}), el('h2', {text: schema.name}),
          el('p', {class: 'universal-help', text: '版本 ' + schema.version + ' · ' + schema.modules.length + ' 个模块 · ' + schema.modules.reduce((count, module) => count + module.fields.length, 0) + ' 个字段'})), actions),
        schema.description ? el('p', {class: 'universal-description', text: schema.description}) : null,
        message, validation];
      if (design) children.push(el('div', {class: 'universal-design-bar'},
        el('p', {text: '编辑此卡的模块与字段，已有模板和其他角色保持原样。'}),
        button('规则信息', schemaEditor, 'button-outline'), button('＋ 添加模块', () => moduleEditor(), 'button-outline')));
      schema.modules.forEach((module, index) => {
        if (module.hidden && !design) return;
        const moduleActions = el('div', {class: 'universal-module-tools'});
        if (design) {
          const up = button('↑', () => moveModule(module.id, -1)); up.disabled = index === 0; up.setAttribute('aria-label', '上移模块 ' + module.name);
          const down = button('↓', () => moveModule(module.id, 1)); down.disabled = index === schema.modules.length - 1; down.setAttribute('aria-label', '下移模块 ' + module.name);
          moduleActions.append(button('编辑模块', () => moduleEditor(module)), up, down,
            button(module.hidden ? '显示' : '隐藏', () => safeAction(() => commit(sheet => { sheet.schema.modules.find(item => item.id === module.id).hidden = !module.hidden; }))),
            button('删除模块', () => deleteModule(module), 'button-quiet universal-delete'));
        }
        const section = el('section', {class: 'universal-module' + (module.hidden ? ' is-hidden' : ''), 'aria-label': module.name},
          el('div', {class: 'universal-module-heading'}, el('h3', {text: module.name + (module.hidden ? '（已隐藏）' : '')}), moduleActions),
          module.description ? el('p', {class: 'universal-module-description', text: module.description}) : null,
          el('div', {class: 'universal-fields'}, ...module.fields.map((definition, position) => renderField(definition, module, position))));
        if (design) section.append(button('＋ 添加字段', () => fieldEditor(module.id), 'button-outline universal-add-field'));
        else if (!module.fields.length) section.append(el('p', {class: 'universal-help', text: '此模块暂无字段。进入编辑布局可以添加。'}));
        children.push(section);
      });
      if (!schema.modules.length) children.push(el('div', {class: 'universal-empty'}, el('h3', {text: '从第一个模块开始'}),
        el('p', {text: options.mode === 'creation' ? '此模板尚无模块，可以先建档，再继续添加规则字段。' : '添加属性、技能、装备、魔法或任何属于你的规则字段。'}), design || options.mode === 'creation' ? null : button('＋ 添加模块', () => moduleEditor(), 'button-outline')));
      if (options.mode !== 'creation') children.push(renderRoller());
      container.replaceChildren(...children.filter(Boolean)); updateComputed();
    }
    try { card.sheet = U.normalizeSheet(card.sheet); render(); }
    catch (problem) { container.replaceChildren(el('p', {class: 'form-error', role: 'alert', text: '此角色的通用规则暂时无法读取：' + problem.message})); }
    return {
      refresh: render,
      destroy() {
        disposed = true;
        if (dialogOwner === owner && sharedDialog?.open) sharedDialog.close();
        formulas.clear(); valueErrors.clear();
      }
    };
  }
  root.TavernUniversalUI = Object.freeze({mount});
})(window);
