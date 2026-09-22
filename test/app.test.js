/**
 * App 启动与持久化链路验证（轻量 DOM 桩，无第三方依赖）
 * 运行：node test/app.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.join(__dirname, '..', 'frontend-user', 'js');

function noop() {}
const listeners = {};
const store = {};

function makeCtxMock() {
    return new Proxy({}, {
        get(t, p) {
            if (p === 'createLinearGradient') return () => ({ addColorStop: noop });
            return typeof p === 'string' ? noop : undefined;
        },
        set() { return true; }
    });
}

function makeEl(id) {
    const el = {
        id,
        style: {},
        value: '',
        textContent: '',
        innerHTML: '',
        disabled: false,
        dataset: {},
        _classes: new Set(['hidden'].includes(id) ? ['hidden'] : []),
        classList: {
            add(...c) { c.forEach(x => el._classes.add(x)); },
            remove(...c) { c.forEach(x => el._classes.delete(x)); },
            toggle(c, on) {
                if (on === undefined) on = !el._classes.has(c);
                on ? el._classes.add(c) : el._classes.delete(c);
            },
            contains(c) { return el._classes.has(c); }
        },
        listeners: {},
        addEventListener(type, fn) {
            (el.listeners[type] = el.listeners[type] || []).push(fn);
        },
        dispatch(type, evt = {}) {
            (el.listeners[type] || []).forEach(fn => fn.call(el, { target: el, preventDefault: noop, ...evt }));
        },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 600 }),
        querySelector() { return makeEl('qs-' + Math.random()); },
        querySelectorAll: () => [],
        getContext: () => makeCtxMock()
    };
    return el;
}

const els = {};
const knownIds = [
    'optics-canvas', 'canvas-wrapper', 'canvas-drop-hint', 'ray-status', 'ray-status-message', 'btn-ray-retry',
    'btn-toggle-light', 'btn-reset-canvas', 'select-light-mode', 'data-light-type', 'btn-toggle-labels',
    'panel-empty', 'panel-params', 'param-type-value', 'param-ri', 'param-ri-value',
    'param-size', 'param-size-value', 'param-curvature', 'param-curvature-value',
    'param-curvature-group', 'param-material', 'param-focal-value', 'param-aberration-value',
    'btn-reset-lens', 'btn-delete-lens', 'btn-help',
    'btn-quiz-mode', 'btn-quiz-close', 'btn-quiz-hint', 'btn-quiz-submit', 'btn-quiz-skip',
    'btn-quiz-next', 'btn-quiz-exit', 'quiz-panel', 'quiz-result-modal', 'app',
    'quiz-question-title', 'quiz-question-desc', 'quiz-hint-text', 'quiz-score-value', 'quiz-score-total',
    'quiz-result-icon', 'quiz-result-title', 'quiz-result-score', 'quiz-result-explanation',
    'quiz-result-details', 'quiz-total-score', 'quiz-accuracy', 'quiz-answered',
    'tip-text', 'knowledge-tip', 'toast-container', 'help-tooltip'
];
const initiallyHidden = ['canvas-drop-hint', 'ray-status', 'panel-params',
    'quiz-panel', 'quiz-result-modal', 'quiz-hint-text'];
knownIds.forEach(id => {
    els[id] = makeEl(id);
    if (initiallyHidden.includes(id)) els[id]._classes.add('hidden');
});
els['optics-canvas'].parentElement = els['canvas-wrapper'];
els['canvas-wrapper'].getBoundingClientRect = () => ({ width: 900, height: 600 });

const sandbox = {
    console, Math, Infinity, isFinite, Set, Map, Date, JSON, parseInt, parseFloat, setTimeout, clearTimeout, setInterval: noop, clearInterval: noop,
    CustomEvent: function (name, opts) { this.type = name; this.detail = opts && opts.detail; },
    localStorage: {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; }
    },
    document: {
        readyState: 'complete',
        getElementById: id => els[id] || makeEl(id),
        querySelector: sel => sel === '.tip-text' ? els['tip-text'] : makeEl('qs'),
        querySelectorAll: sel => sel === '.btn-help-small' || sel === '.lens-item' ? [] : makeEl('qs')
    },
    window: { devicePixelRatio: 1, innerWidth: 900, addEventListener: noop }
};
sandbox.window.dispatchEvent = (evt) => {
    const type = evt.type;
    (listeners[type] || []).forEach(fn => fn(evt));
};
sandbox.window.addEventListener = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
vm.createContext(sandbox);

for (const f of ['config.js', 'utils.js', 'storage.js', 'physics.js', 'lens.js',
    'renderer.js', 'canvas.js', 'quiz.js', 'interaction.js', 'guide.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), sandbox, { filename: f });
}

let failures = 0;
function assert(cond, msg) {
    if (cond) { console.log('  ✓', msg); }
    else { failures++; console.error('  ✗', msg); }
}

const App = vm.runInContext('app', sandbox);
const cm = App.canvasManager;

console.log('1) 应用启动：无存档时空画布');
{
    assert(cm.lenses.length === 0, '初始无透镜');
    assert(els['panel-params']._classes.has('hidden'), '参数面板隐藏');
}

console.log('2) 添加非球面透镜并调整参数');
{
    const Lens = vm.runInContext('Lens', sandbox);
    const CONFIG = vm.runInContext('CONFIG', sandbox);
    const lens = new Lens({ type: CONFIG.LENS_TYPES.ASPHERIC, x: 300, y: 300, curvature: 60 });
    cm.addLens(lens);
    cm.selectLens(lens);
    assert(els['param-type-value'].textContent === '非球面透镜', '面板显示“非球面透镜”');
    assert(els['param-focal-value'].textContent.includes('px'), '面板显示焦距 ' + els['param-focal-value'].textContent);
    assert(els['param-aberration-value'].textContent.includes('同一焦点'), '面板说明消球差');

    // 模拟折射率滑块
    els['param-ri'].value = '1.70';
    els['param-ri'].dispatch('input');
    assert(lens.refractiveIndex === 1.7, '滑块更新折射率到 1.70');
    const f170 = els['param-focal-value'].textContent;
    els['param-ri'].value = '1.50';
    els['param-ri'].dispatch('input');
    assert(f170 !== els['param-focal-value'].textContent, '折射率变化后面板焦距更新');
}

console.log('3) 启动光路并验证标记位置与物理一致');
{
    const renderer = cm.getRenderer();
    renderer.lightMode = 'parallel';
    renderer.setRunning(true);
    const lens = cm.lenses[0];
    const analysis = renderer.analyzeCurrentLight(null);
    const f = lens.getFocalLength();
    assert(analysis.hitCount > 0, `光线穿过透镜（${analysis.hitCount} 条）`);
    assert(analysis.focusSpread < 0.001 * f, '非球面实际焦点分散 < 0.1% f');
    assert(analysis.crossingXs.every(x => Math.abs(x - (lens.x + f)) < 1e-6),
        '光线实际会聚位置与 F 标记（lens.x+f）重合');
}

console.log('4) 状态提示：透镜移出光束范围');
{
    const lens = cm.lenses[0];
    lens.y = 40;
    const renderer = cm.getRenderer();
    renderer.render();
    const statusEl = els['ray-status'];
    assert(!statusEl._classes.has('hidden'), '状态条出现');
    assert(els['ray-status-message'].textContent.includes('孔径之外'), '说明落在孔径之外');
    assert(typeof els['btn-ray-retry'].listeners.click[0] === 'function', '提供“重新检测光路”按钮');
    lens.y = 300;
    renderer.render();
    assert(statusEl._classes.has('hidden'), '移回光路后提示消失（重试成功）');
}

console.log('5) 持久化：模拟刷新后状态一致');
{
    // 立即落盘（绕过防抖）
    cm.saveNow();
    assert(!!store['optics_designs_v1'], '设计已写入 localStorage');

    const saved = JSON.parse(store['optics_designs_v1']);
    const before = cm.lenses.map(l => ({ x: l.x, y: l.y, n: l.refractiveIndex, type: l.type, c: l.curvature }));
    const fBefore = cm.lenses[0].getFocalLength();
    assert(saved.isRunning === true, '光路运行状态被保存');
    assert(saved.lenses[0].type === 'aspheric', '非球面透镜被保存');

    // 重新构造 App 模拟刷新（会先清空旧 App 的画布 DOM 无关，直接 new CanvasManager 等价验证）
    const CanvasManager = vm.runInContext('CanvasManager', sandbox);
    const cm2 = new CanvasManager();
    assert(cm2.lenses.length === 1, '刷新后恢复 1 个透镜');
    const after = cm2.lenses.map(l => ({ x: l.x, y: l.y, n: l.refractiveIndex, type: l.type, c: l.curvature }));
    assert(JSON.stringify(before) === JSON.stringify(after), '位置/折射率/曲率全部一致');
    assert(cm2.getRenderer().isRunning === true, '光路运行状态恢复');
    assert(cm2.lenses[0].getFocalLength() === fBefore, '刷新后焦距（=F标记位置）不变');
    assert(cm2.selectedLens === cm2.lenses[0], '选中状态恢复，参数面板自动打开');
}

console.log('6) 重置画布清除存档');
{
    cm.getRenderer().setRunning(false);
    cm.clear();
    cm.saveNow();
    const saved = JSON.parse(store['optics_designs_v1']);
    assert(saved.lenses.length === 0, '存档中的透镜已清空');
}

console.log(failures === 0 ? '\n全部通过 ✅' : `\n${failures} 项失败 ❌`);
process.exit(failures === 0 ? 0 : 1);
