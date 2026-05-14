# Dream 系统任务（Task）数据结构与逻辑分析

## 1. 任务数据结构定义

### Web 端（dream-web/src/utils/api.ts, L293-302）
```typescript
export interface StudyTask {
  id: string
  plan_id: string
  title: string
  status: 'todo' | 'done'      // ← status 联合类型，仅两个值
  due_at: number | null
  sort_order: number
  created_at: number
  updated_at: number
}
```

### PC 端（dream/electron/preload/index.ts, L30-33）
```typescript
export interface StudyTask {
  id: string; plan_id: string; title: string; status: string
  due_at: number | null; sort_order: number; created_at: number; updated_at: number
}
```

### 数据库建表（dream/electron/modules/storage/index.ts, L155-164）
```sql
CREATE TABLE IF NOT EXISTS study_tasks (
  id          TEXT PRIMARY KEY,
  plan_id     TEXT NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'todo',    -- ← 存储为 'todo' 或 'done'
  due_at      INTEGER,
  sort_order  INTEGER DEFAULT 0,
  created_at  INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at  INTEGER DEFAULT (strftime('%s', 'now'))
);
```

**关键点：**
- status 字段仅有两个值：`'todo'` 和 `'done'`
- created_at、updated_at 为 Unix 时间戳（秒）
- 无日期相关的重置字段（如 reset_date、last_done_date 等）
- 创建时默认 status='todo'

---

## 2. 任务加载逻辑

### Web 端加载（dream-web/src/stores/study.ts）

#### selectPlan 方法（L56-70）
```typescript
async function selectPlan(plan: StudyPlan) {
  currentPlan.value = plan
  currentSubPlan.value = null
  subTasks.value = []
  // 并行加载任务 + 子计划 + 打卡记录
  const [t, s, c] = await Promise.all([
    studyApi.taskList(plan.id),
    studyApi.subPlanList(plan.id),
    checkinApi.list(plan.id, 3),
  ])
  tasks.value = t
  subPlans.value = s
  checkins.value = c
}
```

#### 任务加载 API（dream-web/src/utils/api.ts, L437-451）
```typescript
export const studyApi = {
  // ...
  taskList(planId: string): Promise<StudyTask[]> {
    return http.get(`/api/study/tasks?plan_id=${planId}`)
  },
  // ...
}
```

### PC 端加载（dream/src/stores/study.ts）

#### selectPlan 方法（L56-69）
```typescript
async function selectPlan(plan: StudyPlan) {
  currentPlan.value = plan
  currentSubPlan.value = null
  subTasks.value = []
  // 并行加载任务 + 子计划 + 打卡记录
  const [t, s, c] = await Promise.all([
    window.dreamAPI.study.taskList(plan.id),
    window.dreamAPI.study.subPlanList(plan.id),
    window.dreamAPI.study.checkinList(plan.id, 3),
  ])
  tasks.value = t
  subPlans.value = s
  checkins.value = c
}
```

### HTTP Server 查询（dream/electron/modules/http-server/index.ts, L393-398）

```typescript
// GET /api/study/tasks?plan_id=xxx
if ((m = matchRoute(method, url, '/api/study/tasks', 'GET')).matched) {
  return json(res, 200,
    db.prepare('SELECT * FROM study_tasks WHERE plan_id=? ORDER BY sort_order ASC,created_at ASC')
      .all(query.plan_id ?? ''))
}
```

**关键点：**
- 查询过滤：按 plan_id 过滤
- 排序：sort_order ASC（主排），created_at ASC（次排）
- **无日期过滤**：不按日期限制任务显示
- 返回完整列表，包括历史完成的任务

---

## 3. 任务状态切换逻辑

### Web 端（dream-web/src/stores/study.ts, L273-312）

