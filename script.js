document.addEventListener('DOMContentLoaded', () => {
    // 获取DOM元素
    const uploadInput = document.getElementById('upload');
    const uploadArea = document.getElementById('uploadArea');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const thresholdInput = document.getElementById('threshold');
    const thresholdValue = document.getElementById('threshold-value');

    let currentImage = null;

    // 1. 点击上传处理
    uploadInput.addEventListener('change', handleFileSelect);

    // 2. 拖拽上传处理
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            uploadInput.files = e.dataTransfer.files;
            handleFileSelect({ target: uploadInput });
        }
    });

    // 3. 阈值调整处理
    thresholdInput.addEventListener('input', (e) => {
        const threshold = parseInt(e.target.value);
        thresholdValue.textContent = threshold;
        if (currentImage) applyThreshold(threshold);
    });

    // 文件处理函数
    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                currentImage = img;
                canvas.width = img.width;
                canvas.height = img.height;
                applyThreshold(parseInt(thresholdInput.value));
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    // 二值化处理函数
    function applyThreshold(threshold) {
        ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const gray = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
            const binaryValue = gray >= threshold ? 255 : 0;
            data[i] = data[i + 1] = data[i + 2] = binaryValue;
        }

        ctx.putImageData(imageData, 0, 0);
    }
});