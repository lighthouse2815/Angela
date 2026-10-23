<a id="angela-cli-task--reminder-engine--implementation-plan"></a>

# Angela CLI Công cụ nhắc nhở & nhiệm vụ - Kế hoạch thực hiện

<a id="purpose"></a>

## Mục đích

Triển khai khả năng hỗ trợ chủ động hàng ngày đầu tiên cho Angela CLI: nhiệm vụ liên tục, lời nhắc, thời hạn, thói quen, theo dõi, báo lại và quản lý tác vụ bằng ngôn ngữ tự nhiên.

Tính năng này **không phải** là một hệ thống nhiệm vụ mã hóa-agent. Định hướng sản phẩm hiện tại của Angela là một người bạn / người bạn đồng hành học tập / trợ lý đàm thoại AI cũng có thể xử lý những công việc lặt vặt nhỏ hàng ngày. Quy trình làm việc tự động dành riêng cho mã hóa được hoãn lại.

Tính năng này phải mang lại cảm giác đàm thoại. Người dùng có thể nói những điều như:

- "10h tối nhắc tao học tiếng Trung"
- "Mai tao phải nộp bài nghiên cứu"
- "15 phút nữa nhắc lại"
- "Cái vụ gọi Minh xong rồi"
- "Tối nay tao còn việc gì?"
- "Dời cái nhắc học sang 9h đi"
- "Hủy cái nhắc gọi Minh"
- "Mỗi tối 10h nhắc tao ôn từ"

Không yêu cầu lệnh gạch chéo để sử dụng bình thường. Các lệnh gạch chéo là bề mặt management/debug, không phải UX chính.

---

<a id="repository-rules"></a>

## Quy tắc lưu trữ

Trước khi mã hóa:

1. Đọc hoàn toàn gốc `AGENTS.md` và làm theo.
2. Kiểm tra `apps/cli` và sử dụng lại tính bền vững hiện có, chat/tool, cấu hình, ghi nhật ký, prompt, giọng nói, Telegram và các mẫu thử nghiệm nếu có.
3. Tìm kiếm trước khi tạo tiện ích. Không giới thiệu các mẫu lưu trữ, xác thực, thời gian hoặc xử lý lỗi một lần nếu đã tồn tại các mẫu tương đương.
4. Giữ tính năng này bên trong `apps/cli` trừ khi kiến ​​trúc hiện tại yêu cầu gói dùng chung một cách rõ ràng.
5. Không thêm phần phụ thuộc mới mà không kiểm tra trước xem kho lưu trữ đã có phần phụ thuộc hoặc tiện ích phù hợp hay chưa.
6. Sử dụng tên tệp kebab-case.
7. Sử dụng Valibot cho các lược đồ persisted-data/tool-input khi cần xác thực, phù hợp với các quy tắc gốc.
8. Không sử dụng `any`.

Việc triển khai phải thích ứng với kiến ​​trúc CLI thực tế hiện tại thay vì sao chép một cách mù quáng các đường dẫn ví dụ bên dưới.

---

<a id="product-requirements"></a>

## Yêu cầu sản phẩm

<a id="task-types"></a>

### Các loại nhiệm vụ

V1 phải hỗ trợ:

- `todo`
- `reminder`
- `deadline`
- `routine`
- `follow_up`

<a id="task-statuses"></a>

### Trạng thái nhiệm vụ

Hỗ trợ tối thiểu:

- `pending`
- `completed`
- `cancelled`

<a id="required-task-fields"></a>

### Các trường nhiệm vụ bắt buộc

Sử dụng mô hình đã được xác thực tương đương với:

```ts
interface AngelaTask {
  id: string
  title: string
  type: 'todo' | 'reminder' | 'deadline' | 'routine' | 'follow_up'
  status: 'pending' | 'completed' | 'cancelled'

  dueAt?: string
  timezone?: string

  recurrence?: {
    type: 'daily' | 'weekly'
    interval?: number
    daysOfWeek?: number[]
  }

  context?: string

  createdAt: string
  updatedAt: string
  completedAt?: string

  lastNotifiedAt?: string
  snoozedUntil?: string
}
```

Hình dạng TypeScript chính xác có thể khác nếu kho lưu trữ hiện tại đã có các loại chia sẻ hoặc quy ước dấu thời gian phù hợp.

<a id="persistence-guarantees"></a>

### Đảm bảo tính bền vững

