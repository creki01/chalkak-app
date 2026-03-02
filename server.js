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
                imageContext: { languageHints: ['en', 'ja'] } 
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

// 2. 구글 Gemini API (글자 -> 3단계 요약)
app.post('/api/summarize', async (req, res) => {
    try {
        const text = req.body.text;
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: '서버에 GEMINI_API_KEY가 없습니다.' });

        const prompt = `다음 텍스트가 영어인지 일본어인지 파악해서, 섀도잉 연습용 1줄 요약본을 초급, 중급, 고급 3단계로 작성해. 
        반드시 아래 JSON 형식으로만 대답해.
        {
          "beginner": { "text": "원문", "translation": "번역", "pronunciation": "한국어 발음 표기" },
          "intermediate": { "text": "원문", "translation": "번역", "pronunciation": "한국어 발음 표기" },
          "advanced": { "text": "원문", "translation": "번역", "pronunciation": "한국어 발음 표기" }
        }
        텍스트: ${text}`;

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
        });

        const data = await response.json();
        const aiText = data.candidates[0].content.parts[0].text;
        res.json(JSON.parse(aiText));

    } catch (error) {
        res.status(500).json({ error: 'AI 요약본 생성 에러' });
    }
});

// 3. ⭐️ 단어장 전용 API (한 문장만 번역 & 발음 추출)
app.post('/api/translate', async (req, res) => {
    try {
        const text = req.body.text;
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'API 키 누락' });

        const prompt = `다음 문장의 한국어 뜻과, 소리나는 대로 적은 한국어 발음 표기를 작성해.
        반드시 아래 JSON 형식으로만 대답해.
        {
          "translation": "한국어 번역",
          "pronunciation": "한국어 발음 표기 (영어/일본어 무관)"
        }
        문장: ${text}`;

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
        });

        const data = await response.json();
        const aiText = data.candidates[0].content.parts[0].text;
        res.json(JSON.parse(aiText));

    } catch (error) {
        res.status(500).json({ error: '단어장 번역 에러' });
    }
});

app.listen(port, () => {
    console.log(`🚀 서버 켜짐! 포트: ${port}`);
});