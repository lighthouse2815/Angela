<a id="twitter-service-architecture-documentation"></a>

# Tài liệu kiến ​​trúc dịch vụ Twitter

<a id="1-project-overview"></a>

## 1. Tổng quan dự án

Dịch vụ Twitter là một dịch vụ tự động hóa web dựa trên BrowserBase, cung cấp khả năng tương tác và truy cập có cấu trúc với dữ liệu Twitter. Nó sử dụng thiết kế kiến ​​trúc phân lớp hỗ trợ nhiều bộ điều hợp để tích hợp với các ứng dụng khác nhau.

<a id="2-design-goals"></a>

## 2. Mục tiêu thiết kế

- **Độ tin cậy**: Xử lý ổn định các thay đổi và hạn chế của trang Twitter
- **Khả năng mở rộng**: Dễ dàng thêm các tính năng mới và hỗ trợ các phương pháp tích hợp khác nhau
- **Tối ưu hóa hiệu suất**: Quản lý thông minh tần suất yêu cầu và phiên trình duyệt
- **Cấu trúc dữ liệu**: Cung cấp dữ liệu được đánh máy, chuẩn hóa mô hình

<a id="3-architecture-overview"></a>

## 3. Tổng quan về kiến ​​trúc

```txt
┌─────────────────────────────────────────────┐
│               Application/Consumer Layer    │
│                                             │
│   ┌────────────┐         ┌─────────────┐    │
│   │            │         │             │    │
│   │  AIRI Core │         │ Other LLM   │    │
│   │            │         │ Applications│    │
│   │            │         │             │    │
│   └──────┬─────┘         └──────┬──────┘    │
└──────────┼─────────────────────┼────────────┘
           │                     │
┌──────────▼─────────────────────▼────────────┐
│                  Adapter Layer              │
│                                             │
│   ┌────────────┐         ┌─────────────┐    │
│   │AIRI Adapter│         │ MCP Adapter │    │
│   │(@server-sdk)│        │ (HTTP/JSON) │    │
│   └──────┬─────┘         └──────┬──────┘    │
└──────────┼─────────────────────┼────────────┘
           │                     │
┌──────────▼─────────────────────▼────────────┐
│                 Core Services Layer         │
│                                             │
│   ┌──────────────────────────────────┐      │
│   │          Twitter Services        │      │
│   │                                  │      │
│   │  ┌────────┐       ┌────────────┐ │      │
│   │  │ Auth   │       │ Timeline   │ │      │
│   │  │ Service│       │ Service    │ │      │
│   │  └────────┘       └────────────┘ │      │
│   │                                  │      │
│   └──────────────────┬───────────────┘      │
└──────────────────────┼──────────────────────┘
                      │
          ┌───────────▼────────────┐
          │ Browser Adapter Layer  │
          │   (BrowserAdapter)     │
          └───────────┬────────────┘
                      │
          ┌───────────▼────────────┐
          │      Stagehand         │
          └───────────┬────────────┘
                      │
          ┌───────────▼────────────┐
          │     Playwright         │
          └────────────────────────┘
```

<a id="4-technology-stack-and-dependencies"></a>

## 4. Công nghệ và sự phụ thuộc

- **Thư viện lõi**: TypeScript, Node.js
- **Tự động hóa trình duyệt**: BrowserBase Stagehand, Playwright
- **Phân tích cú pháp HTML**: hợp nhất, phân tích lại, không sử dụng-truy cập
- **Máy chủ API**: H3.js, nghe này
- **Bộ điều hợp**: Máy chủ AIRI SDK, MCP SDK
- **Hệ thống ghi nhật ký**: @guiiai/logg
- **Cấu hình**: defu (cấu hình hợp nhất sâu)
- **Thư viện tiện ích**: zod (xác thực loại)

<a id="5-key-components"></a>

## 5. Thành phần chính

<a id="51-adapter-layer"></a>

### 5.1 Lớp bộ điều hợp

<a id="511-airi-adapter"></a>

#### 5.1.1 Bộ chuyển đổi AIRI

Cung cấp khả năng tích hợp với nền tảng AIRI LLM, xử lý giao tiếp theo hướng sự kiện.

<a id="512-mcp-adapter"></a>

