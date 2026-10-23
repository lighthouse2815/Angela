# `telegram-bot`

Cho phép Airi nói chuyện với bạn và nhiều người dùng khác trong Telegram.

<a id="getting-started"></a>

## Bắt đầu

Sao chép và cài đặt phụ thuộc:

```shell
git clone git@github.com:moeru-ai/airi.git
pnpm i
pnpm run build:packages
```

Khởi động phiên bản Ollama để nhúng mô hình

```shell
ollama start
ollama pull nomic-embed-text
```

Tạo tệp `.env.local`:

```shell
cd integrations/telegram-bot
cp .env .env.local
```

Điền thông tin xác thực sau làm cấu hình:

```shell
DATABASE_URL=postgres://postgres:123456@localhost:5432/postgres
TELEGRAM_BOT_TOKEN=''

LLM_API_BASE_URL=''
LLM_API_KEY=''
LLM_MODEL=''
LLM_RESPONSE_LANGUAGE=''

LLM_VISION_API_BASE_URL=''
LLM_VISION_API_KEY=''
LLM_VISION_MODEL=''

EMBEDDING_API_BASE_URL=''
EMBEDDING_API_KEY=''
EMBEDDING_MODEL=''
EMBEDDING_DIMENSION=''
```

Ví dụ:

```shell
DATABASE_URL=postgres://postgres:123456@localhost:5433/postgres
TELEGRAM_BOT_TOKEN='<Bot ID>:<Token>' # get one from @BotFather

LLM_API_BASE_URL='https://openrouter.ai/api/v1/' # if you use OpenRouter too
LLM_API_KEY='sk-or-v1-<token>'
LLM_MODEL='deepseek/deepseek-chat-v3-0324:free'
LLM_RESPONSE_LANGUAGE='English'

LLM_VISION_API_BASE_URL='https://openrouter.ai/api/v1/'
LLM_VISION_API_KEY='sk-or-v1-<token>'
LLM_VISION_MODEL='openai/gpt-4o' # as long as the model supports image input

EMBEDDING_API_BASE_URL='http://localhost:11434/v1/' # ollama
EMBEDDING_API_KEY=''
EMBEDDING_MODEL='nomic-embed-text' # embedding model
EMBEDDING_DIMENSION='768' # must set
```

Khởi động cả DB và bot:

```shell
docker compose up -d
pnpm run -F @angela/telegram-bot start
```
