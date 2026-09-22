/**
 * 透镜类
 */
class Lens {
    constructor(options = {}) {
        this.id = options.id || Utils.generateId();
        this.type = options.type || CONFIG.LENS_TYPES.CONVEX;
        this.x = options.x || 0;
        this.y = options.y || 0;
        this.refractiveIndex = options.refractiveIndex || CONFIG.LENS_DEFAULTS.refractiveIndex;
        this.size = options.size || CONFIG.LENS_DEFAULTS.size;
        this.curvature = options.curvature || CONFIG.LENS_DEFAULTS.curvature;
        this.material = options.material || CONFIG.LENS_DEFAULTS.material;
        this.selected = false;

        // 记录是否显式指定了折射率（指定时不被材料默认值覆盖，
        // 保证从 localStorage 恢复自定义参数后与刷新前一致）
        this.customIndex = options.refractiveIndex != null;

        // 根据材料设置色散系数；新材料同时更新为该材料的默认折射率
        this.applyMaterial(this.material, !this.customIndex);
    }

    /**
     * 应用材料预设
     * @param {string} materialId 材料 id
     * @param {boolean} [applyIndex=true] 是否同时采用材料的默认折射率
     */
    applyMaterial(materialId, applyIndex = true) {
        const materials = CONFIG.MATERIALS;
        let material;

        switch (materialId) {
            case 'highIndex':
                material = materials.HIGH_INDEX;
                break;
            case 'lowDispersion':
                material = materials.LOW_DISPERSION;
                break;
            default:
                material = materials.NORMAL;
        }

        this.material = materialId;
        this.dispersion = material.dispersion;

        // 切换材料时采用新材料的默认折射率；构造时若显式给了折射率则保留
        if (applyIndex) {
            this.refractiveIndex = material.refractiveIndex;
        }
        this.customIndex = !applyIndex;
    }
    
    /**
     * 获取透镜高度
     */
    getHeight() {
        return 80 * (this.size / 100);
    }
    
    /**
     * 获取透镜宽度
     */
    getWidth() {
        const baseWidth = this.type === CONFIG.LENS_TYPES.PLANO ? 8 : 30;
        return baseWidth * (this.size / 100) * (this.curvature / 50);
    }
    
    /**
     * 获取近轴焦距（px）
     * 与 Physics.calculateRefractedAngle 的近轴偏折严格对应：
     * 水平平行光在距透镜 f 处与光轴相交，焦点标记即实际会聚位置。
     * 凸透镜为正，凹透镜为负（虚焦点），平面透镜为 Infinity
     */
    getFocalLength() {
        return Physics.calculateFocalLength(
            this.refractiveIndex,
            this.curvature,
            this.type
        );
    }

    /**
     * 获取球面凸透镜边缘光线的实际焦距（px）
     * 球差使边缘光线偏折过度，会聚在近轴焦点之前
     */
    getMarginalFocalLength() {
        if (this.type !== CONFIG.LENS_TYPES.CONVEX) {
            return this.getFocalLength();
        }
        const paraxialF = this.getFocalLength();
        const sa = 1 + Physics.getSphericalAberrationCoeff(this.curvature);
        return paraxialF / sa;
    }
    
    /**
     * 检测点是否在透镜内
     */
    containsPoint(px, py) {
        const halfWidth = this.getWidth() / 2 + 10; // 增加点击区域
        const halfHeight = this.getHeight() / 2 + 10;
        
        return px >= this.x - halfWidth && 
               px <= this.x + halfWidth &&
               py >= this.y - halfHeight && 
               py <= this.y + halfHeight;
    }
    
    /**
     * 获取透镜类型名称
     */
    getTypeName() {
        const names = {
            [CONFIG.LENS_TYPES.CONVEX]: '凸透镜',
            [CONFIG.LENS_TYPES.CONCAVE]: '凹透镜',
            [CONFIG.LENS_TYPES.PLANO]: '平面透镜',
            [CONFIG.LENS_TYPES.ASPHERIC]: '非球面透镜'
        };
        return names[this.type] || '透镜';
    }
    
    /**
     * 获取材料名称
     */
    getMaterialName() {
        const names = {
            normal: '普通玻璃',
            highIndex: '高折射率镜片',
            lowDispersion: '低色散镜片'
        };
        return names[this.material] || '普通玻璃';
    }
    
    /**
     * 重置为默认参数
     */
    reset() {
        this.refractiveIndex = CONFIG.LENS_DEFAULTS.refractiveIndex;
        this.size = CONFIG.LENS_DEFAULTS.size;
        this.curvature = CONFIG.LENS_DEFAULTS.curvature;
        this.material = CONFIG.LENS_DEFAULTS.material;
        this.dispersion = CONFIG.MATERIALS.NORMAL.dispersion;
        this.customIndex = false;
    }
    
    /**
     * 序列化为JSON
     */
    toJSON() {
        return {
            id: this.id,
            type: this.type,
            x: this.x,
            y: this.y,
            refractiveIndex: this.refractiveIndex,
            size: this.size,
            curvature: this.curvature,
            material: this.material
        };
    }
    
    /**
     * 从JSON创建透镜
     */
    static fromJSON(json) {
        return new Lens(json);
    }
}
