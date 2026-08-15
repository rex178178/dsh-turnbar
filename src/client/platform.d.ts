// client bundle 的平台模块只有运行时实现（由 __ModuleLoader__ 的冻结表提供），
// tsc 层面用宽松声明满足类型检查；边界处一律运行时守卫。
declare module 'react' {
  const React: any
  export default React
  export const useMemo: any
  export const useRef: any
  export const useState: any
  export const useEffect: any
}
