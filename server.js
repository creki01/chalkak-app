// 파일 선택 시 같은 파일을 다시 선택할 수 있도록 클릭할 때 value를 비워줌
galleryInput.addEventListener('click', function(e) { e.target.value = ''; });
audioInput.addEventListener('click', function(e) { e.target.value = ''; });

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    stopSpeech();

    const reader = new FileReader();
    reader.onload = function(e) {
        const result = e.target.result;
        const base64Data = result.split(',')[1];
        
        document.getElementById('langSelect').value = 'original';

        if (file.type.startsWith('image/')) {
            preview.src = result;
            preview.style.display = 'block';
            sendToVisionAPI(base64Data);
        } else if (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|m4a|ogg|aac|flac)$/i)) {
            preview.style.display = 'none';
            // ⭐️ 개선: MIME 타입을 더 안전하게 추출 (iOS 호환성 강화)
            let mimeType = 'audio/mp3'; 
            if (result.includes('data:audio')) {
                mimeType = result.split(';')[0].split(':')[1] || 'audio/mp3';
            }
            sendToTranscribeAPI(base64Data, mimeType);
        } else {
            alert('지원하지 않는 파일 형식입니다. (사진 또는 음성 파일을 선택해주세요)');
        }
    };
    reader.readAsDataURL(file); 
}

galleryInput.addEventListener('change', handleFileSelect);
audioInput.addEventListener('change', handleFileSelect);

// ⭐️ 개선: 정규식 대신 data-name 속성을 안전하게 가져오도록 변경
function handleLanguageChange() {
    const langSelect = document.getElementById('langSelect');
    const targetLangCode = langSelect.value;
    
    if (targetLangCode === 'original') {
        restoreOriginalText();
    } else {
        const selectedOption = langSelect.options[langSelect.selectedIndex];
        const cleanLangName = selectedOption.getAttribute('data-name');
        translateMainText(targetLangCode, cleanLangName);
    }
}

async function translateMainText(targetLangCode, cleanLangName) {
    if (!originalExtractedText) return;
    stopSpeech();
    
    // 이제 rawLangName을 받아 정규식 처리할 필요 없이 바로 사용 가능
    loading.innerText = `⏳ 본문을 ${cleanLangName}(으)로 변환 중입니다...`;
    loading.style.display = 'block';
    resultText.innerHTML = '';
    try {
        const response = await fetch('/api/translate-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: originalExtractedText, targetLang: cleanLangName })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '번역 실패');
        renderSentences(data.text, resultText, targetLangCode);
    } catch (error) {
        resultText.innerText = "번역에 실패했습니다: " + error.message;
    } finally {
        loading.style.display = 'none';
    }
}
