Component({
  options: {
    virtualHost: true,
  },
  properties: {
    size: {
      type: String,
      value: 'md',
    },
    color: {
      type: String,
      value: 'accent',
    },
    label: {
      type: String,
      value: '加载中',
    },
    showLabel: {
      type: Boolean,
      value: false,
    },
    spinning: {
      type: Boolean,
      value: true,
    },
    rotation: {
      type: Number,
      value: 0,
    },
  },
})