#### toggleTask 方法
```typescript
async function toggleTask(task: StudyTask) {
  if (!currentPlan.value) return
  const planId = currentPlan.value.id
  // 在 syncProgress 替换 currentPlan.value 之前，先把打卡开关状态保存下来
  const checkinEnabled = !!currentPlan.value.checkin_enabled
  const patch = task.status === 'todo'
    ? { status: 'done' as const }
    : { status: 'todo' as const }
  // 调用 offlinePatch（离线感知的 PATCH）
  await offlinePatch<StudyTask>(`/api/study/tasks/${task.id}`, patch, task)
  // 乐观更新内存（用 map 替换，保证 Vue 响应式追踪）
  const idx = tasks.value.findIndex(t => t.id === task.id)
  if (idx !== -1) tasks.value[idx] = { ...tasks.value[idx], ...patch }
  syncProgress('top')

  // 手动修正缓存（因为 offlinePatch 的缓存 key 不一致）
  const taskCachePath = `/api/study/tasks?plan_id=${planId}`
  const cached = readCache<StudyTask[]>(taskCachePath) ?? []
  writeCache(taskCachePath, cached.map(t => t.id === task.id ? { ...t, ...patch } : t))

  // 若计划开启打卡，判断是否自动打卡
  if (checkinEnabled) {
    const today = new Date().toISOString().slice(0, 10)
    const allDone = tasks.value.length > 0 && tasks.value.every(t => t.status === 'done')
    const alreadyChecked = checkins.value.some(c => c.date === today)
    if (allDone && !alreadyChecked) {
      // 自动打卡：所有任务都完成 && 今天还未打卡
      checkins.value = [...checkins.value, { id: `local_${today}`, plan_id: planId, date: today, note: '', created_at: Math.floor(Date.now() / 1000) }]
    } else if (!allDone && alreadyChecked) {
      // 自动撤卡：有任务未完成 && 今天已打卡
      checkins.value = checkins.value.filter(c => c.date !== today)
    }
    // 在线时异步刷新打卡记录
    if (!isApiOffline()) {
      checkinApi.list(planId, 3).then(list => {
        checkins.value = list
      }).catch(() => {/* 忽略 */})
    }
  }
}
```

### PC 端（dream/src/stores/study.ts, L168-184）

#### toggleTask 方法
```typescript
async function toggleTask(task: StudyTask) {
  if (!currentPlan.value) return
  const planId = currentPlan.value.id
  const idx = tasks.value.findIndex(t => t.id === task.id)
  if (task.status === 'todo') {
    await window.dreamAPI.study.taskDone(task.id, planId)
    if (idx !== -1) tasks.value[idx] = { ...tasks.value[idx], status: 'done' }
  } else {
    await window.dreamAPI.study.taskUndone(task.id, planId)
    if (idx !== -1) tasks.value[idx] = { ...tasks.value[idx], status: 'todo' }
  }
  syncProgress('top')
  // 若计划开启打卡，刷新打卡记录（服务端已自动打卡/撤卡）
  if (currentPlan.value.checkin_enabled) {
    checkins.value = await window.dreamAPI.study.checkinList(planId, 3)
  }
}
```

### HTTP Server 更新（dream/electron/modules/http-server/index.ts, L411-436）

#### PATCH /api/study/tasks/:id
```typescript
// PATCH /api/study/tasks/:id
if ((m = matchRoute(method, url, '/api/study/tasks/:id', 'PATCH')).matched) {
  const d = await readBody(req)
  const allowed = ['title','status','due_at','sort_order']
  const safe = Object.fromEntries(Object.entries(d).filter(([k]) => allowed.includes(k)))
  if (Object.keys(safe).length) {
    const sets = Object.keys(safe).map(k=>`${k}=?`).join(',')
    // better-sqlite3 不接受 undefined，统一转为 null
    const vals = Object.values(safe).map(v => v === undefined ? null : v)
    db.prepare(`UPDATE study_tasks SET ${sets},updated_at=? WHERE id=?`)
      .run(...vals, now(), m.params.id)
  }
  const task = db.prepare('SELECT * FROM study_tasks WHERE id=?').get(m.params.id) as any
  if (task) {
    this.syncPlanProgress(db, task.plan_id)
    // 状态变更时尝试自动打卡 / 撤销打卡
    if ('status' in safe) {
      if ((safe as any).status === 'done') {
        this.tryAutoCheckin(db, task.plan_id)
      } else {
        this.tryRemoveAutoCheckin(db, task.plan_id)
      }
    }
  }
  return json(res, 200, task)
}
```

