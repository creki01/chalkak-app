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
        
        let aiText = data.candidates[0].content.parts[0].text;
        
        aiText = aiText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (jsonMatch) aiText = jsonMatch[0];

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
        let aiText = data.candidates[0].content.parts[0].text;

        aiText = aiText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (jsonMatch) aiText = jsonMatch[0];

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

app.post('/api/daily-theme', async (req, res) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: '서버에 API 키가 설정되지 않았습니다.' });

        const language = req.body.language || "영어";
        const level = req.body.level || "초급";

        let levelGuidance = "";
        if (language === "영어") {
            if (level === "초급") levelGuidance = "알파벳과 기초 단어만 아는 왕초보가 바로 써먹을 수 있는 아주 쉽고 짧은 기초 영어 문장";
            else if (level === "중급") levelGuidance = "기초적인 영문법을 알며, 해외여행이나 일상생활에서 자주 쓰는 자연스러운 영어 회화 문장";
            else if (level === "고급") levelGuidance = "비즈니스, 미팅, 깊은 대화 등에서 사용할 법한 세련되고 유창한 원어민 수준의 고급 영어 문장";
        } else {
            if (level === "초급") levelGuidance = "히라가나/가타카나를 갓 뗀 초보가 바로 써먹을 수 있는 아주 쉽고 짧은 기초 일본어 문장";
            else if (level === "중급") levelGuidance = "N3~N4 수준의 학습자가 일상생활에서 자주 쓰는 자연스러운 일본어 회화 문장";
            else if (level === "고급") levelGuidance = "N1~N2 수준의 학습자가 비즈니스나 깊은 대화에서 사용할 법한 고급 일본어 문장";
        }

        const prompt = `${language} 교육 전문가로서 '오늘의 5분 ${language} 회화' 테마를 작성해줘. 
난이도는 '${level}'이야. (${levelGuidance})
위 난이도에 맞는 흥미롭고 실용적인 주제를 하나 선정하고, 그 상황에서 쓸 수 있는 ${language} 문장 3~5개를 작성해.

반드시 다음 JSON 구조로만 대답해:
{
  "theme": "주제명",
  "description": "설명",
  "sentences": [
    { "text": "원문", "translation": "한국어 뜻", "pronunciation": "한국어 발음" }
  ]
}`;

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { 
                    temperature: 0.7,
                    responseMimeType: "application/json" 
                },
                safetySettings: safetySettings 
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error("Gemini API Error:", data);
            return res.status(500).json({ error: 'AI 서버가 응답하지 않습니다. 잠시 후 다시 시도해주세요.' });
        }

        if (!data.candidates || !data.candidates[0]?.content) {
            return res.status(500).json({ error: 'AI가 문장을 생성하지 못했습니다.' });
        }

        let aiText = data.candidates[0].content.parts[0].text;
        
        aiText = aiText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (jsonMatch) aiText = jsonMatch[0];

        const parsedData = JSON.parse(aiText);

        res.json(parsedData);
    } catch (error) {
        console.error("Daily Theme Try-Catch Error:", error);
        res.status(500).json({ error: '데이터를 변환하는 중 오류가 발생했습니다.' });
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

// 🔥 가사 추출 로직 전면 개편 (AI 환각 원천 차단: AI는 정보 파악만, 가사는 DB 검색만!)
app.post('/api/fetch-lyrics', async (req, res) => {
    try {
        const { videoTitle, channelTitle } = req.body;
        const geminiApiKey = process.env.GEMINI_API_KEY;
        
        if (!geminiApiKey) return res.status(500).json({ error: 'Gemini API 키 누락' });

        // 1단계: 철저하게 "한국어가 섞인 제목을 정확한 원어 제목과 가수명으로 변환"하는 용도로만 AI 사용
        const identifyPrompt = `당신은 전 세계 음악 데이터베이스입니다. 사용자가 제공한 유튜브 영상 제목과 채널명을 바탕으로 정확한 곡 정보를 파악하세요.
영상 제목: "${videoTitle}"
채널명: "${channelTitle}"

[필수 지시사항]
1. 이 곡의 공식 '원어 아티스트명'과 '원어 곡 제목'을 파악하세요. (예: 마츠다 세이코의 푸른 산호초 -> 松田聖子, 青い珊瑚礁)
2. 절대 가사를 적지 마세요. 오직 아티스트명과 제목만 찾아내세요.

반드시 아래 JSON 형식으로만 응답하세요. 다른 부연 설명이나 가사는 절대 쓰지 마세요.
{
  "originalArtist": "원어 아티스트명 (예: 松田聖子)",
  "originalTitle": "원어 곡 제목 (예: 青い珊瑚礁)"
}`;

        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: identifyPrompt }] }],
                generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
                safetySettings: safetySettings 
            }),
            signal: AbortSignal.timeout(15000)
        });

        const geminiData = await geminiRes.json();
        if (!geminiRes.ok) throw new Error(geminiData.error?.message || 'Gemini API 에러');
        if (!geminiData.candidates || !geminiData.candidates[0]?.content) throw new Error('AI 응답이 없습니다.');

        let aiText = geminiData.candidates[0].content.parts[0].text;
        aiText = aiText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const songInfo = JSON.parse(aiText);

        const searchArtist = songInfo.originalArtist || channelTitle;
        const searchTitle = songInfo.originalTitle || videoTitle;

        // 2단계: AI가 찾아낸 '정확한 원어 제목'으로 무조건 공식 가사 DB(lrclib) 먼저 찌르기!
        try {
            const lrclibUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(searchArtist + ' ' + searchTitle)}`;
            const lrclibRes = await fetch(lrclibUrl, { headers: { 'User-Agent': 'SeanSpeakingApp/1.0' }, signal: AbortSignal.timeout(8000) });
            if (lrclibRes.ok) {
                const lrclibData = await lrclibRes.json();
                if (lrclibData && lrclibData.length > 0) {
                    const bestMatch = lrclibData.find(song => song.plainLyrics);
                    if (bestMatch?.plainLyrics) return res.json({ lyrics: bestMatch.plainLyrics, source: 'lrclib' });
                }
            }
        } catch (err) { console.log("lrclib 검색 실패"); }

        // 3단계: lrclib 실패 시 ovh 검색
        try {
            const ovhUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(searchArtist)}/${encodeURIComponent(searchTitle)}`;
            const ovhRes = await fetch(ovhUrl, { signal: AbortSignal.timeout(8000) });
            if (ovhRes.ok) {
                const ovhData = await ovhRes.json();
                if (ovhData.lyrics && ovhData.lyrics.trim().length > 20) return res.json({ lyrics: ovhData.lyrics.trim(), source: 'lyrics.ovh' });
            }
        } catch (err) { console.log("ovh 검색 실패"); }

        // 4단계: 진짜 DB에도 없을 때만 최후의 수단으로 AI에게 가사 물어보기 (이때도 경고 강력하게)
        const fallbackPrompt = `"${searchArtist}"의 "${searchTitle}" 공식 원어 가사를 알려주세요.
[경고] 절대 다른 곡의 가사를 지어내지 마세요. 이 곡의 1절부터 끝까지의 정확한 가사 원문만 출력하고, 확실히 모른다면 "UNKNOWN"이라고만 대답하세요.`;

        const fallbackRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: fallbackPrompt }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
                safetySettings: safetySettings 
            }),
            signal: AbortSignal.timeout(15000)
        });

        const fallbackData = await fallbackRes.json();
        if (fallbackRes.ok && fallbackData.candidates && fallbackData.candidates[0]?.content) {
            let lyrics = fallbackData.candidates[0].content.parts[0].text.trim();
            if (lyrics !== 'UNKNOWN' && lyrics.length > 20) {
                lyrics = lyrics.replace(/```[a-zA-Z가-힣]*\n?/g, '').replace(/```/g, '').replace(/\[.*?\]/g, '').replace(/^\s*[\r\n]/gm, '\n').trim();
                return res.json({ lyrics, source: 'gemini_fallback' });
            }
        }

        return res.status(404).json({ error: `"${searchTitle}" 가사를 찾을 수 없습니다.` });

    } catch (error) {
        res.status(500).json({ error: `가사 검색 실패: ${error.message}` });
    }
});

app.listen(port, () => {
    console.log(`🚀 서버 켜짐! 포트: ${port}`);
});
