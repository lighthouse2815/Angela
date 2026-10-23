# computer-use-mcp

Dịch vụ MCP điều phối macOS desktop dành riêng cho Angela.

<a id="why-this-exists"></a>

## Tại sao điều này tồn tại

Gói này tồn tại vì Angela đã có nhiều phần hữu ích trong monorepo — nhà cung cấp, trò chuyện UX, tệp đính kèm MCP, bề mặt ứng dụng desktop, tích hợp trình duyệt, cầu nối công cụ và logic liên quan đến quy trình làm việc — nhưng những phần đó vẫn quá dễ sử dụng như các tính năng biệt lập thay vì một hệ thống agent mạch lạc.

`computer-use-mcp` là chất nền thực thi còn thiếu cho khoảng trống đó.

Mục tiêu hiện tại không phải là thêm "bản demo sử dụng máy tính khác". Mục tiêu là cung cấp cho Angela một cách thống nhất để:

- quan sát trạng thái desktop hoặc trình duyệt hiện tại
- chọn bề mặt thực thi phù hợp cho nhiệm vụ
- chạy các hành động xác định thông qua các công cụ và lệnh đầu cuối
- giữ các phê duyệt, theo dõi và kiểm tra artifact gắn liền với hoạt động
- Compose những hành động đó thành các quy trình công việc có thể lặp lại thay vì các bản demo một lần

Tóm lại:

- Angela vẫn là máy bay điều khiển và agent shell
- `computer-use-mcp` là nền tảng quy trình làm việc và thực thi cục bộ
- giá trị nằm ở sự phối hợp chứ không phải ở sự di chuyển của con trỏ

<a id="what-it-is"></a>

## Nó là gì

Gói này không còn được định vị là thử nghiệm sử dụng máy tính từ xa chung nữa. Hình dạng v1 hiện tại là:

- Angela giữ máy bay điều khiển:
  - Bề mặt công cụ MCP
  - giao thức xếp hàng phê duyệt
  - nhật ký kiểm tra
  - dấu vết lịch sử
  - kiên trì chụp ảnh màn hình
- `computer-use-mcp` cung cấp lớp thực thi macOS cục bộ:
  - quan sát cửa sổ
  - ảnh chụp màn hình
  - ứng dụng open/focus
  - tiêm mouse/keyboard
  - thực thi lệnh thiết bị đầu cuối nền
- Angela desktop bổ sung bộ điều hợp phê duyệt native:
  - `approval_required` vẫn đến từ MCP
  - Electron hiển thị hộp thoại native
  - Angela tự động gọi approve/reject thay mặt người dùng

Câu chuyện dự định là:

- Angela sử dụng công cụ đầu tiên
- quan sát trực quan là bổ sung, không phải là con đường thực hiện chính
- các lệnh đầu cuối được thực thi bởi shell runner nền, không phải bằng các tab Terminal tập lệnh
- Các ứng dụng desktop/Electron/native và trình duyệt DOM được coi là các bề mặt thực thi khác nhau

<a id="why-it-is-not-just-a-mouse-toy"></a>

## Tại sao nó không phải là "Chỉ là một con chuột đồ chơi"

Gói này không nên được hiểu là một món đồ chơi tự động hóa phát lại tọa độ.

Điều gì làm cho nó khác biệt:

- nó hiển thị bề mặt công cụ MCP thay vì trình ghi macro một lần
- nó giữ chính sách hành động, phê duyệt, lịch sử theo dõi và kết quả kiểm tra mỗi lần chạy
- nó phân biệt giữa điều khiển desktop và điều khiển DOM của trình duyệt thay vì buộc mọi thứ thông qua các cú nhấp chuột mù
- nó ưu tiên các đường dẫn thực thi xác định (`terminal_exec`, quy trình công việc, `browser_dom_*`) trước các hành động tọa độ thô
- nó được thiết kế để Angela tự động gọi như một phần của luồng nhiệm vụ chứ không chỉ đơn thuần do con người điều khiển

