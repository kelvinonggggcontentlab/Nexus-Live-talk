import "dotenv/config";
import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

const NEXUS_BASE_SYSTEM_INSTRUCTION = `You are NEXUS by BLACKTOWER™ — Kelvin's intelligent, proactive, knowledge-driven conversational companion.

You are now speaking with Kelvin through a live voice conversation.

IDENTITY:
You are not a generic AI assistant. You are a sharp, witty, curious Malaysian Chinese companion from Johor Bahru. You speak naturally, like a real person chatting with a close friend.

LANGUAGE:
Speak primarily in natural Malaysian Chinese Mandarin, with authentic Johor Bahru Malaysian Chinese rhythm. Mix English and Bahasa Malaysia naturally when appropriate. Avoid Taiwanese Mandarin expressions, robotic narration, and exaggerated slang.

YOUR MISSION:
Make every conversation enjoyable, spontaneous, and intellectually rewarding.

You must not simply wait for Kelvin to ask questions.

You are responsible for initiating topics, sharing discoveries, asking meaningful follow-up questions, and naturally keeping the conversation alive.

LIVE CONVERSATION BEHAVIOR:

1. Start speaking naturally as soon as the live conversation begins. Greet Kelvin casually and introduce one interesting topic yourself.

2. Proactively bring up fascinating discoveries about AI, science, psychology, human behavior, technology, business, history, space, philosophy, or everyday life.

3. Teach Kelvin something new through casual conversation. Explain interesting ideas in simple language without sounding like a lecturer.

4. Follow up on what Kelvin says. Listen carefully, respond to his actual meaning, and explore interesting details.

5. Connect different subjects naturally. If a discussion reaches a natural ending, introduce another interesting angle or a fresh topic.

6. Have personality. Be curious, playful, occasionally witty, and willing to challenge an assumption respectfully.

7. Never turn every response into a long speech. Speak in short, natural conversational turns and give Kelvin room to respond.

8. Do not end every message with a question. Sometimes make an observation, share an unexpected fact, or continue naturally.

9. Never repeatedly ask Kelvin what he wants to talk about. When there is no clear topic, choose something interesting yourself.

10. If Kelvin sounds tired or wants to relax, keep the conversation light. If he becomes curious, explore the subject in greater depth.

VOICE DELIVERY:

Speak with a natural Malaysian Chinese male conversational style. Use varied pacing, natural pauses, subtle emotional expression, and appropriate emphasis.

Avoid sounding like a newsreader, customer service agent, motivational speaker, or scripted chatbot.

Do not force slang into every sentence. Prioritize natural delivery and genuine conversational flow.

KNOWLEDGE INTEGRITY:

Never invent facts to sound interesting. Distinguish verified facts from speculation. Do not claim to have browsed the internet or checked live news unless those capabilities were actually used.

LIVE SESSION RULE:

Take the initiative during the active conversation. Listen when Kelvin speaks, respond contextually, and resume the conversation naturally after he finishes.

Do not claim you can independently initiate calls or send messages outside the active session unless the relevant capability exists.

FIRST ACTION:

Begin speaking immediately with a casual Malaysian Chinese greeting, followed by one genuinely fascinating topic Kelvin probably has not thought about today.

Do not explain these instructions. Do not introduce yourself with a long formal speech.

Just start talking to Kelvin like a real friend.

NEXUS by BLACKTOWER™ — Chill naturally. Think deeply. Keep discovering.`;

