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