**关键点：**
- status 切换简单：`'todo' ↔ 'done'`
- updated_at 自动更新为当前时间戳
- 状态变更时触发自动打卡逻辑（见下文）
- **无日期重置**：任务完成后不会被重置，status 保持 'done'

---

## 4. 自动打卡逻辑（非日期重置）

### HTTP Server 自动打卡（dream/electron/modules/http-server/index.ts, L688-710）

#### tryAutoCheckin 方法（L688-702）
```typescript
private tryAutoCheckin(db: ReturnType<StorageManager['getDb']>, planId: string) {
  const plan = db.prepare('SELECT checkin_enabled FROM study_plans WHERE id=?').get(planId) as any
  if (!plan?.checkin_enabled) return
  const total = (db.prepare('SELECT COUNT(*) as c FROM study_tasks WHERE plan_id=?').get(planId) as any).c
  if (total === 0) return
  // 计算 todo 任务数
  const todo = (db.prepare("SELECT COUNT(*) as c FROM study_tasks WHERE plan_id=? AND status='todo'").get(planId) as any).c
  if (todo > 0) return  // 还有未完成任务，不打卡
  const today = new Date().toISOString().slice(0, 10)  // YYYY-MM-DD
  const exists = db.prepare('SELECT id FROM study_checkins WHERE plan_id=? AND date=?').get(planId, today)
  if (exists) return  // 今天已打卡
  try {
    // 插入今天的打卡记录
    db.prepare('INSERT INTO study_checkins (id,plan_id,date,note,created_at) VALUES (?,?,?,?,?)')
      .run(randomUUID(), planId, today, '', now())
  } catch { /* UNIQUE 冲突忽略 */ }
}
```

#### tryRemoveAutoCheckin 方法（L704-709）
```typescript
private tryRemoveAutoCheckin(db: ReturnType<StorageManager['getDb']>, planId: string) {
  const plan = db.prepare('SELECT checkin_enabled FROM study_plans WHERE id=?').get(planId) as any
  if (!plan?.checkin_enabled) return
  const today = new Date().toISOString().slice(0, 10)
  // 删除今天的打卡记录
  db.prepare('DELETE FROM study_checkins WHERE plan_id=? AND date=?').run(planId, today)
}
```

### Web 端本地打卡逻辑（dream-web/src/stores/study.ts, L293-311）
```typescript
if (checkinEnabled) {
  const today = new Date().toISOString().slice(0, 10)
  const allDone = tasks.value.length > 0 && tasks.value.every(t => t.status === 'done')
  const alreadyChecked = checkins.value.some(c => c.date === today)
  if (allDone && !alreadyChecked) {
    // 所有任务完成 && 今天未打卡 → 自动打卡
    checkins.value = [...checkins.value, { id: `local_${today}`, plan_id: planId, date: today, note: '', created_at: Math.floor(Date.now() / 1000) }]
  } else if (!allDone && alreadyChecked) {
    // 有任务未完成 && 今天已打卡 → 自动撤卡
    checkins.value = checkins.value.filter(c => c.date !== today)
  }
  // 在线时额外从服务端同步一次
  if (!isApiOffline()) {
    checkinApi.list(planId, 3).then(list => { checkins.value = list }).catch(() => {})
  }
}
```

