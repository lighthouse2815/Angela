"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  collectRecognitionResults,
  createNdjsonParser,
  deriveVoicePhase,
  extractSentences,
  joinTranscript,
  normalizeForSpeech,
} = require("../../angela/static/voice-core.js");

test("NDJSON parser handles split and multiple events", () => {
  const events = [];
  const parser = createNdjsonParser((event) => events.push(event));
  parser.push('{"type":"del');
  parser.push('ta","content":"xin"}\n{"type":"delta","content":" chào"}\n');
  parser.push('{"type":"done"}');
  parser.finish();
  assert.deepEqual(events, [
    { type: "delta", content: "xin" },
    { type: "delta", content: " chào" },
    { type: "done" },
  ]);
});

test("sentence extraction queues complete sentences and flushes remainder", () => {
  const first = extractSentences("Chào bạn. Hôm");
  assert.deepEqual(first, { sentences: ["Chào bạn."], remainder: "Hôm" });
  const second = extractSentences(`${first.remainder} nay ổn chứ? Mình đang nghe`);
  assert.deepEqual(second, {
    sentences: ["Hôm nay ổn chứ?"],
    remainder: "Mình đang nghe",
  });
  assert.deepEqual(extractSentences(second.remainder, { flush: true }), {
    sentences: ["Mình đang nghe"],
    remainder: "",
  });
  assert.deepEqual(extractSentences("Mình ở TP. HCM.\nBạn thì sao"), {
    sentences: ["Mình ở TP. HCM."],
    remainder: "Bạn thì sao",
  });
  const longSentence = `${"từ ".repeat(80)}còn nữa`;
  const bounded = extractSentences(longSentence);
  assert.equal(bounded.sentences.length, 1);
  assert.ok(bounded.sentences[0].length <= 220);
});

test("recognition separates final and interim results without duplication", () => {
  const event = {
    resultIndex: 1,
    results: [
      Object.assign([{ transcript: "old" }], { isFinal: true }),
      Object.assign([{ transcript: "xin chào" }], { isFinal: true }),
      Object.assign([{ transcript: "angela" }], { isFinal: false }),
    ],
  };
  assert.deepEqual(collectRecognitionResults(event, "đã có"), {
    finalTranscript: "đã có xin chào",
    interimTranscript: "angela",
  });
  assert.equal(joinTranscript("bản nháp", "nói thêm"), "bản nháp nói thêm");
});

test("voice phase prioritizes listening then request then speech", () => {
  const voice = {
    capabilities: { recognition: true, synthesis: true },
    recognition: "listening",
    request: "streaming",
    speech: "speaking",
    error: null,
  };
  assert.equal(deriveVoicePhase(voice), "listening");
  voice.recognition = "idle";
  assert.equal(deriveVoicePhase(voice), "streaming-speaking");
  voice.request = "idle";
  assert.equal(deriveVoicePhase(voice), "speaking");
  voice.error = "micro failed";
  assert.equal(deriveVoicePhase(voice), "error");
});

test("speech normalization removes markdown noise", () => {
  assert.equal(
    normalizeForSpeech("**Chào** [bạn](https://example.com) `nhé`"),
    "Chào bạn nhé",
  );
});
