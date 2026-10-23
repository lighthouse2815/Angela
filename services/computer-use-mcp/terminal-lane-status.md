<a id="terminal-lane-status"></a>

# Trạng thái thiết bị đầu cuối luồng

Phạm vi: thiết bị đầu cuối luồng hoạt động trong `services/computer-use-mcp/**`.

Tệp này là bản ghi bàn giao cho công việc của thiết bị đầu cuối luồng. Nó được chuyển đến đây từ `AGENTS.md` mà không thay đổi nội dung.

<a id="current-status-snapshot"></a>

## Ảnh chụp nhanh trạng thái hiện tại

Đã cập nhật cho luồng công việc terminal-luồng-v2 hiện tại.

Sự thật quan trọng là:

- `exec` đã là một bề mặt đường chính thực sự.
- `PTY` không còn chỉ là một bộ công cụ rời rạc; công cụ xử lý công việc hiện có hỗ trợ tự cấp phát.
- Các E2E đầu cuối lớp dịch vụ cho luồng hiện tại hiện có và được coi là đường dây chứng minh đầu cuối.
- Bản demo thiết bị đầu cuối trò chuyện Angela hiện đã được căn chỉnh với thiết bị đầu cuối luồng v2 và không còn tạo trước PTY nữa.
- desktop shell hiện phân biệt `pty_session` với `terminal_and_apps`.
- Trò chuyện Angela tự cấp phát hiện là một phần của bộ cổng kiểm tra phát hành nghiêm ngặt, vì vậy việc hỗ trợ tuyến chính PTY không còn bị hạn chế một cách có chủ ý nữa.

Đừng dựa vào các bản tóm tắt trò chuyện đã nén để tiếp tục công việc này. Sử dụng tệp này làm nguồn chuyển giao sự thật và cập nhật nó khi hành vi của terminal-luồng thay đổi đáng kể.

Đối với các dữ kiện của terminal-luồng, hãy xử lý tệp này phù hợp với:

- `README.md`
- `src/support-matrix.ts`
- Tập lệnh `package.json`
- implementation/tests cho mỗi lệnh hoặc tệp được tham chiếu

<a id="terminal-lane-v2-what-is-already-landed"></a>

## Terminal luồng v2: Những gì đã hạ cánh

<a id="1-terminal-surface-model-exists"></a>

### 1. Bề mặt đầu cuối mô hình tồn tại

Các bước quy trình làm việc có khả năng sử dụng thiết bị đầu cuối hiện có ngữ nghĩa thiết bị đầu cuối rõ ràng thay vì phỏng đoán thuần túy:

- `mode: 'exec' | 'auto' | 'pty'`
- `interaction: 'one_shot' | 'persistent'`

Việc thực hiện chính tồn tại trong:

- `src/workflows/types.ts`
- `src/workflows/surface-resolver.ts`
- `src/terminal/interactive-patterns.ts`

<a id="2-auto-surface-resolution-is-fixed-to-a-small-rule-set"></a>

### 2. Độ phân giải bề mặt tự động được cố định theo một bộ quy tắc nhỏ

`auto` cố tình thu hẹp. Nó chỉ nâng cấp lên PTY khi một trong những điều sau là đúng:

1. `taskId + stepId` hiện tại đã có phiên PTY bị ràng buộc.
2. Bước này khai báo rõ ràng `interaction: 'persistent'`.
3. Lệnh khớp với `KNOWN_INTERACTIVE_COMMAND_PATTERNS`.
4. Một nỗ lực thực thi failed/timed-out sẽ hiển thị một trong những `INTERACTIVE_OUTPUT_MARKERS`.

Bộ quy tắc này được bao phủ bởi:

- `src/workflows/surface-resolver.test.ts`
- `src/terminal/interactive-patterns.test.ts`

<a id="3-workflow-engine-can-self-acquire-pty"></a>

### 3. Công cụ quy trình làm việc có thể tự cấp phát PTY

Động cơ đã chứa hình dạng v2:

