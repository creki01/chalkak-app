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

// ⭐ 새롭게 추가된 API: 매일 5분 회화 테마 생성 (영어/일본어 공용)
app.post('/api/daily-theme', async (req, res) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'API 키 누락' });

        const language = req.body.language || "영어";
        const level = req.body.level || "초급";

        let levelGuidance = "";
        if (language === "영어") {
            if (level === "초급") levelGuidance = "알파벳과 기초 단어만 아는 왕초보가 바로 써먹을 수 있는 아주 쉽고 짧은 영어 문장";
            else if (level === "중급") levelGuidance = "해외여행이나 일상생활에서 자주 쓰는 자연스러운 영어 회화 문장";
            else if (level === "고급") levelGuidance = "비즈니스, 미팅, 깊은 대화 등에서 사용할 법한 세련되고 유창한 원어민 수준의 고급 영어 문장";
        } else {
            if (level === "초급") levelGuidance = "히라가나/가타카나를 갓 뗀 초보가 바로 써먹을 수 있는 아주 쉽고 짧은 기초 일본어 문장";
            else if (level === "중급") levelGuidance = "N3~N4 수준의 학습자가 일상생활에서 자주 쓰는 자연스러운 일본어 회화 문장";
            else if (level === "고급") levelGuidance = "N1~N2 수준의 학습자가 비즈니스나 깊은 대화에서 사용할 법한 고급 일본어 문장";
        }

        const prompt = `${language} 학습자를 위한 '오늘의 5분 ${language} 회화' 테마를 작성해. 
선택된 난이도는 '${level}'이야. (${levelGuidance})
난이도에 맞는 흥미롭고 실용적인 주제를 하나 선정하고, 그 상황에서 쓸 수 있는 ${language} 문장 3~5개를 제공해.
다른 설명이나 인사말은 일절 생략하고, 오직 아래의 JSON 객체 형식만 정확하게 출력해.
{
  "theme": "오늘의 주제 (예: 카페에서 주문하기)",
  "description": "이 주제가 왜 유용한지 1~2줄 설명",
  "sentences": [
    { "text": "${language} 원문", "translation": "한국어 번역", "pronunciation": "한국어 발음 표기" }
  ]
}`;

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7 }, 
                safetySettings: safetySettings 
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error("Gemini API HTTP Error:", data);
            return res.status(500).json({ error: 'AI 응답 에러' });
        }

        if (!data.candidates || !data.candidates[0]?.content) {
            console.error("Gemini API Empty Response:", data);
            return res.status(500).json({ error: 'AI가 응답을 생성하지 못했습니다.' });
        }

        let aiText = data.candidates[0].content.parts[0].text;
        
        // 🚨 핵심 해결책: AI가 헛소리를 섞어 보내도 JSON 형태({ ... })만 강제로 뜯어냅니다.
        let jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error("No JSON found in response:", aiText);
            return res.status(500).json({ error: '올바른 데이터를 찾지 못했습니다.' });
        }
        
        let parsedData;
        try {
            parsedData = JSON.parse(jsonMatch[0]);
        } catch (parseError) {
            console.error("JSON Parse Error:", parseError, "Raw text:", jsonMatch[0]);
            return res.status(500).json({ error: '데이터 번역 중 에러가 발생했습니다.' });
        }

        res.json(parsedData);
    } catch (error) {
        console.error("Daily Theme Fetch Error:", error);
        res.status(500).json({ error: '서버 내부 에러가 발생했습니다.' });
    }
});

