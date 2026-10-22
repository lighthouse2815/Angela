import process from 'node:process'

function sample(label) {
  globalThis.gc?.()
  const { rss, heapUsed, heapTotal, external } = process.memoryUsage()
  process.send?.({ label, rss, heapUsed, heapTotal, external })
}

// The piped-input iterator starts only after the CLI finishes its normal startup path.
function ready(event) {
  if (event !== 'readable')
    return
  process.stdin.off('newListener', ready)
  setImmediate(() => sample('entry.idle'))
}
process.stdin.on('newListener', ready)
process.once('beforeExit', () => sample('entry.message.1'))
