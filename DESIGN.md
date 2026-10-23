<a id="angela-design-guide"></a>

# Hướng dẫn thiết kế Angela

<a id="overview"></a>

## Tổng quan

Angela là giao diện đồng hành với nhân vật. stage giúp nhân vật luôn hiện diện trong khi cuộc trò chuyện và điều khiển luôn ở trong tầm tay.

Các nút điều khiển được bo tròn, bề mặt trung tính mềm mại và điểm nhấn có thể định cấu hình mang lại cho giao diện một nét cá tính, thân thiện. Nhãn rõ ràng và trạng thái hiển thị giúp nhiệm vụ cấu hình dễ hiểu.

Hãy coi stage là không gian cho nhân vật, với các nút điều khiển nổi nhỏ gọn xung quanh nó. Hãy coi các cài đặt như một chuỗi các quyết định được gắn nhãn có thể đọc được.

Sử dụng độ mờ để liên kết các điều khiển nổi với stage. Sử dụng các bề mặt trung tính ổn định nơi người dùng đọc mô tả, nhập giá trị hoặc so sánh các tùy chọn.

Hướng dẫn này áp dụng cho các giao diện dùng chung trong `stage-web`, `desktop` và `stage-pocket`. Các mẫu trực quan của nó đến từ `shared/ui/primitives` và các bố cục ứng dụng hiện có.

Đối với các chi tiết không được chỉ định, hãy sử dụng lại bố cục và thành phần được chia sẻ gần nhất. Bảo toàn hành vi, tỷ lệ và trạng thái tương tác của chủ đề.

Tài liệu này tuân theo cấu trúc phần của đặc tả [Google DESIGN.md](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md).

Khối YAML token tùy chọn bị bỏ qua. Bảng màu động của Angela và các giá trị thành phần hiện có vẫn có hiệu lực trong các tệp nguồn của chúng.

Chi tiết API thuộc về tham chiếu thành phần [](./docs/ai/context/ui-components.md). Các giới hạn về nguồn và quy trình phân phối nằm trong ghi chú triển khai [](./docs/ai/context/design-implementation.md).

<a id="colors"></a>

## Màu sắc

- Cấu hình [UnoCSS](./uno.config.ts) cung cấp bảng màu, phông chữ, biểu tượng và hình động được chia sẻ.
- [UI Các biến phương án dự phòng](./shared/ui/primitives/src/fallback.css) xác định `--chromatic-hue` và các biến sắc độ cho từng sắc thái.
- [Cài đặt chủ đề](./shared/ui/stage/src/stores/settings/theme.ts) store màu sắc đã chọn. Mặc định là `220.44`.
- [Mục nhập biểu định kiểu UI](./shared/ui/primitives/src/main.css) bao gồm các biến phương án dự phòng, hoạt ảnh đèn và kiểu thành phần.

`primary` theo tông màu chủ đề. Cấu hình chủ đề cũng cung cấp `complementary`. Sử dụng các bảng màu này thay vì sao chép các màu thương hiệu cố định vào các trang.

`neutral` cung cấp các bề mặt và văn bản tiêu chuẩn. Chế độ sáng và tối xác định các giá trị nền, nền trước, đường viền và độ mờ riêng biệt.

Các nút cũng hỗ trợ các bảng màu độc lập, chẳng hạn như đỏ, cam và xanh lục. `Callout` hỗ trợ `primary`, `violet`, `lime` và `orange`. Nó không có thành công hoặc lỗi được chia sẻ API.

Sử dụng văn bản hoặc biểu tượng để giải thích trạng thái kinh doanh. Tên bảng màu không thiết lập ý nghĩa trạng thái.

<a id="typography"></a>

## kiểu chữ

`uno.config.ts` xác định các họ phông chữ như `sans`, `sans-rounded` và `cute`. Các điều khiển thường kế thừa phông chữ host của chúng.

| Sử dụng hiện tại | Phong cách hiện tại |
| --- | --- |
| Nút nhỏ | `text-xs` |
| Các nút, đầu vào và lựa chọn tiêu chuẩn | `text-sm` |
| Nút lớn | `text-base` |
| Nhãn `FieldInput` | `text-sm font-medium` |
| Mô tả `FieldInput` | `text-xs`, `neutral-500` ở chế độ sáng, `neutral-400` ở chế độ tối |
| Tiêu đề `BottomDrawer` | `text-xl font-semibold tracking-tight` |

Các giá trị này mô tả các điều khiển, không phải thang đo tiêu đề chung. Sử dụng bố cục xung quanh và các trang liền kề làm tài liệu tham khảo cho tiêu đề trang và nội dung.

