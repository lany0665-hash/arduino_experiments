/* ========================================
   자유낙하 및 2차원 운동 분석
   - 탭 기능 (자유낙하 / 2차원 운동)
   - 모바일 터치 확대 선택
   - 픽셀-실제 길이 보정
   ======================================== */

const fileInput = document.getElementById('video-upload');
const fpsInput = document.getElementById('fps-input');
const stepSlider = document.getElementById('step-slider');
const stepVal = document.getElementById('step-val');
const pixelToMmInput = document.getElementById('pixel-to-mm');

const btnExtract = document.getElementById('btn-extract');
const btnManualTrack = document.getElementById('btn-manual-track');
const btnStrobo = document.getElementById('btn-strobo');
const btnReset = document.getElementById('btn-reset');
const btnCsv = document.getElementById('btn-csv');
const btnDownloadStrobo = document.getElementById('btn-download-strobo');
const btnPrevFrame = document.getElementById('btn-prev-frame');
const btnNextFrame = document.getElementById('btn-next-frame');
const btnUndoPoint = document.getElementById('btn-undo-point');
const btnClearPoints = document.getElementById('btn-clear-points');

const statusMsg = document.getElementById('status-msg');
const loadingOverlay = document.getElementById('loading-overlay');
const progressText = document.getElementById('progress-text');
const trackControls = document.getElementById('track-controls');
const frameNavControls = document.getElementById('frame-nav-controls');
const stroboContainer = document.getElementById('strobo-container');
const trackingInfo = document.getElementById('tracking-info');
const selectedCount = document.getElementById('selected-count');
const frameInput = document.getElementById('frame-input');
const frameTotal = document.getElementById('frame-total');

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

const canvasStrobo = document.getElementById('canvas-strobo');
const ctxStrobo = canvasStrobo.getContext('2d', { willReadFrequently: true });
const chartWrapper = document.getElementById('chart-wrapper');

const zoomOverlay = document.getElementById('zoom-overlay');
const zoomCanvas = document.getElementById('zoom-canvas');
const zoomCtx = zoomCanvas.getContext('2d', { willReadFrequently: true });

let frames = [];
let dataPoints = [];
let chartInstance = null;
let fps = 30;
let frameInterval = 1 / fps;
let extractionTime = 0;
let currentFrameIndex = 0;
let isSelectingMode = false;
let currentAnalysisMode = 'free-fall';

const MAX_DIMENSION = 800;
const MAX_FRAMES = 150;
const ZOOM_RADIUS = 110;
const ZOOM_SCALE = 3;

/* ========================================
   탭 전환
   ======================================== */
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentAnalysisMode = e.target.dataset.tab;
        
        const chartTitle = document.getElementById('chart-title');
        if (currentAnalysisMode === 'free-fall') {
            chartTitle.innerText = '자유낙하 t-y 그래프';
        } else {
            chartTitle.innerText = '2차원 운동 궤적 (X-Y 그래프)';
        }
        console.log('Switched to mode:', currentAnalysisMode);
    });
});

/* ========================================
   단계 1: 영상 로드 및 프레임 추출
   ======================================== */

stepSlider.addEventListener('input', (e) => {
    stepVal.innerText = e.target.value;
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fileURL = URL.createObjectURL(file);
    video.src = fileURL;
    statusMsg.innerText = "영상이 로드되었습니다. '영상 로드 및 추출' 버튼을 누르세요.";
});

video.addEventListener('error', () => {
    alert("브라우저에서 지원하지 않는 영상 포맷입니다.");
    btnExtract.disabled = false;
});

