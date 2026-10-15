const slides = [...document.querySelectorAll('.slide')]
const dotsBox = document.getElementById('progress-dots')
const picker = document.getElementById('slide-picker')
const pickerGrid = document.getElementById('picker-grid')
const notesToggle = document.getElementById('notes-toggle')
const voiceOrb = document.getElementById('voice-orb')
const voiceTrigger = document.getElementById('voice-trigger')
const voiceStatus = document.getElementById('voice-status')
const backgroundMusic = document.getElementById('background-music')
const musicToggle = document.getElementById('music-toggle')
const musicVolume = document.getElementById('music-volume')
const musicStatus = document.getElementById('music-status')
const speechSupported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
let current = -1
let musicRequested = false

function updateMusicVolume() {
  backgroundMusic.volume = Number(musicVolume.value) / 100 * (voiceOrb.classList.contains('speaking') ? 0.25 : 1)
  musicVolume.setAttribute('aria-valuetext', `${musicVolume.value}%`)
}

function updateMusicState() {
  const playing = !backgroundMusic.paused
  musicToggle.setAttribute('aria-pressed', String(playing))
  musicToggle.setAttribute('aria-label', playing ? 'Tạm dừng nhạc nền' : 'Bật nhạc nền')
  musicToggle.querySelector('use').setAttribute('href', `./assets/icons.svg#volume-${playing ? '2' : 'x'}`)
}

function startMusic() {
  musicRequested = true
  musicStatus.textContent = ''
  backgroundMusic.play().catch((error) => {
    if (error.name !== 'AbortError')
      musicStatus.textContent = 'Chưa phát được nhạc nền. Bấm nút Nhạc nền để thử lại.'
  })
}

musicToggle.addEventListener('click', () => {
  musicRequested = true
  if (backgroundMusic.paused)
    startMusic()
  else
    backgroundMusic.pause()
})
musicVolume.addEventListener('input', updateMusicVolume)
backgroundMusic.addEventListener('play', updateMusicState)
backgroundMusic.addEventListener('pause', updateMusicState)
backgroundMusic.addEventListener('error', () => {
  updateMusicState()
  musicStatus.textContent = 'Không tải được nhạc nền. Kiểm tra kết nối rồi tải lại trang.'
})
document.addEventListener('click', (event) => {
  if (!musicRequested && !event.target.closest('#music-controls'))
    startMusic()
})
updateMusicVolume()

slides.forEach((slide, index) => {
  const reveals = slide.querySelectorAll(`
    .eyebrow, h1, h2, .cover-statement, .cover-copy > .intro, .lead,
    .text-button, .cover-bottom, .reason-list article, .problem-track article,
    .audience-main, .audience-side article, .opportunity-from, .opportunity-to,
    .capabilities article, .learning-steps li, .demo-window, .simple-points p,
    .memory-board, .interaction-grid article, .terminal, .value-points article,
    .status-columns article, .architecture-entry, .architecture-core,
    .architecture-services > div, .challenge-grid article, .solution-table article,
    .roadmap article, .evaluation-grid article, .future-path article,
    .future-principle, .bottom-caption, .value-footer, .challenge-question,
    .closing-ask, .closing-actions
  `)
  let order = 0
  reveals.forEach((element) => {
    if (element.parentElement.closest('[data-reveal]'))
      return
    element.dataset.reveal = ''
    element.style.setProperty('--reveal-delay', `${Math.min(order * 65, 455)}ms`)
    order++
  })
  slide.addEventListener('animationend', (event) => {
    if (event.target === slide && event.animationName === 'slide-depart')
      slide.classList.remove('leaving')
  })

  const dot = document.createElement('button')
  dot.className = 'progress-dot'
  dot.title = `Slide ${index + 1}: ${slide.getAttribute('aria-label')}`
  dot.setAttribute('aria-label', dot.title)
  dot.addEventListener('click', () => goTo(index))
  dotsBox.appendChild(dot)

  const entry = document.createElement('button')
  const number = document.createElement('span')
  number.textContent = String(index + 1).padStart(2, '0')
  entry.append(number, document.createTextNode(slide.getAttribute('aria-label')))
  entry.addEventListener('click', () => {
    goTo(index)
    picker.close()
  })
  pickerGrid.appendChild(entry)
})