Nhiệm vụ phải tồn tại khi khởi động lại CLI.

Sự kiên trì không được âm thầm hủy bỏ tất cả các tác vụ trên dữ liệu không đúng định dạng hoặc việc ghi bị gián đoạn. Tái sử dụng các mẫu atomic/persistence hiện có nếu có. Tối thiểu:

- xác thực dữ liệu đã tải;
- tránh viết một phần;
- báo cáo rõ ràng các lỗi liên tục có thể phục hồi;
- không sao chép lời nhắc chỉ vì CLI đã khởi động lại.

Không xây dựng cơ sở dữ liệu không cần thiết cho V1 nếu CLI hiện sử dụng tính bền vững cục bộ dựa trên tệp và mẫu đó vẫn đủ.

---

<a id="architecture"></a>

## Ngành kiến ​​​​trúc

Triển khai tính năng theo lớp để mỗi lớp có thể được kiểm tra độc lập.

Dòng khái niệm:

```text
User message
    ↓
Chat / LLM
    ↓
Task tools
    ↓
Task service
   ↙       ↘
Task store  Scheduler
               ↓
            Notifier
               ↓
       CLI / Voice / later channels
```

Phân chia tên miền được đề xuất, điều chỉnh theo cấu trúc repo thực tế:

```text
apps/cli/src/
  tasks/
    types.ts
    schema.ts
    store.ts
    service.ts
    scheduler.ts
    notifier.ts
    *.test.ts
```

Không ép buộc bố cục thư mục này nếu gói đã tổ chức các mô-đun miền khác nhau.

---

<a id="phase-1--persistent-task-domain"></a>

## Giai đoạn 1 - Miền nhiệm vụ liên tục

Trước tiên, hãy triển khai và kiểm tra nhiệm vụ mô hình, lớp xác thực, lưu trữ và dịch vụ.

Hoạt động dịch vụ bắt buộc:

- tạo nhiệm vụ;
- nhiệm vụ list/filter;
- tìm nhiệm vụ theo id;
- nhiệm vụ cập nhật;
- hoàn thành nhiệm vụ;
- hủy nhiệm vụ;
- tạm dừng nhiệm vụ.

Yêu cầu về hành vi:

- hoàn thành một nhiệm vụ ghi lại thời gian hoàn thành;
- việc hủy bỏ không xóa lịch sử theo mặc định;
- báo lại tạm thời thay đổi thời gian thông báo tiếp theo mà không làm mất danh tính nhiệm vụ ban đầu;
- tất cả các thay đổi trạng thái cập nhật `updatedAt`;
- ID phải ổn định trong suốt quá trình khởi động lại;
- các truy vấn nhiệm vụ phải mang tính xác định và được sắp xếp hợp lý theo thời gian hiệu quả.

Các thử nghiệm phải bao gồm hành vi dữ liệu liên tục và hành vi dữ liệu liên tục của corrupted/invalid.

---

<a id="phase-2--cli-management-surface"></a>

## Giai đoạn 2 - Bề mặt quản lý CLI

Thêm một bề mặt quản lý tối thiểu. Tích hợp nó với khả năng xử lý lệnh hiện có của CLI thay vì tạo trình phân tích cú pháp song song.

Khả năng hướng tới người dùng cần thiết:

```text
/tasks
/today
/done <task>
/cancel <task>
/snooze <task> <duration>
```

Cú pháp lệnh chính xác có thể tuân theo các quy ước CLI hiện có.

Đầu ra dự kiến ​​phải nhỏ gọn và dễ đọc. Ví dụ:

```text
Hôm nay

1. 20:00  Học tiếng Trung
2. 22:00  Làm quiz chương 3

Ngày mai

3. 09:00  Nộp bài PPLNCKH
```

Việc lựa chọn tác vụ không nên chỉ dựa vào các chỉ mục mảng dễ vỡ trong nội bộ. Nếu chỉ mục hiển thị số được hỗ trợ, hãy phân giải chúng thành ID tác vụ ổn định trong chế độ xem hiện tại.

Thêm các bài kiểm tra lệnh bằng cách sử dụng phương pháp kiểm tra hiện có của CLI.

---

<a id="phase-3--natural-language-task-tools"></a>

## Giai đoạn 3 - Công cụ tác vụ ngôn ngữ tự nhiên

Hiển thị các thao tác nhiệm vụ cho Angela thông qua cơ chế LLM/tool hiện có.

