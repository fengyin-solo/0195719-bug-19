/**
 * 光路渲染器
 *
 * 职责：
 * - 绘制网格、光轴、透镜、光线与焦点标记
 * - 单条光线的完整追踪（可连续穿过多个透镜）
 * - 色散模式下按红/绿/蓝波长分别计算折射率、焦距与偏折
 * - 光线没有穿过任何镜片时，在画布上说明原因并提供「重试」
 */
class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.lenses = [];
        this.lightMode = CONFIG.LIGHT_DEFAULTS.mode;
        this.rayCount = CONFIG.LIGHT_DEFAULTS.rayCount;
        this.incidentAngle = CONFIG.LIGHT_DEFAULTS.angle;
        this.isRunning = false;
        this.showLabels = true;
        this.showDispersion = false;
        this.simpleMode = false;

        // 本次渲染的光路统计：实际穿过镜片的光线条数
        this.hitRayCount = 0;

        this.resize();
    }

    resize() {
        const wrapper = this.canvas.parentElement;
        const rect = wrapper.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;

        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
        this.width = rect.width;
        this.height = rect.height;

        this.render();
    }

    setLenses(lenses) {
        this.lenses = lenses;
        this.render();
    }

    setLightMode(mode) {
        this.lightMode = mode;
        this.render();
    }

    setRayCount(count) {
        this.rayCount = count;
        this.render();
    }

    setIncidentAngle(angle) {
        this.incidentAngle = angle;
        this.render();
    }

    toggleRunning() {
        this.isRunning = !this.isRunning;
        this.render();
        return this.isRunning;
    }

    setRunning(running) {
        this.isRunning = running;
        this.render();
    }

    toggleLabels() {
        this.showLabels = !this.showLabels;
        this.render();
        return this.showLabels;
    }

    setShowDispersion(show) {
        this.showDispersion = show;
        this.render();
    }

    setSimpleMode(simple) {
        this.simpleMode = simple;
        this.render();
    }

    render() {
        this.clear();
        this.drawGrid();
        this.drawOpticalAxis();

        this.hitRayCount = 0;
        if (this.isRunning) {
            this.drawLightRays();
        }

        this.drawLenses();

        if (this.showLabels && this.isRunning) {
            this.drawLabels();
        }

        this.updateNotice();
    }

    clear() {
        this.ctx.fillStyle = '#FAFAFA';
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    drawGrid() {
        if (this.simpleMode) return;

        const gridSize = 40;
        this.ctx.strokeStyle = CONFIG.COLORS.GRID;
        this.ctx.lineWidth = 0.5;

        for (let x = gridSize; x < this.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.height);
            this.ctx.stroke();
        }

        for (let y = gridSize; y < this.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.width, y);
            this.ctx.stroke();
        }
    }

    drawOpticalAxis() {
        const centerY = this.height / 2;

        this.ctx.strokeStyle = CONFIG.COLORS.OPTICAL_AXIS;
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);

        this.ctx.beginPath();
        this.ctx.moveTo(0, centerY);
        this.ctx.lineTo(this.width, centerY);
        this.ctx.stroke();

        this.ctx.setLineDash([]);
    }

    drawLenses() {
        this.lenses.forEach(lens => this.drawLens(lens));
    }

    drawLens(lens) {
        const ctx = this.ctx;
        const x = lens.x;
        const y = lens.y;
        const width = lens.getWidth();
        const halfHeight = lens.getHeight() / 2;

        ctx.save();

        let fillColor = CONFIG.COLORS.LENS_FILL;
        let strokeColor = CONFIG.COLORS.LENS_STROKE;

        if (lens.material === 'lowDispersion') {
            fillColor = 'rgba(93, 122, 58, 0.3)';
            strokeColor = '#5D7A3A';
        } else if (lens.material === 'highIndex') {
            fillColor = 'rgba(93, 78, 140, 0.3)';
            strokeColor = '#5D4E8C';
        }

        if (lens.selected) {
            strokeColor = CONFIG.COLORS.LENS_SELECTED;
            ctx.shadowColor = CONFIG.COLORS.LENS_SELECTED;
            ctx.shadowBlur = 10;
        }

        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = CONFIG.RENDER.LENS_STROKE_WIDTH;

        ctx.beginPath();

        switch (lens.type) {
            case CONFIG.LENS_TYPES.CONVEX:
                this.drawConvexLens(ctx, x, y, width, halfHeight, lens.curvature);
                break;
            case CONFIG.LENS_TYPES.CONCAVE:
                this.drawConcaveLens(ctx, x, y, width, halfHeight, lens.curvature);
                break;
            case CONFIG.LENS_TYPES.PLANO:
                this.drawPlanoLens(ctx, x, y, halfHeight);
                break;
            case CONFIG.LENS_TYPES.ASPHERIC:
                this.drawAsphericLens(ctx, x, y, width, halfHeight, lens.curvature);
                break;
        }

        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    drawConvexLens(ctx, x, y, width, halfHeight, curvature) {
        const curveAmount = width * (curvature / 100);
        ctx.moveTo(x, y - halfHeight);
        ctx.quadraticCurveTo(x + curveAmount, y, x, y + halfHeight);
        ctx.quadraticCurveTo(x - curveAmount, y, x, y - halfHeight);
    }

    drawConcaveLens(ctx, x, y, width, halfHeight, curvature) {
        const curveAmount = width * (curvature / 100) * 0.5;
        const edgeWidth = width * 0.3;
        ctx.moveTo(x - edgeWidth, y - halfHeight);
        ctx.quadraticCurveTo(x + curveAmount, y, x - edgeWidth, y + halfHeight);
        ctx.lineTo(x + edgeWidth, y + halfHeight);
        ctx.quadraticCurveTo(x - curveAmount, y, x + edgeWidth, y - halfHeight);
        ctx.closePath();
    }

    drawPlanoLens(ctx, x, y, halfHeight) {
        ctx.rect(x - 4, y - halfHeight, 8, halfHeight * 2);
    }

    drawAsphericLens(ctx, x, y, width, halfHeight, curvature) {
        const curveAmount = width * (curvature / 100);
        ctx.moveTo(x, y - halfHeight);
        ctx.bezierCurveTo(x + curveAmount * 0.8, y - halfHeight * 0.3, x + curveAmount * 0.8, y + halfHeight * 0.3, x, y + halfHeight);
        ctx.bezierCurveTo(x - curveAmount * 0.8, y + halfHeight * 0.3, x - curveAmount * 0.8, y - halfHeight * 0.3, x, y - halfHeight);
    }

    // ========================= 光线生成与追踪 =========================

    generateRays() {
        if (this.lightMode !== CONFIG.LIGHT_MODES.PARALLEL) {
            return Physics.generatePointSourceRays(50, this.height / 2, this.rayCount);
        }

        // 平行光：若画布上已有透镜，让光束在【最左侧透镜平面】上均匀
        // 覆盖其 92% 口径（类似教材光路图中与镜片等宽的平行光束），
        // 保证中心光线与边缘光线都能穿过镜片、球差对比清晰可见。
        const angleRad = Utils.degToRad(this.incidentAngle);
        const tanA = Math.tan(angleRad);
        const target = this.lenses
            .filter(l => l.x > 5)
            .sort((a, b) => a.x - b.x)[0];

        if (!target) {
            return Physics.generateParallelRays(this.height, this.rayCount, this.incidentAngle);
        }

        const halfH = target.getHeight() / 2;
        const rays = [];
        const span = 0.92;
        for (let i = 1; i <= this.rayCount; i++) {
            const frac = this.rayCount === 1
                ? 0
                : -span + (2 * span) * (i - 1) / (this.rayCount - 1);
            // 目标点 (target.x, target.y + frac·halfH)，反推 x=0 处的起始 y
            let y0 = target.y + frac * halfH - tanA * target.x;
            y0 = Utils.clamp(y0, 2, this.height - 2);
            rays.push({ x: 0, y: y0, angle: angleRad });
        }
        return rays;
    }

    drawLightRays() {
        const rays = this.generateRays();

        // 色散模式只在存在色散材料的镜片时生效，否则按普通白光绘制
        const hasDispersiveLens = this.lenses.some(l =>
            l.type !== CONFIG.LENS_TYPES.PLANO && l.dispersion > 0.05
        );

        if (this.showDispersion && hasDispersiveLens) {
            // 先红后蓝，蓝色画在上层更醒目；同一条光线三色一起追踪，
            // 命中只计一次
            rays.forEach(ray => {
                let rayHit = false;
                ['red', 'green', 'blue'].forEach(color => {
                    const result = this.traceRay(ray, color);
                    if (result.hitLenses.length > 0) rayHit = true;
                });
                if (rayHit) this.hitRayCount++;
            });
        } else {
            rays.forEach(ray => {
                const result = this.traceRay(ray);
                if (result.hitLenses.length > 0) this.hitRayCount++;
            });
        }
    }

    /**
     * 线段延伸到画布边界
     */
    extendToCanvasEdge(ctx, rayX, rayY, rayAngle) {
        const dirX = Math.cos(rayAngle);
        const dirY = Math.sin(rayAngle);
        let endX, endY;

        if (Math.abs(dirX) > 0.001) {
            endX = dirX > 0 ? this.width + 50 : -50;
            endY = rayY + dirY * (endX - rayX) / dirX;
        } else {
            endX = rayX;
            endY = dirY > 0 ? this.height + 50 : -50;
        }

        ctx.lineTo(endX, endY);
        ctx.stroke();
    }

    /**
     * 构造用于物理计算的透镜对象（色散模式下替换为该波长的折射率）
     */
    static buildLensForColor(lens, color) {
        if (!color) return lens;
        const colorIndex = Physics.calculateDispersionIndex(
            lens.refractiveIndex,
            lens.dispersion,
            color
        );
        return new Proxy(lens, {
            get(target, prop) {
                if (prop === 'refractiveIndex') return colorIndex;
                return target[prop];
            }
        });
    }

    /**
     * 追踪并绘制单条光线（可连续穿过多个透镜）
     *
     * 普通模式：入射段红色（CONFIG.INCIDENT_RAY），折射后蓝色（CONFIG.REFRACTED_RAY）
     * 色散模式：整条光线使用该波长对应的红/绿/蓝色
     *
     * @returns {{ hitLenses: Lens[] }} 该光线穿过的镜片（用于统计与提示）
     */
    traceRay(ray, color = null) {
        const ctx = this.ctx;
        let rayX = ray.x;
        let rayY = ray.y;
        let rayAngle = ray.angle;
        let isIncident = true;
        let lastLensId = null;
        const hitLenses = [];

        ctx.lineWidth = CONFIG.RENDER.RAY_WIDTH;
        ctx.strokeStyle = color
            ? CONFIG.COLORS[`RAY_${color.toUpperCase()}`]
            : CONFIG.COLORS.INCIDENT_RAY;

        ctx.beginPath();
        ctx.moveTo(rayX, rayY);

        // 追踪光线穿过多个透镜（上限防止异常情况下死循环）
        for (let i = 0; i < 20; i++) {
            let nearest = null;
            let nearestLens = null;
            let minDist = Infinity;

            for (const lens of this.lenses) {
                if (lens.id === lastLensId) continue;

                const hit = Physics.calculateRayLensIntersection(rayX, rayY, rayAngle, lens);
                if (hit.hit && hit.distance < minDist) {
                    minDist = hit.distance;
                    nearest = hit;
                    nearestLens = lens;
                }
            }

            if (!nearest) break;

            ctx.lineTo(nearest.x, nearest.y);
            ctx.stroke();

            const calcLens = Renderer.buildLensForColor(nearestLens, color);
            const newAngle = Physics.calculateRefractedAngle(rayAngle, nearest.y, calcLens);

            rayX = nearest.x;
            rayY = nearest.y;
            rayAngle = newAngle;
            lastLensId = nearestLens.id;
            hitLenses.push(nearestLens);

            if (!color && isIncident) {
                ctx.strokeStyle = CONFIG.COLORS.REFRACTED_RAY;
                isIncident = false;
            }

            ctx.beginPath();
            ctx.moveTo(rayX, rayY);
        }

        this.extendToCanvasEdge(ctx, rayX, rayY, rayAngle);

        return { hitLenses };
    }

    // ========================= 焦点标记 =========================

    /**
     * 画布左下角图例：焦点 F、边缘光线会聚点、虚焦点的含义
     */
    drawMarkerLegend() {
        const ctx = this.ctx;
        const items = [];

        const hasConverging = this.lenses.some(l =>
            l.type === CONFIG.LENS_TYPES.CONVEX || l.type === CONFIG.LENS_TYPES.ASPHERIC);
        const hasSpherical = this.lenses.some(l => l.type === CONFIG.LENS_TYPES.CONVEX);
        const hasDiverging = this.lenses.some(l => l.type === CONFIG.LENS_TYPES.CONCAVE);

        if (this.showDispersion && this.lenses.some(l => l.dispersion > 0.05)) {
            items.push({ color: '#27AE60', text: '三色焦点：色散（蓝<绿<红）' });
        } else if (hasConverging) {
            items.push({ color: CONFIG.COLORS.FOCAL_POINT, text: 'F：近轴焦点（中心光线会聚处）' });
        }
        if (hasSpherical && !(this.showDispersion && this.lenses.some(l => l.dispersion > 0.05))) {
            items.push({ color: '#E67E22', text: '边缘光线会聚点（球差，比 F 更靠近透镜）' });
        }
        if (hasDiverging) {
            items.push({ color: CONFIG.COLORS.FOCAL_POINT, text: '空心圆：凹透镜虚焦点', hollow: true });
        }

        if (items.length === 0) return;

        ctx.save();
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const pad = 8;
        const lineH = 16;
        const boxW = Math.max(...items.map(it => ctx.measureText(it.text).width)) + 36;
        const boxH = items.length * lineH + pad;
        const x0 = 8;
        const y0 = this.height - boxH - 8;

        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        ctx.strokeStyle = CONFIG.COLORS.GRID;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(x0, y0, boxW, boxH);
        ctx.fill();
        ctx.stroke();

        items.forEach((it, i) => {
            const cy = y0 + pad / 2 + i * lineH + lineH / 2;
            ctx.beginPath();
            ctx.arc(x0 + 14, cy, it.hollow ? 4.5 : 4.5, 0, Math.PI * 2);
            if (it.hollow) {
                ctx.strokeStyle = it.color;
                ctx.lineWidth = 1.5;
                ctx.stroke();
            } else {
                ctx.fillStyle = it.color;
                ctx.fill();
            }
            ctx.fillStyle = CONFIG.COLORS.OPTICAL_AXIS;
            ctx.fillText(it.text, x0 + 26, cy);
        });

        ctx.restore();
    }

    drawLabels() {
        const ctx = this.ctx;

        this.lenses.forEach(lens => {
            if (lens.type === CONFIG.LENS_TYPES.PLANO) return;

            const useDispersion =
                this.showDispersion &&
                lens.dispersion > 0.05 &&
                this.hitRayCount > 0;

            if (useDispersion) {
                // 色散模式：红/绿/蓝三色各自的近轴焦点（按各自波长的折射率计算）
                ['red', 'green', 'blue'].forEach(color => {
                    const nColor = Physics.calculateDispersionIndex(
                        lens.refractiveIndex, lens.dispersion, color
                    );
                    const f = Physics.calculateFocalLength(nColor, lens.curvature, lens.type);
                    this.drawFocalMarker(lens, f, CONFIG.COLORS[`RAY_${color.toUpperCase()}`], '', false);
                });
                return;
            }

            const f = lens.getFocalLength();
            if (!isFinite(f)) return;

            if (f < 0) {
                // 凹透镜：虚焦点（空心圆，标记在透镜左侧）
                this.drawFocalMarker(lens, f, CONFIG.COLORS.FOCAL_POINT, 'F', true);
                return;
            }

            // 凸透镜 / 非球面透镜：近轴焦点（与中心光线的实际会聚点一致）
            this.drawFocalMarker(lens, f, CONFIG.COLORS.FOCAL_POINT, 'F', false);

            // 球面凸透镜：额外用小橙点标出边缘光线的会聚位置，直观呈现球差
            if (lens.type === CONFIG.LENS_TYPES.CONVEX) {
                const fMarginal = lens.getMarginalFocalLength();
                this.drawFocalMarker(
                    lens, fMarginal, '#E67E22', '', false,
                    CONFIG.RENDER.MARGINAL_POINT_RADIUS
                );
            }
        });

        ctx.fillStyle = CONFIG.COLORS.OPTICAL_AXIS;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('光轴', 10, this.height / 2 - 8);

        this.drawMarkerLegend();
    }

    /**
     * 在透镜光轴上绘制焦点标记
     * @param {Lens} lens
     * @param {number} f 带符号焦距（px）
     * @param {string} color 标记颜色
     * @param {string} label 文字（F / F′）
     * @param {boolean} hollow 是否为虚焦点（空心）
     * @param {number} [radius]
     */
    drawFocalMarker(lens, f, color, label, hollow, radius = CONFIG.RENDER.FOCAL_POINT_RADIUS) {
        const ctx = this.ctx;
        const focalX = lens.x + f;
        const focalY = lens.y;

        if (focalX < -20 || focalX > this.width + 20) return;

        ctx.save();
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(focalX, focalY, radius, 0, Math.PI * 2);
        if (hollow) {
            ctx.stroke();
        } else {
            ctx.fill();
        }
        ctx.restore();

        if (label) {
            ctx.fillStyle = color;
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(label, focalX, focalY - 12);
        }
    }

    // ========================= 未命中提示 =========================

    /**
     * 光线没有穿过镜片时，在画布上说明原因；正常时隐藏提示
     */
    updateNotice() {
        const notice = document.getElementById('canvas-notice');
        if (!notice) return;

        if (!this.isRunning) {
            notice.classList.add('hidden');
            return;
        }

        if (this.lenses.length === 0) {
            this.showNotice(
                '画布上还没有透镜：从左侧素材库拖一个透镜到光路中，再观察光线。',
                false
            );
            return;
        }

        if (this.hitRayCount > 0) {
            notice.classList.add('hidden');
            return;
        }

        // 所有光线都未穿过任何镜片 —— 逐镜片分析原因，取最主要的一个
        const rays = this.generateRays();
        const reasons = this.lenses.map(lens => {
            const counts = { outside: 0, away: 0, vertical: 0, tooClose: 0 };
            rays.forEach(ray => {
                const r = Physics.calculateRayLensIntersection(ray.x, ray.y, ray.angle, lens);
                if (!r.hit) counts[r.reason]++;
            });
            return { lens, counts };
        });

        const pick = (c) => c.outside >= c.away && c.outside >= c.vertical ? 'outside'
            : c.away >= c.vertical ? 'away' : 'vertical';

        // 多镜片时，优先展示被光线「朝向但落在口径外」的那一片
        let target = reasons.find(r => r.counts.outside > 0) || reasons[0];
        const reason = pick(target.counts);

        const messages = {
            outside: `光线没有穿过「${target.lens.getTypeName()}」：光线到达镜片所在位置时落在了镜片口径之外。可把镜片拖到光路中间，或调大镜片尺寸。`,
            away: `光线没有穿过「${target.lens.getTypeName()}」：镜片位于光源后方、光线传播方向的反侧。请把镜片移到光源前方的光路中。`,
            vertical: `光线几乎沿竖直方向传播，无法到达竖直放置的镜片。请把入射角调回接近 0°，或移动镜片位置。`,
            tooClose: `镜片距离光线出发点太近（不足 5px），无法判定折射。请把镜片向右移动后重试。`
        };

        this.showNotice(messages[reason] || messages.outside, true);
    }

    showNotice(text, showRetry) {
        const notice = document.getElementById('canvas-notice');
        if (!notice) return;
        const textEl = document.getElementById('canvas-notice-text');
        const retryBtn = document.getElementById('btn-ray-retry');
        if (textEl) textEl.textContent = text;
        if (retryBtn) retryBtn.classList.toggle('hidden', !showRetry);
        notice.classList.remove('hidden');
    }

    getLensAtPoint(x, y) {
        for (let i = this.lenses.length - 1; i >= 0; i--) {
            if (this.lenses[i].containsPoint(x, y)) {
                return this.lenses[i];
            }
        }
        return null;
    }
}
