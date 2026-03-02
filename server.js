require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// 1. 구글 Vision API (사진 -> 글자 추출)
app.post('/api/vision', async (req, res) => {
    try {
        const base64Image = req.body.image;
        const apiKey = process.env.GOOGLE_VISION_API_KEY;

        const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
        const body = {
            requests: [{
                image: { content: base64Image },
                features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
                imageContext: { languageHints: ['en'] }
            }]
        };

        const googleRes = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await googleRes.json();
        if (!googleRes.ok) return res.status(googleRes.status).json({ error: 'Vision API 에러' });
        res.json(data);

    } catch (error) {
        res.status(500).json({ error: '서버 에러' });
    }
});

// 2. 구글 Gemini API (글자 -> 요약) - 에러 원인 추적기 장착!
app.post('/api/summarize', async (req, res) => {
    try {
        const text = req.body.text;
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: 'Render에 GEMINI_API_KEY가 등록되지 않았습니다.' });
        }

        const prompt = `다음 영어 텍스트를 바탕으로, 스피킹 섀도잉 연습을 위한 1줄짜리 영어 요약본을 초급, 중급, 고급 3가지 레벨로 작성해. 
        반드시 {"beginner": "...", "intermediate": "...", "advanced": "..."} 형태의 JSON 데이터로만 대답해.
        텍스트: ${text}`;

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" } 
            })
        });

        const data = await response.json();
        
        // 🚨 구글이 튕겨냈을 때, 구글의 "진짜 에러 메시지(영어)"를 프론트엔드로 전달!
        if (!response.ok) {
            console.error("Gemini API Error Detail:", data);
            const realReason = data.error?.message || '원인 불명 에러';
            return res.status(500).json({ error: `구글 AI의 진짜 답변: ${realReason}` });
        }

        const aiText = data.candidates[0].content.parts[0].text;
        res.json(JSON.parse(aiText));

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '서버 내부 에러: ' + error.message });
    }
});

app.listen(port, () => {
    console.log(`🚀 서버 켜짐! 브라우저에서 http://localhost:${port} 로 접속하세요.`);
});
