<a id="angela-coding-cli--chafa-architecture"></a>

# Angela Mã hóa CLI + Kiến trúc Chafa

<a id="purpose"></a>

## Mục đích

Xác định kiến ​​trúc hẹp cho mã hóa Angela CLI hướng về thiết bị đầu cuối có thể tùy ý hiển thị hình đại diện hoạt hình thông qua `chafa` mà không cần kết hợp bản trình bày thiết bị đầu cuối với `computer-use-mcp` runtime.

Tài liệu này là một ranh giới và đề xuất hợp đồng. Đây không phải là kế hoạch triển khai cho CLI đầy đủ trong PR này.

<a id="shipped-terminal-client"></a>

## Máy khách đầu cuối đã vận chuyển

[`apps/cli`](../../apps/cli/README.md) cung cấp tính năng trò chuyện bằng văn bản, công cụ đầu cuối MCP, phê duyệt host và các phiên đã lưu. Nó sử dụng các sự kiện sinh nội dung từ `core-agent` và các lệnh gọi công cụ qua stdio MCP. Phong bì sự kiện runner và Chafa renderer bên dưới vẫn là đề xuất.

<a id="runner-event-proposal"></a>

## Đề xuất sự kiện runner

Kể từ ngày 26 tháng 04 năm 2026, nhánh chính không hiển thị luồng sự kiện runner mã hóa ổn định. CLI thể hiện tiến độ thực sự cần có hợp đồng runner trước tiên. Bắt đầu với hoạt ảnh đầu cuối trước khi hợp đồng đó tồn tại sẽ tạo ra bản trình bày không có trạng thái runtime đáng tin cậy.

Thứ tự phụ thuộc đúng là:

1. Xác định hợp đồng sự kiện runner mã hóa.
2. Phát ra các sự kiện runner xác định từ mã hóa runner.
3. Xây dựng CLI dạng văn bản đầu tiên sử dụng các sự kiện đó.
4. Thêm kết xuất hình đại diện `chafa` tùy chọn làm bộ điều hợp hiển thị.

<a id="confirmed-decisions"></a>

## Quyết định đã được xác nhận

1. Vị trí gói CLI trong tương lai: `apps/cli`.
2. Kênh tích hợp đầu tiên: gọi lại runner trong quá trình.
3. JSONL trên stdin/file vẫn là bộ chuyển đổi tiếp theo để phát lại, mẫu kiểm thử và khả năng tương tác của công cụ.
4. `chafa` chỉ là bản trình bày tùy chọn.

<a id="hard-boundaries"></a>

## Ranh giới cứng

1. Không có phần phụ thuộc `chafa` nào thuộc về lõi `capabilities/computer-use` runtime.
2. `computer-use-mcp` phải duy trì không có giao diện an toàn và CI an toàn.
3. CLI sử dụng các sự kiện runner; nó không được phép lập kế hoạch, thực thi công cụ hoặc chính sách runtime.
4. Thiếu `chafa` phải chuyển sang hiển thị văn bản thuần túy.
5. Đầu ra không phải TTY phải hỗ trợ đầu ra văn bản thuần túy hoặc JSONL.
6. Các thay đổi kết xuất CLI không được trộn lẫn với bộ nhớ mã hóa hoặc bộ tái cấu trúc runner runtime.

<a id="proposed-location-split"></a>

## Phân chia vị trí được đề xuất

- Lõi runtime: `capabilities/computer-use`.
- Gói CLI: `apps/cli`.
- Hợp đồng sự kiện: ban đầu được đặt cùng vị trí với runner phát ra nó, sau đó được xuất để tiêu thụ CLI.
- Soạn tin renderer: `apps/cli/src/renderers/text.ts`.
- Bộ chuyển đổi Chafa: `apps/cli/src/renderers/chafa-avatar.ts`.
- JSONL thích ứng: ​​`apps/cli/src/adapters/jsonl.ts`.

<a id="runner-event-contract-draft"></a>

## Dự thảo hợp đồng sự kiện runner