#### 5.1.2 Bộ chuyển đổi MCP

Triển khai giao diện Giao thức ngữ cảnh mô hình, cung cấp giao tiếp dựa trên HTTP. Hiện đang sử dụng triển khai MCP SDK chính thức, cung cấp máy chủ HTTP hiệu suất cao và giao tiếp SSE thông qua H3.js.

Bộ điều hợp MCP hiển thị một số công cụ và tài nguyên:

- **Tài nguyên dòng thời gian**: Truy cập các tweet từ dòng thời gian của người dùng
- **Tài nguyên chi tiết Tweet**: Nhận thông tin chi tiết về một tweet cụ thể
- **Tài nguyên hồ sơ người dùng**: Truy xuất thông tin hồ sơ người dùng

Ngoài ra, nó còn cung cấp các công cụ để tương tác:

- **Công cụ đăng nhập**: Công cụ xác thực đơn giản cung cấp phản hồi rõ ràng về trạng thái phiên. Nó cố gắng tải các phiên hiện có và thông báo rõ ràng liệu phiên đã được tải thành công hay cần đăng nhập thủ công. Công cụ này không còn yêu cầu các tham số username/password nữa vì nó dựa vào hệ thống quản lý phiên nâng cao.
- **Công cụ đăng Tweet**: Tạo và xuất bản các tweet mới
- **Công cụ Thích Tweet**: Thích một tweet của ID
- **Công cụ Retweet**: Retweet một tweet bằng ID của nó
- **Công cụ làm mới dòng thời gian**: Làm mới dòng thời gian bằng các tweet mới nhất, với các tùy chọn để kiểm soát số lượng và có bao gồm các câu trả lời và tin nhắn lại hay không.
- **Tải Công cụ Hồ sơ của Tôi**: Nhận thông tin về hồ sơ của người dùng. Nó có thể trích xuất tên người dùng từ URL hiện tại hoặc chấp nhận một tên người dùng cụ thể làm tham số.

Bộ điều hợp sử dụng các thông báo được quốc tế hóa (Chinese/English) để cung cấp phản hồi rõ ràng cho người dùng về trạng thái đăng nhập và quản lý phiên.

<a id="513-development-server"></a>

#### 5.1.3 Máy chủ phát triển

Sử dụng listen để có trải nghiệm phát triển được tối ưu hóa, bao gồm mở trình duyệt tự động, ghi nhật ký thời gian thực và các công cụ gỡ lỗi.

<a id="52-core-service-layer"></a>

### 5.2 Lớp dịch vụ cốt lõi

<a id="521-authentication-service-auth-service"></a>

#### 5.2.1 Dịch vụ xác thực (Auth Service)

Dịch vụ xác thực đã được tăng cường đáng kể để cải thiện độ tin cậy và xử lý lỗi:

1. **Cải thiện khả năng phát hiện phiên**: Logic nâng cao để phát hiện các phiên trình duyệt hiện có
2. **Xử lý lỗi mạnh mẽ**: Triển khai xử lý lỗi chi tiết để phân biệt giữa các loại lỗi xác thực khác nhau
3. **Tối ưu hóa thời gian chờ**: Thời gian chờ được điều chỉnh cho các hoạt động khác nhau để tăng cường độ ổn định khi mạng biến động
4. **Quản lý cookie nâng cao**: Cơ chế tải và lưu trữ cookie được cải thiện để giảm nhu cầu đăng nhập thủ công
5. **Xác thực phiên**: Đã thêm xác thực phiên toàn diện để xác minh tính toàn vẹn của các phiên đã lưu
6. **API được đơn giản hóa**: Đã loại bỏ nhu cầu về username/password rõ ràng trong phương thức đăng nhập, thay vào đó dựa vào tệp phiên và phát hiện phiên trình duyệt

Dịch vụ tuân theo phương pháp xác thực đa stage:

1. **Đang tải tệp phiên**: Lần thử đầu tiên tải các phiên đã lưu từ đĩa
2. **Phát hiện phiên hiện tại**: Kiểm tra xem trình duyệt đã có phiên Twitter hợp lệ chưa
3. **Quy trình đăng nhập thủ công**: Nếu cần, hãy hướng dẫn qua trang đăng nhập Twitter

