/**
 * 物理计算模块
 *
 * 统一采用「薄透镜近轴模型」，保证渲染的光线、焦点标记、测验判定三者一致：
 *
 *   光焦度 P = (n - 1) * curvature        （canvas 单位，1/px）
 *   近轴焦距 f = 1 / P
 *
 * 光线在透镜处改变的是【斜率 u = tan θ】（薄透镜传输矩阵的精确形式）：
 *   凸透镜：u' = u - P * h        （h 为光线到光轴的距离）
 *   凹透镜：u' = u + P * h
 *   平  面：u' = u
 *
 * 于是任意高度 h 的水平平行光经过凸透镜后斜率都是 −P·h，都会在
 * (x + f, 光轴) 处与光轴相交：传播距离 d = h / (P·h) = 1/P = f，
 * 与 h 无关 —— 这就是近轴焦点。
 *
 * 球差（spherical aberration）：
 * - 真实球面透镜边缘光线偏折过度，会在近轴焦点之前与光轴相交。
 * - 非球面透镜通过改变表面曲率（边缘更平缓）补偿掉这部分额外偏折，
 *   使边缘光线同样穿过近轴焦点。
 *
 * 色散原理：
 * - 柯西公式 n(λ) = A + B/λ²：蓝光折射率最大、红光最小。
 * - 每种颜色独立计算折射率、焦距与偏折，因此各自精准汇聚到自己的焦点。
 * - 阿贝数越大（低色散/ED 玻璃），三色焦点越接近。
 */
