<a id="angelaui-component-reference"></a>

# Tham khảo thành phần `@angela/ui`

> **Tự động duy trì**: Khi thêm hoặc cập nhật các thành phần trong `packages/ui`, hãy cập nhật tài liệu này cho phù hợp.

Nguyên thủy được tiêu chuẩn hóa được xây dựng trên [reka-ui](https://reka-ui.com/). Logic nghiệp vụ tối thiểu - sử dụng những logic này thay vì các phần tử DOM thô.

Nguồn: `packages/ui/src/components/`

---

<a id="animations"></a>

## Hoạt hình

### AnimatedContent

Nguyên thủy chỉ dành cho hành vi tạo hoạt ảnh cho chiều cao, độ mờ, độ lệch dọc và làm mờ nội dung bên trong từ vòng đời `data-state="open|closed"` bên ngoài. Chủ sở hữu vòng đời phải giữ nguyên bản gốc được gắn kết cho đến khi hoạt ảnh đóng kết thúc. Nó có thể Compose với nội dung gốc Reka UI thông qua `as-child`, nhưng không phụ thuộc vào một menu, cửa sổ bật lên hoặc triển khai hiện diện cụ thể. Kiểu dáng trực quan vẫn thuộc sở hữu của người gọi.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `as` | `PrimitiveProps['as']?` | `'div'` | Phần tử hoặc thành phần được hiển thị dưới dạng vùng chứa hoạt ảnh bên ngoài |

**Khe cắm**: `default`

### TransitionBidirectional

Trình bao bọc Vue `<Transition>` hai chiều với các lớp CSS có thể tùy chỉnh.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `fromClass` | `string?` | — | Lớp CSS cho trạng thái ban đầu |
| `activeClass` | `string?` | — | Lớp CSS trong quá trình chuyển đổi |
| `toClass` | `string?` | — | Lớp CSS cho trạng thái cuối cùng |

**Khe cắm**: `default`

### TransitionHorizontal

Chuyển tiếp slide/fade theo chiều ngang (mã hóa cứng 0,5 giây).

**Dụng cụ**: Không có | **Khe cắm**: `default`

### TransitionVertical

expand/collapse dọc mượt mà với hoạt ảnh chiều cao và kiểm soát độ mờ.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `duration` | `number?` | `250` | Thời lượng hoạt ảnh (ms) |
| `easingEnter` | `string?` | `'ease-in-out'` | Nhập chức năng nới lỏng |
| `easingLeave` | `string?` | `'ease-in-out'` | Để lại chức năng nới lỏng |
| `opacityClosed` | `number?` | `0` | Độ mờ khi đóng |
| `opacityOpened` | `number?` | `1` | Độ mờ khi mở |

**Khe cắm**: `default`

---

<a id="layout"></a>

## Cách trình bày

<a id="collapsible"></a>

### Có thể thu gọn

Vùng chứa Expandable/collapsible có nút kích hoạt và hình ảnh động dọc.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `default` | `boolean?` | — | Khả năng hiển thị ban đầu |
| `label` | `string?` | — | Nhãn nút kích hoạt |

**v-mô hình**: `visible: boolean` **Khe cắm**: `trigger({ visible, setVisible })`, `default({ visible, setVisible })`

<a id="screen"></a>

### Màn hình

Thành phần màn hình đáp ứng tính toán kích thước canvas dựa trên các điểm dừng.

**Dụng cụ**: Không có | **Khe cắm**: `default({ width, height })`

### SettingsCard

Hộp chứa thẻ cho các trang cài đặt mô-đun. Nó sở hữu chiều rộng, bán kính, phần đệm, khoảng cách ngăn xếp và nền cho cả hai chủ đề. Sử dụng nó cho trang cài đặt mô-đun mới thay vì lặp lại các lớp thẻ nội tuyến.

**Dụng cụ**: Không có | **Khe cắm**: `default`

### ScrollableArea

Vùng cuộn Reka UI với các kiểu thanh cuộn chế độ sáng và chế độ tối được chia sẻ. Thành phần này chuyển tiếp các thuộc tính HTML tới thư mục gốc của vùng cuộn.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `contentAsChild` | `boolean?` | `false` | Hiển thị trình bao bọc nội dung khung nhìn thông qua một khe con mặc định duy nhất |
| `orientation` | `'vertical' \| 'horizontal' \| 'both'` | `'vertical'` | Hướng thanh cuộn để hiển thị |
| `type` | `ScrollAreaRootProps['type']?` | `'auto'` | Hành vi hiển thị thanh cuộn Reka UI |
| `viewportClass` | `string \| string[]?` | — | Các lớp cho khung nhìn Reka UI |

**Slots**: `default` **Exfused**: `viewport` (chủ sở hữu cuộn native. Reka UI ẩn thanh cuộn native của nó và hiển thị track tùy chỉnh đã định cấu hình.)

<a id="skeleton"></a>

### Bộ xương

Đang tải phần giữ chỗ có hình ảnh động.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `animation` | `'pulse' \| 'wave' \| 'none'` | `'pulse'` | Phong cách hoạt hình |

**Khe cắm**: `default`

<a id="truncatable"></a>

### Có thể cắt ngắn

Vùng chứa nội dung được kẹp dòng có thể mở rộng và thu gọn khi nhấp vào vùng nội dung tràn.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `lineClamp` | `number?` | `3` | Dòng hiển thị tối đa khi thu gọn |

**Khe cắm**: `default`

---

<a id="misc"></a>

## linh tinh

### BottomDrawer

Bề mặt phương thức di động được xây dựng trên Vaul Vue. Nó sở hữu tay cầm kéo, lớp phủ, ranh giới tiêu điểm, vùng cuộn và vùng an toàn phía dưới. Quá trình kéo chỉ bắt đầu trên tay cầm, vì vậy các nút tác vụ và cuộn không loại bỏ thao tác này.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `title` | `string` | bắt buộc | Tiêu đề hiển thị và dễ tiếp cận |
| `hideTitle` | `boolean` | `false` | Ẩn tiêu đề một cách trực quan và giữ nguyên tên hộp thoại có thể truy cập |
| `minimumHeight` | `'content' \| 'half'` | `'content'` | Sử dụng chiều cao nội dung hoặc ít nhất một nửa chiều cao khung nhìn |

Loại bỏ bằng tay cầm, lớp phủ hoặc Thoát. Không có nút đóng.

**v-mô hình**: `boolean`, mặc định là `false`.

**Khe cắm**: `trigger` (một nút), `default` (nội dung ngăn kéo).

**Phát ra**: `afterClose()` sau hoạt ảnh loại bỏ; `closeAutoFocus(event)` để ngăn khôi phục tiêu điểm khi một chế độ khác mở ra. `openAutoFocus(event)` cho phép bên sử dụng đặt mục tiêu lấy nét ban đầu.

Sử dụng cho các menu hành động và bảng cài đặt trên thiết bị di động. Các hộp thoại và bảng desktop cần điểm truy bắt sẽ sử dụng bề mặt riêng của chúng.

<a id="avatar"></a>

### Hình đại diện

Hình đại diện nguyên thủy của người dùng được chia sẻ được xây dựng trên Reka UI. Nó thử lại khi `src` thay đổi và hiển thị phương án dự phòng khi URL bị thiếu, đang tải hoặc bị lỗi.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `src` | `string \| null \| undefined` | `null` | Ảnh đại diện URL |
| `alt` | `string \| null \| undefined` | `null` | Mô tả image/fallback có thể truy cập được; bỏ qua hình đại diện trang trí |
| `referrerPolicy` | `ImgHTMLAttributes['referrerpolicy']?` | — | Chính sách giới thiệu hình ảnh |
| `crossOrigin` | `ImgHTMLAttributes['crossorigin']?` | — | Chế độ nguồn gốc hình ảnh |

**Slots**: `fallback` (ghi đè tùy chọn cho biểu tượng người dùng tích hợp)

### BasicButton

Nền tảng hành vi cho các nút tùy chỉnh. Nó sở hữu hành vi disabled/loading, hoạt ảnh nhấn, định cỡ, kết xuất icon/label và bố cục khối, nhưng không cung cấp kiểu dáng bề mặt, đường viền, hình dạng hoặc màu sắc.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `icon` | `string?` | — | Lớp biểu tượng UnoCSS/Iconify |
| `label` | `string?` | — | Văn bản nút |
| `disabled` | `boolean?` | `false` | Trạng thái khuyết tật |
| `loading` | `boolean?` | `false` | Đang tải trạng thái |
| `size` | `'sm' \| 'md' \| 'lg' \| 'unset'` | `'md'` | kích thước đặt trước; `unset` để lại kích thước cho người gọi |
| `block` | `boolean?` | `false` | Toàn bộ chiều rộng |

**Slots**: `default` (phương án dự phòng khi không có `label`)

`size="unset"` bỏ qua các lớp đệm và kích thước văn bản đặt trước trong `BasicButton`, `Button` và `GhostButton`. Người gọi phải cung cấp mọi kích thước được yêu cầu, bao gồm cả kích thước cố định cho các nút tròn.

<a id="button"></a>

### Cái nút

Hành động có mục đích chung vững chắc. Nó không có đường viền và hiển thị các đường viền bù đắp khi di chuột và tiêu điểm bàn phím. Chọn nhóm màu Wind3 độc lập với điểm nhấn trực quan chính hoặc phụ của nó.

Bao gồm tất cả các đạo cụ `BasicButton`, cộng thêm:

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `shape` | `'rect' \| 'rounded' \| 'circle' \| 'parallelogram'` | `'rect'` | Hình học có góc cạnh hình chữ nhật, dạng viên thuốc, hình tròn hoặc tròn |
| `color` | `'neutral' \| 'primary' \| 'cyan' \| 'blue' \| 'green' \| 'lime' \| 'amber' \| 'red' \| 'orange' \| 'purple' \| 'pink'` | `'neutral'` | Họ màu Wind3; `primary` tuân theo chủ đề đã định cấu hình màu sắc |
| `variant` | `'primary' \| 'secondary'` | `'secondary'` | Điều trị nhấn mạnh ở mức độ cao hoặc nhấn mạnh ở mức độ thấp tinh tế |
| `outline` | `boolean?` | `true` | Hiển thị đường viền bù đắp khi di chuột và tiêu điểm bàn phím |

### GhostButton

Hành động theo ngữ cảnh ít được nhấn mạnh với bề mặt mặc định trong suốt và khoảng cách nhỏ gọn. Các trạng thái di chuột, nhấn và chọn sử dụng bề mặt chính tinh tế và cách xử lý văn bản mà không có đường viền. Đường viền offset được dành riêng cho tiêu điểm bàn phím. Bao gồm tất cả các đạo cụ `BasicButton`.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `active` | `boolean?` | `false` | Duy trì bề mặt được chọn tinh tế cho các điều khiển chuyển đổi |

### IconButton

Hành động tối thiểu chỉ dùng biểu tượng cho các điều khiển như yêu thích, thích, sao chép hoặc thử lại. Nó trực tiếp sử dụng `BasicButton`, loại bỏ phần đệm của nó và không thêm nền, đường viền, hình dạng hoặc kích thước hình vuông bắt buộc. Cung cấp `aria-label` có thể truy cập được. Đạo cụ: `icon`, `disabled` và `loading`.

### OverlayButton

Hành động mờ, phông nền mờ không có đường viền, dành cho các điều khiển nổi như Đảo Điều khiển Tamagotchi. Bao gồm tất cả các đạo cụ `BasicButton`.

<a id="callout"></a>

### Chú thích

Hộp Alert/callout với thanh nhấn theo chủ đề.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `theme` | `'primary' \| 'violet' \| 'lime' \| 'orange'` | `'primary'` | Chủ đề màu sắc |
| `label` | `string?` | — | Tiêu đề |

**Khe cắm**: `label`, `default`

### ContainerError

Hiển thị lỗi với các nút copy/feedback và dấu vết ngăn xếp có thể cuộn.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `error` | `unknown?` | — | Đối tượng lỗi |
| `message` | `string?` | — | Tin nhắn tùy chỉnh |
| `stack` | `string?` | — | Dấu vết ngăn xếp |
| `includeStack` | `boolean?` | `true` | Hiển thị ngăn xếp |
| `showCopyButton` | `boolean?` | `true` | Hiển thị nút sao chép |
| `showFeedbackButton` | `boolean?` | `true` | Hiển thị nút phản hồi |
| `copyButtonLabel` | `string?` | `'Copy'` | Sao chép văn bản nút |
| `copiedButtonLabel` | `string?` | `'Copied'` | Sao chép văn bản trạng thái |
| `feedbackButtonLabel` | `string?` | `'Feedback'` | Văn bản nút phản hồi |
| `heightPreset` | `'sm' \| 'md' \| 'lg' \| 'xl' \| 'auto'` | `'md'` | Chiều cao container |

**Phát ra**: `copy(content: string)`, `feedback()`

### ErrorBoundary

Phát hiện các lỗi render/setup đồng bộ ở các con cháu thông qua `onErrorCaptured` và hiển thị phương án dự phòng (`ContainerError` + nút thử lại tích hợp) thay vì để lỗi lan truyền. Sử dụng để bọc `<RouterView>` hoặc bất kỳ cây con nào có lỗi một phần sẽ không làm trống bố cục host. KHÔNG ghi lại các từ chối Async/unhandled - hãy sử dụng `app.config.errorHandler` cho những từ chối đó.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `title` | `string?` | — | Tiêu đề tùy chọn hiển thị chi tiết lỗi ở trên |
| `retryable` | `boolean?` | `true` | Hiển thị nút thử lại tích hợp |
| `retryLabel` | `string?` | `'Try again'` | Nhãn nút thử lại |

**Khe cắm**: `default`, `fallback({ error, info, retry })` **Phát ra**: `error(err, instance, info)`, `retry()` **Tiếp xúc**: `retry()`, `hasError()`

### DropdownMenu

Bề mặt menu thả xuống được chia sẻ được xây dựng trên Reka UI. Nó sở hữu gốc, trình kích hoạt, cổng thông tin, bề mặt nội dung và vòng đời `AnimatedContent`. Người gọi sở hữu các mục trong menu và hoạt động kinh doanh của họ.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `align` | `DropdownMenuContentProps['align']?` | `'start'` | Căn chỉnh nội dung ưa thích trước khi xử lý xung đột |
| `contentClass` | `string \| string[]?` | — | Các lớp bổ sung cho bề mặt nội dung |
| `disabled` | `boolean?` | `false` | Vô hiệu hóa trình kích hoạt |
| `modal` | `boolean?` | `true` | Một menu không theo phương thức giúp phần còn lại của trang có tính tương tác khi nó được mở |
| `side` | `DropdownMenuContentProps['side']?` | `'bottom'` | Bên nội dung ưa thích trước khi xử lý va chạm |
| `sideOffset` | `number?` | `6` | Bù đắp giữa kích hoạt và nội dung |
| `variant` | `'blurry' \| 'default'?` | `'default'` | Chọn bề mặt nội dung mờ hoặc mờ |

**mô hình**: `open` (`boolean`, `false` mặc định). Liên kết nó để mở menu từ mã, ví dụ như sau khi trì hoãn di chuột. **Slots**: `trigger` (một yếu tố tương tác), `default` (các mục menu thả xuống Reka).

### DoubleCheckButton

Nút xác nhận hai-stage - nhấp một lần để hiển thị confirm/cancel.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `color` | `ButtonColor` | `'red'` | Xác nhận họ màu nút |
| `variant` | `ButtonVariant` | `'primary'` | Nút xác nhận nhấn mạnh trực quan |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Kích thước |
| `block` | `boolean?` | `false` | Toàn bộ chiều rộng |
| `disabled` | `boolean?` | `false` | Vô hiệu hóa |
| `loading` | `boolean?` | `false` | Đang tải |

**Phát ra**: `confirm()`, `cancel()` **Khe cắm**: `default` (văn bản ban đầu), `confirm` (xác nhận văn bản), `cancel` (hủy văn bản)

<a id="progress"></a>

### Tiến triển

Thanh tiến trình tuyến tính với hình ảnh động tỏa sáng.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `progress` | `number` | *(bắt buộc)* | Tỷ lệ phần trăm 0–100 |
| `barClass` | `string?` | — | Lớp màu thanh tùy chỉnh |

---

<a id="form--input"></a>

## Biểu mẫu - Đầu vào

<a id="input"></a>

### đầu vào

Đầu vào text/number cơ bản.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `type` | `InputType?` | — | Loại đầu vào HTML |
| `variant` | `'primary' \| 'secondary' \| 'primary-dimmed'` | `'primary'` | Biến thể trực quan |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Kích thước |
| `disabled` | `boolean?` | — | Vô hiệu hóa chỉnh sửa và tập trung |

**v-mô hình**: `modelValue: string | number`

### BasicInputFile

Đầu vào tệp cấp thấp có hỗ trợ kéo thả.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `accept` | `string?` | — | Các loại MIME được chấp nhận |
| `multiple` | `boolean?` | — | Cho phép nhiều tập tin |
| `isDraggingClasses` | `string \| string[]?` | — | Các lớp khi kéo |
| `isNotDraggingClasses` | `string \| string[]?` | — | Lớp học khi không kéo |

**v-mô hình**: `modelValue: File[]` **Khe cắm**: `default({ isDragging, firstFile, files })`

### InputFile

Nhập tệp với tính năng xem trước và kéo thả UI.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `accept` | `string?` | — | Các loại tệp được chấp nhận |
| `multiple` | `boolean?` | — | Cho phép nhiều |
| `placeholder` | `string?` | `'Choose file'` | Văn bản giữ chỗ |

**v-mô hình**: `modelValue: File[] | undefined`

### InputFileCard

Thẻ tải lên tệp theo kiểu với vùng kéo và thả.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `accept` | `string?` | — | Các loại tệp được chấp nhận |
| `multiple` | `boolean?` | — | Cho phép nhiều |

**v-mô hình**: kế thừa từ `BasicInputFile` **Slots**: `default` (tải lên tùy chỉnh UI)

### InputKeyValue

Đầu vào hai cột cho các cặp khóa-giá trị.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `name` | `string?` | — | Thuộc tính tên đầu vào |
| `keyPlaceholder` | `string?` | — | Trình giữ chỗ chính |
| `valuePlaceholder` | `string?` | — | Giữ chỗ giá trị |

**v-mô hình**: `propertyKey: string`, `propertyValue: string`

---

<a id="form--textarea"></a>

## Biểu mẫu - Vùng văn bản

### BasicTextarea

Tự động thay đổi kích thước vùng văn bản với các sự kiện gửi và dán tệp. Số hàng native mặc định là một, vì vậy việc nhập không tạo ra hàng thứ hai. Nội dung phát triển khi nó kết thúc. Thuộc tính native `rows` có thể ghi đè mức tối thiểu này. Khi được đặt, `defaultHeight` cũng cung cấp đường cơ sở để đo lường nội dung, do đó bố cục linh hoạt không kéo dài hộp đo trống.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `defaultHeight` | `string?` | — | Chiều cao ban đầu khi trống |
| `submitOnEnter` | `boolean?` | `true` | Gửi bằng Enter (Shift+Enter cho dòng mới) |

**v-mô hình**: `input: string` **Phát ra**: `submit(message: string)`, `pasteFile(files: File[])`

<a id="textarea"></a>

### Vùng văn bản

Bao bọc vùng văn bản theo kiểu `BasicTextarea`.

**v-mô hình**: `modelValue: string`

---

<a id="form--checkbox--radio"></a>

## Biểu mẫu — Hộp kiểm / Radio

<a id="checkbox"></a>

### Hộp kiểm

Chuyển đổi công tắc bằng reka-ui `SwitchRoot`.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `disabled` | `boolean?` | — | Trạng thái khuyết tật |

**v-mô hình**: `modelValue: boolean`

### Radio

Nút radio duy nhất cho các nhóm radio.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `id` | `string` | *(bắt buộc)* | ID độc đáo |
| `name` | `string` | *(bắt buộc)* | Tên nhóm phát thanh |
| `value` | `string` | *(bắt buộc)* | Giá trị tùy chọn |
| `title` | `string` | *(bắt buộc)* | Nhãn hiển thị |
| `deprecated` | `boolean?` | `false` | Chỉ báo khấu hao |

**v-mô hình**: `modelValue: string`

---

<a id="form--range"></a>

## Biểu mẫu - Phạm vi

<a id="range"></a>

### Phạm vi

Thanh trượt ngang với trực quan hóa tiến trình.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `min` | `number?` | `0` | Giá trị tối thiểu |
| `max` | `number?` | `100` | Giá trị tối đa |
| `step` | `number?` | `1` | Tăng bước |
| `disabled` | `boolean?` | `false` | Vô hiệu hóa |
| `thumbColor` | `string?` | `'#9090906e'` | Màu ngón tay cái |
| `trackColor` | `string?` | `'gray'` | Màu track |
| `trackValueColor` | `string?` | `'red'` | Màu track đầy đủ |

**v-mô hình**: `modelValue: number`

### ColorHueRange

Bộ chọn màu sắc HSL (0–360) với dải màu cầu vồng.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `disabled` | `boolean?` | — | Vô hiệu hóa |

**v-mô hình**: `modelValue: number`

### RoundRange

Thanh trượt kiểu tròn.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `min` | `number?` | `0` | Tối thiểu |
| `max` | `number?` | `100` | Tối đa |
| `step` | `number?` | `1` | Bước |
| `disabled` | `boolean?` | `false` | Vô hiệu hóa |

**v-mô hình**: `modelValue: number`

---

<a id="form--select"></a>

## Biểu mẫu — Chọn

<a id="select"></a>

### Lựa chọn

Chọn thả xuống bằng cách sử dụng reka-ui với tính năng nhóm và hiển thị tùy chỉnh.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `options` | `SelectOptionItem<T>[] \| SelectOptionGroupItem<T>[]` | *(bắt buộc)* | Tùy chọn |
| `placeholder` | `string?` | `'Select an option'` | Trình giữ chỗ |
| `disabled` | `boolean?` | `false` | Vô hiệu hóa |
| `by` | `string \| ((a: T, b: T) => boolean)?` | — | So sánh tùy chỉnh |
| `contentMinWidth` | `string \| number?` | `160` | Chiều rộng tối thiểu thả xuống |
| `contentWidth` | `string \| number?` | — | Chiều rộng thả xuống |
| `contentSide` | `'top' \| 'right' \| 'bottom' \| 'left'` | `'bottom'` | Bên thả xuống ưa thích trước khi xử lý va chạm |
| `contentAlign` | `'start' \| 'center' \| 'end'` | `'start'` | Căn chỉnh thả xuống ưa thích trước khi xử lý va chạm |
| `shape` | `'rounded' \| 'default'` | `'default'` | Hình dạng |
| `variant` | `'blurry' \| 'default'` | `'default'` | Biến thể |

**v-mô hình**: `modelValue: T` **Khe cắm**: `value({ option, value, placeholder })`, `option({ option })`

### SelectOption

Mục tùy chọn riêng lẻ trong `Select`.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `option` | `SelectOptionItem<T>` | *(bắt buộc)* | Dữ liệu tùy chọn |

**Khe cắm**: `default`

---

<a id="form--combobox"></a>

## Biểu mẫu — Hộp tổ hợp

<a id="combobox"></a>

### Hộp tổ hợp

Đầu vào hiển thị nhãn tùy chọn đã chọn khi có tùy chọn không đồng bộ hoặc mô hình thay đổi. Văn bản tìm kiếm vẫn cục bộ đối với đầu vào.

dropdown/autocomplete có thể tìm kiếm bằng reka-ui với tính năng nhóm.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `options` | `ComboboxOptionItem<T>[] \| ComboboxOptionGroupItem<T>[]` | *(bắt buộc)* | Tùy chọn |
| `placeholder` | `string?` | — | Trình giữ chỗ |
| `disabled` | `boolean?` | `false` | Vô hiệu hóa |
| `openOnClick` | `boolean?` | `true` | Tự động mở menu thả xuống khi nhấp vào |
| `contentMinWidth` | `string \| number?` | — | Chiều rộng tối thiểu thả xuống |
| `contentWidth` | `string \| number?` | — | Chiều rộng thả xuống |

**v-mô hình**: `modelValue: T` **Khe cắm**: `option({ option })`, `empty`

### ComboboxSelect

Trình bao bọc Combobox được đơn giản hóa cho các tùy chọn string/number.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `options` | `{ label, value, description?, disabled?, icon? }[]?` | — | Tùy chọn |
| `placeholder` | `string?` | — | Trình giữ chỗ |
| `disabled` | `boolean?` | `false` | Vô hiệu hóa |
| `openOnClick` | `boolean?` | `true` | Tự động mở menu thả xuống khi nhấp vào |
| `title` | `string?` | — | Tiêu đề |
| `layout` | `'horizontal' \| 'vertical'?` | — | Hướng bố trí |
| `contentMinWidth` | `string \| number?` | — | Chiều rộng tối thiểu thả xuống |
| `contentWidth` | `string \| number?` | — | Chiều rộng thả xuống |

**v-mô hình**: `modelValue: string | number` **Khe cắm**: `option({ option })`, `empty`

### ComboboxOption

Mục tùy chọn trong combobox (sử dụng provide/inject).

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `value` | `string \| number` | *(bắt buộc)* | Giá trị |
| `label` | `string?` | — | Hiển thị văn bản |
| `active` | `boolean?` | — | Trạng thái hoạt động |

**Khe cắm**: `default`

---

<a id="form--selecttab"></a>

## Mẫu — SelectTab

### SelectTab

Lựa chọn giống như tab sử dụng các nút radio có chỉ báo hoạt hình.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `options` | `SelectTabOption[]` | *(bắt buộc)* | Tùy chọn tab `{ label, value, description?, icon? }` |
| `disabled` | `boolean?` | `false` | Vô hiệu hóa |
| `readonly` | `boolean?` | `false` | Read-only |
| `size` | `'sm' \| 'md'` | `'md'` | Kích thước |

**v-mô hình**: `modelValue: T`

---

<a id="form--field-labeled-wrappers"></a>

## Biểu mẫu - Trường (Trình bao bọc được gắn nhãn)

Tất cả các thành phần Trường bao bọc đầu vào cơ sở với `label`, `description` và bố cục nhất quán. Các khe phổ biến: `label`, `description`.

### FieldButton

Hiển thị thông tin trường ở bên trái và nút hành động nhỏ gọn ở bên phải.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `label` | `string` | *(bắt buộc)* | Nhãn trường |
| `description` | `string?` | — | Văn bản trợ giúp |
| `buttonLabel` | `string` | *(bắt buộc)* | Nhãn nút hành động |
| `buttonIcon` | `string?` | — | Lớp UnoCSS/Iconify cho nút hành động |
| `disabled` | `boolean?` | — | Ngăn chặn hành động |
| `loading` | `boolean?` | — | Hiển thị một vòng quay và ngăn chặn hành động |

**Khe cắm**: `label`, `description`

**Phát ra**: `click(event: MouseEvent)`

### FieldInput

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `label` | `string?` | — | Nhãn |
| `description` | `string?` | — | Văn bản trợ giúp |
| `placeholder` | `string?` | — | Trình giữ chỗ |
| `required` | `boolean?` | — | Chỉ số bắt buộc |
| `disabled` | `boolean?` | — | Vô hiệu hóa chỉnh sửa và tập trung |
| `type` | `InputType?` | — | Kiểu đầu vào |
| `autocomplete` | `string?` | — | Gợi ý tự động hoàn thành native |
| `inputClass` | `string?` | — | Lớp đầu vào tùy chỉnh |
| `singleLine` | `boolean?` | `true` | `true` = đầu vào, `false` = vùng văn bản |

**v-mô hình**: `modelValue: T`

### FieldCheckbox

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `label` | `string?` | — | Nhãn |
| `description` | `string?` | — | Văn bản trợ giúp |
| `disabled` | `boolean?` | — | Vô hiệu hóa |
| `placement` | `'left' \| 'right'` | `'right'` | Chuyển đổi vị trí |

**v-mô hình**: `modelValue: boolean`

### FieldTextArea

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `label` | `string?` | — | Nhãn |
| `description` | `string?` | — | Văn bản trợ giúp |
| `placeholder` | `string?` | — | Trình giữ chỗ |
| `required` | `boolean?` | — | Chỉ số bắt buộc |
| `textareaClass` | `string?` | — | Lớp văn bản tùy chỉnh |
| `rows` | `number?` | `6` | Hàng |

**v-mô hình**: `modelValue: string`

### FieldRange

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `min` | `number?` | — | Tối thiểu |
| `max` | `number?` | — | Tối đa |
| `step` | `number?` | — | Bước |
| `label` | `string?` | — | Nhãn |
| `description` | `string?` | — | Văn bản trợ giúp |
| `formatValue` | `(value: number) => string?` | — | Trình định dạng giá trị |
| `as` | `'label' \| 'div'` | `'label'` | Phần tử bao bọc |
| `defaultValue` | `number?` | — | Khi được đặt, hiển thị nút đặt lại bên cạnh nhãn khôi phục giá trị này. Sử dụng với `as="div"`. |

**v-mô hình**: `modelValue: number`

### FieldInputFile

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `label` | `string?` | — | Nhãn |
| `description` | `string?` | — | Văn bản trợ giúp |
| `accept` | `string?` | — | Các loại được chấp nhận |
| `multiple` | `boolean?` | — | Nhiều |
| `placeholder` | `string?` | — | Trình giữ chỗ |

**v-mô hình**: `modelValue: File[] | undefined`

### FieldSelect

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `label` | `string` | *(bắt buộc)* | Nhãn |
| `description` | `string?` | — | Văn bản trợ giúp |
| `options` | `SelectOptionItem<T>[] \| SelectOptionGroupItem<T>[]?` | — | Tùy chọn |
| `placeholder` | `string?` | — | Trình giữ chỗ |
| `disabled` | `boolean?` | — | Vô hiệu hóa |
| `layout` | `'horizontal' \| 'vertical'` | `'horizontal'` | Bố cục |
| `by` | `string \| ((a, b) => boolean)?` | — | So sánh |
| `shape` | `'rounded' \| 'default'?` | — | Hình dạng |
| `variant` | `'blurry' \| 'default'?` | — | Biến thể |

**v-mô hình**: `modelValue: T` **Các khe**: `label`, `description`, `value`, `option`

### FieldCombobox

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `label` | `string` | *(bắt buộc)* | Nhãn |
| `description` | `string?` | — | Văn bản trợ giúp |
| `options` | `{ label, value, description?, disabled?, icon? }[]?` | — | Tùy chọn |
| `placeholder` | `string?` | — | Trình giữ chỗ |
| `disabled` | `boolean?` | `false` | Vô hiệu hóa |
| `openOnClick` | `boolean?` | `true` | Tự động mở menu thả xuống khi nhấp vào |
| `layout` | `'horizontal' \| 'vertical'` | `'horizontal'` | Bố cục |

**v-mô hình**: `modelValue: string` **Các khe**: `label`, `description`, `option`, `empty`

### FieldKeyValues

Danh sách cặp khóa-giá trị động với add/remove.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `label` | `string?` | — | Nhãn |
| `description` | `string?` | — | Văn bản trợ giúp |
| `name` | `string?` | — | Tên đầu vào |
| `keyPlaceholder` | `string?` | — | Trình giữ chỗ chính |
| `valuePlaceholder` | `string?` | — | Giữ chỗ giá trị |
| `required` | `boolean?` | — | Bắt buộc |
| `inputClass` | `string?` | — | Lớp đầu vào tùy chỉnh |

**v-mô hình**: `keyValues: { key: string, value: string }[]` **Phát ra**: `remove(index: number)`, `add(key: string, value: string)`

### FieldValues

Danh sách chuỗi động với add/remove.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `label` | `string?` | — | Nhãn |
| `description` | `string?` | — | Văn bản trợ giúp |
| `name` | `string?` | — | Tên đầu vào |
| `valuePlaceholder` | `string?` | — | Giữ chỗ giá trị |
| `required` | `boolean?` | — | Bắt buộc |
| `inputClass` | `string?` | — | Lớp đầu vào tùy chỉnh |

**v-mô hình**: `items: string[]` **Phát ra**: `remove(index: number)`, `add()`

---

## Composables

Đã xuất từ ​​`packages/ui/src/composables/`:

- **`useDeferredMount()`** — Trì hoãn việc gắn linh kiện (hữu ích cho các linh kiện nặng).
- **`useTheme()`** — Quản lý chủ đề composable.

## SwipeActions

Các hành động theo dõi composable được xây dựng trên `Primitive` và `asChild` của Reka UI. Mỗi Root sở hữu một Nội dung và tối đa hai Danh sách, một Danh sách cho mỗi mặt logic. Các mục được đăng ký tự động và tuân theo thứ tự DOM. Các giá trị phải là duy nhất trong Danh sách của chúng. Vùng chứa không sở hữu bộ nhớ cuộc trò chuyện, hoàn tác hoặc cuộc gọi lại kinh doanh.

| Phần | Đạo cụ | Mặc định | Hợp đồng |
|------|-------|---------|----------|
| `SwipeActionsRoot` | `open` | `false` | `v-model:open` kiểm soát xem các hành động có được tiết lộ hay không |
| Gốc | `fullSwipe` | `true` | Cho phép lựa chọn vuốt dài; sai vẫn cho phép tiết lộ thông thường và nhấn Mục |
| Gốc | `side` | `end` | `v-model:side` chọn cạnh lộ và giữ lại khi đóng |
| Gốc | `dir` | Reka nhà cung cấp | Ánh xạ start/end tới các cạnh vật lý trong LTR hoặc RTL |
| Danh sách | `side` | `end` | Cạnh logic: bắt đầu ở bên trái trong LTR và bên phải trong RTL |
| Danh sách | `defaultAction` | Mục cuối cùng trong danh sách này | Giá trị mục ổn định khi vuốt dài; mặc định bị thiếu hoặc bị vô hiệu hóa không bao giờ chọn thay thế |
| Gốc | `disabled` | `false` | Tắt các cử chỉ và hành động chứ không phải các điều khiển riêng của nội dung |
| `SwipeActionsContent` | — | — | Dịch nội dung không rõ ràng của người gọi và đóng một hàng mở trước khi kích hoạt nội dung |
| `SwipeActionsList` | `actionWidth` | `88` | Chiều rộng được giải quyết cho mỗi Mục tính bằng pixel CSS |
| Danh sách | `gap` | `8` | Khoảng cách giữa các mục; mỗi cạnh ngoài dự trữ một nửa, kể cả khi vào. Giới hạn ở một nửa `actionWidth` |
| `SwipeActionsItem` | `value` | Bắt buộc | Nhận dạng chuỗi ổn định được phát ra cho hành động này |
| Mục | `disabled` | `false` | Vô hiệu hóa lựa chọn con trỏ, bàn phím và thao tác vuốt dài |

Tất cả các bộ phận đều chấp nhận Reka `as` và `asChild`. Gốc, Nội dung và Danh sách mặc định là `div`; Mục mặc định là native `button`. Với `asChild`, truyền một con chuyển tiếp thuộc tính và trình nghe. Các mục hướng về phía Danh sách của chúng; Mục cuối cùng là ngoài cùng.

Root phát ra `update:open(boolean)`, `update:side(start|end)`, `interactionStart()` và `action(value, side)`. Bên phân biệt các giá trị bằng nhau trong các Danh sách khác nhau. Vật phẩm phát ra sự kiện `select` có thể hủy trước hành động của Root. Chi tiết của nó bao gồm `value`, `side` và `source` (`press` hoặc `swipe`). `preventDefault()` hủy hành động. Xử lý các hoạt động kinh doanh tại Root hoặc Item, không phải cả hai, để tránh công việc trùng lặp.

Khe mặc định của Root hiển thị `open`, `side`, `armed`, `committing`, `close` và `toggle`. Nội dung hiển thị `open`, `side`, `close` và `toggle`. Gọi `toggle('start')` hoặc `toggle('end')` để hiển thị Danh sách cụ thể. Không có đối số, nó sẽ chuyển đổi phía được chọn. Mục hiển thị `takeover`, `disabled`, `side` logic và `edge` vật lý (`left|right`). Chuyển `takeover` và `edge` sang SwipeActionButton để phản chiếu biểu tượng mở rộng. Danh sách có một vị trí mặc định. Root và List hiển thị `data-side="start|end"`. Root hiển thị `data-state="open|closed"`, `data-armed`, `data-committing` và `data-disabled`. Mục hiển thị `data-value`, `data-disabled` và `data-state="idle|expanded"`. Các hành động ẩn là trơ. Root cũng hiển thị `--swipe-progress`, tăng từ 0 lên 1 trong 32px đầu tiên hiển thị, để làm mờ dần trình kích hoạt hành động đang nghỉ.

Đầu vào con trỏ ngang hoặc bàn di chuột sẽ hiển thị các hành động. Bề mặt căng ra nhờ lực cản và lắng xuống bằng một lò xo. Danh sách là một vùng chứa truy vấn có kích thước nội tuyến. Các mục sử dụng các đơn vị truy vấn vùng chứa của nó để xuất hiện từ cạnh ngoài, lần lượt từng mục, khi mỗi ô có khoảng trống. CSS áp dụng các đường cong độ mờ bậc ba và bậc hai cho từng Mục, bao gồm biểu tượng và nhãn của nó. Tỷ lệ nằm trong ô có sẵn để tránh chồng chéo và dành khoảng trống được định cấu hình bên cạnh Nội dung. Đảo ngược theo các đường cong tương tự mà không có hoạt ảnh khác. Các mục không có khoảng trống vẫn được đăng ký nhưng bị trơ và ẩn khỏi các công cụ trợ năng; điều này giữ nguyên thứ tự của chúng và mặc định vuốt dài. Cử chỉ chạm dọc và thu phóng chụm trên bàn di chuột vẫn giữ nguyên native. Vượt qua số 0 trong khi kéo sẽ hiển thị Danh sách khác nếu nó tồn tại; một bên thiếu dừng lại ở số không. Thoát, nhấp chuột bên ngoài và hủy con trỏ không bao giờ chọn một Mục. Chuyển đổi bàn phím tập trung vào hành động được kích hoạt đầu tiên khi hành động đó có khoảng trống để xuất hiện. Việc đóng danh sách hành động tập trung sẽ trả lại tiêu điểm cho Nội dung trước khi làm cho Danh sách trở nên trơ. Thao tác vuốt sẽ ngăn chặn các lần nhấp vô tình vào nội dung. Giảm chuyển động bỏ qua lò xo.

Vuốt dài sẽ mở rộng Mục mặc định của Danh sách đó. Các mục trước đó di chuyển phía sau Nội dung; Các mục sau này di chuyển qua clip bên ngoài. Cách bố trí gương cho cạnh đối diện. Đảo ngược khôi phục bố cục tương tự. Lựa chọn xảy ra sau khi thả ra và hoàn thành chuyển động toàn chiều rộng này. Giữ chiều rộng cố định kết hợp dưới chiều rộng hàng. Kích hoạt một hành động ở mức 65% chiều rộng hàng và giải giáp dưới 55%, với chiều rộng vật phẩm tối thiểu là 1,6 lần. Nhiều hành động cũng yêu cầu tổng chiều rộng cộng thêm 32px để kích hoạt hoặc cộng thêm 8px để giải giáp. Đây là những thông số nguyên mẫu, không phải phép đo của Apple.

Một bề mặt đã cam kết vẫn hiển thị trong 500 mili giây trong khi chủ sở hữu của nó xóa hàng. Một hàng được giữ lại sau đó sẽ được đặt lại. Sắp xếp lại, xóa, tắt hoặc thay đổi giá trị hành động sẽ hủy cử chỉ đang chờ xử lý. Danh tính thu được khi phát hành không thể được chuyển sang Vật phẩm khác. Trình quan sát DOM của Danh sách dừng khi ngắt kết nối.

```vue
<SwipeActionsRoot v-model:open="open" v-model:side="side" @action="handleAction">
  <SwipeActionsContent>
    <ConversationRow />
  </SwipeActionsContent>
  <SwipeActionsList side="start">
    <SwipeActionsItem value="archive">Archive</SwipeActionsItem>
  </SwipeActionsList>
  <SwipeActionsList side="end" default-action="pin" :action-width="72">
    <SwipeActionsItem
      v-for="action in actions" :key="action.id"
      v-slot="{ takeover, edge }" :value="action.id" as-child
    >
      <SwipeActionButton :label="action.label" :icon="action.icon" :takeover="takeover" :edge="edge" />
    </SwipeActionsItem>
  </SwipeActionsList>
</SwipeActionsRoot>
```

Câu chuyện Lịch sử stage-ui **Misc → Hành động vuốt** hiển thị một hàng tổng hợp có hai hành động bắt đầu và ba hành động kết thúc. Bảng điều khiển bật tắt khả năng hiển thị nhãn.

## SwipeActionButton

Bản trình bày tùy chọn cho `SwipeActionsItem`. Nó sở hữu bề mặt, biểu tượng, bố cục nhãn và giao diện tiếp quản. Vùng chứa cử chỉ vẫn chưa được định kiểu.

| Chống đỡ | Loại | Mặc định | Mô tả |
|------|------|---------|-------------|
| `label` | `string` | Bắt buộc | Văn bản hiển thị và tên nút có thể truy cập |
| `icon` | `string` | Bắt buộc | Iconify lớp tiện ích |
| `showLabel` | `boolean` | `true` | Khi sai, hãy xóa văn bản và lấp đầy vùng của nó bằng bề mặt hành động |
| `takeover` | `number` | `0` | Tiến trình của ô vật phẩm từ 0 đến 1; mỗi mặt hàng cung cấp giá trị riêng |
| `edge` | `left \| right` | `right` | Cạnh vật lý từ ô Vật phẩm; phản chiếu biểu tượng mở rộng |
| `surfaceClass` | `string` | `bg-neutral-500 text-white` | Các lớp màu bề mặt |

Gói nút bằng `SwipeActionsItem as-child` và xử lý hành động Root hoặc chọn Mục. Nút này sẽ vô hiệu hóa chuyển động CSS nếu không sẽ làm chậm cử chỉ. Nhãn ẩn giữ lại tên có thể truy cập được. Các nút chỉ có biểu tượng sẽ lấp đầy chiều cao có sẵn bên trong cùng một khoảng đệm dọc và giữ biểu tượng ở giữa theo chiều dọc. Thành phần này không cung cấp vị trí hoặc sự kiện tùy chỉnh; thuộc tính nút và trình nghe chuyển đến `BasicButton` bên dưới.

```vue
<SwipeActionButton
  :label="action.label"
  :icon="action.icon"
  :show-label="false"
  :takeover="takeover"
/>
```
