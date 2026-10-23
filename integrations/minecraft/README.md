<a id="angela-minecraft-service"></a>

# Dịch vụ Minecraft của Angela

workspace này chạy bot Minecraft chuyên dụng của Angela. Nó kết nối Mineflayer runtime với máy chủ Minecraft, tải ngăn xếp nhận thức trong `src/cognitive`, đồng thời kết nối trạng thái, bối cảnh và lưu lượng lệnh trở lại Angela để cài đặt stage shell có thể quan sát dịch vụ.

<a id="deprecation-notice"></a>

## Thông báo ngừng hỗ trợ

Dịch vụ này sắp ngừng hoạt động. Bot dựa trên Mineflayer hiện tại dự kiến ​​sẽ được thay thế bằng runtime dựa trên mod Fabric, sẽ trở thành bề mặt tích hợp Minecraft chính trong tương lai.

Sử dụng dịch vụ này để phát triển và bảo trì cục bộ hiện tại nhưng tránh xây dựng các tính năng dài hạn mới xung quanh Mineflayer runtime trừ khi chúng cũng là một phần của kế hoạch di chuyển.

<a id="safety-notice"></a>

## Thông báo an toàn

Không kết nối bot này với các máy chủ công cộng mà bạn không tin tưởng.

runtime có thể thực thi các kế hoạch hành động do JavaScript tạo để điều khiển bot. Các tập lệnh đó chạy trong môi trường biệt lập nhưng chúng vẫn điều khiển một quy trình cục bộ thực sự với quyền truy cập vào phiên Minecraft của bạn, khả năng truy cập mạng cục bộ và các tài nguyên phía máy khác. Máy chủ độc hại hoặc thù địch vẫn có thể gây ra các hành động không mong muốn hoặc làm hỏng hệ thống của bạn.

Chỉ coi dịch vụ này là một công cụ máy chủ đáng tin cậy và phát triển cục bộ.

<a id="setup"></a>

## Cài đặt

1. Cài đặt các phụ thuộc workspace từ gốc repo:

   ```bash
   pnpm i
   ```

2. Sao chép mẫu:

   ```bash
   cp integrations/minecraft/.env integrations/minecraft/.env.local
   ```

3. Chỉnh sửa `integrations/minecraft/.env.local`.

   Trong Angela, mở **Cài đặt -> Kết nối** và sao chép xác thực WebSocket token. Đặt `AIRI_WS_TOKEN` thành token đó trong `.env.local`:

   ```dotenv
   AIRI_WS_TOKEN='paste-your-token-here'
   ```

   Nếu token thay đổi, hãy cập nhật `.env.local` và khởi động lại bot.

4. Bắt đầu dịch vụ:

   ```bash
   pnpm -F @angela/minecraft-bot dev
   ```

   Hoặc, từ `integrations/minecraft/`:

   ```bash
   pnpm dev
   ```

5. Bot sẽ tự động kết nối với cả Angela và máy chủ Minecraft.

<a id="cognitive-architecture"></a>

## Kiến trúc nhận thức

Minecraft agent của Angela được xây dựng trên **kiến trúc nhận thức bốn lớp** lấy cảm hứng từ khoa học nhận thức, cho phép các hành vi phản ứng, có ý thức và dựa trên cơ sở thể chất.

<a id="architecture-overview"></a>

### Tổng quan về kiến ​​trúc

```mermaid
graph TB
    subgraph "Layer A: Perception"
        Events[Raw Events]
        EM[Event Manager]
        Events --> EM
    end

    subgraph "Layer B: Reflex (Subconscious)"
        RM[Reflex Manager]
        FSM[State Machine]
        RM --> FSM
    end

    subgraph "Layer C: Conscious (Reasoning)"
        ORC[Orchestrator]
        Planner[Planning Agent (LLM)]
        Chat[Chat Agent (LLM)]
        ORC --> Planner
        ORC --> Chat
    end

    subgraph "Layer D: Action (Execution)"
        TE[Task Executor]
        AA[Action Agent]
        Planner -->|Plan| TE
        TE -->|Action Steps| AA
    end

    EM -->|High Priority| RM
    EM -->|All Events| ORC
    RM -.->|Inhibition Signal| ORC
    ORC -->|Execution Request| TE

    style EM fill:#e1f5ff
    style RM fill:#fff4e1
    style ORC fill:#ffe1f5
    style TE fill:#dcedc8
```