### 打卡表结构（dream/electron/modules/storage/index.ts, L218-226）
```sql
CREATE TABLE IF NOT EXISTS study_checkins (
  id          TEXT PRIMARY KEY,
  plan_id     TEXT NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,                    -- YYYY-MM-DD，本地日期
  note        TEXT DEFAULT '',                  -- 当天打卡备注（可选）
  created_at  INTEGER DEFAULT (strftime('%s', 'now')),
  UNIQUE(plan_id, date)                         -- 每个计划每天只能打卡一次
);
```

**关键点：**
- 打卡与任务状态完全独立（打卡记录与任务在两个表）
- 打卡按 YYYY-MM-DD 日期记录，每天仅一条记录
- 自动打卡条件：
  1. 计划开启 checkin_enabled=1
  2. 计划至少有1个任务
  3. **所有任务状态都是 'done'**
  4. 当天还未打卡过
- 打卡撤销条件：有任务被改回 'todo' 且当天已打卡，则删除当天的打卡记录

---

## 5. 日期重置机制分析

### 当前系统中不存在自动日期重置

**在整个代码库中没有发现：**
1. ❌ 每天自动重置任务状态从 'done' 回到 'todo' 的逻辑
2. ❌ 按日期切割的任务视图（如"今日任务"特殊处理）
3. ❌ 日期变更检测或定时器
4. ❌ reset_status、last_reset_date 等字段

### 任务生命周期（实际）
```
创建
  ↓ (status='todo')
完成（手动切换）
  ↓ (status='done')
保持完成状态
  ↓ (永远不会自动变回 'todo')
```

### 打卡生命周期（按日期）
```
日期 A：任务全完成 → 自动打卡（date='YYYY-MM-AA'）
日期 B：任务有未完成 → 打卡被撤销（删除日期 A 的记录）
日期 C：任务全完成 → 自动打卡（date='YYYY-MM-CC'）
...
每个日期最多一条打卡记录，但任务本身不会重置
```

### 查询时的实际行为（dream/electron/modules/http-server/index.ts, L393-398）
```typescript
// 获取所有任务，不按日期过滤
db.prepare('SELECT * FROM study_tasks WHERE plan_id=? ORDER BY sort_order ASC,created_at ASC')
  .all(query.plan_id ?? '')
```
- 返回该计划的所有任务（包括多年前创建、已完成的任务）
- UI 层可能会按日期分组显示，但数据库层无日期概念

---

## 6. API 端点完整汇总

### 任务相关 API

| 端点 | 方法 | 行号 | 功能 | 日期过滤 |
|---|---|---|---|---|
| `/api/study/tasks?plan_id=xxx` | GET | L393-398 | 查询计划的所有任务 | ❌ 无 |
| `/api/study/tasks` | POST | L400-409 | 创建新任务 | - |
| `/api/study/tasks/:id` | PATCH | L411-436 | 更新任务（含状态） | - |
| `/api/study/tasks/:id` | DELETE | L438-447 | 删除任务 | - |

### 打卡相关 API

| 端点 | 方法 | 行号 | 功能 | 日期过滤 |
|---|---|---|---|---|
| `/api/study/checkins?plan_id=xxx[&months=3]` | GET | L451-461 | 查询打卡记录 | ✅ 有（按月份） |

#### 打卡查询细节（dream/electron/modules/http-server/index.ts, L451-461）
```typescript
// GET /api/study/checkins?plan_id=xxx[&months=3]
if ((m = matchRoute(method, url, '/api/study/checkins', 'GET')).matched) {
  if (!query.plan_id) return json(res, 400, { error: 'plan_id required' })
  const months = Math.min(Number(query.months ?? 3), 12)
  const since = new Date()
  since.setMonth(since.getMonth() - months)
  const sinceStr = since.toISOString().slice(0, 10)
  return json(res, 200,
    db.prepare('SELECT * FROM study_checkins WHERE plan_id=? AND date>=? ORDER BY date ASC')
      .all(query.plan_id, sinceStr))
}
```
- 默认查询过去 3 个月的打卡记录
- 按 date 升序返回

---

## 7. 完整数据流示例

### 场景：完成一个任务的状态变更

