/* ========================================
   펌웨어 업로더 스크립트
   ======================================== */

const uploadButton = document.getElementById('uploadButton');
const statusDiv = document.getElementById('status');
const progressDiv = document.getElementById('progress');
const firmwareSelect = document.getElementById('firmwareSelect');

const avrbro = new Avrbro();

uploadButton.addEventListener('click', async () => {
    if (!('serial' in navigator)) {
        alert('이 브라우저는 Web Serial API를 지원하지 않습니다. Chrome이나 Edge 브라우저를 사용해주세요.');
        return;
    }

    const selectedHexUrl = firmwareSelect.value;
    if (!selectedHexUrl) {
        alert('업로드할 펌웨어를 선택해주세요.');
        return;
    }

    uploadButton.disabled = true;
    statusDiv.textContent = '펌웨어 파일 다운로드 중...';

    try {
        // 1. 선택된 URL로 .hex 파일 가져오기
        const response = await fetch(selectedHexUrl);
        if (!response.ok) {
            throw new Error(`펌웨어 파일 다운로드 실패: ${response.statusText}`);
        }
        const hex = await response.text();
        statusDiv.textContent = '.hex 파일 준비 완료. 아두이노에 연결하세요.';

        // 2. 아두이노에 연결
        await avrbro.connect();
        statusDiv.textContent = '아두이노 연결 성공! 업로드를 시작합니다...';

        // 3. 펌웨어 업로드 (프로그래스 바 업데이트 포함)
        await avrbro.flash(hex, (progress) => {
            const percent = (progress * 100).toFixed(0);
            progressDiv.style.width = percent + '%';
            progressDiv.textContent = percent + '%';
        });

        statusDiv.textContent = '✅ 업로드 성공! 이제 데이터 분석 페이지로 이동하세요.';

    } catch (error) {
        statusDiv.textContent = `❌ 오류 발생: ${error.message}`;
        console.error(error);
    } finally {
        uploadButton.disabled = false;
    }
});
