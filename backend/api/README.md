# `@angela/api-server`

Tài nguyên API của Angela. Xác thực là một ứng dụng workspace riêng biệt tại `../dev-in-future/server/apps/auth`; gói này không khởi tạo Better Auth hoặc hiển thị auth/OIDC route.

<a id="responsibilities"></a>

## Trách nhiệm

- API kinh doanh Hono và điểm cuối WebSocket.
- Ký tự, cuộc trò chuyện, định tuyến và thanh toán nhà cung cấp, Flux, Stripe, mô hình.
- Quyền sở hữu di chuyển PostgreSQL cho cơ sở dữ liệu hiện được chia sẻ. Drizzle đọc nhật ký `drizzle/` đã đăng ký và các tệp SQL khi khởi động.
- Làm lại bộ nhớ đệm, cấu hình KV và Pub/Sub. đa phiên bản
- Xác minh cục bộ của JWT OIDC do xác thực cấp thông qua JWKS công khai.

<a id="llm-request-content"></a>

## Nội dung yêu cầu LLM

Chat Completions và Responses giữ lại nội dung đầu vào, đầu ra và lỗi chẩn đoán trong PostgreSQL. Di chuyển `0029_llm_request_content.sql` thêm các cột JSONB có thể rỗng để yêu cầu và thử theo dõi. Áp dụng nó trước khi triển khai Go Admin bên đọc.

Nội dung giữ văn bản, lệnh gọi công cụ và suy luận. Phương tiện nội tuyến được thay thế bằng siêu dữ liệu; phương tiện từ xa không được tìm nạp. Mỗi tải trọng từ có giới hạn đến 8 MiB, với trạng thái một phần và bị cắt cụt rõ ràng. Đầu ra SSE store đã nhận các sự kiện dữ liệu theo thứ tự. Nó không chứng minh việc giao hàng của khách hàng. Phần thân lỗi thu nhận dữ liệu dừng sau năm giây và giữ lại một phần nội dung nếu upstream bị treo hoặc ngắt kết nối.

Sử dụng chi tiết yêu cầu của Quản trị viên đã được xác thực để kiểm tra nội dung. Danh sách truy vấn và DTO đối mặt với chủ sở hữu không hiển thị nó. Các yêu cầu lịch sử không được lấp đầy. Nội dung tuân theo việc lưu giữ chẩn đoán; tính năng này không thêm lịch trình dọn dẹp. Nó không phải là bằng chứng thanh toán. Xem nội dung [ ADR](../docs/ai/adr/2026-09-27-llm-request-content.md).

<a id="redis-cache"></a>

## Làm lại bộ đệm

`src/libs/redis/cache.ts` cung cấp các hàm không trạng thái cho ảnh chụp nhanh chuỗi. `writeCache` yêu cầu TTL dương và ghi giá trị cũng như thời hạn sử dụng nguyên tử. `readCache` chỉ chấp nhận các mục hết hạn và không bao giờ gia hạn thời hạn của chúng. Lỗi Redis lan truyền đến người gọi. Các chức năng này không quản lý khóa, hàng đợi, Pub/Sub, kết nối hoặc giao dịch cơ sở dữ liệu.

`src/services/domain/flux-cache.ts` sở hữu tính năng xác thực số dư và Flux TTL 60 giây. Các dịch vụ Flux sử dụng các chức năng đọc, ghi và vô hiệu hóa. ConfigKV chia sẻ chức năng ghi trong khi vẫn giữ chính sách đọc hiện có. Key sử dụng tên miền: `config:{key}`, `stripe:prices`, `user:{userId}:flux`. Các chức năng bộ nhớ đệm không thêm tiền tố khóa.

<a id="flux-usage"></a>

## sử dụng Flux

`flux_usage` ghi lại một khoản phí micro-Flux đã được xác nhận cho mỗi `(userId, source.type, source.id)`. Các hàng chỉ được thêm vào. `flux_transaction` chỉ ghi lại các thay đổi số dư số nguyên. `user_flux` store số nguyên Flux và micro-Flux nổi bật. Một Flux bằng 1.000.000 micro-Flux. Phí LLM và TTS chia sẻ một nhóm. Phí chưa thanh toán không hết hạn. `BillingService.postFluxUsage({ userId, source: { type, id }, amountMicroFlux, detail? })` chấp nhận số tiền đã được xác nhận. Lõi kế toán không có sự phụ thuộc mô hình, nhà cung cấp, lần lượt, lần thử hoặc giá cả. Một dịch vụ đưa bằng chứng của riêng mình vào `detail`. Một dịch vụ mới cần `source.type` mới và không có bảng mới. Một bài viết có phí một lần. Việc chơi lại với số tiền tương tự sẽ trả về kết quả đầu tiên. Việc phát lại với số tiền khác không thành công. Khoản ghi nợ gộp có thể bao gồm các khoản phí trước đó từ các dịch vụ khác. Sử dụng `flux_usage` cho báo cáo chi tiêu dịch vụ. Không quy một khoản ghi nợ gộp cho một dịch vụ. Vé vào ghi PostgreSQL. Bộ đệm hiển thị chứa cả hai trường ví và hết hạn sau 60 giây. credit giải quyết các khoản phí tồn đọng phải chăng. Thay đổi số dư của quản trị viên sẽ bảo toàn các khoản phí chưa thanh toán. Sổ cái phải luôn đáp ứng: tổng phí = Flux được ghi nợ x 1.000.000 + micro-Flux chưa thanh toán.

