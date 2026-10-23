# `@angela/input-gamepad`

Gói này đọc bộ điều khiển thông qua trình duyệt Gamepad API. Nó chấp nhận các bộ điều khiển hiển thị ánh xạ W3C `standard`.

Gói chuyển đổi các chỉ mục nút trình duyệt thành tên vật lý. Ví dụ: nút `0` trở thành `faceBottom`. Nhãn in có thể là `×`, `A` hoặc `B`.

<a id="use-the-package"></a>

## Sử dụng gói

```ts
import { StandardGamepadMonitor } from '@angela/input-gamepad'

const monitor = new StandardGamepadMonitor({ deadzone: 0.12 })
const stopListening = monitor.onSnapshot((snapshot) => {
  if (!snapshot)
    return

  console.info(snapshot.leftStick, snapshot.buttons.faceBottom)
})

monitor.start()

// Run these operations when the feature closes.
stopListening()
monitor.stop()
```

<a id="when-to-use-it"></a>

## Khi nào nên sử dụng nó

Sử dụng gói này trực tiếp trong mã trình duyệt độc lập với khung. Nó hỗ trợ các nút, gậy và kích hoạt tương tự.

Trong mã Vue, sử dụng `@angela/input-gamepad-vueuse`. Nó sở hữu vòng đời bỏ phiếu và hiển thị trạng thái phản ứng chỉ đọc.

Không sử dụng gói này cho cảm biến chuyển động, bàn di chuột, đèn hoặc bộ kích hoạt thích ứng. Sử dụng bộ chuyển đổi dành riêng cho thiết bị cho các tính năng này.

Gói bỏ qua các bộ điều khiển không có ánh xạ `standard`. Quy tắc này ngăn các chỉ mục nút dành riêng cho thiết bị nhập mã ứng dụng.