<a id="layout--spacing"></a>

## Bố cục & Khoảng cách

Kiểm soát nhóm bằng quyết định mà họ ủng hộ. Giữ mô tả bên cạnh các trường và hành động phụ gần hành động chính của họ.

<a id="stage-and-settings"></a>

### stage và cài đặt

- Giữ nguyên không gian hiển thị của nhân vật khi đặt các điều khiển stage và bề mặt hội thoại.
- Sử dụng các hành động lớp phủ nhỏ gọn cho các tác vụ stage ngay lập tức. Đặt cấu hình chi tiết trong cài đặt hoặc bảng chuyên dụng.
- Sử dụng lại bố cục cài đặt chung và tiêu đề trang để có tiêu đề nhất quán, quay lại điều hướng và cuộn.
- Trên màn hình nhỏ, duy trì thứ tự đọc và các hành động có thể truy cập khi nội dung trở thành một cột duy nhất.
- Giữ các điều khiển cố định tránh xa nội dung có thể cuộn, vùng an toàn và bàn phím phần mềm.

Bố cục cài đặt web [](./shared/ui/layouts/src/layouts/settings.vue) sở hữu phần đệm trang web, vùng an toàn, tiêu đề và vùng chứa cuộn cài đặt.

Electron sử dụng bố cục cài đặt [](./apps/desktop/src/renderer/layouts/settings.vue) của riêng nó. Áp dụng các thay đổi cài đặt cho bố cục sở hữu ứng dụng đích.

<a id="existing-spacing-references"></a>

### Tham chiếu khoảng cách hiện có

| Mối quan hệ | Giá trị nguồn | Ý định |
| --- | --- | --- |
| Biểu tượng nút và nhãn | `gap-2` | Giữ hành động có thể đọc được dưới dạng một đơn vị. |
| Khối nhãn trường và kiểm soát | `gap-4` trong `FieldInput` | Tách biệt lời giải thích khỏi sự tương tác mà không tách rời trường. |
| Cạnh nội dung ngăn kéo | `px-5` | Căn chỉnh tiêu đề và các điều khiển trên một cạnh chung. |
| Đáy ngăn kéo | Ít nhất 1rem, được điều chỉnh cho vùng an toàn | Giữ hành động cuối cùng có thể truy cập được. |
| Chiều rộng và chiều cao ngăn kéo | `max-w-lg`, `90dvh` tối đa | Giữ cho bảng điều khiển có thể đọc được và nội dung của nó có thể cuộn được. |

Đây là các tài liệu tham khảo thành phần, không phải là thang đo khoảng cách trang phổ quát. Giữ lại các giá trị bố cục hiện có thay vì áp đặt lưới mới.

<a id="elevation--depth"></a>

## Độ cao & Độ sâu

Sử dụng các thay đổi bề mặt trung tính để phân tách nội dung thông thường. Sử dụng độ mờ và độ mờ ở nơi điều khiển nổi trên ký tự stage.

| Bề mặt | Điều trị hiện tại | Vai trò thiết kế |
| --- | --- | --- |
| Đầu vào tiêu chuẩn | Màu trung tính, đường viền 2px, `shadow-sm` | Xác định vùng có thể chỉnh sửa mà không có thẻ nổi. |
| Điều khiển lớp phủ | Màu nền trung tính mờ và làm mờ nền | Duy trì mối quan hệ với stage trong khi vẫn đảm bảo các hành động luôn rõ ràng. |
| Chú thích | Bề mặt nhuốm màu và thanh tạo điểm nhấn dọc | Tách biệt hướng dẫn theo ngữ cảnh khỏi văn bản thông thường. |
| Ngăn kéo dưới cùng | Bề mặt trung tính, phông nền `shadow-xl` và `bg-black/35` | Tập trung sự chú ý vào một nhiệm vụ tạm thời. |

Nút phác thảo thể hiện sự tương tác chứ không phải độ cao. Chừa khoảng trống cho các đường viền di chuột và tiêu điểm thay vì cắt chúng ở cạnh vùng chứa.

Kiểm tra các điều khiển mờ trên nền sáng, tối và chi tiết. Chỉ riêng giá trị mờ không đảm bảo văn bản có thể đọc được.

Sử dụng phân lớp cửa sổ bật lên và ngăn kéo hiện có. Không tăng giá trị `z-index` cục bộ để bù đắp cho mối quan hệ xếp chồng không rõ ràng.

<a id="shapes"></a>

## Hình dạng

