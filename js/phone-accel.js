let recording = false;
let samples = [];
let originalSamples = null;
let sessionStart = null;
let selectionMode = 0;
let cropStartMs = null;
let cropEndMs = null;
const MAX_SAMPLES = 200;

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
const accChartCanvasEl = document.getElementById('accChart');

bufferSizeEl.innerText = MAX_SAMPLES;

function getRange() {
    if (samples.length === 0) return { minMs: 0, maxMs: 0, rangeMs: 0 };
    const minMs = Math.min(...samples.map(s => s.rel));
    const maxMs = Math.max(...samples.map(s => s.rel));
    return { minMs, maxMs, rangeMs: maxMs - minMs };
}

// Chart.js plugin: draws the selected start/end markers directly on the
// chart's own plot area, using the x-axis scale so they line up exactly
// with the time values on the axis.
const selectionOverlayPlugin = {
    id: 'selectionOverlay',
    afterDatasetsDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!chartArea || !scales.x) return;
        const xScale = scales.x;

        const drawLine = (ms, color) => {
            const px = xScale.getPixelForValue(ms);
            if (px < chartArea.left || px > chartArea.right) return;
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px, chartArea.top);
            ctx.lineTo(px, chartArea.bottom);
            ctx.stroke();
            ctx.restore();
        };

        if (cropStartMs !== null && cropEndMs !== null) {
            const startPx = xScale.getPixelForValue(cropStartMs);
            const endPx = xScale.getPixelForValue(cropEndMs);
            ctx.save();
            ctx.fillStyle = 'rgba(39, 174, 96, 0.12)';
            ctx.fillRect(startPx, chartArea.top, endPx - startPx, chartArea.bottom - chartArea.top);
            ctx.restore();
        }

        if (cropStartMs !== null) drawLine(cropStartMs, '#e74c3c');
        if (cropEndMs !== null) drawLine(cropEndMs, '#27ae60');
    }
};

const ctx = accChartCanvasEl.getContext('2d');
const accChart = new Chart(ctx, {
    type: 'line',
    data: {
        datasets: [
            { label: 'Ax (g)', data: [], borderColor: '#e74c3c', borderWidth: 1, tension: 0.15, pointRadius: 0, fill: false },
            { label: 'Ay (g)', data: [], borderColor: '#3498db', borderWidth: 1, tension: 0.15, pointRadius: 0, fill: false },
            { label: 'Az (g)', data: [], borderColor: '#2ecc71', borderWidth: 1, tension: 0.15, pointRadius: 0, fill: false }
        ]
    },
    options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { type: 'linear', title: { display: true, text: 'time (ms)' } },
            y: { suggestedMin: -2, suggestedMax: 2, title: { display: true, text: 'g' } }
        }
    },
    plugins: [selectionOverlayPlugin]
});

function updateTimeRangeDisplay() {
    const r = getRange();
    timeRangeSpan.innerText = `전체: ${r.rangeMs.toFixed(0)} ms`;
    accChart.update('none');
}

function rebuildChartDataFromSamples() {
    accChart.data.datasets[0].data = samples.map(s => ({ x: s.rel, y: s.ax }));
    accChart.data.datasets[1].data = samples.map(s => ({ x: s.rel, y: s.ay }));
    accChart.data.datasets[2].data = samples.map(s => ({ x: s.rel, y: s.az }));
    accChart.update('none');
    updateTimeRangeDisplay();
}

function handleMotion(event) {
    const ax = event.accelerationIncludingGravity.x || 0;
    const ay = event.accelerationIncludingGravity.y || 0;
    const az = event.accelerationIncludingGravity.z || 0;
    const gx = ax / 9.80665;
    const gy = ay / 9.80665;
    const gz = az / 9.80665;
    const atot = Math.sqrt(gx * gx + gy * gy + gz * gz);

    axEl.innerText = gx.toFixed(2);
    ayEl.innerText = gy.toFixed(2);
    azEl.innerText = gz.toFixed(2);
    atotEl.innerText = atot.toFixed(2);

    if (!recording) return;

    const t = Date.now();
    if (!sessionStart) sessionStart = t;
    const rel = t - sessionStart;
    samples.push({ t, rel, ax: gx, ay: gy, az: gz });
    if (samples.length > MAX_SAMPLES) samples.shift();
    if (!originalSamples) originalSamples = samples.slice();

    accChart.data.datasets[0].data.push({ x: rel, y: gx });
    accChart.data.datasets[1].data.push({ x: rel, y: gy });
    accChart.data.datasets[2].data.push({ x: rel, y: gz });
    accChart.data.datasets.forEach(ds => { while (ds.data.length > MAX_SAMPLES) ds.data.shift(); });
    accChart.update('none');

    btnCrop.disabled = false;
    btnResetData.disabled = false;
    btnDownload.disabled = false;
    updateTimeRangeDisplay();
}

