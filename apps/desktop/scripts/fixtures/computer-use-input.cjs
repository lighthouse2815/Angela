/** Electron needs a JavaScript entry point before tsx can load the ESM smoke and production runtime. */
const { tsImport } = require('tsx/esm/api')

tsImport('../computer-use-input-smoke.ts', __filename).catch((error) => {
  console.error(error)
  require('electron').app.exit(1)
})
