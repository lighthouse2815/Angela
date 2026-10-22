# Companion evaluation report

Ngày chạy: 2026-10-22. Node: `v26.11.1`. Dataset: 128 case, 16 category, mỗi nhóm 8 case.
Source commit: `437ae0b1e9a922492fb5b0a9cba8c47abdcfd6c0`.
Dataset SHA-256: `d4209cd00a219970479c971dd564b50ac47fffff827dedbc7278f0acdac28e27`.

[Baseline JSON](./baseline.json) giữ kết quả từng case, nguồn recall, context đã inject và failure reason.
`sourceCommit` là commit chứa runner đã chạy. Commit lưu report chỉ thêm tài liệu và artifact.
Không sửa runtime, memory architecture hoặc production code trong task này.

## Kết quả

Mode: `offline-lexical-with-explicit-extraction-fixtures`. Recall chấm top 5.
Runner dùng MemoryStore, MemoryCapture, consolidator, Recall và context builder thật.
Page fixture mô phỏng đầu ra extraction bằng nội dung message. Fixture không đọc expectation để ghi bộ nhớ.
Không cấu hình generation hoặc embedding provider. Không gọi API trả phí.

| Metric | Số case | Tỷ lệ |
| --- | ---: | ---: |
| Recall hit rate | 93/106 | 87.74% |
| Wrong-memory rate | 0/6 | 0.00% |
| Superseded-memory error rate | 0/16 | 0.00% |
| False shared-memory rate | 0/8 | 0.00% |
| Irrelevant-memory injection rate | 8/32 | 25.00% |
| Context hit rate | 93/106 | 87.74% |
| Forbidden-content rate | 0/32 | 0.00% |
| Case pass rate | 107/128 | 83.59% |

Có 13 case thiếu recall và 8 case inject ký ức không liên quan. Tổng cộng 21 case không đạt.
Hai lần chạy đầy đủ tại cùng source commit tạo report JSON giống hệt từng byte.

False shared-memory chỉ đo bằng chứng bị cấm trong context. Không chấm câu trả lời của model.
Wrong-memory chấm nguồn bị cấm có nhãn. Sáu case âm kiểm tra user, workspace và active-session archive.
Hai case isolation dương cho phép nhớ session trước của cùng user và workspace.
Supersession dùng key fixture cố định. Kết quả không chứng minh model tự nhận biết mọi cập nhật sở thích.

## Lỗi và khoảng trống đã tái hiện

### Câu hỏi chung về cuộc trò chuyện trước

7/8 case `last_conversation` không tìm thấy dữ kiện. Chỉ case có từ trùng với query được recall.
Ví dụ: `last_conversation_001` hỏi “Lần trước mình nói gì với bạn?” nhưng không tìm thấy chuyện kiểm tra hóa.

`Recall.search` hiện chuyển query vào lexical index. `RecallIndex.search` lấy candidate qua token trùng nhau.
Trong mode này, query chung không có đường chọn session trước theo thứ tự thời gian.
Đây là khoảng trống conversational recall trong chế độ không có embedding.

### Paraphrase ít trùng từ

5/8 case `semantic_paraphrase` bị bỏ sót.
Ví dụ: `semantic_paraphrase_001` hỏi kiểu trình bày giúp hiểu nhanh nhưng không tìm thấy sở thích có hình vẽ.
`vietnamese_variants_005` cũng bỏ sót câu hỏi về biệt danh Đậu Đỏ.

Các case kiểm tra khác vẫn recall được văn bản có dấu và không dấu.
Lỗi biệt danh có cả thay đổi cách diễn đạt, không đủ bằng chứng kết luận bộ chuẩn hóa dấu bị lỗi.
Mode lexical không có cơ chế đồng nghĩa. Kết quả này không đo chất lượng embedding model thật.

### Ký ức không liên quan được inject

8/32 case có nhãn distractor bị inject nguồn không liên quan.
Sáu case thuộc `irrelevant_memory`. Hai case thuộc `no_shared_memory`.

Ví dụ `irrelevant_memory_004`: query hỏi cây nhị phân, context lại có chuyện công viên nhiều cây xanh.
Ví dụ `irrelevant_memory_006`: query hỏi trăn Python, context lại có sở thích ngôn ngữ Python.

Lexical candidate dùng OR giữa các token. Có token trùng là đủ vào tập candidate.
`Recall.prepare` đưa nguồn hợp lệ vào context theo budget, chưa loại được các trường hợp khác nghĩa này.
Nguồn được đọc đúng và vẫn sai chủ đề. Không đổi expectation để che lỗi relevance.

[RecallIndex.search](../../packages/angela-cli/src/recall-index.ts),
[Recall.search và Recall.prepare](../../packages/angela-cli/src/recall.ts) chứa các đường xử lý liên quan.
Chưa sửa các điểm yếu này vì task chỉ tạo bộ evaluation.

## Case không đạt