Hình chữ nhật tròn là mặc định cho các điều khiển hàng ngày. Các viên thuốc và vòng tròn phân biệt các hành động và công tắc nhỏ gọn. Các góc ngăn kéo lớn hơn tạo nên một bề mặt tương tác riêng biệt.

| Hình dạng nút | Thực hiện hiện tại |
| --- | --- |
| `rect` | `rounded-lg` |
| `rounded` | `rounded-full` |
| `circle` | `rounded-full`, không có phần đệm và kích thước hình vuông tương ứng |
| `parallelogram` | `rounded-lg`, độ lệch bên ngoài -10° và độ lệch nội dung 10° |

Đầu vào và lựa chọn tiêu chuẩn sử dụng `rounded-lg`. Các nút lớp phủ và cửa sổ bật lên chọn lọc sử dụng `rounded-xl`. Ngăn kéo phía dưới sử dụng góc trên 32px.

Giữ kiểu dáng hình bình hành trong hình dạng nút hiện có. Giữ nguyên độ nghiêng ngược của nó để nhãn vẫn đứng thẳng.

<a id="components"></a>

## Linh kiện

<a id="buttons"></a>

### Nút

<a id="choose-by-purpose"></a>

#### Chọn theo mục đích

| Thành phần | Ngoại hình và hành vi | Sử dụng |
| --- | --- | --- |
| [BasicButton](./shared/ui/primitives/src/components/misc/basic-button.vue) | Kích thước, biểu tượng, trạng thái tải, trạng thái tắt và phản hồi báo chí. Không có bề mặt hoặc hình dạng. | Xây dựng giao diện nút chia sẻ. |
| [Button](./shared/ui/primitives/src/components/misc/button.vue) | Bề mặt rắn hoặc mềm không có viền. Đường viền di chuột và tiêu điểm được bật theo mặc định. | Hành động chính và phụ. |
| [GhostButton](./shared/ui/primitives/src/components/misc/ghost-button.vue) | Trong suốt khi đứng yên. Tương tác thêm một bề mặt sơ cấp mờ nhạt. Tiêu điểm bàn phím có đường viền. | Thanh công cụ và các hành động ít nhấn mạnh. |
| [IconButton](./shared/ui/primitives/src/components/misc/icon-button.vue) | Loại bỏ phần đệm. Không có bề mặt, hình dạng hoặc kích thước hình vuông cố định. | Yêu thích, sao chép, thử lại và các hành động biểu tượng khác. |
| [OverlayButton](./shared/ui/primitives/src/components/misc/overlay-button.vue) | Bề mặt trung tính trong mờ, làm mờ hậu cảnh và `rounded-xl`. | Các hành động trên stage. |

Các giá trị mặc định của `Button` là `color="neutral"`, `variant="secondary"`, `shape="rect"`, `size="md"` và `outline=true`.

Đối với các hành động chính, hãy chọn rõ ràng `variant="primary"`. Để theo chủ đề của người dùng, hãy chọn `color="primary"`.

`GhostButton.active` bảo toàn bề mặt đã chọn. Người gọi cung cấp trạng thái chuyển đổi có thể truy cập, chẳng hạn như `aria-pressed`.

<a id="sizes"></a>

#### Kích cỡ

Các giá trị này đến từ `BasicButton` và `Button`. Chúng không phải là token mới. Pixel tương đương giả định kích thước phông chữ gốc là 16px.

| Kích thước | Phần đệm BasicButton | văn bản | Kích thước nút tròn |
| --- | --- | --- | --- |
| `sm` | `px-3 py-1.5`, 12 × 6px | `text-xs` | `h-8 w-8`, 32 × 32px |
| `md` | `px-4 py-2`, 16 × 8px | `text-sm` | `h-10 w-10`, 40 × 40px |
| `lg` | `px-5 py-3`, 20 × 12px | `text-base` | `h-12 w-12`, 48 × 48px |
| `unset` | Không có phần đệm hoặc kích thước văn bản cài sẵn | Người gọi thuộc sở hữu | Người gọi thuộc sở hữu |

`GhostButton` có kích thước nhỏ gọn riêng biệt. Chiều cao tối thiểu `sm`, `md` và `lg` của nó là `min-h-7`, `min-h-8` và `min-h-10`.

<a id="states-and-caller-responsibilities"></a>

#### Trách nhiệm của các tiểu bang và người gọi

