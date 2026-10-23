# `@angela/stage-ui-three`

Các thành phần Three.js runtime, store, các composable và chẩn đoán được sử dụng bởi các bề mặt Angela stage.

<a id="what-it-does"></a>

## Nó làm gì

- host gốc ba cảnh được chia sẻ được sử dụng bởi các trang stage.
- Tải, gắn, tái sử dụng và thải bỏ VRM mô hình.
- Cung cấp store mô hình nội bộ của gói để quản lý camera, ánh sáng, môi trường và trạng thái khung nhìn mô hình.
- Cung cấp ba thử nghiệm lần truy cập cụ thể, trình trợ giúp mục tiêu kết xuất và bản xem trước VRM sinh nội dung.
- Hiển thị mô-đun con `trace` cục bộ để chẩn đoán Three/VRM runtime.

<a id="exports"></a>

## Xuất khẩu

- `ThreeScene`: thành phần stage ba mặt chính.
- `useModelStore`: Pinia store cho cấu hình ba cảnh và mô hình.
- `@angela/stage-ui-three/trace`: xe buýt theo dõi sự kiện cục bộ và người trợ giúp chụp nhanh.
- `@angela/stage-ui-three/composables/vrm`: Trình trợ giúp tải và hoạt hình VRM.
- `@angela/stage-ui-three/utils/vrm-preview`: kết xuất xem trước VRM một lần.
- `composables/hit-test` và `composables/render-target`: Trình trợ giúp đọc lại renderer.

<a id="vrm-lifecycle"></a>

## Vòng đời VRM

Quản lý VRM runtime được nêu rõ ràng trong gói này.

- Các ổ đĩa `VRMModel.vue` tải, cam kết và dọn dẹp riêng biệt thay vì dựa vào việc kết nối lại thành phần làm vòng đời chính.
- Các phiên bản VRM tách rời được lưu vào bộ nhớ đệm thông qua `components/Model/vrm-instance-cache.ts` dưới dạng giá trị `ManagedVrmInstance`.
- Các mục trong bộ nhớ đệm được xác định phạm vi theo `scopeKey` và được khớp với `modelSrc` trước khi sử dụng lại.
- Việc ngắt kết nối thành phần có thể lưu phiên bản hiện tại để sử dụng lại.
- Công tắc mô hình xóa phiên bản đang hoạt động và mọi bộ đệm đã tách rời cho phạm vi hiện tại.
- Tải mới chuẩn bị màn hình ngoài VRM tiếp theo, sau đó đưa nó vào cảnh hoạt động khi đã sẵn sàng.

Điều này giúp cho việc kết nối lại thông thường và HMR không bị buộc phải xử lý sâu VRM ngay lập tức, trong khi vẫn khiến các chuyển đổi mô hình mang tính quyết định.

<a id="lip-sync-boundary"></a>

## Ranh giới hát nhép

`ThreeScene` nhận `AudioContext` và nguồn âm thanh hiện tại từ người gọi. Gói không nhập âm thanh stage store.

Trình điều khiển dùng chung tạo ra trọng số AEIOU. Bộ điều hợp VRM ánh xạ các trọng số này thành các biểu thức `aa`, `ee`, `ih`, `oh` và `ou`.

<a id="scene-lifecycle"></a>

## Vòng đời cảnh

`ThreeScene` phối hợp hai tín hiệu sẵn sàng không đồng bộ độc lập trước khi cảnh trở nên tương tác:

- **Tải VRM**: `VRMModel` phát ra `sceneBootstrap` (dữ liệu hình học) sau đó là `loaded` sau khi mô hình được đưa vào hiện trường.
- **Điều khiển ban đầu**: `OrbitControls` phát ra `orbitControlsReady` sau khi nhận được các tham chiếu máy ảnh và renderer.

Hai tín hiệu này được phối hợp thông qua giao dịch ràng buộc được theo dõi trong `useModelStore`:

- `scenePhase`: giai đoạn hiện tại của cảnh — `pending` → `loading` → `binding` → `mounted` (hoặc `error` / `no-model`).
- `sceneTransactionDepth`: tăng khi bắt đầu chu kỳ tải hoặc khởi động lại, giảm khi liên kết hoàn tất. Cảnh được coi là đang bay khi độ sâu > 0.
- `sceneMutationLocked`: được tính từ `scenePhase` và `sceneTransactionDepth`. Đúng bất cứ khi nào cảnh chưa được gắn kết hoặc giao dịch đang được tiến hành. Được sử dụng để tương tác với người dùng cổng kiểm tra như điều khiển quỹ đạo.

