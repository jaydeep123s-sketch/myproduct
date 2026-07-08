const {
  app, BrowserWindow, globalShortcut, ipcMain,
  clipboard, desktopCapturer, screen
} = require('electron')
const path = require('path')

let mainWin       = null
let isVisible     = true
let currentOpacity = 0.92

function createWindow() {
  const { width: sw } = screen.getPrimaryDisplay().workAreaSize

  mainWin = new BrowserWindow({
    width: 540,
    height: 380,
    x: sw - 560,
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    minWidth: 380,
    minHeight: 240,
    maxWidth: 800,
    maxHeight: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  mainWin.setContentProtection(true)
  mainWin.loadFile(path.join(__dirname, '../index.html'))
  mainWin.setOpacity(currentOpacity)
  mainWin.setAlwaysOnTop(true, 'screen-saver')
  mainWin.on('closed', () => {
    mainWin = null
    // Auto-recreate after 500ms agar accidentally close hua
    setTimeout(() => {
      if (!mainWin) createWindow()
    }, 500)
  })
}

app.whenReady().then(() => {
  createWindow()

  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (!mainWin) return
    isVisible = !isVisible
    if (isVisible) { mainWin.show(); mainWin.setOpacity(currentOpacity) }
    else mainWin.hide()
  })

  globalShortcut.register('CommandOrControl+Shift+S', () => {
    if (mainWin) mainWin.webContents.send('trigger-screenshot')
  })

  globalShortcut.register('CommandOrControl+Shift+L', () => {
    if (mainWin) mainWin.webContents.send('toggle-listen')
  })

  globalShortcut.register('CommandOrControl+Shift+C', () => {
    if (mainWin) mainWin.webContents.send('copy-answer')
  })

  globalShortcut.register('Escape', () => {
    if (mainWin && isVisible) { mainWin.hide(); isVisible = false }
  })
})

// ── IPC Handlers ──

ipcMain.on('hide-window', () => {
  if (!mainWin) return
  mainWin.hide(); isVisible = false
})

ipcMain.on('show-window', () => {
  if (!mainWin) return
  mainWin.show(); mainWin.setOpacity(currentOpacity); isVisible = true
})

ipcMain.on('copy-text', (_, text) => clipboard.writeText(text))

ipcMain.on('set-opacity', (_, val) => {
  currentOpacity = val
  if (mainWin) mainWin.setOpacity(val)
})

ipcMain.on('resize-window', (_, { width, height }) => {
  if (!mainWin) return
  const clamped = Math.min(Math.max(height, 240), 800)
  mainWin.setSize(width || 540, clamped)
})

ipcMain.on('set-always-on-top', (_, val) => {
  if (mainWin) mainWin.setAlwaysOnTop(val, 'screen-saver')
})

// FIX #2: save-to-db handler — no crash on answer complete
ipcMain.on('save-to-db', (_, data) => {
  // Future: SQLite integration yahan hogi
  console.log('[DB] Q:', (data.question || '').slice(0, 60))
})

// FIX #11: get-screen-sources — saare screens return karo, renderer select karega
ipcMain.handle('get-screen-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 }
    })
    return sources.map(s => ({
      id:        s.id,
      name:      s.name,
      thumbnail: s.thumbnail.toDataURL()
    }))
  } catch (e) {
    console.error('get-screen-sources:', e)
    return []
  }
})

ipcMain.handle('get-audio-devices', async () => [])

// v25: full-res single screenshot for active window
ipcMain.handle('capture-full-screen', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 2560, height: 1440 }
    })
    if (!sources.length) return null
    // Primary display first
    const primary = sources[0]
    return {
      id: primary.id,
      name: primary.name,
      thumbnail: primary.thumbnail.toDataURL()
    }
  } catch(e) {
    console.error('capture-full-screen:', e)
    return null
  }
})

app.on('will-quit', () => globalShortcut.unregisterAll())

// window-all-closed pe QUIT mat karo — sirf tray/shortcut se band karo
// Agar mainWin accidentally close ho jaye, recreate karo
app.on('window-all-closed', () => {
  // Do NOT quit — keep app alive in background
  // macOS pe yeh default hai, Windows pe bhi same behavior chahiye
})

app.on('activate', () => {
  if (!mainWin) createWindow()
})
