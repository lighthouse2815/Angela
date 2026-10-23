# @angela/ui

Thư viện thành phần UI cách điệu được xây dựng bằng [Reka UI](https://reka-ui.com/) và [UnoCSS](https://unocss.dev/).

Để xem trước các thành phần, hãy tham khảo gói [`stage-ui`](../stage) để biết hướng dẫn chạy bảng phân cảnh Histoire UI.

<a id="get-started"></a>

## Bắt đầu

Cài đặt thư viện:

```shell
ni @angela/ui -D # from @antfu/ni, can be installed via `npm i -g @antfu/ni`
pnpm i @angela/ui -D
yarn i @angela/ui -D
npm i @angela/ui -D
```

Thư viện này yêu cầu `unocss` có Chế độ phân bổ và đặt lại kiểu.

Đầu tiên, hãy cài đặt `unocss` nếu bạn chưa có:

```shell
pnpm i -D unocss
```

Tiếp theo, trong `uno.config.ts` của bạn, hãy thêm `presetAttributify()` vào mảng cài sẵn của bạn:
```ts
import { defineConfig, presetAttributify } from 'unocss'

export default defineConfig({
  presets: [
    presetAttributify(),
    // ...your other presets
  ],
})
```

Cuối cùng, nhập kiểu đặt lại trong `main.ts` của bạn:
```ts
import '@unocss/reset/tailwind.css'
```

<a id="usage"></a>

## Cách sử dụng

```vue
<script setup lang="ts">
import { Button } from '@angela/ui'
</script>

<template>
  <Button>Click me</Button>
</template>
```

<a id="components"></a>

## Linh kiện

* [Hoạt hình](src/components/Animations)
    * [TransitionVertical](src/components/Animations/TransitionVertical.vue)
* [Form](src/components/Form)
    * [Hộp kiểm](src/components/Form/Checkbox)
    * [Chọn](src/components/Form/Select)
    * [Field](src/components/Form/Field)
    * [Đầu vào](src/components/Form/Input)
    * [Đài phát thanh](src/components/Form/Radio)
    * [Phạm vi](src/components/Form/Range)
    * [ComboboxSelect](src/components/Form/Select)
    * [Vùng văn bản](src/components/Form/Textarea)

<a id="license"></a>

## Giấy phép

[MIT](../../LICENSE)

<a id="swipe-actions"></a>

## Thao tác vuốt

Compose `SwipeActionsRoot`, `SwipeActionsContent`, `SwipeActionsList` và `SwipeActionsItem`. Liên kết `v-model:open` trên Root và cấp cho mỗi Mục một `value` duy nhất, ổn định trong Danh sách của nó. Thêm Danh sách với `side="start"` và `side="end"` để vuốt hai chiều. `v-model:side` của Root chọn cạnh được tiết lộ; `dir` ánh xạ các cạnh logic trong RTL. Sự kiện `action(value, side)` của nó xác định hành động đã chọn. Mỗi Danh sách sử dụng Mục cuối cùng làm mặc định cho thao tác vuốt dài. `defaultAction` của Danh sách có thể chọn một giá trị khác; `fullSwipe=false` vô hiệu hóa lựa chọn vuốt dài.

Các mục đăng ký và làm theo thứ tự DOM tự động. Sắp xếp lại hoặc xóa chúng sẽ hủy các cử chỉ đang chờ xử lý. Tất cả các bộ phận đều hỗ trợ `as` và `asChild` của Reka UI. Danh sách kiểm soát chiều rộng và khoảng cách trên mỗi hành động. `:gap="16"` để lại 16px giữa các Mục và 8px ở mỗi cạnh ngoài, bao gồm cả bên cạnh Nội dung trong khi nhập. Kích thước vùng chứa của nó cho phép các Mục xuất hiện lần lượt từ cạnh ngoài, với các đường cong tỷ lệ và độ mờ có thể đảo ngược. Các mục không có khoảng trống vẫn được đăng ký nhưng không thể nhận đầu vào hoặc tiêu điểm. Sử dụng nền mờ cho Nội dung.

Sử dụng `SwipeActionButton` bên trong `SwipeActionsItem as-child` cho bề mặt, biểu tượng và văn bản tiêu chuẩn. Chuyển `takeover` của ô Vật phẩm và `edge` vật lý vào nút. `showLabel=false` lấp đầy vùng văn bản cũ trong khi vẫn giữ tên có thể truy cập được.

Sử dụng các thành phần này cho các vùng hoạt động liên tục ở cả hai bên. Họ không sở hữu hành vi lưu trữ cuộc trò chuyện, hoàn tác hoặc vuốt để trả lời. Xem tài liệu tham khảo thành phần [](../../../docs/ai/context/ui-components.md#swipeactions) và câu chuyện Lịch sử stage-ui **Khác → Thao tác vuốt**.
