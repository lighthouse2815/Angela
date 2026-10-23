<a id="technical-art-visual-workflow"></a>

# Nghệ thuật kỹ thuật Quy trình làm việc trực quan

Quy trình công việc này tồn tại cho renderer và tác phẩm Nghệ thuật kỹ thuật trong đó phán đoán trực quan là một phần của tính chính xác. Nó được viết riêng cho Godot stage runtime.

<a id="required-evidence"></a>

## Bằng chứng bắt buộc

Mọi thay đổi đối với renderer đều cần bằng chứng có thể so sánh được trước khi có thể được chấp nhận:

1. Bằng chứng tham khảo. Sử dụng ảnh chụp màn hình, ảnh chụp Blender, tài liệu tham khảo về trình đổ bóng hoặc ví dụ về trò chơi được vận chuyển. Ghi lại máy ảnh, mô hình, trạng thái tính năng hoạt động và thuộc tính trực quan mà tham chiếu nhằm chứng minh.
2. Before/after Angela bằng chứng. thu nhận dữ liệu đầu ra hiện tại của Angela trước và sau khi thay đổi renderer khi câu hỏi phụ thuộc vào sự khác biệt về hình ảnh.
3. Bằng chứng đường ống. thu nhận dữ liệu các giai đoạn kết xuất trung gian có liên quan khi gỡ lỗi hoạt động của bộ tổng hợp hoặc đường dẫn vật liệu. Không chỉ dựa vào bộ nhớ hoặc khung nhìn trực tiếp được kiểm tra thủ công.

Lệnh kết xuất render-stage hiện tại là:

```powershell
pnpm -F @angela/stage-tamagotchi-godot dump:render-stages
```

Để kiểm tra hình dạng vành hoặc ánh sáng cạnh, hãy ưu tiên cài đặt trước của máy ảnh thân trên:

```powershell
pnpm -F @angela/stage-tamagotchi-godot dump:render-stages:upper-body
```

Kết xuất là từ đầu đến cuối: nó khởi chạy stage chính thực sự, tải hình đại diện được theo dõi thông qua đường dẫn WebSocket host và chụp khu vực máy khách cửa sổ Godot hiển thị. Việc đọc lại kết cấu khung nhìn bên trong không được chấp nhận làm bằng chứng renderer cuối cùng vì nó có thể bỏ qua chuyển đổi hiển thị cuối cùng và tạo ra PNG tối hơn, độ tương phản cao hơn cửa sổ thực tế.

Lệnh viết:

```text
engines/stage-tamagotchi-godot/artifacts/render-stages/
```

Biến thể phần thân trên viết:

```text
engines/stage-tamagotchi-godot/artifacts/render-stages-upper-body/
```

Đầu ra mặc định là:

- `scene-copy.png`
- `avatar-mask.png`
- `avatar-edge-mask.png`
- `after-avatar-edge-light.png`
- `after-avatar-glow.png`
- `final.png`
- `final-edge-off.png`

Đây là kết quả chẩn đoán, không phải là đường cơ sở được chấp nhận. Sử dụng chúng để xác định vị trí stage phân kỳ đầu tiên trước khi thay đổi stage tiếp theo.

Quy trình làm việc này cố ý chưa xác định đường cơ sở trực quan cho toàn dự án. Nếu đường cơ sở trực quan được thêm vào sau, chúng cần có thiết kế riêng cho phạm vi, quyền sở hữu mẫu kiểm thử, chấp nhận tính năng cụ thể và chính sách cập nhật.

<a id="work-order"></a>

## Lệnh làm việc

1. Xác định câu hỏi trực quan. Trước tiên, hãy viết câu hỏi hẹp: tính chẵn lẻ của ánh xạ màu, ánh sáng chỉ dành cho hình đại diện, hình dạng ánh sáng viền, chiều rộng đường viền, sắp xếp alpha hoặc thuộc tính cụ thể khác. Đừng bắt đầu từ một ý tưởng thực hiện.

2. Chọn tham chiếu và mẫu kiểm thử. Sử dụng mẫu kiểm thử được theo dõi khi kết quả vẫn có thể được lặp lại từ kho lưu trữ. Chỉ sử dụng mẫu kiểm thử riêng cho nghiên cứu tạm thời và ghi lại đường dẫn cũng như giới hạn trong ghi chú làm việc.

