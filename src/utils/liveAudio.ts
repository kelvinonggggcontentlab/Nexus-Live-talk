// Raw PCM 16-bit Little-Endian utilities for Gemini Live API (16kHz input, 24kHz output)

export function float32ToBase64Pcm16(float32Array: Float32Array): string {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16Array.buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const subarray = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(subarray));
  }
  return btoa(binary);
}

export function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const int16Array = new Int16Array(bytes.buffer);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768.0;
  }
  return float32Array;
}

export function computeRmsLevel(float32Array: Float32Array): number {
  if (float32Array.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < float32Array.length; i++) {
    sumSquares += float32Array[i] * float32Array[i];
  }
  const rms = Math.sqrt(sumSquares / float32Array.length);
  return Math.min(1, rms * 4.5);
}
