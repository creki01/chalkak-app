require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// 1. 구글 Vision API (힌트에 한국어 'ko' 추가)
app.post('/api/vision', async (req, res) => {
    try {
        const base64Image = req.body.image;
        const apiKey = process.env.GOOGLE_VISION_API_KEY;

        const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
        const body = {
            requests: [{
                image: { content: base64Image },
                features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
                imageContext: { languageHints: ['en', 'ja', 'ko'] } 
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

// 2. 구글 Gemini API (음성 파일 -> 글자 받아쓰기 - 한국어 추가!)
app.post('/api/transcribe', async (req, res) => {
    try {
        const base64Audio = req.body.audio;
        const mimeType = req.body.mimeType || 'audio/mp3';
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) return res.status(500).json({ error: '서버에 GEMINI_API_KEY가 없습니다.' });

        // ⭐️ 한국어도 알아듣도록 프롬프트 수정
        const prompt = `이 음성 파일에 있는 언어(영어, 일본어, 또는 한국어)를 듣고, 들리는 그대로 정확하게 텍스트로 받아쓰기(Transcription) 해줘. 다른 설명이나 요약은 절대 넣지 말고 오직 받아쓴 원문 텍스트만 출력해.`;

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: mimeType, data: base64Audio } }
                    ]
                }]
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Gemini 음성 인식 에러');

        const transcribedText = data.candidates[0].content.parts[0].text;
        res.json({ text: transcribedText });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '음성 추출 에러' });
    }
});

// 3. 구글 Gemini API (글자 -> 3단계 요약)
app.post('/api/summarize', async (req, res) => {
    try {
        const text = req.body.text;
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'API 키 누락' });

        const prompt = `다음 텍스트가 영어, 일본어, 한국어 중 어떤 언어인지 파악해서 섀도잉 연습용 1줄 요약본을 초급, 중급, 고급 3단계로 작성해. 
        규칙: 원문이 영어나 한국어라면 "pronunciation"은 반드시 빈칸("")으로 비워둬. 원문이 일본어일 때만 "pronunciation"에 한국어 발음 표기를 적어.
        반드시 아래 JSON 형식으로만 대답해.
        {
          "beginner": { "text": "원문", "translation": "번역", "pronunciation": "발음 또는 빈칸" },
          "intermediate": { "text": "원문", "translation": "번역", "pronunciation": "발음 또는 빈칸" },
          "advanced": { "text": "원문", "translation": "번역", "pronunciation": "발음 또는 빈칸" }
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
        res.status(500).json({ error: 'AI 요약 에러' });
    }
});

// 4. 구글 Gemini API (단어장 번역)
app.post('/api/translate', async (req, res) => {
    try {
        const text = req.body.text;
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'API 키 누락' });

        const prompt = `다음 문장의 한국어 뜻과 발음을 작성해.
        규칙: 문장이 영어나 한국어라면 "pronunciation"은 반드시 빈칸("")으로 비워둬. 문장이 일본어일 때만 "pronunciation"에 한국어 발음 표기를 적어.
        반드시 아래 JSON 형식으로만 대답해.
        {
          "translation": "한국어 번역",
          "pronunciation": "발음 또는 빈칸"
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