<a id="json-field-documentation"></a>

### **Tài liệu hiện trường JSON**

JSON Tài liệu hiện trường của `SatoriEvent`

* **Cấp độ gốc**

| Đường dẫn | Loại | Mô tả |
| --- | --- | --- |
| `self_id` | Chuỗi | ID (số QQ) duy nhất của bot nhận sự kiện. |
| `platform` | Chuỗi | Tên nền tảng (ví dụ: `onebot`). |
| `timestamp` | Số | Dấu thời gian Unix (ms) khi sự kiện được tạo. |
| `type` | Chuỗi | Danh mục sự kiện chung (ví dụ: `message-created`). |
| `subtype` | Chuỗi | Danh mục phụ của sự kiện (ví dụ: `group`). |
| `subsubtype` | Chuỗi | Phân loại sâu hơn (ví dụ: `group`). |
| `id` | Số nguyên | Trình tự nội bộ ID để xử lý sự kiện. |
| `sn` | Số nguyên | Số sê-ri cho sự kiện. |

* **Đối tượng tin nhắn**

| Đường dẫn | Loại | Mô tả |
| --- | --- | --- |
| `message` | Đối tượng | Vùng chứa chi tiết tin nhắn được tiêu chuẩn hóa. |
| `message.message_id` | Chuỗi | Mã định danh duy nhất cho tin nhắn cụ thể này. |
| `message.content` | Chuỗi | Nội dung văn bản đơn giản của tin nhắn. |

* **Người dùng & Thành viên**

| Đường dẫn | Loại | Mô tả |
| --- | --- | --- |
| `user` | Đối tượng | Thông tin tiêu chuẩn về người gửi tin nhắn. |
| `user.id` | Chuỗi | ID duy nhất của người gửi. |
| `user.name` | Chuỗi | Hiển thị tên người gửi. |
| `user.avatar` | Chuỗi | URL thành ảnh đại diện của người gửi. |
| `member` | Đối tượng | Thông tin thành viên theo ngữ cảnh cụ thể (ví dụ: thành viên nhóm). |
| `member.nick` | Chuỗi | nickname/card của người dùng trong nhóm cụ thể này. |
| `member.roles` | Mảng | Danh sách các vai trò được gán cho người dùng (ví dụ: `member`). |

* **Bối cảnh (Guild/Group)**

| Đường dẫn | Loại | Mô tả |
| --- | --- | --- |
| `guild` | Đối tượng | Thông tin về guild/group. |
| `guild.id` | Chuỗi | ID độc đáo của group/guild. |
| `channel` | Đối tượng | Thông tin về kênh (thường giống với bang hội trong các nhóm QQ). |
| `channel.type` | Số nguyên | Phân loại loại kênh. |

* **Phiên bản Bot (`login`)**

| Đường dẫn | Loại | Mô tả |
| --- | --- | --- |
| `login` | Đối tượng | Thông tin về phiên bản bot đang xử lý sự kiện này. |
| `login.user` | Đối tượng | Thông tin chi tiết về người dùng của bot (Tên, Hình đại diện, ID). |
| `login.status` | Số nguyên | Trạng thái kết nối (1 = Trực tuyến). |
| `login.features` | Mảng | Danh sách các tính năng API được hỗ trợ (ví dụ: `message.create`). |
| `login.adapter` | Chuỗi | Giao thức bộ điều hợp đang được sử dụng (`onebot`). |

<a id="optional-raw-data-from-adapter"></a>

### [Tùy chọn] dữ liệu thô từ bộ chuyển đổi

ví dụ. onebot

* **Dữ liệu OneBot (`_data`)** *Tải trọng thô từ bộ chuyển đổi OneBot*

| Đường dẫn | Loại | Mô tả |
| --- | --- | --- |
| `_data.message_type` | Chuỗi | Loại thông báo (ví dụ: `group`, `private`). |
| `_data.sub_type` | Chuỗi | Loại phụ (ví dụ: `normal`, `anonymous`). |
| `_data.message_id` | Số nguyên | Thông báo ID dưới dạng số nguyên (tiêu chuẩn OneBot). |
| `_data.real_id` | Số nguyên | Thông điệp thực ID từ giao thức. |
| `_data.sender` | Đối tượng | Chi tiết người gửi cụ thể theo định dạng OneBot. |
| `_data.sender.card` | Chuỗi | Nhóm người gửi card/nickname. |
| `_data.raw_message` | Chuỗi | Chuỗi thô chưa được định dạng của tin nhắn. |
| `_data.message` | Mảng | Mảng phân đoạn tin nhắn (Văn bản, Hình ảnh, Khuôn mặt, v.v.). |
| `_data.group_id` | Số nguyên | Số ID của nhóm. |
| `_data.group_name` | Chuỗi | Tên của nhóm. |

* **Dữ liệu thô giao thức (`_data.raw`)** *Dữ liệu giao thức cấp thấp nội bộ (NTQQ/Lagrange)*

| Đường dẫn | Loại | Mô tả |
| --- | --- | --- |
| `_data.raw.msgId` | Chuỗi | Thông báo cấp độ giao thức ID. |
| `_data.raw.msgSeq` | Chuỗi | Số thứ tự tin nhắn. |
| `_data.raw.elements` | Mảng | Các yếu tố đa phương tiện chi tiết (văn bản, khuôn mặt, hình ảnh). |
| `_data.raw.senderUin` | Chuỗi | Số nội bộ người dùng của người gửi (QQ). |
| `_data.raw.peerUin` | Chuỗi | Số nội bộ của người dùng Receiver/Group. |