- `BasicButton` sử dụng chuyển tiếp 200ms và phản hồi nhấn `active:scale-95`.
- `loading` hiển thị một vòng quay và vô hiệu hóa nút này để ngăn các lần nhấp lặp lại.
- Các nút bị tắt sử dụng độ mờ 50% và ngăn chặn tỷ lệ nhấn.
- `Button` sử dụng đường viền 2px. Tiêu điểm di chuột và bàn phím sử dụng độ lệch đường viền 2px.
- Kiểm tra tên có thể truy cập, vùng nhấn và hình thức tiêu điểm của từng `IconButton`.
- `OverlayButton` không có đường viền tùy chỉnh. Chỉ kiểm tra nguồn không xác định được sự chấp nhận bàn phím.
- Luôn bật `outline` trừ khi có cách xử lý tiêu điểm hiển thị tương đương.

Kích thước đệm và văn bản không đảm bảo kích thước mục tiêu cảm ứng. Kiểm tra khu vực tương tác cuối cùng trên thiết bị di động.

<a id="forms"></a>

### Biểu mẫu

| Thành phần | Mẫu hình ảnh hiện tại | Sử dụng |
| --- | --- | --- |
| [Input](./shared/ui/primitives/src/components/form/input/input.vue) | `rounded-lg`, `px-2 py-1`, `text-sm`, đường viền 2px và `shadow-sm` | Nhập văn bản và số một dòng |
| [Textarea](./shared/ui/primitives/src/components/form/textarea/textarea.vue) | Bề mặt cơ sở, văn bản và đường viền giống như Đầu vào | Đầu vào nhiều dòng |
| [FieldInput](./shared/ui/primitives/src/components/form/field/field-input.vue) | Nhãn và mô tả đặt trước điều khiển. Bố cục bên ngoài sử dụng `gap-4`. | Các trường có mô tả |
| [Select](./shared/ui/primitives/src/components/form/select/select.vue) | Trình kích hoạt `h-9`, `rounded-lg` mặc định và cửa sổ bật lên `rounded-xl` | Một lựa chọn duy nhất từ ​​các lựa chọn đã biết |
| [Checkbox](./shared/ui/primitives/src/components/form/checkbox/checkbox.vue) | Thuốc `h-7 w-12.5` ngón tay cái track và `size-6` | Chuyển đổi Boolean, được triển khai với Reka Switch |

Đầu vào sử dụng nền `neutral-50` ở chế độ sáng và `neutral-950` ở chế độ tối. Đường viền lấy nét lần lượt sử dụng `primary-300` và `primary-400/50`.

Các biến thể `Input` `primary` và `secondary` hiện trông giống hệt nhau. `primary-dimmed` bỏ qua lớp bóng.

Ở chế độ ánh sáng, `primary-dimmed` sử dụng `neutral-100` thay vì `neutral-50`. Ở chế độ tối, nó sử dụng `neutral-800` nhẹ hơn thay vì `neutral-950`.

`Select` cung cấp hình dạng viên thuốc thông qua `shape="rounded"` và bề mặt mờ thông qua `variant="blurry"`. Sử dụng các đạo cụ này thay vì các bản sao theo trang cụ thể.

Ưu tiên thành phần `Field*` tương ứng cho nhãn và mô tả. Các liên kết lỗi của biểu mẫu doanh nghiệp, kết quả gửi và xác thực không đồng bộ.

### BottomDrawer

[BottomDrawer](./shared/ui/primitives/src/components/layouts/bottom-drawer.vue) sử dụng Vaul Vue để chia sẻ cấu trúc và tương tác bảng điều khiển di động.

- Các góc trên cùng là 32px. Chiều rộng tối đa là `max-w-lg`. Chiều cao tối đa là `90dvh`.
- `minimumHeight="half"` đặt chiều cao tối thiểu `50dvh`. Mặc định tuân theo chiều cao nội dung.
- Lớp phủ sử dụng `bg-black/35`. Cả lớp phủ và nội dung đều sử dụng `z-[9999]`.
- Nội dung sử dụng `neutral-50`, `neutral-900` chế độ tối và `shadow-xl`.
- Phần đệm ngang là `px-5`. Phần đệm phía dưới chiếm 1rem và vùng an toàn.
- Chỉ có tay cầm mới bắt đầu kéo. Việc cuộn nội dung và các nút vẫn giữ nguyên trạng thái nhập thông thường của chúng.
- Thành phần này cung cấp tiêu đề hiển thị và vùng cuộn bên trong. Nó không có nút đóng tích hợp.
- Khi có một phương thức khác theo sau, hãy sử dụng `afterClose` và `closeAutoFocus` để phối hợp lấy nét.

Nội dung bật lên `Select` sử dụng `z-[10010]`. Đây là các giá trị thành phần hiện tại, không phải là thang đo lớp toàn cầu hoàn chỉnh.

