require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

app.post('/api/vision', async (req, res) => {
    try {
        const base64Image = req.body.image;
        const apiKey = process.env.GOOGLE_VISION_API_KEY;

        const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
        const body = {
            requests: [{
                image: { content: base64Image },
                // 사피엔스 원서 같은 긴 줄글을 읽기 좋게 DOCUMENT_TEXT_DETECTION 사용
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
        
     if (!googleRes.ok) {
            console.error('구글이 알려준 에러 원인:', data); // 👉 이 줄을 추가!
            return res.status(googleRes.status).json({ error: 'Vision API 에러' });
        }
        res.json(data);

    } catch (error) {
        res.status(500).json({ error: '서버 에러' });
    }
});

app.listen(port, () => {
    console.log(`🚀 서버 켜짐! 브라우저에서 http://localhost:${port} 로 접속하세요.`);
});