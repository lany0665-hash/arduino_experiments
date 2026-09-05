// phone-accel.js (updated)
// 실시간 가속도 표시, 타임라인 선택 크롭 기능 (ms 단위)

let recording = false;
let samples = [];       // {t: absolute unix time, rel: ms from session start, ax, ay, az}
let originalSamples = null;
let sessionStart = null;
let selectionMode = 0;  // 0: waiting, 1: start selected, 2: both selected
let cropStartMs = null;
let cropEndMs = null;
const MAX_SAMPLES = 200; // buffer size

const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnDownload = document.getElementById('btn-download');
const btnCrop = document.getElementById('btn-crop');
const btnResetData = document.getElementById('btn-reset-data');
const selectionStatus = document.getElementById('selection-status');
const timeRangeSpan = document.getElementById('time-range');
const axEl = document.getElementById('ax');
const ayEl = document.getElementById('ay');
const azEl = document.getElementById('az');
const atotEl = document.getElementById('atot');
const bufferSizeEl = document.getElementById('buffer-size');

bufferSizeEl.innerText = MAX_SAMPLES;

// Timeline canvas setup
const timelineCanvasEl = document.getElementById('timelineCanvas');
const timelineCtx = timelineCanvasEl.getContext('2d');
let timelineWidth = timelineCanvasEl.offsetWidth || 600;
let timelineHeight = 50;

function resizeTimelineCanvas() {
    const rect = timelineCanvasEl.getBoundingClientRect();
    timelineWidth = rect.width || 600;
    timelineCanvasEl.width = timelineWidth;
    timelineCanvasEl.height = timelineHeight;
}
resizeTimelineCanvas();

// Chart.js 초기화 (x-axis in milliseconds)
const ctx = document.getElementById('accChart').getContext('2d');
const accChart = new Chart(ctx, {
    type: 'line',
    data: {
        datasets: [
            { label: 'Ax (g)', data: [], borderColor: '#e74c3c', borderWidth: 1, tension:0.15, pointRadius:0, fill:false },
            { label: 'Ay (g)', data: [], borderColor: '#3498db', borderWidth: 1, tension:0.15, pointRadius:0, fill:false },
            { label: 'Az (g)', data: [], borderColor: '#2ecc71', borderWidth: 1, tension:0.15, pointRadius:0, fill:false }
        ]
    },
    options: {
        animation: false,
        responsive: true,
        scales: {
            x: { type: 'linear', title: { display: true, text: 'time (ms)'} },
            y: { suggestedMin: -2, suggestedMax: 2, title: { display: true, text: 'g' } }
        }
    }
});

function updateTimeRangeDisplay() {
    if (samples.length === 0) {
        timeRangeSpan.innerText = '전체: 0 ms';
        drawTimeline();
        return;
    }
    const minMs = Math.min(...samples.map(s => s.rel));
    const maxMs = Math.max(...samples.map(s => s.rel));
    const rangeMs = maxMs - minMs;
    timeRangeSpan.innerText = `전체: ${rangeMs.toFixed(0)} ms`;
    drawTimeline();
}

function rebuildChartDataFromSamples() {
    accChart.data.datasets[0].data = samples.map(s => ({ x: s.rel, y: s.ax }));
    accChart.data.datasets[1].data = samples.map(s => ({ x: s.rel, y: s.ay }));
    accChart.data.datasets[2].data = samples.map(s => ({ x: s.rel, y: s.az }));
    accChart.update();
    updateTimeRangeDisplay();
}