Sử dụng phong bì sự kiện chỉ gắn thêm. transport đầu tiên phải là lệnh gọi lại đang trong quá trình. JSONL là một bộ chuyển đổi trên cùng một phong bì.

```ts
interface RunnerEventEnvelope<TKind extends string = string, TPayload = unknown> {
  runId: string
  seq: number
  at: string
  kind: TKind
  payload: TPayload
}
```

Nguyên tắc hợp đồng:

- `seq` tăng nghiêm ngặt trong từng `runId`.
- `at` là dấu thời gian ISO.
- các sự kiện chỉ được thêm vào; các sự kiện sau không được viết lại các sự kiện trước đó.
- đường dẫn sự cố và thời gian chờ phải phát ra các sự kiện đầu cuối xác định.

<a id="minimum-event-kinds"></a>

## Các loại sự kiện tối thiểu

- `run_started`
- `preflight_started`
- `preflight_completed`
- `step_started`
- `tool_call_started`
- `tool_call_completed`
- `assistant_message`
- `step_timeout`
- `report_status`
- `run_finished`
- `run_crashed`

<a id="minimum-payloads"></a>

## Tải trọng tối thiểu

`run_started`:

```ts
interface RunStartedPayload {
  workspacePath: string
  taskGoal: string
  maxSteps: number
  stepTimeoutMs: number
}
```

`step_started`:

```ts
interface StepStartedPayload {
  stepIndex: number
  maxSteps: number
}
```

`tool_call_started`:

```ts
interface ToolCallStartedPayload {
  toolName: string
  argsSummary: string
}
```

`tool_call_completed`:

```ts
interface ToolCallCompletedPayload {
  toolName: string
  ok: boolean
  status?: string
  summary: string
  error?: string
}
```

`assistant_message`:

```ts
interface AssistantMessagePayload {
  text: string
}
```

`report_status`:

```ts
interface ReportStatusPayload {
  status: 'completed' | 'failed' | 'blocked'
  summary?: string
}
```

`run_finished`:

```ts
interface RunFinishedPayload {
  finalStatus: 'completed' | 'failed' | 'blocked' | 'timeout'
  totalSteps: number
  error?: string
}
```

<a id="cli-architecture"></a>

## Kiến trúc CLI

CLI phải có ba lớp có thể tách rời.

<a id="1-input-adapter"></a>

### 1. Bộ chuyển đổi đầu vào

Bộ điều hợp đầu vào chuyển đổi đầu vào dành riêng cho transport thành các sự kiện `RunnerEventEnvelope`.

Bộ điều hợp ban đầu:

- gọi lại runner đang trong quá trình
- stdin JSONL
- Phát lại tập tin JSONL

<a id="2-state-reducer"></a>

### 2. Trạng thái reducer

reducer xây dựng `CliViewState` xác định từ các sự kiện.

Quy tắc:

- không có thiết bị đầu cuối I/O trong reducer
- Không khởi tạo tiến trình trong reducer
- không có thời gian hoạt ảnh trong reducer
- Các thử nghiệm reducer nên sử dụng luồng sự kiện mẫu kiểm thử

<a id="3-renderer-adapter"></a>

### 3. Bộ chuyển đổi renderer

Bộ điều hợp renderer tiêu thụ `CliViewState`.

các renderer ban đầu:

- văn bản renderer, luôn có sẵn
- JSONL chuyển qua renderer cho dụng cụ
- hình đại diện `chafa` tùy chọn renderer

<a id="chafa-adapter"></a>

## Bộ chuyển đổi Chafa

Bộ chuyển đổi `chafa` nên:

- thăm dò tính khả dụng nhị phân `chafa` khi khởi động
- tự tắt khi thiết bị xuất chuẩn không phải là TTY
- chuyển đổi nội dung sprite hoặc khung thành khung ANSI
- tốc độ hoạt ảnh độc lập với tốc độ sự kiện runner
- quay lại hiển thị chỉ văn bản khi thất bại

Cờ CLI ban đầu:

