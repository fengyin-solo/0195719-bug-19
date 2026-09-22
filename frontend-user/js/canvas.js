/**
 * 画布管理器
 *
 * 维护透镜列表、选中态、拖拽交互，并负责把当前设计
 * （透镜布局/参数 + 光源设置）持久化到 localStorage，
 * 使重新进入页面后透镜位置、参数与焦点标记与离开时一致。
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

        // 测验模式下的临时透镜不写入持久化设计
        this.persistEnabled = true;

        this.init();
    }

    init() {
        this.bindEvents();
        this.handleResize();
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
    }

    handlePointerUp() {
        if (this.isDragging) {
            // 拖拽结束后再保存，避免拖动过程中频繁写 localStorage
            this.saveDesign();
        }
        this.isDragging = false;
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
        this.saveDesign();
    }

    removeLens(lens) {
        const index = this.lenses.indexOf(lens);
        if (index > -1) {
            this.lenses.splice(index, 1);
            if (this.selectedLens === lens) {
                this.deselectLens();
            }
            this.renderer.setLenses(this.lenses);
            this.saveDesign();
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

    /**
     * 清空画布（仅清内存，不删除已保存的设计）
     * 测验模式开始/结束时使用，避免破坏用户之前的实验设计
     */
    clear() {
        this.lenses = [];
        this.selectedLens = null;
        this.isDragging = false;
        this.renderer.setLenses([]);
        this.renderer.render();
    }

    /**
     * 用户主动重置画布：清空内存并删除已保存设计
     */
    resetAll() {
        this.clear();
        Storage.clearDesign();
    }

    /**
     * 把当前设计（透镜 + 光源设置）写入 localStorage
     */
    saveDesign() {
        if (!this.persistEnabled) return;

        Storage.saveDesign({
            version: CONFIG.VERSION,
            savedAt: Date.now(),
            lenses: this.lenses.map(l => l.toJSON()),
            light: {
                mode: this.renderer.lightMode,
                rayCount: this.renderer.rayCount,
                angle: this.renderer.incidentAngle,
                showDispersion: this.renderer.showDispersion,
                running: this.renderer.isRunning
            }
        });
    }

    /**
     * 从 localStorage 恢复设计。返回是否恢复成功。
     */
    restoreDesign() {
        const design = Storage.loadDesign();
        if (!design || design.lenses.length === 0) return false;

        this.lenses = design.lenses.map(data => {
            const lens = Lens.fromJSON(data);
            // 不同设备/窗口尺寸下，把透镜限制在当前画布范围内
            lens.x = Utils.clamp(lens.x, 50, Math.max(51, this.renderer.width - 50));
            lens.y = Utils.clamp(lens.y, 50, Math.max(51, this.renderer.height - 50));
            return lens;
        });

        const light = design.light || {};
        if (light.mode) this.renderer.setLightMode(light.mode);
        if (light.rayCount) this.renderer.setRayCount(light.rayCount);
        if (typeof light.angle === 'number') this.renderer.setIncidentAngle(light.angle);
        this.renderer.setShowDispersion(!!light.showDispersion);
        this.renderer.setLenses(this.lenses);
        if (light.running) this.renderer.setRunning(true);

        return true;
    }

    getRenderer() {
        return this.renderer;
    }
}
