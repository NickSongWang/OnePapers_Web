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
        downloadCombinedBtn: document.getElementById('download-combined')
    };

    // ============== 状态变量 ==============
    const state = {
        currentImage: null,
        thresholdPoints: [85, 170], // 初始2个分隔点（分成3段）
        activeHandle: null,
        minThresholds: 1,
        maxThresholds: 4
    };

    // ============== 阈值控制 ==============
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
        
        // 更新Canvas显示
        displayThresholdCanvases();
        displayCombinedCanvas();
    }

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
        
        // 实时更新Canvas显示
        displayThresholdCanvases();
        displayCombinedCanvas();
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

    function removeThreshold() {
        if (state.thresholdPoints.length <= state.minThresholds) return;
        
        // 移除最后一个点
        state.thresholdPoints.pop();
        updateThresholdUI();
    }

    // ============== 图像处理 ==============
    // ============== 图像滤波 ==============
    function applyFilter(imageData,radius) {
        const {width, height, data} = imageData;
        const output = new ImageData(width, height);
        const outputData = output.data;
        if(radius==0){return imageData}
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const values = [];

                // 收集5×5邻域内的像素值
                for (let dy = -radius; dy <= radius; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                        const nx = x + dx;
                        const ny = y + dy;

                        // 边界处理：使用镜像填充
                        const clampX = Math.max(0, Math.min(width-1, nx));
                        const clampY = Math.max(0, Math.min(height-1, ny));
                        const idx = (clampY * width + clampX) * 4;
                        values.push(data[idx]); // 取R通道值(因为是灰度图)
                    }
                }

                // 排序并取中值
                values.sort((a, b) => a - b);
                const median = values[Math.floor(values.length / 2)];

                // 赋值
                const outIdx = (y * width + x) * 4;
                outputData[outIdx] = median;     // R
                outputData[outIdx+1] = median;   // G
                outputData[outIdx+2] = median;   // B
                outputData[outIdx+3] = 255;     // Alpha
            }
        }
    
        return output;
    }
    
    
    /**
     * 生成所有阈值分割的Canvas
     */
    function generateThresholdCanvases() {
        if (!state.currentImage) return [];
        
        // 准备阈值数组（排序并添加边界）
        const thresholds = [0, ...state.thresholdPoints.sort((a, b) => a - b), 255];
        const canvases = [];
        
        // 创建原始Canvas获取图像数据
        const originalCanvas = document.createElement('canvas');
        originalCanvas.width = state.currentImage.width;
        originalCanvas.height = state.currentImage.height;
        const originalCtx = originalCanvas.getContext('2d');
        originalCtx.drawImage(state.currentImage, 0, 0);
        const imageData = originalCtx.getImageData(0, 0, originalCanvas.width, originalCanvas.height);
        const data = imageData.data;
        
        // 为每个阈值区间创建Canvas
        for (let i = 1; i < thresholds.length-1; i++) {
            const lower = thresholds[i];
            
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
                
                // 设置黑白二值：区间内为白(255)，区间外为黑(0)
                //应用下面的代码则是生成预览的，黑色是更暗的
                // const value = (gray>lower) ? 255 : 0;
                //应用下面的代码则是生成可以打印的，原本黑色为白色保留白纸
                const value = (gray>lower) ? 0 : 255;
                newData[j] = value;     // R
                newData[j+1] = value;   // G
                newData[j+2] = value;   // B
                newData[j+3] = 255;     // Alpha (不透明)
            }

            // 将处理后的数据放回Canvas
            ctx.putImageData(newImageData, 0, 0);

            //这里增加平滑处理
            const filteredData = applyFilter(newImageData, 0);
            ctx.putImageData(filteredData, 0, 0);

            // 添加到返回数组
            canvases.push({
                canvas,
                lower,
                index: i
            });
        }
        
        return canvases;
    }

   /**
 * 生成叠加Canvas
 */
