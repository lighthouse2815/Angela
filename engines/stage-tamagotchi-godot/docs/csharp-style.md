<a id="stage-tamagotchi-godot-c-style"></a>

# stage Tamagotchi Godot C# Phong cách

Đây là tài liệu tham khảo về định dạng và đặt tên phụ.

Đọc `docs/csharp-development-method.md` trước để biết hướng dẫn về cấu trúc, phân lớp và cách sử dụng tính năng. Chỉ sử dụng tệp này cho kiểu mã cấp thấp.

Cấu hình này chỉ áp dụng cho `engines/stage-tamagotchi-godot`.

Đây là đường cơ sở kiểu mã C# đơn giản cho công cụ Godot này. Nó không xác định cấu trúc runtime, chính sách có thể vô hiệu, chính sách không gian tên hoặc các quy tắc kiến ​​trúc rộng hơn.

<a id="baseline"></a>

## Đường cơ sở

- Microsoft: Quy ước mã C# phổ biến
- Microsoft: Tùy chọn quy tắc kiểu mã .NET
- Godot: Hướng dẫn về phong cách C#

<a id="rules"></a>

## Quy tắc

- Sử dụng 4 khoảng trắng.
- Sử dụng kết thúc dòng LF.
- Sử dụng UTF-8.
- Giữ dòng ở 100 cột khi thực tế.
- Sử dụng niềng răng Allman.
- Đặt mục đích sử dụng `System.*` trước, sau đó sắp xếp phần còn lại theo thứ tự bảng chữ cái.
- Ưu tiên các loại từ khóa C# như `string`, `int` và `bool`.
- Chỉ sử dụng `var` khi phía bên phải hiển thị loại rõ ràng.
- Sử dụng `PascalCase` cho các loại và thành viên.
- Sử dụng `camelCase` cho cục bộ và tham số.
- Sử dụng `_camelCase` cho các trường riêng tư.
- Xóa các lệnh `using` không sử dụng.
- Xóa nhận xét mẫu Godot khỏi các tệp bị chạm.
- Xóa các phương thức vòng đời trống khỏi các tệp đã chạm trừ khi chúng được cố ý giữ lại.
- Giữ các chỉ thị `using` rõ ràng. Không cho phép sử dụng ngầm cho công cụ này.

<a id="out-of-scope"></a>

## Ngoài phạm vi

Đây là những cố ý không được quyết định ở đây:

- Phương pháp thiết kế và phân lớp runtime
- Các loại tham chiếu có thể rỗng
- Chiến lược không gian tên
- `record`, `required` và các hàm tạo chính
- DTO hoặc quy tắc kiểu dành riêng cho người trợ giúp

<a id="verification"></a>

## Xác minh

Khi thay đổi tệp C# hoặc `.editorconfig` cục bộ, hãy xác minh từ thư mục công cụ bằng:

```powershell
dotnet format --verify-no-changes
```