<a id="callout-and-swipeactions"></a>

### Chú thích và SwipeActions

[Callout](./shared/ui/primitives/src/components/misc/callout.vue) kết hợp bề mặt nhuốm màu, thanh dấu dọc và tiêu đề được nhấn mạnh. Người gọi cung cấp văn bản có ý nghĩa.

[SwipeActions](./shared/ui/primitives/src/components/swipe-actions/index.ts) sở hữu các vùng vuốt và cử chỉ. [SwipeActionButton](./shared/ui/primitives/src/components/misc/swipe-action-button.vue) sở hữu bề mặt viên thuốc, biểu tượng và nhãn.

Sử dụng nền mờ cho nội dung vuốt. Nếu nhãn hiển thị bị ẩn, hãy giữ nguyên tên có thể truy cập được. Logic nghiệp vụ sở hữu trạng thái hoàn tác, xóa và dữ liệu.

<a id="motion-and-icons"></a>

### Chuyển động và biểu tượng

| Thực hiện | Chuyển động hiện tại |
| --- | --- |
| `BasicButton`, `Input` và `Textarea` | 200ms, `ease-in-out` |
| Ngón tay cái `Checkbox` | Bản dịch 250ms, `ease-in-out` |
| [TransitionVertical](./shared/ui/primitives/src/components/animations/transition-vertical.vue) | Chuyển đổi độ cao và độ mờ mặc định 250ms |
| [TransitionHorizontal](./shared/ui/primitives/src/components/animations/transition-horizontal.vue) | Chuyển đổi độ rộng và độ mờ 500ms |
| [AnimatedContent](./shared/ui/primitives/src/components/animations/animated-content.vue) | Đầu vào 220 mili giây, đầu ra 160 mili giây và chuyển tiếp làm mờ bên trong 6px |
| Ảnh động UnoCSS được chia sẻ | Lớp phủ 300ms, nội dung 150ms, lối vào định hướng 400ms, fade 200ms |

`AnimatedContent` sở hữu chuyển động chứ không phải kiểu dáng bề mặt. Chủ sở hữu vòng đời của nó cung cấp `data-state` và giữ Node được gắn cho đến khi hoạt ảnh thoát kết thúc.

`AnimatedContent` và `BottomDrawer` xử lý rõ ràng các tùy chọn giảm chuyển động. Kiểm tra các điều khiển khác riêng lẻ thay vì giả sử hỗ trợ trên toàn thư viện.

Các biểu tượng sử dụng Iconify. Các thành phần và câu chuyện hiện có sử dụng các bộ như Solar và Phosphor. Kho lưu trữ không yêu cầu một bộ biểu tượng độc quyền.

`BasicButton` sử dụng vùng chứa biểu tượng 16 × 16px. Con quay của nó chiếm cùng một diện tích. Giữ kích thước hình ảnh và kiểu biểu tượng nhất quán trong một nhóm hành động.

<a id="dos-and-donts"></a>

## Nên và Không nên

<a id="do"></a>

### LÀM

- Sử dụng các biến thể thành phần hiện có trước khi thêm giao diện mới.
- Hãy để `primary` theo màu sắc của người dùng và duy trì các phương pháp điều trị sáng và tối riêng biệt.
- Giữ các điều khiển stage nhỏ gọn và mô tả cài đặt có thể đọc được.
- Giữ nguyên trạng thái di chuột, tiêu điểm, đã chọn, tắt và tải khi điều chỉnh điều khiển.
- Cung cấp tên có thể truy cập cho các hành động biểu tượng và thông tin trạng thái ngoài màu sắc.
- Kiểm tra các vùng tiếp xúc thực tế, nhãn dài, vùng an toàn và hành vi giảm chuyển động.
- Giữ tỷ lệ thành phần và kiểu biểu tượng nhất quán trong một nhóm hành động.

<a id="dont"></a>

### Đừng

- Không thay thế bảng màu chính động bằng giá trị hex thương hiệu cố định.
- Không áp dụng kiểu stage mờ cho mọi biểu mẫu hoặc vùng nội dung.
- Không thay thế tất cả bán kính thành phần hoặc thời lượng hoạt ảnh bằng một giá trị chung.
- Không loại bỏ đường nét tiêu điểm mà không có biện pháp xử lý tương đương.
- Không coi tên màu của thành phần là định nghĩa trạng thái kinh doanh hoàn chỉnh.
- Không sao chép các điều khiển được chia sẻ với các kiểu dành riêng cho trang.
- Không coi việc kiểm tra nguồn là bằng chứng về sự chấp nhận trực quan hoặc khả năng tiếp cận.
