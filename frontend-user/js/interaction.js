/**
 * 交互管理器
 */
class InteractionManager {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.renderer = canvasManager.getRenderer();
        this.btnToggleLight = null;

        this.init();
    }

    init() {
        this.bindLensLibraryEvents();
        this.bindToolbarEvents();
        this.bindParamPanelEvents();
        this.bindFooterEvents();
        this.bindHelpEvents();
        this.bindLensSelectionEvents();
        this.bindDesignRestoreEvents();
        // CanvasManager 构造时已先恢复存档（此时本管理器还未监听 designRestored），
        // 这里直接按渲染器当前状态把工具栏与参数面板同步到恢复后的设计
        this.syncUiFromRenderer();
    }

    /**
     * 按渲染器/画布当前状态同步工具栏与参数面板（用于刷新后恢复）
     */
    syncUiFromRenderer() {
        const selectLightMode = document.getElementById('select-light-mode');
        if (selectLightMode) {
            selectLightMode.value = this.renderer.lightMode;
        }
        this.updateLightButtonState(this.renderer.isRunning);

        const btnToggleLabels = document.getElementById('btn-toggle-labels');
        if (btnToggleLabels) {
            btnToggleLabels.classList.toggle('active', this.renderer.showLabels);
        }

        const selected = this.canvasManager.selectedLens;
        if (selected) {
            this.showParamPanel(selected);
        }
    }

    bindLensLibraryEvents() {
        const lensItems = document.querySelectorAll('.lens-item');

        lensItems.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                item.classList.add('dragging');
                e.dataTransfer.setData('lens-type', item.dataset.lensType);
                e.dataTransfer.setData('lens-material', item.dataset.material || '');
                e.dataTransfer.effectAllowed = 'copy';
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
            });

            // 触摸设备点击添加
            if (Utils.isTouchDevice()) {
                item.addEventListener('click', () => {
                    const lens = new Lens({
                        type: item.dataset.lensType,
                        x: this.renderer.width / 2,
                        y: this.renderer.height / 2,
                        material: item.dataset.material || 'normal'
                    });
                    this.canvasManager.addLens(lens);
                    this.canvasManager.selectLens(lens);
                    Utils.showToast('透镜已添加', 'success');
                });
            }
        });
    }

    bindToolbarEvents() {
        // 启动/暂停光路
        this.btnToggleLight = document.getElementById('btn-toggle-light');
        this.btnToggleLight.addEventListener('click', () => {
            const isRunning = this.renderer.toggleRunning();
            this.updateLightButtonState(isRunning);
            this.canvasManager.scheduleSave();
        });

        // 重置画布
        document.getElementById('btn-reset-canvas').addEventListener('click', () => {
            if (this.canvasManager.lenses.length === 0 && !this.renderer.isRunning) {
                Utils.showToast('画布已经是空的了', 'info');
                return;
            }

            // 重置透镜
            this.canvasManager.clear();

            // 重置光线状态
            this.renderer.setRunning(false);
            this.updateLightButtonState(false);

            // 清除存档，避免刷新后又恢复出旧设计
            Storage.clearDesign();

            Utils.showToast('画布已重置', 'success');
        });

        // 光源模式选择
        const selectLightMode = document.getElementById('select-light-mode');
        selectLightMode.addEventListener('change', (e) => {
            this.renderer.setLightMode(e.target.value);
            const lightTypeEl = document.getElementById('data-light-type');
            if (lightTypeEl) {
                lightTypeEl.textContent = e.target.value === 'parallel' ? '平行光' : '点光源';
            }
            this.canvasManager.scheduleSave();
        });

        // 切换标注
        const btnToggleLabels = document.getElementById('btn-toggle-labels');
        btnToggleLabels.addEventListener('click', () => {
            const showLabels = this.renderer.toggleLabels();
            btnToggleLabels.classList.toggle('active', showLabels);
            this.canvasManager.scheduleSave();
        });

        // 光线未穿过透镜时，手动重新检测（调整完位置后重试）
        const btnRayRetry = document.getElementById('btn-ray-retry');
        if (btnRayRetry) {
            btnRayRetry.addEventListener('click', () => {
                this.renderer.render();
            });
        }
    }

    /**
     * 页面恢复存档后，把工具栏/按钮 UI 同步到存档状态
     */
    bindDesignRestoreEvents() {
        window.addEventListener('designRestored', (e) => {
            const light = e.detail.light || {};

            const selectLightMode = document.getElementById('select-light-mode');
            if (selectLightMode && light.mode) {
                selectLightMode.value = light.mode;
            }

            this.updateLightButtonState(e.detail.isRunning);

            const btnToggleLabels = document.getElementById('btn-toggle-labels');
            if (btnToggleLabels) {
                btnToggleLabels.classList.toggle('active', e.detail.showLabels !== false);
            }
        });
    }

    /**
     * 更新光线按钮状态
     */
    updateLightButtonState(isRunning) {
        this.btnToggleLight.classList.toggle('active', isRunning);
        this.btnToggleLight.querySelector('span').textContent = isRunning ? '暂停光路' : '启动光路';

        const icon = this.btnToggleLight.querySelector('svg');
        if (isRunning) {
            icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
        } else {
            icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
        }
    }

    bindParamPanelEvents() {
        const riSlider = document.getElementById('param-ri');
        riSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            document.getElementById('param-ri-value').textContent = value.toFixed(2);

            if (this.canvasManager.selectedLens) {
                this.canvasManager.selectedLens.refractiveIndex = value;
                this.renderer.render();
                this.updateLensPhysicsInfo(this.canvasManager.selectedLens);
                this.canvasManager.scheduleSave();
            }
        });

        const sizeSlider = document.getElementById('param-size');
        sizeSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('param-size-value').textContent = `${value}%`;

            if (this.canvasManager.selectedLens) {
                this.canvasManager.selectedLens.size = value;
                this.renderer.render();
                this.updateLensPhysicsInfo(this.canvasManager.selectedLens);
                this.canvasManager.scheduleSave();
            }
        });

        const curvatureSlider = document.getElementById('param-curvature');
        curvatureSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('param-curvature-value').textContent = `${value}%`;

            if (this.canvasManager.selectedLens) {
                this.canvasManager.selectedLens.curvature = value;
                this.renderer.render();
                this.updateLensPhysicsInfo(this.canvasManager.selectedLens);
                this.canvasManager.scheduleSave();
            }
        });

        document.getElementById('param-material').addEventListener('change', (e) => {
            if (this.canvasManager.selectedLens) {
                const lens = this.canvasManager.selectedLens;
                lens.applyMaterial(e.target.value);
                riSlider.value = lens.refractiveIndex;
                document.getElementById('param-ri-value').textContent =
                    lens.refractiveIndex.toFixed(2);
                this.renderer.render();
                this.updateLensPhysicsInfo(lens);
                this.canvasManager.scheduleSave();
            }
        });

        document.getElementById('btn-reset-lens').addEventListener('click', () => {
            if (this.canvasManager.selectedLens) {
                this.canvasManager.selectedLens.reset();
                this.updateParamPanel(this.canvasManager.selectedLens);
                this.renderer.render();
                this.canvasManager.scheduleSave();
                Utils.showToast('参数已重置', 'success');
            }
        });

        document.getElementById('btn-delete-lens').addEventListener('click', () => {
            if (this.canvasManager.selectedLens) {
                this.canvasManager.removeLens(this.canvasManager.selectedLens);
                Utils.showToast('透镜已删除', 'success');
            }
        });
    }

    bindFooterEvents() {
        // 底部区域已简化，无需绑定事件
    }

    bindHelpEvents() {
        document.getElementById('btn-help').addEventListener('click', () => {
            Storage.resetGuide();
            window.dispatchEvent(new CustomEvent('showGuide'));
        });

        document.querySelectorAll('.btn-help-small').forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                Utils.showHelpTooltip(btn, btn.dataset.help);
            });
            btn.addEventListener('mouseleave', () => {
                Utils.hideHelpTooltip();
            });
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                Utils.showHelpTooltip(btn, btn.dataset.help);
                setTimeout(() => Utils.hideHelpTooltip(), 3000);
            });
        });
    }

    bindLensSelectionEvents() {
        window.addEventListener('lensSelected', (e) => {
            this.showParamPanel(e.detail);
        });

        window.addEventListener('lensDeselected', () => {
            this.hideParamPanel();
        });
    }

    showParamPanel(lens) {
        document.getElementById('panel-empty').classList.add('hidden');
        document.getElementById('panel-params').classList.remove('hidden');
        this.updateParamPanel(lens);
    }

    hideParamPanel() {
        document.getElementById('panel-empty').classList.remove('hidden');
        document.getElementById('panel-params').classList.add('hidden');
    }

    updateParamPanel(lens) {
        document.getElementById('param-type-value').textContent = lens.getTypeName();
        document.getElementById('param-ri').value = lens.refractiveIndex;
        document.getElementById('param-ri-value').textContent = lens.refractiveIndex.toFixed(2);
        document.getElementById('param-size').value = lens.size;
        document.getElementById('param-size-value').textContent = `${lens.size}%`;
        document.getElementById('param-curvature').value = lens.curvature;
        document.getElementById('param-curvature-value').textContent = `${lens.curvature}%`;
        document.getElementById('param-material').value = lens.material;

        const curvatureGroup = document.getElementById('param-curvature-group');
        curvatureGroup.style.display = lens.type === CONFIG.LENS_TYPES.PLANO ? 'none' : 'flex';

        this.updateLensPhysicsInfo(lens);
    }

    /**
     * 参数面板中的物理信息行：焦距、球差情况
     * 数值全部来自与画布光线、焦点标记相同的物理函数，保证两处说法一致
     */
    updateLensPhysicsInfo(lens) {
        const focalEl = document.getElementById('param-focal-value');
        const aberrationEl = document.getElementById('param-aberration-value');
        if (!focalEl || !aberrationEl) return;

        const f = lens.getFocalLength();

        if (lens.type === CONFIG.LENS_TYPES.PLANO) {
            focalEl.textContent = '∞（不偏折）';
        } else if (lens.type === CONFIG.LENS_TYPES.CONCAVE) {
            focalEl.textContent = `虚焦点，约 ${Math.round(Math.abs(f))} px`;
        } else {
            focalEl.textContent = `约 ${Math.round(f)} px`;
        }

        let text = '';
        switch (lens.type) {
            case CONFIG.LENS_TYPES.CONVEX: {
                const shift = Math.round(Physics.getSphericalFocusShift(1) * 100);
                text = `存在球差：边缘光线比中心光线提前约 ${shift}% 会聚`;
                break;
            }
            case CONFIG.LENS_TYPES.ASPHERIC:
                text = '已补偿球差：边缘与中心光线会聚到同一焦点';
                break;
            case CONFIG.LENS_TYPES.CONCAVE:
                text = '光线向外发散，反向延长线交于虚焦点';
                break;
            case CONFIG.LENS_TYPES.PLANO:
                text = '光线方向不变';
                break;
        }
        aberrationEl.textContent = text;
    }
}