btnExtract.addEventListener('click', () => {
    if (!video.src) { alert("동영상 파일을 선택해주세요."); return; }

    fps = parseInt(fpsInput.value) || 30;
    frameInterval = 1 / fps;
    frames = [];
    dataPoints = [];
    extractionTime = 0;
    currentFrameIndex = 0;

    btnExtract.disabled = true;
    fileInput.disabled = true;
    fpsInput.disabled = true;
    loadingOverlay.style.display = 'block';
    statusMsg.innerText = "2단계: 프레임 추출 중...";

    let vw = video.videoWidth;
    let vh = video.videoHeight;
    if (vw > vh) {
        if (vw > MAX_DIMENSION) { vh *= MAX_DIMENSION / vw; vw = MAX_DIMENSION; }
    } else {
        if (vh > MAX_DIMENSION) { vw *= MAX_DIMENSION / vh; vh = MAX_DIMENSION; }
    }

    canvas.width = vw;
    canvas.height = vh;
    canvasStrobo.width = vw;
    canvasStrobo.height = vh;

    video.currentTime = 0;
    video.addEventListener('seeked', extractFrameListener);
});

function extractFrameListener() {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push({
        img: ctx.getImageData(0, 0, canvas.width, canvas.height),
        time: extractionTime
    });
    progressText.innerText = `(${frames.length} 프레임)`;
    extractionTime += frameInterval;

    if (extractionTime <= video.duration && frames.length < MAX_FRAMES) {
        video.currentTime = extractionTime;
    } else {
        video.removeEventListener('seeked', extractFrameListener);
        finishExtraction();
    }
}

function finishExtraction() {
    loadingOverlay.style.display = 'none';
    if (frames.length > 0) {
        currentFrameIndex = 0;
        displayFrame(currentFrameIndex);
        trackControls.style.display = 'flex';
        btnManualTrack.style.display = 'inline-block';
        frameTotal.innerText = `/ ${frames.length}`;
        statusMsg.innerText = `3단계: '수동 선택 시작'을 누르고 각 프레임에서 물체 중심을 클릭하세요.`;
    } else {
        statusMsg.innerText = "프레임 추출 실패. 영상 포맷을 확인해주세요.";
        btnExtract.disabled = false;
    }
}

/* ========================================
   단계 2: 프레임 네비게이션
   ======================================== */

function displayFrame(index) {
    if (index < 0) index = 0;
    if (index >= frames.length) index = frames.length - 1;
    currentFrameIndex = index;
    frameInput.value = index + 1;

    ctx.putImageData(frames[index].img, 0, 0);
    drawSelectedPoint(index);
}

function drawSelectedPoint(frameIndex) {
    const dp = dataPoints.find(d => d.frameIndex === frameIndex);
    if (dp) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
        ctx.beginPath();
        ctx.arc(dp.x, dp.y, 8, 0, 2 * Math.PI);
        ctx.fill();

        ctx.strokeStyle = 'yellow';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(dp.x, dp.y, 8, 0, 2 * Math.PI);
        ctx.stroke();
    }
}

btnPrevFrame.addEventListener('click', () => {
    if (isSelectingMode) displayFrame(currentFrameIndex - 1);
});

btnNextFrame.addEventListener('click', () => {
    if (isSelectingMode) displayFrame(currentFrameIndex + 1);
});

frameInput.addEventListener('change', () => {
    let index = parseInt(frameInput.value) - 1;
    if (isNaN(index)) index = 0;
    displayFrame(index);
});

/* ========================================
   단계 3: 수동 선택 모드
   ======================================== */

btnManualTrack.addEventListener('click', () => {
    isSelectingMode = true;
    dataPoints = [];
    currentFrameIndex = 0;

    btnManualTrack.style.display = 'none';
    frameNavControls.style.display = 'flex';
    trackingInfo.style.display = 'block';
    btnStrobo.style.display = 'inline-block';

    displayFrame(0);
    statusMsg.innerText = "3단계: 캔버스 위의 물체 중심을 클릭하세요. 모바일에서는 길게 눌러 확대 선택이 가능합니다.";
});

/* ========================================
   터치 확대 선택 (모바일 정확도 향상)
   ======================================== */

let touchStartTime = 0;
let isLongPress = false;
let zoomX = 0;
let zoomY = 0;

canvas.addEventListener('touchstart', (event) => {
    if (!isSelectingMode) return;
    touchStartTime = Date.now();
    isLongPress = false;
    const { x, y } = getCanvasCoordinates(event);
    zoomX = x;
    zoomY = y;
}, false);

