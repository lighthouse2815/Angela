<a id="mimic-baseline-training-boundary"></a>

# Ranh giới đào tạo cơ bản bắt chước

<a id="summary"></a>

## Bản tóm tắt

Tài liệu này xác định dòng đào tạo trong tương lai cho `computer-use-mcp`.

Quyết định hiện tại là cố tình bảo thủ:

- Đừng bắt đầu đào tạo VLA đầy đủ hoặc mô hình thể hiện ngay bây giờ.
- Đừng kết nối bất kỳ mô hình nào đã học vào quá trình thực thi runtime ngay bây giờ.
- Không kết hợp dòng này với chafa, CLI, desktop UI công việc thú cưng hoặc quy trình mã hóa thiết bị đầu cuối.
- Bắt đầu với thử nghiệm bắt chước đường cơ sở/người chấm điểm ứng viên đã học của có giới hạn.

Thành phần đã học cuối cùng sẽ xếp hạng các ứng viên hoặc hành động UI cấp thấp. Nó không được hiểu ngôn ngữ người dùng, thực thi các công cụ, bỏ qua phê duyệt hoặc quyết định rằng một nhiệm vụ đã hoàn thành.

<a id="status"></a>

## Trạng thái

Trạng thái hiện tại: chỉ ranh giới thử nghiệm.

Gói này hiện không chứa mô hình sử dụng máy tính được đào tạo. Bất kỳ công cụ ghi điểm bắt chước nào trong tương lai đều là dữ liệu tư vấn cho đến khi các hợp đồng xác minh, phê duyệt và tích hợp runtime rõ ràng được viết và thử nghiệm.

<a id="architecture-boundary"></a>

## Ranh giới kiến ​​trúc

Sự phân chia trách nhiệm dự kiến ​​là:

- LLM / Planner xử lý việc hiểu ngôn ngữ và phân tách mục tiêu của người dùng thành mục tiêu phụ hiện tại có cấu trúc.
- Người quan sát cung cấp ảnh chụp màn hình, cây DOM / AX, các phần tử ứng viên, URL/title/state hiện tại và dấu vết hành động trước đó.
- Chính sách bắt chước chỉ thực hiện `observation -> candidate/action ranking`.
- runtime cổng kiểm tra, kỷ luật phê duyệt, người thực thi hành động và xác minh cổng kiểm tra quyết định liệu mọi thứ có thể được thực thi hay không.

Lệnh của cơ quan có thẩm quyền:

```text
runtime/system rules
active user instruction
approval and safety policy
verification gate
trusted current-run tool evidence
planner subgoal / plan state
observer candidate set
mimic scorer ranking
model guess
```

Người ghi điểm bắt chước có thể đưa ra lựa chọn. Nó không thể cho phép thực thi.

<a id="v1-experiment-shape"></a>

## Hình dạng thí nghiệm V1

Nếu thư mục thử nghiệm được tạo, hãy sử dụng:

```text
capabilities/computer-use/experiments/mimic-baseline/
```

Các tập tin có thể:

```text
trace-schema.ts
collect-trace.ts
build-dataset.ts
eval-candidate-scorer.ts
README.md
```

Phạm vi V1:

1. Xác định lược đồ theo dõi.
2. Xác định cấu trúc dữ liệu quan sát, ứng viên và hành động.
3. Xây dựng trình thu thập dấu vết cho các nhiệm vụ browser/macOS UI xác định.
4. Lưu mục tiêu nhiệm vụ, mục tiêu phụ hiện tại, ảnh chụp màn hình, ứng viên DOM / AX, hành động trước đó, hành động tiếp theo do con người chọn và hiệu quả / kết quả xác minh dự kiến ​​​​khi có sẵn.
5. Ánh xạ các hành động click/type/scroll của con người trở lại ID ứng viên.
6. Xây dựng trình tạo tập dữ liệu.
7. Xây dựng kịch bản đánh giá ngoại tuyến.

Không thực hiện đào tạo trước khi chất nền này tồn tại.

<a id="trace-schema-v1-sketch"></a>

## Sơ đồ dấu vết V1 Phác thảo

Lược đồ đầu tiên phải thân thiện với phần bổ sung và mang tính xác định.

```ts
interface MimicTraceRecordV1 {
  schema: 'computer-use-mcp.mimic-trace.v1'
  traceId: string
  stepId: string
  createdAt: string

  taskGoal: string
  currentSubgoal: string

  observation: {
    screenshotPath?: string
    screenshotSha256?: string
    url?: string
    title?: string
    app?: string
    windowTitle?: string
    candidates: MimicCandidateV1[]
  }

  previousActions: MimicActionV1[]
  chosenAction: MimicActionV1
  chosenCandidateId?: string
  mapping: {
    status: 'matched_candidate' | 'no_target' | 'ambiguous' | 'outside_observed_bounds'
    candidateId?: string
    distancePx?: number
    reason?: string
  }

  expectedEffect?: string
  verification?: {
    status: 'passed' | 'failed' | 'unknown'
    summary?: string
  }

  source: {
    collector: 'manual' | 'deterministic_demo' | 'human_replay'
    platform: 'macos'
    browser?: 'chrome'
  }
}
```

