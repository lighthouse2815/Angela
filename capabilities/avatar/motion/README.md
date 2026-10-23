# `@angela/motion-driver-magic`

MAGIC có nghĩa là Trình tạo hoạt hình Markovian với Điều hòa ảo ảnh. Gói này phù hợp với chuyển động theo thủ tục mô hình và tạo ra các khung chuyển động chuẩn hóa. Điểm vào gốc của nó xuất VAR và AR-HMM mô hình.

<a id="use-the-package"></a>

## Sử dụng gói

```ts
import type { TrainingSequence } from '@angela/motion-driver-magic'

import { fit } from '@angela/motion-driver-magic'

const sequence: TrainingSequence = {
  sampleRateHz: 30,
  sourceDurationMs: 1000,
  frames,
}

const model = fit(sequence, { method: 'var', order: 12, ridge: 0.001 })
const generator = model.toGenerator({ seed: 1 })
const frame = generator.next({ noiseScale: 1 })
```

<a id="when-to-use-it"></a>

## Khi nào nên sử dụng nó

Sử dụng gói này để lắp mô hình và chuyển động thủ tục gieo mầm sinh nội dung. Người gọi kiểm soát việc lập lịch, lọc, tích hợp transport và renderer.

Không nhập các đối tượng Vue, renderer, trình chỉnh sửa bản ghi hoặc lập lịch trình duyệt vào gói này. Chuyển đổi bản ghi ứng dụng sang khung số có chiều rộng cố định trước khi lắp mô hình.
