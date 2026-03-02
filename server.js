require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// 1. 구글 Vision API
app.post('/api/vision', async (req, res) => {
    try {
        const base64Image = req.body.image;
        const apiKey = process.env.GOOGLE_VISION_API_KEY;

        const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
        const body = {
            requests: [{
                image: { content: base64Image },
                features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
                imageContext: { languageHints: ['en', 'ja', 'ko'] } // 한국어도 힌트에 추가
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

// 2. 구글 Gemini API (글자 -> 요약) 
app.post('/api/summarize', async (req, res) => {
    try {
        const text = req.body.text;
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: '서버에 GEMINI_API_KEY가 없습니다.' });
        }

        const prompt = `다음 텍스트가 영어인지 일본어인지 파악해서, 섀도잉 연습용 1줄 요약본을 초급, 중급, 고급 3단계로 작성해. 
        일본어일 경우 한국어 발음 표기를 적고, 영어일 경우 발음 표기는 빈칸으로 둬.`;

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: prompt + "\n\n텍스트: " + text }] }],
                generationConfig: { 
                    responseMimeType: "application/json",
                    // 구조를 100% 강제하는 설정 (이게 없으면 AI가 가끔 [object Object] 오류를 냅니다)
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            beginner: {
                                type: "OBJECT",
                                properties: {
                                    text: { type: "STRING", description: "원어 문장" },
                                    translation: { type: "STRING", description: "한국어 번역" },
                                    pronunciation: { type: "STRING", description: "일본어 발음의 한국어 표기" }
                                }
                            },
                            intermediate: {
                                type: "OBJECT",
                                properties: {
                                    text: { type: "STRING", description: "원어 문장" },
                                    translation: { type: "STRING", description: "한국어 번역" },
                                    pronunciation: { type: "STRING", description: "일본어 발음의 한국어 표기" }
                                }
                            },
                            advanced: {
                                type: "OBJECT",
                                properties: {
                                    text: { type: "STRING", description: "원어 문장" },
                                    translation: { type: "STRING", description: "한국어 번역" },
                                    pronunciation: { type: "STRING", description: "일본어 발음의 한국어 표기" }
                                }
                            }
                        }
                    }
                } 
            })
        });

        const data = await response.json();
        if (!response.ok) return res.status(500).json({ error: 'Gemini API 호출 에러' });

        const aiText = data.candidates[0].content.parts[0].text;
        res.json(JSON.parse(aiText));

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'AI 요약본 생성 중 문제가 발생했습니다.' });
    }
});

app.listen(port, () => {
    console.log(`🚀 서버 켜짐! 브라우저에서 http://localhost:${port} 로 접속하세요.`);
});