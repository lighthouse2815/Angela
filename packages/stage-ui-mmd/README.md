# @angela/stage-ui-mmd

Các thành phần cảnh MMD (MikuMikuDance), các composable và store cho Angela.

<a id="what-it-does"></a>

## Nó làm gì

Kết xuất PMX/PMD mô hình với hỗ trợ chuyển động VMD/VPD bên trong stage của Angela, đạt được tính năng tương đương với Live2D và VRM các renderer:

- **Tải mô hình** cho `.pmx`/`.pmd`, từ ZIP đóng gói (mô hình + kết cấu) hoặc mô hình URL trần.
- **Vật lý** dành cho tóc, váy và giàn tùy chỉnh thông qua Bullet (Ammo.js) — phần thân cứng và khớp lò xo 6-DOF, có thể bật tắt tại runtime.
- **IK** (bộ giải CCD) và **sự lan truyền xương nối ("cấp")** cho các giàn tiêu chuẩn và tùy chỉnh.
- **Chuyển động có thể nhập, có thể ánh xạ**: nhập các clip VMD (lưu giữ với IndexedDB, được đồng bộ hóa trên các cửa sổ), đặt một clip làm chuyển động lặp ở chế độ chờ, xem trước bất kỳ clip nào dưới dạng một lần quay, xóa chúng và ánh xạ cảm xúc của Angela thành các chuyển động cử chỉ.
- **Đồng bộ hóa nhép dựa trên hình thái** được điều khiển bởi cấu hình wLipSync chung, ánh xạ các âm vị thành các hình thái miệng あいうえお chuẩn, với ánh xạ hình thái theo từng vị trí cho mô hình không chuẩn.
- **Biểu hiện cảm xúc** thông qua các hình thái mờ dần.
- **Chế độ nhìn** (máy ảnh / con trỏ / bị tắt) với chuyển động không hoạt động, cộng với nhấp nháy theo quy trình.
- **Cài đặt cảnh**: Biến đổi mô hình, camera FOV, đèn xung quanh + định hướng, ánh sáng phản chiếu, tỷ lệ kết xuất, trọng lực vật lý và độ mờ trên mỗi vật liệu — tất cả trực tiếp, được duy trì và đồng bộ hóa trên các cửa sổ.

Nó được xây dựng trên [`@moeru/three-mmd`](https://github.com/moeru-ai/three-mmd) để tải PMX/PMD, xây dựng hoạt hình VMD, IK, truyền lan xương nối, vật liệu toon, đường viền và thứ tự cập nhật runtime được chia sẻ. Vật lý đến từ `@moeru/three-mmd-physics-ammo` và được tải một cách lười biếng, vì vậy Đạn WASM runtime chỉ được khởi tạo sau khi lắp trực tiếp MMD mô hình.

<a id="how-to-use"></a>

## Cách sử dụng

Gói hiển thị hợp đồng cảnh giống như các renderer khác, do đó, nó được tự động kết nối qua `Stage.vue` của `@angela/stage-ui` khi mô hình được chọn phân giải thành `mmd` renderer:

```ts
import { MMDScene, useMMD } from '@angela/stage-ui-mmd'
```

```vue
<MMDScene
  v-model:state="state"
  :audio-context="audioContext"
  :model-src="modelUrl"
  :cursor-position="cursorPosition"
  :current-audio-source="audioSource"
  :enable-orbit-controls="true"
  @error="onError"
/>
```

Thành phần này hiển thị `canvasElement()`, `captureFrame()`, `setEmotion(name, intensity)`, `listMorphs()` và `listMotions()`.

Cấu hình runtime (physics/IK/grant chuyển đổi, theo dõi ánh mắt, tỷ lệ, ghi đè hình thái, cảm xúc→ánh xạ chuyển động) nằm trong `useMMD` Pinia store và được chỉnh sửa thông qua bảng cài đặt mô hình.

<a id="when-to-use-it"></a>

## Khi nào nên sử dụng nó

- Hiển thị các ký tự MMD/MikuMikuDance (`.pmx`/`.pmd`) trên Angela stage.
- Khi bạn cần phát lại chuyển động phụ dựa trên vật lý, IK và VMD.

<a id="when-not-to-use-it"></a>

## Khi nào không nên sử dụng nó

- Đối với hình đại diện VRM, hãy sử dụng `@angela/stage-ui-three`; đối với Live2D, hãy sử dụng `@angela/stage-ui-live2d`; đối với Spine, hãy sử dụng `@angela/stage-ui-spine`.
- Trong môi trường không hỗ trợ WebGL/WASM (vật lý MMD yêu cầu Đạn WASM).