Sau khi xác thực thành công thông qua bất kỳ phương thức nào, các phiên sẽ tự động được duy trì để sử dụng trong tương lai. Hệ thống cung cấp phản hồi rõ ràng cho người dùng về trạng thái đăng nhập hiện tại và tự động theo dõi và lưu phiên khi phát hiện có thay đổi.

<a id="522-timeline-service-timeline-service"></a>

#### 5.2.2 Dịch vụ dòng thời gian (Dịch vụ dòng thời gian)

Nhận và xử lý nội dung dòng thời gian Twitter.

<a id="523-other-services"></a>

#### 5.2.3 Các dịch vụ khác

Bao gồm dịch vụ tìm kiếm, dịch vụ tương tác, dịch vụ hồ sơ người dùng, v.v. (không được triển khai trong MVP)

<a id="53-parsers-and-tools"></a>

### 5.3 Trình phân tích cú pháp và công cụ

<a id="531-tweet-parser"></a>

#### 5.3.1 Trình phân tích cú pháp Tweet

Trích xuất dữ liệu có cấu trúc từ HTML.

<a id="532-rate-limiter"></a>

#### 5.3.2 Giới hạn tốc độ

Kiểm soát tần suất yêu cầu để tránh kích hoạt giới hạn Twitter.

<a id="533-session-manager"></a>

#### 5.3.3 Trình quản lý phiên

Quản lý dữ liệu phiên xác thực, cung cấp các phương thức để:

- Lưu cookie phiên vào tệp cục bộ
- Tải các phiên trước đó trong khi khởi động
- Xóa các phiên không hợp lệ hoặc hết hạn
- Xác thực tuổi phiên và tính toàn vẹn

<a id="534-browser-adapter-layer"></a>

### 5.3.4 Lớp bộ điều hợp trình duyệt

Dịch vụ này đã chuyển từ việc sử dụng trực tiếp BrowserBase API sang Stagehand, một khung duyệt web dựa trên AI được xây dựng dựa trên Playwright. Stagehand cung cấp ba API cốt lõi giúp đơn giản hóa quá trình tự động hóa trình duyệt:

- **hành động**: Thực hiện các hành động trên trang thông qua hướng dẫn bằng ngôn ngữ tự nhiên
- **trích xuất**: Truy xuất dữ liệu có cấu trúc từ trang bằng truy vấn ngôn ngữ tự nhiên
- **quan sát**: Phân tích trang và đề xuất các hành động có thể thực hiện trước khi thực hiện

Stagehand xử lý DOM theo từng khối để tối ưu hóa hiệu suất LLM và cung cấp khả năng hiển thị phương án dự phòng cho các cấu trúc trang phức tạp. Việc di chuyển này cải thiện đáng kể khả năng bảo trì mã và độ tin cậy tự động hóa khi tương tác với giao diện của Twitter.

<a id="6-data-flow"></a>

## 6. Luồng dữ liệu

1. **Luồng yêu cầu**: Lớp ứng dụng → Bộ điều hợp → Dịch vụ cốt lõi → Lớp bộ điều hợp trình duyệt → BrowserBase API → Twitter
2. **Luồng phản hồi**: Twitter → BrowserBase API → Lớp bộ điều hợp trình duyệt → Dịch vụ cốt lõi → Phân tích dữ liệu → Bộ điều hợp → Lớp ứng dụng
3. **Luồng xác thực**:
   - Tải phiên → Kiểm tra phiên hiện có → Đăng nhập thủ công → Xác thực phiên → Lưu trữ phiên
   - Phản hồi rõ ràng được cung cấp ở mỗi bước của quá trình xác thực

<a id="7-configuration-system"></a>

## 7. Hệ thống cấu hình

Hệ thống cấu hình đã được tối ưu hóa bằng thư viện `defu` cho các cấu hình hợp nhất sâu, loại bỏ việc khởi tạo dư thừa. Cấu trúc cấu hình được cập nhật bao gồm các cài đặt dành riêng cho Stagehand:

