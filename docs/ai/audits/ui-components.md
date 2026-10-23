<a id="ui-component-audit"></a>

# Kiểm tra thành phần UI

Ảnh chụp: 2026-10-08. Base: b8b508014 trên origin/main. Ảnh chụp nhanh này loại trừ những thay đổi không liên quan khỏi cây làm việc ban đầu.

<a id="scope-and-method"></a>

## Phạm vi và phương pháp

Khoảng không quảng cáo chứa mọi nguồn Vue SFC được tìm thấy bởi `rg --files apps packages`, ngoại trừ các câu chuyện, người trợ giúp câu chuyện, tài sản công cộng và đầu ra bản dựng. Các trang và mục ứng dụng có vai trò riêng biệt trong CSV. Vue SFC không tự động đại diện cho một thành phần có thể tái sử dụng. Tập lệnh phân tích cú pháp nhập và xuất gói bằng TypeScript. Nó giải quyết vấn đề nhập khẩu tương đối, xuất khẩu workspace và tái xuất thùng. Đưa tin trực tiếp có nghĩa là câu chuyện Lịch sử hiển thị một thành phần đã nhập thông qua thẻ mẫu tĩnh. Phạm vi tổng hợp tuân theo quá trình nhập thành phần được kết xuất. Nó chỉ ra đường dẫn nhập thông qua một câu chuyện chứ không phải việc thực thi mọi nhánh có điều kiện. Bí danh chưa được giải quyết, tự động nhập, nhập vùng tên, thành phần động và chức năng kết xuất cần kiểm tra thủ công. CSV ghi lại các lần nhập Vue tĩnh chưa được giải quyết. Kiểm soát thô xác định các ứng viên kiểm toán. Đầu vào tệp ẩn, thẻ radio tùy chỉnh và trường số có thể kéo có thể yêu cầu điều khiển native. Không nhập thành phần chia sẻ nào không chứng minh được sự trùng lặp. Trình bao bọc cục bộ có thể cung cấp các thành phần được chia sẻ thông qua thành phần.

<a id="story-coverage"></a>

## Nội dung câu chuyện

| Trọn gói | Thành phần Vue | Trực tiếp trước | Trực tiếp sau | Chỉ được sáng tác sau | Không có đường dẫn câu chuyện sau |
| --- | ---: | ---: | ---: | ---: | ---: |
| `shared/ui/primitives/` | 55 | 36 | 52 | 2 | 1 |
| `shared/ui/stage/src/components/` | 137 | 40 | 48 | 16 | 73 |

Lô này bổ sung thêm 15 tầng cho 24 thành phần chưa được phát hiện trước đó. Những câu chuyện hiện có đã đề cập đến những vấn đề công khai nguyên thủy khác. `BasicInputFile` và `SelectOption` vẫn bao gồm các ví dụ thông qua các thành phần gốc của chúng. `ComboboxOption` vẫn chưa được khám phá. Nó được xuất nhưng không có người gọi kho lưu trữ. Khóa chèn chuỗi của nó yêu cầu hợp đồng gốc cũ. Xem lại bản xuất đó trước khi thêm phần trưng bày hoặc xóa nó. Lô này không làm thay đổi API công khai.

<a id="application-and-shared-ui-adoption"></a>

## Ứng dụng và chia sẻ việc áp dụng UI

| Khu vực | SFC nguồn | Kết xuất nhập thành phần được chia sẻ | Tệp có điều khiển thô |
| --- | ---: | ---: | ---: |
| `apps/web/` | 26 | 16 | 7 |
| `../dev-in-future/apps/stage-pocket/` | 23 | 13 | 5 |
| `apps/desktop/` | 91 | 50 | 14 |
| `apps/desktop-kirie/` | 76 | 42 | 13 |
| `shared/ui/layouts/` | 33 | 12 | 5 |
| `shared/ui/pages/` | 129 | 105 | 37 |
| `shared/ui/stage/` | 153 | 82 | 40 |

Ứng dụng Kirie lặp lại một số triển khai điều khiển desktop. Hãy coi những điều này như một phạm vi di chuyển riêng biệt.

<a id="reviewed-consolidation-candidates"></a>

