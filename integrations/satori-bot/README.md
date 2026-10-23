# Angela Satori Bot

> **⚠️ Tuyên bố miễn trừ trách nhiệm**: Đây là mô-đun con của **Angela**. Phần `core` của bot satori này chỉ là **giải pháp tạm thời**. Cuối cùng, chúng tôi sẽ xóa nó và tích hợp với **Angela's Core** sau khi khung chính ổn định.

**STANDALONE**, AI agent theo sự kiện được xây dựng trên [Satori Protocol](https://satori.chat/). Nó kết nối với nhiều nền tảng trò chuyện (QQ, Telegram, Discord, Lark) thông qua cầu Koishi, có vòng suy nghĩ tự động.

<a id="-architecture--internals-provisional"></a>

## 🏗 Kiến trúc & Nội thất (Tạm thời)

**Quan trọng**: Mô-đun này hiện triển khai một "Mini-Core" (`src/core/`) độc lập để tự vận hành. Đây **KHÔNG** phải kiến trúc cuối cùng của Angela.

* **Logic tạm thời**: Logic Vòng lặp sự kiện, Trình lập lịch biểu và Trình lập kế hoạch nằm trong `src/core/` là các phần giữ chỗ. Chúng mô phỏng hành vi của Angela Core trong tương lai.
* **Thành phần được giữ lại**: **Bộ điều phối** và **Cơ sở dữ liệu** sẽ được giữ lại. Chúng sẽ được hiển thị dưới dạng **mô-đun giống công cụ** trong Angela Core để thực thi hành động và duy trì trạng thái.
* **Di chuyển trong tương lai**: Khi Angela Core chính đã sẵn sàng, thư mục `src/core/` (cụ thể là logic loop/planning) sẽ bị xóa. Sau đó, mô-đun này sẽ được tái cấu trúc để hoạt động nghiêm ngặt như một **Bộ chuyển đổi** (Xử lý giao thức Satori) và **Khả năng nhà cung cấp** (Hành động), ủy quyền vòng lặp nhận thức cho quy trình Angela chính.

Đối với phiên bản độc lập hiện tại, vui lòng tham khảo các tài liệu sau:

* **[HANDLER.md](./docs/HANDLER.md)**: Giải thích luồng **hiện tại** từ sự kiện đến hành động (Hàng đợi -> Bộ lập lịch -> LLM).
* **[PERSISTENCE.md](./docs/PERSISTENCE.md)**: Chi tiết chiến lược quản lý trạng thái **hiện tại** Bộ nhớ đầu tiên dành riêng cho lõi tạm thời này.

**Đường dẫn mã khóa:**
* **Vòng lặp & Logic (Tạm thời)**: `src/core/`
* **Bộ chuyển đổi (Vĩnh viễn)**: `src/adapter/satori/`
* **Khả năng (Vĩnh viễn)**: `src/capabilities/`

<a id="prerequisites"></a>

## Điều kiện tiên quyết

* **Node.js** >= 18.0.0
* **pnpm** >= 8.0.0
* **Phiên bản Koishi**: Chạy plugin `server-satori`.
* **LLM nhà cung cấp**: OpenAI tương thích API (Ollama, vLLM, DeepSeek, v.v.).

<a id="quick-start"></a>

## Bắt đầu nhanh

1. **Cài đặt phụ thuộc**
```bash
pnpm install
```

2. **Cấu hình môi trường** Sao chép cấu hình ví dụ và chỉnh sửa nó:

```bash
cp .env .env.local
```

**Các biến chính:**

```env
# Satori Configuration
SATORI_WS_URL=ws://localhost:5140/satori/v1/events
SATORI_API_BASE_URL=http://localhost:5140/satori/v1
SATORI_TOKEN= # Optional: Leave empty if auth is disabled in Koishi

# LLM (OpenAI Compatible)
LLM_API_KEY=your_api_key_here
LLM_API_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4
LLM_RESPONSE_LANGUAGE=English
LLM_OLLAMA_DISABLE_THINK=false
```

3. **Chạy**

```bash
# Development (Hot-reload)
pnpm --filter @angela/satori-bot dev

# Production
pnpm --filter @angela/satori-bot start
```

<a id="key-locations"></a>

## Vị trí chính

* **Nhân vật & Hệ thống prompt**: `src/core/planner/prompts/*.velin.md`
* **Cơ sở dữ liệu (PGlite)**: `data/pglite-db` (Xem *PERSISTENCE.md* để biết kiến ​​trúc)
* **Logic hành động**: `src/capabilities/actions/`
