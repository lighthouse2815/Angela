# `@angela/input-playstation-dualsense-5`

Gói này đọc và ghi báo cáo Sony PlayStation 5 DualSense thông qua WebHID. Nó không có mã UI.

Gói hỗ trợ bộ điều khiển DualSense tiêu chuẩn với sản phẩm ID `0x0ce6`. Nó hỗ trợ các báo cáo USB và Bluetooth.

<a id="use-the-package"></a>

## Sử dụng gói

Gọi `requestDualSenseDevice()` từ hành động của người dùng. WebHID yêu cầu hành động của người dùng trước khi hiển thị trình chọn thiết bị.

```ts
import {
  createDefaultDualSenseOutputState,
  DualSenseController,
  requestDualSenseDevice,
} from '@angela/input-playstation-dualsense-5'

const device = await requestDualSenseDevice()
if (!device)
  throw new Error('No DualSense device was selected.')

const controller = new DualSenseController(device)
const stopInput = controller.onInputReport((report) => {
  console.info(report.state.sticks.left)
})

await controller.open()

const output = createDefaultDualSenseOutputState()
await controller.sendOutput({
  ...output,
  lightbar: { red: 124, green: 178, blue: 232 },
})

stopInput()
await controller.close()
```

Sử dụng `getGrantedDualSenseDevices()` để tìm các thiết bị đã có quyền. Sử dụng `onDualSenseConnectionChange()` để quan sát các sự kiện kết nối và ngắt kết nối.

<a id="when-to-use-it"></a>

## Khi nào nên sử dụng nó

Sử dụng gói này khi Crom renderer cần đầu vào DualSense thô, cảm biến chuyển động, điểm tiếp xúc, đèn LED, tiếng ầm ầm hoặc bộ kích hoạt thích ứng.

Không sử dụng gói này cho gamepad thông thường. Sử dụng Gamepad API khi các nút và trục tiêu chuẩn đã đủ.

WebHID yêu cầu bối cảnh an toàn. Trình duyệt host phải hỗ trợ WebHID.

<a id="reference"></a>

## Thẩm quyền giải quyết

- https://github.com/nondebug/dualsense