- `--avatar=chafa|none`
- `--no-avatar`
- `--events=runner|stdin|jsonl-file`
- `--output=pretty|jsonl`

<a id="testing-strategy"></a>

## Chiến lược thử nghiệm

1. Kiểm tra hợp đồng cho lược đồ sự kiện và `seq` đơn điệu.
2. reducer kiểm tra từ các luồng mẫu kiểm thử JSONL.
3. Kiểm tra ảnh chụp nhanh renderer.
4. Kiểm tra bộ điều hợp Chafa bằng cách thăm dò nhị phân mô phỏng và thực thi quy trình con mô phỏng.
5. CI mặc định ở chế độ văn bản và không yêu cầu `chafa`.

<a id="delivery-stages"></a>

## Giai đoạn giao hàng

<a id="stage-1-contract"></a>

### stage 1: Hợp đồng

- xác định đường bao sự kiện runner
- thêm các luồng mẫu kiểm thử thành công, thất bại và hết thời gian chờ
- chưa kết xuất thiết bị đầu cuối UI

<a id="stage-2-text-cli"></a>

### stage 2: Soạn tin CLI

- scaffold `apps/cli`
- tiêu thụ các sự kiện runner
- hiển thị trạng thái chạy, bước, công cụ, lỗi và báo cáo cuối cùng ở dạng văn bản thuần túy

<a id="stage-25-jsonl-adapter"></a>

### stage 2.5: Bộ chuyển đổi JSONL

- hỗ trợ phát lại stdin JSONL
- hỗ trợ phát lại tập tin JSONL
- sử dụng mẫu kiểm thử cho các bản demo và thử nghiệm ngoại tuyến

<a id="stage-3-chafa-renderer"></a>

### stage 3: renderer đã chết

- thêm `chafa` renderer tùy chọn
- giữ văn bản thuần túy làm phương án dự phòng mặc định
- giữ CI và không có giao diện chạy độc lập với `chafa`

<a id="acceptance-criteria"></a>

## Tiêu chí chấp nhận

1. Không có phần phụ thuộc `chafa` nào được thêm vào trong `capabilities/computer-use`.
2. CLI hoạt động khi `chafa` chưa được cài đặt.
3. CI không yêu cầu `chafa`.
4. reducer có thể kiểm tra được từ các luồng sự kiện giả định.
5. Đầu ra của thiết bị đầu cuối chuyển thành văn bản thuần túy.
6. Hành vi của runner không được thay đổi đối với UX có hoạt ảnh đầu tiên.

<a id="review-checklist"></a>

## Danh sách kiểm tra đánh giá

Phân lớp:

- không có mã renderer trong `computer-use-mcp` runtime
- không có sự phụ thuộc `chafa` trong các gói runtime
- Mã CLI vẫn nằm dưới `apps/cli`

Runtime:

- runner vẫn an toàn với không có giao diện
- runner phát ra các sự kiện mà không phụ thuộc vào trạng thái đầu cuối
- lỗi và thời gian chờ tạo ra các sự kiện xác định

Fallback:

- Thiếu `chafa` không làm việc thực thi CLI thất bại
- chế độ không phải TTY sử dụng văn bản hoặc đầu ra JSONL

Phạm vi:

- không kết hợp kết xuất CLI với các thay đổi bộ nhớ mã hóa
- không kết hợp kết xuất CLI với các thay đổi desktop/browser runtime

<a id="out-of-scope"></a>

## Ngoài phạm vi

- thúc đẩy và quản lý trí nhớ dài hạn
- Bộ tái cấu trúc desktop/browser runtime
- hoạt ảnh đầu cuối trước khi tồn tại hợp đồng sự kiện runner
- thay đổi ngữ nghĩa hoàn thành mã hóa runner cho mục đích hiển thị

<a id="suggested-follow-up-prs"></a>

## PR tiếp theo được đề xuất

- `feat(cli): define coding runner event contract`
- `feat(cli): scaffold airi coding cli text renderer`
- `feat(cli): add optional terminal Angela avatar renderer with chafa`
