/// <reference path="./types/index.d.ts" />

interface IAppOption {
  globalData: {
    userInfo?: WechatMiniprogram.UserInfo,
  }
  userInfoReadyCallback?: WechatMiniprogram.GetUserInfoSuccessCallback,
}

declare namespace WechatMiniprogram {
  interface WindowInfo {
    windowWidth: number
    statusBarHeight: number
    safeArea?: SafeArea
  }

  interface DeviceInfo {
    platform: string
  }

  interface Wx {
    getWindowInfo(): WindowInfo
    getDeviceInfo(): DeviceInfo
  }
}
