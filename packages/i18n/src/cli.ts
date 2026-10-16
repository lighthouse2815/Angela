const en = {
  description: 'Angela terminal chat',
  model: 'Model ID (or ANGELA_MODEL)',
  baseUrl: 'Provider endpoint (or ANGELA_BASE_URL)',
  protocol: 'chat-completions or responses (or ANGELA_API)',
  prompt: 'Send one prompt and exit. Piped input also sends one prompt.',
  cwd: 'Workspace directory',
  locale: 'Interface language: en or vi',
  help: 'Show help',
  missingModel: 'Set ANGELA_MODEL or pass --model.',
  invalidUrl: 'Use an HTTP or HTTPS provider endpoint.',
  invalidApi: 'Use chat-completions or responses for --api.',
  invalidLocale: 'Use en or vi for --locale.',
  workspace: 'Workspace',
  welcome: 'Enter a request. Use /exit to quit. Ctrl+C cancels the current request.',
  interrupted: 'Request cancelled. Completed tool actions are not undone.',
  emptyInput: 'Enter a request or pipe text into the CLI.',
  failed: 'Request failed',
  tool: 'Tool',
}

const vi: typeof en = {
  description: 'Trò chuyện với Angela trong terminal',
  model: 'ID mô hình (hoặc ANGELA_MODEL)',
  baseUrl: 'Địa chỉ provider (hoặc ANGELA_BASE_URL)',
  protocol: 'chat-completions hoặc responses (hoặc ANGELA_API)',
  prompt: 'Gửi một yêu cầu rồi thoát. Đầu vào qua pipe cũng gửi một yêu cầu.',
  cwd: 'Thư mục làm việc',
  locale: 'Ngôn ngữ giao diện: en hoặc vi',
  help: 'Hiện hướng dẫn',
  missingModel: 'Đặt ANGELA_MODEL hoặc truyền --model.',
  invalidUrl: 'Dùng địa chỉ provider HTTP hoặc HTTPS.',
  invalidApi: 'Dùng chat-completions hoặc responses cho --api.',
  invalidLocale: 'Dùng en hoặc vi cho --locale.',
  workspace: 'Thư mục làm việc',
  welcome: 'Nhập yêu cầu. Dùng /exit để thoát. Ctrl+C hủy yêu cầu hiện tại.',
  interrupted: 'Đã hủy yêu cầu. Các thao tác công cụ đã hoàn thành vẫn có hiệu lực.',
  emptyInput: 'Nhập yêu cầu hoặc truyền văn bản vào CLI qua pipe.',
  failed: 'Yêu cầu thất bại',
  tool: 'Công cụ',
}

/** CLI hosts select a language without loading browser translation plugins. */
export const cliMessages = { en, vi }