```typescript
interface Config {
  // BrowserBase/Stagehand configuration
  browserbase: {
    apiKey: string
    projectId?: string
    endpoint?: string
    stagehand?: {
      modelName?: string // e.g., "gpt-4o" or "claude-3-5-sonnet-latest"
      modelClientOptions?: {
        apiKey: string // OpenAI or Anthropic API key
      }
    }
  }

  // Browser configuration
  browser: BrowserConfig

  // Twitter configuration
  twitter: {
    credentials?: TwitterCredentials
    defaultOptions?: {
      timeline?: TimelineOptions
      search?: SearchOptions
    }
  }

  // Adapter configuration
  adapters: {
    airi?: {
      url?: string
      token?: string
      enabled: boolean
    }
    mcp?: {
      port?: number
      enabled: boolean
    }
  }

  // System configuration
  system: {
    logLevel: string
    concurrency: number
  }
}
```

Hệ thống không còn dựa vào biến môi trường `TWITTER_COOKIES` nữa vì cookie hiện được quản lý thông qua hệ thống quản lý phiên.

<a id="8-development-and-testing"></a>

## 8. Phát triển và thử nghiệm

<a id="81-development-environment-setup"></a>

### 8.1 Thiết lập môi trường phát triển

```bash
# Install dependencies
npm install

# Set environment variables
cp .env.example .env
# Edit .env to add BrowserBase API key and Twitter credentials (optional)

# Development mode startup
npm run dev        # Standard mode
npm run dev:mcp    # MCP development server mode
```

<a id="82-testing-strategy"></a>

### 8.2 Chiến lược thử nghiệm

- **Thử nghiệm đơn vị**: Kiểm tra trình phân tích cú pháp, lớp tiện ích và logic nghiệp vụ
- **Thử nghiệm tích hợp**: Dịch vụ thử nghiệm và tương tác bộ chuyển đổi
- **Thử nghiệm toàn diện**: Mô phỏng các kịch bản sử dụng hoàn chỉnh

<a id="9-integration-example"></a>

## 9. Ví dụ tích hợp

<a id="91-integration-example-with-stagehand"></a>

### 9.1 Ví dụ tích hợp với Stagehand

```typescript
import { StagehandAdapter, TwitterService } from 'twitter-services'

async function main() {
  // Initialize Stagehand adapter
  const browser = new StagehandAdapter(process.env.BROWSERBASE_API_KEY, process.env.BROWSERBASE_PROJECT_ID)
  await browser.initialize({
    headless: true,
    stagehand: {
      modelName: 'gpt-4o', // Or 'claude-3-5-sonnet-latest' for Anthropic
      modelClientOptions: {
        apiKey: process.env.OPENAI_API_KEY // Or process.env.ANTHROPIC_API_KEY
      }
    }
  })

  // Create Twitter service
  const twitter = new TwitterService(browser)

  // Authenticate - will try multi-stage approach
  const loggedIn = await twitter.login()

  if (loggedIn) {
    console.info('Login successful')

    // Get timeline using natural language capabilities of Stagehand
    const tweets = await twitter.getTimeline({ count: 10 })
    console.info(tweets)
  }
  else {
    console.error('Login failed')
  }

  // Release resources
  await browser.close()
}
```

<a id="92-integrating-as-airi-module"></a>

### 9.2 Tích hợp dưới dạng Mô-đun AIRI

```typescript
import { AIRIAdapter, BrowserBaseMCPAdapter, TwitterService } from 'twitter-services'

async function startAIRIModule() {
  const browser = new BrowserBaseMCPAdapter(process.env.BROWSERBASE_API_KEY)
  await browser.initialize({ headless: true })

  const twitter = new TwitterService(browser)

  // Create AIRI adapter
  const airiAdapter = new AIRIAdapter(twitter, {
    url: process.env.AIRI_URL,
    token: process.env.AIRI_TOKEN
  })

  // Start adapter
  await airiAdapter.start()

  console.info('Twitter service running as AIRI module')
}
```

<a id="93-using-mcp-for-integration"></a>

### 9.3 Sử dụng MCP để tích hợp