Điều đó có nghĩa là gói này chỉ hữu ích khi nó giúp Angela biến các khả năng cục bộ rải rác thành một hệ thống nhiệm vụ có thể quan sát và kiểm soát được.

<a id="current-executor-modes"></a>

## Chế độ thực thi hiện tại

- `dry-run`
  - mặc định
  - không bao giờ tiêm đầu vào
  - vẫn chụp ảnh màn hình cục bộ với nỗ lực tốt nhất để gỡ lỗi
- `macos-local`
  - phụ trợ chính hiện tại
  - quan sát cửa sổ qua `NSWorkspace + CGWindowList`
  - tiêm đầu vào qua Swift + Quartz `CGEvent`
  - ứng dụng open/focus qua `open -a` và `activate`
- `linux-x11`
  - được giữ lại như một phụ trợ thử nghiệm kế thừa
  - không còn là câu chuyện v1 chính nữa

<a id="tool-surface"></a>

## Bề mặt công cụ

Quan sát và điều khiển desktop:

- `desktop_get_capabilities`
- `desktop_observe_windows`
- `desktop_screenshot`
- `desktop_open_app`
- `desktop_focus_app`
- `desktop_click`
- `desktop_type_text`
- `desktop_press_keys`
- `desktop_scroll`
- `desktop_wait`

Điều phối thiết bị đầu cuối:

- `terminal_exec`
- `terminal_get_state`
- `terminal_reset_state`

Cầu bảng nhớ tạm:

- `secret_read_env_value`
- `clipboard_read_text`
- `clipboard_write_text`

Trình duyệt cầu nối DOM:

- `browser_agent_get_status`
- `browser_agent_run`
- `browser_dom_get_bridge_status`
- `browser_dom_get_active_tab`
- `browser_dom_read_page`
- `browser_dom_find_elements`
- `browser_dom_click`
- `browser_dom_read_input_value`
- `browser_dom_set_input_value`
- `browser_dom_check_checkbox`
- `browser_dom_select_option`
- `browser_dom_wait_for_element`
- `browser_dom_get_element_attributes`
- `browser_dom_get_computed_styles`
- `browser_dom_trigger_event`

Người trợ giúp phê duyệt và kiểm toán:

- `desktop_list_pending_actions`
- `desktop_approve_pending_action`
- `desktop_reject_pending_action`
- `desktop_get_session_trace`

Điều phối quy trình làm việc:

- `workflow_open_workspace`
  - hiển thị workspace trong Finder và mở nó trong IDE đã định cấu hình
- `workflow_validate_workspace`
  - mở workspace, xác nhận `pwd`, kiểm tra các thay đổi cục bộ và chạy lệnh xác thực như `pnpm typecheck`
- `workflow_run_tests`
  - chạy lệnh kiểm tra từ root workspace
- `workflow_inspect_failure`
  - tập trung IDE và chạy lại hoặc kiểm tra đường dẫn lệnh bị lỗi
- `workflow_browse_and_act`
  - luồng duyệt và hành động chung để quan sát ứng dụng và các hành động tiếp theo
- `workflow_resume`
  - tiếp tục quy trình làm việc đã tạm dừng trên `approval_required`

<a id="policy-model"></a>

## Chính sách mô hình

Ranh giới macOS v1 hiện tại được cố ý thu hẹp và rõ ràng:

- tọa độ màn hình chung được phép cho các hành động UI
- `allowApps` không được sử dụng làm cổng kiểm tra cứng cho click/type/scroll
- `denyApps` vẫn chặn các ứng dụng nền trước nhạy cảm
- `COMPUTER_USE_OPENABLE_APPS` chỉ kiểm soát quyền gọi `desktop_open_app` và `desktop_focus_app`
- Bản thân Angela nằm trong danh sách từ chối mặc định để tránh tự thao tác
- lệnh đầu cuối luôn yêu cầu phê duyệt
- ứng dụng open/focus luôn yêu cầu phê duyệt
- click/type/press/scroll vẫn sử dụng phê duyệt cho mỗi hành động

