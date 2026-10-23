<a id="browser-repair-contract-validation"></a>

# Xác thực hợp đồng sửa chữa trình duyệt

Ngày: 2026-06-01

Phạm vi:
- `services/computer-use-mcp/src/browser-dom/browser-repair-contract.ts`
- `services/computer-use-mcp/src/browser-dom/browser-repair-contract.test.ts`
- `services/computer-use-mcp/src/server/register-tools.ts`
- `services/computer-use-mcp/src/server/register-tools-pty-approval.test.ts`

Lưu ý về quyền riêng tư:
- Bằng chứng được vệ sinh cho một kho lưu trữ công cộng.
- Không bao gồm đường dẫn tuyệt đối cục bộ, token, số nhận dạng tài khoản, ảnh chụp màn hình hoặc kết xuất môi trường thô.

Các lệnh chạy:

```sh
pnpm install --ignore-scripts --frozen-lockfile
```

Kết quả: đã đậu. Lockfile không thay đổi; các tập lệnh vòng đời đã bị cố tình bỏ qua để thiết lập xác minh cục bộ.

```sh
pnpm -F @angela/computer-use-mcp exec vitest run \
  src/browser-dom/browser-repair-contract.test.ts \
  src/server/register-tools-pty-approval.test.ts \
  --config ./vitest.config.ts
```

Kết quả: đã đậu. 2 tập tin kiểm tra, 12 bài kiểm tra.

```sh
pnpm exec moeru-lint --fix \
  services/computer-use-mcp/validation/browser-repair-contract.md \
  services/computer-use-mcp/src/browser-dom/browser-repair-contract.ts \
  services/computer-use-mcp/src/browser-dom/browser-repair-contract.test.ts \
  services/computer-use-mcp/src/server/register-tools.ts \
  services/computer-use-mcp/src/server/register-tools-pty-approval.test.ts
```

Kết quả: đã vượt qua với 0 cảnh báo và 0 lỗi khi chạy trong Node 24.

```sh
git diff --check
```

Kết quả: đã đậu.

```sh
pnpm -F @angela/computer-use-mcp typecheck
```

Kết quả: không thành công trên các tệp cơ sở hiện có ngoài thay đổi này:
- `src/chrome-session-manager.ts`
- `src/chrome-session-manager.test.ts`
- `src/desktop-grounding.ts`

Các lớp lỗi cơ bản được quan sát:
- `TS2339` và `TS2353` xung quanh `ChromeSessionInfo.ensureOutcome`
- `TS2451` / `TS2304` xung quanh `chromeWindowBounds` trùng lặp và thiếu `isChromeInFront`

Không có lỗi kiểm tra kiểu dữ liệu nào được báo cáo cho các tệp được bản vá này thay đổi.
