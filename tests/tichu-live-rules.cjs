// Exercise the lesson's rendered controls without a browser or database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let state = [], cursor = 0;
const source = ts.transpileModule(fs.readFileSync('app/tichu/learn/TichuLiveRules.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exportsObject = {};
vm.runInNewContext(source, { exports: exportsObject, require(name) {
  if (name === 'react') return { useState(initial) {
    const i = cursor++;
    if (!(i in state)) state[i] = initial;
    return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }];
  } };
  if (name === 'next/link') return { default: 'a' };
  if (name.endsWith('.css')) return { default: new Proxy({}, { get: (_, key) => key }) };
  return require(name);
} });
function render() { cursor = 0; return exportsObject.default(); }
function all(node, result = []) {
  if (Array.isArray(node)) node.forEach(item => all(item, result));
  else if (node && typeof node === 'object' && node.props) { result.push(node); all(node.props.children, result); }
  return result;
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join('');
  if (node && typeof node === 'object') return text(node.props?.children);
  return node == null ? '' : String(node);
}
const controls = () => all(render());
const button = label => controls().find(n => n.type === 'button' && text(n) === label);
function click(label) { const b = button(label); assert.ok(b, label); assert.ok(!b.props.disabled, label); b.props.onClick(); }
const cards = () => controls().filter(n => n.type === 'button' && n.props.className === 'handCard');
function play(rank) { const card = cards().find(c => c.props['aria-label'].startsWith(`${rank} `)); assert.ok(card, rank); assert.ok(!card.props.disabled); card.props.onClick(); }
click('테이블에 앉기 →'); assert.equal(cards().length, 8);
click('다음 단계 →'); assert.equal(cards().length, 14);
click('다음 단계 →'); assert.equal(button('선택한 3장 교환하기 →').props.disabled, true);
play('7'); assert.match(text(render()), /참새·7·A를 남겨/);
play('2'); play('4'); play('5');
play('4'); assert.equal(button('선택한 3장 교환하기 →').props.disabled, true);
play('4'); click('선택한 3장 교환하기 →'); assert.equal(cards().length, 14);
assert.ok(cards().every(c => c.props.disabled));
click('다음 단계 →'); play('A'); assert.equal(cards().length, 14);
play('7'); assert.equal(cards().length, 13); assert.ok(cards().every(c => c.props.disabled));
click('다음 단계 →'); play('8'); assert.equal(cards().length, 13);
assert.match(text(render()), /9보다 높은 싱글이 필요/);
play('A'); assert.equal(cards().length, 12);
click('다음 단계 →'); assert.match(text(render()), /트릭 획득/);
click('다음 단계 →'); assert.match(text(render()), /첫 트릭을 마쳤어요/);
click('처음부터 다시 배우기'); assert.equal(cards().length, 0);
click('테이블에 앉기 →'); assert.equal(cards().length, 8);
console.log('PASS: deal counts, exchange selection/deselection, guarded progression, legal/illegal plays, trick completion and replay');
