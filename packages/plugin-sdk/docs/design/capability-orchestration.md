<a id="capability-oriented-module-orchestration"></a>

# Điều phối mô-đun định hướng năng lực

- [Tóm tắt](#summary)
- [Nền](#background)
- [Context](#context)
- [Mục tiêu](#goals)
- [Không có mục tiêu](#non-goals)
- [Đề xuất](#proposal)
- [Tầm nhìn](#vision)
- [Chi tiết thiết kế](#design-details)
- [Mô hình vòng đời](#lifecycle-model)
- [Mô hình đăng ký khả năng](#capability-registry-model)
- [Trường hợp sử dụng](#use-cases)
- [Xác minh và kiểm tra](#verify--test)
- [Tiêu chí](#criteria)
- [Test & QA](#test--qa)
- [Tiến trình](#progress)
- [Trạng thái](#status)
- [Các bước tiếp theo](#next-steps)
- [Đánh giá](#reviews)
- [Q&A](#qa)
- [Tài liệu liên quan](#related-documentations)

<a id="summary"></a>

## Bản tóm tắt

Xác định điều phối theo định hướng khả năng mô hình cho các plugin và mô-đun Angela trong đó độ phân giải phụ thuộc được điều khiển bởi runtime thay vì điều khiển siêu dữ liệu tĩnh. Plugin host điều phối vòng đời mô-đun bằng cách sử dụng sổ đăng ký khả năng trạng thái và tính sẵn sàng của cổng kiểm tra, cho phép triển khai nhiều runtime (Electron, Web, Pocket) mà không cần mã hóa thứ tự khởi động stage-first.

<a id="background"></a>

## Lý lịch

Vòng đời plugin hiện tại trong `PluginHost` dựa trên giai đoạn nhưng chưa thực thi tính năng chờ phụ thuộc động giữa các mô-đun và API do nền tảng cung cấp. Trong thực tế, các API như danh sách nhà cung cấp chỉ có thể khả dụng sau khi quá trình khởi tạo nền tảng runtime, stage runtime và UI/store hoàn tất. Điều này tạo ra các điều kiện cạnh tranh khi các mô-đun khởi tạo trước khi các khả năng cần thiết thực sự sẵn sàng.

<a id="context"></a>

## Bối cảnh

Hệ sinh thái Angela đang hướng tới:

- Nhiều plugin host (Electron bây giờ, Pocket và Web sau).
- Nhiều phiên bản stage cho mỗi host/runtime.
- Các API mở rộng dành riêng cho nền tảng có thể được khám phá thông qua một mặt phẳng điều khiển mô hình.
- Các mô-đun plugin có thể cung cấp các khả năng được yêu cầu bởi các mô-đun khác và bởi các luồng stage/configurator.

Thiết kế phải tránh thứ tự mã hóa cứng đặc quyền chẳng hạn như "stage luôn tải trước", trong khi vẫn đưa ra hành vi khởi động xác định và có thể kiểm tra được.

<a id="goals"></a>

## Bàn thắng

- Hỗ trợ phát hiện khả năng runtime và kiểm tra mức độ sẵn sàng mà không cần siêu dữ liệu phụ thuộc tĩnh.
- Duy trì sự điều phối vòng đời theo hướng host và runtime ở mức trung tính.
- Cho phép các phần phụ thuộc của mô-đun nhắm đến các khả năng chứ không phải các mô-đun triển khai.
- Hỗ trợ nhiều phiên bản stage và API dành riêng cho nền tảng trong một mô hình.
- Ngăn chặn các tín hiệu sẵn sàng bị bỏ lỡ bằng cách dựa vào các ảnh chụp nhanh đăng ký có trạng thái chứ không phải các sự kiện diễn ra một lần.

<a id="non-goals"></a>

## Ngoài phạm vi

- Xác định công cụ chính sách sản xuất cuối cùng (ưu tiên, hạn ngạch, công bằng) trong lần lặp này.
- Thiết kế chi tiết UI/UX các trang cấu hình.
- Hoàn thiện giao thức liên kết transport giữa tất cả runtime trong tài liệu này.

<a id="proposal"></a>

## Đề xuất

Giới thiệu sổ đăng ký khả năng do host sở hữu và nhận biết khả năng khởi tạo mô-đun:

1. Các mô-đun thông báo sớm các khả năng có thể có (giai đoạn `announced`/`preparing`).
2. Các mô-đun đánh dấu các khả năng là sẵn sàng khi có thể sử dụng được.
3. Các mô-đun khai báo các yêu cầu runtime dưới dạng các vị từ khả năng.
4. host chuyển các mô-đun thành `waiting-deps` cho đến khi các yêu cầu được giải quyết.
5. host tiếp tục mô-đun preparation/setup khi các khả năng cần thiết đã sẵn sàng.

Tính sẵn sàng và tính khả dụng được thể hiện rõ ràng trong ảnh chụp nhanh sổ đăng ký, với các thông báo sự kiện dưới dạng cập nhật gia tăng.

<a id="vision"></a>

## Tầm nhìn

Việc phối hợp plugin Angela sẽ hoạt động giống như một hạt nhân runtime có thể mở rộng:

- host là các bộ điều hợp runtime (Electron, Pocket, Web), không phải là ngoại lệ về chính sách.
- Các giai đoạn là các mô-đun bình thường xuất bản và sử dụng các khả năng.
- Các mô-đun Compose thông qua hợp đồng năng lực, không phải thứ tự bắt đầu được mã hóa cứng.
- Việc thêm API nền tảng mới có nghĩa là đăng ký các khả năng mới chứ không phải viết lại mã vòng đời.

<a id="design-details"></a>

## Chi tiết thiết kế

Điều phối vòng đời ưu tiên khả năng với độ phân giải phụ thuộc động.

<a id="lifecycle-model"></a>

### Vòng đời mô hình

Các pha phía host được đề xuất cho mỗi mô-đun:

- `loading`
- `loaded`
- `authenticating`
- `authenticated`
- `announced`
- `preparing`
- `waiting-deps`
- `prepared`
- `configuration-needed`
- `configured`
- `ready`
- `degraded`
- `failed`
- `stopped`

Các quy tắc chính:

- `preparing -> waiting-deps` nếu khả năng yêu cầu chưa được giải quyết.
- `waiting-deps -> prepared` khi tất cả các vị từ khả năng cần thiết đều được giải quyết.
- `ready -> degraded` khi khả năng bị ràng buộc trước đó là withdrawn/degraded.
- `degraded -> ready` khi bộ phụ thuộc hoạt động tốt trở lại.

<a id="capability-registry-model"></a>

### Đăng ký năng lực mô hình

Thuộc tính đăng ký:

- Ảnh chụp nhanh trạng thái store (trạng thái sẵn sàng có thẩm quyền).
- Các bản ghi khả năng nằm trong phạm vi `hostId`, `instanceId` và runtime.
- Hỗ trợ cả tra cứu khóa trực tiếp và khớp vị ngữ.
- Phiên bản và siêu dữ liệu tình trạng trên mỗi bản ghi khả năng.

Đường cơ sở của bản ghi năng lực:

```ts
interface CapabilityRecord {
  capabilityId: string
  providerModuleId: string
  hostId: string
  instanceId?: string
  runtime: 'electron' | 'web' | 'pocket' | 'node'
  state: 'announced' | 'ready' | 'degraded' | 'withdrawn'
  version?: string
  health?: 'ok' | 'degraded' | 'unknown'
  metadata?: Record<string, unknown>
}
```

Đường cơ sở yêu cầu:

```ts
interface CapabilityRequirement {
  allOf?: string[]
  anyOf?: string[]
  predicate?: (record: CapabilityRecord) => boolean
  timeoutMs?: number
}
```

<a id="use-cases"></a>

### Trường hợp sử dụng

1. Chuỗi phụ thuộc danh mục stage nhà cung cấp
   - Plugin định nghĩa nhà cung cấp thông báo khả năng.
   - Mô-đun Stage/configurator thông báo khả năng lập danh mục nhà cung cấp khi store được gắn kết.
   - Mô-đun plugin bên sử dụng chờ cả hai khả năng, sau đó định cấu hình các tính năng được hỗ trợ bởi nhà cung cấp.

2. Cách ly phiên bản Multi-stage
   - Hai phiên bản stage trong một host đăng ký cùng một lớp khả năng dưới các `instanceId` khác nhau.
   - Mô-đun yêu cầu khả năng trong cùng phạm vi `instanceId`.
   - host liên kết bên sử dụng để điều chỉnh khả năng của stage-local.

3. Tiện ích mở rộng bỏ túi runtime API
   - Mô-đun Pocket runtime đăng ký khả năng `mobile.sensor`.
   - Các plugin nhắm mục tiêu các biến vị ngữ trên thiết bị di động có thể kích hoạt trên host bỏ túi mà không cần các giả định dành riêng cho Electron.

4. Sẵn sàng muộn và an toàn khi chơi lại
   - Khả năng đã sẵn sàng trước khi mô-đun bắt đầu chờ đợi.
   - Mô-đun nhận được độ phân giải dựa trên ảnh chụp nhanh ngay lập tức và bỏ qua thời gian chờ đợi không cần thiết.

<a id="verify--test"></a>

## Xác minh & Kiểm tra

<a id="criteria"></a>

### Tiêu chuẩn

- Vòng đời mô-đun nhập chính xác `waiting-deps` khi thiếu các khả năng cần thiết.
- Mô-đun tiếp tục hoạt động một cách xác định khi khả năng đã sẵn sàng.
- Đăng ký dựa trên ảnh chụp nhanh ngăn chặn các điều kiện chạy đua sẵn sàng bị bỏ lỡ.
- Các yêu cầu về khả năng mô-đun giống nhau hoạt động trên Electron và ít nhất một bộ chuyển đổi runtime không phải Electron.
- Phạm vi khả năng của `instanceId` ngăn ngừa các lỗi liên kết chéo stage.

<a id="test--qa"></a>

### Kiểm tra & QA

- Kiểm tra đơn vị: đăng ký store và phát lại trạng thái announced/ready/degraded.
- Kiểm tra đơn vị: chuyển tiếp mô-đun `preparing -> waiting-deps -> prepared`.
- Kiểm tra đơn vị: khả năng sẵn sàng có sẵn sẽ giải quyết chờ ngay lập tức.
- Kiểm tra đơn vị: mô-đun chuyển tiếp phụ thuộc đã xuống cấp từ `ready` sang `degraded`.
- Kiểm tra tích hợp: Đăng ký khả năng stage-side bỏ chặn việc khởi tạo mô-đun plugin.

<a id="progress"></a>

## Tiến triển

<a id="status"></a>

### Trạng thái

Đề xuất.

<a id="next-steps"></a>

### Các bước tiếp theo

1. Thêm tính năng trừu tượng hóa đăng ký host và tích hợp vòng đời trong `packages/plugin-sdk/src/plugin-host`.
2. Giới thiệu quá trình chuyển đổi `waiting-deps` và `degraded` sang máy trạng thái host và kiểm tra.
3. Xác định các sự kiện giao thức tối thiểu cho khả năng announce/ready/degraded/snapshot.
4. Dây stage-side công bố khả năng tích hợp trong Electron host đầu tiên.

<a id="reviews"></a>

## Đánh giá

<a id="qa"></a>

### Hỏi đáp

- Hỏi: Tại sao không sử dụng siêu dữ liệu phụ thuộc plugin tĩnh? Trả lời: Các phụ thuộc khả năng của runtime linh hoạt hơn đối với các thiết lập nhiều stage và nhiều runtime trong đó tính khả dụng phụ thuộc vào trạng thái khởi tạo trực tiếp chứ không phải khai báo gói.

- Câu hỏi: Làm cách nào để tránh bỏ lỡ các sự kiện sẵn sàng? Trả lời: Ảnh chụp nhanh sổ đăng ký là có thẩm quyền. Sự kiện chỉ là tín hiệu gia tăng; bên sử dụng muộn luôn truy vấn trạng thái ảnh chụp nhanh.

- Câu hỏi: Điều này có buộc phải đặt hàng stage một lõi không? Trả lời: Không. Thứ tự xuất hiện từ khả năng sẵn có và các vị từ yêu cầu, không phải các quy tắc host đặc quyền.

<a id="related-documentations"></a>

### Tài liệu liên quan

- [Nền tảng plugin Angela](./architecture.md)
- Bối cảnh plugin [Multi-transport](./multi-transport.md)
