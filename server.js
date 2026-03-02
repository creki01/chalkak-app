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

// 2. 구글 Gemini API (글자 -> 3단계 요약 자동 생성)
app.post('/api/summarize', async (req, res) => {
    try {
        const text = req.body.text;
        const apiKey = process.env.GEMINI_API_KEY; // 새로 추가한 AI 키

        // AI에게 내릴 명령(프롬프트)
        const prompt = `다음 영어 텍스트를 바탕으로, 스피킹 섀도잉 연습을 위한 1~2줄짜리 영어 요약본을 초급, 중급, 고급 3가지 레벨로 작성해. 응답은 반드시 아래 JSON 형식으로만 보내.
        {
          "beginner": "초급 문장",
          "intermediate": "중급 문장",
          "advanced": "고급 문장"
        }
        텍스트: ${text}`;

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const data = await response.json();
        const aiText = data.candidates[0].content.parts[0].text;
        
        // 지저분한 문자열을 깔끔한 데이터로 정리해서 프론트엔드로 전달
        const cleanJson = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(cleanJson));

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '요약 에러' });
    }
});

app.listen(port, () => {
    console.log(`🚀 서버 켜짐! 브라우저에서 http://localhost:${port} 로 접속하세요.`);
});