Các công cụ đối mặt với mô hình bắt buộc, tên được điều chỉnh theo quy ước kho lưu trữ hiện có:

- `task_create`
- `task_list`
- `task_update`
- `task_complete`
- `task_cancel`
- `task_snooze`

Đầu vào của công cụ phải được xác thực bằng lược đồ.

Do **not** implement reminder understanding through keyword/regex detection such as checking for "nhắc tao". Let the model choose task tools from conversational context.

Trợ lý sẽ trả lời một cách tự nhiên sau khi công cụ thành công, ví dụ:

```text
User: 10h tối nhắc tao học tiếng Trung
Angela: Ừ, 10 giờ tối tao nhắc.
```

Đối với dates/times mơ hồ, hãy giữ nguyên UX đàm thoại. Đừng phát minh ra thời gian chính xác khi người dùng chỉ đưa ra ngày trừ khi sản phẩm hiện tại đã xác định chính sách cho trường hợp đó.

Giải thích thời gian tương đối phải sử dụng múi giờ và đồng hồ hiện tại của s/local CLI của người dùng, chứ không phải giả định UTC.

Thêm các bài kiểm tra để xác thực công cụ và tích hợp dịch vụ tác vụ. mock đồng hồ khi thích hợp.

---

<a id="phase-4--reminder-scheduler"></a>

## Giai đoạn 4 - Lên lịch nhắc nhở

Triển khai bộ lập lịch trong quá trình cho V1.

Người lập lịch nên:

1. tải các tác vụ theo lịch trình đang chờ xử lý khi khởi động;
2. xác định thời gian thông báo có hiệu lực gần nhất (`snoozedUntil` khi có, nếu không thì `dueAt`);
3. lên lịch sự kiện gần nhất một cách hiệu quả;
4. thông báo khi đến hạn;
5. ghi lại thông báo `lastNotifiedAt` before/after bằng cách sử dụng thiết kế ngăn chặn việc gửi trùng lặp ngẫu nhiên khi khởi động lại bình thường;
6. tính toán lại sự kiện tiếp theo sau mỗi nhiệm vụ thay đổi trạng thái;
7. xử lý xung nhịp hệ thống changes/restarts hợp lý;
8. hỗ trợ shutdown/cancellation. sạch

Thích thiết kế bộ đếm thời gian gần nhất hơn là bỏ phiếu mỗi giây.

Bộ lập lịch phải sử dụng ranh giới đồng hồ injectable/testable nếu kiến ​​trúc hiện có hỗ trợ nội xạ phụ thuộc cho đồng hồ (root `AGENTS.md` cho phép rõ ràng DI cho đồng hồ).

<a id="overdue-recovery"></a>

### Thu hồi quá hạn

Khi Angela bắt đầu ngoại tuyến, hãy hiển thị các nhiệm vụ quá hạn thay vì âm thầm loại bỏ chúng.

Ví dụ:

```text
Lúc bạn không ở đây có 2 việc đã tới hạn:

• 22:00 hôm qua — Học tiếng Trung
• 08:00 hôm nay — Gửi bài cho nhóm
```

Đừng spam các thông báo quá hạn lặp đi lặp lại mỗi lần khởi động. Duy trì trạng thái đủ để biết liệu một sự kiện đã xuất hiện hay chưa.

---

<a id="phase-5--recurrence-and-snooze"></a>

## Giai đoạn 5 - Tái phát và Tạm dừng

Sau khi lời nhắc một lần ổn định, hãy hỗ trợ:

- tái phát hàng ngày;
- tái phát hàng tuần;
- các ngày trong tuần đã chọn;
- báo lại theo thời lượng đàm thoại, chẳng hạn như 10m, 30m, 2h trong đó lớp phân tích thời gian hiện có hỗ trợ nó.

Không để lộ cú pháp cron cho người dùng thông thường.

Đối với các tác vụ định kỳ, hãy xác định rõ ràng ngữ nghĩa sự xuất hiện:

- việc thông báo một sự việc xảy ra không được hoàn thành vĩnh viễn quy trình đó;
- tính toán lần xuất hiện tiếp theo một cách xác định;
- tránh xảy ra trùng lặp sau khi khởi động lại;
- việc hủy bỏ sẽ dừng các lần xuất hiện trong tương lai;
- cho phép completion/check-in rõ ràng nếu hữu ích mà không phá hủy cấu hình lặp lại.

