import { describe, expect, it } from 'vitest'
import { pickTurnAnchor, pickGroupAnchor, groupTurnRows, type FlowEntry, type GroupRow } from '../src/client/locate'

const e = (key: string, kind: string): FlowEntry => ({ key, kind })

// 0.1.5 真机取证实样：行首槽位号与轮号无关（故意错位），轮号在类型段尾随数字里。
// turn-tail 的尾随数字语义未经证实（同样故意错位），只能靠 data-turn-tail 属性。
const r = (key: string, kind: string, tailTurn: number | null = null): GroupRow => ({ key, kind, tailTurn })

describe('pickTurnAnchor（权威索引锚定，v0.2.3）', () => {
  it('常规轮：首个 user 行即触发消息', () => {
    const entries = [e('u1', 'user'), e('a1', 'assistant'), e('t1', 'turn-tail')]
    expect(pickTurnAnchor(entries)).toBe(0)
  })

  it('user 行前可有 context 回显（goal/agent-instructions），仍锚 user', () => {
    const entries = [e('c1', 'context'), e('c2', 'context'), e('u1', 'user'), e('a1', 'assistant')]
    expect(pickTurnAnchor(entries)).toBe(2)
  })

  it('goal 轮（无 user 行）：锚该轮第一行（context 回显）', () => {
    const entries = [e('c1', 'context'), e('a1', 'assistant'), e('tc', 'tool-call'), e('t1', 'turn-tail')]
    expect(pickTurnAnchor(entries)).toBe(0)
  })

  it('纯工具轮：锚首个内容行', () => {
    const entries = [e('a1', 'assistant'), e('tc', 'tool-call'), e('t1', 'turn-tail')]
    expect(pickTurnAnchor(entries)).toBe(0)
  })

  it('内容行出现后的 user 行是 steering/后续输入，不抢锚（防错位高亮）', () => {
    const entries = [e('c1', 'context'), e('a1', 'assistant'), e('s1', 'user'), e('a2', 'assistant')]
    expect(pickTurnAnchor(entries)).toBe(0)
  })

  it('空表返回 -1', () => {
    expect(pickTurnAnchor([])).toBe(-1)
  })

  it('只有 user 行的运行中轮：锚 user', () => {
    const entries = [e('u1', 'user')]
    expect(pickTurnAnchor(entries)).toBe(0)
  })
})

