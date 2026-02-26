import express from "express";
import { createServer as createViteServer } from "vite";
import { getSubtitles } from 'youtube-captions-scraper';
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.post("/api/process", async (req, res) => {
    const { url, manualTranscript } = req.body;
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      const videoId = extractVideoId(url);
      if (!videoId) {
        return res.status(400).json({ error: "Invalid YouTube URL" });
      }

      // 1. Get Video Info via OEmbed (more resilient to bot detection)
      let title = "YouTube Video";
      let author = "Unknown Creator";
      let thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const metaResponse = await fetch(oembedUrl);
        if (metaResponse.ok) {
          const metaData = await metaResponse.json();
          title = metaData.title || title;
          author = metaData.author_name || author;
          thumbnail = metaData.thumbnail_url || thumbnail;
        }
      } catch (e) {
        console.warn("OEmbed fetch failed, using fallbacks:", e);
      }

      // 2. Get Transcript
      let fullTranscript = "";

      if (manualTranscript) {
        fullTranscript = manualTranscript;
        console.log("Using manual transcript provided by user.");
      } else {
        try {
          console.log(`Attempting to fetch transcript for ${videoId}...`);
          const transcriptItems = await getSubtitles({
            videoID: videoId,
            lang: 'en'
          });
          fullTranscript = transcriptItems.map((item: any) => `[${Math.floor(item.start)}s] ${item.text}`).join("\n");
          console.log("Transcript fetched successfully via scraper.");
        } catch (e) {
          console.warn("Primary transcript fetch failed, trying default language...");
          try {
            const transcriptItems = await getSubtitles({ videoID: videoId });
            fullTranscript = transcriptItems.map((item: any) => `[${Math.floor(item.start)}s] ${item.text}`).join("\n");
            console.log("Transcript fetched successfully via scraper (default lang).");
          } catch (e2) {
            console.error("All scraper attempts failed.");
            throw new Error("Could not fetch transcript for this video. Please try 'Manual Script' mode and paste the transcript yourself.");
          }
        }
      }

      res.json({
        title,
        author,
        thumbnail,
        transcript: fullTranscript,
        videoId
      });

    } catch (error: any) {
      console.error("Processing error:", error);
      res.status(500).json({ error: error.message || "Failed to process video" });
    }
  });

  function extractVideoId(url: string) {
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname === 'youtu.be') {
        return urlObj.pathname.slice(1);
      }
      if (urlObj.hostname.includes('youtube.com')) {
        if (urlObj.pathname.startsWith('/shorts/')) {
          return urlObj.pathname.split('/')[2];
        }
        return urlObj.searchParams.get('v');
      }
    } catch (e) {
      // Fallback to regex if URL parsing fails
      const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
      const match = url.match(regExp);
      return (match && match[7].length === 11) ? match[7] : null;
    }
    return null;
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
