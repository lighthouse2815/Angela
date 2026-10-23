<a id="apple-root-certificate-authorities"></a>

# Cơ quan cấp chứng chỉ gốc của Apple

Chứng chỉ gốc được sử dụng bởi `@apple/app-store-server-library` `SignedDataVerifier`. Họ xác minh chuỗi chứng chỉ JWS từ StoreKit 2 và Thông báo máy chủ ứng dụng store V2.

<a id="files"></a>

## Tập tin

- `AppleRootCA-G2.cer` — Gốc Apple CA G2 (RSA 4096).
- `AppleRootCA-G3.cer` — Apple Root CA G3 (ECC P-384).

URL tải xuống:

- https://www.apple.com/certificateauthority/AppleRootCA-G2.cer
- https://www.apple.com/certificateauthority/AppleRootCA-G3.cer

<a id="refresh"></a>

## Làm cho khỏe lại

Apple luân chuyển CA gốc không thường xuyên. Nếu `SignedDataVerifier` bắt đầu từ chối các giao dịch hợp lệ, hãy tải xuống lại các tệp:

```bash
curl -fsSL -o AppleRootCA-G2.cer https://www.apple.com/certificateauthority/AppleRootCA-G2.cer
curl -fsSL -o AppleRootCA-G3.cer https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
```

Xem [Apple PKI](https://www.apple.com/certificateauthority/) để biết danh sách hiện tại.