`user_flux` cũng nắm giữ Capacitor: `capacitor_flux`, `capacitor_quota`, `capacitor_expires_at`, `capacitor_period_start`, `capacitor_filled_at` và `capacitor_reset_at`. Flux đã mua không hết hạn. Capacitor Flux được tính là 0 sau `capacitor_expires_at`. Capacitor Flux nạp lại hạn ngạch khi `capacitor_filled_at` ở trước ranh giới đặt lại. Ranh giới là thời điểm bắt đầu chu kỳ thanh toán muộn nhất, cửa sổ `CAPACITOR_RESET_INTERVAL`, `CAPACITOR_RESET_AT` và `capacitor_reset_at`. Việc giải quyết tiếp theo viết một khoản nạp tiền đến hạn. Không có công việc chạy nó. Khoản ghi nợ gộp chi tiêu Capacitor Flux trước tiên. Khi Capacitor đang hoạt động, Flux đã mua chỉ thanh toán khi `fallback_to_flux` được bật. Mặc định là tắt. Một khoản phí mà không bucket nào có thể trả vẫn còn tồn đọng. Khoản trợ cấp Capacitor mới hoặc credit sẽ thanh toán sau. `flux_transaction.pool` là `wallet` hoặc `capacitor`. Các cột cân bằng của nó mô tả bucket. `BillingService.syncCapacitor` store một dấu chấm, `setFallbackToFlux` lưu lựa chọn và `GET /api/v1/flux` trả về `capacitorPercent`.

`GET /api/v1/flux/usage` trả lại phí phân trang từ `flux_usage`. Lịch sử ví trả về các thay đổi số dư số nguyên.

Bộ đếm ký tự Redis TTS cũ không được di chuyển. Đồng hồ cũ đã tha thứ cho lượng dư ít hơn một Flux. Dừng các tác giả API cũ trước khi phiên bản mới bắt đầu. Các nhà văn cũ và mới hỗn hợp không được hỗ trợ.

Xem cách sử dụng [the Flux ADR](../docs/ai/adr/2026-10-04-flux-usage.md) để biết các bất biến và chính sách di chuyển.

<a id="object-storage"></a>

## Lưu trữ đối tượng

API cung cấp bộ điều hợp S3 tùy chọn cho các đối tượng riêng tư. Nó hỗ trợ tải lên máy chủ, tải xuống trực tuyến, HEAD, xóa và URL PUT/GET được chỉ định. Sử dụng nó cho các tệp thuộc sở hữu của miền như tệp đính kèm và âm thanh. Nó không cung cấp route tải lên công khai, kiểm soát truy cập, bản ghi đính kèm hoặc đồng bộ hóa tin nhắn.

Đặt `S3_BUCKET` và `S3_REGION` để kích hoạt nó. Bỏ đặt tất cả các biến `S3_*` để tắt nó. Cấu hình một phần không khởi động được.

| Biến | Mục đích | Mặc định |
| --- | --- | --- |
| `S3_BUCKET` | bucket riêng hiện có | Bỏ đặt |
| `S3_REGION` | Vùng AWS hoặc vùng được dịch vụ tương thích yêu cầu | Bỏ đặt |
| `S3_ENDPOINT` | Điểm cuối HTTP(S) tùy chỉnh cho R2, MinIO, Đường sắt hoặc dịch vụ S3 khác | Điểm cuối AWS |
| `S3_FORCE_PATH_STYLE` | `true` cho địa chỉ endpoint/bucket/key, `false` cho địa chỉ hosted ảo | `false` |

Đối với thông tin xác thực tĩnh, hãy đặt `AWS_ACCESS_KEY_ID` và `AWS_SECRET_ACCESS_KEY`. Đối với thông tin xác thực tạm thời, hãy đặt `AWS_SESSION_TOKEN`. Đối với vai trò IAM, hãy bỏ qua các biến này. SDK phân giải thông tin xác thực thông qua chuỗi thông tin xác thực mặc định [](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html) của nó. Các URL đã ký có thời gian tồn tại cố định là 15 phút. Thông tin xác thực tạm thời có thể hết hạn sớm hơn. Không đặt `S3_FORCE_PATH_STYLE` trừ khi dịch vụ yêu cầu đánh địa chỉ kiểu đường dẫn, chẳng hạn như máy chủ MinIO cục bộ. Sử dụng HTTPS cho các điểm cuối từ xa. HTTP hỗ trợ các máy chủ phát triển S3 cục bộ. Bộ điều hợp không tạo bucket hoặc thay đổi chính sách bucket.

