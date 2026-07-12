(async () => {
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

    function processSrt(rawLyrics) {
        let r = 0;
        let srtLines = [];
        let index = 1;
        for (let l of rawLyrics) {
            let start = typeof l.start_s === "number" ? l.start_s : r;
            let end = typeof l.end_s === "number" ? l.end_s : start + 2.5;
            r = end;
            
            let text = l.text || l.word || "";
            if (Array.isArray(l.words) && l.words.length > 0) {
                text = l.words.map(w => w.text || w.word || "").join("");
            }
            text = text.replace(/\r/g, "").trim();
            
            if (text.length > 0) {
                let formatTime = (t) => {
                    let h = Math.floor(t / 3600).toString().padStart(2, "0");
                    let m = Math.floor((t % 3600) / 60).toString().padStart(2, "0");
                    let s = Math.floor(t % 60).toString().padStart(2, "0");
                    let ms = Math.floor((t % 1) * 1000).toString().padStart(3, "0");
                    return `${h}:${m}:${s},${ms}`;
                };
                srtLines.push(index.toString());
                srtLines.push(`${formatTime(start)} --> ${formatTime(end)}`);
                srtLines.push(text);
                srtLines.push("");
                index++;
            }
        }
        return srtLines.join("\n");
    }

    function showUI(lrcStr, errorMsg, rawData) {
        let existing = document.getElementById("suno-lrc-bm-overlay");
        if (existing) existing.remove();

        let overlay = document.createElement("div");
        overlay.id = "suno-lrc-bm-overlay";
        Object.assign(overlay.style, {
            position: "fixed", top: "0", left: "0", width: "100vw", height: "100vh",
            backgroundColor: "rgba(0,0,0,0.8)", zIndex: "999999", display: "flex",
            flexDirection: "column", alignItems: "center", justifyContent: "center",
            fontFamily: "system-ui, sans-serif", padding: "20px", boxSizing: "border-box"
        });

        let modal = document.createElement("div");
        Object.assign(modal.style, {
            background: "#1a1a1a", padding: "24px", borderRadius: "16px",
            width: "100%", maxWidth: "500px", boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            display: "flex", flexDirection: "column", gap: "16px"
        });

        let title = document.createElement("h2");
        title.textContent = errorMsg ? "エラー" : "Suno 歌詞データ抽出";
        Object.assign(title.style, { margin: "0", color: "#fff", fontSize: "20px" });
        modal.appendChild(title);

        if (errorMsg) {
            let p = document.createElement("p");
            p.textContent = errorMsg;
            p.style.color = "#ff6b6b";
            modal.appendChild(p);

            let closeBtn = document.createElement("button");
            closeBtn.textContent = "閉じる";
            Object.assign(closeBtn.style, {
                padding: "12px 24px", background: "#334155", color: "#fff",
                border: "none", borderRadius: "8px", cursor: "pointer", marginTop: "10px"
            });
            closeBtn.onclick = () => overlay.remove();
            modal.appendChild(closeBtn);
        } else {
            let textarea = document.createElement("textarea");
            textarea.value = lrcStr;
            textarea.readOnly = true;
            Object.assign(textarea.style, {
                width: "100%", height: "250px", backgroundColor: "#2a2a2a", color: "#fff",
                border: "1px solid #444", borderRadius: "8px", padding: "12px",
                boxSizing: "border-box", fontFamily: "monospace", fontSize: "12px", resize: "none"
            });
            modal.appendChild(textarea);

            let btnRow = document.createElement("div");
            btnRow.style.display = "flex";
            btnRow.style.gap = "10px";

            let openAppBtn = document.createElement("button");
            openAppBtn.textContent = "アプリで開く";
            Object.assign(openAppBtn.style, {
                flex: "1", padding: "12px", background: "#10b981", color: "#fff",
                border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer"
            });
            openAppBtn.onclick = () => {
                window.location.href = "https://amfmu49-spec.github.io/lyric-motion-app/#lrc=" + encodeURIComponent(lrcStr);
            };

            let downloadBtn = document.createElement("button");
            downloadBtn.textContent = "SRT保存";
            Object.assign(downloadBtn.style, {
                flex: "1", padding: "12px", background: "#3b82f6", color: "#fff",
                border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer"
            });
            downloadBtn.onclick = () => {
                let srtStr = processSrt(rawData);
                let blob = new Blob([srtStr], { type: "text/srt" });
                let url = URL.createObjectURL(blob);
                let a = document.createElement("a");
                a.href = url;
                a.download = `suno-lyrics-${Date.now()}.srt`;
                a.click();
                URL.revokeObjectURL(url);
            };

            let closeBtn = document.createElement("button");
            closeBtn.textContent = "閉じる";
            Object.assign(closeBtn.style, {
                padding: "12px", background: "#334155", color: "#fff",
                border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer"
            });
            closeBtn.onclick = () => overlay.remove();

            btnRow.appendChild(openAppBtn);
            btnRow.appendChild(downloadBtn);
            btnRow.appendChild(closeBtn);
            modal.appendChild(btnRow);
        }

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }

    let path = window.location.pathname;
    if (!path.startsWith("/song/")) return showUI(null, "Not a Suno song page. Please open a song page first (e.g. suno.com/song/...).", null);
    let songId = path.split("/").pop();
    if (!songId) return showUI(null, "Could not detect song ID.", null);
    let token = getCookie("__session");
    if (!token) return showUI(null, "Please log in to Suno first.", null);

    try {
        let data = await fetchSuno(`/api/gen/${songId}/aligned_lyrics/v2/`, token);
        if (!data) return showUI(null, "Failed to fetch lyrics data. The API might have changed.", null);
        let raw = Array.isArray(data.aligned_lyrics) ? data.aligned_lyrics : (data.data?.aligned_lyrics || []);
        if (!raw.length) return showUI(null, "This song does not have timed lyrics available yet.", null);
        
        let lrcStr = processLyrics(raw);
        showUI(lrcStr, null, raw);
    } catch (err) {
        showUI(null, "Error: " + err.message, null);
    }
})();