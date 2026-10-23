<a id="angela-desktop-grounding--chrome-extension"></a>

# Angela desktop đối chiếu ngữ cảnh — Tiện ích mở rộng của Chrome

chỉ đọc Cầu quan sát Chrome DOM dành cho lớp Angela desktop đối chiếu ngữ cảnh.

<a id="what-it-does"></a>

## Nó làm gì

- Thu thập các yếu tố tương tác (nút, liên kết, đầu vào, v.v.) từ tất cả các khung trong tab Chrome đang hoạt động
- Báo cáo vị trí phần tử, vai trò ARIA, văn bản và tọa độ trực tiếp
- Cung cấp dữ liệu này vào trình phân giải nhanh desktop đối chiếu ngữ cảnh để ánh xạ tọa độ

<a id="what-it-does-not-do"></a>

## Những việc không thực hiện

- ❌ Không có DOM các thay đổi trạng thái (không click, gõ, cuộn trên các phần tử DOM)
- ❌ Không có `eval` / `new Function` / `chrome.scripting.executeScript`
- ❌ Không có yêu cầu mạng bên ngoài (không có cầu nối Python, không có tài liệu ngoài màn hình)
- ❌ Không có cửa sổ bật lên UI

Tất cả các tương tác của người dùng được thực hiện thông qua các sự kiện đầu vào cấp độ macOS OS (CGEvent) thực tế thông qua trình thực thi desktop đối chiếu ngữ cảnh.

<a id="architecture"></a>

## Ngành kiến ​​​​trúc

```
background.js (Service Worker)
    ↕ chrome.tabs.sendMessage
msg_bridge.js (ISOLATED world)
    ↕ window.postMessage
content.js (MAIN world, window.__AIRI_DG__)
```

<a id="installation-development"></a>

## Cài đặt (phát triển)

1. Mở `chrome://extensions/`
2. Bật "Chế độ nhà phát triển"
3. Nhấp vào "Tải đã giải nén"
4. Chọn thư mục `chrome-extension/` này
5. Tiện ích mở rộng sẽ tự động chèn vào tất cả các trang

<a id="supported-commands"></a>

## Các lệnh được hỗ trợ

| Lệnh | Mô tả |
|---------|-------------|
| `getActiveTab` | Nhận thông tin tab đang hoạt động (id, url, tiêu đề) |
| `getAllFrames` | Liệt kê tất cả các khung trong tab đang hoạt động |
| `readAllFramesDOM` | Thu thập các yếu tố tương tác từ tất cả các khung hình |
| `findElement` | Tìm phần tử đơn bằng bộ chọn CSS |
| `findElements` | Tìm nhiều phần tử bằng bộ chọn CSS |
| `getClickTarget` | Nhận điểm trung tâm của phần tử để nhắm mục tiêu theo lượt nhấp |
| `getElementAttributes` | Nhận tất cả các thuộc tính của một phần tử |

<a id="provenance"></a>

## Xuất xứ

Được điều chỉnh từ nguồn tiện ích mở rộng Chrome của kho lưu trữ đã loại bỏ các phương thức hành động DOM.