`app.ts` đăng ký `datastore:objectStore` thông qua Injeca và hủy ứng dụng khách của nó khi tắt máy. Thêm nhà cung cấp này vào `dependsOn` của miền khi cần lưu trữ. nhà cung cấp chưa được định cấu hình sẽ phân giải thành `undefined`. Tên miền phải quyết định xem có cần lưu trữ cho hoạt động của nó hay không.

Dịch vụ miền sở hữu khóa đối tượng, ủy quyền, giới hạn kích thước và quy tắc ghi đè. Bộ chuyển đổi bảo quản khóa chính xác. `putObject` chấp nhận các trường AWS `Key`, `Body`, `ContentType` và `Metadata`. `getObject` trả về phản hồi SDK. Sử dụng hoặc hủy luồng `Body` của nó để giải phóng kết nối. Các lỗi HEAD, GET, PUT và DELETE truyền tới người gọi.

`createUploadTarget` trả về URL tạm thời và các tiêu đề bắt buộc. Gửi những tiêu đề đó không thay đổi bằng PUT. Loại nội dung và siêu dữ liệu được ký theo hợp đồng ký trước [AWS](https://github.com/aws/aws-sdk-js-v3/blob/main/packages/s3-request-presigner/README.md). Chữ ký không chứng minh byte được tải lên khớp với siêu dữ liệu ứng dụng. Miền phải xác thực đối tượng được tải lên trước khi đánh dấu một tệp là hoàn tất. `createDownloadUrl` ký quyền truy cập mà không kiểm tra sự tồn tại của đối tượng. Cho phép truy cập trước khi thực hiện thao tác ký. Không duy trì hoặc ghi lại các URL đã ký. Để tải lên trình duyệt, hãy định cấu hình bucket CORS để biết nguồn gốc chính xác của ứng dụng khách, các phương thức được yêu cầu và tiêu đề tải lên được trả về. Cấu hình CORS vẫn thuộc sở hữu triển khai.

Xem [bộ lưu trữ ADR](../docs/ai/adr/2026-09-27-s3-object-storage.md).

Để chạy thử nghiệm tích hợp tùy chọn, hãy trỏ `TEST_S3_ENDPOINT` vào máy chủ tương thích S3 dùng một lần. Đặt `AWS_ACCESS_KEY_ID` và `AWS_SECRET_ACCESS_KEY` làm thông tin xác thực thử nghiệm của nó. Thử nghiệm tạo và xóa một bucket duy nhất.

```sh
pnpm -F @angela/api-server exec vitest run src/services/adapters/object-store.integration.test.ts
```

<a id="payment"></a>

## Sự chi trả

`src/services/domain/payment` sở hữu các hàng cấp gói và `payment_order`. CORE hiển thị `openPending`, `bindProcessorOrder`, `abandon`, `settle` và `deleteAllForUser`. CORE không bao giờ thấy sự kiện xử lý thô. Bộ điều hợp ánh xạ kết quả của bộ xử lý vào `ClaimReceipt` hoặc `EvidenceReceipt`, sau đó gọi `settle`. Danh sách thanh toán và gói trực tiếp trong bộ điều hợp Stripe trên `/api/v1/stripe/*`. ConfigKV store `STRIPE_FLUX_PRODUCT_ID`. Bộ điều hợp liệt kê Giá của sản phẩm đó từ Stripe. `GET /packages` trả về `stripePriceId`. Thanh toán chấp nhận `stripePriceId`. Nhãn, số lượng Flux và giá hiển thị đến từ siêu dữ liệu Giá và số lượng Stripe. Apple IAP tồn tại trên `/api/v1/apple-iap/*`. Kênh xác minh bằng chứng StoreKit 2 JWS từ mọi ứng dụng trong `APPLE_IAP_APPS`, giải quyết gói từ `productId` đến `APPLE_FLUX_PACKS`, sau đó giải quyết `EvidenceReceipt`. RevenueCat tồn tại trên `/api/v1/revenuecat/*`. `POST /webhook` xác minh tiêu đề ủy quyền trang tổng quan và chữ ký HMAC trên nội dung thô. Sau đó, mỗi sự kiện sẽ điều chỉnh Capacitor từ RevenueCat. `POST /sync` đối chiếu Capacitor của người dùng đã đăng nhập. Khách hàng gọi nó sau khi mua hàng và khi trang Capacitor mở ra. `GET /capacitors` trả về id sản phẩm cấp Capacitor. RevenueCat không bán gói Flux. Webhook store không có sự kiện nào. Cân Flux vẫn tự quản lý. Tiền tệ trong ứng dụng không được sử dụng.

<a id="subscriptions"></a>

## Đăng ký

Go (`airi_go`) và Plus (`airi_plus`) được bán thông qua RevenueCat trên mọi store. Apple, Google, Stripe và Test store đều tham gia thông qua webhook RevenueCat duy nhất. `store` chỉ là một trường nên các kênh mới không cần thay đổi máy chủ.

Máy khách RevenueCat SDK là nguồn cung cấp trạng thái quyền lợi. Trang Capacitor ghi `customerInfo` cho Capacitor hiện tại, thời hạn sử dụng và quản lý URL. Máy chủ store chỉ có Capacitor trong `user_flux`.

Webhook không chọn quy tắc cấp theo loại sự kiện. Máy chủ đọc đăng ký của khách hàng và các quyền hiện hoạt từ RevenueCat REST API v2, với `REVENUECAT_V2_API_KEY` và `REVENUECAT_PROJECT_ID`, đồng thời gọi `BillingService.syncCapacitor`. Một khoảng thời gian mới sẽ đặt lại bucket về hạn ngạch. Khoảng thời gian đã biết sẽ giữ lại Flux đã sử dụng và lấy thời gian kết thúc được báo cáo. Hiện tại không có Capacitor hoạt động nào hết hạn bucket. Ánh xạ sản phẩm tới Capacitor tồn tại trong ConfigKV `REVENUECAT_CAPACITORS`. Một webhook bị bỏ lỡ sẽ trì hoãn việc cấp phép cho đến webhook tiếp theo dành cho khách hàng đó hoặc cho đến khi khách hàng gọi đến `POST /sync`. Tên Capacitor và thời hạn sử dụng đều đến từ client SDK nên họ không đợi webhook đó.

Dịch vụ Auth sẽ hỏi `POST /internal/auth/user-deletion/check` trước khi gửi email xóa và một lần nữa trước khi xóa. Séc trả về 409 `SUBSCRIPTION_ACTIVE` trong khi đăng ký vẫn có thể tính phí. Người dùng hủy đăng ký trước.

<a id="run-locally"></a>

## Chạy cục bộ

```sh
pnpm -F @angela/api-server dev
pnpm -F @angela/api-server typecheck
pnpm -F @angela/api-server exec vitest run
pnpm -F @angela/api-server build
```

Ngăn xếp phụ trợ hoàn chỉnh được hoãn lại bên ngoài kho lưu trữ này. Đọc hướng dẫn khôi phục [](../../../../dev-in-future/README.md) trước khi sử dụng Auth, Compose hoặc Caddy. Phím tắt phụ trợ gốc không có. Các lệnh trên áp dụng cho API workspace được giữ lại.

<a id="service-boundaries"></a>

## Ranh giới dịch vụ

- `AUTH_SERVER_URL` là nguồn gốc của nhà phát hành công khai chuẩn của Auth được sử dụng để xác thực JWKS, nhà phát hành và đối tượng. Nó phải chính xác bằng `PUBLIC_URL` của Auth.
- `/internal/auth/*` chỉ có thể truy cập được trên mạng riêng đáng tin cậy của triển khai. Cạnh công khai phải từ chối `/internal/*` và dịch vụ API không được có lối vào công khai riêng.
- `AUTH_SERVER_INTERNAL_URL` tùy chọn gửi JWKS tìm nạp trực tiếp tới Auth trên mạng riêng trong khi nhà phát hành và đối tượng vẫn là `AUTH_SERVER_URL`.
- Bảng xác thực và loại chính đến từ `@angela/auth-shared`; không có mô-đun nào trong `../dev-in-future/server/apps/auth` được nhập.

<a id="railway"></a>

## Đường sắt

Dockerfile bị trì hoãn là `../dev-in-future/server/api-production/railway/Dockerfile`. Đọc [hướng dẫn phát triển trong tương lai](../../../../dev-in-future/README.md) trước khi khôi phục hoạt động triển khai trên đám mây.

Triển khai dịch vụ này dưới dạng dịch vụ Đường sắt Tài nguyên API. Giữ thư mục gốc của dịch vụ ở thư mục gốc của kho lưu trữ vì Dockerfile sao chép các gói workspace được chia sẻ. Tệp Cơ sở hạ tầng dưới dạng Mã ở cấp dự án là `proj-airi/airi-railway/.railway/railway.ts`. Nó sở hữu Dockerfile, lệnh bắt đầu, kiểm tra tình trạng `/readyz` và các mẫu đồng hồ.

Đặt `AUTH_SERVER_INTERNAL_URL` từ miền riêng Đường sắt của Auth. Nó chỉ là JWKS route riêng tư; `AUTH_SERVER_URL` vẫn là nhà phát hành xác thực công khai URL. Xem [`backend/README.md`](../README.md#railway-deployment) để biết biến dịch vụ chéo hoàn chỉnh và hợp đồng di chuyển.

### Hosted Responses API

`POST /api/v1/openai/responses` chấp nhận các yêu cầu OpenAI Responses được xác thực, không trạng thái. Sử dụng điểm cuối này khi khách hàng gửi các Mục đầu vào hoàn chỉnh và xử lý các công cụ chức năng cục bộ. Điểm cuối hỗ trợ đầu ra JSON và SSE. Nó chia sẻ hạn ngạch sinh nội dung cho mỗi người dùng với Chat Completions.

Thêm `protocols: ["chat-completions", "responses"]` vào mỗi LLM upstream tương thích trong `LLM_ROUTER_CONFIG`. Trường `protocols` bị bỏ qua chỉ cho phép Chat Completions. Các bí danh giữ lại thứ tự chính và phương án dự phòng được cấu hình của chúng. Nếu không có route được định cấu hình nào hỗ trợ Responses thì điểm cuối sẽ trả về `503 LLM_PROTOCOL_UNAVAILABLE` trước khi liên hệ với upstream. PR này không cập nhật cấu hình định tuyến trực tiếp hoặc chuyển đổi ứng dụng khách chính thức nhà cung cấp.

Yêu cầu sử dụng `store: false`, đây cũng là mặc định. Gửi tin nhắn hoàn chỉnh, Mục suy luận, lệnh gọi hàm và đầu ra chức năng trong `input`. Điểm cuối từ chối `previous_response_id`, `conversation`, ID tệp, sinh nội dung nền, tham chiếu mục, tìm kiếm tệp và trình thông dịch mã. Các lựa chọn chức năng và tìm kiếm trên web phải tham khảo các công cụ được khai báo trong cùng một yêu cầu. Lựa chọn `allowed_tools` hỗ trợ tối đa 128 tài liệu tham khảo. Không sử dụng điểm cuối này cho lịch sử phía nhà cung cấp. Tổng giới hạn nội dung yêu cầu là 40 MiB sau khi xác thực. API route khác giữ mặc định 1 MiB. Điều này cho phép một tệp nội tuyến có kích thước tối đa cộng với phong bì JSON. Sử dụng URL từ xa hoặc giảm tải trọng nếu tổng số vượt quá 40 MiB.

Đối với OpenAI upstream hỗ trợ Responses tại `https://api.openai.com/v1`, tìm kiếm trên web không cần cờ khả năng riêng. Máy chủ đọc `abilities.search` từ `model-bank/openai` bằng `overrideModel` hoặc tên mô hình được gửi đi khi không có ghi đè. Điểm cuối OpenRouter chuẩn cũng hỗ trợ tìm kiếm. Bộ điều hợp của nó ánh xạ `web_search` tới tên công cụ máy chủ OpenRouter. Các proxy tương thích khác không được coi là OpenAI hoặc OpenRouter. OpenAI trực tiếp không xác định mô hình không nhận được yêu cầu tìm kiếm. Nếu tất cả các ứng viên tương thích với giao thức đều thiếu hỗ trợ tìm kiếm thì điểm cuối sẽ trả về `503 LLM_WEB_SEARCH_UNAVAILABLE`. Gửi `tools: [{ "type": "web_search" }]` để thực hiện tìm kiếm. Cổng không chèn công cụ hoặc thay đổi `tool_choice`. Các bộ lọc tìm kiếm, vị trí gần đúng, bao gồm nguồn và các mục `web_search_call` vượt qua ranh giới yêu cầu được xác thực. `web_search_call` được phát lại cũng chỉ chọn route có khả năng tìm kiếm, ngay cả khi yêu cầu tiếp theo bỏ qua công cụ tìm kiếm. Giữ các Mục tìm kiếm và chú thích trích dẫn trong lịch sử ứng dụng khách để phát lại và chỉnh sửa.

Hoạt động Responses tồn tại trong `operations/responses/index.ts`. Hợp đồng yêu cầu của nó tồn tại trong `operations/responses/request.ts`.

Tìm kiếm trên web không thêm ghi nợ Flux riêng biệt. Dịch vụ hosted tính phí cuộc gọi tìm kiếm upstream. Nội dung tìm kiếm token trong quá trình sử dụng được trả về tuân theo tỷ lệ token hiện có.

Một kết quả hoàn thành giải quyết chi phí chuẩn hóa. Thiếu chi phí hoặc đầu ra không đầy đủ vẫn đang chờ xử lý mà không cần ghi nợ ngay lập tức. Mỗi yêu cầu ID sở hữu một lần thanh toán, vì vậy các sự kiện đầu cuối trùng lặp không thể tính phí hai lần. Ngắt kết nối máy khách sẽ hủy upstream bên đọc. Một sự kiện đầu cuối được giao cho phép giải quyết. Cổng sẽ đóng luồng sau nỗ lực giải quyết đó.

Trước khi phát hành, hãy định cấu hình upstream có khả năng Responses và xác minh các yêu cầu đã xác thực cũng như giải quyết Flux trong môi trường đích. Kiến trúc và phạm vi thử nghiệm nằm trong [the hosted Responses ADR](../docs/ai/adr/2026-09-15-hosted-responses.md).

<a id="llm-cost-settlement"></a>

### Thanh toán chi phí LLM

hosted Chat Completions và Responses luôn sử dụng thanh toán chi phí chuẩn hóa. `LLM_COST_BILLING` chứa cấu hình giá bắt buộc, không phải cờ chọn tham gia. Ví dụ: `{ "openrouter": { "fluxPerUsd": 1000, "multiplier": 1.5 } }` tính phí ba Flux với giá 0,002 USD. Ví dụ này không phải là khuyến nghị về giá bán sản xuất. Không có giá bán mặc định được cung cấp.

`LLM_MINIMUM_BALANCE` là số dư tối thiểu có thể thu hồi được. Nó mặc định là năm Flux. Đây không phải là phí yêu cầu cố định hoặc phí đặt trước với chi phí tối đa. `FLUX_PER_REQUEST` và `FLUX_PER_1K_TOKENS` không còn được thanh toán hosted LLM đọc nữa. Phí dịch vụ đã được xác nhận nhập vào bộ tích lũy micro-Flux được chia sẻ.

Trước khi gửi mạng, mỗi upstream đủ điều kiện phải có bộ chuyển đổi giá được hỗ trợ và mức giá đầy đủ. Thiếu cấu hình sẽ từ chối yêu cầu với `LLM_BILLING_UNAVAILABLE`; bí danh phương án dự phòng không thể ẩn lỗi này. Chỉ bộ chuyển đổi OpenRouter được triển khai. Các cổng khác không thể phục vụ lưu lượng hosted LLM cho đến khi chúng có bộ điều hợp và giá rõ ràng.

Chi phí trả về bị thiếu hoặc không hợp lệ, phí BYOK và đầu ra chưa hoàn chỉnh không phát sinh phí. Không ước tính phí theo đơn giá token. Mỗi yêu cầu ghi `ceil(costUsd * fluxPerUsd * multiplier * 1,000,000)` micro-Flux với nguồn `llm:{requestId}`. Chi phí bằng không được ghi nhận bằng không. Phí lẻ được cộng dồn giữa các dịch vụ trước khi quyết toán ví bằng số nguyên. Phí bằng không không tạo bản ghi ghi nợ. Quyết toán thiếu số dư chỉ tăng chỉ số thiếu số dư một lần, không tăng khi xử lý lại. `flux_usage.detail` lưu bản chụp giá, nguồn chi phí, nhà cung cấp, mô hình và ID sinh nội dung. Nhật ký yêu cầu và các lần thử lưu bằng chứng từ nhà cung cấp. Yêu cầu có nhật ký nhưng không có bản ghi `flux_usage` chưa được tính phí. Đối soát bằng cách nối nhật ký yêu cầu với `flux_usage` theo ID yêu cầu. Nhật ký yêu cầu không còn lưu số Flux. Đọc phí từ `flux_usage` theo ID yêu cầu. Chỉ số `airi.billing.flux.consumed` và thuộc tính span `airi.billing.flux_consumed` báo phí bằng Flux, không phải số nguyên ghi nợ. Migration 0030 xóa kho lưu trữ `llm_request_settlement` và `llm_request_log.flux_consumed`. Xuất dữ liệu quyết toán lịch sử trước khi chạy migration này. Bản phát hành này không có worker tự động đối soát.

Bộ điều hợp bảng giá mô hình trong tương lai là chế độ định giá được hỗ trợ, không phải phương án dự phòng. Nó phải xác thực tỷ lệ mô hình trước khi gửi đi và tạo ra chi phí USD được tiêu chuẩn hóa với ảnh chụp nhanh tỷ lệ theo phiên bản và mức sử dụng được đo lường. Bản phát hành này không triển khai bộ chuyển đổi đó.

Yêu cầu theo dõi #2673 đã được hợp nhất. Thanh toán số 2644 chỉ thêm di chuyển 0027. Áp dụng `0026_llm_request_tracking.sql` trước `0027_llm_cost_settlement.sql`. Định cấu hình giá nhà cung cấp được hỗ trợ trước khi triển khai thay đổi thanh toán. Thiếu giá sẽ dừng cuộc gọi LLM. Những lần di chuyển này thay thế các bản nháp PR chưa được xuất bản và không được áp dụng trên bản nháp trước đó đã được áp dụng.

Xem [thanh toán ADR](../docs/ai/adr/2026-09-23-provider-cost-billing.md) để biết ranh giới xác minh và quyền sở hữu kế toán.

<a id="llm-request-tracking"></a>

### Theo dõi yêu cầu LLM

Việc theo dõi mở rộng nhật ký yêu cầu hiện có và ghi lại từng lần gửi upstream cục bộ trong `llm_request_attempt`. Việc theo dõi không có sự phụ thuộc vào bảng quyết toán. Bản tóm tắt chẩn đoán Flux của nó không phải là dự luật chính thức. Áp dụng `0026_llm_request_tracking.sql` trước khi triển khai.

| Lĩnh vực | Ý nghĩa |
| --- | --- |
| Cổng và upstream nhà cung cấp | Tên máy chủ được định tuyến và suy luận nhà cung cấp được cổng thông báo; khác biệt với bộ điều hợp thanh toán ID. |
| Đã yêu cầu, định tuyến, upstream và phản hồi mô hình | Bí danh khách hàng, route đã chọn, gửi mô hình và báo cáo phản hồi mô hình. |
| Yêu cầu, sinh nội dung, ID phiên và tương tác | Yêu cầu tương quan, cổng sinh nội dung và bối cảnh sản phẩm. |
| Trạng thái, trạng thái, thời gian và định tuyến | Kết quả Request/attempt, đầu ra đầu tiên và bộ đếm thử lại cục bộ. |
| Cách sử dụng token và nhà cung cấp | Tổng số, lưu trữ các thông tin cụ thể về reads/writes, suy luận và có giới hạn nhà cung cấp. |
| Siêu dữ liệu và thứ nguyên | Khả năng mở rộng được phiên bản mà không cần lưu trữ đầy đủ prompt, phần hoàn thành hoặc tiêu đề. |

Sự thật chưa biết vẫn vô giá trị. Các lần thử ẩn bên trong cổng bên ngoài không phải là các lần thử cục bộ. Các chi tiết chỉ dành cho sinh nội dung yêu cầu bộ điều hợp tra cứu trong tương lai. Thứ nguyên mới được truy vấn thường xuyên có thể nhận được các cột rõ ràng sau này.

Các API list/detail trong phạm vi chủ sở hữu đã được xác thực là `/api/v1/llm-requests` và `/api/v1/llm-requests/:requestId`. Họ bỏ qua bằng chứng thô, tài liệu tham khảo thông tin xác thực và ảnh chụp nhanh giá nội bộ. Không có Hoạt động UI hoặc quản trị viên nhiều người dùng API trong thay đổi này.

Yêu cầu và nỗ lực ghi xảy ra trước khi gửi đi. Lỗi ghi theo dõi sẽ dừng gửi đi. Việc ghi chẩn đoán cuối cùng vẫn là nỗ lực tốt nhất. Flux được tính phí trong nhật ký mang tính quan sát chứ không phải cơ quan kế toán. `recoverStaleRequests(before)` đánh dấu các quan sát đang chạy cũ không xác định mà không tính phí hoặc phát lại các cuộc gọi upstream. Không có lịch trình phục hồi hoặc lưu giữ tự động. Xóa chẩn đoán không xóa bằng chứng kế toán.

[theo dõi yêu cầu ADR](../docs/ai/adr/2026-09-27-llm-request-tracking.md) xác định ranh giới quyền sở hữu, vòng đời và truy vấn.

<a id="generation-protocol-ownership"></a>

### Quyền sở hữu giao thức sinh nội dung

Sổ đăng ký máy chủ trong `src/schemas/generation-protocol.ts` sở hữu ID giao thức được hỗ trợ và tạo đường dẫn. Các hoạt động cấu hình, định tuyến upstream và cổng sử dụng các loại được suy luận của nó. Tên hoạt động của cổng theo `<protocol>.create`: `chat-completions.create` và `responses.create`. Đường dẫn HTTP và giá trị giao thức máy khách không thay đổi.

Bộ điều hợp dây trực tiếp trong `src/services/adapters/llm/`. Mỗi bộ điều hợp sở hữu các tiêu đề yêu cầu, tuần tự hóa và khả năng nhà cung cấp. Hoạt động giao thức sở hữu khả năng xử lý phản hồi native. router sở hữu thông tin xác thực, số lần thử lại, số lần hủy và lựa chọn upstream. Để thêm một giao thức, hãy thêm mục đăng ký, bộ điều hợp dây, hợp đồng đầu vào cổng và hoạt động native với các thử nghiệm tập trung. Sổ đăng ký bộ điều hợp và các loại cổng từ chối triển khai bị thiếu trong kiểm tra kiểu dữ liệu. Tin nhắn API vẫn không được hỗ trợ cho đến khi những phần này tồn tại.

Xác thực Responses sử dụng lại `src/services/adapters/llm/schemas/responses.ts`. Lớp giao thức do máy chủ sở hữu này lấy các lược đồ từ OpenResponses và thêm các phần mở rộng tìm kiếm OpenAI. Nó cho phép tham chiếu phía nhà cung cấp; chính sách yêu cầu của Angela từ chối chúng đối với các tài khoản upstream được chia sẻ. Thư mục lược đồ giữ lại đầu vào và hướng dẫn sinh nội dung của nó. JavaScript đã biên dịch không được lưu trữ trong nguồn. Bản vá ứng dụng khách hiện tại của xsai vẫn không thay đổi. Không có xuất lược đồ hoặc phụ thuộc ngang hàng mới nào được thêm vào xsai.

<a id="apple-sandbox-purchases-on-the-shared-api"></a>

## Mua hộp cát của Apple trên API được chia sẻ

Giữ `APPLE_IAP_ENV=production` để chấp nhận giao dịch mua Ứng dụng store thực. Đặt `APPLE_IAP_SANDBOX_USER_IDS` thành danh sách ID người dùng nội bộ chính xác được phân tách bằng dấu phẩy cho các tài khoản thử nghiệm chuyên dụng. Không sử dụng địa chỉ email, ID Apple hoặc giá trị `appAccountToken` trong danh sách này. Khởi động lại API sau khi thay đổi. Danh sách trống sẽ vô hiệu hóa xác minh Hộp cát trên API sản xuất. Việc triển khai chỉ dành cho hộp cát cũng yêu cầu danh sách này trước khi họ có thể cấp Flux.

Danh sách này cho phép xác minh Sandbox JWS bên cạnh Xác minh sản xuất. Cả hai đều sử dụng kiểm tra chữ ký của Apple. Nó không bao giờ kích hoạt chế độ không dấu của Xcode. Cả `/api/v1/apple-iap/transactions` và `/api/v1/apple-iap/notifications` đều kiểm tra tài khoản Sandbox đã giải quyết trước khi giải quyết. Thiết bị bị chặn nhận được lỗi 403 và có thể thử lại sau. Thông báo bị chặn nhận được 200 mà không cần trợ cấp.

Sử dụng **tài khoản mới, chuyên dụng**. Sandbox Flux nhập số dư hiện có của họ và có thể sử dụng tài nguyên nhà cung cấp thực. Đây là kiểm soát truy cập cấp tài khoản, không phải là ví hoặc cơ sở dữ liệu riêng biệt. Không sử dụng tài khoản bình thường cho danh sách này. Các đơn đặt hàng hộp cát sử dụng `sandbox:<bundleId>:<transactionId>` làm đơn đặt hàng bộ xử lý ID từ lần thanh toán đầu tiên. Chỉ mục duy nhất `(processor, processor_order_id)` hiện có ngăn chặn các khoản trợ cấp lặp lại và đồng thời. Việc triển khai này giả định không có đơn đặt hàng Sandbox trước đây và không có tác giả Sandbox cũ nào, như đã được chủ sở hữu triển khai xác nhận. Nó không yêu cầu di chuyển lược đồ. ID lệnh sản xuất không thay đổi.

Trước lần kiểm tra thiết bị đầu tiên:

1. Triển khai thay đổi và định cấu hình `APPLE_IAP_APPS` với từng gói và Ứng dụng store Connect ID.
2. Thêm người dùng nội bộ của tài khoản chuyên dụng ID vào `APPLE_IAP_SANDBOX_USER_IDS`.
3. Định cấu hình `APPLE_FLUX_PACKS` trong ConfigKV, không phải trong các biến môi trường. Sử dụng ID sản phẩm store chính xác của Ứng dụng và các giá trị `fluxAmount` dương.
4. Đặt Thông báo hộp cát kết nối ứng dụng store V2 URL thành điểm cuối `/api/v1/apple-iap/notifications` công khai.
5. Cài đặt bản dựng có bản sửa lỗi giải quyết iOS. Đăng nhập vào tài khoản Angela chuyên dụng và hoàn tất giao dịch mua hộp cát.

Kiểm tra việc mua credit, số lần thử lại thiết bị và các thông báo trùng lặp của Apple. Mỗi lần mua phải credit một lần. Kiểm tra xem tài khoản bình thường không nhận được Sandbox Flux. Giao dịch mua TestFlight sử dụng Sandbox và không tính phí. Chỉ một thông báo kiểm tra không chứng minh được việc giải quyết mua hàng.

Xóa ID người dùng và khởi động lại API sau khi kiểm tra. Việc xóa ID sẽ không xóa số dư Flux hiện có của nó. Giữ các tài khoản thử nghiệm riêng biệt sau khi thử nghiệm. Việc mua hộp cát trực tiếp và gửi thông báo yêu cầu xác minh triển khai.
