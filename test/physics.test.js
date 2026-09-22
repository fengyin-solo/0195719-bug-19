/**
 * 物理模型验证（Node 下用 vm 加载浏览器脚本）
 * 运行：node test/physics.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.join(__dirname, '..', 'frontend-user', 'js');
const sandbox = { window: {}, console, Math, Infinity, isFinite, Set, CustomEvent: function () {} };
sandbox.window.addEventListener = () => {};
sandbox.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
vm.createContext(sandbox);

for (const f of ['config.js', 'utils.js', 'physics.js', 'lens.js']) {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), sandbox, { filename: f });
}

const Physics = vm.runInContext('Physics', sandbox);
const Lens = vm.runInContext('Lens', sandbox);
const CONFIG = vm.runInContext('CONFIG', sandbox);
let failures = 0;
function assert(cond, msg) {
    if (cond) { console.log('  ✓', msg); }
    else { failures++; console.error('  ✗', msg); }
}

function makeLens(type, opts = {}) {
    return new Lens({ type, x: 200, y: 300, size: 100, curvature: 60, material: 'normal', ...opts });
}

// 平行光（水平入射）在高度 h 处经过透镜后，与光轴的交点 x
function crossingX(lens, h, color) {
    const angle = 0;
    const n = color ? Physics.calculateDispersionIndex(lens.refractiveIndex, lens.dispersion, color) : undefined;
    const out = Physics.calculateOutgoingSlope(0, lens.y + h, lens, n);
    // 出射点 (lens.x, lens.y+h)，斜率 out，交光轴 y=lens.y：x = lens.x - h/out
    return lens.x - h / out;
}

console.log('1) 非球面：不同高度平行光会聚到同一焦点');
{
    const lens = makeLens(CONFIG.LENS_TYPES.ASPHERIC, { curvature: 60 });
    const f = lens.getFocalLength();
    const xs = [0.2, 0.5, 0.8, 0.95].map(p => crossingX(lens, p * lens.getHeight() / 2));
    console.log('    焦距 f =', f.toFixed(1), '交点:', xs.map(x => (x - lens.x).toFixed(2)).join(', '));
    const spread = Math.max(...xs) - Math.min(...xs);
    assert(spread < 0.01, `非球面各高度交点分散 ${spread.toExponential(2)} px ≈ 0（全部交于 x=lens.x+f）`);
    assert(Math.abs((xs[0] - lens.x) - f) < 0.01, '交点位置等于 getFocalLength() 的 f（标记与实际一致）');
}

console.log('2) 球面凸透镜：边缘光线比中心光线更早会聚（球差方向正确）');
{
    const lens = makeLens(CONFIG.LENS_TYPES.CONVEX, { curvature: 60 });
    const xCenter = crossingX(lens, 0.1 * lens.getHeight() / 2);
    const xEdge = crossingX(lens, 0.95 * lens.getHeight() / 2);
    const f = lens.getFocalLength();
    console.log('    中心交点偏移:', (xCenter - lens.x).toFixed(1), '边缘:', (xEdge - lens.x).toFixed(1), 'f:', f.toFixed(1));
    assert(xEdge < xCenter, '边缘交点在中心交点左侧（边缘提前会聚，球差方向正确）');
    assert(xEdge < lens.x + f, '边缘焦点在近轴焦点 F 之前');
    assert(Math.abs((xCenter - lens.x) - f) < 0.5, '近轴光线交点与 F 标记一致');
}

console.log('3) 非球面比球面更接近同一焦点');
{
    const a = makeLens(CONFIG.LENS_TYPES.ASPHERIC, { curvature: 60 });
    const c = makeLens(CONFIG.LENS_TYPES.CONVEX, { curvature: 60 });
    const spreadA = (() => {
        const xs = [0.2, 0.5, 0.95].map(p => crossingX(a, p * a.getHeight() / 2));
        return Math.max(...xs) - Math.min(...xs);
    })();
    const spreadC = (() => {
        const xs = [0.2, 0.5, 0.95].map(p => crossingX(c, p * c.getHeight() / 2));
        return Math.max(...xs) - Math.min(...xs);
    })();
    console.log('    非球面分散:', spreadA.toExponential(2), '球面分散:', spreadC.toFixed(1));
    assert(spreadA < spreadC * 0.01, '非球面焦点分散远小于球面');
}

console.log('4) 折射率越大焦距越短、偏折越强');
{
    const l15 = makeLens(CONFIG.LENS_TYPES.CONVEX, { refractiveIndex: 1.5 });
    const l17 = makeLens(CONFIG.LENS_TYPES.CONVEX, { refractiveIndex: 1.7 });
    assert(l17.getFocalLength() < l15.getFocalLength(), 'n=1.7 焦距 < n=1.5 焦距');
    const s15 = Physics.calculateOutgoingSlope(0, 330, l15);
    const s17 = Physics.calculateOutgoingSlope(0, 330, l17);
    assert(Math.abs(s17) > Math.abs(s15), 'n=1.7 出射斜率更大（偏折更强）');
}

console.log('5) 色散：蓝光折射率 > 绿光 > 红光，蓝焦点近、红焦点远');
{
    const lens = makeLens(CONFIG.LENS_TYPES.CONVEX, { material: 'normal' });
    const nB = Physics.calculateDispersionIndex(1.5, 0.4, 'blue');
    const nG = Physics.calculateDispersionIndex(1.5, 0.4, 'green');
    const nR = Physics.calculateDispersionIndex(1.5, 0.4, 'red');
    console.log('    n:', nR.toFixed(4), nG.toFixed(4), nB.toFixed(4));
    assert(nB > nG && nG > nR, 'n蓝 > n绿 > n红');
    const fB = lens.getFocalLengthForColor('blue');
    const fR = lens.getFocalLengthForColor('red');
    assert(fB < fR, '蓝光焦距 < 红光焦距');
    const xB = crossingX(lens, 0.5 * lens.getHeight() / 2, 'blue');
    const xR = crossingX(lens, 0.5 * lens.getHeight() / 2, 'red');
    assert(xB < xR, '同高度蓝光实际交点比红光更靠近透镜');
}

console.log('6) 低色散材料：三色焦点几乎重合');
{
    const lens = makeLens(CONFIG.LENS_TYPES.CONVEX, { material: 'lowDispersion' });
    const xB = crossingX(lens, 0.5 * lens.getHeight() / 2, 'blue');
    const xR = crossingX(lens, 0.5 * lens.getHeight() / 2, 'red');
    console.log('    低色散 红/蓝交点差:', Math.abs(xB - xR).toFixed(2), 'px');
    assert(Math.abs(xB - xR) < 2, 'ED 玻璃红蓝光交点差 < 2px');
}

console.log('7) 凹透镜发散、平面不偏折');
{
    const con = makeLens(CONFIG.LENS_TYPES.CONCAVE);
    const pla = makeLens(CONFIG.LENS_TYPES.PLANO);
    assert(Physics.calculateOutgoingSlope(0, 330, con) > 0, '凹透镜使轴上方光线向上发散');
    assert(Physics.calculateOutgoingSlope(0, 330, pla) === 0, '平面透镜斜率不变');
    assert(con.getFocalLength() < 0, '凹透镜焦距为负（虚焦点）');
    assert(pla.getFocalLength() === Infinity, '平面焦距 Infinity');
}

console.log('8) 材料恢复：fromJSON 保留显式折射率');
{
    const json = makeLens(CONFIG.LENS_TYPES.CONVEX, { material: 'highIndex' }).toJSON();
    const restored = Lens.fromJSON(json);
    assert(restored.refractiveIndex > 1.6, `高折射率存档恢复后 n=${restored.refractiveIndex}`);
    assert(restored.dispersion === CONFIG.MATERIALS.HIGH_INDEX.dispersion, '色散按材料正确恢复');
}

console.log('9) 球面边缘焦点前移比例约为 13%');
{
    const shift = Physics.getSphericalFocusShift(1);
    assert(Math.abs(shift - 0.15 / 1.15) < 1e-9, `边缘前移 ${(shift * 100).toFixed(1)}%`);
}

console.log(failures === 0 ? '\n全部通过 ✅' : `\n${failures} 项失败 ❌`);
process.exit(failures === 0 ? 0 : 1);
