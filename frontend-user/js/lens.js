/**
 * 透镜类
 */
class Lens {
    constructor(options = {}) {
        this.id = options.id || Utils.generateId();
        this.type = options.type || CONFIG.LENS_TYPES.CONVEX;
        this.x = options.x || 0;
        this.y = options.y || 0;
        this.size = options.size || CONFIG.LENS_DEFAULTS.size;
        this.curvature = options.curvature || CONFIG.LENS_DEFAULTS.curvature;
        this.material = options.material || CONFIG.LENS_DEFAULTS.material;
        this.selected = false;

        // 应用材料预设（设置色散与材料默认折射率）
        this.applyMaterial(this.material);

        // 显式指定的折射率优先（如滑块调整、刷新后恢复、特殊材料）
        if (options.refractiveIndex !== undefined) {
            this.refractiveIndex = options.refractiveIndex;
        }
    }

    /**
     * 应用材料预设
     * @param {string} materialId 材料ID
     * @param {boolean} [keepIndex=false] 是否保留当前折射率（切换材料时不重置）
     */
    applyMaterial(materialId, keepIndex = false) {
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

        // 切换材料时采用该材料的标准折射率；恢复存档时保留原值
        if (!keepIndex) {
            this.refractiveIndex = material.refractiveIndex;
        }
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
     * 获取焦距（绿光基准折射率）
     * 凹透镜返回负值（虚焦点），平面透镜返回 Infinity
     */
    getFocalLength() {
        return this.getFocalLengthForColor(null);
    }

    /**
     * 获取指定颜色光在该透镜中的焦距
     * 色散时不同颜色折射率不同，焦距也不同（蓝光更短、红光更长）
     *
     * @param {string|null} color 'red' | 'green' | 'blue' | null（基准）
     * @returns {number} 焦距（像素），凹透镜为负，平面为 Infinity
     */
    getFocalLengthForColor(color) {
        if (this.type === CONFIG.LENS_TYPES.PLANO) {
            return Infinity;
        }

        const n = color
            ? Physics.calculateDispersionIndex(this.refractiveIndex, this.dispersion, color)
            : this.refractiveIndex;
        const sign = this.type === CONFIG.LENS_TYPES.CONCAVE ? -1 : 1;

        return sign * Physics.calculateFocalLength(n, this.curvature, this.getHeight());
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
