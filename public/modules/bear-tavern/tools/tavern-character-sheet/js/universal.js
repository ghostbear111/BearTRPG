/* 通用角色字段与检定引擎。模板保存为角色自己的版本快照，表达式不执行 JavaScript。 */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TavernUniversal = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const TYPES = Object.freeze(['text', 'textarea', 'number', 'boolean', 'select', 'multiselect', 'tags', 'resource', 'list', 'formula']);
  const LIMITS = Object.freeze({ modules: 30, fields: 250, options: 100, items: 200, text: 20000,
    expression: 1000, number: 1e12, dice: 100, totalDice: 300, sides: 1000000 });
  const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const clone = value => JSON.parse(JSON.stringify(value));
  function fail(path, message) { throw new Error(`${path}：${message}`); }
  function record(value, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, '必须是对象');
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) fail(path, '不支持的对象原型');
    return value;
  }
  function safe(value, path, depth, seen) {
    if (depth > 12) fail(path, '数据嵌套过深');
    if (value === null || ['string', 'boolean'].includes(typeof value)) return;
    if (typeof value === 'number') { if (!Number.isFinite(value)) fail(path, '必须是有限数值'); return; }
    if (typeof value !== 'object') fail(path, '必须是可保存的 JSON 数据');
    if (seen.has(value)) fail(path, '不能包含循环引用');
    seen.add(value);
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) fail(path, '不支持的数组原型');
      if (value.length > 10000) fail(path, '数组过大');
      for (let i = 0; i < value.length; i++) if (!own(value, i)) fail(path, '数组不能包含空位');
    } else record(value, path);
    if (Object.getOwnPropertySymbols(value).length) fail(path, '不能包含符号键');
    for (const key of Object.getOwnPropertyNames(value)) {
      if (Array.isArray(value) && key === 'length') continue;
      if (FORBIDDEN.has(key)) fail(path, '包含不安全字段');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !own(descriptor, 'value')) fail(path, '不能包含访问器');
      if (Array.isArray(value) && !/^(0|[1-9]\d*)$/.test(key)) fail(path, '数组不能包含额外属性');
      safe(descriptor.value, `${path}.${key}`, depth + 1, seen);
    }
    seen.delete(value);
  }
  function assertSafe(value, path) { safe(value, path || '数据', 0, new Set()); }
  function keys(value, allowed, path) {
    record(value, path);
    Object.getOwnPropertyNames(value).forEach(key => { if (!allowed.includes(key)) fail(path, `无法识别字段 ${key}`); });
  }
  function string(value, path, max, required) {
    if (typeof value !== 'string' || value.length > max || /\u0000/.test(value)) fail(path, `必须是 ${max} 字以内的文字`);
    if (required && !value.trim()) fail(path, '不能为空');
    return value;
  }
  function id(value, path) {
    string(value, path, 80, true);
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(value) || FORBIDDEN.has(value)) fail(path, '标识只允许安全的英文字母、数字、下划线和连字符');
    return value;
  }
  function number(value, path) {
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > LIMITS.number) fail(path, '数值必须有限且绝对值不超过 10^12');
    return value;
  }
  function integer(value, path, min, max) {
    if (!Number.isSafeInteger(value) || value < min || value > max) fail(path, `必须是 ${min} 至 ${max} 的整数`);
    return value;
  }
  function boolean(value, path) { if (typeof value !== 'boolean') fail(path, '必须是布尔值'); return value; }
  function optional(value, key, fallback, normalize, path) {
    return own(value, key) ? normalize(value[key], `${path}.${key}`) : fallback;
  }
  function array(value, path, max) { if (!Array.isArray(value) || value.length > max) fail(path, `必须是不超过 ${max} 项的数组`); return value; }

  const FUNCTIONS = Object.freeze({ floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs, min: Math.min, max: Math.max });
  function parse(expression, diceAllowed) {
    string(expression, '表达式', LIMITS.expression, true);
    const tokens = [];
    let position = 0;
    while (position < expression.length) {
      const rest = expression.slice(position);
      const space = /^\s+/.exec(rest);
      if (space) { position += space[0].length; continue; }
      let match;
      if ((match = /^\[([A-Za-z][A-Za-z0-9_-]*)\]/.exec(rest))) {
        id(match[1], '表达式引用'); tokens.push({ type: 'ref', value: match[1] });
      } else if (diceAllowed && (match = /^(\d*)[dD](\d+)(?:(kh|kl)(\d+))?/i.exec(rest))) {
        const count = integer(match[1] ? Number(match[1]) : 1, '骰子数量', 1, LIMITS.dice);
        const sides = integer(Number(match[2]), '骰子面数', 2, LIMITS.sides);
        const keep = match[4] ? integer(Number(match[4]), '保留骰子数量', 1, count) : count;
        tokens.push({ type: 'dice', count, sides, keep, mode: match[3] ? match[3].toLowerCase() : '' });
      } else if ((match = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(rest))) {
        tokens.push({ type: 'number', value: number(Number(match[0]), '表达式数值') });
      } else if ((match = /^[A-Za-z]+/.exec(rest))) {
        if (!own(FUNCTIONS, match[0])) fail('表达式', `不支持 ${match[0]}`);
        tokens.push({ type: 'function', value: match[0] });
      } else if ((match = /^[+\-*/%(),]/.exec(rest))) tokens.push({ type: match[0] });
      else fail('表达式', `无法识别第 ${position + 1} 位字符`);
      position += match[0].length;
      if (tokens.length > 500) fail('表达式', '过于复杂');
    }
    let cursor = 0;
    let depth = 0;
    function token(type) { return tokens[cursor] && tokens[cursor].type === type; }
    function take(type) { if (!token(type)) fail('表达式', `缺少 ${type}`); return tokens[cursor++]; }
    function primary() {
      if (++depth > 32) fail('表达式', '括号或运算嵌套过深');
      let result;
      if (token('+') || token('-')) result = { type: 'unary', op: tokens[cursor++].type, value: primary() };
      else if (token('number') || token('ref') || token('dice')) result = tokens[cursor++];
      else if (token('(')) { take('('); result = sum(); take(')'); }
      else if (token('function')) {
        const name = take('function').value;
        take('(');
        const args = [sum()];
        while (token(',')) { take(','); args.push(sum()); if (args.length > 20) fail('表达式', '函数参数过多'); }
        take(')');
        if (!['min', 'max'].includes(name) && args.length !== 1) fail('表达式', `${name} 只接受一个参数`);
        result = { type: 'call', name, args };
      } else fail('表达式', '需要数值、字段引用或括号');
      depth--;
      return result;
    }
    function product() {
      let result = primary();
      while (token('*') || token('/') || token('%')) result = { type: 'binary', op: tokens[cursor++].type, left: result, right: primary() };
      return result;
    }
    function sum() {
      let result = product();
      while (token('+') || token('-')) result = { type: 'binary', op: tokens[cursor++].type, left: result, right: product() };
      return result;
    }
    const ast = sum();
    if (cursor !== tokens.length) fail('表达式', '运算符、函数或括号不完整');
    return ast;
  }
  function references(ast, output) {
    if (ast.type === 'ref') output.add(ast.value);
    if (ast.type === 'binary') { references(ast.left, output); references(ast.right, output); }
    if (ast.type === 'unary') references(ast.value, output);
    if (ast.type === 'call') ast.args.forEach(arg => references(arg, output));
    return output;
  }
  function calculate(ast, resolver, dice) {
    let result;
    if (ast.type === 'number') result = ast.value;
    else if (ast.type === 'ref') result = resolver(ast.value);
    else if (ast.type === 'dice') result = dice(ast);
    else if (ast.type === 'unary') result = (ast.op === '-' ? -1 : 1) * calculate(ast.value, resolver, dice);
    else if (ast.type === 'call') result = FUNCTIONS[ast.name](...ast.args.map(arg => calculate(arg, resolver, dice)));
    else {
      const left = calculate(ast.left, resolver, dice);
      const right = calculate(ast.right, resolver, dice);
      if ((ast.op === '/' || ast.op === '%') && right === 0) fail('表达式', '不能除以零');
      if (ast.op === '+') result = left + right;
      if (ast.op === '-') result = left - right;
      if (ast.op === '*') result = left * right;
      if (ast.op === '/') result = left / right;
      if (ast.op === '%') result = left % right;
    }
    return number(result, '表达式结果');
  }

  function normalizeValue(field, value, path) {
    if (field.type === 'text') return string(value, path, 2000, false);
    if (field.type === 'textarea') return string(value, path, LIMITS.text, false);
    if (field.type === 'boolean') return boolean(value, path);
    if (field.type === 'number') {
      number(value, path);
      if (own(field, 'min') && value < field.min) fail(path, `不能小于 ${field.min}`);
      if (own(field, 'max') && value > field.max) fail(path, `不能大于 ${field.max}`);
      if (own(field, 'step')) {
        const steps = (value - (own(field, 'min') ? field.min : 0)) / field.step;
        if (!Number.isFinite(steps) || Math.abs(steps - Math.round(steps)) > 1e-7) fail(path, `必须符合步长 ${field.step}`);
      }
      return value;
    }
    if (field.type === 'select') {
      string(value, path, 200, false);
      if (value !== '' && !field.options.includes(value)) fail(path, '必须选用模板中的选项');
      return value;
    }
    if (['multiselect', 'tags', 'list'].includes(field.type)) {
      const output = array(value, path, LIMITS.items).map((item, index) => string(item, `${path}[${index}]`, field.type === 'list' ? 2000 : 200, true));
      if (field.type !== 'list' && new Set(output).size !== output.length) fail(path, '选项不能重复');
      if (field.type === 'multiselect' && output.some(item => !field.options.includes(item))) fail(path, '必须选用模板中的选项');
      return output;
    }
    if (field.type === 'resource') {
      keys(value, ['value', 'max'], path);
      const current = number(value.value, `${path}.value`);
      const maximum = number(value.max, `${path}.max`);
      if (own(field, 'min') && (current < field.min || maximum < field.min)) fail(path, `不能小于 ${field.min}`);
      if (own(field, 'max') && maximum > field.max) fail(path, `上限不能超过 ${field.max}`);
      return { value: current, max: maximum };
    }
    fail(path, '计算字段不能存储手动值');
  }
  function defaultValue(field) {
    if (['text', 'textarea', 'select'].includes(field.type)) return '';
    if (field.type === 'boolean') return false;
    if (['multiselect', 'tags', 'list'].includes(field.type)) return [];
    const zero = Math.max(own(field, 'min') ? field.min : -LIMITS.number, Math.min(own(field, 'max') ? field.max : LIMITS.number, 0));
    if (field.type === 'resource') return { value: zero, max: zero };
    if (field.type === 'number' && own(field, 'step') && !own(field, 'min')) {
      const start = Math.ceil((own(field, 'min') ? field.min : zero) / field.step) * field.step;
      return own(field, 'max') && start > field.max ? Math.floor(field.max / field.step) * field.step : start;
    }
    return zero;
  }
  function normalizeField(input, path) {
    record(input, path);
    if (!TYPES.includes(input.type)) fail(`${path}.type`, '不支持的字段类型');
    const extra = input.type === 'number' ? ['min', 'max', 'step'] : input.type === 'resource' ? ['min', 'max'] :
      ['select', 'multiselect'].includes(input.type) ? ['options'] : input.type === 'formula' ? ['expression'] : [];
    const common = ['id', 'label', 'type', 'description', 'unit', 'required', 'private'];
    keys(input, common.concat(extra, input.type === 'formula' ? [] : ['default']), path);
    const field = { id: id(input.id, `${path}.id`), label: string(input.label, `${path}.label`, 120, true), type: input.type,
      description: optional(input, 'description', '', (v, p) => string(v, p, 2000, false), path),
      unit: optional(input, 'unit', '', (v, p) => string(v, p, 80, false), path),
      required: optional(input, 'required', false, boolean, path), private: optional(input, 'private', false, boolean, path) };
    for (const key of ['min', 'max', 'step']) if (extra.includes(key) && own(input, key)) field[key] = number(input[key], `${path}.${key}`);
    if (own(field, 'min') && own(field, 'max') && field.min > field.max) fail(path, '最小值不能大于最大值');
    if (own(field, 'step') && field.step <= 0) fail(path, '步长必须大于零');
    if (extra.includes('options')) {
      field.options = array(input.options, `${path}.options`, LIMITS.options).map((v, i) => string(v, `${path}.options[${i}]`, 200, true));
      if (new Set(field.options).size !== field.options.length) fail(path, '选项不能重复');
    }
    if (field.type === 'formula') { field.expression = string(input.expression, `${path}.expression`, LIMITS.expression, true); parse(field.expression, false); }
    else field.default = normalizeValue(field, own(input, 'default') ? input.default : defaultValue(field), `${path}.default`);
    return field;
  }
  function normalizeSchema(input) {
    assertSafe(input, '模板');
    keys(input, ['id', 'name', 'version', 'description', 'modules'], '模板');
    const fieldIds = new Set();
    const moduleIds = new Set();
    let count = 0;
    const schema = { id: id(input.id, '模板.id'), name: string(input.name, '模板.name', 120, true),
      version: integer(input.version, '模板.version', 1, 1000000), description: optional(input, 'description', '', (v, p) => string(v, p, 2000, false), '模板'),
      modules: array(input.modules, '模板.modules', LIMITS.modules).map((entry, index) => {
        const path = `模板.modules[${index}]`;
        keys(entry, ['id', 'name', 'description', 'hidden', 'fields'], path);
        const moduleId = id(entry.id, `${path}.id`);
        if (moduleIds.has(moduleId)) fail(path, '模块标识重复');
        moduleIds.add(moduleId);
        const fields = array(entry.fields, `${path}.fields`, LIMITS.fields).map((field, fieldIndex) => {
          if (++count > LIMITS.fields) fail('模板', '字段总数过多');
          const normalized = normalizeField(field, `${path}.fields[${fieldIndex}]`);
          if (fieldIds.has(normalized.id)) fail(path, '字段标识必须跨模块唯一');
          fieldIds.add(normalized.id);
          return normalized;
        });
        return { id: moduleId, name: string(entry.name, `${path}.name`, 120, true),
          description: optional(entry, 'description', '', (v, p) => string(v, p, 2000, false), path), hidden: optional(entry, 'hidden', false, boolean, path), fields };
      }) };
    const fields = new Map(schema.modules.flatMap(module => module.fields).map(field => [field.id, field]));
    const dependencies = new Map();
    for (const field of fields.values()) if (field.type === 'formula') {
      const refs = references(parse(field.expression, false), new Set());
      for (const reference of refs) {
        if (!fields.has(reference)) fail(field.label, `引用不存在的字段 ${reference}`);
        if (!['number', 'resource', 'formula'].includes(fields.get(reference).type)) fail(field.label, `字段 ${reference} 不是数值`);
      }
      dependencies.set(field.id, refs);
    }
    const visiting = new Set();
    const visited = new Set();
    function visit(fieldId) {
      if (visiting.has(fieldId)) fail('模板', '计算字段存在循环引用');
      if (visited.has(fieldId)) return;
      visiting.add(fieldId);
      for (const ref of dependencies.get(fieldId) || []) if (dependencies.has(ref)) visit(ref);
      visiting.delete(fieldId); visited.add(fieldId);
    }
    dependencies.forEach((refs, fieldId) => visit(fieldId));
    return schema;
  }
  function normalizeSheet(input) {
    assertSafe(input, '角色字段');
    keys(input, ['schema', 'values'], '角色字段');
    const schema = normalizeSchema(input.schema);
    const incoming = own(input, 'values') ? record(input.values, '角色字段.values') : {};
    const fields = new Map(schema.modules.flatMap(module => module.fields).map(field => [field.id, field]));
    for (const key of Object.getOwnPropertyNames(incoming)) if (!fields.has(key) || fields.get(key).type === 'formula') fail('角色字段.values', `无法写入字段 ${key}`);
    const values = {};
    for (const field of fields.values()) if (field.type !== 'formula') values[field.id] = normalizeValue(field,
      own(incoming, field.id) ? incoming[field.id] : clone(field.default), `角色字段.${field.label}`);
    return { schema, values };
  }
  function createSheet(schema) { return normalizeSheet({ schema, values: {} }); }
  function resolver(sheet) {
    const fields = new Map(sheet.schema.modules.flatMap(module => module.fields).map(field => [field.id, field]));
    const visiting = new Set();
    const cached = new Map();
    function resolve(fieldId) {
      if (!fields.has(fieldId)) fail('字段', `不存在 ${fieldId}`);
      if (cached.has(fieldId)) return cached.get(fieldId);
      if (visiting.has(fieldId)) fail('表达式', '存在循环引用');
      const field = fields.get(fieldId);
      if (!['number', 'resource', 'formula'].includes(field.type)) fail(field.label, '不是数值字段');
      visiting.add(fieldId);
      const value = field.type === 'formula' ? calculate(parse(field.expression, false), resolve, null) :
        field.type === 'resource' ? sheet.values[fieldId].value : sheet.values[fieldId];
      visiting.delete(fieldId);
      cached.set(fieldId, number(value, field.label));
      return value;
    }
    return resolve;
  }
  function evaluateField(sheet, fieldId) { id(fieldId, '字段标识'); return resolver(normalizeSheet(sheet))(fieldId); }
  function validateSheet(sheet) {
    const normalized = normalizeSheet(sheet);
    const errors = [];
    for (const module of normalized.schema.modules) for (const field of module.fields) {
      const value = normalized.values[field.id];
      if (field.required && ((typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length))) errors.push(`${field.label}：尚未填写必填内容`);
      if (field.type === 'formula') try { evaluateField(normalized, field.id); } catch (error) { errors.push(`${field.label}：${error.message}`); }
    }
    return errors;
  }
  function publicSheet(sheet) {
    const normalized = normalizeSheet(sheet);
    const excluded = new Set();
    for (const module of normalized.schema.modules) for (const field of module.fields) if (module.hidden || field.private) excluded.add(field.id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const module of normalized.schema.modules) for (const field of module.fields) if (field.type === 'formula' && !excluded.has(field.id)) {
        if ([...references(parse(field.expression, false), new Set())].some(reference => excluded.has(reference))) { excluded.add(field.id); changed = true; }
      }
    }
    const schema = clone(normalized.schema);
    schema.modules = schema.modules.filter(module => !module.hidden).map(module => ({ ...module, fields: module.fields.filter(field => !excluded.has(field.id)) }));
    const values = {};
    for (const [key, value] of Object.entries(normalized.values)) if (!excluded.has(key)) values[key] = clone(value);
    return normalizeSheet({ schema, values });
  }

  function cryptoRoll(sides) {
    let crypto = root && root.crypto;
    if (!crypto && typeof require === 'function') crypto = require('node:crypto').webcrypto;
    if (!crypto || typeof crypto.getRandomValues !== 'function') fail('骰子', '当前环境不支持安全随机数');
    const limit = Math.floor(4294967296 / sides) * sides;
    const buffer = new Uint32Array(1);
    do { crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
    return (buffer[0] % sides) + 1;
  }
  function roll(expression, sheet, random) {
    const ast = parse(expression, true);
    const resolve = resolver(normalizeSheet(sheet));
    if (random !== undefined && typeof random !== 'function') fail('骰子', '随机来源必须是函数');
    let count = 0;
    function countDice(node) {
      if (node.type === 'dice') count += node.count;
      if (node.type === 'binary') { countDice(node.left); countDice(node.right); }
      if (node.type === 'unary') countDice(node.value);
      if (node.type === 'call') node.args.forEach(countDice);
    }
    countDice(ast);
    if (count > LIMITS.totalDice) fail('骰子', '一次检定骰子总数过多');
    const details = [];
    const total = calculate(ast, resolve, node => {
      const results = Array.from({ length: node.count }, () => {
        if (random === undefined) return cryptoRoll(node.sides);
        const sample = random();
        if (typeof sample !== 'number' || !Number.isFinite(sample) || sample < 0 || sample >= 1) fail('骰子', '随机来源必须返回 [0, 1) 的数值');
        return Math.floor(sample * node.sides) + 1;
      });
      const sorted = results.slice().sort((a, b) => node.mode === 'kl' ? a - b : b - a);
      const kept = node.mode ? sorted.slice(0, node.keep) : results;
      const subtotal = kept.reduce((sum, value) => sum + value, 0);
      details.push(`${node.count}d${node.sides}${node.mode ? node.mode + node.keep : ''} [${results.join(', ')}]${node.mode ? `，保留 [${kept.join(', ')}]` : ''} = ${subtotal}`);
      return subtotal;
    });
    return { total, detail: details.length ? details.join('；') : '直接计算', expression };
  }

  function getBuiltinTemplates() {
    const module = (id, name, fields) => ({ id, name, fields });
    const field = (id, label, type, extras) => ({ id, label, type, ...(extras || {}) });
    return [
      { id: 'universal-blank', name: '万能空白卡', version: 1, description: '从空白开始添加模块与字段，保存你自己的规则版本。', modules: [] },
      { id: 'universal-story', name: '叙事角色档案', version: 1, description: '用目标、关系和经历组织角色，不预设任何官方规则。', modules: [
        module('story', '人物与故事', [field('goal', '目标', 'textarea'), field('belief', '信念', 'textarea'), field('relationships', '关系', 'list'),
          field('traits', '特质标签', 'tags'), field('experience', '冒险经历', 'textarea')]),
        module('possessions', '物品与秘密', [field('items', '随身物品', 'list'), field('gm_notes', '主持人秘密', 'textarea', { private: true })]) ] },
      { id: 'universal-adventure', name: '数值冒险档案', version: 1, description: '通用属性与资源示例，数值和规则含义由你的跑团确定。', modules: [
        module('attributes', '基础属性', [field('power', '力量', 'number', { min: 0, max: 999, step: 1 }),
          field('agility', '敏捷', 'number', { min: 0, max: 999, step: 1 }), field('insight', '洞察', 'number', { min: 0, max: 999, step: 1 })]),
        module('resources', '资源与状态', [field('health', '生命', 'resource', { min: 0, default: { value: 0, max: 0 } }),
          field('stamina', '体力', 'resource', { min: 0 }), field('conditions', '状态', 'tags')]),
        module('abilities', '技能与装备', [field('skills', '技能能力', 'list'), field('equipment', '装备', 'list')]) ] },
      { id: 'universal-bear', name: '熊酒馆 · 世界观扩展', version: 1, description: '补充佣兵的出身、契约与冒险记录。六项战斗属性继续使用原角色卡。', modules: [
        module('origins', '出身与立场', [field('origin', '出身', 'text'), field('faction', '所属势力', 'text'), field('affiliations', '身份标签', 'tags')]),
        module('contracts', '佣兵契约', [field('contracts', '契约记录', 'list'), field('reputation', '声望记录', 'textarea'), field('objectives', '当前目标', 'textarea')]),
        module('history', '冒险档案', [field('milestones', '重要经历', 'list'), field('connections', '人际关系', 'list'),
          field('personal_secret', '个人秘密', 'textarea', { private: true })]) ] }
    ].map(normalizeSchema);
  }
  return Object.freeze({ TYPES, LIMITS, normalizeSchema, normalizeSheet, createSheet, publicSheet, evaluateField, validateSheet, roll, getBuiltinTemplates });
});