Cơ cấu ứng viên và hành động nên ở mức thấp:

```ts
interface MimicCandidateV1 {
  id: string
  source: 'chrome_dom' | 'ax' | 'vision' | 'manual'
  role?: string
  label?: string
  text?: string
  bounds: { x: number, y: number, width: number, height: number }
  enabled?: boolean
  visible?: boolean
  metadata?: Record<string, unknown>
}

type MimicActionType = 'click' | 'type_text' | 'scroll' | 'press_key' | 'wait' | 'no_target'

interface MimicActionV1 {
  type: MimicActionType
  candidateId?: string
  point?: { x: number, y: number }
  text?: string
  direction?: 'up' | 'down' | 'left' | 'right'
  key?: string
}
```

Không đặt bí mật thô, cookie, khóa API hoặc toàn bộ bộ nhớ trình duyệt vào dấu vết.

<a id="dataset-builder-contract"></a>

## Hợp đồng xây dựng tập dữ liệu

Trình xây dựng tập dữ liệu sẽ chuyển đổi các bản ghi theo dõi thành các ví dụ có giới hạn:

```text
input:
  task goal
  current subgoal
  screenshot reference
  candidate list
  previous actions

label:
  chosen action type
  chosen candidate id when mapped
  no-target / unmapped status when not mapped
```

Định dạng tập dữ liệu đầu tiên có thể là JSONL. Nó phải giữ ảnh chụp màn hình dưới dạng tệp được tham chiếu, không phải base64 nội tuyến, trừ khi phần phụ trợ đào tạo sau này yêu cầu đóng gói.

<a id="offline-eval-metrics"></a>

## Số liệu đánh giá ngoại tuyến

Tập lệnh đánh giá ngoại tuyến đầu tiên sẽ báo cáo:

- Tỷ lệ khớp ứng viên Top-1
- Tỷ lệ khớp ứng viên Top-3
- độ chính xác của loại hành động
- tỷ lệ không có mục tiêu/hành động chưa được ánh xạ
- tỷ lệ ứng viên không an toàn/không hợp lệ nếu có

Đầu ra đánh giá phải mang tính xác định và dựa trên tệp. Nó không được gọi công cụ runtime, thay đổi desktop hoặc yêu cầu khóa mô hình nhà cung cấp cho hợp đồng lược đồ đầu tiên.

<a id="promotion-gates"></a>

## Khuyến mãi cổng kiểm tra

Không thảo luận về việc tích hợp runtime cho đến khi tất cả những điều này đều đúng:

- tồn tại ít nhất 50 đến 100 dấu vết sạch
- trích xuất ứng viên ổn định cho các nhiệm vụ demo mục tiêu
- lập bản đồ hành động của con người có tỷ lệ chưa được lập bản đồ thấp có thể giải thích được
- số liệu top-k ngoại tuyến có thể lặp lại
- Các trường hợp ứng viên không an toàn hoặc không hợp lệ phải được đo lường, không được bỏ qua.
- ranh giới phê duyệt và xác minh không thay đổi

Ngay cả sau khi vượt qua cổng kiểm tra, người ghi điểm đã học chỉ phải nhập runtime dưới dạng xếp hạng tư vấn. Nó không được thực thi các công cụ trực tiếp.

<a id="chika-ownership-boundary"></a>

## Ranh giới sở hữu Chika

Chika có thể sở hữu các nhiệm vụ thử nghiệm có giới hạn này:

- người sưu tầm
- lược đồ
- nhiệm vụ demo trình duyệt xác định
- lập bản đồ ứng viên
- trình tạo tập dữ liệu
- đánh giá ngoại tuyến

Chika không nên sở hữu những thứ này ở lát đầu tiên:

- đào tạo VLA đầy đủ
- Tích hợp thực thi runtime
- Hỗ trợ Windows
- tích hợp quy trình mã hóa thiết bị đầu cuối
- Triển khai mô hình
- sản phẩm tuyên bố rằng Angela đã được đào tạo cách sử dụng máy tính mô hình

## Non-Goals

- Không có đào tạo VLA đầy đủ.
- Không có tính năng tự động thực thi runtime.
- Không có quy trình mã hóa thiết bị đầu cuối.
- Không có hỗ trợ Windows.
- Không triển khai mô hình.
- Không có thay đổi lược đồ MCP trừ khi thực sự cần thiết cho việc tuần tự hóa dấu vết.
- Không tích hợp thú cưng desktop/chafa/CLI.
- Không có sản phẩm nào khẳng định Angela có mô hình được đào tạo sử dụng máy tính.

<a id="reminder-trigger"></a>

## Kích hoạt lời nhắc

Khi dòng này được mở lại, hãy nhắc nhở chủ sở hữu về quyết định hiện tại:

```text
Do not train or deploy yet. First prove the mimic trace schema, deterministic
collector, candidate mapping, dataset builder, and offline eval.
```

Chỉ xem lại quyết định đào tạo sau khi đạt được mức thăng cấp cổng kiểm tra ở trên.