canvas.addEventListener('touchmove', (event) => {
    if (!isSelectingMode || Date.now() - touchStartTime < 500) return;
    if (!isLongPress) {
        isLongPress = true;
        showZoomOverlay(zoomX, zoomY);
    }
    const { x, y } = getCanvasCoordinates(event);
    updateZoomOverlay(x, y);
    event.preventDefault();
}, false);

canvas.addEventListener('touchend', (event) => {
    if (!isSelectingMode) return;
    
    if (isLongPress) {
        const { x, y } = getCanvasCoordinates(event.changedTouches[0]);
        addDataPoint(x, y);
    } else {
        const touchEndX = event.changedTouches[0].clientX;
        const touchEndY = event.changedTouches[0].clientY;
        const deltaX = touchEndX - (event.touches[0]?.clientX || touchEndX);
        const deltaY = touchEndY - (event.touches[0]?.clientY || touchEndY);
        
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 30) {
            if (deltaX > 0) {
                displayFrame(currentFrameIndex + 1);
            } else {
                displayFrame(currentFrameIndex - 1);
            }
        } else if (Math.abs(deltaX) <= 10 && Math.abs(deltaY) <= 10) {
            addDataPoint(zoomX, zoomY);
        }
    }
    
    zoomOverlay.style.display = 'none';
    isLongPress = false;
}, false);

function showZoomOverlay(x, y) {
    zoomOverlay.style.display = 'block';
    updateZoomOverlay(x, y);
}

function updateZoomOverlay(x, y) {
    zoomX = x;
    zoomY = y;
    
    const left = Math.min(x / canvas.width * 100, 85);
    zoomOverlay.style.left = left + '%';
    
    const sourceCanvas = canvas;
    const sourceX = Math.max(0, Math.min(x - ZOOM_RADIUS / ZOOM_SCALE, sourceCanvas.width - ZOOM_RADIUS / ZOOM_SCALE * 2));
    const sourceY = Math.max(0, Math.min(y - ZOOM_RADIUS / ZOOM_SCALE, sourceCanvas.height - ZOOM_RADIUS / ZOOM_SCALE * 2));
    
    zoomCtx.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
    zoomCtx.drawImage(
        sourceCanvas,
        sourceX, sourceY, ZOOM_RADIUS / ZOOM_SCALE * 2, ZOOM_RADIUS / ZOOM_SCALE * 2,
        0, 0, zoomCanvas.width, zoomCanvas.height
    );
    
    zoomCtx.strokeStyle = '#f00';
    zoomCtx.lineWidth = 2;
    zoomCtx.beginPath();
    zoomCtx.arc(ZOOM_RADIUS, ZOOM_RADIUS, 6, 0, 2 * Math.PI);
    zoomCtx.stroke();
}

/* ========================================
   마우스 및 클릭
   ======================================== */

let mouseDownX = 0;
let mouseDownY = 0;
let isMouseDown = false;

canvas.addEventListener('mousedown', (event) => {
    if (!isSelectingMode) return;
    isMouseDown = true;
    mouseDownX = event.clientX;
    mouseDownY = event.clientY;
});

canvas.addEventListener('mousemove', (event) => {
    if (isMouseDown) {
        event.preventDefault();
    }
});

canvas.addEventListener('mouseup', (event) => {
    if (!isSelectingMode || !isMouseDown) return;
    isMouseDown = false;
    
    const mouseUpX = event.clientX;
    const mouseUpY = event.clientY;
    const deltaX = mouseUpX - mouseDownX;
    const deltaY = mouseUpY - mouseDownY;
    
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 40) {
        if (deltaX > 0) {
            displayFrame(currentFrameIndex + 1);
        } else {
            displayFrame(currentFrameIndex - 1);
        }
    } else if (Math.abs(deltaX) <= 10 && Math.abs(deltaY) <= 10) {
        const { x, y } = getCanvasCoordinates(event);
        addDataPoint(x, y);
    }
});

