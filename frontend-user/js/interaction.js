/**
 * 交互管理器
 *
 * 负责：素材库拖放/点选、工具栏（光路开关、光源模式、入射角、
 * 光线数量、色散开关、重试）、参数面板滑块以及帮助提示。
 * 任何会改变设计的操作都会同步写入 localStorage。
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
            this.canvasManager.saveDesign();
        });

        // 重置画布（同时删除已保存的设计）
        document.getElementById('btn-reset-canvas').addEventListener('click', () => {
            if (this.canvasManager.lenses.length === 0 && !this.renderer.isRunning) {
                Utils.showToast('画布已经是空的了', 'info');
                return;
            }

            this.canvasManager.resetAll();
            this.renderer.setRunning(false);
            this.updateLightButtonState(false);

            Utils.showToast('画布已重置', 'success');
        });

        // 光源模式选择
        document.getElementById('select-light-mode').addEventListener('change', (e) => {
            this.renderer.setLightMode(e.target.value);
            this.canvasManager.saveDesign();
        });

        // 入射角度
        const angleSlider = document.getElementById('param-angle');
        angleSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value, 10);
            document.getElementById('param-angle-value').textContent = `${value}°`;
            this.renderer.setIncidentAngle(value);
            this.canvasManager.saveDesign();
        });

        // 光线数量
        document.getElementById('select-ray-count').addEventListener('change', (e) => {
            this.renderer.setRayCount(parseInt(e.target.value, 10));
            this.canvasManager.saveDesign();
        });

        // 色散开关：开启后按红/绿/蓝波长分别计算折射率、焦距与偏折
        const btnDispersion = document.getElementById('btn-toggle-dispersion');
        btnDispersion.addEventListener('click', () => {
            const show = !this.renderer.showDispersion;
            this.renderer.setShowDispersion(show);
            btnDispersion.classList.toggle('active', show);
            this.canvasManager.saveDesign();
        });

        // 光线未穿过镜片时画布提示条上的「重试」按钮
        const btnRetry = document.getElementById('btn-ray-retry');
        if (btnRetry) {
            btnRetry.addEventListener('click', () => {
                // 用户可能已经拖动了透镜或调整了角度，重新计算并渲染一次
                this.renderer.render();
            });
        }

        // 切换标注
        const btnToggleLabels = document.getElementById('btn-toggle-labels');
        btnToggleLabels.addEventListener('click', () => {
            const showLabels = this.renderer.toggleLabels();
            btnToggleLabels.classList.toggle('active', showLabels);
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
                this.canvasManager.selectedLens.customIndex = true;
                this.renderer.render();
                this.updateFocalInfo(this.canvasManager.selectedLens);
                this.canvasManager.saveDesign();
            }
        });

        const sizeSlider = document.getElementById('param-size');
        sizeSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('param-size-value').textContent = `${value}%`;

            if (this.canvasManager.selectedLens) {
                this.canvasManager.selectedLens.size = value;
                this.renderer.render();
                this.canvasManager.saveDesign();
            }
        });

        const curvatureSlider = document.getElementById('param-curvature');
        curvatureSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('param-curvature-value').textContent = `${value}%`;

            if (this.canvasManager.selectedLens) {
                this.canvasManager.selectedLens.curvature = value;
                this.renderer.render();
                this.updateFocalInfo(this.canvasManager.selectedLens);
                this.canvasManager.saveDesign();
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
                this.updateFocalInfo(lens);
                this.canvasManager.saveDesign();
            }
        });

        document.getElementById('btn-reset-lens').addEventListener('click', () => {
            if (this.canvasManager.selectedLens) {
                this.canvasManager.selectedLens.reset();
                this.updateParamPanel(this.canvasManager.selectedLens);
                this.renderer.render();
                this.canvasManager.saveDesign();
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

    /**
     * 各透镜类型在参数面板上的说明（与素材库「?」帮助、画布行为保持一致）
     */
    getTypeDescription(type) {
        const descriptions = {
            [CONFIG.LENS_TYPES.CONVEX]: '球面凸透镜：会聚光线，边缘光线因球差提前会聚（橙色小点）',
            [CONFIG.LENS_TYPES.CONCAVE]: '凹透镜：发散光线，反向延长线交于虚焦点（空心圆）',
            [CONFIG.LENS_TYPES.PLANO]: '平面透镜：两面平行，垂直入射时方向不变',
            [CONFIG.LENS_TYPES.ASPHERIC]: '非球面透镜：改变边缘曲率补偿球差，所有光线会聚到同一焦点'
        };
        return descriptions[type] || '';
    }

    /**
     * 更新焦距信息行
     */
    updateFocalInfo(lens) {
        const group = document.getElementById('param-focal-group');
        const valueEl = document.getElementById('param-focal-value');
        const descEl = document.getElementById('param-focal-desc');
        if (!group || !valueEl) return;

        if (lens.type === CONFIG.LENS_TYPES.PLANO) {
            group.style.display = 'none';
            return;
        }
        group.style.display = 'flex';

        const f = lens.getFocalLength();
        if (f < 0) {
            valueEl.textContent = `${Math.abs(Math.round(f))}px（虚）`;
            descEl.textContent = '凹透镜的虚焦点在透镜左侧（空心圆点）';
        } else {
            valueEl.textContent = `${Math.round(f)}px`;
            if (lens.type === CONFIG.LENS_TYPES.CONVEX) {
                const fm = lens.getMarginalFocalLength();
                descEl.textContent =
                    `球差：边缘光线会聚在约 ${Math.round(fm)}px 处，比近轴焦点更靠近透镜；非球面透镜可消除该偏差`;
            } else {
                descEl.textContent = '非球面修正后，边缘与中心光线均穿过该焦点，球差≈0';
            }
        }
    }

    updateParamPanel(lens) {
        document.getElementById('param-type-value').textContent = lens.getTypeName();
        document.getElementById('param-type-desc').textContent = this.getTypeDescription(lens.type);
        document.getElementById('param-ri').value = lens.refractiveIndex;
        document.getElementById('param-ri-value').textContent = lens.refractiveIndex.toFixed(2);
        document.getElementById('param-size').value = lens.size;
        document.getElementById('param-size-value').textContent = `${lens.size}%`;
        document.getElementById('param-curvature').value = lens.curvature;
        document.getElementById('param-curvature-value').textContent = `${lens.curvature}%`;
        document.getElementById('param-material').value = lens.material;

        const curvatureGroup = document.getElementById('param-curvature-group');
        curvatureGroup.style.display = lens.type === CONFIG.LENS_TYPES.PLANO ? 'none' : 'flex';

        // 平面透镜不参与偏折，折射率滑块禁用
        const riSlider = document.getElementById('param-ri');
        riSlider.disabled = lens.type === CONFIG.LENS_TYPES.PLANO;

        this.updateFocalInfo(lens);
    }

    /**
     * 用 renderer 当前状态同步工具栏控件（页面恢复设计后调用）
     */
    syncToolbarControls() {
        const r = this.renderer;

        const modeSelect = document.getElementById('select-light-mode');
        if (modeSelect) modeSelect.value = r.lightMode;

        const angleSlider = document.getElementById('param-angle');
        if (angleSlider) {
            angleSlider.value = r.incidentAngle;
            document.getElementById('param-angle-value').textContent = `${r.incidentAngle}°`;
        }

        const countSelect = document.getElementById('select-ray-count');
        if (countSelect) countSelect.value = String(r.rayCount);

        const btnDispersion = document.getElementById('btn-toggle-dispersion');
        if (btnDispersion) btnDispersion.classList.toggle('active', r.showDispersion);

        this.updateLightButtonState(r.isRunning);
    }
}