describe('groupTurnRows（0.1.5 DOM 分组定位）', () => {
  it('常规轮：user/工具行各归本位，行首槽位号错位不影响（解析只认类型段尾数字）', () => {
    const groups = groupTurnRows([
      r('13:input-messageu1', 'user'),            // 槽位号 13 ≠ 轮 1（真机实样：user 前缀 13 横跨轮 13/14/15）
      r('41:turn-process1', 'turn-process'),
      r('42:assistant-step1:1', 'assistant-step'),
      r('43:tool-call call_00abc', 'tool-call'),
      r('99:turn-tail77', 'turn-tail', 1),        // 尾随 77 非轮号，属性=1 才作数
    ])
    expect([...groups.keys()]).toEqual([1])
    expect(groups.get(1)!.map(x => x.key)).toEqual([
      '13:input-messageu1', '41:turn-process1', '42:assistant-step1:1', '43:tool-call call_00abc', '99:turn-tail77',
    ])
    expect(pickTurnAnchor(groups.get(1)!)).toBe(0) // 锚 user 行
  })

  it('user 前缀漂移实证：前缀 13 的 user 行分属轮 13/14/15，各回各组', () => {
    const groups = groupTurnRows([
      r('13:input-messagea', 'user'), r('50:turn-process13', 'turn-process'), r('28:turn-tail13', 'turn-tail', 13),
      r('13:input-messageb', 'user'), r('51:turn-process14', 'turn-process'), r('29:turn-tail14', 'turn-tail', 14),
      r('13:input-messagec', 'user'), r('52:turn-process15', 'turn-process'), r('30:turn-tail15', 'turn-tail', 15),
    ])
    expect(groups.get(13)![0]?.key).toBe('13:input-messagea')
    expect(groups.get(14)![0]?.key).toBe('13:input-messageb')
    expect(groups.get(15)![0]?.key).toBe('13:input-messagec')
  })

  it('goal 轮：context 回显与 user 同规向后归属，组内第一行即锚（非 user）', () => {
    const groups = groupTurnRows([
      r('28:turn-tail2', 'turn-tail', 2),
      r('13:input-messagegoal3', 'context'),
      r('50:turn-process3', 'turn-process'),
      r('51:assistant-step3:1', 'assistant-step'),
      r('52:turn-tail3', 'turn-tail', 3),
    ])
    const g3 = groups.get(3)!
    expect(g3.map(x => x.kind)).toEqual(['context', 'turn-process', 'assistant-step', 'turn-tail'])
    expect(pickTurnAnchor(g3)).toBe(0) // 锚 context 回显（goal 轮无用户气泡）
  })

  it('aborted 缺轮尾（轮 10 无 tail）不溢组：#11 的行仍全在轮 11', () => {
    const groups = groupTurnRows([
      r('13:input-messageu10', 'user'),
      r('60:turn-process10', 'turn-process'),
      r('61:assistant-step10:1', 'assistant-step'),
      // 轮 10 aborted：无轮尾
      r('13:input-messageu11', 'user'),
      r('62:turn-process11', 'turn-process'),
      r('63:assistant-step11:1', 'assistant-step'),
      r('64:turn-tail11', 'turn-tail', 11),
    ])
    expect(groups.get(10)!.map(x => x.kind)).toEqual(['user', 'turn-process', 'assistant-step'])
    expect(groups.get(11)!.map(x => x.kind)).toEqual(['user', 'turn-process', 'assistant-step', 'turn-tail'])
    expect(pickTurnAnchor(groups.get(11)!)).toBe(0) // 不再溢进轮 10
  })

  it('turn-tail 属性缺失的壳行向前归属本轮（aborted 壳仍留在自己轮里）', () => {
    const groups = groupTurnRows([
      r('13:input-messageu9', 'user'),
      r('70:turn-process9', 'turn-process'),
      r('71:turn-tail99', 'turn-tail', null), // 无 closing 的壳：无属性
      r('13:input-messageu10', 'user'),
      r('72:turn-process10', 'turn-process'),
    ])
    expect(groups.get(9)!.map(x => x.kind)).toEqual(['user', 'turn-process', 'turn-tail'])
    expect(groups.get(10)!.map(x => x.kind)).toEqual(['user', 'turn-process'])
  })

  it('真机 #11 全同构：壳向前归属跟随带轮号的行（不跟漏入 user 混进下轮组）', () => {
    const groups = groupTurnRows([
      r('9:turn-tail9', 'turn-tail', 9),
      r('13:input-message32d297aa', 'user'),   // user10（轮 10 掏空，漏入轮 11）
      r('9:turn-tail10', 'turn-tail', null),   // 轮 10 的 aborted 壳（无属性）
      r('13:input-message48ecc2ad', 'user'),   // user11（触发消息）
      r('12:turn-process11', 'turn-process'),
      r('9:turn-tail11', 'turn-tail', 11),
    ])
    // 壳归 tail9 的组 9（prev 只跟随携带轮号的行），轮 11 组保持纯净
    expect(groups.get(9)!.map(x => x.kind)).toEqual(['turn-tail', 'turn-tail'])
    const g11 = groups.get(11)!
    expect(g11.map(x => x.kind)).toEqual(['user', 'user', 'turn-process', 'turn-tail'])
    expect(pickGroupAnchor(g11)).toBe(1) // user11（"我换Pro模型推进吧"）
  })

  it('轮中 steering user（在轮尾之前）归本组且不抢锚', () => {
    const groups = groupTurnRows([
      r('13:input-messageu2', 'user'),
      r('80:turn-process2', 'turn-process'),
      r('81:assistant-step2:1', 'assistant-step'),
      r('13:input-messagesteer', 'user'), // 内容行之后、轮尾之前的后续输入
      r('82:turn-tail2', 'turn-tail', 2),
    ])
    const g2 = groups.get(2)!
    expect(g2.map(x => x.kind)).toEqual(['user', 'turn-process', 'assistant-step', 'user', 'turn-tail'])
    expect(pickTurnAnchor(g2)).toBe(0) // 触发消息仍是第一个 user
  })

  it('流顶注入 context 行（agent-instructions 等）向后归属轮 1', () => {
    const groups = groupTurnRows([
      r('1:contextinject-a', 'context'),
      r('2:contextinject-b', 'context'),
      r('13:input-messageu1', 'user'),
      r('90:turn-process1', 'turn-process'),
      r('91:turn-tail1', 'turn-tail', 1),
    ])
    expect(groups.get(1)!.map(x => x.kind)).toEqual(['context', 'context', 'user', 'turn-process', 'turn-tail'])
  })

  it('解析全失败（无任何可解析锚）→ 空表，调用方回落区间法', () => {
    const groups = groupTurnRows([
      r('13:input-messageu1', 'user'),
      r('55:assistant-legacy', 'assistant'),
      r('', 'tool-call'),
    ])
    expect(groups.size).toBe(0)
  })

  it('尾部无锚的孤儿 user 行弃置不入组（无下轮可归属）', () => {
    const groups = groupTurnRows([
      r('28:turn-tail1', 'turn-tail', 1),
      r('13:input-messageorphan', 'user'), // 其后无可解析行
    ])
    expect(groups.size).toBe(1)
    expect(groups.get(1)!.map(x => x.kind)).toEqual(['turn-tail'])
  })
})

