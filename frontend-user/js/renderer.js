/**
 * 光路渲染器
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

        if (this.isRunning) {
            this.drawLightRays();
        } else {
            // 光路未启动时不显示状态告警
            this.updateRayStatus(null);
        }

        this.drawLenses();

        if (this.showLabels && this.isRunning) {
            this.drawLabels();
        }
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

    /**
     * 生成当前光源设置下的初始光线
     */
    generateSourceRays() {
        if (this.lightMode === CONFIG.LIGHT_MODES.PARALLEL) {
            return Physics.generateParallelRays(this.height, this.rayCount, this.incidentAngle);
        }
        return Physics.generatePointSourceRays(50, this.height / 2, this.rayCount);
    }

    drawLightRays() {
        const rays = this.generateSourceRays();

        // 只要画布上有可色散材料，三色光就分别按各自波长的折射率计算
        const hasDispersiveLens = this.lenses.some(l =>
            l.type !== CONFIG.LENS_TYPES.PLANO && l.dispersion > 0.05
        );
        const colors = (this.showDispersion && hasDispersiveLens)
            ? ['red', 'green', 'blue']
            : [null];

        colors.forEach(color => {
            rays.forEach(ray => this.drawRayPath(this.traceRayPath(ray, color), color));
        });

        // 色散模式按绿光（中间波段）评估光路状态，避免红/蓝光天然色差被误报
        this.updateRayStatus(this.analyzeRaySet(rays, colors.length > 1 ? 'green' : null));
    }

    /**
     * 计算一条光线穿过全部透镜后的折线路径（不绘制）
     *
     * 路径上的每个顶点都记录“从该点出发后的斜率”；
     * 色散时使用该颜色波长下的折射率重新计算偏折。
     *
     * @returns {Array<{x:number, y:number, slope:number}>}
     */
    traceRayPath(ray, color = null) {
        let rayX = ray.x;
        let rayY = ray.y;
        let rayAngle = ray.angle;
        let lastLensId = null;

        const path = [{ x: rayX, y: rayY, slope: Math.tan(rayAngle) }];

        for (let i = 0; i < 20; i++) {
            let nearest = null;
            let nearestLens = null;
            let minDist = Infinity;

            for (const lens of this.lenses) {
                if (lens.id === lastLensId) continue;

                const hit = Physics.calculateRayLensIntersection(rayX, rayY, rayAngle, lens);
                if (hit && hit.distance < minDist) {
                    minDist = hit.distance;
                    nearest = hit;
                    nearestLens = lens;
                }
            }

            if (!nearest) break;

            const n = color
                ? Physics.calculateDispersionIndex(nearestLens.refractiveIndex, nearestLens.dispersion, color)
                : undefined;
            const outSlope = Physics.calculateOutgoingSlope(Math.tan(rayAngle), nearest.y, nearestLens, n);

            rayX = nearest.x;
            rayY = nearest.y;
            rayAngle = Math.atan(outSlope);
            lastLensId = nearestLens.id;

            path.push({ x: rayX, y: rayY, slope: outSlope });
        }

        // 末段延伸到画布边缘
        const last = path[path.length - 1];
        const dirX = Math.cos(rayAngle);
        const dirY = Math.sin(rayAngle);
        let endX, endY;

        if (Math.abs(dirX) > 0.001) {
            endX = dirX > 0 ? this.width + 50 : -50;
            endY = last.y + dirY * (endX - last.x) / dirX;
        } else {
            endX = last.x;
            endY = dirY > 0 ? this.height + 50 : -50;
        }
        path.push({ x: endX, y: endY, slope: last.slope });

        return path;
    }

    /**
     * 按折线路径绘制光线：第一段入射光红色，穿过透镜后为折射光（或对应波长颜色）
     */
    drawRayPath(path, color = null) {
        const ctx = this.ctx;
        ctx.lineWidth = CONFIG.RENDER.RAY_WIDTH;
        ctx.lineJoin = 'round';

        for (let i = 0; i < path.length - 1; i++) {
            ctx.beginPath();
            if (color) {
                ctx.strokeStyle = CONFIG.COLORS[`RAY_${color.toUpperCase()}`];
            } else {
                ctx.strokeStyle = i === 0 ? CONFIG.COLORS.INCIDENT_RAY : CONFIG.COLORS.REFRACTED_RAY;
            }
            ctx.moveTo(path[i].x, path[i].y);
            ctx.lineTo(path[i + 1].x, path[i + 1].y);
            ctx.stroke();
        }
    }

    /**
     * 分析整组光线：穿过透镜的数量、未穿过原因、会聚/发散与球差
     *
     * @returns {object} 分析结果（total/hitCount/missReasons/edgeShift/converging/...）
     */
    analyzeRaySet(rays, color = null) {
        // 光线从左侧进入后遇到的第一块透镜（x 最小）
        const firstLens = this.lenses.length > 0
            ? this.lenses.reduce((a, b) => (a.x <= b.x ? a : b))
            : null;

        const result = {
            total: rays.length,
            hitCount: 0,
            missCount: 0,
            missReasons: [],
            crossingXs: [],
            focusSpread: null,
            converging: false,
            diverging: false,
            edgeShift: 0,
            firstLens
        };

        const addMiss = (reason, lens) => {
            let entry = result.missReasons.find(r => r.reason === reason && r.lens === lens);
            if (!entry) {
                entry = { reason, lens, count: 0 };
                result.missReasons.push(entry);
            }
            entry.count++;
        };

        // 没有透镜时，不做逐条原因判定
        if (!firstLens) {
            result.missCount = rays.length;
            result.missReasons.push({ reason: 'noLens', lens: null, count: rays.length });
            return result;
        }

        const halfHeight = firstLens.getHeight() / 2;

        rays.forEach(ray => {
            // 薄透镜平面近似：计算光线到达第一块透镜 x 处时的 y
            const dx = firstLens.x - ray.x;
            const dirX = Math.cos(ray.angle);
            const arriveY = ray.y + dx * Math.tan(ray.angle);

            if (Math.abs(dirX) < 0.001 || dx * dirX < 0) {
                result.missCount++;
                addMiss('away', firstLens);
                return;
            }
            if (Math.abs(dx) < 5) {
                result.missCount++;
                addMiss('tooClose', firstLens);
                return;
            }
            if (arriveY < firstLens.y - halfHeight || arriveY > firstLens.y + halfHeight) {
                result.missCount++;
                addMiss('outside', firstLens);
                return;
            }

            result.hitCount++;

            // 找“出透镜后第一次与光轴相交”的 x（仅会聚透镜）
            if (firstLens.type === CONFIG.LENS_TYPES.CONVEX ||
                firstLens.type === CONFIG.LENS_TYPES.ASPHERIC) {
                const path = this.traceRayPath(ray, color);
                for (let i = 1; i < path.length - 1; i++) {
                    const a = path[i];
                    const b = path[i + 1];
                    if ((a.y - firstLens.y) * (b.y - firstLens.y) < 0) {
                        const t = (firstLens.y - a.y) / (b.y - a.y);
                        result.crossingXs.push(a.x + t * (b.x - a.x));
                        break;
                    }
                }
            }
        });

        // 会聚 / 发散判定：比较光线起点与画布末端的总散开宽度
        if (result.hitCount > 1) {
            const ends = rays.map(ray => {
                const path = this.traceRayPath(ray, color);
                return path[path.length - 1];
            });
            const spreadStart = Math.max(...rays.map(r => r.y)) - Math.min(...rays.map(r => r.y));
            const spreadEnd = Math.max(...ends.map(p => p.y)) - Math.min(...ends.map(p => p.y));
            result.converging = spreadEnd < spreadStart * 0.95;
            result.diverging = spreadEnd > spreadStart * 1.05;
        }

        // 球差：以近轴焦点 F（lens.x + f）为基准，测量各光线实际交点的最大偏离
        // 注意：正好沿光轴的光线不偏折、贴在轴上，不产生独立交点，因此用理论 F 作基准
        if (result.crossingXs.length >= 1 &&
            (firstLens.type === CONFIG.LENS_TYPES.CONVEX ||
             firstLens.type === CONFIG.LENS_TYPES.ASPHERIC)) {
            const f = Math.abs(firstLens.getFocalLengthForColor(color));
            const paraxialFocusX = firstLens.x + f;
            result.paraxialFocusX = paraxialFocusX;
            result.focusSpread = Math.max(...result.crossingXs.map(x => Math.abs(x - paraxialFocusX)));
            if (f > 0) {
                result.edgeShift = result.focusSpread / f;
            }
        }

        return result;
    }

    /**
     * 在当前光源设置下分析光路（供测验、面板状态使用）
     */
    analyzeCurrentLight(color = null) {
        return this.analyzeRaySet(this.generateSourceRays(), color);
    }

    /**
     * 更新画布上的“光线未穿过透镜”状态条，analysis 为 null 时隐藏
     */
    updateRayStatus(analysis) {
        const el = document.getElementById('ray-status');
        if (!el) return;
        const msgEl = document.getElementById('ray-status-message');

        if (!analysis || analysis.hitCount > 0 || !this.isRunning) {
            el.classList.add('hidden');
            if (msgEl) msgEl.textContent = '';
            return;
        }

        const lensName = analysis.firstLens ? analysis.firstLens.getTypeName() : '';
        const reasonCount = (key) =>
            (analysis.missReasons.find(r => r.reason === key) || {}).count || 0;

        let message = '';
        if (reasonCount('noLens')) {
            message = '画布上还没有透镜：从左侧素材库拖一个透镜到画布，再观察光路。';
        } else if (reasonCount('outside')) {
            message = `光线没有穿过${lensName}：光线到达镜片位置时落在了镜片孔径之外。请把透镜移到光路范围内后重试。`;
        } else if (reasonCount('tooClose')) {
            message = `透镜离光源太近（不足 5px），薄透镜模型无法计算折射。请把${lensName}向右移开一些后重试。`;
        } else if (reasonCount('away')) {
            message = `光线没有朝向${lensName}传播。请调整光源方向，或把透镜移到光路上后重试。`;
        } else {
            message = `光线没有穿过${lensName}，请调整透镜位置后重试。`;
        }

        if (msgEl) msgEl.textContent = message;
        el.classList.remove('hidden');
    }

    drawLabels() {
        const ctx = this.ctx;

        this.lenses.forEach(lens => {
            if (lens.type === CONFIG.LENS_TYPES.PLANO) return;

            // 色散模式：红/绿/蓝各自焦距不同，焦点标记也按波长分别画
            const hasDispersion = this.showDispersion && lens.dispersion > 0.05;
            const colors = hasDispersion ? ['red', 'green', 'blue'] : [null];

            colors.forEach(color => {
                const focalLength = lens.getFocalLengthForColor(color);
                // 凹透镜是虚焦点（f<0），不画实焦点标记
                if (!isFinite(focalLength) || focalLength <= 0) return;

                const focalX = lens.x + focalLength;
                if (focalX <= 0 || focalX >= this.width) return;

                ctx.fillStyle = color
                    ? CONFIG.COLORS[`RAY_${color.toUpperCase()}`]
                    : CONFIG.COLORS.FOCAL_POINT;
                ctx.beginPath();
                ctx.arc(focalX, lens.y, CONFIG.RENDER.FOCAL_POINT_RADIUS, 0, Math.PI * 2);
                ctx.fill();

                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('F', focalX, lens.y - 12);
            });
        });

        ctx.fillStyle = CONFIG.COLORS.OPTICAL_AXIS;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('光轴', 10, this.height / 2 - 8);
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
