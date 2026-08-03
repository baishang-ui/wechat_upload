// logs.ts
// const util = require('../../utils/util.js')
import { formatTime } from '../../utils/util'
import { loadUiThemePageData } from '../../services/ui-preferences-service'

interface NavigationHeightChangeEvent {
  detail: { height: number }
}

Component({
  data: {
    navigationBarHeight: 99,
    logs: [],
    ...loadUiThemePageData(),
  },
  methods: {
    onNavigationHeightChange(event: NavigationHeightChangeEvent) {
      this.setData({ navigationBarHeight: event.detail.height })
    },
  },
  lifetimes: {
    attached() {
      this.setData({
        ...loadUiThemePageData(),
        logs: (wx.getStorageSync('logs') || []).map((log: string) => {
          return {
            date: formatTime(new Date(log)),
            timeStamp: log
          }
        }),
      })
    }
  },
})
