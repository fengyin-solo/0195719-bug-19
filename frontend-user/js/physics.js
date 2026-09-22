/**
 * 物理计算模块（薄透镜模型）
 *
 * 光路规律：
 * - 凸透镜：光线向光轴偏折（会聚），球面镜边缘光线偏折略强，存在球差
 * - 凹透镜：光线远离光轴偏折（发散）
 * - 平面透镜：不偏折
 * - 非球面透镜：边缘表面更平，补偿球面的过度偏折，不同高度的平行光会聚到同一焦点
 *
 * 统一计算方式：
 * - 用“出射斜率”而不是直接叠加角度：s_out = s_in + Δs，再用 atan 转回角度
 * - 近轴光线经过理想薄透镜：s_out = s_in - h/f（h 为光线相对光轴的高度，f 为焦距）
 * - 球面球差：边缘额外偏折，Δs 再乘 (1 + k·p²)，p = h/半孔径，k = 0.15
 *   于是边缘光线与光轴交点为 f/1.15，比近轴焦点近约 13%（球差：边缘提前会聚）
 * - 非球面取理想薄透镜式 Δs = -h/f：任意高度的平行光出射斜率都正好指向同一焦点
 *
 * 色散原理：
 * - 不同波长的光折射率不同（蓝光 > 绿光 > 红光），由柯西公式按波长计算 n(λ)
 * - 偏折和焦距都使用该波长下的折射率重新计算，所以蓝光焦距短、红光焦距长
 * - 阿贝数（Abbe number）描述色散程度，数值越大色散越小
 */