<a id="layer-a-perception"></a>

### Lớp A: Nhận thức

**Vị trí**: `src/cognitive/perception/`

Lớp nhận thức đóng vai trò là trung tâm đầu vào cảm giác, thu thập các tín hiệu Mineflayer thô và chuyển chúng thành events/signals đã nhập thông qua hệ thống đăng ký sự kiện + công cụ quy tắc.

**Đường ống**:
- Các định nghĩa sự kiện trong `events/definitions/*` liên kết các sự kiện Mineflayer với các sự kiện thô được chuẩn hóa.
- `EventRegistry` phát ra các sự kiện `raw:<modality>:<kind>` tới bus sự kiện nhận thức.
- `RuleEngine` đánh giá các quy tắc YAML và phát ra các sự kiện `signal:*` dẫn xuất được các lớp Reflex/Conscious tiêu thụ.

**Tệp chính**:
- `events/index.ts`
- `events/definitions/*`
- `rules/engine.ts`
- `rules/*.yaml`
- `pipeline.ts`

<a id="layer-b-reflex"></a>

### Lớp B: Phản xạ

**Vị trí**: `src/cognitive/reflex/`

Lớp phản xạ xử lý các phản ứng tức thời, theo bản năng. Nó hoạt động trên mẫu máy trạng thái hữu hạn (FSM) để có Responses nhanh, có thể dự đoán được.

**Thành phần**:
- **Trình quản lý phản xạ** (`reflex-manager.ts`): Điều phối các hành vi phản xạ
- **Ức chế**: Phản xạ có thể ức chế quá trình xử lý lớp Ý thức để ngăn chặn Responses dư thừa.

<a id="layer-c-conscious"></a>

### Lớp C: Ý thức

**Vị trí**: `src/cognitive/conscious/`

Lớp ý thức xử lý suy luận phức tạp, lập kế hoạch và ra quyết định cấp cao. Không có sự thực thi vật lý nào xảy ra ở đây nữa.

**Thành phần**:
- **Não** (`brain.ts`): Sắp xếp hàng đợi sự kiện, vòng đời rẽ LLM, bộ bảo vệ safety/budget, gỡ lỗi tích hợp REPL.
- **Công cụ lập kế hoạch JavaScript** (`js-planner.ts`): Thực thi planning/runtime được đóng hộp cát đối với tools/globals. bị lộ
- **Truy vấn runtime** (`query-dsl.ts`): Trình trợ giúp truy vấn chỉ đọc world/inventory/entity cho các tập lệnh lập kế hoạch.
- **Trạng thái nhiệm vụ** (`task-state.ts`): Hủy token và các nguyên tắc gốc của vòng đời nhiệm vụ được sử dụng khi thực thi hành động.

<a id="layer-d-action"></a>

### Lớp D: Hành động

**Vị trí**: `src/cognitive/action/`

Lớp hành động chịu trách nhiệm thực hiện các nhiệm vụ thực tế trên thế giới. Nó tách biệt “Làm” khỏi “Suy nghĩ”.

**Thành phần**:
- **Trình thực thi tác vụ** (`task-executor.ts`): Chạy các hướng dẫn hành động được chuẩn hóa và phát ra các sự kiện trong vòng đời hành động.
- **Đăng ký hành động** (`action-registry.ts`): Xác thực các thông số và gửi lệnh gọi công cụ.
- **Danh mục công cụ** (`llm-actions.ts`): Các định nghĩa và lược đồ Action/tool gắn liền với các kỹ năng của thợ đào mìn.

<a id="event-flow-example"></a>

### Ví dụ về luồng sự kiện

**Kịch bản: "Xây nhà"**
```txt
Player: "build a house"
  ↓
[Perception] Event detected
  ↓
[Conscious] Architect plans the structure
  ↓
[Action] Executor takes the plan and manages the construction loop:
    - Step 1: Collect wood (calls ActionRegistry tool)
    - Step 2: Craft planks
    - Step 3: Build walls
  ↓
[Conscious] Brain confirms completion: "House is ready!"
```

<a id="project-structure"></a>

### Cấu trúc dự án