Thêm các thử nghiệm lặp lại xung quanh ranh giới day/week và xử lý múi giờ.

---

<a id="phase-6--notification-abstraction"></a>

## Giai đoạn 6 - Trừu tượng hóa thông báo

Create/reuse là ranh giới thông báo để việc gửi lời nhắc không được mã hóa cứng để in thiết bị đầu cuối.

Về mặt khái niệm:

```ts
interface ReminderNotifier {
  notify: (task: AngelaTask) => Promise<void>
}
```

V1 phải triển khai thông báo CLI.

Thiết kế ranh giới để có thể thêm những ranh giới này sau mà không cần viết lại logic của bộ lập lịch:

- thông báo bằng giọng nói;
- desktop thông báo;
- Telegram thông báo.

Trình thông báo CLI không được làm hỏng prompt tương tác. Nếu lời nhắc kích hoạt khi người dùng đang nhập, redraw/preserve sẽ nhập bằng cách sử dụng khả năng UI của thiết bị đầu cuối hiện có của CLI.

Trình bày ví dụ:

```text
────────────────────────────
⏰ Angela

10 giờ rồi.
Mày bảo tao nhắc học tiếng Trung đấy.
────────────────────────────
```

Giữ từ ngữ được tạo nhất quán với hệ thống nhân cách hiện tại của Angela thay vì chỉ mã hóa cứng một giọng điệu nếu người trợ giúp nhân cách đã tồn tại.

---

<a id="phase-7--voice-integration"></a>

## Giai đoạn 7 - Tích hợp giọng nói

Chỉ sau khi lời nhắc bằng văn bản đáng tin cậy, hãy kết nối đầu ra thông báo với hành vi voice/TTS hiện có.

Yêu cầu:

- nếu chế độ giọng nói đang hoạt động, lời nhắc có thể được phát ra;
- không ngắt lời Angela giữa câu trừ khi cấu trúc giọng nói hiện tại hỗ trợ rõ ràng việc gián đoạn an toàn để nhắc nhở;
- xếp hàng lời nhắc và nói lời nhắc đó sau câu nói hiện tại nếu thích hợp;
- thông báo văn bản vẫn phải tồn tại dưới dạng nguồn của truth/fallback.

Tích hợp giọng nói không được trở thành điều kiện tiên quyết cho các bài kiểm tra công cụ tác vụ cốt lõi.

---

<a id="phase-8--background-service-separate-milestone"></a>

## Giai đoạn 8 - Dịch vụ nền (Cột mốc riêng biệt)

**không** chặn quá trình triển khai có thể sử dụng lần đầu tiên trên dịch vụ daemon/background.

Hành vi V1:

- lời nhắc kích hoạt trong khi quá trình CLI đang chạy;
- lời nhắc vẫn tồn tại khi CLI bị đóng;
- việc mở lại CLI sẽ thực hiện quá trình khôi phục quá hạn.

Sau khi V1 ổn định, hãy triển khai một cột mốc dịch vụ nền nhẹ, ví dụ: lệnh tương đương với:

```text
angela service start
angela service status
angela service stop
```

Dịch vụ phải sở hữu lịch trình trong khi chia sẻ cùng một lớp store/domain nhiệm vụ với CLI tương tác.

Không trùng lặp logic tác vụ trong dịch vụ.

Hỗ trợ Linux/systemd-user có thể là nền tảng đầu tiên nếu phù hợp với chiến lược nền tảng CLI hiện tại. Không triển khai sớm mọi trình quản lý dịch vụ OS trong lần thay đổi đầu tiên.

---

<a id="follow-up-behavior"></a>

## Hành vi theo dõi

`follow_up` rất quan trọng đối với danh tính friend/companion của Angela.

Ví dụ:

```text
User: Tối nay tao định làm xong slide.
Angela: [creates follow-up]

Later:
Angela: Slide xong chưa?
User: Chưa, còn 2 slide.
Angela: Ừ. Muốn 30 phút nữa tao hỏi lại không?
```

Đối với lần triển khai đầu tiên, lần tiếp theo có thể sử dụng lại cùng một miền lập lịch làm lời nhắc. Không xây dựng một lịch trình riêng biệt.

Sự khác biệt mang tính ngữ nghĩa và sau này có thể hướng dẫn hành vi trò chuyện của Angela.

---

<a id="study-companion-compatibility"></a>

