// logs.ts
// const util = require('../../utils/util.js')
import { formatTime } from '../../utils/util'

interface NavigationHeightChangeEvent {
  detail: { height: number }
}

Component({
  data: {
    navigationBarHeight: 91,
    logs: [],
  },
  methods: {
    onNavigationHeightChange(event: NavigationHeightChangeEvent) {
      this.setData({ navigationBarHeight: event.detail.height })
    },
  },
  lifetimes: {
    attached() {
      this.setData({
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
