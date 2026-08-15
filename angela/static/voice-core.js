"use strict";

(function attachVoiceCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AngelaVoiceCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  function createNdjsonParser(onEvent) {
    let buffer = "";

    function parseLine(line) {
      const clean = line.trim();
      if (!clean) return;
      const event = JSON.parse(clean);
      if (!event || typeof event !== "object" || Array.isArray(event)) {
        throw new Error("Sự kiện streaming không hợp lệ");
      }
      onEvent(event);
    }

    return {
      push(text) {
        buffer += text;
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          parseLine(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
        }
      },
      finish() {
        if (buffer.trim()) parseLine(buffer);
        buffer = "";
      },
    };
  }

  function extractSentences(text, { flush = false } = {}) {
    const sentences = [];
    let remainder = String(text || "").trimStart();
    const abbreviation = /(?:^|\s)(?:TP|ThS|TS|PGS|GS|Mr|Mrs|Ms|Dr)\.$/i;

    while (remainder) {
      let boundary = -1;
      let searchFrom = 0;
      const punctuation = /[.!?…]+(?:["”’')\]]+)?(?=\s|$)/g;
      punctuation.lastIndex = searchFrom;
      let match = punctuation.exec(remainder);
      while (match) {
        const candidateEnd = match.index + match[0].length;
        const candidate = remainder.slice(0, candidateEnd).trim();
        if (!abbreviation.test(candidate)) {
          boundary = candidateEnd;
          break;
        }
        searchFrom = candidateEnd;
        punctuation.lastIndex = searchFrom;
        match = punctuation.exec(remainder);
      }

      const newline = remainder.indexOf("\n");
      if (newline >= 0 && (boundary < 0 || newline < boundary)) boundary = newline + 1;
      if (boundary < 0 && remainder.length > 220) {
        boundary = remainder.lastIndexOf(" ", 220);
        if (boundary < 80) boundary = 220;
      }
      if (boundary < 0) break;

      const sentence = remainder.slice(0, boundary).trim();
      if (sentence) sentences.push(sentence);
      remainder = remainder.slice(boundary).trimStart();
    }
    if (flush && remainder.trim()) {
      sentences.push(remainder.trim());
      remainder = "";
    }
    return { sentences, remainder };
  }

  function joinTranscript(base, addition) {
    const left = String(base || "").trim();
    const right = String(addition || "").trim();
    if (!left) return right;
    if (!right) return left;
    return `${left} ${right}`;
  }

  function collectRecognitionResults(event, previousFinal = "") {
    let finalTranscript = String(previousFinal || "").trim();
    const interimParts = [];
    const start = Number(event?.resultIndex || 0);
    const results = event?.results || [];
    for (let index = start; index < results.length; index += 1) {
      const result = results[index];
      const transcript = String(result?.[0]?.transcript || "").trim();
      if (!transcript) continue;
      if (result.isFinal) {
        finalTranscript = joinTranscript(finalTranscript, transcript);
      } else {
        interimParts.push(transcript);
      }
    }
    return {
      finalTranscript,
      interimTranscript: interimParts.join(" ").trim(),
    };
  }

  function normalizeForSpeech(text) {
    return String(text || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_#>~-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function deriveVoicePhase(voice) {
    if (["starting", "listening", "stopping"].includes(voice.recognition)) {
      return "listening";
    }
    if (voice.error) return "error";
    if (voice.request === "connecting") return "thinking";
    if (voice.request === "streaming" && voice.speech === "speaking") {
      return "streaming-speaking";
    }
    if (voice.request === "streaming") return "streaming";
    if (voice.speech === "speaking") return "speaking";
    if (!voice.capabilities?.recognition && !voice.capabilities?.synthesis) {
      return "unsupported";
    }
    return "idle";
  }

  return {
    collectRecognitionResults,
    createNdjsonParser,
    deriveVoicePhase,
    extractSentences,
    joinTranscript,
    normalizeForSpeech,
  };
});
