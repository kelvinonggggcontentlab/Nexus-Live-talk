import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Sparkles,
  Send,
  Search,
  Volume2,
  Trash2,
  Compass,
  Sliders,
  MessageSquare,
} from "lucide-react";
import { NexusOrb } from "./components/NexusOrb";
import {
  DISCOVERY_SPARKS,
  INITIAL_OPENING_TURN,
  TranscriptEntry,
  DiscoverySpark,
} from "./data/nexusData";
import {
  float32ToBase64Pcm16,
  base64Pcm16ToFloat32,
  computeRmsLevel,
} from "./utils/liveAudio";

type SessionStatus = "idle" | "connecting" | "active" | "error";
type VibeMode = "spontaneous" | "deep" | "chill";
type VoicePersona = "Puck" | "Fenrir" | "Charon" | "Zephyr" | "Kore";
type ActiveSection = "companion" | "sparks" | "transcript" | "voice";

const VOICE_OPTIONS: { id: VoicePersona; label: string; styleNote: string }[] = [
  { id: "Puck", label: "Puck", styleNote: "Witty, quick-paced JB friend" },
  { id: "Fenrir", label: "Fenrir", styleNote: "Deep, grounded baritone" },
  { id: "Charon", label: "Charon", styleNote: "Calm, analytical thinker" },
  { id: "Zephyr", label: "Zephyr", styleNote: "Bright, energetic conversationalist" },
  { id: "Kore", label: "Kore", styleNote: "Warm, relaxed companion" },
];