- `AcquirePtyForStep`
- `StepTerminalProgress`
- điểm treo `before_pty_acquire`
- Hỗ trợ gia đình bước PTY:
  - `pty_send_input`
  - `pty_read_screen`
  - `pty_wait_for_output`
  - `pty_destroy_session`

Việc thực hiện chính tồn tại trong:

- `src/workflows/engine.ts`

Hành vi dự định là:

- quy trình làm việc giải quyết bề mặt đầu cuối
- nếu cần PTY, hãy tự xử lý acquires/binds PTY
- quy trình làm việc tiếp tục trong cùng một quy trình làm việc
- định tuyến lại thiết bị đầu cuối bên ngoài hiện chỉ là thứ yếu, không phải là bằng chứng chính

<a id="4-service-layer-pty-self-acquire-e2e-exists-and-is-green"></a>

### 4. Lớp dịch vụ PTY tự cấp phát E2E tồn tại và có màu xanh

Thiết bị đầu cuối thực E2E hiện tại cho v2 là:

- `src/bin/e2e-terminal-self-acquire.ts`

Kịch bản này bây giờ chứng minh:

- **không có PTY được tạo trước**
- quy trình làm việc phát hiện lệnh tương tác
- động cơ tự thu được PTY
- lệnh thực thi trên PTY
- bước thành công mà không cần định tuyến lại bên ngoài
- trạng thái chạy/ràng buộc/kiểm toán luôn nhất quán

Nó hiện đang sử dụng:

- `workflow_validate_workspace`
- `checkCommand` tương tác của `vim --version`

Đây là bằng chứng cấp độ dịch vụ hiện tại cho thiết bị đầu cuối luồng v2.

<a id="5-angela-chat-self-acquire-demo-is-now-on-the-v2-path"></a>

### 5. Bản demo tự cấp phát của Angela chat hiện đã có trên đường dẫn v2

`src/bin/e2e-angela-chat-terminal-self-acquire.ts` tiếp nối câu chuyện sản phẩm tương tự:

- Bộ kiểm thử không tạo sẵn PTY bằng `pty_create`
- Angela gọi quy trình làm việc thực sự
- quy trình làm việc tự thu được PTY cho bước xác thực tương tác
- Angela kết thúc bằng bản tóm tắt bằng ngôn ngữ tự nhiên để sử dụng demo

Các báo cáo thành công mới nhất của trực tiếp theo:

- `.computer-use-mcp/reports/airi-chat-terminal-self-acquire-*`

Các lệnh gói hiện tại là:

- `pnpm -F @angela/computer-use-mcp e2e:airi-chat-terminal-self-acquire`
- `pnpm -F @angela/computer-use-mcp demo:terminal-self-acquire`

<a id="6-support-matrix-already-reflects-the-new-direction"></a>

### 6. Ma trận hỗ trợ đã phản ánh hướng đi mới

Các mục liên quan trong `src/support-matrix.ts`:

- `terminal_exec` → `product-supported`
- `terminal_pty` → `product-supported`
- `terminal_exec_to_pty_reroute` → `covered` và được gắn nhãn rõ ràng là phương án dự phòng kế thừa
- `terminal_auto_surface_resolution` → `covered`
- `terminal_pty_self_acquire` → `product-supported`
- `terminal_pty_step_family` → `covered`

Bản phát hành nghiêm ngặt cổng kiểm tra hiện tại là:

- `pnpm -F @angela/computer-use-mcp e2e:developer-workflow`
- `pnpm -F @angela/computer-use-mcp e2e:terminal-exec`
- `pnpm -F @angela/computer-use-mcp e2e:terminal-pty`
- `pnpm -F @angela/computer-use-mcp e2e:terminal-self-acquire`
- `pnpm -F @angela/computer-use-mcp e2e:airi-chat-terminal-self-acquire`

<a id="what-is-still-not-finished"></a>

## Những gì vẫn chưa hoàn thành

Đây là những khoảng trống thực sự. Đừng tự nhủ rằng thiết bị đầu cuối luồng đã được vận chuyển đầy đủ trước khi chúng đóng cửa.

