/**
 * 画布管理器
 *
 * 负责透镜的增删、拖拽、选中，以及画布设计的持久化：
 * 透镜位置/参数或光源设置变化后自动存档，刷新或重新进入页面时恢复。
 */
class CanvasManager {
    constructor() {
        this.canvas = document.getElementById('optics-canvas');
        this.wrapper = document.getElementById('canvas-wrapper');
        this.renderer = new Renderer(this.canvas);
        this.lenses = [];
        this.selectedLens = null;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.restoring = false;

        this.init();
    }

    init() {
        this.bindEvents();
        this.handleResize();
        this.restoreDesign();
    }

    bindEvents() {
        // 窗口大小变化
        window.addEventListener('resize', Utils.debounce(() => {
            this.handleResize();
        }, 100));

        // 鼠标事件
        this.canvas.addEventListener('mousedown', (e) => this.handlePointerDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handlePointerMove(e));
        this.canvas.addEventListener('mouseup', () => this.handlePointerUp());
        this.canvas.addEventListener('mouseleave', () => this.handlePointerUp());

        // 触摸事件 - 关键：正确处理触摸
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handlePointerDown(e);
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.handlePointerMove(e);
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.handlePointerUp();
        }, { passive: false });

        this.canvas.addEventListener('touchcancel', () => this.handlePointerUp());

        // 拖放事件（桌面端）
        this.wrapper.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.wrapper.addEventListener('dragleave', () => this.handleDragLeave());
        this.wrapper.addEventListener('drop', (e) => this.handleDrop(e));

        // 页面隐藏/关闭时，把还在防抖窗口内的设计立即存档
        window.addEventListener('pagehide', () => {
            if (!this.restoring) this.saveNow();
        });
    }

    /**
     * 获取指针位置（兼容鼠标和触摸）
     */
    getPointerPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        let clientX, clientY;

        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        // 计算相对于画布的位置
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        return { x, y };
    }

    handleResize() {
        this.renderer.resize();

        this.lenses.forEach(lens => {
            lens.x = Utils.clamp(lens.x, 50, this.renderer.width - 50);
            lens.y = Utils.clamp(lens.y, 50, this.renderer.height - 50);
        });

        this.renderer.setLenses(this.lenses);
    }

    handlePointerDown(e) {
        const pos = this.getPointerPos(e);
        const lens = this.renderer.getLensAtPoint(pos.x, pos.y);

        if (lens) {
            this.selectLens(lens);
            this.isDragging = true;
            this.dragOffset = {
                x: pos.x - lens.x,
                y: pos.y - lens.y
            };
        } else {
            this.deselectLens();
        }
    }

    handlePointerMove(e) {
        if (!this.isDragging || !this.selectedLens) return;

        const pos = this.getPointerPos(e);

        this.selectedLens.x = Utils.clamp(
            pos.x - this.dragOffset.x,
            50,
            this.renderer.width - 50
        );
        this.selectedLens.y = Utils.clamp(
            pos.y - this.dragOffset.y,
            50,
            this.renderer.height - 50
        );

        this.renderer.render();
        this.scheduleSave();
    }

    handlePointerUp() {
        if (this.isDragging) {
            this.isDragging = false;
            this.scheduleSave();
        }
    }

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        document.getElementById('canvas-drop-hint').classList.remove('hidden');
    }

    handleDragLeave() {
        document.getElementById('canvas-drop-hint').classList.add('hidden');
    }

    handleDrop(e) {
        e.preventDefault();
        document.getElementById('canvas-drop-hint').classList.add('hidden');

        const lensType = e.dataTransfer.getData('lens-type');
        const material = e.dataTransfer.getData('lens-material');

        if (!lensType) return;

        const pos = this.getPointerPos(e);

        const lens = new Lens({
            type: lensType,
            x: pos.x,
            y: pos.y,
            material: material || 'normal'
        });

        this.addLens(lens);
        this.selectLens(lens);
        Utils.showToast('透镜已添加', 'success');
    }

    addLens(lens) {
        this.lenses.push(lens);
        this.renderer.setLenses(this.lenses);
        this.scheduleSave();
    }

    removeLens(lens) {
        const index = this.lenses.indexOf(lens);
        if (index > -1) {
            this.lenses.splice(index, 1);
            if (this.selectedLens === lens) {
                this.deselectLens();
            }
            this.renderer.setLenses(this.lenses);
            this.scheduleSave();
        }
    }

    selectLens(lens) {
        if (this.selectedLens) {
            this.selectedLens.selected = false;
        }

        this.selectedLens = lens;
        lens.selected = true;
        this.renderer.render();

        window.dispatchEvent(new CustomEvent('lensSelected', { detail: lens }));
    }

    deselectLens() {
        if (this.selectedLens) {
            this.selectedLens.selected = false;
            this.selectedLens = null;
            this.renderer.render();
        }

        window.dispatchEvent(new CustomEvent('lensDeselected'));
    }

    clear() {
        this.lenses = [];
        this.selectedLens = null;
        this.isDragging = false;
        this.renderer.setLenses([]);
        this.renderer.render();
        this.scheduleSave();
    }

    /**
     * 收集当前画布与光源设置（用于存档和恢复）
     */
    getDesignState() {
        return {
            lenses: this.lenses.map(lens => lens.toJSON()),
            selectedLensId: this.selectedLens ? this.selectedLens.id : null,
            light: {
                mode: this.renderer.lightMode,
                rayCount: this.renderer.rayCount,
                angle: this.renderer.incidentAngle,
                showDispersion: this.renderer.showDispersion
            },
            isRunning: this.renderer.isRunning,
            showLabels: this.renderer.showLabels
        };
    }

    /**
     * 防抖保存：拖拽滑块或移动透镜时不会频繁写 localStorage
     */
    scheduleSave() {
        if (this.restoring) return;
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this.saveNow(), 300);
    }

    saveNow() {
        if (this.restoring) return;
        Storage.saveDesign(this.getDesignState());
    }

    /**
     * 从存档恢复画布（刷新/重新进入页面后调用）
     */
    restoreDesign() {
        const data = Storage.loadDesign();
        if (!data) return;

        this.restoring = true;
        try {
            this.lenses = (data.lenses || []).map(json => {
                const lens = Lens.fromJSON(json);
                // 窗口尺寸可能与上次不同，先限制在当前画布范围内
                lens.x = Utils.clamp(lens.x, 50, this.renderer.width - 50);
                lens.y = Utils.clamp(lens.y, 50, this.renderer.height - 50);
                return lens;
            });

            const light = data.light || {};
            this.renderer.lightMode = light.mode || CONFIG.LIGHT_DEFAULTS.mode;
            this.renderer.rayCount = light.rayCount || CONFIG.LIGHT_DEFAULTS.rayCount;
            this.renderer.incidentAngle = typeof light.angle === 'number'
                ? light.angle
                : CONFIG.LIGHT_DEFAULTS.angle;
            this.renderer.showDispersion = !!light.showDispersion;
            this.renderer.showLabels = data.showLabels !== false;
            this.renderer.isRunning = !!data.isRunning;
            this.renderer.setLenses(this.lenses);

            // 恢复选中状态
            const selected = this.lenses.find(l => l.id === data.selectedLensId);
            if (selected) {
                this.selectLens(selected);
            }

            // 通知工具栏同步光源模式、按钮状态等 UI
            window.dispatchEvent(new CustomEvent('designRestored', {
                detail: {
                    light,
                    isRunning: this.renderer.isRunning,
                    showLabels: this.renderer.showLabels
                }
            }));
        } finally {
            this.restoring = false;
        }
    }

    getRenderer() {
        return this.renderer;
    }
}
