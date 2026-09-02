// phone-accel.js (updated)
// 실시간 가속도 표시, 타임라인 선택 크롭 기능 (ms 단위)

let recording = false;
let samples = [];       // {t: absolute unix time, rel: ms from session start, ax, ay, az}
let originalSamples = null;
let sessionStart = null;
const MAX_SAMPLES = 200; // buffer size

const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnDownload = document.getElementById('btn-download');
const btnCrop = document.getElementById('btn-crop');
const btnResetData = document.getElementById('btn-reset-data');
const cropStartInput = document.getElementById('crop-start');
const cropEndInput = document.getElementById('crop-end');
const timeRangeSpan = document.getElementById('time-range');
const axEl = document.getElementById('ax');
const ayEl = document.getElementById('ay');
const azEl = document.getElementById('az');
const atotEl = document.getElementById('atot');
const bufferSizeEl = document.getElementById('buffer-size');

bufferSizeEl.innerText = MAX_SAMPLES;

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
        cropStartInput.max = 0;
        cropEndInput.max = 0;
        cropStartInput.value = 0;
        cropEndInput.value = 0;
        return;
    }
    const minMs = Math.min(...samples.map(s => s.rel));
    const maxMs = Math.max(...samples.map(s => s.rel));
    const rangeMs = maxMs - minMs;
    timeRangeSpan.innerText = `전체: ${rangeMs.toFixed(0)} ms`;
    
    cropStartInput.max = Math.round(maxMs);
    cropEndInput.max = Math.round(maxMs);
    if (cropStartInput.value === '' || parseInt(cropStartInput.value) > maxMs) cropStartInput.value = Math.round(minMs);
    if (cropEndInput.value === '' || parseInt(cropEndInput.value) > maxMs) cropEndInput.value = Math.round(maxMs);
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
    accChart.data.datasets.forEach(ds => ds.data = []);
    accChart.update();

    window.addEventListener('devicemotion', handleMotion);
    recording = true;
    btnStart.disabled = true; btnStop.disabled = false; btnDownload.disabled = true; // download enabled after data
    btnCrop.disabled = true; btnResetData.disabled = true;
    
    updateTimeRangeDisplay();
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

// Crop to selected timeline range (ms inputs)
function cropToSelection() {
    const startMs = parseFloat(cropStartInput.value) || 0;
    const endMs = parseFloat(cropEndInput.value) || 0;

    if (isNaN(startMs) || isNaN(endMs) || startMs >= endMs) {
        return alert('유효한 시간 범위를 입력하세요. (시작 < 종료)');
    }

    // Ensure originalSamples saved for reset
    if (!originalSamples) originalSamples = samples.slice();

    // filter samples by rel time between startMs and endMs
    const filtered = originalSamples.filter(s => s.rel >= startMs && s.rel <= endMs);
    if (filtered.length === 0) return alert('선택된 구간에 데이터가 없습니다.');

    samples = filtered;
    // rebuild chart data
    rebuildChartDataFromSamples();
    accChart.update();
}

function resetDataToOriginal() {
    if (!originalSamples) return alert('복원할 원본 데이터가 없습니다.');
    samples = originalSamples.slice();
    rebuildChartDataFromSamples();
    accChart.update();
}

// Button wiring
btnStart.addEventListener('click', startRecording);
btnStop.addEventListener('click', stopRecording);
btnDownload.addEventListener('click', downloadCSV);
btnCrop.addEventListener('click', cropToSelection);
btnResetData.addEventListener('click', resetDataToOriginal);

// Initialize empty chart data arrays
(function initChartBuffer(){
    accChart.data.datasets.forEach(ds => { ds.data = []; });
    accChart.update();
    updateTimeRangeDisplay();
})();