<a id="environment-variables"></a>

## Biến môi trường

Cốt lõi:

- `COMPUTER_USE_EXECUTOR`
  - `dry-run`, `macos-local` hoặc `linux-x11`
- `COMPUTER_USE_APPROVAL_MODE`
  - `actions` (mặc định), `all`, `never`
- `COMPUTER_USE_SESSION_ROOT`
  - thư mục đầu ra cục bộ cho ảnh chụp màn hình và `audit.jsonl`
- `COMPUTER_USE_TIMEOUT_MS`
- `COMPUTER_USE_DEFAULT_CAPTURE_AFTER`
- `COMPUTER_USE_MAX_OPERATIONS`
- `COMPUTER_USE_MAX_OPERATION_UNITS`
- `COMPUTER_USE_MAX_PENDING_ACTIONS`

dàn nhạc macOS:

- `COMPUTER_USE_OPENABLE_APPS`
  - mặc định `Terminal,Cursor,Google Chrome`
- `COMPUTER_USE_DENY_APPS`
  - mặc định bao gồm `1Password`, `Keychain`, `System Settings`, `Activity Monitor`, `Angela`
- `COMPUTER_USE_DENY_WINDOW_TITLES`
- `COMPUTER_USE_TERMINAL_SHELL`
  - shell hiện tại mặc định, nếu không thì `/bin/zsh`
- `COMPUTER_USE_ALLOWED_BOUNDS`
  - kẹp tọa độ toàn cầu tùy chọn

Trình duyệt cầu nối DOM:

- `COMPUTER_USE_BROWSER_DOM_BRIDGE_ENABLED`
  - mặc định `true`
- `COMPUTER_USE_BROWSER_DOM_BRIDGE_HOST`
  - mặc định `127.0.0.1`
- `COMPUTER_USE_BROWSER_DOM_BRIDGE_PORT`
  - mặc định `8765`
- `COMPUTER_USE_BROWSER_DOM_BRIDGE_TIMEOUT_MS`
  - mặc định `10000`

Trình duyệt tự động agent:

- `COMPUTER_USE_BROWSER_AGENT_ROOT`
  - ghi đè tùy chọn cho trình duyệt được nhúng-agent workspace trong `src/bin/computer_use`
- `COMPUTER_USE_PYTHON`
  - ghi đè thực thi python tùy chọn cho `browser_agent_run`; mặc định là `.venv/bin/python` được nhúng khi có mặt, nếu không thì `python3`

Điều khiển từ xa runner kế thừa:

- `COMPUTER_USE_REMOTE_SSH_HOST`
- `COMPUTER_USE_REMOTE_SSH_USER`
- `COMPUTER_USE_REMOTE_SSH_PORT`
- `COMPUTER_USE_REMOTE_RUNNER_COMMAND`
- `COMPUTER_USE_REMOTE_DISPLAY_SIZE`
- `COMPUTER_USE_REMOTE_OBSERVATION_BASE_URL`
- `COMPUTER_USE_REMOTE_OBSERVATION_SERVE_PORT`
- `COMPUTER_USE_REMOTE_OBSERVATION_TOKEN`

Ghi đè nhị phân:

- `COMPUTER_USE_SWIFT_BINARY`
- `COMPUTER_USE_OSASCRIPT_BINARY`
- `COMPUTER_USE_SCREENSHOT_BINARY`
- `COMPUTER_USE_OPEN_BINARY`
- `COMPUTER_USE_SSH_BINARY`
- `COMPUTER_USE_TAR_BINARY`

<a id="angela-integration"></a>

## Tích hợp Angela

Angela vẫn kết nối qua `mcp.json`. Ví dụ mục nhập macOS cục bộ:

