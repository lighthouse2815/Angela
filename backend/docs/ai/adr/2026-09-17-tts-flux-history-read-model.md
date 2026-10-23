<a id="tts-flux-history-aggregation"></a>

# Tổng hợp lịch sử TTS Flux

Trạng thái: đã chấp nhận

<a id="decision"></a>

## Phán quyết

Điểm cuối lịch sử hiện tại kết hợp các mục ghi nợ TTS với cùng một `turnId`. Nó trả về mục mới nhất và tổng của nhóm trước khi phân trang.

Cuộc trò chuyện hiện tại chuyển ID chuyển qua REST hoặc truyền dữ liệu liên tục TTS sang siêu dữ liệu thanh toán. Sổ cái vẫn không thay đổi. Các loại giao dịch khác vẫn là hồ sơ cá nhân.

<a id="boundaries"></a>

## Phạm vi trách nhiệm

```text
TTS request -> metadata.turnId -> flux_transaction
Flux history -> group by turnId -> ordinary history record
```

Thay đổi này không thay đổi ngưỡng đồng hồ, quyền sở hữu nợ hoặc thời gian tính phí.
