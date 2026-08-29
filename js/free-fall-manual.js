/* ========================================
   자유낙하 궤적 분석 - 수동 선택 방식
   ======================================== */

const fileInput = document.getElementById('video-upload');
const fpsInput = document.getElementById('fps-input');
const stepSlider = document.getElementById('step-slider');
const stepVal = document.getElementById('step-val');

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

let frames = [];
let dataPoints = [];
let chartInstance = null;
let fps = 30;
let frameInterval = 1 / fps;
let extractionTime = 0;
let currentFrameIndex = 0;
let isSelectingMode = false;

const MAX_DIMENSION = 800;
const MAX_FRAMES = 150;

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

    // 이미 선택된 점이 있으면 표시
    drawSelectedPoint(index);
}

function drawSelectedPoint(frameIndex) {
    const dp = dataPoints.find(d => d.frameIndex === frameIndex);
    if (dp) {
        // 선택된 점 표시
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
    statusMsg.innerText = "3단계: 캔버스 위의 물체 중심을 클릭하세요. 프레임 네비게이션을 사용하여 다음 선택 위치로 이동하세요.";
});

// 캔버스 클릭 이벤트 - 물체 중심 선택
canvas.addEventListener('click', (event) => {
    if (!isSelectingMode) return;

    const rect = canvas.getBoundingClientRect();
    
    // Canvas의 실제 픽셀 크기와 CSS 표시 크기의 비율 계산
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    // 클릭 위치를 Canvas 픽셀 좌표로 변환
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    // 이미 이 프레임에서 선택했다면 기존 점 제거
    const existingIndex = dataPoints.findIndex(d => d.frameIndex === currentFrameIndex);
    if (existingIndex >= 0) {
        dataPoints.splice(existingIndex, 1);
    }

    // 새로운 점 추가
    dataPoints.push({
        time: frames[currentFrameIndex].time,
        x: x,
        y: y,
        frameIndex: currentFrameIndex
    });

    selectedCount.innerText = dataPoints.length;
    displayFrame(currentFrameIndex);

    // 자동으로 다음 프레임으로 이동 (선택적)
    if (currentFrameIndex < frames.length - 1) {
        setTimeout(() => displayFrame(currentFrameIndex + 1), 300);
    }
});

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

    // 1. 다중섬광사진 합성
    stroboContainer.style.display = 'block';

    const offCanvas = document.createElement('canvas');
    offCanvas.width = canvas.width;
    offCanvas.height = canvas.height;
    const offCtx = offCanvas.getContext('2d');

    // 첫 프레임(배경) 그리기
    ctxStrobo.putImageData(frames[0].img, 0, 0);
    ctxStrobo.globalCompositeOperation = 'darken';

    // 슬라이더 간격(step)에 맞춰 프레임 겹치기
    for (let i = step; i < frames.length; i += step) {
        offCtx.putImageData(frames[i].img, 0, 0);
        ctxStrobo.drawImage(offCanvas, 0, 0);
    }

    ctxStrobo.globalCompositeOperation = 'source-over';

    // 2. 선택된 포인트와 궤적 표시
    if (dataPoints.length > 0) {
        const startTime = frames[0].time;
        let prevPoint = null;

        for (let i = 0; i < dataPoints.length; i++) {
            const dp = dataPoints[i];

            // 원 표시
            ctxStrobo.fillStyle = 'red';
            ctxStrobo.beginPath();
            ctxStrobo.arc(dp.x, dp.y, 5, 0, 2 * Math.PI);
            ctxStrobo.fill();

            // 외곽선
            ctxStrobo.strokeStyle = 'yellow';
            ctxStrobo.lineWidth = 2;
            ctxStrobo.beginPath();
            ctxStrobo.arc(dp.x, dp.y, 5, 0, 2 * Math.PI);
            ctxStrobo.stroke();

            // 타임스탬프
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

            // 선 긋기
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
    const scatterData = dataPoints.map(dp => ({
        x: (dp.time - startTime).toFixed(4),
        y: dp.y.toFixed(1)
    }));

    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctxChart, {
        type: 'scatter',
        data: {
            datasets: [{
                label: '선택된 Y좌표 (Pixel)',
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
                        text: '낙하 거리 Y (Pixel)',
                        font: { size: 14 }
                    }
                }
            }
        }
    });
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
    let csvContent = "data:text/csv;charset=utf-8,Time (s),X Position (px),Y Position (px)\n";
    dataPoints.forEach(row => {
        csvContent += `${(row.time - startTime).toFixed(4)},${row.x.toFixed(1)},${row.y.toFixed(1)}\n`;
    });
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", "free_fall_analysis.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

btnReset.addEventListener('click', () => { location.reload(); });