function getCanvasCoordinates(event) {
    const rect = canvas.getBoundingClientRect();
    const canvasDisplayWidth = rect.width;
    const canvasDisplayHeight = rect.height;
    const canvasActualWidth = canvas.width;
    const canvasActualHeight = canvas.height;
    
    let clientX, clientY;
    if (event.touches) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else {
        clientX = event.clientX;
        clientY = event.clientY;
    }
    
    const scaleX = canvasActualWidth / canvasDisplayWidth;
    const scaleY = canvasActualHeight / canvasDisplayHeight;
    
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    
    return { x, y };
}

function addDataPoint(x, y) {
    const existingIndex = dataPoints.findIndex(d => d.frameIndex === currentFrameIndex);
    if (existingIndex >= 0) {
        dataPoints.splice(existingIndex, 1);
    }

    dataPoints.push({
        time: frames[currentFrameIndex].time,
        x: x,
        y: y,
        frameIndex: currentFrameIndex,
        realX: x * parseFloat(pixelToMmInput.value),
        realY: y * parseFloat(pixelToMmInput.value)
    });

    selectedCount.innerText = dataPoints.length;
    displayFrame(currentFrameIndex);

    if (currentFrameIndex < frames.length - 1) {
        setTimeout(() => displayFrame(currentFrameIndex + 1), 300);
    }
}

btnUndoPoint.addEventListener('click', () => {
    if (dataPoints.length > 0) {
        dataPoints.pop();
        selectedCount.innerText = dataPoints.length;
        displayFrame(currentFrameIndex);
    }
});

btnClearPoints.addEventListener('click', () => {
    if (confirm('선택된 모든 점을 초기화하시겠습니까?')) {
        dataPoints = [];
        selectedCount.innerText = '0';
        displayFrame(currentFrameIndex);
    }
});

/* ========================================
   단계 4: 다중섬광사진 합성
   ======================================== */

btnStrobo.addEventListener('click', () => {
    if (dataPoints.length === 0) {
        alert('선택된 점이 없습니다. 먼저 물체 중심을 선택해주세요.');
        return;
    }

    const step = parseInt(stepSlider.value);
    stroboContainer.style.display = 'block';

    const offCanvas = document.createElement('canvas');
    offCanvas.width = canvas.width;
    offCanvas.height = canvas.height;
    const offCtx = offCanvas.getContext('2d');

    ctxStrobo.putImageData(frames[0].img, 0, 0);
    ctxStrobo.globalCompositeOperation = 'darken';

    for (let i = step; i < frames.length; i += step) {
        offCtx.putImageData(frames[i].img, 0, 0);
        ctxStrobo.drawImage(offCanvas, 0, 0);
    }

    ctxStrobo.globalCompositeOperation = 'source-over';

    if (dataPoints.length > 0) {
        const startTime = frames[0].time;
        let prevPoint = null;

        for (let i = 0; i < dataPoints.length; i++) {
            const dp = dataPoints[i];

            ctxStrobo.fillStyle = 'red';
            ctxStrobo.beginPath();
            ctxStrobo.arc(dp.x, dp.y, 5, 0, 2 * Math.PI);
            ctxStrobo.fill();

            ctxStrobo.strokeStyle = 'yellow';
            ctxStrobo.lineWidth = 2;
            ctxStrobo.beginPath();
            ctxStrobo.arc(dp.x, dp.y, 5, 0, 2 * Math.PI);
            ctxStrobo.stroke();

            const timeText = (dp.time - startTime).toFixed(3) + 's';
            ctxStrobo.font = "bold 14px 'Segoe UI', Arial, sans-serif";
            ctxStrobo.fillStyle = "yellow";
            ctxStrobo.shadowColor = "black";
            ctxStrobo.shadowBlur = 4;
            ctxStrobo.shadowOffsetX = 1;
            ctxStrobo.shadowOffsetY = 1;

            ctxStrobo.fillText(timeText, dp.x + 12, dp.y + 6);

            ctxStrobo.shadowColor = "transparent";
            ctxStrobo.shadowBlur = 0;
            ctxStrobo.shadowOffsetX = 0;
            ctxStrobo.shadowOffsetY = 0;

            if (prevPoint) {
                ctxStrobo.strokeStyle = 'rgba(255, 0, 0, 0.5)';
                ctxStrobo.lineWidth = 2;
                ctxStrobo.beginPath();
                ctxStrobo.moveTo(prevPoint.x, prevPoint.y);
                ctxStrobo.lineTo(dp.x, dp.y);
                ctxStrobo.stroke();
            }
            prevPoint = dp;
        }
    }

    isSelectingMode = false;
    frameNavControls.style.display = 'none';
    trackingInfo.style.display = 'none';
    statusMsg.innerText = "분석 완료! 그래프와 합성된 사진을 확인하세요.";
    drawGraph();
    btnCsv.style.display = 'inline-block';
    stroboContainer.scrollIntoView({ behavior: 'smooth' });
});

