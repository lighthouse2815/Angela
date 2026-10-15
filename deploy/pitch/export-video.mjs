import process from 'node:process'

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

async function main() {
  const directory = dirname(fileURLToPath(import.meta.url))
  const work = process.env.VIDEO_WORK_DIR || join(tmpdir(), 'angela-pitch-video')
  const output = join(directory, 'video', 'angela-pitch-vi.mp4')
  const narration = JSON.parse(readFileSync(join(directory, 'video', 'narration.vi.json'), 'utf8'))
  const size = { width: 1920, height: 1080 }
  mkdirSync(join(work, 'audio'), { recursive: true })

  const tracks = narration.slides.map((slide, index) => {
    const stem = join(work, 'audio', String(index + 1).padStart(2, '0'))
    const signature = createHash('sha256').update(`${narration.voice}\n${narration.rate}\n${slide.text}`).digest('hex')
    if (!existsSync(`${stem}.mp3`) || !existsSync(`${stem}.srt`) || !existsSync(`${stem}.sha256`) || readFileSync(`${stem}.sha256`, 'utf8') !== signature) {
      console.info(`Tạo giọng đọc ${index + 1}/${narration.slides.length}: ${slide.title}`)
      execFileSync(process.env.EDGE_TTS_BIN || 'edge-tts', [
        '--voice',
        narration.voice,
        `--rate=${narration.rate}`,
        '--text',
        slide.text,
        '--write-media',
        `${stem}.mp3`,
        '--write-subtitles',
        `${stem}.srt`,
      ], { stdio: 'inherit' })
      writeFileSync(`${stem}.sha256`, signature)
    }
    const duration = Number(execFileSync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      `${stem}.mp3`,
    ], { encoding: 'utf8' }).trim())
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error(`Giọng đọc không hợp lệ: ${slide.title}`)
    return { stem, duration, hold: duration + (index === narration.slides.length - 1 ? 2.6 : 1.6) }
  })

  const sourceHash = createHash('sha256')
  for (const path of ['video/narration.vi.json', 'public/index.html', 'public/pitch.css', 'public/pitch.js'])
    sourceHash.update(readFileSync(join(directory, path)))
  const signature = sourceHash.digest('hex')
  const recording = join(work, 'recording.json')
  let video
  let cues
  if (process.env.VIDEO_RESUME === '1') {
    const saved = JSON.parse(readFileSync(recording, 'utf8'))
    if (saved.signature !== signature || saved.cues.length !== tracks.length)
      throw new Error('Nội dung đã đổi. Chạy lại không có VIDEO_RESUME để ghi hình mới.')
    video = saved.video
    cues = saved.cues
  }
  else {
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({ viewport: size, recordVideo: { dir: work, size } })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      page.on('response', (response) => {
        if (response.status() >= 400)
          errors.push(`${response.status()} ${response.url()}`)
      })
      page.on('console', (message) => {
        if (message.text().startsWith('VIDEO:'))
          console.info(message.text())
      })
      await page.goto(process.env.PITCH_URL || 'http://127.0.0.1:8098', { waitUntil: 'networkidle' })
      await page.evaluate(async () => {
        await document.fonts.ready
        await Promise.all([...document.images].map(image => image.decode()))
        for (const audio of document.querySelectorAll('audio')) {
          audio.pause()
          audio.muted = true
        }
      })
      const titles = await page.locator('.slide').evaluateAll(slides => slides.map(slide => slide.getAttribute('aria-label')))
      if (JSON.stringify(titles) !== JSON.stringify(narration.slides.map(slide => slide.title)))
        throw new Error('Kịch bản thuyết minh không khớp với slide HTML.')
      await page.addStyleTag({ content: `
    .chapters, #overview, .presenter-controls, .prompt-chips,
    .cover .text-button, .closing-actions, .voice-trigger { visibility: hidden !important; }
    * { cursor: none !important; }
  ` })
      await page.evaluate(() => {
        document.querySelector('.demo-caption').textContent = 'Hội thoại minh họa ý tưởng học tập.'
        const slate = document.createElement('div')
        slate.id = 'video-slate'
        slate.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgb(0,255,0)'
        document.body.append(slate)
      })
      await page.waitForTimeout(800)
      cues = await page.evaluate(async (holds) => {
        const started = performance.now()
        const offsets = []
        const firstSlide = document.querySelector('.slide.active')
        firstSlide.classList.remove('active')
        void firstSlide.offsetWidth
        firstSlide.classList.add('active')
        document.getElementById('video-slate').remove()
        for (const [index, hold] of holds.entries()) {
          if (index > 0)
            window.goTo(index)
          offsets.push((performance.now() - started) / 1000)
          console.info(`VIDEO: Slide ${index + 1}/${holds.length}`)
          await new Promise(resolve => setTimeout(resolve, hold * 1000))
        }
        return offsets
      }, tracks.map(track => track.hold))
      if (errors.length)
        throw new Error(errors.join('\n'))
      video = await page.video().path()
      await page.close()
    }
    finally {
      await browser.close()
    }
    writeFileSync(recording, JSON.stringify({ signature, video, cues }))
  }

  // The green slate marks the first presentation frame in the browser recording.
  const pixels = execFileSync('ffmpeg', [
    '-v',
    'error',
    '-i',
    video,
    '-vf',
    'crop=2:2:0:0,scale=1:1',
    '-pix_fmt',
    'rgb24',
    '-f',
    'rawvideo',
    'pipe:1',
  ])
  const frameRate = execFileSync('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=r_frame_rate',
    '-of',
    'csv=p=0',
    video,
  ], { encoding: 'utf8' }).trim().split('/').map(Number)
  let lastSlate = -1
  for (let offset = 0; offset < pixels.length; offset += 3) {
    if (pixels[offset] < 30 && pixels[offset + 1] > 220 && pixels[offset + 2] < 30)
      lastSlate = offset / 3
  }
  if (lastSlate < 0)
    throw new Error('Không tìm thấy mốc bắt đầu video. Kiểm tra bản ghi trình duyệt.')
  const start = (lastSlate + 1) * frameRate[1] / frameRate[0]
  const duration = cues.at(-1) + tracks.at(-1).hold
  const timestamp = (seconds) => {
    const milliseconds = Math.round(seconds * 1000)
    const hours = Math.floor(milliseconds / 3600000)
    const minutes = Math.floor(milliseconds / 60000) % 60
    const wholeSeconds = Math.floor(milliseconds / 1000) % 60
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')},${String(milliseconds % 1000).padStart(3, '0')}`
  }
  const parseTimestamp = value => value.split(/[:,]/).map(Number).reduce((total, part, index) => total + part * [3600, 60, 1, 0.001][index], 0)
  const subtitles = []
  for (const [index, track] of tracks.entries()) {
    const blocks = readFileSync(`${track.stem}.srt`, 'utf8').trim().split(/\r?\n\r?\n/)
    for (const block of blocks) {
      const [, timing, ...text] = block.split(/\r?\n/)
      const [from, to] = timing.split(' --> ').map(parseTimestamp)
      const shift = cues[index] + 0.6
      subtitles.push(`${subtitles.length + 1}\n${timestamp(from + shift)} --> ${timestamp(to + shift)}\n${text.join('\n')}`)
    }
  }
  const subtitlePath = join(directory, 'video', 'angela-pitch-vi.srt')
  writeFileSync(subtitlePath, `${subtitles.join('\n\n')}\n`)
  const chapters = narration.slides.map((slide, index) => `
[CHAPTER]
TIMEBASE=1/1000
START=${Math.round(cues[index] * 1000)}
END=${Math.round((cues[index + 1] ?? duration) * 1000)}
title=${slide.title}
`).join('')
  const metadata = join(work, 'chapters.ffmetadata')
  writeFileSync(metadata, `;FFMETADATA1\ntitle=Angela — Người bạn AI trong hành trình học tập\n${chapters}`)
  writeFileSync(join(directory, 'video', 'timing.json'), `${JSON.stringify({
    voice: narration.voice,
    duration,
    slides: narration.slides.map((slide, index) => ({ title: slide.title, start: cues[index], speechStart: cues[index] + 0.6, speechDuration: tracks[index].duration })),
  }, null, 2)}\n`)

  const filters = [
    `[0:v]trim=start=${start}:duration=${duration},setpts=PTS-STARTPTS,fps=30,fade=t=out:st=${duration - 1}:d=1[v]`,
    ...tracks.map((track, index) => `[${index + 1}:a]aresample=48000,adelay=${Math.round((cues[index] + 0.6) * 1000)}:all=1[n${index}]`),
    `${tracks.map((_, index) => `[n${index}]`).join('')}amix=inputs=${tracks.length}:normalize=0,apad,atrim=duration=${duration},loudnorm=I=-16:TP=-1.5:LRA=7[voice]`,
    `[${tracks.length + 1}:a]aresample=48000,volume=0.065,afade=t=in:d=1.2,afade=t=out:st=${duration - 2}:d=2,atrim=duration=${duration}[music]`,
    '[voice][music]amix=inputs=2:normalize=0,alimiter=limit=0.95[a]',
  ]
  console.info('Ghép hình, giọng đọc, nhạc nền, phụ đề và chương vào MP4...')
  execFileSync('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel',
    'warning',
    '-i',
    video,
    ...tracks.flatMap(track => ['-i', `${track.stem}.mp3`]),
    '-stream_loop',
    '-1',
    '-i',
    join(directory, 'public', 'assets', 'doki-doki-main-theme.mp3'),
    '-i',
    subtitlePath,
    '-i',
    metadata,
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[v]',
    '-map',
    '[a]',
    '-map',
    `${tracks.length + 2}:s:0`,
    '-map_metadata',
    String(tracks.length + 3),
    '-map_chapters',
    String(tracks.length + 3),
    '-metadata:s:a:0',
    'language=vie',
    '-metadata:s:s:0',
    'language=vie',
    '-metadata',
    `comment=Giọng AI: ${narration.voice}. Nhạc nền: Team Salvato.`,
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '24',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-ar',
    '48000',
    '-c:s',
    'mov_text',
    '-movflags',
    '+faststart',
    '-t',
    String(duration),
    output,
  ], { stdio: 'inherit' })
  console.info(`Đã xuất: ${output}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