Khi một trong hai tín hiệu đến, `ThreeScene` gọi `completeSceneBinding()`. Chức năng đó:

1. Đặt `scenePhase` thành `'binding'` ngay lập tức để chặn độ phân giải `mounted` sớm.
2. Áp dụng tải trọng `SceneBootstrap` đang chờ xử lý (vị trí camera, điểm gốc mô hình, chiều cao mắt, v.v.) nếu có.
3. Gọi `controlsRef.update()` sau `nextTick` để OrbitControls đọc trạng thái camera được cập nhật.
4. Phân giải `scenePhase` về giá trị cuối cùng dựa trên `modelPhase` và `canvasReady` hiện tại.

Bất kỳ tín hiệu nào đến thứ hai sẽ hoàn thành việc liên kết. Tín hiệu đầu tiên đến sẽ tìm thấy tín hiệu khác chưa sẵn sàng và chuyển trở lại `'loading'`.

<a id="camera-preservation-on-model-switch"></a>

### Bảo quản camera trên mô hình Switch

`SceneBootstrap` mang cờ `cacheHit`. `ThreeScene.applySceneBootstrap` sử dụng lý do giao dịch để quyết định cách áp dụng dữ liệu bootstrap:

- `initial-load` / `unknown`: vị trí và mục tiêu của camera được đặt lại về giá trị mặc định đã tính toán của mô hình.
- `model-switch`: Độ lệch camera hiện tại của người dùng và góc nhìn so với nguồn gốc mô hình trước đó được giữ nguyên và chiếu lên nguồn gốc mô hình mới.

<a id="subtree-watch"></a>

### Xem cây con

`ThreeScene` theo dõi `modelRef` và `controlsRef` bằng `flush: 'sync'` để phát hiện các sự kiện tách ra ngay lập tức trong cùng một tích tắc. Khi `controlsRef` không có giá trị (ví dụ: kết nối lại nội bộ TresJS), `controlsReady` sẽ đặt lại và một giao dịch ràng buộc mới sẽ mở ra. Khi `modelRef` vô hiệu, `scenePhase` trở lại `loading` mà không mở giao dịch mới, vì sự kiện `loadStart` tiếp theo từ `VRMModel` sẽ mở một giao dịch mới.

<a id="trace-submodule"></a>

## Mô-đun con `trace`

`@angela/stage-ui-three/trace` cung cấp:

- Bối cảnh Eventa cục bộ cho các sự kiện theo dõi Three/VRM runtime.
- Các điều khiển enable/disable được tính lại để các đường dẫn nóng có thể bị đoản mạch khi tắt tính năng theo dõi.
- Định nghĩa sự kiện được chia sẻ cho:
  - Ba thông tin kết xuất
  - Đọc lại ba bài kiểm tra lần truy cập
  - Phân tích khung cập nhật VRM
  - Bắt đầu/kết thúc/lỗi tải VRM
  - VRM xử lý bắt đầu / kết thúc
- Trình trợ giúp chụp nhanh tài nguyên cho bộ nhớ renderer và tóm tắt cảnh VRM.

Bus theo dõi được cố ý cục bộ hóa thành `stage-ui-three`. Các ứng dụng desktop có thể kết nối nó qua các cửa sổ renderer khi cần, nhưng nguồn gốc của sự thật vẫn nằm trong gói này.

<a id="when-to-use-it"></a>

## Khi nào nên sử dụng nó

- Sử dụng nó khi bề mặt stage cần renderer ba mặt sau.
- Sử dụng `useModelStore` khi trang cần điều khiển máy ảnh, ánh sáng, biến đổi mô hình hoặc trạng thái quay mặt về renderer.
- Sử dụng `@angela/stage-ui-three/trace` khi bạn cần đo từ xa Three/VRM runtime mà không cần định tuyến qua chuỗi mẹ Vue.
- Sử dụng `utils/vrm-preview` để hiển thị bản xem trước riêng biệt không tham gia vào vòng đời stage chính.

<a id="when-not-to-use-it"></a>

## Khi nào không nên sử dụng nó

- Không sử dụng nó như một xe buýt sự kiện kinh doanh toàn cầu.
- Không sử dụng mô-đun con `trace` cho phép đo từ xa Live2D hoặc không phải Ba runtime.
- Không điều khiển route renderer-to-main thông qua mô-đun con `trace`; giữ quyền kiểm soát IPC trong các hợp đồng cấp ứng dụng.
- Không sử dụng bộ đệm phiên bản VRM làm bộ đệm nội dung chung được chia sẻ trên các ứng dụng hoặc cửa sổ.
