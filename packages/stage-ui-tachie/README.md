# `@angela/stage-ui-tachie`

Kết xuất cảnh Tachie cho các nhân vật được thể hiện bằng một tập hợp nhỏ các hình ảnh cảm xúc tĩnh, hoàn chỉnh.

<a id="what-it-does"></a>

## Nó làm gì

- Tải các kho lưu trữ `.tachie.zip` từ các tệp cục bộ, URL blob hoặc URL HTTP(S).
- Lựa chọn hình ảnh thông qua vốn từ vựng cảm xúc được chia sẻ của Angela.
- Hiển thị hình ảnh đang hoạt động với PixiJS trên canvas trong suốt, phản hồi nhanh.
- Duy trì cài đặt tỷ lệ, vị trí, tỷ lệ hiển thị và bóng theo chủ đề.
- Hiển thị canvas thu nhận dữ liệu cho ảnh chụp màn hình stage và trích xuất màu chủ đề.

<a id="archive-format"></a>

## Định dạng lưu trữ

`neutral` là bắt buộc. Mọi hình ảnh khác đều là tùy chọn và những cảm xúc còn thiếu sẽ quay trở lại `neutral`. Phần mở rộng tệp không phải là một phần của giao thức; nội dung hình ảnh chỉ cần được giải mã bởi trình duyệt.

```text
character.tachie.zip
├── neutral.png
├── happy.webp
└── surprised.jpg
```

Một thư mục gói duy nhất cũng được chấp nhận:

```text
character.tachie.zip
└── character/
    ├── neutral.png
    └── happy.webp
```

Các tên được hỗ trợ là `neutral`, `happy`, `sad`, `angry`, `think`, `surprised`, `awkward`, `question` và `curious`. Kết hợp không phân biệt chữ hoa chữ thường. Mọi hình ảnh được nhận dạng phải sử dụng cùng kích thước pixel.

<a id="how-to-use"></a>

## Cách sử dụng

```vue
<script setup lang="ts">
import { TachieScene } from '@angela/stage-ui-tachie'
</script>

<template>
  <TachieScene :model-src="modelUrl" />
</template>
```

<a id="when-to-use-it"></a>

## Khi nào nên sử dụng nó

Sử dụng Tachie cho các nhân vật có giá trị thấp mà trạng thái hình ảnh có thể được thể hiện bằng một hình ảnh hoàn chỉnh cho mỗi cảm xúc.

Không sử dụng nó cho các họa tiết xếp lớp, hoạt ảnh gian lận, hát nhép hoặc theo dõi cơ thể và mắt được tham số hóa. Sử dụng Live2D, Spine, VRM hoặc MMD cho những mô hình đó.
