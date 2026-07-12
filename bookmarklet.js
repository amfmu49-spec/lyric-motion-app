(async () => {
    // Basic utility functions needed
    function getCookie(name) {
        let parts = `; ${document.cookie}`.split(`; ${name}=`);
        if (parts.length >= 2) return parts.pop().split(';').shift();
    }
    
    async function fetchSuno(path, token) {
        try {
            let res = await fetch(`https://studio-api.prod.suno.com${path}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return res.ok ? await res.json() : null;
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    function processLyrics(rawLyrics) {
        // Simple processing, just output LRC
        let r = 0;
        let lrcLines = [];
        for (let l of rawLyrics) {
            let start = typeof l.start_s === "number" ? l.start_s : r;
            let end = typeof l.end_s === "number" ? l.end_s : start + 2.5;
            r = start;
            
            let text = l.text || l.word || "";
            if (Array.isArray(l.words) && l.words.length > 0) {
                text = l.words.map(w => w.text || w.word || "").join("");
            }
            text = text.replace(/\r/g, "").trim();
            
            if (text.length > 0) {
                let min = Math.floor(start / 60).toString().padStart(2, "0");
                let sec = Math.floor(start % 60).toString().padStart(2, "0");
                let ms = Math.floor((start % 1) * 100).toString().padStart(2, "0");
                lrcLines.push(`[${min}:${sec}.${ms}]${text}`);
            }
        }
        return lrcLines.join("\n");
    }

    let path = window.location.pathname;
    if (!path.startsWith("/song/")) return alert("Not a Suno song page. Please open a song page first (e.g. suno.com/song/...).");
    let songId = path.split("/").pop();
    if (!songId) return alert("Could not detect song ID.");
    let token = getCookie("__session");
    if (!token) return alert("Please log in to Suno first.");

    try {
        let data = await fetchSuno(`/api/gen/${songId}/aligned_lyrics/v2/`, token);
        if (!data) return alert("Failed to fetch lyrics data. The API might have changed.");
        let raw = Array.isArray(data.aligned_lyrics) ? data.aligned_lyrics : (data.data?.aligned_lyrics || []);
        if (!raw.length) return alert("This song does not have timed lyrics available yet.");
        
        let lrcStr = processLyrics(raw);
        window.location.href = "https://amfmu49-spec.github.io/lyric-motion-app/#lrc=" + encodeURIComponent(lrcStr);
    } catch (err) {
        alert("Error: " + err.message);
    }
})();