3. thu nhận dữ liệu đầu ra hiện tại. Kết xuất các giai đoạn kết xuất có liên quan và giữ đường dẫn artifact trong ghi chú làm việc hoặc ngữ cảnh PR. Đối với các nhà tái cấu trúc, đây là hành vi phải duy trì ổn định về mặt trực quan.

4. Thực hiện một thay đổi renderer. Giữ thay đổi phù hợp với một quy trình stage hoặc một quyết định của chủ sở hữu material/source. Không nên chấp nhận một bộ tái cấu trúc và một hiệu ứng hình ảnh mới trong cùng một so sánh trừ khi có lý do rõ ràng.

5. Hãy so sánh trước khi phán xét. Kết xuất cảnh tương tự sau khi thay đổi và so sánh artifact có liên quan trước khi thay đổi lại mã.

6. Phân loại sự khác biệt. Đặt phần chênh lệch thành một bucket trước khi sửa:
   - thay đổi trực quan dự kiến
   - sự trôi dạt dự kiến ​​gây ra bởi sự thay đổi dự định
   - hồi quy trong một thuộc tính hình ảnh không liên quan
   - thu nhận dữ liệu mất ổn định
   - mẫu kiểm thử hoặc máy ảnh không khớp

7. Ghi lại sự chấp nhận Nếu hình ảnh thay đổi có chủ ý, hãy ghi lại lý do và giữ nguyên đường dẫn artifact. Nếu việc thay đổi mã được cho là để duy trì hành vi, hãy so sánh before/after artifact và ghi lại kết quả.

<a id="debug-rules"></a>

## Quy tắc gỡ lỗi

- Bắt đầu từ artifact được kết xuất, không phải từ dự đoán của trình đổ bóng.
- Sử dụng đầu ra cửa sổ cuối cùng để chấp nhận trực quan. Việc đọc lại `GetViewport().GetTexture()` chỉ là chẩn đoán trung gian và không được trở thành bằng chứng cuối cùng được chấp nhận cho các đánh giá về màu sắc, độ tương phản, độ sáng, ánh sáng viền hoặc ánh xạ tông màu.
- So sánh cùng một mô hình, máy ảnh, kích thước khung nhìn và thời gian khung hình.
- Đối với công việc đường ống, hãy xác định stage phân kỳ đầu tiên trước khi sửa đổi stage tiếp theo.
- Đối với công việc của bộ tổng hợp dựa trên tham chiếu, hãy so sánh đầu ra stage tham chiếu và đầu ra Godot stage cạnh nhau. Không chấp nhận hình ảnh cuối cùng cho đến khi mặt nạ trung gian và hình ảnh sau stage giải thích được sự khác biệt cuối cùng.
- Đối với công việc vật liệu, hãy kiểm tra các thông số vật liệu đã nhập trước khi thay đổi trình đổ bóng sau xử lý.
- Đối với các vấn đề về màu sắc, tách màu cảnh, mặt nạ nguồn, tổng hợp ánh sáng và ánh xạ màu cuối cùng. Đừng hợp nhất những lời giải thích này thành một nguyên nhân.
- Nếu ba bản sửa lỗi cục bộ không giải thích được sự khác biệt về hình ảnh, hãy dừng và kiểm tra lại quyền sở hữu đường dẫn mô hình trước khi thêm một bản vá khác.

<a id="gate-for-edge-light-work"></a>

## cổng kiểm tra dành cho công việc nhẹ nhàng ở cạnh

Công việc ánh sáng ở cạnh chỉ có thể bắt đầu sau khi những điều này là đúng:

1. Render-stage artifact hiện tại tồn tại và đã được kiểm tra thủ công.
2. Các thay đổi chỉ dành cho bộ tái cấu trúc có đầu ra before/after phù hợp cho các chế độ xem có liên quan.
3. Trường hợp tham chiếu có camera được ghi lại và so sánh enabled/disabled.
4. Việc triển khai ánh sáng cạnh theo kế hoạch nằm sau ranh giới chuyển đổi hoặc stage nên vẫn có thể ghi lại và so sánh đầu ra không có tính năng.
5. Các giai đoạn tham chiếu của Xiaoer và các giai đoạn kết xuất của Godot đã bị loại bỏ vì cùng một câu hỏi trực quan: mặt nạ cạnh, hình ảnh sau cạnh và so sánh enabled/disabled cuối cùng.

Điều này tránh lặp lại chế độ thất bại trước đó: thay đổi kiến ​​trúc kết xuất và hiệu ứng hình ảnh mới cùng lúc mà không chứng minh được tính tương đương của cùng một cảnh.