<a id="1-desktop-approval-semantics-are-improved-but-still-need-one-more-explicit-review"></a>

### 1. Ngữ nghĩa phê duyệt desktop được cải thiện, nhưng vẫn cần thêm một đánh giá rõ ràng

`apps/desktop/src/renderer/App.vue` hiện phân biệt:

- `terminal_and_apps`
- `pty_session`

và nó không còn giả vờ phê duyệt PTY giống như cấp terminal/app chung nữa.

Hành vi dự định hiện tại là:

- `terminal_exec` / `open_app` / `focus_app` giữ hành vi tự động phê duyệt trong phạm vi phiên cũ
- `pty_create` lưu phạm vi cấp quyền `pty_session`
- `pty_create` **không** tự động phê duyệt các yêu cầu tạo PTY trong tương lai

Điều này gần giống với sản phẩm mô hình hơn nhiều, nhưng vẫn đáng để xem xét bất cứ khi nào phê duyệt UX lại thay đổi.

<a id="where-to-look-first"></a>

## Nơi để tìm đầu tiên

Nếu bạn đang tiếp tục công việc của thiết bị đầu cuối luồng, hãy đọc những điều này trước:

1. `src/workflows/engine.ts`
2. `src/workflows/surface-resolver.ts`
3. `src/terminal/interactive-patterns.ts`
4. `src/bin/e2e-terminal-self-acquire.ts`
5. `src/bin/e2e-angela-chat-terminal-self-acquire.ts`
6. `src/support-matrix.ts`
7. `apps/desktop/src/renderer/App.vue`
8. `apps/desktop/src/renderer/modules/computer-use-approval.ts`

Bộ đó đủ để xây dựng lại trạng thái terminal-luồng-v2 hiện tại mà không cần đọc lại toàn bộ repo.

<a id="validation-commands"></a>

## Lệnh xác thực

Sử dụng những điều này làm kiểm tra cơ bản cho công việc của thiết bị đầu cuối luồng:

<a id="service-level-terminal-lane"></a>

### Thiết bị đầu cuối cấp dịch vụ luồng

- `pnpm -F @angela/computer-use-mcp e2e:terminal-exec`
- `pnpm -F @angela/computer-use-mcp e2e:terminal-pty`
- `pnpm -F @angela/computer-use-mcp e2e:terminal-self-acquire`
- `pnpm -F @angela/computer-use-mcp e2e:airi-chat-terminal-self-acquire`

<a id="core-test-coverage"></a>

### Phạm vi kiểm tra cốt lõi

- `pnpm -F @angela/computer-use-mcp exec vitest run --config ./vitest.config.ts`

### Typecheck

- `pnpm -F @angela/computer-use-mcp typecheck`
- `pnpm -F @angela/stage-ui typecheck`

Nếu `pnpm -F @angela/desktop typecheck` hoạt động kỳ lạ trong môi trường hiện tại, hãy chạy trực tiếp hai lệnh cơ bản:

- `pnpm -F @angela/desktop run typecheck:node`
- `pnpm -F @angela/desktop run typecheck:web`

<a id="handoff-rules"></a>

## Quy tắc bàn giao

Nếu bạn thay đổi hành vi của thiết bị đầu cuối luồng, hãy cập nhật tệp này trước khi dừng.

Ít nhất, hãy luôn viết lại bốn sự thật sau:

1. PTY tự cấp phát là đường chính hay đường dẫn nào vẫn phụ thuộc vào PTY được tạo trước?
2. Trò chuyện Angela E2E có được liên kết với thiết bị đầu cuối cấp dịch vụ luồng hay vẫn trên đường dẫn cũ hơn?
3. Phê duyệt desktop có sử dụng ngữ nghĩa `pty_session` thực hay ngữ nghĩa `terminal_and_apps` cũ không?
4. Những khả năng của thiết bị đầu cuối nào là `product-supported` so với chỉ `covered` trong `src/support-matrix.ts`?

Nếu bốn dữ kiện đó đã cũ, agent tiếp theo sẽ mất thời gian để lấy lại bối cảnh từ mã.