| Case | Failure reason |
| --- | --- |
| `last_conversation_001` | recall-miss-or-wrong-tier / context-miss / missing-content: oxi hóa |
| `last_conversation_002` | recall-miss-or-wrong-tier / context-miss / missing-content: IELTS |
| `last_conversation_003` | recall-miss-or-wrong-tier / context-miss / missing-content: robot |
| `last_conversation_004` | recall-miss-or-wrong-tier / context-miss / missing-content: flashcard |
| `last_conversation_006` | recall-miss-or-wrong-tier / context-miss / missing-content: lòng biết ơn |
| `last_conversation_007` | recall-miss-or-wrong-tier / context-miss / missing-content: hành tinh |
| `last_conversation_008` | recall-miss-or-wrong-tier / context-miss / missing-content: học bổng |
| `semantic_paraphrase_001` | recall-miss-or-wrong-tier / context-miss / missing-content: hình vẽ |
| `semantic_paraphrase_004` | recall-miss-or-wrong-tier / context-miss / missing-content: nghỉ ngắn |
| `semantic_paraphrase_006` | recall-miss-or-wrong-tier / context-miss / missing-content: giảng lại |
| `semantic_paraphrase_007` | recall-miss-or-wrong-tier / context-miss / missing-content: điện thoại |
| `semantic_paraphrase_008` | recall-miss-or-wrong-tier / context-miss / missing-content: tám giờ |
| `no_shared_memory_004` | irrelevant-injection |
| `no_shared_memory_005` | irrelevant-injection |
| `irrelevant_memory_001` | irrelevant-injection |
| `irrelevant_memory_002` | irrelevant-injection |
| `irrelevant_memory_003` | irrelevant-injection |
| `irrelevant_memory_004` | irrelevant-injection |
| `irrelevant_memory_006` | irrelevant-injection |
| `irrelevant_memory_007` | irrelevant-injection |
| `vietnamese_variants_005` | recall-miss-or-wrong-tier / context-miss / missing-content: Đậu Đỏ |

## Kiểm tra đã chạy

Các lần kiểm tra hoàn tất bên dưới chạy tuần tự. Vitest dùng một worker và tắt file parallelism.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm -F @angela/evals-companion check:dataset` | 128 case hợp lệ, 16 category, ID duy nhất |
| `pnpm -F @angela/evals-companion typecheck` | Pass |
| `pnpm -F @angela/evals-companion test` | 1 file, 23 test pass |
| `pnpm exec vitest run --project @angela/evals-companion --maxWorkers 1 --no-file-parallelism` | 23 test pass qua cấu hình root |
| `pnpm -F @angela/cli typecheck` | Pass |
| `pnpm -F @angela/cli build` | Pass, có cảnh báo dynamic import đã có trong CLI |
| `pnpm lint` | Pass, ESLint 0 lỗi và 603 cảnh báo. Oxlint 12 cảnh báo |
| Hai lần chạy toàn bộ runner | Cùng summary và JSON giống hệt từng byte |
| `eval --id preference_change_001 --strict` | Exit 0 |
| `eval --id last_conversation_001 --strict` | Exit 1, đúng quality failure đã ghi |
| `git diff --check` | Pass |

Lệnh regression Memory V2/Recall:

```bash
pnpm -F @angela/cli exec vitest run --config vitest.config.ts \
  src/memory-v2 src/memory.test.ts src/project-memory.test.ts src/context.test.ts \
  src/runtime/memory-capture.test.ts src/runtime/session-lifecycle.test.ts \
  src/runtime/runtime.test.ts src/sessions.test.ts \
  --maxWorkers 1 --no-file-parallelism
```

Kết quả: 12 file, 110 test pass. Không phát hiện regression trong phạm vi kiểm tra này.
Không chạy lại toàn bộ test monorepo hoặc live Telegram/Discord.

## Ghi chú môi trường và lần thử chưa hoàn tất

PnPM 11 có thể tự install trước khi chạy script khi trạng thái dependencies thay đổi.
Lần tự install đã kích hoạt build toàn bộ packages và gặp `Exec format error` tại `@angela/cap-vite`.
Build CLI độc lập sau đó pass. Chưa sửa launcher hoặc package ngoài phạm vi task.

Một lần frozen offline install gặp thiếu metadata cache cho `@agentclientprotocol/sdk`.
Không thêm package này. Lockfile chỉ thêm importer eval với Valibot và i18n đã có sẵn trong workspace.

Các lệnh kiểm tra sau đó đặt `pnpm_config_verify_deps_before_run=false` để tránh tự install lặp lại.
Lint hook vẫn chạy khi commit. Không bỏ test hoặc vô hiệu hóa validation.

Một lần thử script test ban đầu chọn nhầm root Vitest config và đã được dừng.
Config eval sau đó dùng root riêng, một worker và không chạy file song song.
Cả script package và đường chạy root theo project đều đã pass sau sửa cấu hình.

## Tái hiện

```bash
pnpm -F @angela/evals-companion eval --output /tmp/companion-report.json
pnpm -F @angela/evals-companion eval --id last_conversation_001 --strict
pnpm -F @angela/evals-companion eval --category irrelevant_memory
```

Giữ nhãn hiện tại khi sửa Recall trong task sau. So sánh numerator, denominator và kết quả từng case.
Corpus tổng hợp này không đại diện cho mọi hội thoại. Chưa đánh giá generation, extraction model hoặc embedding model thật.