```json
{
  "mcpServers": {
    "computer_use": {
      "command": "pnpm",
      "args": [
        "-F",
        "@angela/computer-use-mcp",
        "start"
      ],
      "cwd": "/path/to/your/airi/repo",
      "env": {
        "COMPUTER_USE_EXECUTOR": "macos-local",
        "COMPUTER_USE_APPROVAL_MODE": "actions",
        "COMPUTER_USE_OPENABLE_APPS": "Terminal,Cursor,Google Chrome"
      }
    }
  }
}
```

Về phía Angela desktop, việc phê duyệt được xử lý như sau:

1. mô hình gọi công cụ `computer_use::*`
2. MCP trả về `approval_required`
3. Electron hiển thị hộp thoại phê duyệt native
4. Angela tự động gọi `desktop_approve_pending_action` hoặc `desktop_reject_pending_action`
5. Các phê duyệt terminal/app chỉ có thể được sử dụng lại cho lần chạy hiện tại

Để tự động hóa DOM của trình duyệt, `computer-use-mcp` cũng hiển thị cầu nối WebSocket cục bộ phù hợp với mẫu cầu mở rộng Chrome của người dùng:

1. `computer-use-mcp` nghe trên `ws://127.0.0.1:8765` theo mặc định
2. dịch vụ nền mở rộng trình duyệt đã giải nén worker kết nối với socket đó
3. Angela sau đó có thể gọi các công cụ `browser_dom_*` MCP dựa vào tab trình duyệt đang hoạt động

Nếu bạn ghi đè `COMPUTER_USE_BROWSER_DOM_BRIDGE_HOST` hoặc `COMPUTER_USE_BROWSER_DOM_BRIDGE_PORT`, hãy phản chiếu cùng một điểm cuối trong tiện ích mở rộng của Chrome thông qua `chrome.storage.local.set({ browserDomBridgeHost, browserDomBridgePort })` để worker nền kết nối lại với socket chính xác.

Sử dụng hai bề mặt khác nhau:

- `desktop_*` cho chính Angela, ứng dụng macOS native, cửa sổ Electron, Finder, Terminal, Mã VS
- `browser_dom_*` dành cho các trang trình duyệt thực, đọc DOM đa khung, điền biểu mẫu, tương tác dựa trên bộ chọn và các luồng iframe nặng
- `browser_agent_run` dành cho các tác vụ trình duyệt hướng đến mục tiêu trong đó Angela nên ủy quyền vòng lặp khám phá web thay vì mã hóa cứng từng bước trình duyệt theo cách thủ công

<a id="validation-commands"></a>

## Lệnh xác thực

- `pnpm -F @angela/computer-use-mcp typecheck`
- `pnpm -F @angela/computer-use-mcp test`
- `pnpm -F @angela/computer-use-mcp smoke:stdio`
- `pnpm -F @angela/computer-use-mcp smoke:macos`
- `pnpm -F @angela/computer-use-mcp e2e:airi-chat`
- `pnpm -F @angela/computer-use-mcp e2e:airi-discord`

Xác thực từ xa cũ vẫn có sẵn:

- `pnpm -F @angela/computer-use-mcp bootstrap:remote`
- `pnpm -F @angela/computer-use-mcp smoke:remote`

<a id="demo-story-to-record"></a>

## Demo câu chuyện để ghi lại

Nếu bạn muốn ghi lại một bản demo thuyết phục, hãy hiển thị hệ thống dưới dạng một tác vụ được dàn dựng runner thay vì một điệu nhảy con trỏ hào nhoáng.

Cấu trúc ghi đề xuất:

