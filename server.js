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
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: prompt }] }], 
                generationConfig: { responseMimeType: "application/json" },
                safetySettings: safetySettings 
            })
        });

        const data = await response.json();
        if (!data.candidates) throw new Error('AI 검열 차단됨');
        
        const aiText = data.candidates[0].content.parts[0].text;
        res.json(JSON.parse(aiText));

    } catch (error) {
        res.status(500).json({ error: 'AI 요약 에러' });
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
        res.json(JSON.parse(aiText));

    } catch (error) {
        res.status(500).json({ error: '단어장 번역 에러' });
    }
});

app.post('/api/translate-all', async (req, res) => {
    try {
        const { text, targetLang } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'API 키 누락' });

        const prompt = `전문 번역가로서 아래 텍스트를 '${targetLang}'(으)로 번역하세요. 생략이나 의역 없이 100% 원문 그대로 정확하게 번역해야 합니다. 어떠한 부연 설명이나 추가 문장 없이 오직 번역된 결과만 출력하세요.\n\n텍스트: ${text}`;

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
        if (!data.candidates || !data.candidates[0].content) {
             return res.status(500).json({ error: 'AI가 원서의 특정 단어 때문에 번역을 거부했습니다.' });
        }

        const translatedText = data.candidates[0].content.parts[0].text;
        res.json({ text: translatedText });

    } catch (error) {
        res.status(500).json({ error: '전체 번역 에러' });
    }
});

// ⭐️ 유튜브 음악 검색 및 가사 추출 API (AI 지휘자 동기화 버전)
app.post('/api/music', async (req, res) => {
    try {
        const { query } = req.body;
        const ytApiKey = process.env.YOUTUBE_API_KEY; 
        const geminiApiKey = process.env.GEMINI_API_KEY;

        if (!ytApiKey || !geminiApiKey) return res.status(500).json({ error: 'API 키가 누락되었습니다. (.env 확인)' });

        // 1. AI(제미나이)에게 먼저 곡을 확정하고 가사를 뽑으라고 지시
        const prompt = `사용자가 "${query}"라고 음악을 검색했습니다. 
        가장 유명하고 연관성 높은 1개의 곡을 골라, 그 곡의 '가수', '제목', 그리고 '원어 가사'를 JSON 형식으로만 반환하세요.
        
        [엄격한 규칙]
        1. 가사에는 [Verse 1], [Chorus] 같은 파트 구분 기호나 부연 설명을 절대 넣지 마세요.
        2. 반드시 아래 JSON 형식으로만 출력하세요. 마크다운(\`\`\`) 기호도 쓰지 마세요.
        {
          "artist": "가수 이름",
          "title": "노래 제목",
          "lyrics": "가사 텍스트 (줄바꿈 포함)"
        }`;

        const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
        const geminiRes = await fetch(geminiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: prompt }] }],
                safetySettings: safetySettings 
            })
        });
        
        const geminiData = await geminiRes.json();
        if (!geminiData.candidates) throw new Error('AI가 곡 정보를 찾지 못했습니다.');
        
        // AI가 준 JSON 데이터 파싱
        let aiText = geminiData.candidates[0].content.parts[0].text;
        aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
        const songInfo = JSON.parse(aiText);

        // 2. AI가 확정한 '가수 + 제목'으로 유튜브 검색
        const exactSearchQuery = `${songInfo.artist} ${songInfo.title} official audio`;
        const ytSearchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(exactSearchQuery)}&type=video&key=${ytApiKey}&maxResults=1`;
        
        const ytRes = await fetch(ytSearchUrl);
        const ytData = await ytRes.json();
        
        if (!ytData.items || ytData.items.length === 0) {
             return res.status(404).json({ error: '유튜브에서 해당 영상(음원)을 찾을 수 없습니다.' });
        }
        
        const videoId = ytData.items[0].id.videoId;

        // 3. 찾아낸 영상과 AI가 뽑은 가사를 프론트로 전달
        res.json({ videoId: videoId, lyrics: songInfo.lyrics });

    } catch (error) {
        console.error("Music API Error:", error);
        res.status(500).json({ error: '음악 검색 중 서버 에러가 발생했습니다.' });
    }
});

app.listen(port, () => {
    console.log(`🚀 서버 켜짐! 포트: ${port}`);
});