async function startRecording() {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const perm = await DeviceMotionEvent.requestPermission();
            if (perm !== 'granted') {
                alert('가속도 권한이 필요합니다');
                return;
            }
        } catch (e) {
            alert('가속도 권한 요청 실패');
            return;
        }
    }

    sessionStart = null;
    samples = [];
    originalSamples = null;
    selectionMode = 0;
    cropStartMs = null;
    cropEndMs = null;
    accChart.data.datasets.forEach(ds => ds.data = []);
    accChart.update('none');

    window.addEventListener('devicemotion', handleMotion);
    recording = true;
    btnStart.disabled = true;
    btnStop.disabled = false;
    btnDownload.disabled = true;
    btnCrop.disabled = true;
    btnResetData.disabled = true;
    updateTimeRangeDisplay();
    updateSelectionStatus();
}

function stopRecording() {
    window.removeEventListener('devicemotion', handleMotion);
    recording = false;
    btnStart.disabled = false;
    btnStop.disabled = true;
}

function downloadCSV() {
    if (samples.length === 0) return alert('저장할 데이터가 없습니다');
    let csv = 'time(ms),ax(g),ay(g),az(g)\n';
    const start = samples[0].rel;
    samples.forEach(s => {
        csv += `${(s.rel - start).toFixed(1)},${s.ax.toFixed(4)},${s.ay.toFixed(4)},${s.az.toFixed(4)}\n`;
    });
    const link = document.createElement('a');
    link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    link.download = 'phone_accelerometer.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function cropToSelection() {
    if (cropStartMs === null || cropEndMs === null) return alert('시작 지점과 종료 지점을 모두 선택하세요.');
    if (cropStartMs >= cropEndMs) return alert('유효한 시간 범위를 선택하세요. (시작 < 종료)');
    if (!originalSamples) originalSamples = samples.slice();
    const filtered = originalSamples.filter(s => s.rel >= cropStartMs && s.rel <= cropEndMs);
    if (filtered.length === 0) return alert('선택된 구간에 데이터가 없습니다.');
    samples = filtered;
    rebuildChartDataFromSamples();
    selectionMode = 0;
    cropStartMs = null;
    cropEndMs = null;
    updateSelectionStatus();
}

function resetDataToOriginal() {
    if (!originalSamples) return alert('복원할 원본 데이터가 없습니다.');
    samples = originalSamples.slice();
    rebuildChartDataFromSamples();
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
    } else {
        selectionStatus.innerText = `구간 선택됨: ${cropStartMs.toFixed(0)}~${cropEndMs.toFixed(0)} ms`;
        selectionStatus.style.color = '#27ae60';
        btnCrop.disabled = false;
    }
    accChart.update('none');
}

// Handle a click directly on the graph: convert the click's pixel
// position into a time value (ms) using the chart's own x-axis scale.
function onChartClick(event) {
    if (samples.length === 0) return;
    const rect = accChartCanvasEl.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const area = accChart.chartArea;
    if (!area || x < area.left || x > area.right) return;

    const timeMs = accChart.scales.x.getValueForPixel(x);
    const r = getRange();
    if (r.rangeMs === 0) return;

    if (selectionMode === 0) {
        cropStartMs = timeMs;
        selectionMode = 1;
    } else if (selectionMode === 1) {
        if (timeMs <= cropStartMs) {
            alert('종료 지점이 시작 지점보다 뒤에 와야 합니다.');
            return;
        }
        cropEndMs = timeMs;
        selectionMode = 2;
    } else {
        selectionMode = 0;
        cropStartMs = null;
        cropEndMs = null;
    }

    updateSelectionStatus();
}

btnStart.addEventListener('click', startRecording);
btnStop.addEventListener('click', stopRecording);
btnDownload.addEventListener('click', downloadCSV);
btnCrop.addEventListener('click', cropToSelection);
btnResetData.addEventListener('click', resetDataToOriginal);
accChartCanvasEl.addEventListener('click', onChartClick);

(function init() {
    accChart.data.datasets.forEach(ds => { ds.data = []; });
    accChart.update('none');
    updateTimeRangeDisplay();
    updateSelectionStatus();
})();