describe('pickGroupAnchor（DOM 分组锚选择）', () => {
  it('被掏空上一轮的孤儿 user 漏入本组时：取锚行前最后一个 user（真机 #11 同构）', () => {
    // 真机实况：轮 10 aborted 连 process 都不渲染，user10 漏进轮 11 的组；
    // 轮 10/11 首句同为「怎么每次都这么久啊…」开头，取首个 user 必错锚。
    const g11 = [
      e('13:input-message32d297aa', 'user'),        // user10（漏入）
      e('13:input-message48ecc2ad', 'user'),        // user11（触发消息）
      e('62:turn-process11', 'turn-process'),
      e('63:assistant-step11:1', 'assistant-step'),
      e('64:turn-tail11', 'turn-tail'),
    ]
    expect(pickGroupAnchor(g11)).toBe(1)
  })

  it('锚行未出现（局部提交窗口，只有漏入行落组）→ -1 保持未定位', () => {
    const partial = [e('13:input-message32d297aa', 'user'), e('13:input-message48ecc2ad', 'user')]
    expect(pickGroupAnchor(partial)).toBe(-1)
  })

  it('无属性轮尾壳卡在两个 user 之间：不收网（跳过），lastUser 穿过它', () => {
    // 真机 #11 二次实证的组成：aborted 壳夹在漏入 user 与触发 user 中间
    const g = [
      e('13:input-message32d297aa', 'user'),
      e('9:turn-tail10', 'turn-tail'),            // 无属性壳
      e('13:input-message48ecc2ad', 'user'),
      e('12:turn-process11', 'turn-process'),
    ]
    expect(pickGroupAnchor(g)).toBe(2) // user11（壳占下标 1，lastUser 穿过它）
  })

  it('常规轮：触发 user 紧贴 process，锚 user', () => {
    const g = [e('13:input-messageu', 'user'), e('62:turn-process11', 'turn-process'), e('64:turn-tail11', 'turn-tail')]
    expect(pickGroupAnchor(g)).toBe(0)
  })

  it('轮中 steering user 不抢锚（扫描止于首个锚行）', () => {
    const g = [
      e('13:input-messageu2', 'user'),
      e('80:turn-process2', 'turn-process'),
      e('81:assistant-step2:1', 'assistant-step'),
      e('13:input-messagesteer', 'user'),
      e('82:turn-tail2', 'turn-tail'),
    ]
    expect(pickGroupAnchor(g)).toBe(0)
  })

  it('goal 轮（无 user 行）：锚组内第一行（process 前的 command 回显或首个 context）', () => {
    // 真机同构：/goal 回显 command-input/command 在 process 前（向前归属落上轮组），
    // 本组以 process 或「上下文注入」context 打头
    const gProcFirst = [e('12:turn-process3', 'turn-process'), e('13:input-messagectx', 'context'), e('14:assistant-step3:1', 'assistant-step')]
    expect(pickGroupAnchor(gProcFirst)).toBe(0)
    const gCtxFirst = [e('13:input-messagectx', 'context'), e('14:assistant-step3:1', 'assistant-step'), e('9:turn-tail3', 'turn-tail')]
    expect(pickGroupAnchor(gCtxFirst)).toBe(0)
  })

  it('纯工具轮：锚首个内容行', () => {
    const g = [e('14:assistant-step9:1', 'assistant-step'), e('9:tool-callcall_x', 'tool-call'), e('9:turn-tail9', 'turn-tail')]
    expect(pickGroupAnchor(g)).toBe(0)
  })

  it('空表返回 -1', () => {
    expect(pickGroupAnchor([])).toBe(-1)
  })
})