function handleMotion(event) {
    // event.accelerationIncludingGravity gives m/s^2; convert to g by /9.80665
    const ax = event.accelerationIncludingGravity.x || 0;
    const ay = event.accelerationIncludingGravity.y || 0;
    const az = event.accelerationIncludingGravity.z || 0;
    const gx = ax / 9.80665;
    const gy = ay / 9.80665;
    const gz = az / 9.80665;
    const atot = Math.sqrt(gx*gx + gy*gy + gz*gz);

    // Update UI
    axEl.innerText = gx.toFixed(2);
    ayEl.innerText = gy.toFixed(2);
    azEl.innerText = gz.toFixed(2);
    atotEl.innerText = atot.toFixed(2);

    if (!recording) return;

    const t = Date.now(); // unix time in ms
    if (!sessionStart) sessionStart = t;
    const rel = t - sessionStart; // relative time in ms
    samples.push({ t, rel, ax: gx, ay: gy, az: gz });
    if (samples.length > MAX_SAMPLES) samples.shift();

    // Keep originalSamples updated when not cropping
    if (!originalSamples) originalSamples = samples.slice();

    // Update chart datasets (linear x in ms)
    accChart.data.datasets[0].data.push({ x: rel, y: gx });
    accChart.data.datasets[1].data.push({ x: rel, y: gy });
    accChart.data.datasets[2].data.push({ x: rel, y: gz });

    // Trim dataset length
    accChart.data.datasets.forEach(ds => { while (ds.data.length > MAX_SAMPLES) ds.data.shift(); });
    accChart.update('none');

    // Enable crop/reset/download buttons when data present
    if (samples.length > 0) {
        btnCrop.disabled = false;
        btnResetData.disabled = false;
        btnDownload.disabled = false;
    }
    
    updateTimeRangeDisplay();
}

async function startRecording() {
    // iOS permission
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const perm = await DeviceMotionEvent.requestPermission();
            if (perm !== 'granted') { alert('가속도 권한이 필요합니다'); return; }
        } catch (e) { alert('가속도 권한 요청 실패'); return; }
    }

    // reset session state
    sessionStart = null;
    samples = [];
    originalSamples = null;
    selectionMode = 0;
    cropStartMs = null;
    cropEndMs = null;
    accChart.data.datasets.forEach(ds => ds.data = []);
    accChart.update();

    window.addEventListener('devicemotion', handleMotion);
    recording = true;
    btnStart.disabled = true; btnStop.disabled = false; btnDownload.disabled = true; // download enabled after data
    btnCrop.disabled = true; btnResetData.disabled = true;
    
    updateTimeRangeDisplay();
    updateSelectionStatus();
}

function stopRecording() {
    window.removeEventListener('devicemotion', handleMotion);
    recording = false;
    btnStart.disabled = false; btnStop.disabled = true;
}