```txt
src/
├── airi/                      # Angela bridge, module shell, status publishing
├── cognitive/                  # 🧠 Perception → Reflex → Conscious → Action
│   ├── perception/            # Event definitions + rule evaluation
│   │   ├── events/
│   │   │   ├── index.ts
│   │   │   └── definitions/*
│   │   ├── rules/
│   │   │   ├── *.yaml
│   │   │   ├── engine.ts
│   │   │   ├── loader.ts
│   │   │   └── matcher.ts
│   │   └── pipeline.ts
│   ├── reflex/                # Fast, rule-based reactions
│   │   ├── reflex-manager.ts
│   │   ├── runtime.ts
│   │   ├── context.ts
│   │   └── behaviors/idle-gaze.ts
│   ├── conscious/             # LLM-powered reasoning
│   │   ├── brain.ts           # Core reasoning loop/orchestration
│   │   ├── js-planner.ts      # JS planning sandbox
│   │   ├── query-dsl.ts       # Read-only query runtime
│   │   ├── llm-log.ts         # Turn/log query helpers
│   │   ├── task-state.ts      # Task lifecycle enums/helpers
│   │   └── prompts/           # Prompt definitions (e.g., brain-prompt.ts)
│   ├── action/                # Task execution layer
│   │   ├── task-executor.ts   # Executes actions and emits lifecycle events
│   │   ├── action-registry.ts # Tool dispatch + schema validation
│   │   ├── llm-actions.ts     # Tool catalog
│   │   └── types.ts
│   ├── event-bus.ts           # Event bus core
│   ├── container.ts           # Dependency injection wiring
│   ├── index.ts               # Cognitive system entrypoint
│   └── types.ts               # Shared cognitive types
├── composables/
│   ├── config.ts              # Environment schema + defaults
│   ├── runtime-config.ts      # Persisted local runtime config
│   └── bot.ts
├── debug/                     # Debug dashboard, MCP REPL, viewer integration
├── libs/
│   └── mineflayer/           # Mineflayer bot wrapper/adapters
├── skills/                   # Atomic bot capabilities
├── plugins/                  # Mineflayer/bot plugins
├── utils/                    # Helpers
├── minecraft-bot-runtime.ts  # Bot lifecycle wrapper for reconnect/reconfigure
└── main.ts                   # Bot entrypoint
```

<a id="design-principles"></a>

### Nguyên tắc thiết kế

1. **Tách biệt mối quan tâm**: Mỗi lớp có một trách nhiệm riêng biệt
2. **Theo hướng sự kiện**: Khớp nối lỏng lẻo thông qua hệ thống sự kiện tập trung
3. **Kiểm soát ức chế**: Phản xạ ngăn chặn các cuộc gọi LLM không cần thiết
4. **Khả năng mở rộng**: Dễ dàng thêm các phản xạ hoặc hành vi có ý thức mới
5. **Chủ nghĩa hiện thực nhận thức**: Bắt chước nhận thức giống con người → phản ứng → cân nhắc

<a id="future-enhancements"></a>

### Những cải tiến trong tương lai

- **Lớp nhận thức**:
  - ⏱️ Cửa sổ ngữ cảnh tạm thời (ghi nhớ các sự kiện gần đây)
  - 🎯 Phát hiện sự nổi bật (lọc tiếng ồn, ưu tiên các sự kiện quan trọng)

- **Lớp phản xạ**:
  - 🏃 Né tránh đám đông thù địch
  - 🛡️ Chiến đấu khẩn cấp Responses

- **Lớp ý thức**:
  - 💭 Quản lý trạng thái cảm xúc
  - 🧠 Tích hợp trí nhớ dài hạn
  - 🎭 Responses hướng đến cá tính

<a id="️-development"></a>

## 🛠️ Phát triển

<a id="commands"></a>

### Lệnh

- `pnpm dev` - Khởi động bot ở chế độ phát triển
- `pnpm lint` - Chạy ESLint
- `pnpm typecheck` - Chạy kiểm tra loại TypeScript
- `pnpm test` - Chạy thử nghiệm

<a id="-acknowledgements"></a>

## 🙏 Lời cảm ơn

- https://github.com/kolbytn/mindcraft

<a id="-contributing"></a>

## 🤝 Đóng góp

Đóng góp được chào đón! Vui lòng gửi Yêu cầu kéo.
