<a id="design-implementation-notes"></a>

# Ghi chú thực hiện thiết kế

Hướng dẫn thiết kế [AIRI](../../../DESIGN.md) xác định các quy tắc nhận dạng hình ảnh và tái sử dụng. Tài liệu này ghi lại các phát hiện nguồn và thủ tục giao hàng.

<a id="format-alignment"></a>

## Căn chỉnh định dạng

Hướng dẫn tuân theo tám phần được sắp xếp theo thứ tự trong đặc tả [Google DESIGN.md](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md).

Khối YAML token tùy chọn bị bỏ qua. Màu sắc động vẫn còn trong cài đặt Màu sắc và chủ đề. Các giá trị thành phần tĩnh vẫn được liên kết với việc triển khai chúng.

Tên tệp `DESIGN.md` viết hoa tuân theo quy ước định dạng. Đây là một ngoại lệ rõ ràng đối với quy tắc đặt tên tệp kebab-case của AIRI.

Root `AGENTS.md` tham chiếu rõ ràng đến nó. Việc phát hiện tự động bằng các công cụ bên ngoài không được giả định.

Không có Google CLI hoặc kỹ năng mới nào được cài đặt. Thay đổi này căn chỉnh cấu trúc và nội dung tài liệu chứ không phải xuất token hoặc tích hợp CLI.

<a id="known-differences-and-follow-up-work"></a>

## Những khác biệt đã biết và công việc tiếp theo

Những phát hiện này đến từ việc kiểm tra nguồn. Hướng dẫn này không thay đổi mã runtime.

| Sự khác biệt | Bằng chứng | Theo dõi |
| --- | --- | --- |
| Đầu vào khai báo kích thước mà không có kiểu tương ứng | `input.vue` khai báo `size`, nhưng mẫu của nó chỉ sử dụng các kiểu biến thể. | Xác định hợp đồng kích thước, sau đó cập nhật thành phần, tài liệu tham khảo và câu chuyện. |
| Hai biến thể đầu vào trông giống hệt nhau | `primary` và `secondary` chứa các mảng kiểu giống hệt nhau. | Quyết định xem cả hai tên vẫn còn. Tránh sự khác biệt theo từng trang cụ thể. |
| Điều trị tập trung khác nhau | Nút và GhostButton xác định đường viền tiêu điểm. IconButton và OverlayButton không xác định các quy tắc tương đương. | Kiểm tra tương tác bàn phím trước khi chỉnh sửa chung. |
| Hỗ trợ thời gian chuyển động và giảm chuyển động khác nhau | Việc triển khai chuyển động trong hướng dẫn thiết kế xác định các tham số riêng biệt. | Nhóm thay đổi theo loại tương tác thay vì thay thế tất cả thời lượng. |
| Hình ảnh toàn cầu token chưa hoàn thiện | Các biến màu được chia sẻ. Các thành phần vẫn xác định hầu hết các giá trị bán kính, khoảng cách và lớp. | Trích xuất các yêu cầu lặp lại từ các trường hợp sử dụng thực tế trước khi thêm token. |

Địa chỉ tiêu điểm bàn phím và kích thước trường đầu tiên. Sau đó hợp nhất các tham số hình ảnh lặp lại và kiểm tra các trang kinh doanh. Mỗi thay đổi runtime cần có hành vi và bằng chứng trực quan.

Để chuyển đổi chủ đề, hãy sử dụng lại [useTheme](../../../shared/ui/primitives/src/composables/use-theme.ts). Các quy tắc UnoCSS cho phép rõ ràng composable này mặc dù cài đặt `disableTransition: true` của nó.

Đối với các cuộc gọi `useDark` trực tiếp, hãy đặt `disableTransition: false` theo yêu cầu của quy tắc kho lưu trữ.

<a id="design-workflow-and-existing-skills"></a>

## Thiết kế quy trình làm việc và các kỹ năng hiện có

Kho lưu trữ đã bao gồm các kỹ năng triển khai, đánh giá và chụp ảnh màn hình. Nhiệm vụ tài liệu này không yêu cầu cài đặt thêm kỹ năng thiết kế.

| Nhiệm vụ | Điểm vào | Mục đích |
| --- | --- | --- |
| Chọn các mẫu và thành phần trực quan | Hướng dẫn thiết kế và tài liệu tham khảo thành phần [](./ui-components.md) | Hiểu các quy ước và API thiết kế AIRI |
| Viết kiểu thành phần | [enforce-quy tắc-cho-unocss](../../../.agents/skills/enforce-rules-for-unocss/SKILL.md) | Tái sử dụng các điều khiển, sắp xếp các tiện ích và duy trì hoạt động của chủ đề |
| Viết các thành phần Vue | Các quy tắc [vue-thực hành tốt nhất](../../../.agents/skills/vue-best-practices/SKILL.md) và [TypeScript](../../../.agents/skills/enforce-rules-for-typescript/SKILL.md) | Xác định ranh giới thành phần, trạng thái và thực tiễn triển khai |
| Đánh giá tương tác và khả năng tiếp cận | [web-thiết kế-hướng dẫn](../../../.agents/skills/web-design-guidelines/SKILL.md) | Cung cấp kiểm tra đánh giá cùng với các quy ước trực quan AIRI |
| thu nhận dữ liệu bằng chứng trực quan | [use-vishot](../../../.agents/skills/use-vishot/SKILL.md) | thu nhận dữ liệu chụp ảnh màn hình thông qua các tình huống runtime thích hợp |
| Xuất bản UI PR | [create-pr](../../../.agents/skills/create-pr/SKILL.md) | Xem lại hành vi bị ảnh hưởng và cung cấp ảnh chụp màn hình tương đương |

Thiết kế `AGENTS.md` route UI gốc hoạt động theo hướng dẫn thiết kế. Kỹ năng cung cấp các thủ tục thực hiện và xem xét mà không trùng lặp tham chiếu thiết kế.

<a id="for-each-design-change"></a>

### Đối với mỗi lần thay đổi thiết kế

1. Xác định vị trí kiểm soát được chia sẻ và các trang kinh doanh hiện có. Xác định xem sự khác biệt thuộc về điều khiển hay kịch bản.
2. Chọn các biến thể, kích thước và hình dạng hiện có trước khi mở rộng API.
3. Khi một thành phần được chia sẻ thay đổi, hãy cập nhật tài liệu tham khảo và các câu chuyện của nó.
4. Kiểm tra chế độ sáng, chế độ tối, màu sắc tùy chỉnh, văn bản dài, tải và trạng thái tắt.
5. Kiểm tra tiêu điểm bàn phím, mục tiêu cảm ứng, bàn phím phần mềm và vùng an toàn.
6. Ghi lại kết quả và các mục chưa được xác minh thông qua quy trình làm việc PR.

Chạy `pnpm dev:ui` để xem trước thành phần. Lịch sử sống ở `shared/ui/stage`.

Bắt đầu với các câu chuyện nút [](../../../shared/ui/stage/src/components/misc/button.story.vue), [đầu vào câu chuyện](../../../shared/ui/stage/src/components/form/input/input.story.vue), [chọn câu chuyện](../../../shared/ui/stage/src/components/form/select/select.story.vue) và [swipe câu chuyện hành động](../../../shared/ui/stage/src/components/misc/swipe-actions.story.vue).

Thay đổi tài liệu yêu cầu kiểm tra liên kết và định dạng. Các thay đổi của runtime UI cũng yêu cầu kiểm tra loại, kiểm tra liên quan và chấp nhận trực quan. Kiểm tra nguồn không thay thế kiểm tra runtime.
