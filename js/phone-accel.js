// phone-accel.js (updated)
// 실시간 가속도 표시, 그래프 두께 조정 및 영역 크롭 기능 추가

let recording = false;
let samples = [];       // {t: absolute, rel: seconds from session start, ax, ay, az}
let originalSamples = null;
let sessionStart = null;
const MAX_SAMPLES = 200; // buffer size

const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnDownload = document.getElementById('btn-download');
const btnCrop = document.getElementById('btn-crop');
const btnResetData = document.getElementById('btn-reset-data');
const axEl = document.getElementById('ax');
const ayEl = document.getElementById('ay');
const azEl = document.getElementById('az');
const atotEl = document.getElementById('atot');
const bufferSizeEl = document.getElementById('buffer-size');

bufferSizeEl.innerText = MAX_SAMPLES;

// Chart.js 초기화 (datasets use {x:time, y:value} for linear x-axis)
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
        plugins: {
            zoom: {
                pan: { enabled: true, mode: 'x' },
                zoom: { drag: { enabled: true }, mode: 'x' }
            }
        },
        scales: {
            x: { type: 'linear', title: { display: true, text: 'time (s)'} },
            y: { suggestedMin: -2, suggestedMax: 2, title: { display: true, text: 'g' } }
        }
    }
});

function rebuildChartDataFromSamples() {
    const ds0 = accChart.data.datasets[0].data = samples.map(s => ({ x: s.rel, y: s.ax }));
    const ds1 = accChart.data.datasets[1].data = samples.map(s => ({ x: s.rel, y: s.ay }));
    const ds2 = accChart.data.datasets[2].data = samples.map(s => ({ x: s.rel, y: s.az }));
    accChart.update();
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

    const t = Date.now() / 1000;
    if (!sessionStart) sessionStart = t;
    const rel = t - sessionStart;
    samples.push({ t, rel, ax: gx, ay: gy, az: gz });
    if (samples.length > MAX_SAMPLES) samples.shift();

    // Keep originalSamples updated when not cropping
    if (!originalSamples) originalSamples = samples.slice();

    // Update chart datasets (linear x)
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
}

function stopRecording() {
    window.removeEventListener('devicemotion', handleMotion);
    recording = false;
    btnStart.disabled = false; btnStop.disabled = true;
}

function downloadCSV() {
    if (samples.length === 0) return alert('저장할 데이터가 없습니다');
    let csv = 'time(s),ax(g),ay(g),az(g)\n';
    const start = samples[0].t;
    samples.forEach(s => {
        csv += `${(s.t-start).toFixed(4)},${s.ax.toFixed(4)},${s.ay.toFixed(4)},${s.az.toFixed(4)}\n`;
    });
    const link = document.createElement('a');
    link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    link.download = 'phone_accelerometer.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Crop to selected chart x-range (requires user to drag/zoom selection using zoom plugin)
function cropToSelection() {
    // read current visible x range
    const xScale = accChart.scales.x;
    if (!xScale) return alert('차트 스케일을 찾을 수 없습니다.');
    const minX = xScale.min;
    const maxX = xScale.max;
    if (minX === undefined || maxX === undefined) return alert('영역을 선택(드래그)한 뒤 시도하세요.');

    // Ensure originalSamples saved for reset
    if (!originalSamples) originalSamples = samples.slice();

    const start = originalSamples[0].t; // absolute
    // filter samples by rel time between minX and maxX
    const filtered = originalSamples.filter(s => s.rel >= minX && s.rel <= maxX);
    if (filtered.length === 0) return alert('선택된 영역에 데이터가 없습니다.');

    samples = filtered;
    // rebuild chart data
    rebuildChartDataFromSamples();

    // reset chart view to show full cropped data
    accChart.resetZoom();
    accChart.update();
}

function resetDataToOriginal() {
    if (!originalSamples) return alert('복원할 원본 데이터가 없습니다.');
    samples = originalSamples.slice();
    rebuildChartDataFromSamples();
    accChart.resetZoom();
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
})();