## Khả năng tương thích của người bạn đồng hành học tập

Thiết kế Công cụ nhắc nhở & nhiệm vụ làm cơ sở hạ tầng cho Người bạn đồng hành học tập trong tương lai.

Các tính năng nghiên cứu trong tương lai sẽ có thể tạo ra các nhiệm vụ như:

```text
18/10 20:00  Ôn Chapter 3
18/10 21:00  Quiz Chapter 3
19/10 19:30  Ôn Chapter 4
19/10 21:00  Mock test
```

Vì thế:

- không kết hợp việc tạo tác vụ chỉ với văn bản trực tiếp của người dùng;
- phơi bày một dịch vụ nội bộ sạch sẽ API;
- giữ lại siêu dữ liệu context/source tùy chọn nếu kiến ​​trúc hiện có có khái niệm phù hợp;
- giữ lịch trình độc lập với kết xuất trò chuyện.

Không triển khai Công cụ nghiên cứu trong nhiệm vụ này.

---

## Non-Goals

Không mở rộng nhiệm vụ này thành:

- lập kế hoạch mã hóa tự động-agent;
- Quản lý GitHub issue/project;
- phối hợp đa agent;
- tích hợp email/calendar;
- một nhiệm vụ desktop đầy đủ UI;
- đồng bộ hóa đám mây;
- marketplace/plugins;
- trình phân tích cú pháp biểu thức chính quy ngôn ngữ tự nhiên phức tạp;
- biểu thức cron UX;
- động cơ lập kế hoạch cuộc sống chủ động đầy đủ.

Đó là những cột mốc sau này.

---

<a id="required-acceptance-scenarios"></a>

## Các kịch bản chấp nhận bắt buộc

V1 đã hoàn thiện sẽ hỗ trợ các kịch bản toàn diện này thông qua cuộc trò chuyện bình thường nếu có:

1. `10h tối nhắc tao học tiếng Trung`
2. `Mai nhắc tao nộp bài`
3. `Hôm nay tao có việc gì?`
4. `Cái nhắc học lúc 10h đổi sang 9h đi`
5. `15 phút nữa nhắc lại`
6. `Cái đó tao làm xong rồi`
7. `Hủy việc gọi Minh`
8. `Tối nay còn việc gì?`
9. `Mai có deadline gì không?`
10. Khởi động lại Angela và xác minh các nhiệm vụ vẫn còn.
11. Khởi động lại sau khi lời nhắc đã quá hạn và xác minh quá trình khôi phục quá hạn.
12. Xác minh lời nhắc đã được gửi không bị trùng lặp khi khởi động lại bình thường.
13. Xác minh một quy trình định kỳ tiến tới lần xuất hiện tiếp theo một cách chính xác.
14. Xác minh `/tasks`, `/today`, hoàn thành, hủy và báo lại các đường dẫn quản lý.

Where a phrase such as `Cái đó` depends on conversational context, reuse the existing chat/session context rather than inventing a global last-task hack unless the current tool architecture already models tool-result references that way.

---

<a id="test-requirements"></a>

## Yêu cầu kiểm tra

Tối thiểu thêm các bài kiểm tra tự động cho:

### Store/service

- create/list/update/complete/cancel;
- kiên trì chuyến đi khứ hồi;
- xác nhận dữ liệu liên tục;
- thứ tự xác định;
- tạm dừng ngữ nghĩa.

<a id="scheduler"></a>

### Người lập lịch trình

- lựa chọn nhiệm vụ đến hạn tiếp theo;
- thông báo kích hoạt một lần;
- thay đổi nhiệm vụ hẹn giờ lên lịch lại;
- hành vi khởi động quá hạn;
- khởi động lại ngăn ngừa trùng lặp;
- hủy bỏ;
- Hành vi đồng hồ fake/test.

<a id="recurrence"></a>

### Tái phát

- hằng ngày;
- hàng tuần;
- các ngày trong tuần đã chọn;
- tính toán lần xuất hiện tiếp theo;
- khởi động lại xung quanh một lần xuất hiện;
- Ranh giới timezone/day.

### Tools/CLI

- xác nhận đầu vào công cụ;
- tích hợp công cụ với dịch vụ;
- lệnh quản lý công việc;
- thông báo lỗi hữu ích cho việc lựa chọn tác vụ missing/invalid.