app.post('/api/search-youtube', async (req, res) => {
    try {
        const { query } = req.body;
        const ytApiKey = process.env.YOUTUBE_API_KEY; 
        if (!ytApiKey) return res.status(500).json({ error: 'YouTube API 키 누락' });

        const ytSearchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&key=${ytApiKey}&maxResults=5`;
        const ytRes = await fetch(ytSearchUrl);
        const ytData = await ytRes.json();
        
        if (!ytData.items || ytData.items.length === 0) {
             return res.status(404).json({ error: '검색 결과가 없습니다.' });
        }
        
        const results = ytData.items.map(item => ({
            videoId: item.id.videoId,
            title: item.snippet.title,
            channelTitle: item.snippet.channelTitle,
            thumbnail: item.snippet.thumbnails.medium.url
        }));

        res.json({ results });
    } catch (error) {
        res.status(500).json({ error: '유튜브 검색 중 에러가 발생했습니다.' });
    }
});

app.post('/api/fetch-lyrics', async (req, res) => {
    try {
        const { videoTitle, channelTitle } = req.body;
        
        const cleanTitle = videoTitle.replace(/\[.*?\]|\(.*?\)/g, '').replace(/official|audio|video|lyrics|mv|hd|4k/gi, '').trim();
        const artistName = channelTitle.replace(/official|channel|VEVO|music/gi, '').trim();

        try {
            const queries = [`${artistName} ${cleanTitle}`, cleanTitle, `${channelTitle} ${cleanTitle}`];
            for (const q of queries) {
                const lrclibUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`;
                const lrclibRes = await fetch(lrclibUrl, { headers: { 'User-Agent': 'SeanSpeakingApp/1.0' }, signal: AbortSignal.timeout(8000) });
                if (lrclibRes.ok) {
                    const lrclibData = await lrclibRes.json();
                    if (lrclibData && lrclibData.length > 0) {
                        const bestMatch = lrclibData.find(song => song.plainLyrics);
                        if (bestMatch?.plainLyrics) return res.json({ lyrics: bestMatch.plainLyrics, source: 'lrclib' });
                    }
                }
            }
        } catch (lrclibErr) {}

        try {
            const ovhUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(artistName)}/${encodeURIComponent(cleanTitle)}`;
            const ovhRes = await fetch(ovhUrl, { signal: AbortSignal.timeout(8000) });
            if (ovhRes.ok) {
                const ovhData = await ovhRes.json();
                if (ovhData.lyrics && ovhData.lyrics.trim().length > 20) return res.json({ lyrics: ovhData.lyrics.trim(), source: 'lyrics.ovh' });
            }
        } catch (ovhErr) {}

        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (!geminiApiKey) return res.status(500).json({ error: 'Gemini API 키가 설정되지 않았습니다.' });

        const isKorean = /[가-힣]/.test(cleanTitle) || /[가-힣]/.test(artistName);
        const langHint = isKorean ? '한국어' : '원어(영어/일본어 등)';

        const prompt = `음악 정보 전문가로서 다음 곡의 가사를 알려주세요.
곡 제목: "${cleanTitle}"
아티스트: "${artistName}"
아래 규칙을 반드시 따르세요:
1. ${langHint} 가사 원문만 출력하세요.
2. [Verse], [Chorus] 같은 파트 태그, 줄번호, 설명 문구를 절대 포함하지 마세요.
3. 가사를 모른다면 "UNKNOWN"이라고만 출력하세요.
4. 1절부터 마지막 절까지 완전한 가사를 출력하세요.`;

        const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
        const geminiRes = await fetch(geminiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
                safetySettings: safetySettings 
            }),
            signal: AbortSignal.timeout(30000)
        });
        
        const geminiData = await geminiRes.json();
        
        if (!geminiRes.ok) return res.status(500).json({ error: `Gemini API 오류: ${geminiData.error?.message || geminiRes.status}` });
        if (!geminiData.candidates || !geminiData.candidates[0]?.content) return res.status(500).json({ error: `AI가 이 곡의 가사 제공을 거부했습니다.` });
        
        let lyrics = geminiData.candidates[0].content.parts[0].text.trim();
        
        if (lyrics === 'UNKNOWN' || lyrics.length < 20) return res.status(404).json({ error: `"${cleanTitle}" 가사를 찾을 수 없습니다.` });

        lyrics = lyrics.replace(/```[^`]*```/g, '').replace(/\[.*?\]/g, '').replace(/^\s*[\r\n]/gm, '\n').trim();
        res.json({ lyrics, source: 'gemini' });

    } catch (error) {
        res.status(500).json({ error: `가사 검색 실패: ${error.message}` });
    }
});

app.listen(port, () => {
    console.log(`🚀 서버 켜짐! 포트: ${port}`);
});