```typescript
// Use MCP SDK to interact with Twitter service
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

async function connectToTwitterService() {
  // Create SSE transport
  const transport = new SSEClientTransport('http://localhost:8080/sse', 'http://localhost:8080/messages')

  // Create client
  const client = new Client()
  await client.connect(transport)

  // Get timeline
  const timeline = await client.get('twitter://timeline/10')
  console.info('Timeline:', timeline.contents)

  // Use simplified login tool without parameters
  const loginResult = await client.useTool('login', {})
  console.info('Login result:', loginResult.content[0].text)

  // Use refresh timeline tool to get latest tweets
  const refreshResult = await client.useTool('refresh-timeline', { count: 15, includeReplies: false })
  console.info('Refresh result:', refreshResult.content[0].text)
  console.info('New tweets:', refreshResult.resources)

  // Get user profile information
  const profileResult = await client.useTool('get-my-profile', { username: 'twitter' })
  console.info('Profile info:', profileResult.content[0].text)

  // Use tool to send tweet
  const result = await client.useTool('post-tweet', { content: 'Hello from MCP!' })
  console.info('Result:', result.content)

  return client
}
```

<a id="10-extension-guide"></a>

## 10. Hướng dẫn mở rộng

<a id="101-adding-new-features"></a>

### 10.1 Thêm tính năng mới

Ví dụ: thêm chức năng "Nhận Tweet từ một người dùng cụ thể":

1. Mở rộng giao diện trong `src/types/twitter.ts`
2. Triển khai phương thức trong `src/core/twitter-service.ts`
3. Thêm logic xử lý tương ứng trong bộ chuyển đổi
4. Nếu đó là bộ điều hợp MCP, hãy thêm tài nguyên hoặc công cụ thích hợp trong `configureServer()`

<a id="102-supporting-new-adapters"></a>

### 10.2 Hỗ trợ bộ điều hợp mới

1. Tạo một lớp bộ điều hợp mới
2. Triển khai logic giao tiếp với hệ thống đích
3. Thêm hỗ trợ cấu hình trong tệp nhập

<a id="11-maintenance-recommendations"></a>

## 11. Khuyến nghị bảo trì

- **Kiểm tra tự động**: Viết bài kiểm tra đơn vị và bài kiểm tra tích hợp
- **Giám sát & Cảnh báo**: Theo dõi trạng thái dịch vụ và giới hạn truy cập Twitter
- **Cập nhật bộ chọn**: Thường xuyên xác thực và cập nhật cấu hình bộ chọn
- **Quản lý phiên**: Sử dụng hệ thống quản lý phiên tích hợp để cải thiện tính ổn định và giảm yêu cầu đăng nhập thủ công. Hãy cân nhắc triển khai việc xoay vòng và xác thực phiên.
- **Quản lý cookie**: Hệ thống hiện tự động quản lý việc lưu trữ cookie thông qua SessionManager, nhưng hãy xem xét thêm bộ lưu trữ được mã hóa cho môi trường sản xuất.
- **Phản hồi của người dùng**: Duy trì các thông báo phản hồi rõ ràng, được quốc tế hóa về trạng thái xác thực nhằm cải thiện trải nghiệm người dùng.

<a id="114-stagehand-maintenance"></a>

### 11.4 Bảo trì sân khấu

- **Lựa chọn mô hình**: Thường xuyên đánh giá hiệu suất của các LLM mô hình (GPT-4o, Claude 3.5 Sonnet) khác nhau cho các trường hợp sử dụng cụ thể của bạn
- **prompt Engineering**: Tinh chỉnh hướng dẫn ngôn ngữ tự nhiên để cải thiện độ tin cậy và hiệu suất
- **Khả năng thị giác**: Cân nhắc việc kích hoạt khả năng thị giác cho các cấu trúc DOM phức tạp bằng cách đặt `useVision: true` trong các hoạt động thích hợp
- **DOM Chunking**: Theo dõi và tối ưu hóa kích thước chunk dựa trên độ phức tạp của giao diện Twitter

<a id="12-project-roadmap"></a>

## 12. Lộ trình dự án

- MVP stage: Chức năng cốt lõi tích hợp Stagehand (xác thực, dòng thời gian duyệt web)
- stage Hai: Các tính năng tương tác nâng cao sử dụng khả năng ngôn ngữ tự nhiên của Stagehand
- stage Ba: Tính năng tìm kiếm và lọc nâng cao với LLM prompt được tối ưu hóa
- stage Bốn: Tối ưu hóa hiệu suất và hỗ trợ đa mô hình
