// 国务院公布的放假日期，包含调休后连续放假的日期。
const holidays: Partial<Record<number, ReadonlyArray<readonly [string, string]>>> = {
  // https://www.gov.cn/gongbao/2025/issue_12406/material/gwygb202532.pdf
  2026: [
    ['01-01', '01-03'],
    ['02-15', '02-23'],
    ['04-04', '04-06'],
    ['05-01', '05-05'],
    ['06-19', '06-21'],
    ['09-25', '09-27'],
    ['10-01', '10-07'],
  ],
  // https://www.gov.cn/zhengce/content/202611/content_7085101.htm
  2027: [
    ['01-01', '01-03'],
    ['02-05', '02-13'],
    ['04-03', '04-05'],
    ['05-01', '05-05'],
    ['06-09', '06-09'],
    ['09-15', '09-15'],
    ['10-01', '10-07'],
  ],
}

const beijingOffset = 8 * 60 * 60 * 1000

/** 按 DeepSeek 公布的北京时间判断峰谷时段。 */
export const getApiPricingPeriod = (now: number): 'peak' | 'offPeak' | 'unconfirmed' => {
  const beijing = new Date(now + beijingOffset)
  const weekday = beijing.getUTCDay()
  const hour = beijing.getUTCHours()
  const inPeakHours = (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18)
  if (weekday === 0 || weekday === 6 || !inPeakHours) {
    return 'offPeak'
  }

  const yearHolidays = holidays[beijing.getUTCFullYear()]
  if (!yearHolidays) {
    return 'unconfirmed'
  }
  const date = beijing.toISOString().slice(5, 10)
  return yearHolidays.some(([start, end]) => start <= date && date <= end) ? 'offPeak' : 'peak'
}
