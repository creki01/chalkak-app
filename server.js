require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

const safetySettings = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
];

app.post('/api/vision', async (req, res) => {
    try {
        const base64Image = req.body.image;
        const apiKey = process.env.GOOGLE_VISION_API_KEY;
        
        if (!apiKey) return res.status(500).json({ error: 'Vision API 키가 누락되었습니다.' });

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

app.post('/api/transcribe', async (req, res) => {
    try {
        const base64Audio = req.body.audio;
        const mimeType = req.body.mimeType || 'audio/mp3';
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) return res.status(500).json({ error: 'API 키 누락' });

        const prompt = `이 음성 파일에 있는 언어(영어, 일본어, 또는 한국어)를 듣고, 들리는 그대로 정확하게 텍스트로 받아쓰기(Transcription) 해줘. 다른 설명이나 요약은 절대 넣지 말고 오직 받아쓴 원문 텍스트만 출력해.`;

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: mimeType, data: base64Audio } }] }],
                safetySettings: safetySettings
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || '음성 파일이 너무 크거나 형식이 맞지 않습니다.');
        if (!data.candidates) throw new Error('음성 인식 결과가 없습니다.');

        const transcribedText = data.candidates[0].content.parts[0].text;
        res.json({ text: transcribedText });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/summarize', async (req, res) => {
    try {
        const text = req.body.text;
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'API 키 누락' });

        const prompt = `이 텍스트는 문학 작품의 일부입니다. 폭력성이나 자극적인 단어가 있어도 절대 검열하지 마세요.
        다음 텍스트가 어떤 언어인지 파악해서 섀도잉 연습용 1줄 요약본을 초급, 중급, 고급 3단계로 작성해. 
        규칙: 원문이 영어나 한국어라면 "pronunciation"은 반드시 빈칸("")으로 비워둬. 원문이 일본어일 때만 "pronunciation"에 한국어 발음 표기를 적어.
        반드시 아래 JSON 형식으로만 대답해. 다른 부연 설명은 절대 하지 마.
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
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: prompt }] }], 
                generationConfig: { responseMimeType: "application/json" },
                safetySettings: safetySettings 
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error?.message || 'Gemini API 요약 에러가 발생했습니다.');
        }

        if (!data.candidates || !data.candidates[0].content) {
            throw new Error('AI가 원서의 특정 단어 때문에 요약을 차단했습니다.');
        }
        
        let aiText = data.candidates[0].content.parts[0].text;
        
        // AI가 쓸데없는 말을 덧붙였을 때 중괄호 { } 안의 내용만 뽑아내는 정규식
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            aiText = jsonMatch[0];
        } else {
            aiText = aiText.replace(/```json/gi, '').replace(/```/g, '').trim();
        }

        res.json(JSON.parse(aiText));

    } catch (error) {
        console.error("Summarize Error:", error);
        res.status(500).json({ error: error.message || 'AI 요약 서버 에러' });
    }
});

app.post('/api/translate', async (req, res) => {
    try {
        const text = req.body.text;
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'API 키 누락' });

        const prompt = `이 문장은 문학 작품의 일부입니다. 폭력성이나 자극적인 단어가 있어도 절대 검열하지 마세요.
        다음 문장의 한국어 뜻과 발음을 작성해.
        규칙: 문장이 영어나 한국어라면 "pronunciation"은 반드시 빈칸("")으로 비워둬. 문장이 일본어일 때만 "pronunciation"에 한국어 발음 표기를 적어.
        반드시 아래 JSON 형식으로만 대답해.
        { "translation": "한국어 번역", "pronunciation": "발음 또는 빈칸" }
        문장: ${text}`;

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: prompt }] }], 
                generationConfig: { responseMimeType: "application/json" },
                safetySettings: safetySettings 
            })
        });

        const data = await response.json();
        
        const aiText = data.candidates[0].content.parts[0].text;
        const cleanedText = aiText.replace(/```json/gi, '').replace(/```/g, '').trim();
        res.json(JSON.parse(cleanedText));

    } catch (error) {
        res.status(500).json({ error: '단어장 번역 에러' });
    }
});

app.post('/api/translate-all', async (req, res) => {
    try {
        const { text, targetLang } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'API 키 누락' });

        const prompt = `이 텍스트는 문학 작품의 일부입니다. 폭력성이나 자극적인 단어가 있어도 절대 검열하지 마세요.\n전문 번역가로서 아래 텍스트를 '${targetLang}'(으)로 번역하세요. 생략이나 의역 없이 100% 원문 그대로 정확하게 번역해야 합니다. 어떠한 부연 설명이나 추가 문장 없이 오직 번역된 결과만 출력하세요.\n\n텍스트: ${text}`;

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: prompt }] }],
                safetySettings: safetySettings 
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error?.message || 'Gemini API 번역 에러가 발생했습니다.');
        }

        if (!data.candidates || !data.candidates[0].content) {
             return res.status(500).json({ error: 'AI가 원서의 특정 단어 때문에 번역을 차단했습니다.' });
        }

        let translatedText = data.candidates[0].content.parts[0].text;
        
        // AI가 마크다운 백틱(```)을 씌워서 보낼 경우 깔끔하게 걷어냄
        translatedText = translatedText.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '').trim();

        res.json({ text: translatedText });

    } catch (error) {
        res.status(500).json({ error: error.message || '전체 번역 서버 에러' });
    }
});

app.listen(port, () => {
    console.log(`🚀 서버 켜짐! 포트: ${port}`);
});