function downloadCSV() {
    if (samples.length === 0) return alert('저장할 데이터가 없습니다');
    let csv = 'time(ms),ax(g),ay(g),az(g)\n';
    const start = samples[0].rel; // start from first sample time in ms
    samples.forEach(s => {
        csv += `${(s.rel-start).toFixed(1)},${s.ax.toFixed(4)},${s.ay.toFixed(4)},${s.az.toFixed(4)}\n`;
    });
    const link = document.createElement('a');
    link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    link.download = 'phone_accelerometer.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Crop to selected timeline range (graph click selection)
function cropToSelection() {
    if (cropStartMs === null || cropEndMs === null) {
        return alert('시작 지점과 종료 지점을 모두 선택하세요.');
    }

    if (cropStartMs >= cropEndMs) {
        return alert('유효한 시간 범위를 선택하세요. (시작 < 종료)');
    }

    // Ensure originalSamples saved for reset
    if (!originalSamples) originalSamples = samples.slice();

    // filter samples by rel time between cropStartMs and cropEndMs
    const filtered = originalSamples.filter(s => s.rel >= cropStartMs && s.rel <= cropEndMs);
    if (filtered.length === 0) return alert('선택된 구간에 데이터가 없습니다.');

    samples = filtered;
    // rebuild chart data
    rebuildChartDataFromSamples();
    accChart.update();
    
    // Reset selection
    selectionMode = 0;
    cropStartMs = null;
    cropEndMs = null;
    updateSelectionStatus();
}

function resetDataToOriginal() {
    if (!originalSamples) return alert('복원할 원본 데이터가 없습니다.');
    samples = originalSamples.slice();
    rebuildChartDataFromSamples();
    accChart.update();
    
    // Reset selection
    selectionMode = 0;
    cropStartMs = null;
    cropEndMs = null;
    updateSelectionStatus();
}

function updateSelectionStatus() {
    if (selectionMode === 0) {
        selectionStatus.innerText = '준비됨';
        selectionStatus.style.color = '#666';
        btnCrop.disabled = true;
    } else if (selectionMode === 1) {
        selectionStatus.innerText = `시작 지점 선택됨 (${cropStartMs.toFixed(0)} ms)`;
        selectionStatus.style.color = '#e74c3c';
        btnCrop.disabled = true;
    } else if (selectionMode === 2) {
        selectionStatus.innerText = `구간 선택됨: ${cropStartMs.toFixed(0)}~${cropEndMs.toFixed(0)} ms`;
        selectionStatus.style.color = '#27ae60';
        btnCrop.disabled = false;
    }
    drawTimeline();
}

function drawTimeline() {
    resizeTimelineCanvas();
    const padding = 20;
    const drawWidth = timelineWidth - 2 * padding;
    const drawHeight = timelineHeight - 10;
    
    // Clear
    timelineCtx.fillStyle = '#f8f9fa';
    timelineCtx.fillRect(0, 0, timelineWidth, timelineHeight);
    
    if (samples.length === 0) return;
    
    const minMs = Math.min(...samples.map(s => s.rel));
    const maxMs = Math.max(...samples.map(s => s.rel));
    const rangeMs = maxMs - minMs;
    
    if (rangeMs === 0) return;
    
    // Draw background (data range)
    timelineCtx.fillStyle = '#e8e8e8';
    timelineCtx.fillRect(padding, 5, drawWidth, drawHeight);
    
    // Draw selection area if exists
    if (cropStartMs !== null && cropEndMs !== null) {
        const startPx = padding + ((cropStartMs - minMs) / rangeMs) * drawWidth;
        const endPx = padding + ((cropEndMs - minMs) / rangeMs) * drawWidth;
        timelineCtx.fillStyle = 'rgba(39, 174, 96, 0.3)';
        timelineCtx.fillRect(startPx, 5, endPx - startPx, drawHeight);
    }
    
    // Draw start line if selected
    if (cropStartMs !== null) {
        const startPx = padding + ((cropStartMs - minMs) / rangeMs) * drawWidth;
        timelineCtx.strokeStyle = '#e74c3c';
        timelineCtx.lineWidth = 2;
        timelineCtx.beginPath();
        timelineCtx.moveTo(startPx, 5);
        timelineCtx.lineTo(startPx, timelineHeight - 5);
        timelineCtx.stroke();
    }
    
    // Draw end line if selected
    if (cropEndMs !== null) {
        const endPx = padding + ((cropEndMs - minMs) / rangeMs) * drawWidth;
        timelineCtx.strokeStyle = '#27ae60';
        timelineCtx.lineWidth = 2;
        timelineCtx.beginPath();
        timelineCtx.moveTo(endPx, 5);
        timelineCtx.lineTo(endPx, timelineHeight - 5);
        timelineCtx.stroke();
    }
    
    // Draw border
    timelineCtx.strokeStyle = '#ddd';
    timelineCtx.lineWidth = 1;
    timelineCtx.strokeRect(padding, 5, drawWidth, drawHeight);
}

// Handle timeline click
function onTimelineClick(event) {
    if (samples.length === 0) return;
    
    const rect = timelineCanvasEl.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const padding = 20;
    const drawWidth = timelineWidth - 2 * padding;
    
    if (x < padding || x > padding + drawWidth) return;
    
    const minMs = Math.min(...samples.map(s => s.rel));
    const maxMs = Math.max(...samples.map(s => s.rel));
    const rangeMs = maxMs - minMs;
    
    if (rangeMs === 0) return;
    
    const timeMs = minMs + ((x - padding) / drawWidth) * rangeMs;
    
    if (selectionMode === 0) {
        // First click: set start
        cropStartMs = timeMs;
        selectionMode = 1;
    } else if (selectionMode === 1) {
        // Second click: set end
        if (timeMs <= cropStartMs) {
            alert('종료 지점이 시작 지점보다 뒤에 와야 합니다.');
            return;
        }
        cropEndMs = timeMs;
        selectionMode = 2;
    } else if (selectionMode === 2) {
        // Third click: reset and start over
        selectionMode = 0;
        cropStartMs = null;
        cropEndMs = null;
    }
    
    updateSelectionStatus();
}

// Button wiring
btnStart.addEventListener('click', startRecording);
btnStop.addEventListener('click', stopRecording);
btnDownload.addEventListener('click', downloadCSV);
btnCrop.addEventListener('click', cropToSelection);
btnResetData.addEventListener('click', resetDataToOriginal);

// Timeline click for selection
timelineCanvasEl.addEventListener('click', onTimelineClick);

// Initialize empty chart data arrays
(function initChartBuffer(){
    accChart.data.datasets.forEach(ds => { ds.data = []; });
    accChart.update();
    updateTimeRangeDisplay();
    updateSelectionStatus();
})();