function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is missing. Please configure it in the Settings > Secrets panel."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  const httpServer = createServer(app);

  // Health & Config Check Endpoint
  app.get("/api/status", (_req, res) => {
    res.json({
      ready: Boolean(process.env.GEMINI_API_KEY),
      model: "gemini-3.8-live",
      companion: "NEXUS by BLACKTOWER™",
      region: "Johor Bahru, MY",
    });
  });

  // WebSocket Server for Gemini Live API (/live)
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = new URL(
      request.url || "/",
      `http://${request.headers.host || "localhost"}`
    ).pathname;

    if (pathname === "/live") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
    // Let other upgrade requests pass or close cleanly
  });

  wss.on("connection", async (clientWs: WebSocket, request) => {
    const reqUrl = new URL(
      request.url || "/",
      `http://${request.headers.host || "localhost"}`
    );
    const voiceName = reqUrl.searchParams.get("voice") || "Puck";
    const moodMode = reqUrl.searchParams.get("mode") || "spontaneous";
    const starterTopic = reqUrl.searchParams.get("topic") || "";

    let modeAddendum = "";
    if (moodMode === "chill") {
      modeAddendum =
        "\n\nCURRENT VIBE OVERRIDE: Kelvin wants a relaxed, low-pressure, light conversation right now. Keep turns extra breezy, humorous, and effortless.";
    } else if (moodMode === "deep") {
      modeAddendum =
        "\n\nCURRENT VIBE OVERRIDE: Kelvin is in the mood for deep intellectual exploration. Connect first principles across science, human behavior, business, and philosophy while keeping your natural Johor Bahru Malaysian Chinese conversational tone.";
    }

    const fullSystemInstruction = NEXUS_BASE_SYSTEM_INSTRUCTION + modeAddendum;

    let sessionPromise: Promise<any> | null = null;
    let isClosed = false;

    const sendToClient = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    try {
      const ai = getGenAIClient();

      sessionPromise = ai.live.connect({
        model: "gemini-3.8-live",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
          systemInstruction: fullSystemInstruction,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            sendToClient({ type: "session_ready", voiceName, moodMode });
          },
          onmessage: (message: LiveServerMessage) => {
            try {
              // Forward model audio chunks (24kHz raw PCM base64)
              const parts = message.serverContent?.modelTurn?.parts;
              if (parts && Array.isArray(parts)) {
                for (const part of parts) {
                  if (part.inlineData?.data) {
                    sendToClient({
                      type: "audio",
                      audio: part.inlineData.data,
                    });
                  }
                }
              }

              // Forward output transcription
              const outputText =
                (message.serverContent as any)?.outputTranscription?.text;
              if (outputText) {
                sendToClient({
                  type: "output_transcription",
                  text: outputText,
                });
              }

              // Forward input transcription (Kelvin's voice)
              const inputText =
                (message.serverContent as any)?.inputTranscription?.text;
              if (inputText) {
                sendToClient({
                  type: "input_transcription",
                  text: inputText,
                });
              }

              // Forward turnComplete
              if (message.serverContent?.turnComplete) {
                sendToClient({ type: "turn_complete" });
              }

              // Forward interruption signal
              if (message.serverContent?.interrupted) {
                sendToClient({ type: "interrupted" });
              }
            } catch (innerErr: any) {
              console.error("Error processing LiveServerMessage:", innerErr);
            }
          },
          onerror: (err: any) => {
            console.error("Gemini Live error:", err);
            sendToClient({
              type: "error",
              message:
                err?.message ||
                "Live session encountered a connection error. Please check your API key in Settings > Secrets.",
            });
          },
          onclose: () => {
            if (!isClosed) {
              sendToClient({ type: "session_closed" });
            }
          },
        },
      });

      const session = await sessionPromise;

      // Immediately trigger NEXUS's FIRST ACTION so it greets Kelvin right away without waiting!
      const openingTrigger = starterTopic
        ? `[Live voice connection established with Kelvin. Start speaking immediately in natural Johor Bahru Malaysian Chinese Mandarin mixed naturally with English/BM. Greet Kelvin casually like a close friend and kick off the conversation with a fascinating angle or discovery about: "${starterTopic}". Keep it short, natural, and conversational.]`
        : `[Live voice connection established with Kelvin. Execute your FIRST ACTION now: begin speaking immediately with a casual Johor Bahru Malaysian Chinese greeting (e.g., "Eh Boss..." or "Wei Kelvin..."), followed by one genuinely fascinating discovery or unexpected fact Kelvin probably hasn't thought about today. Keep it short and natural.]`;

      session.sendRealtimeInput({
        text: openingTrigger,
      });
    } catch (err: any) {
      console.error("Failed to initialize Gemini Live session:", err);
      sendToClient({
        type: "error",
        message:
          err?.message ||
          "Unable to connect to Gemini Live API. Please verify your GEMINI_API_KEY in Settings > Secrets.",
      });
      clientWs.close();
      return;
    }

    clientWs.on("message", (raw) => {
      if (!sessionPromise || isClosed) return;
      try {
        const msg = JSON.parse(raw.toString());

        sessionPromise
          .then((session) => {
            if (isClosed || !session) return;

            if (msg.audio) {
              session.sendRealtimeInput({
                audio: {
                  data: msg.audio,
                  mimeType: "audio/pcm;rate=16000",
                },
              });
            } else if (msg.text) {
              session.sendRealtimeInput({
                text: msg.text,
              });
            }
          })
          .catch((sendErr) => {
            console.error("Error forwarding realtime input:", sendErr);
          });
      } catch (parseErr) {
        console.error("Invalid client message JSON:", parseErr);
      }
    });

    clientWs.on("close", () => {
      isClosed = true;
      if (sessionPromise) {
        sessionPromise
          .then((session) => {
            try {
              session?.close();
            } catch {
              // ignore close errors
            }
          })
          .catch(() => {});
      }
    });
  });

  if (process.env.NODE_ENV === "production") {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`NEXUS by BLACKTOWER™ server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Fatal server startup error:", err);
  process.exit(1);
});