function goTo(index) {
  if (index < 0 || index >= slides.length || index === current)
    return
  resetArtwork()
  const previous = slides[current]
  document.getElementById('stage').dataset.direction = index > current ? 'forward' : 'backward'
  current = index
  slides.forEach((slide, position) => {
    const active = position === current
    slide.classList.remove('leaving')
    slide.classList.toggle('active', active)
    slide.inert = !active
    slide.setAttribute('aria-hidden', String(!active))
    dotsBox.children[position].classList.toggle('active', active)
    dotsBox.children[position].setAttribute('aria-current', String(active))
    pickerGrid.children[position].setAttribute('aria-current', String(active))
  })
  if (previous && !reducedMotion.matches)
    previous.classList.add('leaving')
  slides[current].scrollTop = 0
  document.getElementById('slide-current').textContent = String(current + 1).padStart(2, '0')
  document.getElementById('slide-total').textContent = String(slides.length).padStart(2, '0')
  document.getElementById('section-label').textContent = slides[current].dataset.section
  document.getElementById('slide-announcement').textContent = `Slide ${current + 1}: ${slides[current].getAttribute('aria-label')}`
  document.getElementById('progress-fill').style.width = `${(current + 1) / slides.length * 100}%`
  document.getElementById('prev').disabled = current === 0
  document.getElementById('next').disabled = current === slides.length - 1
  const chapters = [...document.querySelectorAll('.chapter')]
  chapters.forEach((chapter, position) => {
    const start = Number(chapter.dataset.jump)
    const end = Number(chapters[position + 1]?.dataset.jump ?? slides.length)
    chapter.classList.toggle('selected', current >= start && current < end)
  })
  if (speechSupported && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }
}

reducedMotion.addEventListener('change', () => {
  document.querySelectorAll('.slide.leaving').forEach(slide => slide.classList.remove('leaving'))
})

function toggleNotes() {
  const open = document.body.classList.toggle('notes-open')
  notesToggle.setAttribute('aria-pressed', String(open))
  notesToggle.setAttribute('aria-label', open ? 'Ẩn ghi chú thuyết trình' : 'Hiện ghi chú thuyết trình')
}

async function toggleFullscreen() {
  if (document.fullscreenElement)
    await document.exitFullscreen()
  else
    await document.documentElement.requestFullscreen?.()
}

document.querySelectorAll('[data-jump]').forEach((button) => {
  button.addEventListener('click', () => goTo(Number(button.dataset.jump)))
})
document.getElementById('prev').addEventListener('click', () => goTo(current - 1))
document.getElementById('next').addEventListener('click', () => goTo(current + 1))
notesToggle.addEventListener('click', toggleNotes)
document.getElementById('fullscreen').addEventListener('click', () => toggleFullscreen().catch(() => {}))
document.getElementById('overview').addEventListener('click', () => picker.showModal())
document.getElementById('close-picker').addEventListener('click', () => picker.close())
document.getElementById('print-deck').addEventListener('click', () => {
  picker.close()
  window.print()
})
document.addEventListener('keydown', (event) => {
  if (picker.open || event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input, select, textarea'))
    return
  if (event.key === ' ' && event.target.closest('button, a'))
    return
  if (!musicRequested && ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key))
    startMusic()
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key)) {
    event.preventDefault()
    goTo(current + 1)
  }
  if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) {
    event.preventDefault()
    goTo(current - 1)
  }
  if (event.key === 'Home') {
    event.preventDefault()
    goTo(0)
  }
  if (event.key === 'End') {
    event.preventDefault()
    goTo(slides.length - 1)
  }
  if (event.key.toLowerCase() === 'n')
    toggleNotes()
  if (event.key.toLowerCase() === 'o')
    picker.showModal()
  if (event.key.toLowerCase() === 'f')
    toggleFullscreen().catch(() => {})
})
let touchX = 0
let touchY = 0
const stage = document.getElementById('stage')
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
let pointerFrame = 0

function resetArtwork() {
  cancelAnimationFrame(pointerFrame)
  for (const property of ['--art-yaw', '--art-pitch', '--light-x', '--light-y'])
    stage.style.removeProperty(property)
}

stage.addEventListener('pointermove', (event) => {
  if (!finePointer.matches || reducedMotion.matches || document.hidden || picker.open)
    return
  cancelAnimationFrame(pointerFrame)
  pointerFrame = requestAnimationFrame(() => {
    const bounds = stage.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / bounds.width
    const y = (event.clientY - bounds.top) / bounds.height
    stage.style.setProperty('--art-yaw', `${(x - 0.5) * 4}deg`)
    stage.style.setProperty('--art-pitch', `${(0.5 - y) * 3}deg`)
    stage.style.setProperty('--light-x', `${25 + x * 50}%`)
    stage.style.setProperty('--light-y', `${20 + y * 50}%`)
  })
})
stage.addEventListener('pointerleave', resetArtwork)
reducedMotion.addEventListener('change', resetArtwork)
finePointer.addEventListener('change', resetArtwork)
document.addEventListener('visibilitychange', () => {
  document.documentElement.toggleAttribute('data-motion-paused', document.hidden)
  if (document.hidden)
    resetArtwork()
})
window.addEventListener('beforeprint', resetArtwork)

