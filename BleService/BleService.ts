import {
  BleError,
  BleErrorCode,
  BleManager,
  Device,
  State as BluetoothState,
  LogLevel,
  type Subscription
} from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';

class BLEServiceInstance {
  manager: BleManager;
  device: Device | null;
  characteristicMonitor: Subscription | null;
  isCharacteristicMonitorDisconnectExpected: boolean;

  constructor() {
    this.device = null;
    this.characteristicMonitor = null;
    this.manager = new BleManager();
    this.manager.setLogLevel(LogLevel.Verbose);
    this.isCharacteristicMonitorDisconnectExpected = false;
  }

  async initializeBLE() {
    return new Promise<void>(resolve => {
      const subscription = this.manager.onStateChange(state => {
        switch (state) {
          case BluetoothState.Unsupported:
            this.showErrorToast('');
            break;
          case BluetoothState.PoweredOff:
            this.onBluetoothPowerOff();
            this.manager.enable().catch((error: BleError) => {
              if (error.errorCode === BleErrorCode.BluetoothUnauthorized) {
                this.requestBluetoothPermission();
              }
            });
            break;
          case BluetoothState.Unauthorized:
            this.requestBluetoothPermission();
            break;
          case BluetoothState.PoweredOn:
            resolve();
            subscription.remove();
            break;
          default:
            console.error('Unsupported state: ', state);
        }
      }, true);
    });
  }

  async requestBluetoothPermission() {
    if (Platform.OS === 'ios') {
      return true;
    }
    if (Platform.OS === 'android' && PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION) {
      const apiLevel = parseInt(Platform.Version.toString(), 10);
      if (apiLevel < 31) {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
      if (PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN && PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT) {
        const result = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
        ]);
        return (
          result['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
          result['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED
        );
      }
    }
    this.showErrorToast('Permission have not been granted');
    return false;
  }

  onBluetoothPowerOff() {
    this.showErrorToast('Bluetooth is turned off');
  }

  showErrorToast(message: string) {
    console.error(message);
  }

  async connectToDevice(deviceId: string) {
    try {
      this.device = await this.manager.connectToDevice({ id: deviceId });
      return this.device;
    } catch (error) {
      console.error('Error connecting to device:', error);
      throw error;
    }
  }

  async disconnectDevice() {
    try {
      if (this.device) {
        await this.device.cancelConnection();
        this.device = null;
      }
    } catch (error) {
      console.error('Error disconnecting device:', error);
    }
  }

  async writeDataToDevice(serviceUUID: string, characteristicUUID: string, data: string) {
    try {
      if (this.device) {
        const service = await this.device.getService(serviceUUID);
        const characteristic = await service.getCharacteristic(characteristicUUID);
        await characteristic.writeWithResponse(data);
      } else {
        throw new Error('No connected device');
      }
    } catch (error) {
      console.error('Error writing data to device:', error);
      throw error;
    }
  }

  async monitorCharacteristic(
    serviceUUID: string,
    characteristicUUID: string,
    onDataReceived: (data: any) => void,
    onError: (error: any) => void
  ) {
    try {
      if (this.device) {
        const service = await this.device.getService(serviceUUID);
        const characteristic = await service.getCharacteristic(characteristicUUID);
        this.characteristicMonitor = characteristic.monitor((error, characteristic) => {
          if (error) {
            onError(error);
          } else {
            onDataReceived(characteristic.value);
          }
        });
      } else {
        throw new Error('No connected device');
      }
    } catch (error) {
      console.error('Error monitoring characteristic:', error);
      onError(error);
    }
  }

  async stopMonitoringCharacteristic() {
    try {
      if (this.characteristicMonitor) {
        this.characteristicMonitor.remove();
        this.characteristicMonitor = null;
      }
    } catch (error) {
      console.error('Error stopping characteristic monitor:', error);
    }
  }
}

export const BLEService = new BLEServiceInstance();
