/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef } from "react";
import { 
  Youtube, 
  ArrowRight, 
  Loader2, 
  FileText, 
  Download, 
  CheckCircle2, 
  Play,
  ExternalLink,
  ChevronRight
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import Markdown from "react-markdown";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { GoogleGenAI, Type } from "@google/genai";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Step {
  title: string;
  description: string;
  timestamp: number;
  imageUrl: string;
  videoUrl: string;
}

interface GuideData {
  title: string;
  author: string;
  thumbnail: string;
  steps: Step[];
  videoId: string;
}

export default function App() {
  const [url, setUrl] = useState("");
  const [manualScript, setManualScript] = useState("");
  const [isManual, setIsManual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [guide, setGuide] = useState<GuideData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const guideRef = useRef<HTMLDivElement>(null);

  const handleProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError(null);
    setGuide(null);
    setProgress(10);
    setStatus("Analyzing video content...");

    try {
      // 1. Get Transcript and Metadata from Backend
      const response = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          url, 
          manualTranscript: isManual ? manualScript : undefined 
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to process video");
      }

      const data = await response.json();
      const { transcript, videoId, title, author, thumbnail } = data;

      setProgress(50);
      setStatus("AI is generating your guide steps...");

      // 2. Call Gemini from Frontend
      const ai = new GoogleGenAI({ apiKey: (process.env as any).GEMINI_API_KEY || "" });
      const aiResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Based on the following video transcript/summary, create a comprehensive step-by-step tutorial guide.
        
        For each step, provide:
        1. A concise, bold title.
        2. A detailed, helpful description (Markdown allowed).
        3. A numerical timestamp in seconds (integer).

        Source Content:
        ${transcript}
        `,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              steps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    timestamp: { type: Type.NUMBER }
                  },
                  required: ["title", "description", "timestamp"]
                }
              }
            },
            required: ["steps"]
          }
        }
      });

      let result;
      try {
        result = JSON.parse(aiResponse.text || "{\"steps\":[]}");
      } catch (e) {
        console.error("JSON Parse Error:", aiResponse.text);
        throw new Error("Failed to parse AI response.");
      }

      const stepsWithImages = result.steps.map((step: any) => ({
        ...step,
        imageUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}&t=${step.timestamp}s`
      }));

      setProgress(100);
      setStatus("Guide generated!");
      
      setTimeout(() => {
        setGuide({
          title,
          author,
          thumbnail,
          steps: stepsWithImages,
          videoId
        });
        setLoading(false);
      }, 500);

    } catch (err: any) {
      console.error("Process error:", err);
      setError(err.message);
      setLoading(false);
    }
  };

  const downloadPdf = async () => {
    if (!guideRef.current || !guide) return;

    const canvas = await html2canvas(guideRef.current, {
      scale: 2,
      useCORS: true,
      logging: false,
    });
    
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "px",
      format: [canvas.width / 2, canvas.height / 2],
    });

    pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 2, canvas.height / 2);
    pdf.save(`${guide.title.replace(/[^a-z0-9]/gi, "_")}_Guide.pdf`);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-emerald-500/10 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[20%] -right-[10%] w-[60%] h-[60%] bg-blue-500/10 blur-[120px] rounded-full" />
      </div>

      <main className="relative z-10 max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="flex items-center justify-between mb-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Youtube className="text-black w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">TubeGuide AI</h1>
          </div>
          {guide && (
            <button 
              onClick={() => { setGuide(null); setUrl(""); setManualScript(""); }}
              className="text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
            >
              Start New <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </header>

        <AnimatePresence mode="wait">
          {!guide && !loading && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center py-10"
            >
              <h2 className="text-5xl font-extrabold mb-6 tracking-tight leading-tight">
                Turn any YouTube tutorial into a <span className="text-emerald-400">written guide.</span>
              </h2>
              <p className="text-zinc-400 text-lg mb-10 max-w-2xl mx-auto">
                Paste a YouTube URL and our AI will extract the steps, capture screenshots, and generate a professional guide for you.
              </p>

              <div className="max-w-xl mx-auto space-y-6">
                <div className="flex items-center justify-center gap-4 mb-4">
                  <button
                    onClick={() => setIsManual(false)}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-bold transition-all",
                      !isManual ? "bg-emerald-500 text-black" : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    Automatic
                  </button>
                  <button
                    onClick={() => setIsManual(true)}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-bold transition-all",
                      isManual ? "bg-emerald-500 text-black" : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    Manual Script
                  </button>
                </div>

                <form onSubmit={handleProcess} className="space-y-4">
                  <div className="relative group">
                    <input
                      type="url"
                      placeholder="Paste YouTube URL here..."
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl py-5 px-6 pr-16 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all text-lg placeholder:text-zinc-600"
                      required
                    />
                    {!isManual && (
                      <button
                        type="submit"
                        disabled={!url}
                        className="absolute right-2 top-2 bottom-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-black px-4 rounded-xl transition-all flex items-center justify-center group-hover:scale-105 active:scale-95"
                      >
                        <ArrowRight className="w-6 h-6" />
                      </button>
                    )}
                  </div>

                  {isManual && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="space-y-4"
                    >
                      <textarea
                        placeholder="Paste the video transcript/script here..."
                        value={manualScript}
                        onChange={(e) => setManualScript(e.target.value)}
                        className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all text-base placeholder:text-zinc-600 min-h-[200px] resize-none"
                        required
                      />
                      <button
                        type="submit"
                        disabled={!url || !manualScript}
                        className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-black py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
                      >
                        Generate Guide <ArrowRight className="w-5 h-5" />
                      </button>
                    </motion.div>
                  )}
                </form>
              </div>

              {error && (
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-4 text-red-400 text-sm"
                >
                  {error}
                </motion.p>
              )}
            </motion.div>
          )}

          {loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-32 text-center"
            >
              <div className="relative w-24 h-24 mx-auto mb-8">
                <div className="absolute inset-0 border-4 border-emerald-500/20 rounded-full" />
                <motion.div 
                  className="absolute inset-0 border-4 border-emerald-500 rounded-full border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl font-bold">{progress}%</span>
                </div>
              </div>
              <h3 className="text-2xl font-bold mb-2">{status}</h3>
              <p className="text-zinc-500">This might take a minute depending on the video length.</p>
              
              <div className="mt-12 max-w-md mx-auto h-2 bg-zinc-900 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-emerald-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                />
              </div>
            </motion.div>
          )}

          {guide && (
            <motion.div
              key="guide"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-12"
            >
              {/* Toolbar */}
              <div className="flex items-center justify-between bg-zinc-900/50 backdrop-blur-md border border-zinc-800 p-4 rounded-2xl sticky top-6 z-50">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    Ready
                  </div>
                  <span className="text-zinc-500 text-sm">|</span>
                  <span className="text-zinc-400 text-sm truncate max-w-[200px]">{guide.title}</span>
                </div>
                <button
                  onClick={downloadPdf}
                  className="bg-white text-black hover:bg-zinc-200 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  Export PDF
                </button>
              </div>

              {/* Guide Content */}
              <div ref={guideRef} className="bg-zinc-900/30 border border-zinc-800 rounded-3xl overflow-hidden p-8 md:p-12">
                <div className="mb-12">
                  <div className="flex items-center gap-2 text-emerald-400 mb-4">
                    <FileText className="w-5 h-5" />
                    <span className="text-sm font-bold uppercase tracking-widest">Tutorial Guide</span>
                  </div>
                  <h1 className="text-4xl md:text-5xl font-black mb-6 leading-tight">{guide.title}</h1>
                  <div className="flex items-center gap-4 text-zinc-400">
                    <img 
                      src={`https://img.youtube.com/vi/${guide.videoId}/default.jpg`} 
                      alt={guide.author}
                      className="w-10 h-10 rounded-full border border-zinc-700"
                    />
                    <div>
                      <p className="font-bold text-zinc-200">{guide.author}</p>
                      <p className="text-sm">Video Tutorial</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-16">
                  {guide.steps.map((step, index) => (
                    <div key={index} className="relative pl-12 border-l border-zinc-800">
                      {/* Step Number Badge */}
                      <div className="absolute -left-6 top-0 w-12 h-12 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center font-black text-xl text-emerald-400 shadow-xl">
                        {index + 1}
                      </div>

                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h3 className="text-2xl font-bold text-white">{step.title}</h3>
                          <a 
                            href={`https://youtube.com/watch?v=${guide.videoId}&t=${step.timestamp}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-xs font-bold text-zinc-500 hover:text-emerald-400 transition-colors"
                          >
                            <Play className="w-3 h-3" />
                            {Math.floor(step.timestamp / 60)}:{(step.timestamp % 60).toString().padStart(2, '0')}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>

                        <a 
                          href={step.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative group rounded-2xl overflow-hidden border border-zinc-800 bg-black aspect-video block"
                        >
                          <img 
                            src={step.imageUrl} 
                            alt={step.title}
                            className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-all duration-300 group-hover:scale-105"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <div className="bg-emerald-500 text-black px-4 py-2 rounded-full font-bold flex items-center gap-2 shadow-xl transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                              <Play className="w-4 h-4 fill-current" />
                              Watch Step
                            </div>
                          </div>
                          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-none">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 bg-black/40 backdrop-blur-md px-2 py-1 rounded">
                              Video Frame Placeholder
                            </span>
                            <span className="text-[10px] font-bold text-emerald-400 bg-black/40 backdrop-blur-md px-2 py-1 rounded">
                              {Math.floor(step.timestamp / 60)}:{(step.timestamp % 60).toString().padStart(2, '0')}
                            </span>
                          </div>
                        </a>

                        <div className="prose prose-invert prose-emerald max-w-none">
                          <Markdown>{step.description}</Markdown>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <footer className="mt-20 pt-12 border-t border-zinc-800 text-center text-zinc-500 text-sm">
                  <p>Generated by TubeGuide AI • {new Date().toLocaleDateString()}</p>
                  <p className="mt-2">Based on the tutorial by {guide.author}</p>
                </footer>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