const Physics = {
    /**
     * 球面透镜的边缘球差系数
     * 边缘光线（p=1）比近轴光线多偏折 15%，对应边缘焦点近约 13%
     */
    SPHERICAL_ABERRATION_K: 0.15,

    /**
     * 计算透镜近轴焦距（像素）
     *
     * 双凸薄透镜（两面曲率半径相同）：1/f = 2(n-1)/R
     * 曲率滑块越大 -> R 越小 -> 透镜越凸 -> 焦距越短
     *
     * @param {number} refractiveIndex 折射率（该波长下）
     * @param {number} curvature 曲率 0-100
     * @param {number} height 透镜高度（像素）
     * @returns {number} 焦距（像素，凸透镜为正）
     */
    calculateFocalLength(refractiveIndex, curvature, height) {
        const curvatureRadius = height * (100 - curvature) / 50 + height * 0.5;
        return curvatureRadius / (2 * (refractiveIndex - 1));
    },

    /**
     * 计算光线与透镜平面的交点（薄透镜：用透镜中心处的竖直平面近似）
     *
     * @returns {{x:number, y:number, distance:number}|null} 交点；光线不朝向透镜、
     *   太靠近透镜或交点落在镜片孔径之外时返回 null
     */
    calculateRayLensIntersection(rayX, rayY, rayAngle, lens) {
        const lensX = lens.x;
        const lensY = lens.y;
        const halfHeight = lens.getHeight() / 2;

        const dirX = Math.cos(rayAngle);

        if (Math.abs(dirX) < 0.001) {
            return null;
        }

        const dx = lensX - rayX;

        // 光线必须朝向透镜
        if ((dx > 0 && dirX < 0) || (dx < 0 && dirX > 0)) {
            return null;
        }

        // 距离太近跳过（光源几乎贴在镜面上，薄透镜模型不适用）
        if (Math.abs(dx) < 5) {
            return null;
        }

        // y = rayY + dx·tan(θ)
        const intersectY = rayY + dx * Math.tan(rayAngle);

        // 检查是否在透镜孔径范围内
        if (intersectY < lensY - halfHeight || intersectY > lensY + halfHeight) {
            return null;
        }

        return {
            x: lensX,
            y: intersectY,
            distance: Math.abs(dx)
        };
    },

    /**
     * 计算薄透镜对光线施加的偏折（出射斜率的改变量）
     *
     * 核心公式（h = 光线相对光轴高度，f = 该波长下焦距）：
     * - 非球面：Δs = -h/f                （理想消球差，所有平行光交于同一焦点）
     * - 球面凸：Δs = -h/f·(1 + 0.15·p²)  （边缘额外偏折，存在球差）
     * - 凹透镜：Δs = +h/f                （发散）
     * - 平面：  Δs = 0
     *
     * @param {number} inSlope 入射斜率 tan(θ)
     * @param {number} hitY 光线与透镜交点的 y
     * @param {Lens} lens 透镜
     * @param {number} [n] 该波长下的折射率（色散时传入）
     * @returns {number} 出射斜率 tan(θ')
     */
    calculateOutgoingSlope(inSlope, hitY, lens, n) {
        const lensY = lens.y;
        const halfHeight = Math.max(lens.getHeight() / 2, 1);
        const refractiveIndex = (n === undefined ? lens.refractiveIndex : n);

        // 平面透镜不偏折
        if (lens.type === CONFIG.LENS_TYPES.PLANO) {
            return inSlope;
        }

        const h = hitY - lensY;
        const focalLength = this.calculateFocalLength(
            refractiveIndex,
            lens.curvature,
            halfHeight * 2
        );
        const power = 1 / focalLength; // 薄透镜光焦度（斜率/像素）
        const p = h / halfHeight;      // 归一化高度 -1 ~ 1

        let deltaSlope;
        switch (lens.type) {
            case CONFIG.LENS_TYPES.ASPHERIC:
                // 非球面：边缘曲率更平，正好抵消球面会多出的那部分偏折
                // 平行入射时 s_out = -h/f，任意高度的光线都指向距离 f 的同一点
                deltaSlope = -h * power;
                break;

            case CONFIG.LENS_TYPES.CONCAVE:
                // 凹透镜：使光线远离光轴
                deltaSlope = h * power;
                break;

            case CONFIG.LENS_TYPES.CONVEX:
            default:
                // 球面凸透镜：近轴部分按 -h/f，边缘再多偏折 k·p²
                const aberration = 1 + this.SPHERICAL_ABERRATION_K * p * p;
                deltaSlope = -h * power * aberration;
                break;
        }

        return inSlope + deltaSlope;
    },

    /**
     * 计算折射后的光线角度
     *
     * 先在斜率空间施加薄透镜偏折，再用 atan 转回角度，
     * 保证“出射光线指向的焦点”与 calculateFocalLength 完全一致。
     */
    calculateRefractedAngle(rayAngle, rayY, lens, n) {
        const outSlope = this.calculateOutgoingSlope(Math.tan(rayAngle), rayY, lens, n);
        return Math.atan(outSlope);
    },

    /**
     * 球面透镜某高度处的焦点相对近轴焦点的前移比例（球差）
     * @returns {number} 0 表示无球差；约 0.13 表示边缘焦点近 13%
     */
    getSphericalFocusShift(relativePos) {
        const k = this.SPHERICAL_ABERRATION_K * relativePos * relativePos;
        return k / (1 + k);
    },

    /**
     * 计算色散效果
     *
     * 柯西公式（教学简化）：n(λ) = n_d + B·(1/λ² − 1/λ_d²)
     * - B 与材料色散系数成正比；为便于课堂观察，色散差异做了适度放大
     * - 蓝光（短波长）折射率最大，红光最小
     *
     * 波长参考（nm）：红光 C线 656.3 / 绿光 d线 587.6 / 蓝光 F线 486.1
     *
     * @param {number} baseIndex 基准折射率（绿光 d 线）
     * @param {number} dispersion 色散系数（0-1，越大色散越明显）
     * @param {string} color 'red' | 'green' | 'blue'
     * @returns {number} 该颜色光的折射率
     */
    calculateDispersionIndex(baseIndex, dispersion, color) {
        const wavelengths = {
            red: 656.3,    // C线
            green: 587.6,  // d线（基准）
            blue: 486.1    // F线
        };

        const lambda = wavelengths[color] || wavelengths.green;
        const lambda0 = wavelengths.green;

        const B = dispersion * 20000; // 柯西 B 系数（教学模型，色散差异适度放大）
        const deltaIndex = B * (1 / (lambda * lambda) - 1 / (lambda0 * lambda0));

        return baseIndex + deltaIndex;
    },

    /**
     * 计算阿贝数 Vd = (nd - 1) / (nF - nC)，数值越大色散越小
     */
    calculateAbbeNumber(baseIndex, dispersion) {
        if (dispersion <= 0) return Infinity;

        const nF = this.calculateDispersionIndex(baseIndex, dispersion, 'blue');
        const nC = this.calculateDispersionIndex(baseIndex, dispersion, 'red');

        return (baseIndex - 1) / (nF - nC);
    },

    /**
     * 生成平行光线（从画布左侧射入的准直光束）
     *
     * 光线围绕画布中央（光轴）均匀分布，光束宽度约为画布高度的 1/3：
     * 既保证居中的透镜能同时接收到中心与边缘光线（用于观察球差），
     * 透镜移出光束范围时也能明确看到“光线没有穿过镜片”。
     */
    generateParallelRays(canvasHeight, rayCount, angle) {
        const rays = [];
        const angleRad = Utils.degToRad(angle);
        const centerY = canvasHeight / 2;
        const bundleSpan = canvasHeight / 3;
        const spacing = bundleSpan / (rayCount + 1);

        for (let i = 1; i <= rayCount; i++) {
            const offset = (i - (rayCount + 1) / 2) * spacing;
            rays.push({ x: 0, y: centerY + offset, angle: angleRad });
        }
        return rays;
    },

    /**
     * 生成点光源光线
     */
    generatePointSourceRays(sourceX, sourceY, rayCount, spreadAngle = 60) {
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