export default function App() {
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [vibeMode, setVibeMode] = useState<VibeMode>("spontaneous");
  const [voiceName, setVoiceName] = useState<VoicePersona>("Puck");
  const [activeSection, setActiveSection] = useState<ActiveSection>("companion");

  // Audio reactivity states
  const [userAudioLevel, setUserAudioLevel] = useState<number>(0);
  const [nexusAudioLevel, setNexusAudioLevel] = useState<number>(0);
  const [sessionSeconds, setSessionSeconds] = useState<number>(0);

  // Conversation transcript & search
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([
    INITIAL_OPENING_TURN,
  ]);
  const [liveNexusDraft, setLiveNexusDraft] = useState<string>("");
  const [liveKelvinDraft, setLiveKelvinDraft] = useState<string>("");
  const [textInput, setTextInput] = useState<string>("");
  const [sparkSearch, setSparkSearch] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  // Refs for WebSocket & AudioContext to prevent stale closures in callbacks
  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourceNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const isMutedRef = useRef<boolean>(false);
  const liveNexusTextRef = useRef<string>("");
  const liveKelvinTextRef = useRef<string>("");
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Format current HH:MM time
  const getTimeString = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  // Session duration counter
  useEffect(() => {
    if (status !== "active") {
      setSessionSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      setSessionSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  // Auto-scroll transcript container when new turns arrive
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts, liveNexusDraft, liveKelvinDraft]);

  const stopAllPlayback = useCallback(() => {
    for (const source of activeSourceNodesRef.current) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // ignore already stopped
      }
    }
    activeSourceNodesRef.current = [];
    if (outputAudioCtxRef.current) {
      nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
    setNexusAudioLevel(0);
  }, []);

  const cleanupSession = useCallback(() => {
    stopAllPlayback();

    if (scriptProcessorRef.current) {
      try {
        scriptProcessorRef.current.disconnect();
      } catch {}
      scriptProcessorRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }

    if (outputAudioCtxRef.current) {
      outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    setUserAudioLevel(0);
    setNexusAudioLevel(0);
  }, [stopAllPlayback]);

  // Schedule 24kHz PCM chunk for gapless playback
  const playPcm24kChunk = useCallback((base64Audio: string) => {
    const outputCtx = outputAudioCtxRef.current;
    if (!outputCtx) return;

    if (outputCtx.state === "suspended") {
      outputCtx.resume().catch(() => {});
    }

    const float32Data = base64Pcm16ToFloat32(base64Audio);
    const rms = computeRmsLevel(float32Data);
    setNexusAudioLevel(rms);

    const audioBuffer = outputCtx.createBuffer(1, float32Data.length, 24000);
    audioBuffer.copyToChannel(float32Data, 0);

    const sourceNode = outputCtx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(outputCtx.destination);

    const currentTime = outputCtx.currentTime;
    const startTime = Math.max(currentTime, nextStartTimeRef.current);
    sourceNode.start(startTime);
    nextStartTimeRef.current = startTime + audioBuffer.duration;

    activeSourceNodesRef.current.push(sourceNode);
    sourceNode.onended = () => {
      activeSourceNodesRef.current = activeSourceNodesRef.current.filter(
        (node) => node !== sourceNode
      );
      if (activeSourceNodesRef.current.length === 0) {
        setNexusAudioLevel(0);
      }
    };
  }, []);

  const startLiveSession = useCallback(
    async (customStarterTopic?: string) => {
      cleanupSession();
      setErrorMessage(null);
      setStatus("connecting");
      liveNexusTextRef.current = "";
      liveKelvinTextRef.current = "";
      setLiveNexusDraft("");
      setLiveKelvinDraft("");

      try {
        // 1. Request microphone stream
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000,
          },
        });
        mediaStreamRef.current = stream;

        // 2. Initialize 16kHz input AudioContext and 24kHz output AudioContext
        const AudioCtx =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const inputCtx = new AudioCtx({ sampleRate: 16000 });
        const outputCtx = new AudioCtx({ sampleRate: 24000 });
        inputAudioCtxRef.current = inputCtx;
        outputAudioCtxRef.current = outputCtx;
        nextStartTimeRef.current = outputCtx.currentTime;

        // 3. Connect WebSocket to server /live bridge
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const params = new URLSearchParams({
          voice: voiceName,
          mode: vibeMode,
        });
        if (customStarterTopic) {
          params.set("topic", customStarterTopic);
        }

        const ws = new WebSocket(`${protocol}//${window.location.host}/live?${params.toString()}`);
        wsRef.current = ws;

        ws.onopen = () => {
          // Setup mic capture pipeline once WS is open
          const source = inputCtx.createMediaStreamSource(stream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          scriptProcessorRef.current = processor;

          processor.onaudioprocess = (event) => {
            if (isMutedRef.current) {
              setUserAudioLevel(0);
              return;
            }
            const channelData = event.inputBuffer.getChannelData(0);
            const rms = computeRmsLevel(channelData);
            setUserAudioLevel(rms);

            if (ws.readyState === WebSocket.OPEN) {
              const base64Audio = float32ToBase64Pcm16(channelData);
              ws.send(JSON.stringify({ audio: base64Audio }));
            }
          };

          source.connect(processor);
          processor.connect(inputCtx.destination);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);

            if (msg.type === "session_ready") {
              setStatus("active");
            } else if (msg.type === "audio" && msg.audio) {
              playPcm24kChunk(msg.audio);
            } else if (msg.type === "output_transcription" && msg.text) {
              liveNexusTextRef.current += msg.text;
              setLiveNexusDraft(liveNexusTextRef.current);
            } else if (msg.type === "input_transcription" && msg.text) {
              liveKelvinTextRef.current += msg.text;
              setLiveKelvinDraft(liveKelvinTextRef.current);
            } else if (msg.type === "turn_complete") {
              // Commit any accumulated transcripts
              const kelvinFinal = liveKelvinTextRef.current.trim();
              const nexusFinal = liveNexusTextRef.current.trim();

              if (kelvinFinal || nexusFinal) {
                setTranscripts((prev) => {
                  const next = [...prev];
                  if (kelvinFinal) {
                    next.push({
                      id: `kelvin-${Date.now()}-${Math.random()}`,
                      speaker: "kelvin",
                      text: kelvinFinal,
                      timestamp: getTimeString(),
                    });
                  }
                  if (nexusFinal) {
                    next.push({
                      id: `nexus-${Date.now()}-${Math.random()}`,
                      speaker: "nexus",
                      text: nexusFinal,
                      timestamp: getTimeString(),
                    });
                  }
                  return next;
                });
              }

              liveKelvinTextRef.current = "";
              liveNexusTextRef.current = "";
              setLiveKelvinDraft("");
              setLiveNexusDraft("");
            } else if (msg.type === "interrupted") {
              stopAllPlayback();
              const partialNexus = liveNexusTextRef.current.trim();
              if (partialNexus) {
                setTranscripts((prev) => [
                  ...prev,
                  {
                    id: `nexus-int-${Date.now()}`,
                    speaker: "nexus",
                    text: `${partialNexus} —`,
                    timestamp: getTimeString(),
                  },
                ]);
              }
              liveNexusTextRef.current = "";
              setLiveNexusDraft("");
            } else if (msg.type === "error") {
              setErrorMessage(msg.message || "Live voice connection interrupted.");
              setStatus("error");
              cleanupSession();
            } else if (msg.type === "session_closed") {
              setStatus("idle");
              cleanupSession();
            }
          } catch (err) {
            console.error("Failed to parse WebSocket message:", err);
          }
        };

        ws.onerror = () => {
          setErrorMessage(
            "Unable to establish real-time audio stream. Check microphone permissions or Settings > Secrets."
          );
          setStatus("error");
          cleanupSession();
        };

        ws.onclose = () => {
          setStatus((prev) => (prev === "error" ? "error" : "idle"));
        };
      } catch (err: any) {
        console.error("Microphone or Live session error:", err);
        setErrorMessage(
          err?.message ||
            "Microphone access is required for live voice conversation with NEXUS."
        );
        setStatus("error");
        cleanupSession();
      }
    },
    [cleanupSession, playPcm24kChunk, stopAllPlayback, vibeMode, voiceName]
  );

  const endLiveSession = useCallback(() => {
    cleanupSession();
    setStatus("idle");
  }, [cleanupSession]);

  // Send a text prompt or topic spark into the live session (or start session with that spark)
  const triggerDiscoverySpark = useCallback(
    (spark: DiscoverySpark) => {
      if (status === "active" && wsRef.current?.readyState === WebSocket.OPEN) {
        stopAllPlayback();
        const promptText = `[Kelvin tapped the discovery topic "${spark.title}". Transition naturally in Johor Bahru Malaysian Chinese Mandarin and share a fascinating observation or angle about: ${spark.promptTopic}]`;
        wsRef.current.send(JSON.stringify({ text: promptText }));
        setTranscripts((prev) => [
          ...prev,
          {
            id: `kelvin-spark-${Date.now()}`,
            speaker: "kelvin",
            text: `Let's talk about: ${spark.title}`,
            timestamp: getTimeString(),
            topicTag: spark.category,
          },
        ]);
      } else {
        startLiveSession(spark.promptTopic);
      }
    },
    [startLiveSession, status, stopAllPlayback]
  );

  const handleSendTextMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = textInput.trim();
    if (!trimmed) return;

    setTextInput("");
    setTranscripts((prev) => [
      ...prev,
      {
        id: `kelvin-msg-${Date.now()}`,
        speaker: "kelvin",
        text: trimmed,
        timestamp: getTimeString(),
      },
    ]);

    if (status === "active" && wsRef.current?.readyState === WebSocket.OPEN) {
      stopAllPlayback();
      wsRef.current.send(JSON.stringify({ text: trimmed }));
    } else {
      startLiveSession(trimmed);
    }
  };

  useEffect(() => {
    return () => {
      cleanupSession();
    };
  }, [cleanupSession]);

  const formatDuration = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const categories = ["All", ...Array.from(new Set(DISCOVERY_SPARKS.map((s) => s.category)))];
  const filteredSparks = DISCOVERY_SPARKS.filter((spark) => {
    const matchesCategory =
      selectedCategory === "All" || spark.category === selectedCategory;
    const matchesSearch =
      !sparkSearch.trim() ||
      spark.title.toLowerCase().includes(sparkSearch.toLowerCase()) ||
      spark.teaser.toLowerCase().includes(sparkSearch.toLowerCase()) ||
      spark.category.toLowerCase().includes(sparkSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-zinc-800/80 bg-[#09090B]/90 backdrop-blur-md sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#companion"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection("companion");
          }}
          className="text-base sm:text-lg font-bold tracking-tight text-zinc-100 whitespace-nowrap shrink-0"
        >
          NEXUS by BLACKTOWER™
        </a>

        {/* Zone 2: 4 clean single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-400">
          <button
            type="button"
            onClick={() => setActiveSection("companion")}
            className={`hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === "companion"
                ? "text-zinc-100 underline underline-offset-8 decoration-red-600"
                : ""
            }`}
          >
            Live Companion
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("sparks")}
            className={`hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === "sparks"
                ? "text-zinc-100 underline underline-offset-8 decoration-red-600"
                : ""
            }`}
          >
            Discovery Radar
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("transcript")}
            className={`hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === "transcript"
                ? "text-zinc-100 underline underline-offset-8 decoration-red-600"
                : ""
            }`}
          >
            Dialogue Log
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("voice")}
            className={`hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === "voice"
                ? "text-zinc-100 underline underline-offset-8 decoration-red-600"
                : ""
            }`}
          >
            Voice Persona
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          {status === "active" ? (
            <button
              type="button"
              onClick={endLiveSession}
              className="px-4 py-2 text-xs font-semibold text-white bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              End Live Session
            </button>
          ) : (
            <button
              type="button"
              onClick={() => startLiveSession()}
              disabled={status === "connecting"}
              className="px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-500 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {status === "connecting" ? "Connecting Live..." : "Start Live Voice"}
            </button>
          )}
        </div>
      </header>

      {/* Main 1440px Desktop Workspace Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {/* Error Banner if Mic or API Key issue */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/50 border border-red-800/80 flex items-center justify-between gap-4 text-sm text-red-200">
            <div>
              <span className="font-semibold text-red-100">Connection Notice: </span>
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => startLiveSession()}
              className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* Primary 2-Column Split: Left Acoustic Core & Controls | Right Live Dialogue & Discovery Radar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* LEFT COLUMN (5 cols): NEXUS Acoustic Sanctuary & Controls */}
          <section className="lg:col-span-5 flex flex-col justify-between p-6 sm:p-8 rounded-2xl bg-[#111114] border border-zinc-800/90">
            {/* Top Identity & Unboxed Metadata Line */}
            <div>
              <div className="flex items-center justify-between gap-4 text-xs text-zinc-400">
                <div className="flex items-center gap-2">
                  <span>Johor Bahru Companion</span>
                  <span aria-hidden="true">·</span>
                  <span>Gemini 3.8 Live</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{voiceName} Voice</span>
                </div>
                <span className="font-mono tabular-nums text-zinc-300">
                  {status === "active"
                    ? `LIVE ${formatDuration(sessionSeconds)}`
                    : status === "connecting"
                    ? "HANDSHAKE..."
                    : "STANDBY"}
                </span>
              </div>

              <h1
                className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100"
                style={{ textWrap: "balance" }}
              >
                Chill naturally. Think deeply. Keep discovering.
              </h1>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                Speak with NEXUS in natural Malaysian Chinese Mandarin, English, or BM.
                NEXUS initiates topics, challenges assumptions, and explores ideas like a
                close friend from JB.
              </p>
            </div>

            {/* Central Visual Focal Anchor: NEXUS Crimson-Obsidian Orb */}
            <div className="my-8 flex flex-col items-center justify-center">
              <NexusOrb
                status={status}
                userAudioLevel={userAudioLevel}
                nexusAudioLevel={nexusAudioLevel}
                isMuted={isMuted}
                onClick={() => {
                  if (status === "active" || status === "connecting") {
                    endLiveSession();
                  } else {
                    startLiveSession();
                  }
                }}
              />

              {/* Live Acoustic Telemetry Readout (Tabular Numerals) */}
              <div className="mt-6 flex items-center gap-4 text-xs text-zinc-400 font-mono tabular-nums">
                <span>
                  STATUS:{" "}
                  <strong className="text-zinc-200 font-medium">
                    {status === "active"
                      ? nexusAudioLevel > 0.05
                        ? "NEXUS SPEAKING"
                        : isMuted
                        ? "MIC MUTED"
                        : "LISTENING TO KELVIN"
                      : status === "connecting"
                      ? "INITIALIZING AUDIO"
                      : "READY TO TALK"}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  IN: {Math.round((isMuted ? 0 : userAudioLevel) * 100)}%
                </span>
                <span aria-hidden="true">·</span>
                <span>OUT: {Math.round(nexusAudioLevel * 100)}%</span>
              </div>
            </div>

            {/* Bottom Interactive Controls & Vibe Mode Selector */}
            <div className="space-y-5 pt-4 border-t border-zinc-800/80">
              {/* Vibe Mode Segmented Control */}
              <div>
                <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                  <span>Conversation Pace & Depth</span>
                  <span>Applies to live turns</span>
                </div>
                <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-900 rounded-lg border border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setVibeMode("spontaneous")}
                    className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      vibeMode === "spontaneous"
                        ? "bg-zinc-800 text-zinc-100 shadow-xs"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Spontaneous JB
                  </button>
                  <button
                    type="button"
                    onClick={() => setVibeMode("deep")}
                    className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      vibeMode === "deep"
                        ? "bg-zinc-800 text-zinc-100 shadow-xs"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Deep Dive
                  </button>
                  <button
                    type="button"
                    onClick={() => setVibeMode("chill")}
                    className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      vibeMode === "chill"
                        ? "bg-zinc-800 text-zinc-100 shadow-xs"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Relax & Chill
                  </button>
                </div>
              </div>

              {/* Primary Live Session Action Bar */}
              <div className="flex items-center gap-3">
                {status === "active" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsMuted((prev) => !prev)}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isMuted
                          ? "bg-amber-950/60 border-amber-700/80 text-amber-200 hover:bg-amber-900/60"
                          : "bg-zinc-900 border-zinc-700 text-zinc-100 hover:bg-zinc-800"
                      }`}
                    >
                      {isMuted ? (
                        <>
                          <MicOff className="w-4 h-4" />
                          <span>Unmute Mic</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-4 h-4 text-red-400" />
                          <span>Mute Mic</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const randomSpark =
                          DISCOVERY_SPARKS[
                            Math.floor(Math.random() * DISCOVERY_SPARKS.length)
                          ];
                        triggerDiscoverySpark(randomSpark);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-semibold bg-zinc-900 border border-zinc-700 text-zinc-100 hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4 text-red-400" />
                      <span>New Topic Spark</span>
                    </button>

                    <button
                      type="button"
                      onClick={endLiveSession}
                      className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-semibold bg-red-600 text-white hover:bg-red-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <PhoneOff className="w-4 h-4" />
                      <span>End Call</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => startLiveSession()}
                    disabled={status === "connecting"}
                    className="w-full flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-500 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Radio className="w-4 h-4" />
                    <span>
                      {status === "connecting"
                        ? "Connecting to NEXUS Live..."
                        : "Start Live Voice Conversation with NEXUS"}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* RIGHT COLUMN (7 cols): Live Dialogue Stream, Discovery Radar & Voice Persona */}
          <section className="lg:col-span-7 flex flex-col justify-between rounded-2xl bg-[#111114] border border-zinc-800/90 overflow-hidden">
            {/* Workspace Sub-Navigation Tabs */}
            <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-zinc-800/80">
              <div className="flex items-center gap-1 p-1 bg-zinc-900 rounded-lg border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setActiveSection("companion")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeSection === "companion" || activeSection === "transcript"
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Live Dialogue ({transcripts.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection("sparks")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeSection === "sparks"
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Proactive Topics ({DISCOVERY_SPARKS.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection("voice")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeSection === "voice"
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Voice & Persona</span>
                </button>
              </div>

              {(activeSection === "companion" || activeSection === "transcript") && (
                <button
                  type="button"
                  onClick={() => setTranscripts([INITIAL_OPENING_TURN])}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Reset Log</span>
                </button>
              )}
            </div>

            {/* VIEW 1: LIVE DIALOGUE STREAM */}
            {(activeSection === "companion" || activeSection === "transcript") && (
              <div className="flex-1 flex flex-col justify-between min-h-[460px] max-h-[580px]">
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                  {transcripts.map((entry) => (
                    <div
                      key={entry.id}
                      className={`flex flex-col ${
                        entry.speaker === "kelvin" ? "items-end" : "items-start"
                      }`}
                    >
                      {/* Unboxed Metadata Line (Zero-Pill Compliance) */}
                      <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1.5">
                        <span className="font-semibold text-zinc-300">
                          {entry.speaker === "nexus" ? "NEXUS" : "Kelvin"}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{entry.timestamp}</span>
                        {entry.topicTag && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{entry.topicTag}</span>
                          </>
                        )}
                      </div>

                      {/* Turn Content */}
                      <div
                        className={`max-w-[90%] rounded-xl px-4 py-3.5 text-sm leading-relaxed whitespace-pre-line ${
                          entry.speaker === "kelvin"
                            ? "bg-red-950/40 border border-red-800/60 text-zinc-100"
                            : "bg-zinc-900/90 border border-zinc-800 text-zinc-200"
                        }`}
                      >
                        {entry.text}
                      </div>
                    </div>
                  ))}

                  {/* Real-time Streaming Input Transcription (Kelvin speaking) */}
                  {liveKelvinDraft && (
                    <div className="flex flex-col items-end">
                      <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1.5">
                        <span className="font-semibold text-zinc-300">Kelvin (Live)</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">Speaking...</span>
                      </div>
                      <div className="max-w-[90%] rounded-xl px-4 py-3 text-sm bg-red-950/30 border border-red-800/40 text-zinc-200 italic">
                        {liveKelvinDraft}
                      </div>
                    </div>
                  )}

                  {/* Real-time Streaming Output Transcription (NEXUS speaking) */}
                  {liveNexusDraft && (
                    <div className="flex flex-col items-start">
                      <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1.5">
                        <span className="font-semibold text-red-400">NEXUS (Live)</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">Speaking...</span>
                      </div>
                      <div className="max-w-[90%] rounded-xl px-4 py-3.5 text-sm bg-zinc-900 border border-red-900/50 text-zinc-100">
                        {liveNexusDraft}
                      </div>
                    </div>
                  )}

                  <div ref={transcriptEndRef} />
                </div>

                {/* Quick Topic Nudges + Hybrid Text/Voice Input */}
                <div className="p-4 sm:px-6 border-t border-zinc-800/80 bg-zinc-950/60 space-y-3">
                  <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
                    <span className="text-xs text-zinc-400 whitespace-nowrap shrink-0">
                      Jump into topic:
                    </span>
                    <div className="flex items-center gap-2">
                      {DISCOVERY_SPARKS.slice(0, 3).map((spark) => (
                        <button
                          key={spark.id}
                          type="button"
                          onClick={() => triggerDiscoverySpark(spark)}
                          className="px-2.5 py-1 text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {spark.title}
                        </button>
                      ))}
                    </div>
                  </div>

                  <form onSubmit={handleSendTextMessage} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder={
                        status === "active"
                          ? "Speak into your mic or type a thought to NEXUS..."
                          : "Type a message or click Start Live Voice to talk with NEXUS..."
                      }
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-red-600 transition-colors"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send</span>
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* VIEW 2: PROACTIVE DISCOVERY RADAR */}
            {activeSection === "sparks" && (
              <div className="flex-1 flex flex-col p-6 space-y-5 min-h-[460px] max-h-[580px] overflow-y-auto">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-zinc-100">
                      Proactive Discovery Sparks
                    </h2>
                    <p className="text-xs text-zinc-400">
                      Click any discovery below to have NEXUS immediately kick off or pivot
                      the live voice conversation.
                    </p>
                  </div>

                  {/* Search Input */}
                  <div className="relative w-full sm:w-56">
                    <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={sparkSearch}
                      onChange={(e) => setSparkSearch(e.target.value)}
                      placeholder="Filter discoveries..."
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-red-600"
                    />
                  </div>
                </div>

                {/* Category Filter Buttons */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        selectedCategory === cat
                          ? "bg-red-600 text-white"
                          : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Discovery List */}
                <div className="divide-y divide-zinc-800/80 border-t border-zinc-800/80">
                  {filteredSparks.length === 0 ? (
                    <div className="py-12 text-center">
                      <p className="text-sm text-zinc-400">
                        No discovery sparks match "{sparkSearch}".
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setSparkSearch("");
                          setSelectedCategory("All");
                        }}
                        className="mt-3 px-3 py-1.5 text-xs font-medium bg-zinc-800 text-zinc-200 rounded-md hover:bg-zinc-700 transition-colors cursor-pointer"
                      >
                        Reset Filters
                      </button>
                    </div>
                  ) : (
                    filteredSparks.map((spark) => (
                      <div
                        key={spark.id}
                        className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-zinc-900/40 px-2 rounded-lg transition-colors"
                      >
                        <div className="space-y-1 max-w-xl">
                          <div className="flex items-center gap-2 text-xs text-zinc-400">
                            <span>{spark.category}</span>
                            <span aria-hidden="true">·</span>
                            <span>Johor Bahru Mandarin & English</span>
                          </div>
                          <h3 className="text-sm font-semibold text-zinc-100">
                            {spark.title}
                          </h3>
                          <p className="text-xs text-zinc-400 leading-relaxed">
                            {spark.teaser}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            triggerDiscoverySpark(spark);
                            setActiveSection("companion");
                          }}
                          className="px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-red-600 border border-zinc-700 hover:border-red-500 text-xs font-semibold text-zinc-200 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Discuss Live
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* VIEW 3: VOICE PERSONA & JOHOR BAHRU COMPANION TUNING */}
            {activeSection === "voice" && (
              <div className="flex-1 flex flex-col p-6 space-y-6 min-h-[460px] max-h-[580px] overflow-y-auto">
                <div>
                  <h2 className="text-base font-semibold text-zinc-100">
                    Gemini 3.8 Live Voice & Persona Configuration
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Select NEXUS's prebuilt voice timbre and review its active Johor Bahru
                    Malaysian Chinese conversational parameters.
                  </p>
                </div>

                {/* Voice Selection Grid */}
                <div className="space-y-2.5">
                  <label className="text-xs font-medium text-zinc-300 block">
                    Live Voice Timbre (24kHz Native Audio)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {VOICE_OPTIONS.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setVoiceName(v.id)}
                        className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer flex items-center justify-between ${
                          voiceName === v.id
                            ? "bg-red-950/30 border-red-600 text-zinc-100"
                            : "bg-zinc-900/70 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                        }`}
                      >
                        <div>
                          <div className="text-sm font-semibold">{v.label}</div>
                          <div className="text-xs text-zinc-400 mt-0.5">{v.styleNote}</div>
                        </div>
                        <Volume2
                          className={`w-4 h-4 shrink-0 ${
                            voiceName === v.id ? "text-red-400" : "text-zinc-600"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Active Persona Protocol Summary */}
                <div className="pt-4 border-t border-zinc-800/80 space-y-3">
                  <h3 className="text-xs font-semibold text-zinc-300">
                    Active NEXUS by BLACKTOWER™ Protocol
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-zinc-400">
                    <div className="space-y-1">
                      <div className="font-medium text-zinc-200">
                        01. Authentic JB Mandarin Rhythm
                      </div>
                      <p className="leading-relaxed">
                        Speaks natural Johor Bahru Malaysian Chinese Mandarin, blending
                        English and Bahasa Malaysia terms organically without robotic lecture
                        cadence.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <div className="font-medium text-zinc-200">
                        02. Proactive First Action
                      </div>
                      <p className="leading-relaxed">
                        Initiates conversation immediately when the live voice link opens,
                        introducing a surprising scientific or behavioral discovery.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <div className="font-medium text-zinc-200">
                        03. Short Conversational Turns
                      </div>
                      <p className="leading-relaxed">
                        Avoids monologues and repetitive end-of-turn questions; leaves room
                        for Kelvin to interrupt or pivot naturally.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <div className="font-medium text-zinc-200">
                        04. Verified Knowledge Integrity
                      </div>
                      <p className="leading-relaxed">
                        Distinguishes empirical studies from speculation and respectfully
                        challenges assumptions like a sharp friend.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Full-Width Below-the-Fold Quick Discovery Strip (4 Columns) */}
        <section className="mt-8 pt-6 border-t border-zinc-800/80">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-200">
              Featured Conversation Starters for Kelvin
            </h2>
            <span className="text-xs text-zinc-400">
              Click any card to launch or steer the live voice conversation
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {DISCOVERY_SPARKS.slice(0, 4).map((spark, index) => (
              <button
                key={spark.id}
                type="button"
                onClick={() => triggerDiscoverySpark(spark)}
                className="group text-left p-5 rounded-xl bg-[#111114] border border-zinc-800/90 hover:border-red-600/60 transition-colors flex flex-col justify-between cursor-pointer"
              >
                <div>
                  <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono tabular-nums">
                    <span>0{index + 1}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-sans">{spark.category}</span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-zinc-100 group-hover:text-red-300 transition-colors">
                    {spark.title}
                  </h3>
                  <p className="mt-2 text-xs text-zinc-400 line-clamp-3 leading-relaxed">
                    {spark.jbHook}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center justify-between text-xs font-medium text-zinc-300 group-hover:text-red-400">
                  <span>Talk about this with NEXUS</span>
                  <span aria-hidden="true">→</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