/* ========================================
   그래프 및 데이터 내보내기
   ======================================== */

function drawGraph() {
    chartWrapper.style.display = 'block';
    const ctxChart = document.getElementById('chart').getContext('2d');

    if (dataPoints.length === 0) return;

    const startTime = frames[0].time;
    const pixelToMm = parseFloat(pixelToMmInput.value);
    
    if (currentAnalysisMode === 'free-fall') {
        // 자유낙하: 시간 vs Y 좌표
        const scatterData = dataPoints.map(dp => ({
            x: (dp.time - startTime).toFixed(4),
            y: (dp.y * pixelToMm).toFixed(2)
        }));

        if (chartInstance) chartInstance.destroy();
        chartInstance = new Chart(ctxChart, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: '낙하 거리 (mm)',
                    data: scatterData,
                    backgroundColor: 'red',
                    borderColor: 'red',
                    showLine: true,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 6
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        title: {
                            display: true,
                            text: '경과 시간 (초)',
                            font: { size: 14 }
                        }
                    },
                    y: {
                        reverse: true,
                        title: {
                            display: true,
                            text: '낙하 거리 (mm)',
                            font: { size: 14 }
                        }
                    }
                }
            }
        });
    } else {
        // 2차원 운동: X vs Y 궤적 (Position graph)
        const trajectoryData = dataPoints.map(dp => ({
            x: (dp.x * pixelToMm).toFixed(2),
            y: (dp.y * pixelToMm).toFixed(2)
        }));

        if (chartInstance) chartInstance.destroy();
        chartInstance = new Chart(ctxChart, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: '물체 궤적',
                    data: trajectoryData,
                    backgroundColor: 'blue',
                    borderColor: 'blue',
                    showLine: true,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 6
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        title: {
                            display: true,
                            text: 'X 위치 (mm)',
                            font: { size: 14 }
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Y 위치 (mm)',
                            font: { size: 14 }
                        }
                    }
                },
                aspectRatio: 1.2
            }
        });
    }
}

btnDownloadStrobo.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'stroboscopic_image.png';
    link.href = canvasStrobo.toDataURL('image/png');
    link.click();
});

btnCsv.addEventListener('click', () => {
    if (dataPoints.length === 0) return;
    const startTime = frames[0].time;
    const pixelToMm = parseFloat(pixelToMmInput.value);
    
    if (currentAnalysisMode === 'free-fall') {
        let csvContent = "data:text/csv;charset=utf-8,Time (s),X Position (mm),Y Position (mm)\n";
        dataPoints.forEach(row => {
            csvContent += `${(row.time - startTime).toFixed(4)},${(row.x * pixelToMm).toFixed(2)},${(row.y * pixelToMm).toFixed(2)}\n`;
        });
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", "free_fall_analysis.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else {
        // 2차원 운동: 시간, X, Y 위치 포함
        let csvContent = "data:text/csv;charset=utf-8,Time (s),X Position (mm),Y Position (mm)\n";
        dataPoints.forEach(row => {
            csvContent += `${(row.time - startTime).toFixed(4)},${(row.x * pixelToMm).toFixed(2)},${(row.y * pixelToMm).toFixed(2)}\n`;
        });
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", "projectile_motion_analysis.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
});

btnReset.addEventListener('click', () => { location.reload(); });