stage.addEventListener('touchstart', (event) => {
  touchX = event.changedTouches[0].screenX
  touchY = event.changedTouches[0].screenY
}, { passive: true })
stage.addEventListener('touchend', (event) => {
  const dx = event.changedTouches[0].screenX - touchX
  const dy = event.changedTouches[0].screenY - touchY
  if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.45)
    goTo(current + (dx < 0 ? 1 : -1))
}, { passive: true })

// These responses illustrate the pitch. They do not call an AI provider.
const responses = {
  recursion: ['Thử thêm một bài đệ quy nhé.', 'Hãy viết hàm tính tổng từ 1 đến n. Bạn thử xác định hai phần: kết quả khi n = 0, và cách dùng kết quả của n − 1.'],
  oop: ['Mình muốn ôn lại OOP.', 'Ví dụ lớp SinhVien có hoTen và phương thức gioiThieu(). Bạn thử tạo hai đối tượng có tên khác nhau, rồi gọi phương thức trên từng đối tượng.'],
  motivation: ['Mình đang hơi nản, học mãi chưa hiểu.', 'Ta thử một phần nhỏ thôi nhé. Gửi một đoạn code ngắn đang vướng, mình cùng xem từng dòng. Nếu mệt, lưu chỗ này để buổi sau học tiếp.'],
}
const chat = document.getElementById('chat-scroll')
document.querySelectorAll('[data-demo]').forEach((button) => {
  button.addEventListener('click', () => {
    const [question, answer] = responses[button.dataset.demo]
    for (const [role, text] of [['user', question], ['bot', answer]]) {
      const bubble = document.createElement('div')
      bubble.className = `chat-bubble ${role}`
      bubble.textContent = text
      chat.appendChild(bubble)
    }
    chat.scrollTop = chat.scrollHeight
  })
})

function setSpeaking(speaking) {
  voiceOrb.classList.toggle('speaking', speaking)
  voiceTrigger.textContent = speaking ? 'Dừng lời chào ■' : 'Nghe lời chào ↗'
  updateMusicVolume()
}

// The voice sample uses the browser voice, separate from the application's voice providers.
function playVoice() {
  if (!speechSupported) {
    voiceStatus.textContent = 'Trình duyệt này chưa hỗ trợ giọng đọc. Bạn có thể xem phần hội thoại mẫu.'
    return
  }
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel()
    setSpeaking(false)
    voiceStatus.textContent = 'Đã dừng lời chào.'
    return
  }
  const utterance = new SpeechSynthesisUtterance('Chào bạn, mình là Angela. Bạn đang học phần nào? Mình cùng xem từng bước nhé.')
  utterance.lang = 'vi-VN'
  utterance.rate = 0.95
  const voice = window.speechSynthesis.getVoices().find(item => item.lang.toLowerCase().startsWith('vi'))
  if (voice)
    utterance.voice = voice
  utterance.onstart = () => {
    setSpeaking(true)
    voiceStatus.textContent = 'Đang phát giọng đọc có sẵn trên thiết bị.'
  }
  utterance.onend = () => {
    setSpeaking(false)
    voiceStatus.textContent = 'Đã phát xong. Bạn có thể nghe lại.'
  }
  utterance.onerror = () => {
    setSpeaking(false)
    voiceStatus.textContent = 'Chưa phát được. Kiểm tra giọng tiếng Việt của thiết bị hoặc thử trình duyệt khác.'
  }
  window.speechSynthesis.speak(utterance)
}
voiceOrb.addEventListener('click', playVoice)
voiceTrigger.addEventListener('click', playVoice)
const heights = [12, 18, 28, 16, 34, 42, 24, 48, 36, 25, 43, 52, 32, 46, 28, 40, 22, 33, 18, 26, 12]
heights.forEach((height, index) => {
  const bar = document.createElement('span')
  bar.style.setProperty('--h', `${height}px`)
  bar.style.setProperty('--delay', `${index * -0.08}s`)
  document.getElementById('sound-bars').appendChild(bar)
})
goTo(0)
