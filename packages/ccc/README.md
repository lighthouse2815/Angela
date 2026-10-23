# @angela/ccc

Giao thức thẻ nhân vật nguyên thủy cho Angela.

<a id="what-it-owns"></a>

## Những gì nó sở hữu

- Phân loại khả năng tương thích và xác thực đường bao CCv3 JSON.
- Bảo tồn tương thích chuyển tiếp các trường không xác định trong quá trình xác thực.
- Hợp đồng CCv3 TypeScript được chia sẻ.
- Thẻ nhân vật JSON, Markdown, PNG và APNG hỗ trợ xuất khẩu.

Gói này có chủ đích là runtime-bất khả tri. Nó không sở hữu cài đặt mô-đun Angela, tính bền vững cục bộ, tập hợp tin nhắn trò chuyện hoặc hành vi soạn thảo.

<a id="parse-a-ccv3-document"></a>

## Phân tích tài liệu CCv3

```ts
import { parseCharacterCardV3 } from '@angela/ccc'

const { card, compatibility } = parseCharacterCardV3(jsonText)

const characterName = card.data.name
const versionSupport = compatibility // 'older' | 'current' | 'newer'
```

Trình phân tích cú pháp chấp nhận dữ liệu JSON đã giải mã hoặc văn bản JSON. Các giá trị `spec_version` cũ hơn và mới hơn vẫn có thể nhập được, trong khi `compatibility` cho phép người gọi quyết định có cảnh báo người dùng hay không. Các khóa không xác định được giữ nguyên trên đầu ra đã xác thực để các trường CCv3 trong tương lai không bị xóa âm thầm.

JSON không đúng định dạng và cấu trúc CCv3 không hợp lệ sẽ tạo ra `InvalidCharacterCardError`. Sử dụng `isInvalidCharacterCardError` khi ranh giới cần phân biệt lỗi giao thức với lỗi lưu trữ hoặc hệ thống tệp.

<a id="when-to-use-it"></a>

## Khi nào nên sử dụng nó

- Nhập hoặc xuất Thẻ nhân vật cộng đồng.
- Xác thực phong bì CCv3 trước khi chuyển đổi nó thành ứng dụng mô hình.
- Xây dựng bộ điều hợp định dạng như PNG, APNG hoặc CHARX.

<a id="when-not-to-use-it"></a>

## Khi nào không nên sử dụng nó

- Duy trì trạng thái thẻ hoạt động dành riêng cho Angela.
- Áp dụng cấu hình giọng nói, tầm nhìn, cơ thể-mô hình hoặc agent.
- Xây dựng tin nhắn nhà cung cấp từ prompt, lời chào, ví dụ hoặc Sách truyền thuyết.

Những chính sách đó thuộc về nhân vật runtime của Angela chứ không phải codec giao thức cộng đồng.

<a id="license"></a>

## Giấy phép

[MIT](./LICENSE)
