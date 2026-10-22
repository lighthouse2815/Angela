{
  lib,
  stdenvNoCC,
  fetchPnpmDeps,

  cacert,
  gitMinimal,
  nodejs,
  pnpm_11,
  pnpmConfigHook,
}:

let
  pnpm = pnpm_11;
in

stdenvNoCC.mkDerivation (final: {
  pname = "angela";
  version = (builtins.fromJSON (builtins.readFile ../package.json)).version;

  src = lib.cleanSourceWith {
    src = ../.;
    filter =
      path: type:
      let
        baseName = baseNameOf (toString path);
        isEditorMetadataDirectory = type == "directory" && (baseName == ".vscode" || baseName == ".zed");
      in
      !isEditorMetadataDirectory;
  };

  pnpmDeps = fetchPnpmDeps {
    inherit (final) pname version src;
    inherit pnpm;
    fetcherVersion = 4;
    hash = builtins.readFile ./pnpm-deps-hash.txt;
  };

  # Cache of assets downloaded during vite build
  assets = stdenvNoCC.mkDerivation {
    pname = "angela-assets";
    inherit (final) version src pnpmDeps;

    nativeBuildInputs = [
      cacert # For network request
      gitMinimal # For unplugin-info
      nodejs
      pnpm
      pnpmConfigHook
    ];

    buildPhase = ''
      runHook preBuild

      pnpm -F @proj-airi/stage-web... run build

      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall

      mkdir -p "$out"
      cp -r .cache/* "$out"
      cp -r apps/stage-web/.cache/assets/* "$out"

      runHook postInstall
    '';

    outputHashMode = "recursive";
    outputHashAlgo = "sha256";
    outputHash = builtins.readFile ./assets-hash.txt;
  };

  meta = {
    description = "Angela AI companion for conversation and learning";
    longDescription = ''
      Angela is an AI companion for conversation, learning, voice interaction,
      and desktop assistance. This package builds the desktop application.
    '';
    homepage = "https://github.com/lighthouse2815/Angela";
    changelog = "https://github.com/lighthouse2815/Angela/releases/tag/v${final.version}";
    # The desktop bundle includes the nonfree Cubism SDK, so this package remains
    # marked unfree even though Angela's own source is MIT licensed.
    license = lib.licenses.unfree;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
    mainProgram = final.pname;
    maintainers = [ ];
  };
})
