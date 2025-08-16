document.addEventListener('DOMContentLoaded', () => {
    // ============== DOM元素 ==============
    const dom = {
        uploadInput: document.getElementById('upload'),
        reuploadInput: document.getElementById('reupload'),
        uploadArea: document.getElementById('uploadArea'),
        thresholdAxis: document.getElementById('thresholdAxis'),
        addThresholdBtn: document.getElementById('add-threshold'),
        removeThresholdBtn: document.getElementById('remove-threshold'),
        downloadAllBtn: document.getElementById('download-all'),
        container: document.querySelector('.container'),
        mainContent: document.getElementById('mainContent'),
        splitView: document.getElementById('split-view'),
        combinedView: document.getElementById('combined-view'),
        combinedCanvas: document.getElementById('combined-canvas'),
        tabButtons: document.querySelectorAll('.tab-btn'),
        downloadCombinedBtn: document.getElementById('download-combined'),
        blurRadiusInput: document.getElementById('blur-radius'),
        blurValue: document.getElementById('blur-value'),
        resizeScaleInput: document.getElementById('resize-scale'),
        resizeValue: document.getElementById('resize-value'),
        progressContainer: document.getElementById('progress-container'),
        progressFill: document.getElementById('progress-fill'),
        progressText: document.getElementById('progress-text'),
        presetButtons: document.querySelectorAll('.preset-btn')
    };

    // ============== 状态变量 ==============
    const state = {
        currentImage: null,
        thresholdPoints: [85, 170],
        activeHandle: null,
        minThresholds: 1,
        maxThresholds: 4,
        blurRadius: 2,
        resizeScale: 0.7,
        processing: false,
        qualityPreset: 'medium'
    };

    // ============== 初始化 ==============
    function init() {
        initSmoothingControls();
        updateThresholdUI();
        setupEventListeners();
    }

    // ============== 进度指示器 ==============
    function updateProgress(percent, message) {
        if (percent === 0) {
            dom.progressContainer.style.display = 'block';
            state.processing = true;
        }
        
        dom.progressFill.style.width = `${percent}%`;
        dom.progressText.textContent = message || `处理中: ${Math.round(percent)}%`;
        
        if (percent >= 100) {
            setTimeout(() => {
                dom.progressContainer.style.display = 'none';
                state.processing = false;
            }, 500);
        }
    }

    // ============== 平滑控制 ==============
    function initSmoothingControls() {
        // 设置初始值
        dom.blurRadiusInput.value = state.blurRadius;
        dom.blurValue.textContent = `${state.blurRadius}px`;
        dom.resizeScaleInput.value = state.resizeScale;
        dom.resizeValue.textContent = `${Math.round(state.resizeScale * 100)}%`;

        // 监听变化
        dom.blurRadiusInput.addEventListener('input', (e) => {
            state.blurRadius = parseFloat(e.target.value);
            dom.blurValue.textContent = `${state.blurRadius}px`;
            debouncedUpdateUI();
        });

        dom.resizeScaleInput.addEventListener('input', (e) => {
            state.resizeScale = parseFloat(e.target.value);
            dom.resizeValue.textContent = `${Math.round(state.resizeScale * 100)}%`;
            debouncedUpdateUI();
        });

        // 质量预设
        dom.presetButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                dom.presetButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.qualityPreset = btn.dataset.preset;
                
                // 根据预设调整参数
                switch(state.qualityPreset) {
                    case 'low':
                        state.blurRadius = 1;
                        state.resizeScale = 0.5;
                        break;
                    case 'medium':
                        state.blurRadius = 2;
                        state.resizeScale = 0.7;
                        break;
                    case 'high':
                        state.blurRadius = 3;
                        state.resizeScale = 1;
                        break;
                }
                
                // 更新UI
                dom.blurRadiusInput.value = state.blurRadius;
                dom.blurValue.textContent = `${state.blurRadius}px`;
                dom.resizeScaleInput.value = state.resizeScale;
                dom.resizeValue.textContent = `${Math.round(state.resizeScale * 100)}%`;
                
                debouncedUpdateUI();
            });
        });
    }

    // ============== 防抖处理 ==============
    function debounce(func, wait) {
        let timeout;
        return function() {
            const context = this, args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                func.apply(context, args);
            }, wait);
        };
    }

    const debouncedUpdateUI = debounce(() => {
        if (!state.processing) {
            updateThresholdUI();
        }
    }, 300);

    // ============== 图像处理 ==============
    async function resizeImage(image, maxWidth, maxHeight) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            let width = image.width * state.resizeScale;
            let height = image.height * state.resizeScale;
            
            // 确保不超过最大尺寸
            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width = Math.floor(width * ratio);
                height = Math.floor(height * ratio);
            }
            
            canvas.width = width;
            canvas.height = height;
            
            ctx.drawImage(image, 0, 0, width, height);
            
            const resizedImage = new Image();
            resizedImage.onload = () => resolve(resizedImage);
            resizedImage.src = canvas.toDataURL();
        });
    }

    async function applyBlur(image, radius) {
        if (radius <= 0) return image;
        
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext('2d');
            
            ctx.filter = `blur(${radius}px)`;
            ctx.drawImage(image, 0, 0);
            ctx.filter = 'none';
            
            const blurredImage = new Image();
            blurredImage.onload = () => resolve(blurredImage);
            blurredImage.src = canvas.toDataURL();
        });
    }

    function applyFastMedianFilter(imageData, radius) {
        if (radius === 0) return imageData;
        
        const {width, height, data} = imageData;
        const output = new ImageData(width, height);
        const tempData = new Uint8ClampedArray(data.length);
        
        // 水平滤波
        for (let y = 0; y < height; y++) {
            for (let x = radius; x < width - radius; x++) {
                const values = [];
                for (let dx = -radius; dx <= radius; dx++) {
                    const idx = (y * width + (x + dx)) * 4;
                    values.push(data[idx]);
                }
                values.sort((a, b) => a - b);
                const median = values[Math.floor(values.length / 2)];
                const outIdx = (y * width + x) * 4;
                tempData[outIdx] = median;
            }
        }
        
        // 垂直滤波
        for (let x = 0; x < width; x++) {
            for (let y = radius; y < height - radius; y++) {
                const values = [];
                for (let dy = -radius; dy <= radius; dy++) {
                    const idx = ((y + dy) * width + x) * 4;
                    values.push(tempData[idx]);
                }
                values.sort((a, b) => a - b);
                const median = values[Math.floor(values.length / 2)];
                const outIdx = (y * width + x) * 4;
                output.data[outIdx] = output.data[outIdx+1] = output.data[outIdx+2] = median;
                output.data[outIdx+3] = 255;
            }
        }
        
        return output;
    }

    async function generateThresholdCanvases() {
        if (!state.currentImage) return [];
        
        updateProgress(0, '准备图像...');
        
        // 1. 缩小图像尺寸
        const resizedImage = await resizeImage(state.currentImage, 1500, 1500);
        updateProgress(20, '应用模糊...');
        
        // 2. 应用模糊
        const blurredImage = await applyBlur(resizedImage, state.blurRadius);
        updateProgress(40, '处理阈值...');
        
        // 准备阈值数组
        const thresholds = [0, ...state.thresholdPoints.sort((a, b) => a - b), 255];
        const canvases = [];
        
        // 创建原始Canvas获取图像数据
        const originalCanvas = document.createElement('canvas');
        originalCanvas.width = blurredImage.width;
        originalCanvas.height = blurredImage.height;
        const originalCtx = originalCanvas.getContext('2d');
        originalCtx.drawImage(blurredImage, 0, 0);
        const imageData = originalCtx.getImageData(0, 0, originalCanvas.width, originalCanvas.height);
        const data = imageData.data;
        
        // 为每个阈值区间创建Canvas
        const segmentCount = thresholds.length - 1;
        for (let i = 1; i < segmentCount; i++) {
            const lower = thresholds[i];
            updateProgress(40 + (i/segmentCount)*50, `处理分段 ${i}/${segmentCount-1}`);
            
            // 使用requestIdleCallback分块处理
            await new Promise(resolve => {
                requestIdleCallback(() => {
                    // 创建新Canvas
                    const canvas = document.createElement('canvas');
                    canvas.width = originalCanvas.width;
                    canvas.height = originalCanvas.height;
                    const ctx = canvas.getContext('2d');
                    
                    // 复制原始图像数据
                    const newImageData = ctx.createImageData(canvas.width, canvas.height);
                    const newData = newImageData.data;
                    
                    // 处理像素 - 生成黑白二值图
                    for (let j = 0; j < data.length; j += 4) {
                        const gray = 0.2126 * data[j] + 0.7152 * data[j+1] + 0.0722 * data[j+2];
                        const value = (gray > lower) ? 0 : 255;
                        newData[j] = value;
                        newData[j+1] = value;
                        newData[j+2] = value;
                        newData[j+3] = 255;
                    }

                    // 应用中值滤波
                    if (state.qualityPreset !== 'low') {
                        const filteredData = applyFastMedianFilter(newImageData, 1);
                        ctx.putImageData(filteredData, 0, 0);
                    } else {
                        ctx.putImageData(newImageData, 0, 0);
                    }

                    // 添加到结果数组
                    canvases.push({
                        canvas,
                        lower,
                        index: i
                    });
                    
                    resolve();
                });
            });
        }
        
        updateProgress(100, '处理完成');
        return canvases;
    }

    async function generateCombinedCanvas() {
        const canvases = await generateThresholdCanvases();
        if (!canvases.length) return null;
        
        const firstCanvas = canvases[0].canvas;
        const combinedCanvas = document.createElement('canvas');
        combinedCanvas.width = firstCanvas.width;
        combinedCanvas.height = firstCanvas.height;
        const ctx = combinedCanvas.getContext('2d');
        
        // 创建临时Canvas数组
        const tempCanvases = canvases.map(({canvas}) => {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(canvas, 0, 0);
            return tempCtx.getImageData(0, 0, canvas.width, canvas.height);
        });
        
        // 创建新的图像数据
        const combinedImageData = ctx.createImageData(combinedCanvas.width, combinedCanvas.height);
        const combinedData = combinedImageData.data;
        
        // 计算每个像素的平均值
        for (let i = 0; i < combinedData.length; i += 4) {
            let sum = 0;
            let count = 0;
            
            tempCanvases.forEach(imageData => {
                sum += imageData.data[i];
                count++;
            });
            
            const avg = Math.round(sum / count);
            combinedData[i] = 255-avg;
            combinedData[i+1] = 255-avg;
            combinedData[i+2] = 255-avg;
            combinedData[i+3] = 255;
        }
        
        ctx.putImageData(combinedImageData, 0, 0);
        return combinedCanvas;
    }

    // ============== UI更新 ==============
    async function displayThresholdCanvases() {
        dom.splitView.innerHTML = '';
        const canvases = await generateThresholdCanvases();
        if (!canvases.length) return;
        
        canvases.forEach(({canvas, lower, index}) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'canvas-wrapper';
            
            const label = document.createElement('div');
            label.className = 'canvas-label';
            label.textContent = `剪纸模板 ${index}`;
            
            const displayCanvas = document.createElement('canvas');
            const displaySize = calculateDisplaySize(canvas.width, canvas.height, 2);
            displayCanvas.width = displaySize.width;
            displayCanvas.height = displaySize.height;
            
            const ctx = displayCanvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(canvas, 0, 0, displayCanvas.width, displayCanvas.height);
            
            wrapper.appendChild(label);
            wrapper.appendChild(displayCanvas);
            dom.splitView.appendChild(wrapper);
            
            addDownloadButton(wrapper, canvas, `剪纸模板_${index}_${lower}`);
        });
    }

    async function displayCombinedCanvas() {
        const combinedCanvas = await generateCombinedCanvas();
        if (!combinedCanvas) return;
        
        const displaySize = calculateDisplaySize(combinedCanvas.width, combinedCanvas.height, 2);
        dom.combinedCanvas.width = displaySize.width;
        dom.combinedCanvas.height = displaySize.height;
        
        const ctx = dom.combinedCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(combinedCanvas, 0, 0, dom.combinedCanvas.width, dom.combinedCanvas.height);
    }

    function updateThresholdUI() {
        document.querySelectorAll('.threshold-handle').forEach(el => el.remove());
        state.thresholdPoints.sort((a, b) => a - b);
        
        state.thresholdPoints.forEach((value, index) => {
            const handle = document.createElement('div');
            handle.className = 'threshold-handle';
            handle.dataset.value = value;
            handle.dataset.index = index;
            handle.style.left = `${(value / 255) * 100}%`;
            handle.addEventListener('mousedown', startDrag);
            dom.thresholdAxis.appendChild(handle);
        });
        
        dom.addThresholdBtn.disabled = state.thresholdPoints.length >= state.maxThresholds;
        dom.removeThresholdBtn.disabled = state.thresholdPoints.length <= state.minThresholds;
        
        displayThresholdCanvases();
        displayCombinedCanvas();
    }

    // ============== 阈值控制 ==============
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

    function handleDrag(e) {
        if (!state.activeHandle) return;
        
        const axisRect = dom.thresholdAxis.getBoundingClientRect();
        const clientX = e.clientX || e.touches[0].clientX;
        
        let newValue = ((clientX - axisRect.left) / axisRect.width) * 255;
        newValue = Math.max(0, Math.min(255, Math.round(newValue)));
        
        const prev = state.thresholdPoints[state.activeHandle.index - 1];
        const next = state.thresholdPoints[state.activeHandle.index + 1];
        
        if (prev !== undefined && newValue <= prev + 5) newValue = prev + 5;
        if (next !== undefined && newValue >= next - 5) newValue = next - 5;
        
        state.thresholdPoints[state.activeHandle.index] = newValue;
        state.activeHandle.element.style.left = `${(newValue / 255) * 100}%`;
        state.activeHandle.element.dataset.value = newValue;
        
        debouncedUpdateUI();
    }

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

    function addThreshold() {
        if (state.thresholdPoints.length >= state.maxThresholds) return;
        
        const sorted = [...state.thresholdPoints].sort((a, b) => a - b);
        const allPoints = [0, ...sorted, 255];
        let maxGap = 0, insertIndex = 0, newValue = 128;
        
        for (let i = 1; i < allPoints.length; i++) {
            const gap = allPoints[i] - allPoints[i-1];
            if (gap > maxGap) {
                maxGap = gap;
                insertIndex = i;
                newValue = Math.round(allPoints[i-1] + gap/2);
            }
        }
        
        state.thresholdPoints.push(newValue);
        updateThresholdUI();
    }

    function removeThreshold() {
        if (state.thresholdPoints.length <= state.minThresholds) return;
        state.thresholdPoints.pop();
        updateThresholdUI();
    }

    // ============== 工具函数 ==============
    function calculateDisplaySize(imgWidth, imgHeight, scaleFactor = 1) {
        const maxWidth = window.innerWidth * 0.4 * scaleFactor;
        const maxHeight = window.innerHeight * 0.6 * scaleFactor;
        let width = imgWidth * scaleFactor;
        let height = imgHeight * scaleFactor;
        
        if (width > maxWidth) {
            height = (maxWidth / width) * height;
            width = maxWidth;
        }
        if (height > maxHeight) {
            width = (maxHeight / height) * width;
            height = maxHeight;
        }
        
        return { width: Math.round(width), height: Math.round(height) };
    }

    function addDownloadButton(container, canvas, filename) {
        const btn = document.createElement('button');
        btn.className = 'download-btn';
        btn.textContent = '下载模板';
        btn.onclick = () => {
            const link = document.createElement('a');
            link.download = `${filename}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        };
        container.appendChild(btn);
    }

    async function downloadAllRegions() {
        const canvases = await generateThresholdCanvases();
        if (!canvases.length) return;
        
        for (const {canvas, index} of canvases) {
            await new Promise(resolve => setTimeout(resolve, 300));
            const link = document.createElement('a');
            link.download = `剪纸模板_${index}.png`;
            link.href = canvas.toDataURL('image/png');
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            setTimeout(() => document.body.removeChild(link), 100);
        }
    }

    // ============== 文件处理 ==============
    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        updateProgress(0, '加载图像...');
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            const img = new Image();
            img.onload = async () => {
                state.currentImage = img;
                dom.container.classList.add('uploaded');
                dom.mainContent.style.display = 'grid';
                await updateThresholdUI();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    // ============== 事件监听 ==============
    function setupEventListeners() {
        dom.uploadInput.addEventListener('change', handleFileSelect);
        dom.reuploadInput.addEventListener('change', handleFileSelect);
        
        dom.addThresholdBtn.addEventListener('click', addThreshold);
        dom.removeThresholdBtn.addEventListener('click', removeThreshold);
        
        dom.downloadAllBtn.addEventListener('click', downloadAllRegions);
        dom.downloadCombinedBtn.addEventListener('click', async () => {
            const combinedCanvas = await generateCombinedCanvas();
            if (!combinedCanvas) return;
            
            const link = document.createElement('a');
            link.download = '剪纸组合效果.png';
            link.href = combinedCanvas.toDataURL('image/png');
            link.click();
        });
        
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

        dom.tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                dom.tabButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                
                const tabView = document.getElementById(`${btn.dataset.tab}-view`);
                if (tabView) tabView.classList.add('active');
                
                if (btn.dataset.tab === 'combined') {
                    displayCombinedCanvas();
                }
            });
        });
    }

    // 初始化应用
    init();
});