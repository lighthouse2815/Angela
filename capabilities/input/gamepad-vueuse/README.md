# `@angela/input-gamepad-vueuse`

Gói này cung cấp Vue các composable cho `@angela/input-gamepad`. Nó sở hữu vòng đời của màn hình và hiển thị trạng thái bộ điều khiển phản ứng chỉ đọc.

<a id="use-the-package"></a>

## Sử dụng gói

```ts
import { useStandardGamepad } from '@angela/input-gamepad-vueuse'
import { whenever } from '@vueuse/core'
import { watchEffect } from 'vue'

const gamepad = useStandardGamepad()

whenever(gamepad.buttons.faceBottom, () => {
  console.info('The bottom face button is pressed.')
})

whenever(gamepad.pressed('leftShoulder', 'dpadLeft'), () => {
  console.info('The shortcut is pressed.')
})

watchEffect(() => {
  console.info(gamepad.sticks.left.value, gamepad.values.rightTrigger.value)
})
```

composable bắt đầu sau khi gắn phạm vi Vue của nó. Nó dừng lại khi phạm vi đó được xử lý. Sử dụng `pause()` và `resume()` khi tính năng được gắn phải tạm thời dừng đầu vào.

<a id="when-to-use-it"></a>

## Khi nào nên sử dụng nó

Sử dụng gói này trong trình duyệt Vue và mã Electron renderer. Sử dụng `@angela/input-gamepad` trong mã độc lập với khung.

Gói này hiển thị các nút, cần gạt và bộ kích hoạt tương tự tiêu chuẩn. Nó không để lộ cảm biến chuyển động, bàn di chuột, đèn hoặc bộ kích hoạt thích ứng. Sử dụng gói dành riêng cho thiết bị cho các tính năng này.