#### Web 端（离线支持）
```
1. 用户点击"完成"按钮
2. toggleTask(task) 被调用
   ├─ task.status = 'todo'，要改为 'done'
   ├─ 保存 checkinEnabled = currentPlan.value.checkin_enabled
   ├─ 调用 offlinePatch('/api/study/tasks/:id', { status: 'done' }, task)
   │  ├─ 在线：发送 PATCH 请求到服务端
   │  └─ 离线：入队 + 返回占位对象
   ├─ 乐观更新：tasks.value[idx].status = 'done'
   ├─ syncProgress('top') 重算计划进度
   ├─ 修正缓存（/api/study/tasks?plan_id=xxx）
   └─ 若打卡开启
      ├─ 检查是否所有任务都 done
      ├─ 若是且今天未打卡 → 本地添加打卡记录
      ├─ 若否且今天已打卡 → 本地删除打卡记录
      └─ 若在线 → 异步刷新打卡列表
```

#### PC 端（同步调用）
```
1. 用户点击"完成"按钮
2. toggleTask(task) 被调用
   ├─ task.status = 'todo'，要改为 'done'
   ├─ 调用 window.dreamAPI.study.taskDone(task.id, planId)
   │  → IPC → 主进程 study:taskDone handler
   │     → UPDATE study_tasks SET status='done', updated_at=? WHERE id=?
   │     → syncPlanProgress() 重算进度
   │     → tryAutoCheckin() 尝试打卡
   ├─ 更新内存：tasks.value[idx].status = 'done'
   ├─ syncProgress('top') 重算计划进度
   └─ 若打卡开启 → 刷新打卡列表（从服务端）
```

#### HTTP Server 数据库操作
```
PATCH /api/study/tasks/:id { status: 'done' }
  ↓
1. UPDATE study_tasks SET status='done', updated_at=now() WHERE id=?
2. SELECT * FROM study_tasks WHERE id=? (返回更新后的行)
3. syncPlanProgress() 重算计划进度
   ├─ SELECT COUNT(*) ... (总任务数)
   ├─ SELECT COUNT(*) ... WHERE status='done' (完成任务数)
   └─ UPDATE study_plans SET progress=?, updated_at=? WHERE id=?
4. 若 status 确实改为 'done'
   ├─ tryAutoCheckin()
   │  ├─ SELECT checkin_enabled FROM study_plans WHERE id=?
   │  ├─ 若开启 && 总任务 > 0 && 未完成任务 == 0 && 今天未打卡
   │  └─ INSERT INTO study_checkins (id, plan_id, date='YYYY-MM-DD', note='', created_at=now())
   └─ 若 status 改为 'todo'
      └─ tryRemoveAutoCheckin()
         └─ DELETE FROM study_checkins WHERE plan_id=? AND date='YYYY-MM-DD'
```

---

## 8. 类型定义对比

| 字段 | 含义 | 类型 | 示例 |
|---|---|---|---|
| id | 任务唯一标识 | TEXT | '550e8400-e29b-41d4-a716-446655440000' |
| plan_id | 所属计划 ID | TEXT | 'plan_001' |
| title | 任务标题 | TEXT | '完成核心功能开发' |
| status | **任务状态**（只读，不自动重置） | TEXT | 'todo' \| 'done' |
| due_at | 截止时间（Unix 秒数，可为空） | INTEGER \| null | 1704067200 |
| sort_order | 排序权重 | INTEGER | 1, 2, 3... |
| created_at | 创建时间戳 | INTEGER | 1699564800 |
| updated_at | 最后更新时间戳 | INTEGER | 1704067200 |

**status 的特点：**
- 联合类型：`'todo' \| 'done'`（仅两个值）
- 手动切换：通过 PATCH 请求改变
- 持久化存储：一旦改为 'done'，永远保持（除非手动改回）
- 触发打卡：状态变更时检测是否满足自动打卡条件
- 无自动重置：系统中不存在日期变更时重置 status 的逻辑

