# `@angela/model-driver-magic-live2d`

Gói này áp dụng bộ tạo chuyển động MAGIC cho các tư thế Live2D được chuẩn hóa. Nó sở hữu chuyển đổi tư thế, lập lịch tỷ lệ cố định, lọc đầu ra và phát hành mục tiêu.

<a id="use-the-package"></a>

## Sử dụng gói

```ts
import { createDriver } from '@angela/model-driver-magic-live2d'

const driver = createDriver({
  target: {
    apply: pose => motionControl.setPose(ownerId, pose, dynamics),
    release: () => motionControl.release(ownerId),
  },
})

driver.start(model.toGenerator({ seed: 1 }))
```

Gói không nhập Vue, Pinia, BroadcastChannel hoặc Live2D renderer. Ứng dụng cung cấp bộ chuyển đổi mục tiêu ở đường nối trình điều khiển.
