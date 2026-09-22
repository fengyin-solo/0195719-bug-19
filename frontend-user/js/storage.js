/**
 * 本地存储管理
 *
 * - 引导完成状态：optics_guide_completed
 * - 画布设计：optics_designs（透镜布局 + 光源设置），
 *   刷新或重新进入页面后透镜位置、参数与焦点标记保持一致
 */
const Storage = {
    GUIDE_KEY: 'optics_guide_completed',
    DESIGN_KEY: 'optics_designs',

    /**
     * 检查引导是否完成
     */
    isGuideCompleted() {
        try {
            return localStorage.getItem(this.GUIDE_KEY) === 'true';
        } catch (e) {
            return false;
        }
    },

    /**
     * 标记引导完成
     */
    setGuideCompleted() {
        try {
            localStorage.setItem(this.GUIDE_KEY, 'true');
        } catch (e) {
            // 忽略存储错误
        }
    },

    /**
     * 重置引导状态
     */
    resetGuide() {
        try {
            localStorage.removeItem(this.GUIDE_KEY);
        } catch (e) {
            // 忽略存储错误
        }
    },

    /**
     * 保存画布设计
     * @param {object} design { lenses: [...], light: {...} }
     */
    saveDesign(design) {
        try {
            localStorage.setItem(this.DESIGN_KEY, JSON.stringify(design));
        } catch (e) {
            // 存储已满或被禁用时静默失败
        }
    },

    /**
     * 读取画布设计
     * @returns {object|null}
     */
    loadDesign() {
        try {
            const raw = localStorage.getItem(this.DESIGN_KEY);
            if (!raw) return null;
            const design = JSON.parse(raw);
            if (!design || !Array.isArray(design.lenses)) return null;
            return design;
        } catch (e) {
            return null;
        }
    },

    /**
     * 清除画布设计
     */
    clearDesign() {
        try {
            localStorage.removeItem(this.DESIGN_KEY);
        } catch (e) {
            // 忽略存储错误
        }
    }
};