Tránh các thử nghiệm không ổn định dựa trên waiting/sleeping. thật Sử dụng clock/timers. giả

---

<a id="implementation-order"></a>

## Lệnh thực hiện

Hãy tuân theo thứ tự này trừ khi kiến ​​trúc kho lưu trữ cung cấp lý do chính đáng để không:

1. Kiểm tra kiến ​​trúc CLI hiện tại và viết ghi chú triển khai ngắn trong phản hồi Codex cuối cùng.
2. Các loại nhiệm vụ + lược đồ xác nhận.
3. TaskStore liên tục.
4. TaskService + kiểm tra đơn vị.
5. Các lệnh quản lý `/tasks`, `/today`, completion/cancel/snooze.
6. Công cụ tác vụ LLM.
7. Bộ lập lịch trong quá trình + kiểm tra đồng hồ giả.
8. Phục hồi quá hạn + ngăn ngừa trùng lặp.
9. Tái phát.
10. CLI thông báo.
11. Tích hợp giọng nói nếu nó có thể được thực hiện một cách rõ ràng mà không cần mở rộng phạm vi.
12. Cập nhật `apps/cli/README.md` với hành vi thực tế của người dùng đã được triển khai.
13. Chạy kiểm tra theo yêu cầu của `AGENTS.md`.

Không bắt đầu mốc nền daemon cho đến khi V1 trong quá trình xử lý chính xác và được kiểm tra.

---

<a id="suggested-commit-breakdown"></a>

## Phân tích cam kết được đề xuất

Codex có thể sử dụng bảng phân tích khác nếu cần, nhưng vẫn đảm bảo các thay đổi có thể được xem xét:

1. `feat(cli): add persistent task domain`
2. `feat(cli): add task management commands`
3. `feat(cli): add conversational task tools`
4. `feat(cli): add reminder scheduler and overdue recovery`
5. `feat(cli): add snooze and recurring reminders`
6. `feat(cli): integrate reminder notifications`

Không trộn lẫn các bộ tái cấu trúc không liên quan vào các cam kết này.

---

<a id="definition-of-done"></a>

## Định nghĩa xong

Cột mốc này được thực hiện khi:

- các tác vụ vẫn tiếp tục khởi động lại CLI;
- Angela có thể thực hiện các tác vụ create/manage thông qua cuộc trò chuyện thông thường bằng công cụ mô hình;
- `/tasks` và các lệnh quản lý tác vụ cơ bản hoạt động;
- lời nhắc một lần kích hoạt khi CLI đang chạy;
- lời nhắc quá hạn sẽ xuất hiện sau khi khởi động lại;
- khởi động lại bình thường không gây ra thư rác thông báo trùng lặp;
- báo lại hoạt động;
- Các quy trình daily/weekly hoạt động;
- logic lập lịch có các bài kiểm tra đồng hồ giả xác định;
- CLI prompt vẫn có thể sử dụng được khi lời nhắc xuất hiện;
- vượt qua các bài kiểm tra `apps/cli` có liên quan;
- thẻ kiểm tra kiểu dữ liệu có liên quan;
- Các lượt vượt qua `pnpm lint` hoặc mọi lỗi tồn tại trước đó không liên quan đều được báo cáo rõ ràng;
- `apps/cli/README.md` ghi lại chức năng được triển khai;
- không có tính năng mã hóa-agent không liên quan nào được thêm vào.

---

<a id="instruction-to-codex"></a>

## Hướng dẫn sử dụng Codex

Triển khai hoàn toàn kế hoạch này cho `apps/cli`, tuân theo kiến ​​trúc thực tế hiện tại của kho lưu trữ và tất cả các hướng dẫn `AGENTS.md` hiện hành.

Không dừng lại chỉ sau tạo khung ban đầu các loại tên miền. Tiếp tục xem qua V1 có thể sử dụng được mô tả ở trên, bao gồm các bài kiểm tra và tài liệu. Nếu kho lưu trữ đã chứa cơ chế tương đương, hãy tích hợp hoặc tái cấu trúc cơ chế đó thay vì sao chép nó.

Làm xong báo cáo:

1. những gì đã thay đổi;
2. quyết định kiến ​​trúc quan trọng;
3. files/modules được thêm hoặc thay đổi;
4. commands/tests/typechecks/lint thực sự chạy và kết quả của chúng;
5. bất kỳ phần nào của kế hoạch này không thể hoàn thành và lý do chính xác.
