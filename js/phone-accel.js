// phone-accel.js
// 실시간 가속도 표시 및 그래프, CSV 다운로드

let recording = false;
let samples = [];
const MAX_SAMPLES = 200; // buffer size

const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnDownload = document.getElementById('btn-download');
const axEl = document.getElementById('ax');
const ayEl = document.getElementById('ay');
const azEl = document.getElementById('az');
const atotEl = document.getElementById('atot');
const bufferSizeEl = document.getElementById('buffer-size');

bufferSizeEl.innerText = MAX_SAMPLES;

// Chart.js 초기화
const ctx = document.getElementById('accChart').getContext('2d');
const accChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: Array(MAX_SAMPLES).fill(''),
        datasets: [
            { label: 'Ax (g)', data: Array(MAX_SAMPLES).fill(null), borderColor: '#e74c3c', tension:0.2, pointRadius:0 },
            { label: 'Ay (g)', data: Array(MAX_SAMPLES).fill(null), borderColor: '#3498db', tension:0.2, pointRadius:0 },
            { label: 'Az (g)', data: Array(MAX_SAMPLES).fill(null), borderColor: '#2ecc71', tension:0.2, pointRadius:0 }
        ]
    },
    options: {
        animation: false,
        responsive: true,
        scales: { x: { display: false }, y: { suggestedMin: -2, suggestedMax: 2, title: { display: true, text: 'g' } } }
    }
});

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
    samples.push({ t, ax: gx, ay: gy, az: gz });
    if (samples.length > MAX_SAMPLES) samples.shift();

    // Update chart
    const ds0 = accChart.data.datasets[0].data;
    const ds1 = accChart.data.datasets[1].data;
    const ds2 = accChart.data.datasets[2].data;

    ds0.push(gx); ds1.push(gy); ds2.push(gz);
    if (ds0.length > MAX_SAMPLES) { ds0.shift(); ds1.shift(); ds2.shift(); }
    accChart.update('none');
}

async function startRecording() {
    // iOS permission
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const perm = await DeviceMotionEvent.requestPermission();
            if (perm !== 'granted') { alert('가속도 권한이 필요합니다'); return; }
        } catch (e) { alert('가속도 권한 요청 실패'); return; }
    }

    window.addEventListener('devicemotion', handleMotion);
    recording = true;
    btnStart.disabled = true; btnStop.disabled = false; btnDownload.disabled = false;
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

btnStart.addEventListener('click', startRecording);
btnStop.addEventListener('click', stopRecording);
btnDownload.addEventListener('click', downloadCSV);

// Initialize empty chart data arrays (fill with nulls so lines shift smoothly)
(function initChartBuffer(){
    accChart.data.datasets.forEach(ds => { ds.data = Array(MAX_SAMPLES).fill(null); });
    accChart.update();
})();
