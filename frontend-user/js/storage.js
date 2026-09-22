/**
 * 本地存储管理
 *
 * 两类数据：
 * - 引导完成标记：optics_guide_completed
 * - 画布设计存档：optics_designs_v1（透镜、光源设置、标注/光路状态）
 *
 * 刷新或重新进入页面后自动恢复，焦点标记位置由同样的物理公式确定性计算，
 * 因此恢复后画布上的标记与离开时保持一致。
 */
const Storage = {
    GUIDE_KEY: 'optics_guide_completed',
    DESIGN_KEY: 'optics_designs_v1',

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
     * 保存当前画布设计
     * @param {object} design { lenses, light, isRunning, showLabels, showDispersion }
     * @returns {boolean} 是否保存成功
     */
    saveDesign(design) {
        try {
            localStorage.setItem(this.DESIGN_KEY, JSON.stringify({
                version: 1,
                savedAt: Date.now(),
                ...design
            }));
            return true;
        } catch (e) {
            console.warn('设计存档失败：', e);
            return false;
        }
    },

    /**
     * 读取画布设计存档
     * @returns {object|null}
     */
    loadDesign() {
        try {
            const raw = localStorage.getItem(this.DESIGN_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data || !Array.isArray(data.lenses)) return null;
            return data;
        } catch (e) {
            console.warn('设计存档读取失败：', e);
            return null;
        }
    },

    /**
     * 清除画布设计存档（重置画布时调用）
     */
    clearDesign() {
        try {
            localStorage.removeItem(this.DESIGN_KEY);
        } catch (e) {
            // 忽略存储错误
        }
    }
};
