# `@angela/model-driver-lipsync`

Cấu hình hát nhép được chia sẻ và các chính sách lái xe bằng miệng trung lập mô hình dành cho Angela.

<a id="what-it-does"></a>

## Nó làm gì

- Hiển thị hồ sơ wLipSync được chia sẻ.
- Chuyển đổi khung AEIOUS thô thành trọng số AEIOU ổn định.
- Sở hữu lựa chọn người chiến thắng, phát hiện sự im lặng và làm mịn trọng lượng.
- Cung cấp trình điều khiển hát nhép Live2D hiện có.
- Hiển thị wLipSync Node hàm tạo chỉ dành cho trình duyệt thông qua một mục nhập runtime riêng biệt.

Gói không ghi trọng số vào biểu thức VRM hoặc hình thái MMD. Mỗi renderer đều sở hữu ánh xạ đó.

<a id="exports"></a>

## Xuất khẩu

- `@angela/model-driver-lipsync`: trình điều khiển Live2D.
- `@angela/model-driver-lipsync/shared/wlipsync`: cấu hình, kiểu và trình điều khiển nguyên âm thuần túy.
- `@angela/model-driver-lipsync/runtime/wlipsync`: âm thanh chỉ dành cho trình duyệt-Node hàm tạo.

Mục được chia sẻ không có tác dụng phụ Web Audio. Các công cụ và bài kiểm tra dựa trên Node có thể nhập nó một cách an toàn.

<a id="how-to-use-it"></a>

## Cách sử dụng nó

```ts
import { createWLipSyncNode } from '@angela/model-driver-lipsync/runtime/wlipsync'
import {
  createWLipSyncVowelDriver,
  wlipsyncProfile,
} from '@angela/model-driver-lipsync/shared/wlipsync'

const node = await createWLipSyncNode(audioContext, wlipsyncProfile)
const driver = createWLipSyncVowelDriver()
const weights = driver.update(node, deltaSeconds)
```

Người gọi sở hữu `AudioContext`, Node nguồn và vòng đời của nguồn.

<a id="when-to-use-it"></a>

## Khi nào nên sử dụng nó

- Sử dụng mục nhập được chia sẻ khi renderer cần trọng lượng AEIOU tiêu chuẩn.
- Sử dụng mục nhập runtime khi mã trình duyệt tạo âm thanh wLipSync Node.
- Giữ ánh xạ hình thái và biểu thức dành riêng cho renderer trong gói renderer.

<a id="when-not-to-use-it"></a>

## Khi nào không nên sử dụng nó

- Không nhập mục nhập runtime từ mã chỉ dành cho Node.
- Không thêm các phần phụ thuộc Vue, Three.js, VRM hoặc MMD vào gói này.
- Không di chuyển ghi mô hình dành riêng cho renderer vào trình điều khiển dùng chung.