const Physics = {
    /**
     * 光焦度换算系数：
     * 曲率滑块（10-90）映射到近轴光焦度 P = k * (n-1) * (curvature/100)
     * 取 k = 0.02 时，默认参数（n=1.5, curvature=50）焦距约 200px，
     * 常用参数下焦距落在画布可视范围内（测验要求 50-300px 也可达到）。
     */
    POWER_FACTOR: 0.02,

    /**
     * 计算薄透镜近轴光焦度 P（1/px）
     * @param {number} refractiveIndex 折射率（d 线或指定波长）
     * @param {number} curvature 曲率 10-90
     * @returns {number} 光焦度，凸透镜为正、凹透镜为负
     */
    calculatePower(refractiveIndex, curvature) {
        return this.POWER_FACTOR * (refractiveIndex - 1) * (curvature / 100);
    },

    /**
     * 计算透镜焦距（px）
     * 凸透镜返回正值，凹透镜返回负值（虚焦点），平面透镜返回 Infinity
     */
    calculateFocalLength(refractiveIndex, curvature, type) {
        if (type === CONFIG.LENS_TYPES.PLANO) return Infinity;

        const power = this.calculatePower(refractiveIndex, curvature);
        const f = 1 / power;
        return type === CONFIG.LENS_TYPES.CONCAVE ? -f : f;
    },

    /**
     * 计算光线与透镜所在竖直平面的交点（薄透镜近似）
     *
     * @returns {{hit:true,x:number,y:number,distance:number}
     *           |{hit:false,reason:'vertical'|'away'|'tooClose'|'outside'}}
     *   - vertical: 光线几乎竖直，无法到达透镜所在竖直线
     *   - away:     光线传播方向背离透镜（透镜在光线后方）
     *   - tooClose: 交点距当前位置不足 5px，避免在同一透镜上反复折射
     *   - outside:  光线到达透镜竖直线时落在镜片口径之外（没有穿过镜片）
     */
    calculateRayLensIntersection(rayX, rayY, rayAngle, lens) {
        const lensX = lens.x;
        const lensY = lens.y;
        const halfHeight = lens.getHeight() / 2;

        const dirX = Math.cos(rayAngle);

        if (Math.abs(dirX) < 0.001) {
            return { hit: false, reason: 'vertical' };
        }

        const dx = lensX - rayX;

        // 光线必须朝透镜方向传播
        if ((dx > 0 && dirX < 0) || (dx < 0 && dirX > 0)) {
            return { hit: false, reason: 'away' };
        }

        if (Math.abs(dx) < 5) {
            return { hit: false, reason: 'tooClose' };
        }

        const t = dx / dirX;
        const intersectY = rayY + t * Math.sin(rayAngle);

        if (intersectY < lensY - halfHeight || intersectY > lensY + halfHeight) {
            return { hit: false, reason: 'outside' };
        }

        return {
            hit: true,
            x: lensX,
            y: intersectY,
            distance: Math.abs(dx)
        };
    },

    /**
     * 球面透镜的球差相对量（边缘光线相对额外偏折比例）
     *
     * 真实球面透镜的纵向球差约随口径四次方增长：
     *   边缘光线偏折量 = 近轴偏折量 × (1 + SA · ρ⁴)
     * 曲率越大、镜片越弯，球差越明显。
     *
     * @param {number} curvature 曲率 10-90
     * @returns {number} 边缘处的额外偏折比例（约 0.10 ~ 0.27）
     */
    getSphericalAberrationCoeff(curvature) {
        // curvature 50 → 0.15；90 → 0.27；10 → 0.03
        return 0.03 + 0.24 * (curvature / 100);
    },

    /**
     * 球面透镜在给定相对高度处的球差放大系数（>1：边缘偏折过度）
     * @param {number} relativePos 相对光轴位置 -1 到 1
     * @param {number} curvature 曲率 10-90
     */
    calculateSphericalAberration(relativePos, curvature) {
        const rho2 = relativePos * relativePos;
        return 1 + this.getSphericalAberrationCoeff(curvature) * rho2 * rho2;
    },

    /**
     * 计算折射后的光线角度
     *
     * 采用薄透镜的【斜率传递】（光线传输矩阵 ABCD 的精确形式）：
     *   u = tan θ；  u' = u − P·h（凸）/ u' = u + P·h（凹）/ u' = u（平）
     * 相比直接叠加小角度，用斜率传递对任意入射角都成立：
     * 水平平行光（u=0）出射斜率恰为 −h/f，所有高度的光线严格在
     * 距透镜 f 处与光轴相交 —— 非球面因此能做到「精准共点」。
     *
     * @param {number} rayAngle 入射光线角度（弧度）
     * @param {number} rayY 交点 Y（canvas 坐标）
     * @param {object} lens 透镜（含 refractiveIndex / curvature / type / y）
     * @returns {number} 折射后光线角度（弧度）
     */
    calculateRefractedAngle(rayAngle, rayY, lens) {
        const halfHeight = lens.getHeight() / 2;
        const heightFromAxis = rayY - lens.y;      // 到光轴的像素距离 h
        // 限制在口径范围内，避免数值外推
        const relativePos = Math.max(-1, Math.min(1, heightFromAxis / halfHeight));

        const n = lens.refractiveIndex;
        const power = this.calculatePower(n, lens.curvature);

        const slopeIn = Math.tan(rayAngle);
        let slopeOut = slopeIn;

        switch (lens.type) {
            case CONFIG.LENS_TYPES.CONVEX: {
                // 球面凸透镜：向光轴偏折，边缘光线偏折过度 → 正球差
                const sa = this.calculateSphericalAberration(relativePos, lens.curvature);
                slopeOut = slopeIn - power * heightFromAxis * sa;
                break;
            }

            case CONFIG.LENS_TYPES.ASPHERIC: {
                // 非球面凸透镜：球面边缘多出的 ρ⁴ 项被非球面形状恰好抵消，
                // 出射斜率严格等于近轴值 −h/f → 所有光线穿过同一焦点
                slopeOut = slopeIn - power * heightFromAxis;
                break;
            }

            case CONFIG.LENS_TYPES.CONCAVE: {
                // 凹透镜：远离光轴偏折（发散），反向延长线交于虚焦点
                slopeOut = slopeIn + power * heightFromAxis;
                break;
            }

            case CONFIG.LENS_TYPES.PLANO:
            default:
                // 平面透镜：方向不变（垂直入射时连侧移都没有）
                slopeOut = slopeIn;
                break;
        }

        return Math.atan(slopeOut);
    },

    /**
     * 色散：按波长计算折射率（简化柯西公式 n(λ) = n_d + B(1/λ² - 1/λ_d²)）
     *
     * 波长参考（夫琅禾费谱线）：
     * - 红光 C 线: 656.3nm
     * - 绿光 d 线: 587.6nm（基准）
     * - 蓝光 F 线: 486.1nm
     *
     * 教学演示对色散差异做了适度放大（真实玻璃 Δn 约 0.01 量级），
     * 保证三色光焦点分离在画布上可观察；材料间相对强弱保持真实关系。
     *
     * @param {number} baseIndex d 线折射率
     * @param {number} dispersion 色散系数 0-1（普通玻璃大，ED 玻璃小）
     * @param {string} color 'red' | 'green' | 'blue'
     * @returns {number} 该颜色光的折射率
     */
    calculateDispersionIndex(baseIndex, dispersion, color) {
        const wavelengths = {
            red: 656.3,
            green: 587.6,
            blue: 486.1
        };

        const lambda = wavelengths[color] || wavelengths.green;
        const lambdaD = wavelengths.green;

        // B 与材料色散系数成正比：dispersion=0.4 时 B = 20000 nm²
        const B = dispersion * 50000;

        return baseIndex + B * (1 / (lambda * lambda) - 1 / (lambdaD * lambdaD));
    },

    /**
     * 计算阿贝数 Vd = (n_d - 1) / (n_F - n_C)
     * 阿贝数越大，色散越小（普通玻璃 30-60，ED 玻璃 80+）
     */
    calculateAbbeNumber(baseIndex, dispersion) {
        if (dispersion <= 0) return Infinity;

        const nF = this.calculateDispersionIndex(baseIndex, dispersion, 'blue');
        const nC = this.calculateDispersionIndex(baseIndex, dispersion, 'red');
        const spread = nF - nC;
        if (spread <= 0) return Infinity;

        return (baseIndex - 1) / spread;
    },

    /**
     * 生成平行光线（无透镜时的回退生成方式）
     *
     * 光线均匀分布在画布中部 70% 高度内。画布上已有透镜时，
     * Renderer.generateRays 会改为以最左侧透镜口径为目标生成光束，
     * 保证中心与边缘光线都能穿过镜片。
     */
    generateParallelRays(canvasHeight, rayCount, angle) {
        const rays = [];
        const angleRad = Utils.degToRad(angle);
        const usableHeight = canvasHeight * 0.7;
        const top = (canvasHeight - usableHeight) / 2;
        const spacing = usableHeight / (rayCount + 1);

        for (let i = 1; i <= rayCount; i++) {
            rays.push({ x: 0, y: top + spacing * i, angle: angleRad });
        }
        return rays;
    },

    /**
     * 生成点光源光线（从左侧一点呈扇形射出）
     */
    generatePointSourceRays(sourceX, sourceY, rayCount, spreadAngle = 50) {
        const rays = [];
        const halfSpread = Utils.degToRad(spreadAngle / 2);
        const step = rayCount > 1 ? (2 * halfSpread) / (rayCount - 1) : 0;

        for (let i = 0; i < rayCount; i++) {
            rays.push({
                x: sourceX,
                y: sourceY,
                angle: -halfSpread + step * i
            });
        }
        return rays;
    }
};
