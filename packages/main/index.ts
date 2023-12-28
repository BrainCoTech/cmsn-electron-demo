import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { release } from 'os'
import { join } from 'path'
import { CMSNDevice, cmsn_electron } from 'crimson-sdk'
import './samples/electron-store'
import './samples/npm-esm-packages'

const cmsn = cmsn_electron;
const cmsnRequest = 'cmsn-request';
const cmsnResponse = 'cmsn-response';

// Disable GPU Acceleration for Windows 7
if (release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null

async function createWindow() {
  win = new BrowserWindow({
    title: 'Main window',
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs')
    },
  })

  ipcMain.on(cmsnRequest, async (event, arg) => {
    console.log('main receive:', arg);
    var cmd = arg.cmd;
    switch (cmd) {
      case 'initSDK':
        await cmsn.initSDK(false, (e: Error | null) => {
          if (e && e.message) {
            console.error(e.message);
            event.reply(cmsnResponse, { cmd: 'onError', error: e });
          }
        }, (adapterAvailable: boolean) => {
          console.log('adapterAvailable >>>', adapterAvailable);
          event.reply(cmsnResponse, { cmd: 'onAdapterAvailableChanged', adapterAvailable: adapterAvailable });
        });
        // subscribe data: attention, meditation, social
        cmsn.setDataSubscription(true, true, true)
        cmsn.setSocialSession(false)
        break;
      case 'disposeSDK':
        await cmsn.disposeSDK();
        break;

      case 'startScan':
        await cmsn.startScan(
          (adapterScanning: boolean) => {
            event.reply(cmsnResponse, { cmd: 'onScanning', adapterScanning: adapterScanning });
          },
          (devices: Array<CMSNDevice>) => {
            event.reply(cmsnResponse, {
              cmd: 'onFoundDevices',
              devices: devices.map((e: CMSNDevice) => ({
                id: e.id,
                name: e.name,
                isInPairingMode: e.isInPairingMode,
                batteryLevel: e.batteryLevel,
              })),
            });
          }
        );
        break;
      case 'stopScan':
        await cmsn.stopScan();
        break;

      case 'connect':
        var deviceId = arg.deviceId;
        const deviceListener = {
          onError: (_: CMSNDevice, error: Error | null) => {
            event.reply(cmsnResponse, { deviceId: deviceId, cmd: 'onError', error: error });
          },
          onDeviceInfoReady: (_: CMSNDevice, deviceInfo: Map<String, any>) => {
            event.reply(cmsnResponse, { deviceId: deviceId, cmd: 'onDeviceInfoReady', deviceInfo: deviceInfo });
          },
          onConnectivityChanged: (_: CMSNDevice, connectivity: Number) => {
            event.reply(cmsnResponse, { deviceId: deviceId, cmd: 'onConnectivityChanged', connectivity: connectivity });
          },
          onContactStateChanged: (_: CMSNDevice, contactState: Number) => {
            event.reply(cmsnResponse, { deviceId: deviceId, cmd: 'onContactStateChanged', contactState: contactState });
          },
          onOrientationChanged: (_: CMSNDevice, orientation: Number) => {
            event.reply(cmsnResponse, { deviceId: deviceId, cmd: 'onOrientationChanged', orientation: orientation });
          },
          onIMUData: (_: CMSNDevice, imu: Map<String, any>) => {
            event.reply(cmsnResponse, { deviceId: deviceId, cmd: 'onIMUData', imu: imu });
          },
          onEEGData: (_: CMSNDevice, eeg: Map<String, any>) => {
            event.reply(cmsnResponse, { deviceId: deviceId, cmd: 'onEEGData', eeg: eeg });
          },
          onBrainWave: (_: CMSNDevice, stats: Map<String, any>) => {
            event.reply(cmsnResponse, { deviceId: deviceId, cmd: 'onBrainWave', stats: stats });
          },
          onAttention: (_: CMSNDevice, attention: Number) => {
            event.reply(cmsnResponse, { deviceId: deviceId, cmd: 'onAttention', attention: attention });
          },
          onMeditation: (_: CMSNDevice, meditation: Number) => {
            event.reply(cmsnResponse, { deviceId: deviceId, cmd: 'onMeditation', meditation: meditation });
          },
          onSocialEngagement: (_: CMSNDevice, social: Number) => {
            event.reply(cmsnResponse, { deviceId: deviceId, cmd: 'onSocialEngagement', social: social });
          },
        };
        await cmsn.connect(deviceId, deviceListener);
        break;
      case 'disconnect':
        await cmsn.disconnect(arg.deviceId);
        break;
      case 'disconnectAll':
        await cmsn.disconnectAll();
      case 'getConnectivity':
        var deviceId = arg.deviceId;
        var connectivity = cmsn.getConnectivity(deviceId);
        event.reply(cmsnResponse, { deviceId: deviceId, cmd: 'onConnectivityChanged', connectivity: connectivity });
        break;
      case 'getContactState':
        var deviceId = arg.deviceId;
        var contactState = cmsn.getContactState(deviceId);
        event.reply(cmsnResponse, { deviceId: deviceId, cmd: 'onContactStateChanged', contactState: contactState });
        break;
      case 'getOrientation':
        var deviceId = arg.deviceId;
        var orientation = cmsn.getOrientation(deviceId);
        event.reply(cmsnResponse, { deviceId: deviceId, cmd: 'onOrientationChanged', orientation: orientation });
        break;
      case 'setSleepIdleTime':
        var deviceId = arg.deviceId;
        var timeInSeconds = 600;
        cmsn.setSleepIdleTime(deviceId, timeInSeconds, (success: boolean, error: string | null) => {
          if (success) {
            console.log('setSleepIdleTime success');
          } else {
            console.error('setSleepIdleTime error: ', error);
          }
        });
        break;  
      default:
        break;
    }
  });

  if (app.isPackaged) {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  } else {
    // 🚧 Use ['ENV_NAME'] avoid vite:define plugin
    const url = `http://${process.env['VITE_DEV_SERVER_HOST']}:${process.env['VITE_DEV_SERVER_PORT']}`

    win.loadURL(url)
    win.webContents.openDevTools()
  }

  // Test active push message to Renderer-process
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', process.versions)
  })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
  cmsn.disposeSDK();
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})