function generateCombinedCanvas() {
    if (!state.currentImage) return null;
    
    const canvases = generateThresholdCanvases();
    if (canvases.length === 0) return null;
    
    // 创建叠加Canvas
    const combinedCanvas = document.createElement('canvas');
    combinedCanvas.width = state.currentImage.width;
    combinedCanvas.height = state.currentImage.height;
    const ctx = combinedCanvas.getContext('2d');
    
    // 创建一个临时Canvas数组来存储所有二值图像数据
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
        
        // 遍历所有二值图像，计算当前像素的平均值
        tempCanvases.forEach(imageData => {
            // 二值图像只有黑白，我们取红色通道值即可(因为R=G=B)
            sum += imageData.data[i];
            count++;
        });
        
        const avg = Math.round(sum / count);
        combinedData[i] = 255-avg;     // R
        combinedData[i+1] = 255-avg;   // G
        combinedData[i+2] = 255-avg;   // B
        combinedData[i+3] = 255;   // Alpha (不透明)
    }
    
    // 将处理后的数据放回Canvas
    ctx.putImageData(combinedImageData, 0, 0);
    
    return combinedCanvas;
}

    /**
     * 显示所有阈值分割Canvas
     */
    function displayThresholdCanvases() {
        // 清空之前的显示
        dom.splitView.innerHTML = '';
        
        // 生成所有阈值Canvas
        const canvases = generateThresholdCanvases();
        if (canvases.length === 0) return;
        
        // 创建并显示每个Canvas
        canvases.forEach(({canvas, lower, index}) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'canvas-wrapper';
            
            // 显示阈值范围
            const label = document.createElement('div');
            label.className = 'canvas-label';
            label.textContent = `第 ${index}张纸`;
            
            // 限制显示大小
            const displayCanvas = document.createElement('canvas');
            const displaySize = calculateDisplaySize(canvas.width, canvas.height, 2);
            displayCanvas.width = displaySize.width;
            displayCanvas.height = displaySize.height;
            
            // 缩放绘制到显示Canvas
            const ctx = displayCanvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(canvas, 0, 0, displayCanvas.width, displayCanvas.height);
            // 添加到DOM
            wrapper.appendChild(label);
            wrapper.appendChild(displayCanvas);
            dom.splitView.appendChild(wrapper);
            
            // 添加下载按钮
            addDownloadButton(wrapper, canvas, `threshold_${index+1}_${lower}`);
        });
    }

    /**
     * 显示叠加Canvas
     */
    function displayCombinedCanvas() {
        const combinedCanvas = generateCombinedCanvas();
        if (!combinedCanvas) return;
        
        // 调整显示尺寸
        const displaySize = calculateDisplaySize(combinedCanvas.width, combinedCanvas.height, 2);
        dom.combinedCanvas.width = displaySize.width;
        dom.combinedCanvas.height = displaySize.height;
        
        // 绘制到显示Canvas
        const ctx = dom.combinedCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(combinedCanvas, 0, 0, dom.combinedCanvas.width, dom.combinedCanvas.height);
    }

    /**
     * 为每个Canvas添加下载按钮
     */
    function addDownloadButton(container, canvas, filename) {
        const btn = document.createElement('button');
        btn.className = 'download-btn';
        btn.textContent = '下载这张纸';
        btn.onclick = () => {
            const link = document.createElement('a');
            link.download = `${filename}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        };
        container.appendChild(btn);
    }

    /**
     * 计算适应显示区域的尺寸
     */
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

    /**
     * 下载所有分割区域
     */
    async function downloadAllRegions() {
        const canvases = generateThresholdCanvases();
        if (canvases.length === 0) return;
        
        // 逐个下载，添加延迟避免浏览器阻止
        for (const {canvas, lower, index} of canvases) {
            await new Promise(resolve => setTimeout(resolve, 300));
            
            const link = document.createElement('a');
            link.download = `Paper${index}.png`;
            link.href = canvas.toDataURL('image/png');
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            
            setTimeout(() => {
                document.body.removeChild(link);
            }, 100);
        }
    }

    // ============== 文件处理 ==============
    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                state.currentImage = img;
                
                // 显示主界面
                dom.container.classList.add('uploaded');
                dom.mainContent.style.display = 'grid';
                
                // 初始显示
                updateThresholdUI();
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
    
    // 下载所有
    dom.downloadAllBtn.addEventListener('click', downloadAllRegions);
    
    // 下载叠加图片
    dom.downloadCombinedBtn.addEventListener('click', () => {
        const combinedCanvas = generateCombinedCanvas();
        if (!combinedCanvas) return;
        
        const link = document.createElement('a');
        link.download = 'combined_thresholds.png';
        link.href = combinedCanvas.toDataURL('image/png');
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

    // 标签切换
    dom.tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // 更新活动标签
            dom.tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // 显示对应内容
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${btn.dataset.tab}-view`).classList.add('active');
            
            // 如果是叠加视图，更新显示
            if (btn.dataset.tab === 'combined') {
                displayCombinedCanvas();
            }
        });
    });

    // ============== 初始化 ==============
    updateThresholdUI(); // 初始化阈值控制点
});