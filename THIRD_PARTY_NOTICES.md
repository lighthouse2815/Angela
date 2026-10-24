<a id="third-party-notices"></a>

# Thông báo của bên thứ ba

Angela bắt nguồn từ [Project AIRI](https://github.com/moeru-ai/airi). Mã upstream đáng kể vẫn còn trong desktop host, ứng dụng web, UI được chia sẻ, runtime, hệ thống plugin, tích hợp và công cụ Godot. Việc đổi tên không thiết lập quyền tác giả độc lập của mã đó.

Giấy phép [MIT gốc](./docs/licenses/angela.txt) giữ lại `Copyright (c) 2024-PRESENT Neko Ayaka` và thông báo cấp phép đầy đủ. Giữ giấy phép đó cùng với các bản sao hoặc các phần quan trọng của phần mềm. Tài liệu này bổ sung các thông báo hiện có. Nó không thay thế chúng hoặc thay đổi các điều khoản của chúng.

| Nguồn hoặc thành phần | Xuất xứ và thông báo |
| --- | --- |
| Động cơ Angela Gateway nhà cung cấp | Bắt nguồn từ [decolua/9router](https://github.com/decolua/9router). Giữ bản ghi [MIT ](./providers/gateway/vendor/NOTICE) và [bản ghi sửa đổi](./providers/gateway/vendor/README.angela.md). |
| desktop, Kirie, web, gói chia sẻ, tích hợp và công cụ | Nguồn AIRI phái sinh. Root [LICENSE](./docs/licenses/angela.txt) và lịch sử Git giữ lại sự ghi nhận. |
| `shared/ui/ccc` | [MIT thông báo](./shared/ui/ccc/LICENSE), bản quyền Moeru AI. |
| `capabilities/avatar/spine` | [Thông báo gói](./capabilities/avatar/spine/LICENSE.md) phân biệt nguồn MIT với giấy phép Spine Runtimes. |
| Tiện ích Godot VRM và MToon | Giữ giấy phép [VRM](./capabilities/avatar/godot/addons/vrm/LICENSE) và giấy phép [MToon](./capabilities/avatar/godot/addons/Godot-MToon-Shader/LICENSE). |
| Phông chữ, mô hình, nhãn dán và nội dung hoạt ảnh | Giữ giấy phép, tác giả credit, liên kết nguồn và bản ghi sinh nội dung bên cạnh nội dung. |
| OpenSeeFace | [Bản ghi nguồn bán sẵn](./docs/ai/vendor-sources.md) và [Giấy phép ngược dòng](./capabilities/vision/vendor/openseeface/NOTICE). |
| Các gói npm `@proj-airi/*` đã xuất bản | Các phần phụ thuộc bên ngoài giữ lại tên đăng ký, phiên bản, bản ghi toàn vẹn và giấy phép gói. |

Các liên kết GitHub lịch sử xác định kho lưu trữ, cam kết và đường dẫn ban đầu. Các đường dẫn URL đó giữ lại tên lịch sử của chúng khi các thư mục cục bộ di chuyển. Bản ghi Kirie cũng tham chiếu [BeanDz/airi](https://github.com/BeanDz/airi).

## Agent-Reach

Project: [Agent-Reach](https://github.com/Panniantong/Agent-Reach).
Source revision: `beabda7486e9a666360b18cdb5c0e759c2c4d20f` (inspected 2026-10-24).
Original copyright: `Copyright (c) 2025 Agent Eyes`.
The complete MIT license is preserved in [third_party/agent-reach/LICENSE](./third_party/agent-reach/LICENSE).

Angela's `core/companion/src/internet/youtube.ts` and `transcription.ts` derive extraction arguments,
subtitle preference, bounded audio chunking, and explicit transcription routing from
`agent_reach/channels/youtube.py` and `agent_reach/transcribe.py`.
These modules are rewritten in TypeScript. No Python package or upstream repository is required at runtime.
Diagnostics reuse the status-reporting concept, without copying the upstream runtime.
See [the dependency audit](./docs/third-party-audit.md).

## Managed desktop media executables

Release media executables are independent runtime tools, not Agent-Reach source.
No executable bytes are committed by this change.
Electron-builder requires a checksum manifest and actual per-artifact license files before packaging.
Those files are distributed beside the executable artifacts under `resources/media/<target>/licenses`.
See [the release artifact contract](./docs/study-along-media-artifacts.md) for source-license and binary-license boundaries.

## Local whisper.cpp transcription and model artifacts

The native TypeScript adapter executes the public whisper.cpp CLI protocol. It copies no whisper.cpp implementation source.
Optional `whisper-cli` release artifacts remain a separate runtime dependency.
The original [whisper.cpp MIT license](./third_party/whisper.cpp/LICENSE) preserves `Copyright (c) 2023-2026 The ggml authors`.

No model weights are committed or downloaded by Angela. Settings imports an explicitly selected, checksum-verified GGML model.
The recommended original OpenAI Whisper weights have a separate [MIT notice](./third_party/whisper/LICENSE), `Copyright (c) 2022 OpenAI`.
Converted or user-selected models retain their own publisher terms. The whisper.cpp license does not relicense model weights.
Desktop packaging includes both reference notices under `resources/licenses`. Binary distributors also stage the actual artifact notices and corresponding obligations.