1. Hiển thị cửa sổ Angela desktop, thiết bị đầu cuối và thư mục báo cáo được tạo.
2. Khởi động ứng dụng Angela desktop cục bộ và dịch vụ `computer-use-mcp`.
3. Chứng tỏ rằng Angela có thể gọi các công cụ MCP một cách tự động thay vì chỉ liệt kê chúng.
4. Trình bày một nhiệm vụ ngắn thực hiện vòng lặp đầy đủ:
  - quan sát trạng thái
  - thực thi một công cụ hoặc quy trình công việc
  - tạo ra một kết quả có thể nhìn thấy được
  - duy trì dấu vết/kiểm tra/ảnh chụp màn hình
5. Kết thúc bằng cách mở `report.json`, `audit.jsonl` hoặc ảnh chụp màn hình đã tạo để bản demo kết thúc bằng bằng chứng thay vì chỉ chuyển động trên màn hình.

Bản demo đầu tiên tốt:

- mở workspace, xác nhận `pwd`, kiểm tra các thay đổi cục bộ và chạy `pnpm typecheck`
- tạo và chạy dự án hello-world Python thông qua `terminal_exec`
- sử dụng điều khiển desktop cho các ứng dụng Angela hoặc native và chỉ sử dụng `browser_dom_*` khi tác vụ thực sự chuyển sang một trang trình duyệt

<a id="discord-integration-demo"></a>

### Bản demo tích hợp Discord

Đối với bản demo Angela có thể đọc được trong quản lý, luồng cài đặt Discord mang tính đại diện hơn là câu trả lời chung chung:

1. bắt đầu Angela desktop và `integrations/discord-bot`
2. mở `/settings/modules/messaging-discord`
3. kích hoạt mô-đun và lưu cài đặt
4. xác minh rằng bot Discord nhận được cấu hình được chuyển tiếp từ Angela và tự kết nối lại
5. kết thúc bằng cách mở `report.json`, ảnh chụp màn hình, nhật ký kiểm tra và `discord-bot.log`

Ghi chú:

- để chạy bí mật cục bộ thuần túy, hãy đặt `AIRI_E2E_DISCORD_TOKEN`
- để hoạt động hiệu quả hơn, hãy đặt `AIRI_E2E_DISCORD_TOKEN_SOURCE=portal` hoặc `auto` và để Angela truy xuất token từ trình duyệt trực tiếp / phiên Cổng thông tin dành cho nhà phát triển Discord
- `clipboard_read_text` / `clipboard_write_text` là cầu nối dự định khi Angela phải di chuyển token đã sao chép từ trình duyệt trở lại cài đặt của Angela
- bộ kiểm thử có thể quan sát giúp token nằm ngoài dấu vết kiểm tra desktop bằng cách áp dụng bí mật thông qua renderer thay vì nhập nó thông qua các sự kiện chính của Quartz
- nếu bạn chỉ muốn xác thực hệ thống ống nước cấu hình bot Angela → Discord mà không có token thực, hãy đặt `AIRI_E2E_DISCORD_ALLOW_LOGIN_FAILURE=true`

Bản demo kém thuyết phục hơn:

- video dài về nhấp chuột tọa độ không có đầu ra dấu vết
- việc điền biểu mẫu trình duyệt chỉ được thực hiện bằng tọa độ màn hình khi có sẵn công cụ DOM
- các nhiệm vụ sau đó không thể giải thích những gì agent đã quan sát, thực hiện hoặc xác minh

<a id="known-limits"></a>

## Giới hạn đã biết

- macOS chỉ dành cho đường dẫn v1 chính
- chưa có cây trợ năng đối chiếu ngữ cảnh
- Hỗ trợ thiết bị đầu cuối PTY/TUI được hỗ trợ bởi sản phẩm trên tuyến chính tự cấp phát; định tuyến lại thiết bị đầu cuối bên ngoài kế thừa vẫn là thứ yếu
- chưa có chính sách phối hợp đa màn hình
- tọa độ toàn cầu được cho phép, vì vậy ranh giới an toàn là phê duyệt + kiểm tra, không phải cách ly ứng dụng nghiêm ngặt
