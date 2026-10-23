# @angela/server-shared

Các định nghĩa kiểu chia sẻ cho tất cả các gói phía máy chủ của Angela.

<a id="usage"></a>

## Cách sử dụng

```shell
ni @angela/server-shared -D # from @antfu/ni, can be installed via `npm i -g @antfu/ni`
pnpm i @angela/server-shared -D
yarn i @angela/server-shared -D
npm i @angela/server-shared -D
```

```typescript
import type { WebSocketEvents } from '@angela/server-shared'
```

<a id="how-to-use-the-events-in-distributed-use-cases"></a>

## Làm cách nào để sử dụng các sự kiện trong các trường hợp sử dụng phân tán?

<a id="scenarios"></a>

### kịch bản

#### Minecraft agent

<a id="1-urgent-combat-witch-attack"></a>

##### 1. Chiến đấu khẩn cấp (tấn công phù thủy)

- Minecraft gửi `spark:notify` (loại=báo động, khẩn cấp=ngay lập tức, tải trọng hp/location/gear, đích=["ký tự"]).
- Nhân vật `spark:emit` đang hoạt động ("Đã xem").
- Nhân vật đưa ra `spark:command` với ngắt=lực và các tùy chọn (rút lui và đẩy).
- Minecraft `spark:emit` đang hoạt động ("Được nâng cấp; đang hồi phục") rồi đến done/blocked khi nó thực thi.
- `context:update` tùy chọn cho summary/memory.

<a id="2-prep-plan-ender-dragon"></a>

##### 2. Kế hoạch chuẩn bị (Ender Dragon)

- Ý định của Discord/user kích hoạt nhân vật `spark:command` vào Minecraft (ý định=kế hoạch, ngắt=mềm, các bước thu thập beds/pots/gear, phương án dự phòng).
- `context:update` tùy chọn có mẹo (luồng='game').
- Minecraft truyền phát tiến trình `spark:emit`.
- Nếu bị phục kích, Minecraft sẽ tăng `spark:notify` (alarm/immediate) mới để chiếm ưu thế.
- Sửa đổi nhân vật bằng một `spark:command` khác.
- Hoàn thành thông qua `spark:emit` + ghi chú tóm tắt.

<a id="3-routine-nudge"></a>

##### 3. Cú huých thường lệ

- Minecraft báo hiệu sắp hết thức ăn thông qua `spark:notify` (loại=nhắc nhở, khẩn cấp=sớm, điểm đến=["nhân vật"]).
- Nhân vật trì hoãn đến tích tắc tiếp theo và gửi `spark:command` (ngắt=mềm, ý định=kế hoạch: "thu thập thức ăn gần đó").
- Minecraft `spark:emit` queued/working thế là xong.

<a id="4-multi-step-command-while-researching-plan--live-control"></a>

##### 4. Lệnh nhiều bước trong khi nghiên cứu (kế hoạch + điều khiển trực tiếp)

> [!NOTE]
> Việc sử dụng `intent=plan` giúp vòng lặp tồn tại ngay cả với những ý tưởng chưa hoàn thiện—tương tự như TODO tạo khung ban đầu trong mã hóa các agent—trong khi hướng dẫn phong phú hơn vẫn đang được nghiên cứu.

- Nhân vật nhận được mục tiêu của người dùng (ví dụ: củng cố căn cứ) và cấp `spark:command` ban đầu cho Minecraft (ngắt=mềm, ý định=kế hoạch, các bước thu thập nguyên liệu) để agent tiếp tục hoạt động.
- Nhân vật đồng thời thực hiện các nhiệm vụ memory/search/design bên ngoài vòng lặp trò chơi (tra cứu wiki, ghi chú trước).
- Khi có thông tin chi tiết, nhân vật sẽ gửi `context:update` (luồng='game', hints/ideas) để làm phong phú thêm agent phụ mà không cần ưu tiên.
- Nếu một sự kiện khẩn cấp xảy ra trong quá trình chuẩn bị, Minecraft sẽ đưa ra `spark:notify` (báo động) → nhân vật phản hồi bằng một `spark:emit` ngắn đang hoạt động và một `spark:command` (ngắt=lực) để xử lý nó (ví dụ: rút lui, chặn lại).
- Sau khi thiết kế đã sẵn sàng, nhân vật sẽ gửi `spark:command` (`intent=proposal` (hoặc `action`), `interrupt=soft`) có cấu trúc options/steps/fallbacks.
- Minecraft truyền phát tiến trình `spark:emit`; khi hoàn tất, ký tự tóm tắt qua `spark:emit` hoặc `context:update` cho bộ nhớ.

<a id="license"></a>

## Giấy phép

[MIT](../../LICENSE)
