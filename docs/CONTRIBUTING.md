# Bắt đầu đóng góp cho [Angela](https://github.com/lighthouse2815/Angela)

Cảm ơn bạn đã quan tâm đến việc đóng góp cho dự án. Tài liệu này hướng dẫn các bước bắt đầu.

## Yêu cầu ban đầu

- [Git](https://git-scm.com/downloads)
- [mise](https://mise.jdx.dev/installing-mise.html), hoặc công cụ quản lý phiên bản khác đọc được `.tool-versions`

Repo cố định phiên bản công cụ trong [`.tool-versions`](../.tool-versions), gồm Node.js và pnpm.
Trường `packageManager` trong [`package.json`](../package.json) cũng chỉ định phiên bản pnpm.
Sau khi clone repo, cài các phiên bản này bằng mise.

<details>
<summary>Thiết lập Windows</summary>

1. Mở PowerShell.
2. Cài [`scoop`](https://scoop.sh/).

   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
   ```

3. Cài Git và mise bằng Scoop.

   ```powershell
   scoop install git mise
   ```

</details>

<details>
<summary>Thiết lập macOS</summary>

1. Mở Terminal, iTerm2, Ghostty, Kitty hoặc trình dòng lệnh khác.
2. Cài Git và mise bằng Homebrew.

   ```shell
   brew install git mise
   ```

</details>

<details>
<summary>Thiết lập Linux</summary>

1. Mở trình dòng lệnh.
2. Làm theo [hướng dẫn cài Git trên Linux](https://git-scm.com/downloads/linux).
3. Cài mise theo [phương thức phù hợp với bản phân phối của bạn](https://mise.jdx.dev/installing-mise.html).

</details>

## Cập nhật repo đã clone

> [!WARNING]
>
> Nếu chưa clone repo, bỏ qua phần này.

Nếu chưa cấu hình remote `upstream`, thêm repo Angela trước khi lấy thay đổi:

```shell
git remote add upstream https://github.com/lighthouse2815/Angela.git
```

Lấy thay đổi từ upstream và rebase nhánh `main` cục bộ:

```shell
git fetch --all
git checkout main
git pull upstream main --rebase
```

Nếu đang làm trên nhánh riêng, cập nhật nhánh đó theo repo upstream:

```shell
git checkout <your-branch-name>
git rebase main
```

## Tạo bản fork dự án

Nhấn **Fork** ở góc trên bên phải trang [Angela](https://github.com/lighthouse2815/Angela).

<a id="clone-repo"></a>

## Sao chép kho lưu trữ

```shell
git clone https://github.com/<your-github-username>/airi.git
cd Angela
```

## Tạo nhánh làm việc

```shell
git checkout -b <your-branch-name>
```

## Cài các gói phụ thuộc

Tại thư mục gốc của repo, cài công cụ được ghi trong `.tool-versions`:

```shell
mise install
```

Kiểm tra phiên bản Node.js và pnpm khớp với `.tool-versions`:

```shell
mise exec -- node --version
mise exec -- pnpm --version
```

Phiên bản pnpm cũng phải khớp với trường `packageManager` trong `package.json`.

mise cài pnpm trực tiếp nên không cần Corepack.

Cài các gói phụ thuộc của dự án:

```shell
mise exec -- pnpm install
```

Các ví dụ tiếp theo yêu cầu [kích hoạt mise trong shell](https://mise.jdx.dev/dev-tools/shims.html).
Nếu chưa kích hoạt, chạy lệnh qua `mise exec --`, ví dụ `mise exec -- pnpm typecheck`.

### Lệnh tắt tùy chọn cho trình quản lý gói

[@antfu/ni](https://github.com/antfu-collective/ni) nhận diện trình quản lý gói của repo.

Để dùng các lệnh tắt này, cài `@antfu/ni`:

```shell
mise exec -- npm install --global @antfu/ni
```

- Dùng `ni` thay cho `pnpm install`, `npm install` hoặc `yarn install`.
- Dùng `nr` thay cho `pnpm run`, `npm run` hoặc `yarn run`.

## Chọn ứng dụng cần phát triển

### Stage Tamagotchi (bản desktop)

```shell
pnpm dev:desktop
```

> [!NOTE]
>
> Nếu dùng [@antfu/ni](https://github.com/antfu-collective/ni), chạy:
>
> ```shell
> nr dev:desktop
> ```

> [!NOTE]
>
> Các script `dev` và `start` chạy `install-electron` trước `electron-vite`.
>
> Electron 42 đã bỏ script `postinstall`. Gói `electron` tải tệp thực thi
> khi bạn chạy mục `bin` lần đầu. `electron-vite` đọc `node_modules/electron/path.txt`
> trực tiếp nên không kích hoạt tải xuống. Vì vậy, bản cài mới gặp lỗi
> `Error: Electron uninstall`.
>
> `install-electron` chạy cùng mã với script `postinstall` đã bị bỏ. Lệnh kết thúc
> ngay khi tệp thực thi đã tồn tại.
>
> Bỏ bước này khi `electron-vite` hỗ trợ tải xuống lúc cần.

### Stage Web (bản trình duyệt tại [airi.moeru.ai](https://airi.moeru.ai))

```shell
pnpm dev
```

> [!NOTE]
>
> Nếu dùng [@antfu/ni](https://github.com/antfu-collective/ni), chạy:
>
> ```shell
> nr dev
> ```

### Danh mục thành phần giao diện

Xem các thành phần giao diện trực tiếp tại [airi.moeru.ai/ui](https://airi.moeru.ai/ui/).

### Trang tài liệu

Trang tài liệu nằm trong [moeru-ai/airi-docs](https://github.com/moeru-ai/airi-docs). Đọc README của repo đó để phát triển.

### Tích hợp bot Telegram

Bot được hỗ trợ dùng runtime CLI và bộ nhớ cục bộ. Chạy từ thư mục gốc:

```shell
pnpm telegram
```

Đặt token và danh sách người dùng được phép trong file môi trường Telegram riêng. Không commit thông tin xác thực.
Để nối với desktop, dùng cùng `ANGELA_DATA_DIR`, `ANGELA_WORKSPACE` và đặt `ANGELA_TELEGRAM_SHARED_USER_ID`.
Xem [hướng dẫn runtime chung](../apps/cli/src/companion/README.md) để cấu hình nhân vật và bộ nhớ.

Bản thử nghiệm Postgres/media trong `integrations/telegram/archive` đã được đưa ra khỏi workspace mặc định.
Mã nguồn và dữ liệu cũ được giữ lại. Xem [ghi chú lưu trữ](../integrations/telegram/archive/ARCHIVED.md) trước khi dùng bản đó.

### Tích hợp bot Discord

```shell
cd integrations/discord
```

Cấu hình `.env`

```shell
cp .env .env.local
```

Sửa thông tin xác thực trong `.env.local`.

Chạy bot

```shell
pnpm -F @angela/discord-bot start
```

> [!NOTE]
>
> Nếu dùng [@antfu/ni](https://github.com/antfu-collective/ni), chạy:
>
> ```shell
> nr -F @angela/discord-bot dev
> ```

<a id="agent-minecraft"></a>

### agent Minecraft

```shell
cd integrations/minecraft
```

Mở Minecraft, chia sẻ thế giới với cổng mong muốn rồi điền số cổng vào `.env.local`.

Cấu hình `.env`

```shell
cp .env .env.local
```

Sửa thông tin xác thực trong `.env.local`.

Chạy bot

```shell
pnpm -F @angela/minecraft-bot start
```

> [!NOTE]
>
> Nếu dùng [@antfu/ni](https://github.com/antfu-collective/ni), chạy:
>
> ```shell
> nr -F @angela/minecraft-bot dev
> ```

## Tạo commit

### Trước khi commit

Kiểm tra lint và kiểu dữ liệu TypeScript:

```shell
pnpm lint && pnpm typecheck
```

Nếu commit ảnh, ưu tiên định dạng AVIF. Chuyển ảnh hiện có sang AVIF bằng lệnh:

```shell
pnpm to-avif <PATH_TO_IMAGE_OR_DIRECTORY1> <PATH_2> <PATH_3> ...
```

> [!NOTE]
>
> Nếu đã cài [@antfu/ni](https://github.com/antfu-collective/ni), dùng `nr` để chạy lệnh:
>
> ```shell
> nr lint && nr typecheck
> ```

### Tạo commit

```shell
git add .
git commit -m "<your-commit-message>"
```

### Push lên repo fork

```shell
git push origin <your-branch-name> -u
```

Bạn có thể xem nhánh trên repo fork của mình.

## Tạo pull request

Mở trang [Angela](https://github.com/lighthouse2815/Angela), chọn **Pull requests**, rồi nhấn **New pull request**.
Chọn **Compare across forks**, sau đó chọn repo fork của bạn.

Kiểm tra thay đổi rồi nhấn **Create pull request**.

## Yêu cầu Unit Test trước khi merge

Kiểm tra `Unit Test` phải thành công trước khi merge pull request vào `main`.
Thành viên tổ chức `luoling8192` xác định unit test thất bại là lỗi chặn CI tại
[PR #2290](https://github.com/moeru-ai/airi/pull/2290#issuecomment-5802515112) và
[PR #2214](https://github.com/moeru-ai/airi/pull/2214#issuecomment-5802515813).

[Bộ quy tắc Require Unit Test](rulesets/require-unit-test.json) bổ sung yêu cầu này bên cạnh bộ quy tắc `Protect main` hiện có.
Bộ quy tắc yêu cầu kiểm tra `Unit Test` từ GitHub Actions và không cho phép tài khoản nào bỏ qua.
Các kiểm tra bắt buộc hiện có vẫn có hiệu lực.

Quản trị viên repo phải nhập tệp JSON tại **Settings → Rules → Rulesets → New ruleset → Import a ruleset**.
Nếu đã có `Require Unit Test`, cập nhật bộ quy tắc đó. Không tạo bản trùng.
Merge tài liệu này không tự áp dụng cấu hình trên GitHub.

Repo đã bật merge tự động.
Khi bộ quy tắc hoạt động, merge tự động chờ `Unit Test` và các kiểm tra bắt buộc khác thành công.

## Hoàn thành đóng góp đầu tiên

Bạn đã hoàn thành đóng góp đầu tiên cho dự án. Người bảo trì sẽ xem xét pull request của bạn.
