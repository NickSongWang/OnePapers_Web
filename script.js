/**
 * 智能阈值分割工具
 * 功能：
 * 1. 1-4个可拖动分隔点（分成2-5段）
 * 2. 区间最大值映射
 * 3. 拖拽/点击上传图片
 * 4. 下载处理结果
 */

document.addEventListener('DOMContentLoaded', () => {
    // ============== DOM元素 ==============
    const dom = {
        uploadInput: document.getElementById('upload'),
        reuploadInput: document.getElementById('reupload'),
        uploadArea: document.getElementById('uploadArea'),
        canvas: document.getElementById('canvas'),
        ctx: document.getElementById('canvas').getContext('2d'),
        thresholdAxis: document.getElementById('thresholdAxis'),
        addThresholdBtn: document.getElementById('add-threshold'),
        removeThresholdBtn: document.getElementById('remove-threshold'),
        downloadBtn: document.getElementById('download'),
        container: document.querySelector('.container'),
        mainContent: document.getElementById('mainContent')
    };

    // ============== 状态变量 ==============
    const state = {
        currentImage: null,
        thresholdPoints: [85, 170], // 初始2个分隔点（分成3段）
        activeHandle: null, // 当前拖动的阈值点
        minThresholds: 1,  // 最少分隔点数
        maxThresholds: 4   // 最多分隔点数
    };

    // ============== 阈值控制 ==============
    /**
     * 更新阈值控制点UI
     */
    function updateThresholdUI() {
        // 清空现有控制点
        document.querySelectorAll('.threshold-handle').forEach(el => el.remove());
        
        // 对阈值点排序
        state.thresholdPoints.sort((a, b) => a - b);
        
        // 创建控制点
        state.thresholdPoints.forEach((value, index) => {
            const handle = document.createElement('div');
            handle.className = 'threshold-handle';
            handle.dataset.value = value;
            handle.dataset.index = index;
            
            // 计算位置 (0-255映射到0-100%)
            const position = (value / 255) * 100;
            handle.style.left = `${position}%`;
            
            // 拖拽事件
            handle.addEventListener('mousedown', startDrag);
            handle.addEventListener('touchstart', startDrag);
            
            dom.thresholdAxis.appendChild(handle);
        });
        
        // 更新按钮状态
        dom.addThresholdBtn.disabled = state.thresholdPoints.length >= state.maxThresholds;
        dom.removeThresholdBtn.disabled = state.thresholdPoints.length <= state.minThresholds;
        
        // 处理图片
        if (state.currentImage) applyThresholds();
    }

    /**
     * 开始拖拽阈值点
     */
    function startDrag(e) {
        e.preventDefault();
        state.activeHandle = {
            element: e.target,
            index: parseInt(e.target.dataset.index),
            startX: e.clientX || e.touches[0].clientX
        };
        
        e.target.classList.add('active');
        document.addEventListener('mousemove', handleDrag);
        document.addEventListener('touchmove', handleDrag);
        document.addEventListener('mouseup', endDrag);
        document.addEventListener('touchend', endDrag);
    }

    /**
     * 处理拖拽
     */
    function handleDrag(e) {
        if (!state.activeHandle) return;
        
        const axisRect = dom.thresholdAxis.getBoundingClientRect();
        const clientX = e.clientX || e.touches[0].clientX;
        
        // 计算新位置 (限制在数轴范围内)
        let newValue = ((clientX - axisRect.left) / axisRect.width) * 255;
        newValue = Math.max(0, Math.min(255, Math.round(newValue)));
        
        // 限制不能越过相邻点
        const prev = state.thresholdPoints[state.activeHandle.index - 1];
        const next = state.thresholdPoints[state.activeHandle.index + 1];
        
        if (prev !== undefined && newValue <= prev + 5) {
            newValue = prev + 5;
        }
        if (next !== undefined && newValue >= next - 5) {
            newValue = next - 5;
        }
        
        // 更新状态
        state.thresholdPoints[state.activeHandle.index] = newValue;
        state.activeHandle.element.style.left = `${(newValue / 255) * 100}%`;
        state.activeHandle.element.dataset.value = newValue;
        
        // 实时处理图片
        if (state.currentImage) applyThresholds();
    }

    /**
     * 结束拖拽
     */
    function endDrag() {
        if (state.activeHandle) {
            state.activeHandle.element.classList.remove('active');
            state.activeHandle = null;
        }
        document.removeEventListener('mousemove', handleDrag);
        document.removeEventListener('touchmove', handleDrag);
        document.removeEventListener('mouseup', endDrag);
        document.removeEventListener('touchend', endDrag);
    }

    /**
     * 添加阈值分隔点
     */
    function addThreshold() {
        if (state.thresholdPoints.length >= state.maxThresholds) return;
        
        // 在最大间隔处插入新点
        let maxGap = 0;
        let insertIndex = 0;
        let newValue = 128;
        
        // 计算所有间隔（包括边界0和255）
        const sorted = [...state.thresholdPoints].sort((a, b) => a - b);
        const allPoints = [0, ...sorted, 255];
        
        for (let i = 1; i < allPoints.length; i++) {
            const gap = allPoints[i] - allPoints[i-1];
            if (gap > maxGap) {
                maxGap = gap;
                insertIndex = i;
                newValue = Math.round(allPoints[i-1] + gap/2);
            }
        }
        
        // 插入新点并更新
        state.thresholdPoints.push(newValue);
        updateThresholdUI();
    }

    /**
     * 移除阈值分隔点
     */
    function removeThreshold() {
        if (state.thresholdPoints.length <= state.minThresholds) return;
        
        // 移除最后一个点
        state.thresholdPoints.pop();
        updateThresholdUI();
    }

    // ============== 图像处理 ==============
    /**
     * 应用阈值分割处理
     */
    function applyThresholds() {
        // 1. 绘制原始图像
        dom.ctx.drawImage(state.currentImage, 0, 0, dom.canvas.width, dom.canvas.height);
        
        // 2. 获取像素数据
        const imageData = dom.ctx.getImageData(0, 0, dom.canvas.width, dom.canvas.height);
        const data = imageData.data;
        
        // 3. 准备分段阈值（排序并添加边界）
        const thresholds = [0, ...state.thresholdPoints.sort((a, b) => a - b), 255];
        
        // 4. 处理每个像素
        for (let i = 0; i < data.length; i += 4) {
            // 计算灰度值
            const gray = 0.2126 * data[i] + 0.7152 * data[i+1] + 0.0722 * data[i+2];
            
            // 查找所属区间（使用区间最大值）
            let mappedValue = 255; // 默认值
            if (gray <= thresholds[1]) {
                mappedValue = 0; // 第一个区间内的值全设为0
            }
            else{
                for (let j = 2; j < thresholds.length; j++) {
                    if (gray <= thresholds[j]) {
                        mappedValue = thresholds[j]; // 使用区间上限值
                        break;
                    }
                }
            }
            
            // 设置新RGB值
            data[i] = data[i+1] = data[i+2] = mappedValue;
        }
        
        // 5. 回写处理后的数据
        dom.ctx.putImageData(imageData, 0, 0);
    }

    /**
     * 计算适应显示区域的尺寸
     */
    function calculateDisplaySize(imgWidth, imgHeight) {
        const maxWidth = window.innerWidth * 0.6;
        const maxHeight = window.innerHeight * 0.8;
        let width = imgWidth;
        let height = imgHeight;
        
        if (width > maxWidth) {
            height = (maxWidth / width) * height;
            width = maxWidth;
        }
        if (height > maxHeight) {
            width = (maxHeight / height) * width;
            height = maxHeight;
        }
        
        return { width, height };
    }

    // ============== 文件处理 ==============
    /**
     * 处理文件选择
     */
    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                state.currentImage = img;
                
                // 设置画布尺寸
                const { width, height } = calculateDisplaySize(img.width, img.height);
                dom.canvas.width = width;
                dom.canvas.height = height;
                
                // 显示主界面
                dom.container.classList.add('uploaded');
                dom.mainContent.style.display = 'grid';
                
                // 初始处理
                applyThresholds();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    // ============== 事件监听 ==============
    // 文件上传
    dom.uploadInput.addEventListener('change', handleFileSelect);
    dom.reuploadInput.addEventListener('change', handleFileSelect);
    
    // 阈值控制
    dom.addThresholdBtn.addEventListener('click', addThreshold);
    dom.removeThresholdBtn.addEventListener('click', removeThreshold);
    
    // 下载结果
    dom.downloadBtn.addEventListener('click', () => {
        if (!state.currentImage) {
            alert("请先上传图片");
            return;
        }
        const link = document.createElement('a');
        link.download = `threshold-image-${new Date().getTime()}.png`;
        link.href = dom.canvas.toDataURL('image/png');
        link.click();
    });
    
    // 拖拽上传
    dom.uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dom.uploadArea.classList.add('drag-over');
    });
    
    dom.uploadArea.addEventListener('dragleave', () => {
        dom.uploadArea.classList.remove('drag-over');
    });
    
    dom.uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.uploadArea.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            dom.uploadInput.files = e.dataTransfer.files;
            handleFileSelect({ target: dom.uploadInput });
        }
    });

    // ============== 初始化 ==============
    updateThresholdUI(); // 初始化阈值控制点
});