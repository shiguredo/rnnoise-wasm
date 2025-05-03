import { Rnnoise } from '@shiguredo/rnnoise-wasm'

document.addEventListener('DOMContentLoaded', async () => {
  const rnnoise = await Rnnoise.load({
    assetsPath: '.',
  })
  console.log(rnnoise)
})
