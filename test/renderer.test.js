/**
 * 渲染器集成验证：实际光路追迹 vs 焦点标记 vs 未命中原因
 * 运行：node test/renderer.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.join(__dirname, '..', 'frontend-user', 'js');

function makeCtxMock() {
    const noop = () => {};
    return new Proxy({}, {
        get(t, prop) {
            if (prop === 'measureText') return () => ({ width: 10 });
            if (prop === 'getImageData') return () => ({ data: [] });
            if (prop === 'createLinearGradient' || prop === 'createRadialGradient')
                return () => ({ addColorStop: noop });
            return typeof prop === 'string' ? noop : undefined;
        },
        set() { return true; }
    });
}

const elements = {};
function makeEl(id) {
    return elements[id] || (elements[id] = {
        id,
        textContent: '',
        className: '',
        style: {},
        innerHTML: '',
        value: '',
        classList: {
            _set: new Set(),
            add(...c) { c.forEach(x => this._set.add(x)); },
            remove(...c) { c.forEach(x => this._set.delete(x)); },
            toggle(c, on) { on ? this._set.add(c) : this._set.delete(c); },
            contains(c) { return this._set.has(c); }
        },
        addEventListener() {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 600 }),
        parentElement: null
    });
}

const sandbox = {
    console, Math, Infinity, isFinite, Set, Map, Date, JSON, parseInt, parseFloat,
    CustomEvent: function () {},
    window: { devicePixelRatio: 1, addEventListener: noop, innerWidth: 900 },
    document: {
        getElementById: makeEl,
        querySelector: () => makeEl('qs'),
        querySelectorAll: () => [],
        createElement: () => makeEl('created-' + Math.random())
    },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop }
};
function noop() {}
sandbox.window.dispatchEvent = noop;
vm.createContext(sandbox);

for (const f of ['config.js', 'utils.js', 'storage.js', 'physics.js', 'lens.js', 'renderer.js']) {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), sandbox, { filename: f });
}

const Renderer = vm.runInContext('Renderer', sandbox);
const Lens = vm.runInContext('Lens', sandbox);
const CONFIG = vm.runInContext('CONFIG', sandbox);

let failures = 0;
function assert(cond, msg) {
    if (cond) { console.log('  ✓', msg); }
    else { failures++; console.error('  ✗', msg); }
}

const canvasMock = {
    parentElement: { getBoundingClientRect: () => ({ width: 900, height: 600 }) },
    getContext: () => makeCtxMock(),
    addEventListener: noop,
    style: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 600 })
};

const r = new Renderer(canvasMock);
r.isRunning = true;
r.lightMode = CONFIG.LIGHT_MODES.PARALLEL;
r.incidentAngle = 0;
r.rayCount = 5;

const lens = (type, opts = {}) => new Lens({
    type, x: 300, y: 300, size: 100, curvature: 60, material: 'normal', ...opts
});

console.log('1) 非球面实际追迹：所有交点重合于 F 标记');
{
    const L = lens(CONFIG.LENS_TYPES.ASPHERIC);
    r.setLenses([L]);
    const rays = r.generateSourceRays();
    const a = r.analyzeRaySet(rays, null);
    const f = L.getFocalLength();
    console.log('    命中', a.hitCount, '/', a.total, '交点分散:', a.focusSpread, 'f:', f.toFixed(1));
    assert(a.hitCount === 3, '居中透镜有 3 条光线穿过（中心+边缘）');
    assert(a.focusSpread < 1e-6, `交点分散 ≈ 0（实际 ${a.focusSpread}）`);
    assert(Math.abs(a.crossingXs[0] - (L.x + f)) < 1e-6, '实际交点 = lens.x + getFocalLength()（即 F 标记位置）');
    assert(a.edgeShift < 0.03, '消球差测验判据 edgeShift < 3%');
}

console.log('2) 球面实际追迹：边缘交点早于中心，分散约 13% 焦距');
{
    const L = lens(CONFIG.LENS_TYPES.CONVEX);
    r.setLenses([L]);
    const a = r.analyzeRaySet(r.generateSourceRays(), null);
    const f = L.getFocalLength();
    console.log('    分散:', a.focusSpread === null ? 'null' : a.focusSpread.toFixed(1), 'px =', (a.edgeShift * 100).toFixed(1) + '% f');
    assert(a.focusSpread > 0.05 * f, '球差分散 > 5% 焦距（测验能识别出球差）');
    assert(Math.min(...a.crossingXs) < L.x + f, '边缘光线交点在 F 标记之前');
}

console.log('3) 透镜移出光路：outside 原因 + 全部未命中');
{
    const L = lens(CONFIG.LENS_TYPES.CONVEX, { y: 60 }); // 远离光轴，平行光打不到
    r.setLenses([L]);
    const a = r.analyzeRaySet(r.generateSourceRays(), null);
    assert(a.hitCount === 0, '命中数为 0');
    assert(a.missReasons.some(x => x.reason === 'outside'), '原因标记为 outside（孔径之外）');
    r.updateRayStatus(a);
    assert(makeEl('ray-status-message').textContent.includes('孔径之外'), '状态条提示“孔径之外…重试”');
}

console.log('4) 无透镜：noLens 原因');
{
    r.setLenses([]);
    const a = r.analyzeRaySet(r.generateSourceRays(), null);
    assert(a.hitCount === 0 && a.missReasons[0].reason === 'noLens', 'noLens');
    r.updateRayStatus(a);
    assert(makeEl('ray-status-message').textContent.includes('还没有透镜'), '提示先添加透镜');
}

console.log('5) 点光源太近：tooClose 原因');
{
    r.lightMode = CONFIG.LIGHT_MODES.POINT; // 光源 x=50
    const L = lens(CONFIG.LENS_TYPES.CONVEX, { x: 52 });
    r.setLenses([L]);
    const a = r.analyzeRaySet(r.generateSourceRays(), null);
    assert(a.missReasons.some(x => x.reason === 'tooClose'), '距光源 <5px 标记 tooClose');
    r.lightMode = CONFIG.LIGHT_MODES.PARALLEL;
}

console.log('6) 凹透镜：无实轴交点、判定发散');
{
    const L = lens(CONFIG.LENS_TYPES.CONCAVE);
    r.setLenses([L]);
    const a = r.analyzeRaySet(r.generateSourceRays(), null);
    assert(a.crossingXs.length === 0, '凹透镜不与光轴实交');
    assert(a.diverging === true, '末端散开宽度增大 → diverging');
}

console.log('7) 色散模式：红/绿/蓝 F 标记分别对应各色实际交点');
{
    // 非球面无球差，各色光线都精准交于各自波长的 F 标记
    const L = lens(CONFIG.LENS_TYPES.ASPHERIC, { material: 'normal' });
    r.setLenses([L]);
    r.showDispersion = true;
    for (const c of ['red', 'green', 'blue']) {
        const a = r.analyzeRaySet(r.generateSourceRays(), c);
        const f = L.getFocalLengthForColor(c);
        const ok = a.crossingXs.length > 0 &&
            a.crossingXs.every(x => Math.abs(x - (L.x + f)) < 0.01);
        assert(ok, `${c} 光实际交点与 ${c} F 标记一致（f=${f.toFixed(1)}）`);
    }
    const spread = Math.abs(L.getFocalLengthForColor('red') - L.getFocalLengthForColor('blue'));
    assert(spread > 2, `普通玻璃红蓝焦点分离 ${spread.toFixed(1)} px（色散可见）`);

    // 球面镜：同高度边缘光线，蓝光交点比红光更靠近透镜
    const C = lens(CONFIG.LENS_TYPES.CONVEX, { material: 'normal' });
    r.setLenses([C]);
    const xB = r.analyzeRaySet(r.generateSourceRays(), 'blue').crossingXs;
    const xR = r.analyzeRaySet(r.generateSourceRays(), 'red').crossingXs;
    assert(Math.min(...xB) < Math.min(...xR), '蓝光边缘交点比红光更靠前（蓝偏折更强）');
    r.showDispersion = false;
}

console.log(failures === 0 ? '\n全部通过 ✅' : `\n${failures} 项失败 ❌`);
process.exit(failures === 0 ? 0 : 1);