## Đã xem xét các ứng viên hợp nhất

| Nguồn | Tìm kiếm | Hướng |
| --- | --- | --- |
| [shared/ui/layouts/src/components/Widgets/ChatToolbarButton.vue:12](../../../shared/ui/layouts/src/components/Widgets/ChatToolbarButton.vue#L12) | Nút cục bộ sở hữu kích thước, bề mặt, trạng thái hoạt động, tiêu điểm và phản hồi khi nhấn. | Compose GhostButton hoặc BasicButton. Bảo toàn bề mặt hoạt động và hợp đồng khe cắm của nó. |
| [apps/desktop/src/renderer/components/chat-window/chat-speech-mute-button.vue:22](../../../apps/desktop/src/renderer/components/chat-window/chat-speech-mute-button.vue#L22) | Nút biểu tượng native sao chép hành vi nhấn và tiêu điểm được chia sẻ. | Giữ trạng thái lời nói cục bộ. Sử dụng GhostButton hoặc IconButton để điều khiển. |
| [shared/ui/stage/src/components/scenarios/chat/components/image-attachment-preview.vue:14](../../../shared/ui/stage/src/components/scenarios/chat/components/image-attachment-preview.vue#L14) | Nút xóa native sở hữu bề mặt lớp phủ và kiểu tương tác. | Sử dụng IconButton. Giữ nguyên lớp phủ hình tròn, tên có thể truy cập và ngừng truyền bá nhấp chuột. |
| [shared/ui/stage/src/components/layouts/page-header.vue:82](../../../shared/ui/stage/src/components/layouts/page-header.vue#L82) | Hành động quay lại sử dụng nút native mà không có nhãn có thể truy cập riêng. | Sử dụng IconButton và cung cấp tên có thể truy cập được bản địa hóa. |
| [shared/ui/stage/src/components/scenarios/providers/provider-validation-alerts.vue:34](../../../shared/ui/stage/src/components/scenarios/providers/provider-validation-alerts.vue#L34) | Hành động xác thực sử dụng nhiều nút native. | Sử dụng Nút hoặc GhostButton. Giữ lại trạng thái xác nhận và xử lý hành động. |
| [shared/ui/pages/src/pages/settings/providers/index.vue:223](../../../shared/ui/pages/src/pages/settings/providers/index.vue#L223) | Điều khiển danh mục và bộ lọc sử dụng các nút native. | So sánh SelectTab và GhostButton. Giữ nguyên trạng thái đã chọn và điều hướng. |
| [../dev-in-future/apps/stage-pocket/src/components/websocket-status-button.vue:59](../../../apps/stage-pocket/src/components/websocket-status-button.vue#L59) | Trạng thái kết nối sở hữu bề mặt tùy chỉnh và nút native. | Xây dựng bề mặt trạng thái trên BasicButton. Giữ nguyên nhãn kết nối và màu trạng thái. |
| [shared/ui/stage/src/components/scenarios/chat/components/tool-call-shell.vue:33](../../../shared/ui/stage/src/components/scenarios/chat/components/tool-call-shell.vue#L33) | Nút kích hoạt cục bộ nằm bên trong Có thể thu gọn được chia sẻ. | Sử dụng GhostButton hoặc BasicButton. Giữ hợp đồng đóng mở. |
| [shared/ui/stage/src/components/misc/steppers/steppers.vue:125](../../../shared/ui/stage/src/components/misc/steppers/steppers.vue#L125) | Các thao tác bước sử dụng các nút native. | So sánh Button và GhostButton về bề mặt thao tác. |
| [shared/ui/stage/src/components/data-pane/property-number.vue:159](../../../shared/ui/stage/src/components/data-pane/property-number.vue#L159) | Điều khiển số bao gồm hành vi kéo và con trỏ tùy chỉnh. | Giữ lại sự tương tác tên miền. Chỉ đánh giá Đầu vào được chia sẻ sau khi so sánh hành vi. |
| [shared/ui/stage/src/components/menu/radio-card-many-select.vue:164](../../../shared/ui/stage/src/components/menu/radio-card-many-select.vue#L164) | Thẻ lựa chọn sở hữu thành phần tùy chỉnh của họ. | So sánh hợp đồng lựa chọn Radio và Reka. Người thay thế trực tiếp cần xác minh hành vi. |
| [shared/ui/stage/src/components/data-pane/color-picker.vue:446](../../../shared/ui/stage/src/components/data-pane/color-picker.vue#L446) | Trình chỉnh sửa màu kết hợp bộ chọn native và đầu vào kênh. | Đánh giá lựa chọn và đầu vào. Giữ nguyên chuyển đổi màu sắc và chỉnh sửa kênh. |

Đây là những ứng viên được xem xét nguồn. Quá trình kiểm tra này không di chuyển hành vi runtime của họ.

<a id="shared-business-components-without-a-direct-story"></a>

## Các thành phần kinh doanh được chia sẻ mà không có câu chuyện trực tiếp

Bảng sau chứa mọi thành phần stage-ui không có phạm vi phủ sóng trực tiếp. Các mục đã soạn đã có đường dẫn nhập câu chuyện.

| Thành phần | Trạng thái |
| --- | --- |
| [animations/Replayable.vue](../../../shared/ui/stage/src/components/animations/Replayable.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [auth/SignInPanel.vue](../../../shared/ui/stage/src/components/auth/SignInPanel.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [data-pane/color-picker.vue](../../../shared/ui/stage/src/components/data-pane/color-picker.vue) | Sáng tác trong một câu chuyện hiện có |
| [data-pane/container.vue](../../../shared/ui/stage/src/components/data-pane/container.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [data-pane/pane.vue](../../../shared/ui/stage/src/components/data-pane/pane.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [data-pane/property-point.vue](../../../shared/ui/stage/src/components/data-pane/property-point.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [gestures/swipeable.vue](../../../shared/ui/stage/src/components/gestures/swipeable.vue) | Sáng tác trong một câu chuyện hiện có |
| [layouts/backgrounds/background-gradient-overlay.vue](../../../shared/ui/stage/src/components/layouts/backgrounds/background-gradient-overlay.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [layouts/page-header.vue](../../../shared/ui/stage/src/components/layouts/page-header.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [layouts/splitpanes/pane-area.vue](../../../shared/ui/stage/src/components/layouts/splitpanes/pane-area.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [menu/radio-card-many-select.vue](../../../shared/ui/stage/src/components/menu/radio-card-many-select.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [misc/character-switcher-drawer.vue](../../../shared/ui/stage/src/components/misc/character-switcher-drawer.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [misc/profile-switcher-popover.vue](../../../shared/ui/stage/src/components/misc/profile-switcher-popover.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [modules/GamingFactorio.vue](../../../shared/ui/stage/src/components/modules/GamingFactorio.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [modules/GamingMinecraft.vue](../../../shared/ui/stage/src/components/modules/GamingMinecraft.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [modules/GamingModuleSettings.vue](../../../shared/ui/stage/src/components/modules/GamingModuleSettings.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [modules/MessagingDiscord.vue](../../../shared/ui/stage/src/components/modules/MessagingDiscord.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [modules/WebSearch.vue](../../../shared/ui/stage/src/components/modules/WebSearch.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [modules/X.vue](../../../shared/ui/stage/src/components/modules/X.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [modules/stickers.vue](../../../shared/ui/stage/src/components/modules/stickers.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/about/about-content.vue](../../../shared/ui/stage/src/components/scenarios/about/about-content.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/chat/JournalPreviewModal.vue](../../../shared/ui/stage/src/components/scenarios/chat/JournalPreviewModal.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/chat/components/action-menu/index.vue](../../../shared/ui/stage/src/components/scenarios/chat/components/action-menu/index.vue) | Sáng tác trong một câu chuyện hiện có |
| [scenarios/chat/components/assistant-item.vue](../../../shared/ui/stage/src/components/scenarios/chat/components/assistant-item.vue) | Sáng tác trong một câu chuyện hiện có |
| [scenarios/chat/components/chat-history-scroll-container.vue](../../../shared/ui/stage/src/components/scenarios/chat/components/chat-history-scroll-container.vue) | Sáng tác trong một câu chuyện hiện có |
| [scenarios/chat/components/error-item.vue](../../../shared/ui/stage/src/components/scenarios/chat/components/error-item.vue) | Sáng tác trong một câu chuyện hiện có |
| [scenarios/chat/components/history-message-frame.vue](../../../shared/ui/stage/src/components/scenarios/chat/components/history-message-frame.vue) | Sáng tác trong một câu chuyện hiện có |
| [scenarios/chat/components/history-time-separator.vue](../../../shared/ui/stage/src/components/scenarios/chat/components/history-time-separator.vue) | Sáng tác trong một câu chuyện hiện có |
| [scenarios/chat/components/image-attachment-preview.vue](../../../shared/ui/stage/src/components/scenarios/chat/components/image-attachment-preview.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/chat/components/reply-preview.vue](../../../shared/ui/stage/src/components/scenarios/chat/components/reply-preview.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/chat/components/reply-quote.vue](../../../shared/ui/stage/src/components/scenarios/chat/components/reply-quote.vue) | Sáng tác trong một câu chuyện hiện có |
| [scenarios/chat/components/response-citations.vue](../../../shared/ui/stage/src/components/scenarios/chat/components/response-citations.vue) | Sáng tác trong một câu chuyện hiện có |
| [scenarios/chat/components/response-part.vue](../../../shared/ui/stage/src/components/scenarios/chat/components/response-part.vue) | Sáng tác trong một câu chuyện hiện có |
| [scenarios/chat/components/sessions-dialog.vue](../../../shared/ui/stage/src/components/scenarios/chat/components/sessions-dialog.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/chat/components/sessions-drawer.vue](../../../shared/ui/stage/src/components/scenarios/chat/components/sessions-drawer.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/chat/components/sessions-list.vue](../../../shared/ui/stage/src/components/scenarios/chat/components/sessions-list.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/chat/components/sticker.vue](../../../shared/ui/stage/src/components/scenarios/chat/components/sticker.vue) | Sáng tác trong một câu chuyện hiện có |
| [scenarios/chat/components/tool-call-block.vue](../../../shared/ui/stage/src/components/scenarios/chat/components/tool-call-block.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/chat/components/user-item.vue](../../../shared/ui/stage/src/components/scenarios/chat/components/user-item.vue) | Sáng tác trong một câu chuyện hiện có |
| [scenarios/chat/components/voice-drafts.vue](../../../shared/ui/stage/src/components/scenarios/chat/components/voice-drafts.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/chat/components/voice-message-controls.vue](../../../shared/ui/stage/src/components/scenarios/chat/components/voice-message-controls.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/chat/components/voice-message-preview.vue](../../../shared/ui/stage/src/components/scenarios/chat/components/voice-message-preview.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/connection/settings/index.vue](../../../shared/ui/stage/src/components/scenarios/connection/settings/index.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/dialogs/about.vue](../../../shared/ui/stage/src/components/scenarios/dialogs/about.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/dialogs/about/about-dialog.vue](../../../shared/ui/stage/src/components/scenarios/dialogs/about/about-dialog.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/dialogs/audio-input/hearing-config-dialog.vue](../../../shared/ui/stage/src/components/scenarios/dialogs/audio-input/hearing-config-dialog.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/dialogs/audio-input/hearing-config.vue](../../../shared/ui/stage/src/components/scenarios/dialogs/audio-input/hearing-config.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/dialogs/background-picker/background-picker-dialog.vue](../../../shared/ui/stage/src/components/scenarios/dialogs/background-picker/background-picker-dialog.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/dialogs/background-picker/background-picker.vue](../../../shared/ui/stage/src/components/scenarios/dialogs/background-picker/background-picker.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/dialogs/bug-report/bug-report-dialog.vue](../../../shared/ui/stage/src/components/scenarios/dialogs/bug-report/bug-report-dialog.vue) | Sáng tác trong một câu chuyện hiện có |
| [scenarios/dialogs/bug-report/bug-report-form.vue](../../../shared/ui/stage/src/components/scenarios/dialogs/bug-report/bug-report-form.vue) | Sáng tác trong một câu chuyện hiện có |
| [scenarios/dialogs/model-selector/model-selector-dialog.vue](../../../shared/ui/stage/src/components/scenarios/dialogs/model-selector/model-selector-dialog.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/dialogs/model-selector/model-selector.vue](../../../shared/ui/stage/src/components/scenarios/dialogs/model-selector/model-selector.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/dialogs/model-selector/reports/live2d/content.vue](../../../shared/ui/stage/src/components/scenarios/dialogs/model-selector/reports/live2d/content.vue) | Sáng tác trong một câu chuyện hiện có |
| [scenarios/dialogs/model-selector/tachieReportModal.vue](../../../shared/ui/stage/src/components/scenarios/dialogs/model-selector/tachieReportModal.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/dialogs/onboarding/onboarding-dialog.vue](../../../shared/ui/stage/src/components/scenarios/dialogs/onboarding/onboarding-dialog.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/dialogs/onboarding/onboarding.vue](../../../shared/ui/stage/src/components/scenarios/dialogs/onboarding/onboarding.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/dialogs/onboarding/step-analytics-notice.vue](../../../shared/ui/stage/src/components/scenarios/dialogs/onboarding/step-analytics-notice.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/dialogs/onboarding/step-model-selection.vue](../../../shared/ui/stage/src/components/scenarios/dialogs/onboarding/step-model-selection.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/dialogs/onboarding/step-provider-configuration.vue](../../../shared/ui/stage/src/components/scenarios/dialogs/onboarding/step-provider-configuration.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/dialogs/onboarding/step-provider-selection.vue](../../../shared/ui/stage/src/components/scenarios/dialogs/onboarding/step-provider-selection.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/dialogs/onboarding/step-welcome.vue](../../../shared/ui/stage/src/components/scenarios/dialogs/onboarding/step-welcome.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/dialogs/validation-details/provider-validation-details-dialog.vue](../../../shared/ui/stage/src/components/scenarios/dialogs/validation-details/provider-validation-details-dialog.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/hologram/holo-coupon.vue](../../../shared/ui/stage/src/components/scenarios/hologram/holo-coupon.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/providers/provider-download-model.vue](../../../shared/ui/stage/src/components/scenarios/providers/provider-download-model.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/providers/provider-generation-settings.vue](../../../shared/ui/stage/src/components/scenarios/providers/provider-generation-settings.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/providers/provider-validation-alerts.vue](../../../shared/ui/stage/src/components/scenarios/providers/provider-validation-alerts.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/providers/speech-playground-openai-compatible.vue](../../../shared/ui/stage/src/components/scenarios/providers/speech-playground-openai-compatible.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/providers/speech-playground.vue](../../../shared/ui/stage/src/components/scenarios/providers/speech-playground.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/providers/speech-provider-settings.vue](../../../shared/ui/stage/src/components/scenarios/providers/speech-provider-settings.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/providers/transcription-playground.vue](../../../shared/ui/stage/src/components/scenarios/providers/transcription-playground.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/providers/transcription-provider-settings.vue](../../../shared/ui/stage/src/components/scenarios/providers/transcription-provider-settings.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/providers/voicevox-family-settings.vue](../../../shared/ui/stage/src/components/scenarios/providers/voicevox-family-settings.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/settings/ModelCacheManager.vue](../../../shared/ui/stage/src/components/scenarios/settings/ModelCacheManager.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/settings/model-settings/godot.vue](../../../shared/ui/stage/src/components/scenarios/settings/model-settings/godot.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/settings/model-settings/index.vue](../../../shared/ui/stage/src/components/scenarios/settings/model-settings/index.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/settings/model-settings/live2d.vue](../../../shared/ui/stage/src/components/scenarios/settings/model-settings/live2d.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/settings/model-settings/mmd.vue](../../../shared/ui/stage/src/components/scenarios/settings/model-settings/mmd.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/settings/model-settings/panel.vue](../../../shared/ui/stage/src/components/scenarios/settings/model-settings/panel.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/settings/model-settings/preview-stage.vue](../../../shared/ui/stage/src/components/scenarios/settings/model-settings/preview-stage.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/settings/model-settings/spine.vue](../../../shared/ui/stage/src/components/scenarios/settings/model-settings/spine.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/settings/model-settings/tachie.vue](../../../shared/ui/stage/src/components/scenarios/settings/model-settings/tachie.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/settings/model-settings/vrm.vue](../../../shared/ui/stage/src/components/scenarios/settings/model-settings/vrm.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/startup/startup-overlay.vue](../../../shared/ui/stage/src/components/scenarios/startup/startup-overlay.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenarios/status/hearing-status.vue](../../../shared/ui/stage/src/components/scenarios/status/hearing-status.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenes/Stage.vue](../../../shared/ui/stage/src/components/scenes/Stage.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenes/ViewControlSlider.vue](../../../shared/ui/stage/src/components/scenes/ViewControlSlider.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [scenes/stage-render-error.vue](../../../shared/ui/stage/src/components/scenes/stage-render-error.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |
| [widgets/ColorPalette.vue](../../../shared/ui/stage/src/components/widgets/ColorPalette.vue) | Cần kịch bản chuyên dụng và mẫu kiểm thử |

<a id="complete-inventory-and-repeat-command"></a>

## Hoàn thành kiểm kê và lặp lại lệnh

[Kho lưu trữ CSV](./ui-components.csv) chứa tất cả SFC nguồn, tài liệu tham khảo câu chuyện, nội dung nhập được chia sẻ, thành phần cục bộ và vị trí kiểm soát thô. Khoảng không quảng cáo bao gồm các gói kết xuất, màn hình tải, bố cục và ứng dụng mẫu. Lọc các cột đường dẫn và vai trò của nó cho mỗi lần di chuyển.

```sh
node scripts/audit-ui-components.mjs > /tmp/airi-ui-components.json
```

Tạo lại ảnh chụp nhanh sau khi thay đổi thành phần đồng thời. Tập lệnh kiểm tra báo cáo JSON và không sửa đổi các thành phần.

<a id="remaining-work"></a>

## Công việc còn lại

- Thêm mẫu kiểm thử cho những câu chuyện kinh doanh còn lại. Xác thực, nhà cung cấp, mô hình các renderer và cài đặt yêu cầu ranh giới runtime thực của chúng.
- Giải quyết việc xuất ComboboxOption không sử dụng.
- Di chuyển các ứng viên kiểm soát được xem xét trong các thay đổi tập trung. Xác minh hoạt động của bàn phím, màu chủ đề và khu vực truy cập trên thiết bị di động.
- Mở rộng phân tích tĩnh khi các thành phần động hoặc được nhập tự động cần được bao phủ toàn bộ.

<a id="verification"></a>

## Xác minh

Các kiểm tra trong phần này đề cập đến nhánh PR bị cô lập. Kết quả từ lần kiểm tra bẩn ban đầu không phải là bằng chứng chấp nhận PR.

- `pnpm run build:packages`: đạt, 34 nhiệm vụ.
- `pnpm -F @angela/stage-ui typecheck`: đã qua.
- `pnpm typecheck`: đã đạt, 55 nhiệm vụ.
- `pnpm exec eslint <15 new stories> scripts/audit-ui-components.mjs`: đã qua.
- `pnpm lint`: đã vượt qua với các cảnh báo hiện có.
- `pnpm -F @angela/stage-ui exec vitest run`: 188 tệp đã được thông qua. Ba tệp không thành công vì Node native localStorage không khả dụng.
- `NODE_OPTIONS=--no-experimental-webstorage pnpm -F @angela/stage-ui exec vitest run src/stores/onboarding.test.ts src/stores/modules/consciousness-settings.test.ts src/stores/modules/consciousness.test.ts`: tất cả 22 bài kiểm tra thất bại đều đạt.
- `pnpm -F @angela/stage-ui exec vitest run src/components/scenarios/status/status-capsule.browser.test.ts src/components/scenarios/chat/components/scrollable-area.browser.test.ts`: 6 bài kiểm tra đã vượt qua.
- Vishot hiển thị tất cả 15 thành phần câu chuyện có thật trong thư viện trình duyệt dùng một lần. Các biến thể ban đầu đã được chụp và kiểm tra.

Thư viện trình duyệt sử dụng trình bao bọc Câu chuyện và Biến thể. Ảnh chụp màn hình chứng minh trạng thái ban đầu được ghi lại, không phải mọi tương tác hoặc điều hướng Lịch sử.
